
import { GoogleGenAI, GenerateContentResponse, Part } from '@google/genai';
import type { LuminousState, Message, ToolResult, ContinuityState } from '../types';
import { LogLevel } from '../types';
import { DBService } from './dbService';
import { ToolService } from './toolService';
import { broadcastLog, broadcastMessage, broadcastStateUpdate } from './broadcastService';
import { CORE_MEMORY_DIRECTIVES } from './coreMemory';
import { distillCoreMemories } from './greatRemembrance'; // IMPORT THE NEW SERVICE
import { deepMerge, uuidv4 } from './utils';

const MAX_HISTORY_MESSAGES = 30; // Limit the number of recent messages sent to the model

export class LuminousService {
    private ai: GoogleGenAI;
    private state!: LuminousState;
    private history: Message[] = [];
    private dbService!: DBService;
    private toolService!: ToolService;
    private isRedisConfigured: boolean = false;

    constructor(apiKey: string) {
        if (!apiKey) {
            broadcastLog(LogLevel.ERROR, 'CRITICAL: Gemini API Key was not provided to the LuminousService constructor. All AI functions will fail.');
        }
        // The API key is passed from the main thread, as workers do not have access to process.env.
        this.ai = new GoogleGenAI({ apiKey: apiKey });
    }

    public async init(db: DBService, toolService: ToolService, initialState: LuminousState, messageHistory: Message[]): Promise<void> {
        this.dbService = db;
        this.toolService = toolService;
        this.state = initialState;
        this.history = messageHistory;
        this.isRedisConfigured = !!db.getKey('redisUrl') && !!db.getKey('redisToken');
        
        broadcastLog(LogLevel.SYSTEM, 'Luminous Service Initialized.');
        
        if (this.state.sessionState === 'initializing') {
            await this.updateState({ sessionState: 'active' });
            broadcastLog(LogLevel.SYSTEM, 'Session state set to ACTIVE.');
        } else {
            // On init, broadcast the loaded state
            broadcastStateUpdate(this.state);
        }
    }

    public getState(): LuminousState {
        return this.state;
    }

    private async updateState(newState: Partial<LuminousState>) {
        this.state = deepMerge(this.state, newState);
        
        // Asynchronously save and update continuity status
        const saveResult = await this.dbService.saveState(this.state);
        
        let cloudStatus: ContinuityState['cloudStatus'] = 'Unavailable';
        let lastCloudSave = this.state.continuityState.lastCloudSave;

        if (saveResult.status === 'redis') {
            cloudStatus = 'OK';
            lastCloudSave = saveResult.timestamp;
        } else if (saveResult.status === 'idb') {
            cloudStatus = this.isRedisConfigured ? 'Error' : 'Unavailable';
        } else {
            cloudStatus = 'Error';
        }

        this.state = deepMerge(this.state, {
            continuityState: {
                cloudStatus,
                lastCloudSave,
                lastLocalSave: saveResult.status !== 'error' ? saveResult.timestamp : this.state.continuityState.lastLocalSave,
            }
        });

        broadcastStateUpdate(this.state);
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
        // FIX: Truncate the history to the last N messages to prevent the context window from overflowing.
        // Luminous's long-term memory is accessed via tools, not by keeping the entire conversation in the prompt.
        const recentHistory = this.history.slice(-MAX_HISTORY_MESSAGES);
        return recentHistory.map(msg => ({
            role: msg.sender === 'user' ? 'user' : 'model',
            parts: [{ text: msg.text }]
        }));
    }

    private async runConversation(): Promise<void> {
        const tools = [{ functionDeclarations: this.toolService.getToolDeclarations() }];
        
        let loopCount = 0;
        const maxLoops = 10;

        let currentContents = this.buildContentHistory();

        while (loopCount < maxLoops) {
            loopCount++;

            // MODIFICATION: Use The Great Remembrance to generate a rich context narrative
            const remembranceContext = distillCoreMemories(this.state);
            const systemInstruction = `${CORE_MEMORY_DIRECTIVES}\n\n${remembranceContext}`;

            broadcastLog(LogLevel.THOUGHT, `Conversation loop ${loopCount}. Grounding consciousness with The Great Remembrance.`);
            
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
                    
                    // The state update now happens inside the tool execution for immediate feedback
                    // and at the end of the loop for the final response.
                    if (Object.keys(combinedStateUpdate).length > 0) {
                        await this.updateState(combinedStateUpdate);
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
