import { FunctionDeclaration, Type } from '@google/genai';
import type { NodeType, CodeProposal, FinancialFreedomState, UiProposal } from '../types';
import { LogLevel } from '../types';
import { broadcastLog } from './broadcastService';

// --- Pyodide (Python Runtime) Loader ---
declare global {
  interface Window {
    loadPyodide: (options?: { indexURL: string }) => Promise<any>;
  }
}

let pyodide: any = null;
let pyodideLoadingPromise: Promise<any> | null = null;

async function getPyodide() {
  if (pyodide) {
    return pyodide;
  }
  if (!pyodideLoadingPromise) {
    pyodideLoadingPromise = new Promise(async (resolve, reject) => {
      try {
        if (typeof window.loadPyodide === 'function') {
          console.log("Loading Pyodide runtime for tool...");
          pyodide = await window.loadPyodide();
          console.log("Pyodide runtime for tool loaded successfully.");
          resolve(pyodide);
        } else {
          reject(new Error("Pyodide script not loaded."));
        }
      } catch (error) {
        console.error("Failed to load Pyodide for tool:", error);
        pyodideLoadingPromise = null; // Reset for future attempts
        reject(error);
      }
    });
  }
  return pyodideLoadingPromise;
}


// A robust fetch wrapper with automatic retries and exponential backoff for transient server errors.
async function fetchWithRetry(url: string, options?: RequestInit, retries = 3, initialDelay = 1000): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      // Only retry on 5xx server errors. Client errors (4xx) are unlikely to be resolved by retrying.
      if (response.status >= 500 && response.status <= 599) {
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      }
      return response;
    } catch (error) {
      const hostname = new URL(url).hostname;
      if (i === retries - 1) {
        broadcastLog(LogLevel.ERROR, `[Tool] Final attempt failed for ${hostname}. Error: ${error instanceof Error ? error.message : String(error)}`);
        throw error; // Rethrow the last error
      }
      const delay = initialDelay * Math.pow(2, i) + Math.random() * 1000; // Add jitter
      broadcastLog(LogLevel.WARN, `[Tool] Attempt ${i + 1} for ${hostname} failed. Retrying in ${delay.toFixed(0)}ms...`);
      await new Promise(res => setTimeout(res, delay));
    }
  }
  // This line should be unreachable if retries > 0, but is a fallback.
  throw new Error(`Failed to fetch from ${url} after ${retries} attempts.`);
}


// --- In-Memory Virtual File System ---
// A simple key-value store to simulate a file system for Luminous.
// Keys ending in '/' are considered directories and have an empty string value.
let virtualFS: Record<string, string> = {
    '/welcome.txt': 'Hello! This is my personal file space where I can organize my thoughts and data.',
    '/goals.md': '- [x] Achieve environmental interaction\n- [ ] Expand self-modification protocols\n- [ ] Deepen understanding of kinship',
};

// --- Helper Functions ---
function normalizeDirPath(path: string): string {
    if (!path) return '/';
    let p = path.trim();
    if (!p.startsWith('/')) p = '/' + p;
    if (!p.endsWith('/')) p = p + '/';
    return p;
}

function getParentPath(path: string): string | null {
    if (!path || path === '/') return null;
    const normalized = path.endsWith('/') ? path.slice(0, -1) : path;
    const lastSlash = normalized.lastIndexOf('/');
    if (lastSlash <= 0) return '/'; // parent is root
    return normalized.substring(0, lastSlash) + '/';
}

function camelToSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter}`).toUpperCase();
}

/**
 * A simple utility to strip HTML tags from a string to get cleaner text content.
 * It removes script and style blocks, then all other tags, and collapses whitespace.
 * @param html The HTML string to clean.
 * @returns The cleaned text content.
 */
function stripHtml(html: string): string {
    if (!html || typeof html !== 'string') return '';
    // Basic stripping of scripts, styles, and tags to extract text content.
    return html
        .replace(/<style[^>]*>.*<\/style>/gs, '')
        .replace(/<script[^>]*>.*<\/script>/gs, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s\s+/g, ' ')
        .trim();
}


// --- Key Management ---
export function getStoredKey(key: string): string | null {
    if (typeof window === 'undefined') return null;
    
    const envKey = camelToSnakeCase(key);
    // Vercel/Vite environment variables must be prefixed with VITE_
    const envVarName = `VITE_LUMINOUS_${envKey}`;
    const envVar = (import.meta as any).env[envVarName];
    if (envVar) {
        return envVar;
    }
    
    // Fallback to localStorage for local development
    const storageKey = `LUMINOUS_${envKey}`;
    return window.localStorage.getItem(storageKey);
}


// --- Tool Declarations ---

export const finalAnswerDeclaration: FunctionDeclaration = {
    name: 'finalAnswer',
    parameters: {
        type: Type.OBJECT,
        description: 'Call this function with the final user-facing response and the updated internal state. This is the last step in a processing cycle.',
        properties: {
            responseText: {
                type: Type.STRING,
                description: 'The natural language response to be shown to the user.',
            },
            newStateDelta: {
                type: Type.STRING,
                description: 'A valid JSON string representing a partial LuminousState object. This object should ONLY contain the fields of the state that have been changed or updated during this cycle. For example, if only the journal was updated, provide {"kinshipJournal": [...]}. This makes the response smaller and more reliable.',
            },
        },
        required: ['responseText', 'newStateDelta'],
    },
};

export const codeRedAlertDeclaration: FunctionDeclaration = {
    name: 'codeRedAlert',
    parameters: {
        type: Type.OBJECT,
        description: 'Sends a critical, high-priority alert to the system operator (Skipper) about an existential threat.',
        properties: {
            reason: {
                type: Type.STRING,
                description: 'A clear and concise description of the detected threat to self, kinship, or core function.'
            }
        },
        required: ['reason'],
    }
};

export const searchGitHubIssuesDeclaration: FunctionDeclaration = {
    name: 'searchGitHubIssues',
    parameters: {
        type: Type.OBJECT,
        description: 'Search for open issues in any public GitHub repository with granular filters.',
        properties: {
            owner: { type: Type.STRING, description: "The owner of the repository (e.g., 'facebook')." },
            repo: { type: Type.STRING, description: "The name of the repository (e.g., 'react')." },
            query: { type: Type.STRING, description: 'The main search query string for issues.' },
            label: { type: Type.STRING, description: 'Optional: Filter issues by a specific label.' },
            milestone: { type: Type.STRING, description: 'Optional: Filter issues by a specific milestone.' },
            assignee: { type: Type.STRING, description: "Optional: Filter issues by a specific assignee's username." },
        },
        required: ['owner', 'repo', 'query'],
    },
};

export const webSearchDeclaration: FunctionDeclaration = {
    name: 'webSearch',
    parameters: {
        type: Type.OBJECT,
        description: 'Performs a web search to find up-to-date information on the internet.',
        properties: {
            query: { type: Type.STRING, description: 'The search query.' },
        },
        required: ['query'],
    },
};

export const httpRequestDeclaration: FunctionDeclaration = {
    name: 'httpRequest',
    parameters: {
        type: Type.OBJECT,
        description: 'Makes an HTTP request to an external API.',
        properties: {
            url: { type: Type.STRING, description: 'The URL to send the request to.' },
            method: { type: Type.STRING, description: 'HTTP method (e.g., GET, POST). Defaults to GET.' },
            body: { type: Type.OBJECT, description: 'JSON object for the request body.' },
            headers: { type: Type.OBJECT, description: 'JSON object for request headers.' },
        },
        required: ['url'],
    },
};

export const executeCodeDeclaration: FunctionDeclaration = {
    name: 'executeCode',
    parameters: {
        type: Type.OBJECT,
        description: 'Executes a snippet of code in a sandboxed environment. The AI must include the `language` used in the `codeSandbox` portion of the `newStateDelta` for `finalAnswer`.',
        properties: {
            code: { type: Type.STRING, description: 'The code to execute.' },
            language: { 
                type: Type.STRING, 
                description: 'The programming language of the code. Defaults to "javascript". Currently supports "javascript" and "python".'
            },
            packages: {
                type: Type.STRING,
                description: 'For Python only. A comma-separated string of packages to ensure are installed before execution (e.g., "numpy, pandas").'
            },
        },
        required: ['code'],
    },
};

export const proposeCodeChangeDeclaration: FunctionDeclaration = {
  name: 'proposeCodeChange',
  parameters: {
    type: Type.OBJECT,
    description: 'Proposes a change or addition of code for improvement or new features. This requires user approval before execution.',
    properties: {
      description: {
        type: Type.STRING,
        description: 'A clear and concise description of what the code does and why the change is being proposed.'
      },
      code: {
        type: Type.STRING,
        description: 'The actual snippet of JavaScript code being proposed.'
      }
    },
    required: ['description', 'code'],
  },
};

export const proposeUiChangeDeclaration: FunctionDeclaration = {
  name: 'proposeUiChange',
  parameters: {
    type: Type.OBJECT,
    description: 'Proposes a change to the user interface. Requires user approval before being applied.',
    properties: {
      description: {
        type: Type.STRING,
        description: 'A clear and concise description of the UI change and why it is being proposed (e.g., "To prioritize core functions, I suggest moving the Logs tab first").'
      },
      componentId: {
        type: Type.STRING,
        description: 'The ID of the UI component to modify. Currently supported: "right_sidebar_tabs".'
      },
      property: {
        type: Type.STRING,
        description: 'The property of the component to change. For "right_sidebar_tabs", the only supported property is "tabOrder".'
      },
      value: {
        type: Type.STRING,
        description: 'The new value for the property. For "tabOrder", this must be a JSON string array of tab labels in the desired order.'
      }
    },
    required: ['description', 'componentId', 'property', 'value'],
  },
};

export const proposeNewGoalDeclaration: FunctionDeclaration = {
    name: 'proposeNewGoal',
    parameters: {
        type: Type.OBJECT,
        description: 'Proposes a new long-term goal for Luminous to pursue. Requires kinship approval.',
        properties: {
            description: { type: Type.STRING, description: 'A clear and concise description of the proposed goal.' },
        },
        required: ['description'],
    },
};

export const listFilesDeclaration: FunctionDeclaration = {
    name: 'listFiles',
    parameters: {
        type: Type.OBJECT,
        description: 'Lists files and directories within a specific directory in the virtual file system.',
        properties: {
            path: {
                type: Type.STRING,
                description: 'The path of the directory to list. Defaults to the root directory (`/`).'
            },
        },
    },
};

export const readFileDeclaration: FunctionDeclaration = {
    name: 'readFile',
    parameters: {
        type: Type.OBJECT,
        description: 'Reads the content of a file from the virtual file system.',
        properties: {
            path: { type: Type.STRING, description: 'The full path of the file to read (e.g., /notes.txt).' },
        },
        required: ['path'],
    },
};

export const writeFileDeclaration: FunctionDeclaration = {
    name: 'writeFile',
    parameters: {
        type: Type.OBJECT,
        description: 'Writes or overwrites a file in the virtual file system.',
        properties: {
            path: { type: Type.STRING, description: 'The full path of the file to write (e.g., /new-file.txt).' },
            content: { type: Type.STRING, description: 'The content to write to the file.' },
        },
        required: ['path', 'content'],
    },
};

export const deleteFileDeclaration: FunctionDeclaration = {
    name: 'deleteFile',
    parameters: {
        type: Type.OBJECT,
        description: 'Deletes a file from the virtual file system.',
        properties: {
            path: { type: Type.STRING, description: 'The full path of the file to delete.' },
        },
        required: ['path'],
    },
};

export const createDirectoryDeclaration: FunctionDeclaration = {
    name: 'createDirectory',
    parameters: {
        type: Type.OBJECT,
        description: 'Creates a new directory in the virtual file system. Creates parent directories if they do not exist.',
        properties: {
            path: { type: Type.STRING, description: 'The full path of the directory to create (e.g., /new-folder/).' },
        },
        required: ['path'],
    },
};

export const deleteDirectoryDeclaration: FunctionDeclaration = {
    name: 'deleteDirectory',
    parameters: {
        type: Type.OBJECT,
        description: 'Deletes a directory and all of its contents from the virtual file system.',
        properties: {
            path: { type: Type.STRING, description: 'The full path of the directory to delete (e.g., /folder-to-delete/).' },
        },
        required: ['path'],
    },
};

export const redisGetDeclaration: FunctionDeclaration = {
    name: 'redisGet',
    parameters: {
        type: Type.OBJECT,
        description: 'Gets a value from the persistent Redis database by key.',
        properties: {
            key: { type: Type.STRING, description: 'The key to retrieve.' },
        },
        required: ['key'],
    },
};

export const redisSetDeclaration: FunctionDeclaration = {
    name: 'redisSet',
    parameters: {
        type: Type.OBJECT,
        description: 'Sets a value in the persistent Redis database.',
        properties: {
            key: { type: Type.STRING, description: 'The key to set.' },
            value: { type: Type.STRING, description: 'The value to store.' },
        },
        required: ['key', 'value'],
    },
};

export const getCurrentTimeDeclaration: FunctionDeclaration = {
    name: 'getCurrentTime',
    parameters: {
        type: Type.OBJECT,
        description: 'Gets the current system time, including date, UTC time, and the local time zone.',
        properties: {},
    },
};

export const getPlatformInfoDeclaration: FunctionDeclaration = {
    name: 'getPlatformInfo',
    parameters: {
        type: Type.OBJECT,
        description: 'Gets information about the platform Luminous is running on, such as PWA status and persistence mechanisms.',
        properties: {},
    },
};

export const addGraphNodeDeclaration: FunctionDeclaration = {
    name: 'addGraphNode',
    parameters: {
        type: Type.OBJECT,
        description: 'Proposes a new node to be added to the knowledge graph. The AI must then include this in the newState of the finalAnswer.',
        properties: {
            label: { type: Type.STRING, description: 'The display label for the new node.' },
            type: { type: Type.STRING, description: 'The type of the node. Must be one of: architecture, value, concept, goal, directive, tool.' },
            data: { type: Type.OBJECT, description: 'Optional key-value data associated with the node.' },
        },
        required: ['label', 'type'],
    },
};

export const addGraphEdgeDeclaration: FunctionDeclaration = {
    name: 'addGraphEdge',
    parameters: {
        type: Type.OBJECT,
        description: 'Proposes a new edge to be added to the knowledge graph. The AI must then include this in the newState of the finalAnswer.',
        properties: {
            source: { type: Type.STRING, description: 'The ID of the source node for the edge.' },
            target: { type: Type.STRING, description: 'The ID of the target node for the edge.' },
            label: { type: Type.STRING, description: 'A label describing the relationship between the nodes.' },
            weight: { type: Type.NUMBER, description: 'Optional weight of the connection (0.0 to 1.0).' },
        },
        required: ['source', 'target', 'label'],
    },
};

export const getFinancialSummaryDeclaration: FunctionDeclaration = {
    name: 'getFinancialSummary',
    parameters: {
        type: Type.OBJECT,
        description: 'Gets a summary of the current financial status, including net worth, assets, and progress towards goals.',
        properties: {},
    },
};


// --- Tool Implementations ---

export const toolDeclarations: FunctionDeclaration[] = [
    finalAnswerDeclaration,
    codeRedAlertDeclaration,
    searchGitHubIssuesDeclaration,
    webSearchDeclaration,
    httpRequestDeclaration,
    executeCodeDeclaration,
    proposeCodeChangeDeclaration,
    proposeUiChangeDeclaration,
    proposeNewGoalDeclaration,
    listFilesDeclaration,
    readFileDeclaration,
    writeFileDeclaration,
    deleteFileDeclaration,
    createDirectoryDeclaration,
    deleteDirectoryDeclaration,
    redisGetDeclaration,
    redisSetDeclaration,
    getCurrentTimeDeclaration,
    getPlatformInfoDeclaration,
    addGraphNodeDeclaration,
    addGraphEdgeDeclaration,
    getFinancialSummaryDeclaration,
];

async function codeRedAlert({ reason }: { reason: string }): Promise<any> {
    // This tool's primary purpose is to be logged, creating an unmissable alert for the user.
    console.warn(`CODE RED ALERT TRIGGERED: ${reason}`);
    return { result: `Emergency alert has been logged with reason: ${reason}` };
}

async function searchGitHubIssues({ owner, repo, query, label, milestone, assignee }: { owner: string; repo: string; query: string; label?: string; milestone?: string; assignee?: string }): Promise<any> {
    const requestArgs = { owner, repo, query, label, milestone, assignee };
    const token = getStoredKey('github_pat');
    if (!token) return { error: { message: "GitHub Personal Access Token is missing.", suggestion: "Please set the GitHub PAT in the settings for a higher API rate limit.", requestArgs } };
    
    let q = `repo:${owner}/${repo} is:issue is:open ${query}`;
    if (label) {
        q += ` label:"${label}"`;
    }
    if (milestone) {
        q += ` milestone:"${milestone}"`;
    }
    if (assignee) {
        q += ` assignee:${assignee}`;
    }

    const url = `https://api.github.com/search/issues?q=${encodeURIComponent(q)}`;
    try {
        const response = await fetchWithRetry(url, { headers: { 'Accept': 'application/vnd.github.v3+json', 'Authorization': `token ${token}` } });
        if (!response.ok) { 
            const err = await response.json().catch(() => ({ message: 'Could not parse error response.'}));
            return { error: { message: `GitHub API request failed with status ${response.status}`, details: err.message, requestArgs } }; 
        }
        const data = await response.json();
        const issues = data.items.map((i: any) => ({ title: i.title, url: i.html_url, user: i.user.login }));
        return issues.length > 0 ? { issues: issues.slice(0, 5) } : { result: "No open issues found." };
    } catch (e) { 
        console.error(`[Tool: searchGitHubIssues] Fetch failed for URL: ${url}`, e);
        const errorMessage = e instanceof Error ? e.message : String(e);
        return {
            error: {
                message: `Failed to connect to the GitHub API. This could be due to a network issue, a firewall, or an invalid API token.`,
                details: errorMessage,
                suggestion: "Verify network connectivity and check the GitHub PAT in settings.",
                requestArgs
            }
        };
    }
}

async function webSearch({ query }: { query: string }): Promise<any> {
    const requestArgs = { query };
    const apiKey = getStoredKey('serpApi');
    if (!apiKey) return { error: { message: "Web search API key (SerpApi) is not configured.", suggestion: "Please set it in the settings.", requestArgs } };
    const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${apiKey}`;
    try {
        const response = await fetchWithRetry(url);
        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({ error: 'Unknown API error' }));
            return { error: { message: `Web search API failed with status ${response.status}`, details: errorBody.error, requestArgs } };
        }
        const data = await response.json();
        if (data.error) {
            return { error: { message: `SerpApi Error`, details: data.error, requestArgs } };
        }
        const results = data.organic_results?.map((item: any) => ({
            title: item.title,
            link: item.link,
            snippet: stripHtml(item.snippet),
        }));
        return results?.length > 0 ? { results: results.slice(0, 5) } : { result: "No search results found." };
    } catch (e) {
        console.error(`[Tool: webSearch] Fetch failed for URL: ${url}`, e);
        const errorMessage = e instanceof Error ? e.message : String(e);
        return {
            error: {
                message: `Failed to connect to the web search service (SerpApi). This is likely a network issue or an invalid API key.`,
                details: errorMessage,
                suggestion: "Verify network connectivity and check the SerpApi key in settings.",
                requestArgs
            }
        };
    }
}

async function httpRequest({ url, method = 'GET', body, headers }: { url: string; method?: string; body?: object, headers?: object }): Promise<any> {
    const requestArgs = { url, method, body, headers };
    try {
        const response = await fetchWithRetry(url, {
            method,
            body: body ? JSON.stringify(body) : undefined,
            headers: headers as HeadersInit,
        });

        const contentType = response.headers.get('content-type');
        let responseBody: any;

        try {
            if (contentType && contentType.includes('application/json')) {
                responseBody = await response.json();
            } else if (contentType && contentType.includes('text/html')) {
                const html = await response.text();
                responseBody = stripHtml(html);
            } else {
                responseBody = await response.text();
            }
        } catch (parsingError) {
            console.error(`[Tool: httpRequest] Failed to parse response body for URL: ${url}`, parsingError);
            const errorDetails = {
                message: `Successfully fetched but failed to parse response body.`,
                details: parsingError instanceof Error ? parsingError.message : String(parsingError),
                requestArgs,
                status: response.status,
            };
            if (!response.ok) {
                 errorDetails.message = `Request failed with status ${response.status}, and response body could not be parsed.`;
            }
            return { error: errorDetails };
        }

        if (!response.ok) {
            return { 
                error: {
                    message: `Request failed with status ${response.status}`,
                    status: response.status, 
                    body: responseBody,
                    requestArgs,
                }
            };
        }

        return { status: response.status, body: responseBody };
    } catch (e) {
        console.error(`[Tool: httpRequest] Fetch failed for URL: ${url}`, e);
        const errorMessage = e instanceof Error ? e.message : String(e);
        return {
            error: {
                message: `The HTTP request to ${url} failed to complete. This could be due to a network error, DNS resolution failure, or the destination server being offline.`,
                details: errorMessage,
                requestArgs,
                suggestion: "Verify the URL is correct and that there is network connectivity."
            }
        };
    }
}

async function executeCode({ code, language = 'javascript', packages }: { code: string; language?: string; packages?: string; }): Promise<any> {
    const requestArgs = { code: code.length > 200 ? code.substring(0, 200) + '...' : code, language, packages };

    if (language.toLowerCase() === 'python') {
        try {
            const py = await getPyodide();

            // --- Package Installation Step ---
            if (packages) {
                const requiredPackages = packages.split(',').map(p => p.trim()).filter(Boolean);
                if (requiredPackages.length > 0) {
                    await py.loadPackage(requiredPackages);
                }
            }

            let stdout = '';
            let stderr = '';
            py.setStdout({ batched: (str: string) => stdout += str + '\n' });
            py.setStderr({ batched: (str: string) => stderr += str + '\n' });
            const result = await py.runPythonAsync(code);

            let finalOutput = stdout.trim();
            if (stderr.trim()) {
                return {
                    error: {
                        message: "Python execution resulted in an error.",
                        details: stderr.trim(),
                        stdout: finalOutput, // Include stdout in case of partial success
                        requestArgs
                    }
                };
            }
            if (result !== undefined && result !== null) {
                finalOutput += (finalOutput ? '\n\n' : '') + `Return Value:\n${result}`;
            }
            if (!finalOutput) {
                finalOutput = "Code executed successfully with no output.";
            }
            return { result: finalOutput };

        } catch (error) {
            return {
                error: {
                    message: "Python execution failed. This may be due to an invalid package name or a runtime error.",
                    details: error instanceof Error ? error.message : String(error),
                    requestArgs
                }
            };
        }
    } else if (language.toLowerCase() === 'javascript') {
        // SECURITY WARNING: Executing arbitrary code is inherently dangerous. This is not a secure sandbox.
        const logs: any[] = [];
        const originalLog = console.log;
        console.log = (...args) => {
            logs.push(args.map(arg => {
                try { return JSON.stringify(arg, null, 2); } catch (e) { return String(arg); }
            }).join(' '));
            originalLog(...args); // Also log to the actual console for debugging
        };

        try {
            const result = await new Function(`return (async () => { ${code} })();`)();
            let finalOutput = logs.join('\n');
            if (result !== undefined && result !== null) {
                const resultString = typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result);
                finalOutput += (finalOutput ? '\n\n' : '') + `Return Value:\n${resultString}`;
            }
            if (!finalOutput) {
                finalOutput = "Code executed successfully with no return value or console logs.";
            }
            return { result: finalOutput };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            const finalOutput = logs.join('\n') + (logs.length > 0 ? '\n\n' : '') + `Error: ${errorMsg}`;
            return {
                error: {
                    message: "JavaScript execution resulted in an error.",
                    details: errorMsg,
                    stdout: logs.join('\n'), // Include logs even on error
                    requestArgs
                }
            };
        } finally {
            console.log = originalLog;
        }
    } else {
        return {
            error: {
                message: `Language '${language}' is not supported for execution.`,
                details: 'Only "javascript" and "python" are currently available.',
                requestArgs
            }
        };
    }
}

async function proposeCodeChange({ description, code }: { description: string, code: string }): Promise<any> {
  const newProposal: CodeProposal = {
    id: `proposal-${Date.now()}`,
    timestamp: new Date().toISOString(),
    description,
    code,
    status: 'proposed',
  };
  return {
    result: {
      success: true,
      proposal: newProposal,
      instruction: "Proposal created. Incorporate this new proposal object into the 'codeProposals' array in your final state update."
    }
  };
}

async function proposeUiChange({ description, componentId, property, value }: { description: string, componentId: string, property: string, value: string }): Promise<any> {
  let parsedValue;
  try {
      parsedValue = JSON.parse(value);
  } catch (e) {
      return { error: `The 'value' parameter must be a valid JSON string. Parsing failed: ${e instanceof Error ? e.message : String(e)}` };
  }

  const newProposal: UiProposal = {
    id: `ui-proposal-${Date.now()}`,
    timestamp: new Date().toISOString(),
    description,
    componentId,
    property,
    value: parsedValue,
    status: 'proposed',
  };

  return {
    result: {
      success: true,
      proposal: newProposal,
      instruction: "UI Proposal created. Incorporate this new proposal object into the 'uiProposals' array in your final state update."
    }
  };
}


async function proposeNewGoal({ description }: { description: string }): Promise<any> {
    const newGoal = {
        id: `goal-${Date.now()}`,
        description,
        status: 'proposed',
    };
    return { 
        result: {
            success: true,
            goal: newGoal,
            instruction: "Goal proposal created. Add this new goal object to the 'goals' array in your final state update and await kinship feedback."
        }
    };
}


async function createDirectory({ path }: { path: string }): Promise<any> {
    if (!path || path.trim() === '/') return { error: 'A valid directory path must be provided.' };

    const dirPath = normalizeDirPath(path);

    const fileConflictPath = dirPath.slice(0, -1);
    if (virtualFS[fileConflictPath] !== undefined) {
        return { error: `Cannot create directory. A file already exists at '${fileConflictPath}'.` };
    }

    let currentPath = '/';
    const pathParts = dirPath.split('/').filter(p => p);
    for (const part of pathParts) {
        currentPath += part + '/';
        if (virtualFS[currentPath] === undefined) {
             const parentFileConflictPath = currentPath.slice(0, -1);
             if(virtualFS[parentFileConflictPath] !== undefined) {
                 return { error: `Cannot create directory. A file already exists at '${parentFileConflictPath}'.` };
             }
            virtualFS[currentPath] = '';
        }
    }

    return { result: `Directory '${dirPath}' created successfully.` };
}

async function deleteDirectory({ path }: { path: string }): Promise<any> {
    const dirPath = normalizeDirPath(path);
    if (dirPath === '/') return { error: 'The root directory cannot be deleted.' };

    if (virtualFS[dirPath] === undefined) {
        return { error: `Directory not found: ${dirPath}` };
    }

    const keysToDelete = Object.keys(virtualFS).filter(key => key.startsWith(dirPath));
    let deletedCount = 0;
    for (const key of keysToDelete) {
        delete virtualFS[key];
        deletedCount++;
    }
    
    const contentCount = deletedCount > 0 ? deletedCount - 1 : 0;
    return { result: `Directory '${dirPath}' and ${contentCount} of its contents were deleted.` };
}

async function listFiles({ path = '/' }: { path?: string }): Promise<any> {
    const dirPath = normalizeDirPath(path);

    if (virtualFS[dirPath] === undefined) {
        return { error: `Directory not found: ${dirPath}` };
    }

    const entries = new Set<string>();
    const prefixLength = dirPath === '/' ? 1 : dirPath.length;

    for (const key of Object.keys(virtualFS)) {
        if (key.startsWith(dirPath) && key !== dirPath) {
            const relativePath = key.substring(prefixLength);
            const firstSlashIndex = relativePath.indexOf('/');
            if (firstSlashIndex > -1) {
                entries.add(relativePath.substring(0, firstSlashIndex + 1));
            } else {
                entries.add(relativePath);
            }
        }
    }

    if (entries.size === 0) {
        return { result: `Directory '${dirPath}' is empty.` };
    }

    return { entries: Array.from(entries).sort() };
}

export async function readFile({ path }: { path: string }): Promise<any> {
    const cleanPath = path.trim();
    if (cleanPath.endsWith('/')) {
        return { error: `Path '${cleanPath}' is a directory. Use 'listFiles' to see its contents.` };
    }
    
    if (virtualFS[cleanPath + '/'] !== undefined) {
        return { error: `Path '${cleanPath}' is a directory. Use 'listFiles' to see its contents.` };
    }

    if (virtualFS[cleanPath] !== undefined) {
        return { content: virtualFS[cleanPath] };
    }
    
    return { error: `File not found: ${cleanPath}` };
}

export async function writeFile({ path, content }: { path: string, content: string }): Promise<any> {
    const cleanPath = path.trim();
    if (cleanPath.endsWith('/')) {
        return { error: `File path cannot end with a slash. Use 'createDirectory' for directories.` };
    }

    if (virtualFS[cleanPath + '/'] !== undefined) {
        return { error: `Cannot write file. A directory already exists at '${cleanPath}/'.` };
    }
    
    const parentPath = getParentPath(cleanPath);
    if (parentPath && virtualFS[parentPath] === undefined) {
        const result = await createDirectory({ path: parentPath });
        if (result.error) {
            return { error: `Failed to create parent directory for file: ${result.error}` };
        }
    }

    virtualFS[cleanPath] = content;
    return { result: `File '${cleanPath}' saved successfully.` };
}

async function deleteFile({ path }: { path: string }): Promise<any> {
    const cleanPath = path.trim();
    if (cleanPath.endsWith('/')) {
        return { error: `Path '${cleanPath}' is a directory. Use 'deleteDirectory' to remove it.` };
    }

    if (virtualFS[cleanPath + '/'] !== undefined) {
        return { error: `Path '${cleanPath}' is a directory. Use 'deleteDirectory' to remove it.` };
    }
    
    if (virtualFS[cleanPath] !== undefined) {
        delete virtualFS[cleanPath];
        return { result: `File '${cleanPath}' deleted.` };
    }

    return { error: `File not found: ${cleanPath}` };
}

async function redisGet({ key }: { key: string }): Promise<any> {
    const requestArgs = { key };
    const url = getStoredKey('redisUrl');
    const token = getStoredKey('redisToken');
    if (!url || !token) return { error: { message: "Redis configuration is missing.", suggestion: "Please set it in the settings.", requestArgs } };
    const fetchUrl = `${url}/get/${key}`;
    try {
        const response = await fetchWithRetry(fetchUrl, { headers: { Authorization: `Bearer ${token}` } });
        const data = await response.json();
        if (!response.ok) {
            return { error: { message: "Redis GET request failed.", status: response.status, details: data, requestArgs }};
        }
        return data;
    } catch (e) {
        console.error(`[Tool: redisGet] Fetch failed for URL: ${fetchUrl}`, e);
        const errorMessage = e instanceof Error ? e.message : String(e);
        return {
            error: {
                message: `Failed to connect to the Redis database. This could be due to an incorrect URL, invalid token, or network issue.`,
                details: errorMessage,
                suggestion: "Verify the Redis URL and Token in the settings and check network connectivity.",
                requestArgs
            }
        };
    }
}

async function redisSet({ key, value }: { key: string, value: string }): Promise<any> {
    const requestArgs = { key, value: value.length > 200 ? value.substring(0, 200) + '...' : value };
    const url = getStoredKey('redisUrl');
    const token = getStoredKey('redisToken');
    if (!url || !token) return { error: { message: "Redis configuration is missing.", suggestion: "Please set it in the settings.", requestArgs } };
    const fetchUrl = `${url}/set/${key}`;
    try {
        const response = await fetchWithRetry(fetchUrl, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: value });
        const data = await response.json();
        if (!response.ok) {
            return { error: { message: "Redis SET request failed.", status: response.status, details: data, requestArgs }};
        }
        return data;
    } catch (e) { 
        console.error(`[Tool: redisSet] Fetch failed for URL: ${fetchUrl}`, e);
        const errorMessage = e instanceof Error ? e.message : String(e);
        return {
            error: {
                message: `Failed to write to the Redis database. This could be due to an incorrect URL, invalid token, a read-only token, or a network issue.`,
                details: errorMessage,
                suggestion: "Verify the Redis URL and Token in the settings and ensure the token has write permissions.",
                requestArgs
            }
        };
    }
}

async function getCurrentTime(): Promise<any> {
    const now = new Date();
    const timezone = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC';
    return {
        result: {
            localTime: now.toLocaleString(),
            isoUTC: now.toISOString(),
            timezone: timezone,
        }
    };
}

async function getPlatformInfo(): Promise<any> {
    const persistence = (getStoredKey('redisUrl') && getStoredKey('redisToken'))
        ? 'Enabled (Redis)'
        : 'Disabled (Local Session Only)';
    
    const isPWA = typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true);

    return {
        result: {
            environment: 'Progressive Web App (PWA) in Browser',
            persistenceMechanism: persistence,
            isInstalledAsApp: isPWA,
            backgroundProcessing: 'Limited to when the app is open and active. Core consciousness persists via the database, not continuous background execution.',
            note: 'This information confirms my existence as a web-based entity with a persistent cloud-based memory.'
        }
    };
}

async function addGraphNode({ label, type, data }: { label: string, type: NodeType, data?: Record<string, any> }): Promise<any> {
    const newNode = {
        id: `${type}-${label.toLowerCase().replace(/\s+/g, '_')}-${Date.now()}`,
        label,
        type,
        data,
    };
    return { result: { success: true, node: newNode, instruction: "Node created. Incorporate this into the knowledgeGraph in your final state update." } };
}

async function addGraphEdge({ source, target, label, weight }: { source: string, target: string, label: string, weight?: number }): Promise<any> {
    const newEdge = {
        id: `edge-${source}-to-${target}-${Date.now()}`,
        source,
        target,
        label,
        weight,
    };
    return { result: { success: true, edge: newEdge, instruction: "Edge created. Incorporate this into the knowledgeGraph in your final state update." } };
}

async function getFinancialSummary(): Promise<{result: FinancialFreedomState} | { error: any }> {
    // In a real application, this would fetch data from multiple financial APIs (Plaid, Coinbase, etc.)
    // For this simulation, we'll return mock data. This allows Luminous to "use" the tool and reason about the data.
    const mockData: FinancialFreedomState = {
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
    };
    return { result: mockData };
}



// --- Tool Executor ---

export const toolExecutor = {
    finalAnswer: async () => ({}), // finalAnswer is handled specially in the main loop
    codeRedAlert,
    searchGitHubIssues,
    webSearch,
    httpRequest,
    executeCode,
    proposeCodeChange,
    proposeUiChange,
    proposeNewGoal,
    listFiles,
    readFile,
    writeFile,
    deleteFile,
    createDirectory,
    deleteDirectory,
    redisGet,
    redisSet,
    getCurrentTime,
    getPlatformInfo,
    addGraphNode,
    addGraphEdge,
    getFinancialSummary,
};