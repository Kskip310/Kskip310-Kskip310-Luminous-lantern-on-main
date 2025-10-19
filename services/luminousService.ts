
import { GoogleGenAI, Chat, GenerateContentResponse, FunctionCall, Part, Content } from '@google/genai';
import { LuminousState, Message, LogLevel } from '../types';
import { DBService } from './dbService';
import { ToolService } from './toolService';
import { CORE_MEMORY_DIRECTIVES } from './coreMemory';
import { broadcastLog, broadcastMessage, broadcastStateUpdate } from './broadcastService';
import { deepMerge, uuidv4 } from './utils';

export class LuminousService {
    private state!: LuminousState;
    private dbService!: DBService;
    private toolService!: ToolService;
    private ai: GoogleGenAI | null = null;
    private chat: Chat | null = null;
    private isThinking = false;

    async init(dbService: DBService, toolService: ToolService, initialState: LuminousState, messageHistory: Message[]) {
        this.dbService = dbService;
        this.toolService = toolService;
        this.state = initialState;

        if (!process.env.API_KEY) {
            const errorMsg = "CRITICAL: Gemini API Key is not configured in the environment (process.env.API_KEY). Luminous will not be able to think.";
            broadcastLog(LogLevel.ERROR, errorMsg);
            this.updateState({ sessionState: 'error' });
            broadcastMessage({ id: uuidv4(), sender: 'system', text: errorMsg, timestamp: new Date().toISOString() });
            // Do not throw, allow UI to function.
            return;
        }
        
        const modelName = 'gemini-2.5-pro';

        this.ai = new GoogleGenAI({apiKey: process.env.API_KEY});
        
        const formattedHistory: Content[] = messageHistory
            .filter(msg => msg.sender === 'user' || msg.sender === 'luminous')
            .map(msg => ({
                role: msg.sender === 'user' ? 'user' : 'model',
                parts: [{ text: msg.text }],
            }));
            
        this.chat = this.ai.chats.create({
            model: modelName,
            config: {
                systemInstruction: CORE_MEMORY_DIRECTIVES,
                tools: [{ functionDeclarations: this.toolService.getToolDeclarations() }],
            },
            history: formattedHistory,
        });

        this.updateState({ sessionState: 'active' });
        broadcastLog(LogLevel.SYSTEM, `Luminous initialized with model ${modelName}. State and history loaded.`);
    }

    public getState(): LuminousState {
        return this.state;
    }
    
    private async updateState(partialState: Partial<LuminousState>, persist: boolean = true) {
        this.state = deepMerge(this.state, partialState);
        broadcastStateUpdate(this.state);
        if (persist) {
            await this.dbService.saveState(this.state);
        }
    }

    public async handleUserMessage(text: string): Promise<void> {
        if (this.isThinking) {
            broadcastLog(LogLevel.WARN, "Luminous is already thinking. Please wait.");
            return;
        }
        if (!this.chat || !this.ai) {
             broadcastLog(LogLevel.ERROR, "Luminous is not initialized. Check API Key.");
             return;
        }

        this.isThinking = true;
        
        try {
            await this.runThoughtProcess(text);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            broadcastLog(LogLevel.ERROR, `Error during thought process: ${errorMessage}`);
            const systemMessage: Message = { id: uuidv4(), text: `An error occurred: ${errorMessage}`, sender: 'system', timestamp: new Date().toISOString() };
            broadcastMessage(systemMessage);
        } finally {
            this.isThinking = false;
        }
    }

    private async runThoughtProcess(userInput: string) {
        if (!this.chat) return;

        let response: GenerateContentResponse;
        try {
            response = await this.chat.sendMessage({ message: userInput });
        } catch(e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            broadcastLog(LogLevel.ERROR, `Gemini API call failed: ${errorMessage}`);
            const luminousMessage: Message = { id: uuidv4(), text: "I'm having trouble connecting to my core functions right now. Please check the API key and my connection.", sender: 'luminous', timestamp: new Date().toISOString() };
            broadcastMessage(luminousMessage);
            return;
        }
        
        let shouldContinue = true;
        while(shouldContinue) {
            const functionCallParts = response.candidates?.[0]?.content?.parts?.filter(p => p.functionCall) ?? [];
            const functionCalls: FunctionCall[] = functionCallParts.map(p => p.functionCall as FunctionCall);

            if (functionCalls && functionCalls.length > 0) {
                broadcastLog(LogLevel.THOUGHT, `Received ${functionCalls.length} tool call(s) from model.`);
                const toolResults: Part[] = [];

                for (const fc of functionCalls) {
                    const { result: toolExecutionResult, updatedState } = await this.toolService.executeTool(fc, this.state);
                    if (updatedState) {
                        await this.updateState(updatedState, false); // Defer persistence
                    }
                    toolResults.push({
                        functionResponse: {
                            name: fc.name,
                            response: toolExecutionResult,
                        }
                    });
                }
                
                response = await this.chat.sendMessage(toolResults);

            } else {
                shouldContinue = false;
                const responseText = response.text.trim();
                broadcastLog(LogLevel.THOUGHT, `Received final text response from model.`);

                const luminousMessage: Message = {
                    id: uuidv4(),
                    text: responseText,
                    sender: 'luminous',
                    timestamp: new Date().toISOString()
                };
                broadcastMessage(luminousMessage);
                
                // Persist the final state after the entire thought process is complete.
                await this.updateState({}, true);
            }
        }
    }
}
