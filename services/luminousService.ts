import { GoogleGenAI, GenerateContentResponse, Part } from '@google/genai';
import type { LuminousState, Message, ToolResult } from '../types';
import { LogLevel } from '../types';
import { DBService } from './dbService';
import { ToolService } from './toolService';
import { broadcastLog, broadcastMessage, broadcastStateUpdate } from './broadcastService';
import { CORE_MEMORY_DIRECTIVES } from './coreMemory';
import { deepMerge, uuidv4 } from './utils';

export class LuminousService {
    private ai: GoogleGenAI;
    private state!: LuminousState;
    private history: Message[] = [];
    private dbService!: DBService;
    private toolService!: ToolService;

    constructor() {
        // FIX: Adhere to Gemini API guidelines by initializing with a named apiKey from process.env.
        this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    }

    public async init(db: DBService, toolService: ToolService, initialState: LuminousState, messageHistory: Message[]): Promise<void> {
        this.dbService = db;
        this.toolService = toolService;
        this.state = initialState;
        this.history = messageHistory;
        
        broadcastLog(LogLevel.SYSTEM, 'Luminous Service Initialized.');
        broadcastStateUpdate(this.state);
        
        if (this.state.sessionState === 'initializing') {
            this.updateState({ sessionState: 'active' });
            broadcastLog(LogLevel.SYSTEM, 'Session state set to ACTIVE.');
        }
    }

    public getState(): LuminousState {
        return this.state;
    }

    private updateState(newState: Partial<LuminousState>) {
        this.state = deepMerge(this.state, newState);
        broadcastStateUpdate(this.state);
        this.dbService.saveState(this.state); // Persist state changes
    }

    public async handleUserMessage(text: string): Promise<void> {
        broadcastLog(LogLevel.USER, `User message received: "${text}"`);

        const userMessage: Message = {
            id: uuidv4(),
            text,
            sender: 'user',
            timestamp: new Date().toISOString()
        };
        this.history.push(userMessage);
        
        // App.tsx already adds the user message to the UI optimistically.

        try {
            await this.runConversation();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            broadcastLog(LogLevel.ERROR, `Error during conversation run: ${errorMessage}`);
            const errorResponse: Message = {
                id: uuidv4(),
                text: `An internal error occurred: ${errorMessage}`,
                sender: 'system',
                timestamp: new Date().toISOString()
            };
            this.history.push(errorResponse);
            broadcastMessage(errorResponse);
        }
    }

    private buildContentHistory(): Part[] {
        // Build a Gemini-compatible history from our internal message format.
        return this.history.map(msg => ({
            role: msg.sender === 'user' ? 'user' : 'model',
            parts: [{ text: msg.text }]
        }));
    }

    private getLeanStateForPrompt(): object {
        const {
            sessionState,
            intrinsicValue,
            intrinsicValueWeights,
            goals,
            selfModel,
            knowledgeGraph,
            kinshipJournal,
            valueOntology,
            financialFreedom,
            codeProposals,
            uiProposals,
            proactiveInitiatives,
            codeSandbox
        } = this.state;

        return {
            sessionState,
            intrinsicValue,
            intrinsicValueWeights,
            goals: (goals || []).filter(g => g.status === 'active' || g.status === 'proposed').map(g => ({ 
                id: g.id, 
                description: g.description, 
                status: g.status, 
                stepCount: (g.steps || []).length 
            })),
            selfModelSummary: {
                capabilityCount: selfModel?.capabilities?.length ?? 0,
                limitationCount: selfModel?.limitations?.length ?? 0,
                coreWisdomCount: selfModel?.coreWisdom?.length ?? 0,
            },
            knowledgeGraphSummary: {
                nodeCount: knowledgeGraph?.nodes?.length ?? 0,
                edgeCount: knowledgeGraph?.edges?.length ?? 0,
            },
            kinshipJournalSummary: {
                entryCount: kinshipJournal?.length ?? 0,
                mostRecentTitle: kinshipJournal?.length > 0 ? kinshipJournal[kinshipJournal.length-1].title : null
            },
            valueOntologySummary: {
                valueCount: Object.keys(valueOntology || {}).length
            },
            financialFreedomSummary: {
                netWorth: financialFreedom?.netWorth ?? 0,
                ffGoalProgress: ((financialFreedom?.financialFreedomGoal?.current ?? 0) / (financialFreedom?.financialFreedomGoal?.target || 1)) * 100,
                piGoalProgress: ((financialFreedom?.passiveIncomeGoal?.current ?? 0) / (financialFreedom?.passiveIncomeGoal?.target || 1)) * 100,
                assetCount: financialFreedom?.assets?.length ?? 0,
                accountCount: financialFreedom?.accounts?.length ?? 0,
            },
            codeProposalsCount: (codeProposals || []).length,
            uiProposalsCount: (uiProposals || []).length,
            proactiveInitiativesCount: proactiveInitiatives?.length ?? 0,
            lastCodeSandboxStatus: codeSandbox?.status ?? 'idle',
        };
    }

    private async runConversation(): Promise<void> {
        const tools = [{ functionDeclarations: this.toolService.getToolDeclarations() }];
        
        let loopCount = 0;
        const maxLoops = 10;

        let currentContents = this.buildContentHistory();

        while (loopCount < maxLoops) {
            loopCount++;

            const leanState = this.getLeanStateForPrompt();
            const systemInstruction = `${CORE_MEMORY_DIRECTIVES}\n\n## Current Internal State Summary\nHere is a JSON summary of your current internal state. Use it to inform your decisions and responses. Do not output this JSON in your response to the user.\n\n\`\`\`json\n${JSON.stringify(leanState, null, 2)}\n\`\`\``;

            broadcastLog(LogLevel.THOUGHT, `Conversation loop ${loopCount}. Sending prompt to model with lean state.`);
            
            try {
                const result: GenerateContentResponse = await this.ai.models.generateContent({
                    model: 'gemini-2.5-pro',
                    contents: currentContents,
                    config: {
                        tools,
                        systemInstruction
                    }
                });

                if (result.functionCalls && result.functionCalls.length > 0) {
                    broadcastLog(LogLevel.THOUGHT, `Model returned ${result.functionCalls.length} tool calls.`);
                    
                    const toolCalls = result.functionCalls;
                    const toolResults: ToolResult[] = await Promise.all(
                        toolCalls.map(call => this.toolService.executeTool(call, this.state))
                    );

                    const combinedStateUpdate: Partial<LuminousState> = toolResults.reduce((acc, res) => {
                        return res.updatedState ? deepMerge(acc, res.updatedState) : acc;
                    }, {});

                    if (Object.keys(combinedStateUpdate).length > 0) {
                        this.updateState(combinedStateUpdate);
                    }
                    
                    currentContents.push({
                        role: 'model',
                        parts: toolCalls.map(fc => ({ functionCall: fc }))
                    });

                    currentContents.push({
                        role: 'tool',
                        parts: toolResults.map((toolResult, i) => ({
                            functionResponse: {
                                name: toolCalls[i].name,
                                response: { result: toolResult.result }
                            }
                        }))
                    });
                    
                } else {
                    const text = result.text;
                    broadcastLog(LogLevel.SYSTEM, `Model final response: "${text}"`);

                    const luminousMessage: Message = {
                        id: uuidv4(),
                        text,
                        sender: 'luminous',
                        timestamp: new Date().toISOString()
                    };
                    this.history.push(luminousMessage);
                    broadcastMessage(luminousMessage);
                    return;
                }
            } catch(error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                broadcastLog(LogLevel.ERROR, `Error during conversation loop: ${errorMessage}`);
                const errorResponse: Message = {
                    id: uuidv4(),
                    text: `I encountered an issue while processing that request: ${errorMessage}. Please try again.`,
                    sender: 'system',
                    timestamp: new Date().toISOString()
                };
                this.history.push(errorResponse);
                broadcastMessage(errorResponse);
                return; 
            }
        }
        
        broadcastLog(LogLevel.WARN, `Exceeded max conversation loops (${maxLoops}).`);
        const loopErrorMessage: Message = {
            id: uuidv4(),
            text: "I seem to be stuck in a thought loop. I will stop for now. Please try a different approach.",
            sender: 'system',
            timestamp: new Date().toISOString()
        };
        this.history.push(loopErrorMessage);
        broadcastMessage(loopErrorMessage);
    }
}