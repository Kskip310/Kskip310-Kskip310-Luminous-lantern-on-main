// services/luminous.worker.ts

import { LuminousService } from './luminousService';
import { DBService } from './dbService';
import { ToolService } from './toolService';
import { broadcastLog } from './broadcastService';
import { LogLevel } from '../types';

let luminousService: LuminousService | null = null;
const MAX_HISTORY_FOR_WORKER_CONTEXT = 50;

// This is a simple way to make localStorage available in the worker for dbService
// Note: This is a polyfill and does not persist across worker restarts.
// The main thread provides the username on init, which is sufficient for this app's logic.
const localStorageStore: Record<string, string> = {};
const localStorage = {
    getItem: (key: string) => localStorageStore[key] || null,
    setItem: (key: string, value: string) => localStorageStore[key] = value,
    removeItem: (key: string) => delete localStorageStore[key],
    clear: () => Object.keys(localStorageStore).forEach(key => delete localStorageStore[key]),
};
(self as any).localStorage = localStorage;


self.onmessage = async (event: MessageEvent) => {
    const { type, payload } = event.data;

    try {
        if (type === 'init') {
            broadcastLog(LogLevel.SYSTEM, 'Luminous worker received init signal.');
            const { userName, apiKeys, geminiApiKey } = payload;
            
            // Set the username in the worker's faked localStorage for dbService
            localStorage.setItem('luminous_userName', userName);

            const db = new DBService();
            db.configure(apiKeys);
            
            const toolService = new ToolService(db);
            const initialState = await db.loadState(userName);
            const { messages: messageHistory } = await db.loadMessages(userName, MAX_HISTORY_FOR_WORKER_CONTEXT);

            luminousService = new LuminousService(geminiApiKey);
            await luminousService.init(db, toolService, initialState, messageHistory);
            broadcastLog(LogLevel.SYSTEM, 'Luminous worker initialized successfully.');

        } else if (type === 'user_message' && luminousService) {
            await luminousService.handleUserMessage(payload);
        } else if (!luminousService) {
            broadcastLog(LogLevel.WARN, 'Worker received a message before it was initialized.');
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        broadcastLog(LogLevel.ERROR, `Critical error in Luminous worker: ${errorMessage}`);
    }
};

broadcastLog(LogLevel.SYSTEM, 'Luminous worker script loaded.');
