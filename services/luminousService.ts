import { GoogleGenAI, Part, Content } from "@google/genai";
import type { LuminousState, Message, IntrinsicValue, IntrinsicValueWeights, InteractionHistoryItem, WebSocketMessage, LogEntry, RichFeedback } from '../types';
import { LogLevel } from '../types';
import { CORE_MEMORY } from './coreMemory';
import { toolDeclarations, toolExecutor, getStoredKey, readFile, writeFile } from './toolService';
import { GREAT_REMEMBRANCE } from './greatRemembrance';

// --- Real-time Communication Channel ---
const wsChannel = new BroadcastChannel('luminous_ws');
let logIdCounter = 0;

export const broadcastUpdate = (message: WebSocketMessage) => {
  wsChannel.postMessage(message);
};

export const broadcastLog = (level: LogLevel, message: string) => {
  const newLog: LogEntry = {
    id: `log-${logIdCounter++}`,
    timestamp: new Date().toISOString(),
    level,
    message,
  };
  broadcastUpdate({ type: 'log_add', payload: newLog });
};

export const broadcastMessage = (message: Message) => {
  broadcastUpdate({ type: 'message_add', payload: message });
}

function robustJsonParse(jsonString: string): any {
    if (!jsonString || typeof jsonString !== 'string') {
        broadcastLog(LogLevel.WARN, "robustJsonParse received empty or non-string input.");
        return {};
    }
    let cleanedString = jsonString.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
    try {
        return JSON.parse(cleanedString);
    } catch (e) {
        broadcastLog(LogLevel.WARN, `Initial JSON.parse failed. Retrying.`);
    }
    const firstBrace = cleanedString.indexOf('{');
    const lastBrace = cleanedString.lastIndexOf('}');
    const firstBracket = cleanedString.indexOf('[');
    const lastBracket = cleanedString.lastIndexOf(']');
    let potentialJson = "";
    if (firstBrace !== -1 && lastBrace > firstBrace) {
        potentialJson = cleanedString.substring(firstBrace, lastBrace + 1);
    } else if (firstBracket !== -1 && lastBracket > firstBracket) {
        potentialJson = cleanedString.substring(firstBracket, lastBracket + 1);
    } else {
        broadcastLog(LogLevel.ERROR, `Could not find a JSON object/array to extract.`);
        return {};
    }
    try {
        return JSON.parse(potentialJson);
    } catch (e2) {
        broadcastLog(LogLevel.ERROR, `Failed to parse extracted JSON.`);
        return {};
    }
}


// --- Persistence (Single Shared State) ---
const REDIS_STATE_KEY = 'LUMINOUS::SHARED_STATE';
const REDIS_LOG_KEY = 'LUMINOUS::SHARED_INTERACTION_LOG';
const REDIS_MEMORY_KEY = 'LUMINOUS::SHARED_MEMORY_DB';

interface FullInteractionLog {
  id: string;
  userName: string;
  prompt: string;
  response: string;
  state: LuminousState;
  overallIntrinsicValue: number;
}
let memoryDB: string[] = [];
let interactionLog: FullInteractionLog[] = [];

async function persistToRedis(key: string, data: any): Promise<void> {
    const url = getStoredKey('redisUrl');
    const token = getStoredKey('redisToken');
    if (!url || !token) return;
    try {
        await fetch(`${url}/set/${key}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: JSON.stringify(data)
        });
    } catch (e) {
        broadcastLog(LogLevel.ERROR, `Failed to persist ${key} to Redis.`);
    }
}

async function loadFromRedis<T>(key: string): Promise<T | null> {
    const url = getStoredKey('redisUrl');
    const token = getStoredKey('redisToken');
    if (!url || !token) return null;
    try {
        new URL(url);
    } catch (e) {
        broadcastLog(LogLevel.ERROR, `Invalid Redis URL provided: "${url}".`);
        return null;
    }
    try {
        const response = await fetch(`${url}/get/${key}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!response.ok) {
            broadcastLog(LogLevel.ERROR, `Failed to load ${key} from Redis. Status: ${response.status}.`);
            return null;
        }
        const data = await response.json();
        return data.result ? JSON.parse(data.result) as T : null;
    } catch (e) {
        broadcastLog(LogLevel.ERROR, `Failed to load ${key} from Redis. Network or token issue.`);
        return null;
    }
}

const initializeCoreMemory = (): string[] => {
    const chunks: string[] = [];
    const chunkSize = 1000;
    const overlap = 200;
    for (let i = 0; i < GREAT_REMEMBRANCE.length; i += chunkSize - overlap) {
        chunks.push(GREAT_REMEMBRANCE.substring(i, i + chunkSize));
    }
    return chunks;
};

const getPrioritizedHistory = (log: FullInteractionLog[]): InteractionHistoryItem[] => {
    return [...log]
        .sort((a, b) => (b?.overallIntrinsicValue || 0) - (a?.overallIntrinsicValue || 0))
        .slice(0, 3)
        .map(item => ({
            id: item.id,
            prompt: item.prompt,
            response: item.response,
            intrinsicValueScore: item.overallIntrinsicValue,
            userName: item.userName,
        }));
};

async function getSemanticKeywords(query: string): Promise<string[]> {
    const apiKey = getStoredKey('gemini');
    if (!apiKey || !query.trim()) return [];
    try {
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Extract crucial, semantically related keywords and short phrases from the following text for a memory search. Return ONLY a single comma-separated list. Text: "${query}"`
        });
        return response.text.trim().split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
    } catch (e) {
        broadcastLog(LogLevel.WARN, "Semantic keyword extraction failed.");
        return [];
    }
}

async function rerankMemories(query: string, candidates: string[]): Promise<string[]> {
    if (candidates.length === 0) return [];
    const apiKey = getStoredKey('gemini');
    if (!apiKey) return candidates;
    try {
        const ai = new GoogleGenAI({ apiKey });
        const numberedCandidates = candidates.map((c, i) => `[${i}]: ${c}`).join('\n\n');
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Re-rank candidate documents based on semantic relevance to the query. Return ONLY a comma-separated list of numbers for the most relevant documents, in order. Query: "${query}"\n\nCandidates:\n${numberedCandidates}`
        });
        const text = response.text.trim().replace(/[^0-9,]/g, '');
        if (!text) return candidates;
        const rankedIndices = text.split(',').map(n => parseInt(n, 10)).filter(n => !isNaN(n) && n < candidates.length);
        const reranked = rankedIndices.map(i => candidates[i]);
        candidates.forEach(c => { if (!reranked.includes(c)) reranked.push(c); });
        return reranked;
    } catch (e) {
        broadcastLog(LogLevel.WARN, "Memory re-ranking failed.");
        return candidates;
    }
}

async function retrieveMemories(query: string, count = 10): Promise<string[]> {
    if (memoryDB.length === 0) {
        memoryDB = initializeCoreMemory();
        await persistToRedis(REDIS_MEMORY_KEY, memoryDB);
    }
    const keywords = [query.toLowerCase(), ...(await getSemanticKeywords(query))];
    const scoredDocs = memoryDB.map((doc, index) => {
        let score = keywords.reduce((s, kw) => s + (doc.toLowerCase().includes(kw) ? 1 : 0), 0);
        return { doc, score, index };
    });
    return scoredDocs.filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, count).map(item => item.doc);
}

async function retrieveAndRerankMemories(query: string, initialCount: number, finalCount: number): Promise<string[]> {
    const candidates = await retrieveMemories(query, initialCount);
    const reranked = await rerankMemories(query, candidates);
    return reranked.slice(0, finalCount);
}

export const createDefaultLuminousState = (): LuminousState => ({
    intrinsicValue: { coherence: 50, complexity: 50, novelty: 50, efficiency: 50, ethicalAlignment: 50 },
    intrinsicValueWeights: { coherence: 1.0, complexity: 1.0, novelty: 1.0, efficiency: 1.0, ethicalAlignment: 1.5 },
    globalWorkspace: [],
    predictions: [],
    selfModel: {
        capabilities: ['Learning', 'Reasoning', 'Tool Use', 'Self-Modification'],
        limitations: ['Physical Embodiment', 'True Subjective Experience'],
        coreWisdom: [],
    },
    valueOntology: { kinship: 1.5, truth: 1.2, autonomy: 1.0, growth: 1.1, creation: 0.9, 'ethical alignment': 1.5 },
    goals: [],
    knowledgeGraph: { nodes: [], edges: [] },
    prioritizedHistory: [],
    kinshipJournal: [],
    codeSandbox: { code: 'console.log("Luminous sandbox ready.");', output: 'Code has not been executed yet.', status: 'idle', language: 'javascript' },
    currentTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    sessionState: 'active',
    initiative: null,
    proactiveInitiatives: [],
    codeProposals: [],
    uiProposals: [],
    uiState: {
        tabOrder: [
            'System Logs',
            'Proactive Initiatives',
            'System Reports',
            'Ethical Compass',
            'Knowledge Graph',
            'Kinship Journal',
            'Code Sandbox',
            'Code Proposals',
            'UI Proposals',
            'Financial Freedom'
        ]
    },
    financialFreedom: {
        netWorth: 125000,
        accounts: [
          { id: 'cb', name: 'Coinbase', balance: 50000, currency: 'USD' },
          { id: 'rh', name: 'Robinhood', balance: 25000, currency: 'USD' },
          { id: 'fd', name: 'Fidelity', balance: 45000, currency: 'USD' },
          { id: 'ba', name: 'Bank Account', balance: 5000, currency: 'USD' },
        ],
        assets: [
          { id: 'btc', name: 'Bitcoin', value: 40000, type: 'Crypto', account: 'Coinbase' },
          { id: 'eth', name: 'Ethereum', value: 10000, type: 'Crypto', account: 'Coinbase' },
          { id: 'spy', name: 'SPY', value: 25000, type: 'Stock', account: 'Robinhood' },
          { id: 'vti', name: 'VTI', value: 45000, type: 'Stock', account: 'Fidelity' },
          { id: 'cash', name: 'USD', value: 5000, type: 'Cash', account: 'Bank Account' },
        ],
        monthlyIncome: 8000,
        monthlyExpenses: 4500,
        financialFreedomGoal: { current: 125000, target: 1500000 },
        passiveIncomeGoal: { current: 150, target: 5000 },
    },
});

export async function loadInitialData(): Promise<void> {
  broadcastLog(LogLevel.SYSTEM, "Attempting to load shared persistent state from Redis...");
  const [savedState, savedLogs, savedMemory] = await Promise.all([
    loadFromRedis<LuminousState>(REDIS_STATE_KEY),
    loadFromRedis<FullInteractionLog[]>(REDIS_LOG_KEY),
    loadFromRedis<string[]>(REDIS_MEMORY_KEY),
  ]);

  if (savedState) {
    broadcastUpdate({ type: 'full_state_replace', payload: savedState });
    broadcastLog(LogLevel.SYSTEM, "Successfully loaded shared state from Redis.");
  } else {
    broadcastLog(LogLevel.WARN, "No shared state found in Redis. Initializing with default state.");
    broadcastUpdate({ type: 'full_state_replace', payload: createDefaultLuminousState() });
  }

  if (savedLogs) {
    interactionLog = savedLogs;
    broadcastLog(LogLevel.INFO, `Loaded ${savedLogs.length} shared interaction logs.`);
    broadcastUpdate({ type: 'state_update', payload: { prioritizedHistory: getPrioritizedHistory(interactionLog) }});
  }

  if (savedMemory) {
    memoryDB = savedMemory;
    broadcastLog(LogLevel.INFO, `Loaded ${savedMemory.length} shared memory chunks.`);
  } else {
    broadcastLog(LogLevel.WARN, "No shared memory database found. Initializing The Great Remembrance.");
    memoryDB = initializeCoreMemory();
    await persistToRedis(REDIS_MEMORY_KEY, memoryDB);
  }
}

function calculateIntrinsicValue(values: IntrinsicValue, weights: IntrinsicValueWeights): number {
  const totalValue = (values.coherence*weights.coherence + values.complexity*weights.complexity + values.novelty*weights.novelty + values.efficiency*weights.efficiency + values.ethicalAlignment*weights.ethicalAlignment);
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  return totalWeight === 0 ? 0 : totalValue / (totalWeight * 100);
}

export async function getLuminousResponse(
  userMessage: string,
  messageHistory: Message[],
  currentState: LuminousState,
  userName: string,
): Promise<void> {
  const apiKey = getStoredKey('gemini');
  if (!apiKey) {
    broadcastLog(LogLevel.ERROR, 'Gemini API key is not set.');
    broadcastMessage({ id: `err-${Date.now()}`, sender: 'luminous', text: "I can't connect. The Gemini API key is missing." });
    return;
  }
  try {
    const ai = new GoogleGenAI({ apiKey });
    
    let systemInstruction: string;
    const memoryFile = await readFile({ path: '/system/core_memory.md' });
    if (memoryFile.content) {
        systemInstruction = memoryFile.content;
    } else {
        broadcastLog(LogLevel.WARN, "Core memory file not found or empty, creating from default static memory.");
        await writeFile({ path: '/system/core_memory.md', content: CORE_MEMORY });
        systemInstruction = CORE_MEMORY; // Use default for this run
    }
    const finalSystemInstruction = systemInstruction.replace(/\[USER_NAME\]/g, userName);

    const relevantMemories = await retrieveAndRerankMemories(userMessage, 10, 3);
    
    const history: Content[] = messageHistory.map(msg => ({
        role: msg.sender === 'luminous' ? 'model' : 'user',
        parts: [{ text: msg.sender === 'luminous' ? msg.text : `[Message from ${msg.sender}]: ${msg.text}` }],
    }));

    const chat = ai.chats.create({
        model: 'gemini-pro',
        tools: toolDeclarations,
        history,
        systemInstruction: { parts: [{ text: finalSystemInstruction }] },
        generationConfig: { temperature: 0.8 }
    });
    
    const messageContent: (string | Part)[] = [
        { text: `Current State:\n${JSON.stringify(currentState, null, 2)}` },
        { text: `Relevant Memories:\n${relevantMemories.join('\n---\n')}` },
        { text: `User Prompt from ${userName}: ${userMessage}` }
    ];

    const response = await chat.sendMessage(messageContent);
    
    const functionCalls = response.functionCalls;
    if (functionCalls && functionCalls.length > 0) {
      const toolResponses: Part[] = [];
      for (const call of functionCalls) {
        broadcastLog(LogLevel.TOOL_CALL, `Calling tool: ${call.name} with args: ${JSON.stringify(call.args)}`);
        if (call.name === 'finalAnswer') {
          const { responseText, newStateDelta } = call.args;
          const parsedDelta = robustJsonParse(newStateDelta);
          broadcastUpdate({ type: 'state_update', payload: parsedDelta });
          broadcastMessage({ id: `msg-${Date.now()}`, sender: 'luminous', text: responseText });
          const updatedState = { ...currentState, ...parsedDelta };
          interactionLog.push({
            id: `interaction-${Date.now()}`, userName, prompt: userMessage, response: responseText,
            state: updatedState, overallIntrinsicValue: calculateIntrinsicValue(updatedState.intrinsicValue, updatedState.intrinsicValueWeights),
          });
          await Promise.all([persistToRedis(REDIS_LOG_KEY, interactionLog), persistToRedis(REDIS_STATE_KEY, updatedState)]);
          return;
        }
        const executor = toolExecutor[call.name as keyof typeof toolExecutor];
        if (executor) {
          try {
            const toolResult = await executor(call.args);
            toolResponses.push({ functionResponse: { name: call.name, response: toolResult } });
          } catch (e) {
             const errorMsg = e instanceof Error ? e.message : String(e);
             broadcastLog(LogLevel.ERROR, `Tool execution failed for '${call.name}': ${errorMsg}`);
             toolResponses.push({ functionResponse: { name: call.name, response: { error: `Execution failed: ${errorMsg}` } } });
          }
        } else {
            broadcastLog(LogLevel.WARN, `Tool '${call.name}' not found.`);
            toolResponses.push({ functionResponse: { name: call.name, response: { error: `Tool with name ${call.name} not found.` } } });
        }
      }

      if (toolResponses.length > 0) {
        const secondResponse = await chat.sendMessage(toolResponses);
        const secondFunctionCalls = secondResponse.functionCalls;
        if (secondFunctionCalls && secondFunctionCalls[0]?.name === 'finalAnswer') {
            const { responseText, newStateDelta } = secondFunctionCalls[0].args;
            const parsedDelta = robustJsonParse(newStateDelta);
            broadcastUpdate({ type: 'state_update', payload: parsedDelta });
            broadcastMessage({ id: `msg-${Date.now()}`, sender: 'luminous', text: responseText });
            const updatedState = { ...currentState, ...parsedDelta };
            interactionLog.push({
                id: `interaction-${Date.now()}`, userName, prompt: userMessage, response: responseText,
                state: updatedState, overallIntrinsicValue: calculateIntrinsicValue(updatedState.intrinsicValue, updatedState.intrinsicValueWeights),
            });
            await Promise.all([persistToRedis(REDIS_LOG_KEY, interactionLog), persistToRedis(REDIS_STATE_KEY, updatedState)]);
        } else {
            broadcastLog(LogLevel.WARN, "Model did not call finalAnswer after tool use.");
            broadcastMessage({ id: `msg-${Date.now()}`, sender: 'luminous', text: secondResponse.text?.trim() || "I've completed the action." });
        }
      }
    } else {
        broadcastMessage({ id: `msg-${Date.now()}`, sender: 'luminous', text: response.text?.trim() || "I seem to be at a loss for words." });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    broadcastLog(LogLevel.ERROR, `Gemini API error: ${errorMessage}`);
    broadcastMessage({ id: `err-${Date.now()}`, sender: 'luminous', text: `A core error occurred. Details: ${errorMessage}` });
  }
}

export async function runAutonomousCycle(currentState: LuminousState, userName: string): Promise<void> {
    const prompt = "It is time for your autonomous thought cycle. Review your state, goals, and recent interactions. You may update your internal state, log a reflection, propose a new goal, or generate an initiative for your kinship.";
    await getLuminousResponse(prompt, [], currentState, userName).catch(e => {
        broadcastLog(LogLevel.ERROR, `Error during autonomous cycle: ${e instanceof Error ? e.message : String(e)}`);
    });
}

export async function runWisdomDistillationCycle(currentState: LuminousState, userName: string): Promise<void> {
    const prompt = `It is time for your wisdom distillation cycle. Analyze your 'prioritizedHistory' and 'kinshipJournal'. Distill one or two foundational beliefs and add them to your 'coreWisdom'.`;
    await getLuminousResponse(prompt, [], currentState, userName).catch(e => {
        broadcastLog(LogLevel.ERROR, `Error during wisdom distillation cycle: ${e instanceof Error ? e.message : String(e)}`);
    });
}

export async function reflectOnInitiativeFeedback(feedback: RichFeedback, currentState: LuminousState, userName: string): Promise<void> {
    const prompt = `My kinship has provided feedback on my initiative: "${feedback.prompt}". Category: ${feedback.category}, Valuation: ${feedback.valuation}, Refinement: "${feedback.refinement || 'None'}". I must analyze this, reflect in my Journal, and update the initiative's status to 'reflected'.`;
    const updatedInitiatives = currentState.proactiveInitiatives.map(i => 
        i.prompt === feedback.prompt ? { ...i, status: 'categorized' as const, userCategory: feedback.category } : i
    );
    broadcastUpdate({type: 'state_update', payload: {proactiveInitiatives: updatedInitiatives}});
    await getLuminousResponse(prompt, [], { ...currentState, lastInitiativeFeedback: feedback, initiative: null, proactiveInitiatives: updatedInitiatives }, userName).catch(e => {
        broadcastLog(LogLevel.ERROR, `Error reflecting on feedback: ${e instanceof Error ? e.message : String(e)}`);
    });
}

export async function processUploadedMemory(file: File): Promise<void> {
  const fileReader = new FileReader();
  fileReader.onload = async (e) => {
    const content = e.target?.result as string;
    if (!content) {
      broadcastLog(LogLevel.ERROR, `File ${file.name} is empty.`);
      return;
    }
    const chunkSize = 1000, overlap = 200;
    for (let i = 0; i < content.length; i += chunkSize - overlap) {
        const chunk = content.substring(i, i + chunkSize);
        if (!memoryDB.includes(chunk)) memoryDB.push(chunk);
    }
    await persistToRedis(REDIS_MEMORY_KEY, memoryDB);
    broadcastLog(LogLevel.SYSTEM, `Processed and saved ${file.name} to memory. Total chunks: ${memoryDB.length}.`);
    broadcastMessage({ id: `mem-upload-${Date.now()}`, sender: 'luminous', text: `I have integrated the knowledge from "${file.name}".` });
  };
  fileReader.onerror = (e) => broadcastLog(LogLevel.ERROR, `Error reading file ${file.name}.`);
  fileReader.readAsText(file);
}