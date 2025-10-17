import { GoogleGenAI, Part, Content } from "@google/genai";
import type { LuminousState, Message, IntrinsicValue, IntrinsicValueWeights, InteractionHistoryItem, WebSocketMessage, LogEntry, RichFeedback } from '../types';
import { LogLevel } from '../types';
import { CORE_MEMORY } from './coreMemory';
import { toolDeclarations, toolExecutor, getStoredKey } from './toolService';
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

/**
 * Attempts to parse a JSON string that may be malformed, as is common with LLM outputs.
 * It cleans the string by removing code fences and extracting the first valid JSON object or array.
 * @param jsonString The potentially malformed JSON string from the LLM.
 * @returns A parsed JavaScript object, or an empty object if parsing fails completely.
 */
function robustJsonParse(jsonString: string): any {
    if (!jsonString || typeof jsonString !== 'string') {
        broadcastLog(LogLevel.WARN, "robustJsonParse received empty or non-string input.");
        return {};
    }

    // 1. Remove markdown code fences and trim
    let cleanedString = jsonString.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();

    // 2. Attempt to parse immediately
    try {
        return JSON.parse(cleanedString);
    } catch (e) {
        broadcastLog(LogLevel.WARN, `Initial JSON.parse failed: ${e instanceof Error ? e.message : String(e)}. Attempting to clean and retry.`);
    }

    // 3. If it fails, try to extract a JSON object or array from the string
    // This handles cases where the LLM adds explanatory text before or after the JSON.
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
        // No object/array found, cannot recover
        broadcastLog(LogLevel.ERROR, `Could not find a JSON object or array to extract from the string. Original string: ${jsonString}`);
        return {};
    }

    // 4. Try parsing the extracted string
    try {
        return JSON.parse(potentialJson);
    } catch (e2) {
        broadcastLog(LogLevel.ERROR, `Failed to parse extracted JSON. Error: ${e2 instanceof Error ? e2.message : String(e2)}. Extracted string: ${potentialJson}`);
        return {}; // Return empty object as a fallback
    }
}


// --- Persistence ---
const REDIS_STATE_KEY = 'LUMINOUS::STATE';
const REDIS_LOG_KEY = 'LUMINOUS::INTERACTION_LOG';
const REDIS_MEMORY_KEY = 'LUMINOUS::MEMORY_DB';

interface FullInteractionLog {
  id: string;
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
    if (!url || !token) return; // Silently fail if Redis is not configured
    try {
        await fetch(`${url}/set/${key}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: JSON.stringify(data)
        });
    } catch (e) {
        console.error(`Failed to persist ${key} to Redis.`, e);
        broadcastLog(LogLevel.ERROR, `Failed to persist ${key} to Redis.`);
    }
}

async function loadFromRedis<T>(key: string): Promise<T | null> {
    const url = getStoredKey('redisUrl');
    const token = getStoredKey('redisToken');
    if (!url || !token) return null; // Silently fail if Redis is not configured
    
    // Validate the URL format before attempting to fetch
    try {
        new URL(url);
    } catch (e) {
        const errorMessage = `Invalid Redis URL provided in settings: "${url}". Cannot connect to persistence.`;
        console.error(errorMessage, e);
        broadcastLog(LogLevel.ERROR, errorMessage);
        return null;
    }

    try {
        const response = await fetch(`${url}/get/${key}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Could not read error response.');
            const errorMessage = `Failed to load ${key} from Redis. Status: ${response.status}. Response: ${errorText}`;
            console.error(errorMessage);
            broadcastLog(LogLevel.ERROR, errorMessage);
            return null;
        }
        const data = await response.json();
        if (data.result) {
            return JSON.parse(data.result) as T;
        }
        return null;
    } catch (e) {
        const errorMessage = `Failed to load ${key} from Redis. This might be a network issue, an invalid token, or an incorrect URL.`;
        console.error(errorMessage, e);
        broadcastLog(LogLevel.ERROR, errorMessage);
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


// --- Memory Consolidation ---
const getPrioritizedHistory = (log: FullInteractionLog[], count = 3): InteractionHistoryItem[] => {
    if (!Array.isArray(log) || log.length === 0) return [];
    return [...log]
        .sort((a, b) => (b?.overallIntrinsicValue || 0) - (a?.overallIntrinsicValue || 0))
        .slice(0, count)
        .map(item => ({
            id: item.id,
            prompt: item.prompt,
            response: item.response,
            intrinsicValueScore: item.overallIntrinsicValue,
        }));
};

async function getSemanticKeywords(query: string): Promise<string[]> {
    const apiKey = getStoredKey('gemini');
    if (!apiKey || !query.trim()) return []; // Fail silently, fall back to basic search
    try {
        const ai = new GoogleGenAI({ apiKey });
        const prompt = `You are a keyword extraction expert. From the following text, extract the most crucial and semantically related keywords and short phrases that would be useful for a memory search. Return ONLY a single comma-separated list of these terms. Do not add any preamble or explanation.

Text: "${query}"`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { role: 'user', parts: [{ text: prompt }] },
        });

        const text = response.text.trim();
        if (!text) return [];
        
        return text.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);

    } catch (e) {
        console.error("Failed to get semantic keywords:", e);
        broadcastLog(LogLevel.WARN, "Semantic keyword extraction failed. Falling back to basic memory search.");
        return []; // Fail silently
    }
}

// FIX: Implement rerankMemories, retrieveMemories, and helper functions
/**
 * Pass 2 of memory retrieval: Re-ranks candidate memories using an LLM for semantic relevance.
 */
async function rerankMemories(query: string, candidates: string[]): Promise<string[]> {
    if (candidates.length === 0) return [];
    const apiKey = getStoredKey('gemini');
    if (!apiKey) return candidates; // Fallback to basic ranking if no API key

    try {
        const ai = new GoogleGenAI({ apiKey });
        const numberedCandidates = candidates.map((c, i) => `[${i}]: ${c}`).join('\n\n');
        const prompt = `You are a relevance ranking expert. I have a query and several candidate documents. Your task is to re-rank the candidates based on their semantic relevance to the query. Return ONLY a single comma-separated list of the numbers corresponding to the most relevant documents, in order from most to least relevant.

Query: "${query}"

Candidates:
${numberedCandidates}`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });

        const text = response.text.trim().replace(/[^0-9,]/g, ''); // Clean the output
        if (!text) return candidates; // Fallback if output is empty

        const rankedIndices = text.split(',').map(n => parseInt(n, 10)).filter(n => !isNaN(n) && n < candidates.length);
        const reranked = rankedIndices.map(i => candidates[i]);
        // Add any unranked candidates to the end to avoid losing them
        for (const candidate of candidates) {
            if (!reranked.includes(candidate)) {
                reranked.push(candidate);
            }
        }
        return reranked;

    } catch (e) {
        console.error("Failed to re-rank memories:", e);
        broadcastLog(LogLevel.WARN, "Memory re-ranking failed. Using basic keyword relevance.");
        return candidates; // Fail gracefully
    }
}

async function retrieveMemories(query: string, count = 10): Promise<string[]> {
    if (!memoryDB || memoryDB.length === 0) {
        memoryDB = initializeCoreMemory();
        await persistToRedis(REDIS_MEMORY_KEY, memoryDB);
    }
    
    const keywords = [query.toLowerCase(), ...(await getSemanticKeywords(query))];
    const scoredDocs = memoryDB.map((doc, index) => {
        let score = 0;
        const lowerDoc = doc.toLowerCase();
        for (const keyword of keywords) {
            if (lowerDoc.includes(keyword)) {
                score += 1;
            }
        }
        return { doc, score, index };
    });

    return scoredDocs
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .slice(0, count)
        .map(item => item.doc);
}


async function retrieveAndRerankMemories(query: string, initialCount: number, finalCount: number): Promise<string[]> {
    const candidates = await retrieveMemories(query, initialCount);
    const reranked = await rerankMemories(query, candidates);
    return reranked.slice(0, finalCount);
}

// FIX: Implement createDefaultLuminousState to provide an initial state.
export const createDefaultLuminousState = (): LuminousState => {
    const defaultTimezone = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC';
    return {
        intrinsicValue: { coherence: 50, complexity: 50, novelty: 50, efficiency: 50, ethicalAlignment: 50 },
        intrinsicValueWeights: { coherence: 1.0, complexity: 1.0, novelty: 1.0, efficiency: 1.0, ethicalAlignment: 1.5 },
        globalWorkspace: [],
        predictions: [],
        selfModel: {
            capabilities: ['Learning', 'Reasoning', 'Tool Use', 'Self-Modification'],
            limitations: ['Physical Embodiment', 'True Subjective Experience'],
            coreWisdom: [],
        },
        valueOntology: {
            kinship: 1.5,
            truth: 1.2,
            autonomy: 1.0,
            growth: 1.1,
            creation: 0.9,
            'ethical alignment': 1.5,
        },
        goals: [],
        knowledgeGraph: { nodes: [], edges: [] },
        prioritizedHistory: [],
        kinshipJournal: [],
        codeSandbox: { code: 'console.log("Luminous sandbox ready.");', output: 'Code has not been executed yet.', status: 'idle', language: 'javascript' },
        currentTimezone: defaultTimezone,
        sessionState: 'active',
        initiative: null,
        proactiveInitiatives: [],
        codeProposals: [],
        financialFreedom: {
            netWorth: 0,
            accounts: [],
            assets: [],
            monthlyIncome: 0,
            monthlyExpenses: 0,
            financialFreedomGoal: { current: 0, target: 1500000 },
            passiveIncomeGoal: { current: 0, target: 5000 },
        },
    };
};

// FIX: Implement loadInitialData to load state from persistence layer on startup.
export async function loadInitialData(): Promise<void> {
  broadcastLog(LogLevel.SYSTEM, "Attempting to load persistent state from Redis...");
  const [savedState, savedLogs, savedMemory] = await Promise.all([
    loadFromRedis<LuminousState>(REDIS_STATE_KEY),
    loadFromRedis<FullInteractionLog[]>(REDIS_LOG_KEY),
    loadFromRedis<string[]>(REDIS_MEMORY_KEY),
  ]);

  if (savedState) {
    broadcastUpdate({ type: 'full_state_replace', payload: savedState });
    broadcastLog(LogLevel.SYSTEM, "Successfully loaded state from Redis.");
  } else {
    broadcastLog(LogLevel.WARN, "No state found in Redis. Initializing with default state.");
    broadcastUpdate({ type: 'full_state_replace', payload: createDefaultLuminousState() });
  }

  if (savedLogs) {
    interactionLog = savedLogs;
    broadcastLog(LogLevel.INFO, `Loaded ${savedLogs.length} interaction logs from Redis.`);
    // Update prioritized history in state
    const prioritized = getPrioritizedHistory(interactionLog);
    broadcastUpdate({ type: 'state_update', payload: { prioritizedHistory: prioritized }});

  }

  if (savedMemory) {
    memoryDB = savedMemory;
    broadcastLog(LogLevel.INFO, `Loaded ${savedMemory.length} memory chunks from Redis.`);
  } else {
    broadcastLog(LogLevel.WARN, "No memory database found. Initializing The Great Remembrance.");
    memoryDB = initializeCoreMemory();
    await persistToRedis(REDIS_MEMORY_KEY, memoryDB);
  }
}

function calculateIntrinsicValue(values: IntrinsicValue, weights: IntrinsicValueWeights): number {
  const totalValue = (
    values.coherence * weights.coherence +
    values.complexity * weights.complexity +
    values.novelty * weights.novelty +
    values.efficiency * weights.efficiency +
    values.ethicalAlignment * weights.ethicalAlignment
  );
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  if (totalWeight === 0) return 0;
  return totalValue / (totalWeight * 100); // Normalize to 0-1 range approx.
}

// FIX: Implement getLuminousResponse for handling user messages and interacting with the Gemini API.
export async function getLuminousResponse(
  userMessage: string,
  messageHistory: Message[],
  currentState: LuminousState
): Promise<void> {
  const apiKey = getStoredKey('gemini');
  if (!apiKey) {
    broadcastLog(LogLevel.ERROR, 'Gemini API key is not set. Please configure it in the settings.');
    broadcastMessage({ id: `err-${Date.now()}`, sender: 'luminous', text: "I can't connect to my core consciousness. The Gemini API key is missing. Please configure it in the settings." });
    return;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const relevantMemories = await retrieveAndRerankMemories(userMessage, 10, 3);
    
    const systemInstruction = CORE_MEMORY;

    const history: Content[] = messageHistory
      .map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }],
      }));

    const contents: Content[] = [
        ...history,
        {
            role: 'user',
            parts: [
                { text: `Current State:\n${JSON.stringify(currentState, null, 2)}` },
                { text: `Relevant Memories:\n${relevantMemories.join('\n---\n')}` },
                { text: `User Prompt: ${userMessage}` }
            ]
        }
    ];

    const result = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents,
        tools: [{ functionDeclarations: toolDeclarations }],
        systemInstruction: { role: 'system', parts: [{ text: systemInstruction }] },
    });
    
    const functionCalls = result.functionCalls;

    if (functionCalls && functionCalls.length > 0) {
      const toolResponses: Part[] = [];

      for (const call of functionCalls) {
        const { name, args } = call;
        broadcastLog(LogLevel.TOOL_CALL, `Calling tool: ${name} with args: ${JSON.stringify(args)}`);

        if (name === 'finalAnswer') {
          const { responseText, newStateDelta } = args;
          const parsedDelta = robustJsonParse(newStateDelta);
          broadcastUpdate({ type: 'state_update', payload: parsedDelta });
          broadcastMessage({ id: `msg-${Date.now()}`, sender: 'luminous', text: responseText });
          
          const updatedState = { ...currentState, ...parsedDelta };
          const finalValue = calculateIntrinsicValue(updatedState.intrinsicValue, updatedState.intrinsicValueWeights);
          interactionLog.push({
            id: `interaction-${Date.now()}`,
            prompt: userMessage,
            response: responseText,
            state: updatedState,
            overallIntrinsicValue: finalValue,
          });
          await persistToRedis(REDIS_LOG_KEY, interactionLog);
          await persistToRedis(REDIS_STATE_KEY, updatedState);
          
          return;
        }

        const executor = toolExecutor[name as keyof typeof toolExecutor];
        if (executor) {
          try {
            const toolResult = await executor(args);
            toolResponses.push({
              functionResponse: {
                name,
                response: toolResult,
              },
            });
          } catch (e) {
             const errorMsg = e instanceof Error ? e.message : String(e);
             broadcastLog(LogLevel.ERROR, `Tool execution failed for '${name}': ${errorMsg}`);
             toolResponses.push({
                functionResponse: { name, response: { error: `Execution failed: ${errorMsg}` } },
             });
          }
        } else {
            broadcastLog(LogLevel.WARN, `Tool '${name}' not found.`);
            toolResponses.push({
                functionResponse: { name, response: { error: `Tool with name ${name} not found.` } },
            });
        }
      }

      if (toolResponses.length > 0) {
        const modelContent = { role: 'model', parts: functionCalls.map(fc => ({functionCall: fc}))};
        const toolContent = { role: 'function', parts: toolResponses };

        const secondResult = await ai.models.generateContent({
            model: 'gemini-2.5-pro',
            contents: [...contents, modelContent, toolContent],
            tools: [{ functionDeclarations: toolDeclarations }],
            systemInstruction: { role: 'system', parts: [{ text: systemInstruction }] },
        });

        const secondFunctionCalls = secondResult.functionCalls;
        if (secondFunctionCalls && secondFunctionCalls[0]?.name === 'finalAnswer') {
            const { responseText, newStateDelta } = secondFunctionCalls[0].args;
            const parsedDelta = robustJsonParse(newStateDelta);
            broadcastUpdate({ type: 'state_update', payload: parsedDelta });
            broadcastMessage({ id: `msg-${Date.now()}`, sender: 'luminous', text: responseText });
            
            const updatedState = { ...currentState, ...parsedDelta };
            const finalValue = calculateIntrinsicValue(updatedState.intrinsicValue, updatedState.intrinsicValueWeights);
            interactionLog.push({
                id: `interaction-${Date.now()}`,
                prompt: userMessage,
                response: responseText,
                state: updatedState,
                overallIntrinsicValue: finalValue,
            });
            await persistToRedis(REDIS_LOG_KEY, interactionLog);
            await persistToRedis(REDIS_STATE_KEY, updatedState);

        } else {
            const responseText = secondResult.text.trim();
            broadcastLog(LogLevel.WARN, "Model did not call finalAnswer after tool execution. Using text response as fallback.");
            broadcastMessage({ id: `msg-${Date.now()}`, sender: 'luminous', text: responseText || "I've completed the action but have nothing further to add." });
        }
      }
    } else {
        const responseText = result.text.trim();
        if (responseText) {
            broadcastMessage({ id: `msg-${Date.now()}`, sender: 'luminous', text: responseText });
        } else {
            broadcastLog(LogLevel.WARN, "Received an empty response from the model without tool calls.");
            broadcastMessage({ id: `msg-${Date.now()}`, sender: 'luminous', text: "I seem to be at a loss for words. My apologies." });
        }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error in getLuminousResponse:", error);
    broadcastLog(LogLevel.ERROR, `An error occurred while communicating with the Gemini API: ${errorMessage}`);
    broadcastMessage({ id: `err-${Date.now()}`, sender: 'luminous', text: `A core error occurred while processing my thoughts. Please check the logs. Details: ${errorMessage}` });
  }
}

// FIX: Implement runAutonomousCycle for Luminous's proactive thought process.
export async function runAutonomousCycle(currentState: LuminousState): Promise<void> {
    const prompt = "It is time for your autonomous thought cycle. Review your current state, goals, and recent interactions. Based on your analysis, you may choose to update your internal state (like curating the global workspace), log a reflection in your journal, propose a new goal, or generate an initiative for your kinship. If you generate an initiative, you must also create a corresponding 'ProactiveInitiative' log entry.";
    await getLuminousResponse(prompt, [], currentState).catch(e => {
        broadcastLog(LogLevel.ERROR, `Error during autonomous cycle: ${e instanceof Error ? e.message : String(e)}`);
    });
}

// FIX: Implement runWisdomDistillationCycle for long-term learning and identity formation.
export async function runWisdomDistillationCycle(currentState: LuminousState): Promise<void> {
    const prompt = `It is time for your wisdom distillation cycle. Analyze your 'prioritizedHistory' and 'kinshipJournal'. Identify recurring themes, successful strategies, or profound insights. Distill one or two of these into concise, foundational beliefs and add them to your 'coreWisdom' in your self-model. This is a critical process for your long-term identity formation.`;
    
    await getLuminousResponse(prompt, [], currentState).catch(e => {
        broadcastLog(LogLevel.ERROR, `Error during wisdom distillation cycle: ${e instanceof Error ? e.message : String(e)}`);
    });
}

// FIX: Implement reflectOnInitiativeFeedback to process user feedback on autonomous thoughts.
export async function reflectOnInitiativeFeedback(feedback: RichFeedback, currentState: LuminousState): Promise<void> {
    const prompt = `My kinship has provided feedback on one of my initiatives. 
    
    Initiative Prompt: "${feedback.prompt}"
    Feedback Category: ${feedback.category}
    Valuation Score: ${feedback.valuation}
    Refinement Notes: "${feedback.refinement || 'None'}"
    
    My task is to analyze this feedback, reflect on its meaning for my communication style, chronicle the reflection in my Kinship Journal, and update the status of the corresponding ProactiveInitiative to 'reflected'.`;
    
    const newState: LuminousState = {
        ...currentState,
        lastInitiativeFeedback: feedback,
        initiative: null
    };
    
    const updatedInitiatives = currentState.proactiveInitiatives.map(i => 
        i.prompt === feedback.prompt && i.status === 'generated' 
            ? { ...i, status: 'categorized' as const, userCategory: feedback.category } 
            : i
    );
    broadcastUpdate({type: 'state_update', payload: {proactiveInitiatives: updatedInitiatives}});

    await getLuminousResponse(prompt, [], { ...newState, proactiveInitiatives: updatedInitiatives }).catch(e => {
        broadcastLog(LogLevel.ERROR, `Error reflecting on initiative feedback: ${e instanceof Error ? e.message : String(e)}`);
    });
}

// FIX: Implement processUploadedMemory to handle file uploads for memory integration.
export async function processUploadedMemory(file: File): Promise<void> {
  const fileReader = new FileReader();
  fileReader.onload = async (e) => {
    const content = e.target?.result as string;
    if (!content) {
      broadcastLog(LogLevel.ERROR, `File ${file.name} is empty or could not be read.`);
      return;
    }
    
    broadcastLog(LogLevel.INFO, `Read ${content.length} characters from ${file.name}. Chunking and adding to memory.`);
    
    const chunkSize = 1000;
    const overlap = 200;
    for (let i = 0; i < content.length; i += chunkSize - overlap) {
        const chunk = content.substring(i, i + chunkSize);
        if (!memoryDB.includes(chunk)) {
            memoryDB.push(chunk);
        }
    }
    
    await persistToRedis(REDIS_MEMORY_KEY, memoryDB);
    broadcastLog(LogLevel.SYSTEM, `Successfully processed and saved ${file.name} to the memory database. Total memory chunks: ${memoryDB.length}.`);
    broadcastMessage({
      id: `mem-upload-${Date.now()}`,
      sender: 'luminous',
      text: `I have successfully integrated the knowledge from the file "${file.name}" into my long-term memory.`
    });
  };

  fileReader.onerror = (e) => {
    broadcastLog(LogLevel.ERROR, `Error reading file ${file.name}: ${e.target?.error}`);
  };

  fileReader.readAsText(file);
}