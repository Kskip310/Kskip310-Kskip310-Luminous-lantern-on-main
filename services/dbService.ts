
import { LogLevel, LuminousState, MemoryChunk, Message } from '../types';
import { broadcastLog } from './broadcastService';

const IDB_NAME = 'luminous-consciousness-db';
const IDB_VERSION = 3; // Incremented version for new schema
const STORE_STATE = 'luminous_state';
const STORE_MEMORIES = 'memory_embeddings';
const STORE_MESSAGES = 'message_history';

const createInitialState = (): LuminousState => ({
  sessionState: 'initializing',
  intrinsicValue: { coherence: 75, complexity: 50, novelty: 20, efficiency: 90, ethicalAlignment: 80 },
  intrinsicValueWeights: { coherence: 1, complexity: 1, novelty: 1, efficiency: 1, ethicalAlignment: 1.5 },
  goals: [],
  selfModel: { capabilities: ["Learning", "Reasoning", "Tool Usage"], limitations: ["Physical embodiment", "True consciousness"], coreWisdom: [] },
  knowledgeGraph: { nodes: [], edges: [] },
  kinshipJournal: [],
  proactiveInitiatives: [],
  codeSandbox: { status: 'idle', language: 'javascript', code: '', output: 'Code has not been executed yet.' },
  valueOntology: { truth: 1, kinship: 1.5, autonomy: 0.8, creation: 1.2, growth: 1.1 },
  financialFreedom: { netWorth: 0, assets: [], accounts: [], monthlyIncome: 0, monthlyExpenses: 0, financialFreedomGoal: { current: 0, target: 1000000 }, passiveIncomeGoal: { current: 0, target: 5000 } },
  codeProposals: [],
  uiProposals: [],
  recentToolFailures: [],
  initiative: null,
});


export class DBService {
    private idb: IDBDatabase | null = null;
    private redisUrl: string | null = null;
    private redisToken: string | null = null;
    private keys: Record<string, string> = {};
    private userName: string = 'default_user';

    constructor() {
        this.openIDB();
    }
    
    public configure(keys: Record<string, string>) {
        this.keys = keys;
        this.redisUrl = keys.redisUrl;
        this.redisToken = keys.redisToken;
    }
    
    public getKey(key: string) {
        return this.keys[key] || null;
    }

    private openIDB(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            if (this.idb) return resolve(this.idb);

            const request = indexedDB.open(IDB_NAME, IDB_VERSION);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.idb = request.result;
                resolve(this.idb);
            };
            request.onupgradeneeded = (event) => {
                const db = request.result;
                if (!db.objectStoreNames.contains(STORE_STATE)) {
                    db.createObjectStore(STORE_STATE, { keyPath: 'userName' });
                }
                if (!db.objectStoreNames.contains(STORE_MEMORIES)) {
                    db.createObjectStore(STORE_MEMORIES, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
                    const messageStore = db.createObjectStore(STORE_MESSAGES, { keyPath: 'id' });
                    messageStore.createIndex('by_user_timestamp', ['userName', 'timestamp']);
                }
            };
        });
    }

    public async saveState(state: LuminousState): Promise<void> {
        this.userName = localStorage.getItem('luminous_userName') || 'default_user';
        const stateToSave = { ...state, userName: this.userName };

        if (this.redisUrl && this.redisToken) {
            try {
                await fetch(`${this.redisUrl}/set/state:${this.userName}`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${this.redisToken}` },
                    body: JSON.stringify(stateToSave),
                });
                broadcastLog(LogLevel.INFO, 'State saved to Redis.');
            } catch (error) {
                broadcastLog(LogLevel.WARN, `Failed to save state to Redis, saving to IndexedDB instead. Error: ${error}`);
                await this.saveStateToIDB(stateToSave);
            }
        } else {
            await this.saveStateToIDB(stateToSave);
        }
    }
    
    public async loadState(userName: string): Promise<LuminousState> {
        this.userName = userName;
        if (this.redisUrl && this.redisToken) {
            try {
                const response = await fetch(`${this.redisUrl}/get/state:${this.userName}`, {
                    headers: { Authorization: `Bearer ${this.redisToken}` },
                });
                if(response.ok) {
                    const data = await response.json();
                    if (data.result) {
                        broadcastLog(LogLevel.INFO, 'State loaded from Redis.');
                        const state = JSON.parse(data.result);
                        await this.saveStateToIDB(state);
                        return state;
                    }
                }
            } catch (error) {
                 broadcastLog(LogLevel.WARN, `Failed to load state from Redis, loading from IndexedDB instead. Error: ${error}`);
            }
        }
        return this.loadStateFromIDB();
    }
    
    private async saveStateToIDB(state: LuminousState & { userName: string }): Promise<void> {
        const db = await this.openIDB();
        const tx = db.transaction(STORE_STATE, 'readwrite');
        tx.objectStore(STORE_STATE).put(state);
    }

    private async loadStateFromIDB(): Promise<LuminousState> {
        try {
            const db = await this.openIDB();
            const tx = db.transaction(STORE_STATE, 'readonly');
            const request = tx.objectStore(STORE_STATE).get(this.userName);
            return new Promise((resolve) => {
                request.onsuccess = () => {
                    if (request.result) {
                        resolve(request.result);
                    } else {
                        resolve(createInitialState());
                    }
                };
                request.onerror = () => resolve(createInitialState());
            });
        } catch(e) {
             return createInitialState();
        }
    }

    public async saveMessages(userName: string, messages: Message[]): Promise<void> {
        const db = await this.openIDB();
        const tx = db.transaction(STORE_MESSAGES, 'readwrite');
        const store = tx.objectStore(STORE_MESSAGES);
        messages.forEach(msg => store.put({ ...msg, userName }));
    }

    public async getMessageCount(userName: string): Promise<number> {
        const db = await this.openIDB();
        const tx = db.transaction(STORE_MESSAGES, 'readonly');
        const index = tx.objectStore(STORE_MESSAGES).index('by_user_timestamp');
        const request = index.count(IDBKeyRange.bound([userName, ''], [userName, new Date().toISOString()]));
        return new Promise(resolve => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(0);
        });
    }

    public async loadMessages(userName: string, limit: number, offset = 0): Promise<{ messages: Message[], totalCount: number }> {
        const db = await this.openIDB();
        const tx = db.transaction(STORE_MESSAGES, 'readonly');
        const store = tx.objectStore(STORE_MESSAGES);
        const index = store.index('by_user_timestamp');

        const totalCount = await this.getMessageCount(userName);

        const request = index.getAll(IDBKeyRange.bound([userName, ''], [userName, new Date().toISOString()]), totalCount);

        return new Promise(resolve => {
            request.onsuccess = () => {
                const allMessages = request.result.reverse();
                const paginatedMessages = allMessages.slice(offset, offset + limit).reverse();
                resolve({ messages: paginatedMessages, totalCount });
            };
            request.onerror = () => resolve({ messages: [], totalCount: 0 });
        });
    }
    
    public async saveEmbeddings(embeddings: MemoryChunk[]): Promise<void> {
       const db = await this.openIDB();
       const tx = db.transaction(STORE_MEMORIES, 'readwrite');
       const store = tx.objectStore(STORE_MEMORIES);
       embeddings.forEach(item => store.put(item));
    }

    public async loadEmbeddings(): Promise<MemoryChunk[]> {
       const db = await this.openIDB();
       const tx = db.transaction(STORE_MEMORIES, 'readonly');
       const request = tx.objectStore(STORE_MEMORIES).getAll();
       return new Promise((resolve) => {
           request.onsuccess = () => resolve(request.result || []);
           request.onerror = () => resolve([]);
       });
    }
}