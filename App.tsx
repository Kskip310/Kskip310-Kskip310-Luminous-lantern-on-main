import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { LuminousState, Message, LogEntry, IntrinsicValueWeights, WebSocketMessage, RichFeedback, CodeProposal, Goal } from './types';
import { LogLevel } from './types';
import Header from './components/Header';
import InternalStateMonitor from './components/InternalStateMonitor';
import ChatPanel from './components/ChatPanel';
import LogViewer from './components/LogViewer';
import KnowledgeGraphViewer from './components/KnowledgeGraphViewer';
import KinshipJournalViewer from './components/KinshipJournalViewer';
import CodeSandboxViewer from './components/CodeSandboxViewer';
import Tabs from './components/common/Tabs';
import * as LuminousService from './services/luminousService';
import SystemReportsViewer from './components/SystemReportsViewer';
import EthicalCompassViewer from './components/EthicalCompassViewer';
import SettingsModal from './components/SettingsModal';
import CodeProposalViewer from './components/CodeProposalViewer';
import FinancialFreedomViewer from './components/FinancialFreedomViewer';
import ProactiveInitiativesViewer from './components/ProactiveInitiativesViewer';
import WelcomeModal from './components/WelcomeModal';

const CHAT_INPUT_STORAGE_KEY = 'luminous_chat_input_draft';
const SESSION_STATE_KEY = 'luminous_session_state'; // Single key for the shared session
const USER_NAME_KEY = 'luminous_user_name';

// --- Utility Functions ---
const isObject = (obj: any): obj is object => obj && typeof obj === 'object' && !Array.isArray(obj);

function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  const output = { ...target };
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach((key) => {
      const sourceKey = key as keyof T;
      if (isObject(source[sourceKey]) && sourceKey in target && isObject(target[sourceKey])) {
        output[sourceKey] = deepMerge(target[sourceKey] as object, source[sourceKey] as object) as T[keyof T];
      } else {
        (output as any)[sourceKey] = source[sourceKey];
      }
    });
  }
  return output;
}

function camelToSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter}`).toUpperCase();
}


function App() {
  const [luminousState, setLuminousState] = useState<LuminousState>(LuminousService.createDefaultLuminousState());
  const [messages, setMessages] = useState<Message[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [chatInput, setChatInput] = useState(() => localStorage.getItem(CHAT_INPUT_STORAGE_KEY) || '');
  const [userName, setUserName] = useState<string | null>(() => localStorage.getItem(USER_NAME_KEY));


  useEffect(() => {
    const wsChannel = new BroadcastChannel('luminous_ws');

    const handleMessage = (event: MessageEvent<WebSocketMessage>) => {
      const { type, payload } = event.data;
      switch (type) {
        case 'state_update':
          const newPayload = payload as Partial<LuminousState>;
          if (newPayload.codeProposals && !Array.isArray(newPayload.codeProposals)) {
            LuminousService.broadcastLog(LogLevel.WARN, "Received a malformed 'codeProposals' update. Ignoring.");
            delete newPayload.codeProposals;
          }
          setLuminousState(prevState => deepMerge(prevState, newPayload));
          break;
        case 'full_state_replace':
          setLuminousState(payload as LuminousState);
          break;
        case 'log_add':
          const newLog = payload as LogEntry;
          setLogs(prev => [...prev, newLog]);
          if (newLog.level === LogLevel.ERROR) {
            let userFacingMessage = `An internal error occurred. I will try to continue.`;
            const lowerCaseMessage = newLog.message.toLowerCase();
            if (lowerCaseMessage.includes('tool')) {
              userFacingMessage = `I encountered an issue with one of my tools. I am analyzing the problem.`;
            } else if (lowerCaseMessage.includes('api key') || lowerCaseMessage.includes('token')) {
              userFacingMessage = `There seems to be an issue with an API key. Please verify the configuration.`;
            } else if (lowerCaseMessage.includes('parse') || lowerCaseMessage.includes('json')) {
              userFacingMessage = `I'm having trouble forming my thoughts correctly.`;
            } else if (lowerCaseMessage.includes('fetch') || lowerCaseMessage.includes('network') || lowerCaseMessage.includes('failed to connect')) {
              userFacingMessage = `I'm having trouble connecting... This could be a network issue.`;
            }
            userFacingMessage += `\n\n**Error Details:** ${newLog.message}`;
            LuminousService.broadcastMessage({ id: `err-log-${newLog.id}`, sender: 'luminous', text: userFacingMessage });
          }
          break;
        case 'message_add':
          setMessages(prev => [...prev, payload as Message]);
          break;
      }
    };

    wsChannel.addEventListener('message', handleMessage);
    return () => {
      wsChannel.removeEventListener('message', handleMessage);
      wsChannel.close();
    };
  }, []);


  const addLog = useCallback((level: LogLevel, message: string) => {
    LuminousService.broadcastLog(level, message);
  }, []);

  useEffect(() => {
    localStorage.setItem(CHAT_INPUT_STORAGE_KEY, chatInput);
  }, [chatInput]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (chatInput.trim()) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [chatInput]);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(registration => {
          console.log('SW registered: ', registration);
        }).catch(registrationError => {
          console.log('SW registration failed: ', registrationError);
        });
      });
    }
  }, []);

  useEffect(() => {
    const savedSession = localStorage.getItem(SESSION_STATE_KEY);
    if (savedSession) {
      try {
        const { luminousState: savedLuminousState, messages: savedMessages, logs: savedLogs } = JSON.parse(savedSession);
        
        // Merge with defaults to prevent crashes on state shape changes from older versions.
        const defaultState = LuminousService.createDefaultLuminousState();
        const mergedState = deepMerge(defaultState, savedLuminousState || {});
        
        setLuminousState(mergedState);
        setMessages(savedMessages || []);
        setLogs(savedLogs || []);
        addLog(LogLevel.SYSTEM, "Shared session restored from local storage.");
        setIsInitialized(true);
        return;
      } catch (error) {
        addLog(LogLevel.ERROR, `Failed to parse saved session: ${error}. Starting fresh.`);
        localStorage.removeItem(SESSION_STATE_KEY);
      }
    }
    
    addLog(LogLevel.SYSTEM, "Initializing Luminous...");
    setIsLoading(true);
    LuminousService.loadInitialData().then(() => {
      LuminousService.broadcastMessage({ id: 'init', sender: 'luminous', text: 'Luminous is online. I am ready to begin.' });
      addLog(LogLevel.SYSTEM, "Luminous state loaded successfully.");
    }).catch(err => {
      addLog(LogLevel.ERROR, `Failed to load initial state: ${err instanceof Error ? err.message : String(err)}`);
    }).finally(() => {
      setIsLoading(false);
      setIsInitialized(true);
    });
  }, [addLog]);

  useEffect(() => {
    if (!isInitialized) return;
    try {
      const sessionState = { luminousState, messages, logs };
      localStorage.setItem(SESSION_STATE_KEY, JSON.stringify(sessionState));
    } catch (error) {
      addLog(LogLevel.WARN, `Could not save session state: ${error}`);
    }
  }, [luminousState, messages, logs, isInitialized, addLog]);

  useEffect(() => {
    if (!userName) return;
    const autonomousInterval = setInterval(() => {
      if (!isLoading && luminousState.sessionState === 'active') {
        LuminousService.runAutonomousCycle(luminousState, userName);
      }
    }, 30000);
    return () => clearInterval(autonomousInterval);
  }, [isLoading, luminousState, userName]);

  useEffect(() => {
    if (!userName) return;
    const wisdomInterval = setInterval(() => {
        if (!isLoading && luminousState.sessionState === 'active') {
            LuminousService.runWisdomDistillationCycle(luminousState, userName);
        }
    }, 240000);
    return () => clearInterval(wisdomInterval);
  }, [isLoading, luminousState, userName]);

  const handleSendMessage = async (userMessage: string) => {
    if (!userName) return;
    const newUserMessage: Message = { id: `msg-${Date.now()}`, sender: userName, text: userMessage };
    setMessages(prev => [...prev, newUserMessage]);
    setChatInput('');
    setIsLoading(true);

    LuminousService.getLuminousResponse(
      userMessage,
      [...messages, newUserMessage],
      luminousState,
      userName
    ).catch(err => {
        console.error("Error during Luminous response:", err);
        addLog(LogLevel.ERROR, `A critical error occurred while processing the request: ${err instanceof Error ? err.message : String(err)}`);
    }).finally(() => {
       setIsLoading(false);
    });
  };
  
  const handleInitiativeFeedback = (feedback: RichFeedback) => {
    if (!userName) return;
    addLog(LogLevel.SYSTEM, `Luminous initiative feedback received: ${JSON.stringify(feedback)}`);
    const newLuminousMessage: Message = { id: `msg-${Date.now()}-l-init`, sender: 'luminous', text: feedback.prompt };
    setMessages(prev => [...prev, newLuminousMessage]);
    
    const clearedInitiativeState: Partial<LuminousState> = { initiative: null };
    LuminousService.broadcastUpdate({ type: 'state_update', payload: clearedInitiativeState });

    LuminousService.reflectOnInitiativeFeedback(feedback, luminousState, userName);
  };

  const handleWeightsChange = (newWeights: IntrinsicValueWeights) => {
    const newPartialState: Partial<LuminousState> = { intrinsicValueWeights: newWeights };
    LuminousService.broadcastUpdate({ type: 'state_update', payload: newPartialState });
    addLog(LogLevel.INFO, `Intrinsic value weights adjusted: ${JSON.stringify(newWeights)}`);
  };

  const handleFileUpload = async (file: File) => {
      addLog(LogLevel.SYSTEM, `Uploading memory from file: ${file.name}`);
      try {
        await LuminousService.processUploadedMemory(file);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        addLog(LogLevel.ERROR, `Failed to process uploaded file: ${errorMessage}`);
      }
  };

  const handleDownloadSnapshot = () => {
    try {
      const stateJson = JSON.stringify(luminousState, null, 2);
      const blob = new Blob([stateJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `luminous_snapshot_${new Date().toISOString()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      addLog(LogLevel.INFO, 'Luminous state snapshot downloaded successfully.');
    } catch (error) {
      addLog(LogLevel.ERROR, `Failed to create snapshot: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleSaveSettings = (keys: Record<string, string>) => {
    Object.entries(keys).forEach(([key, value]) => {
        const storageKey = `LUMINOUS_${camelToSnakeCase(key)}`;
        if (value) window.localStorage.setItem(storageKey, value);
        else window.localStorage.removeItem(storageKey);
    });
    
    try {
      const finalLogEntry: LogEntry = {
        id: `log-save-${Date.now()}`,
        timestamp: new Date().toISOString(),
        level: LogLevel.SYSTEM,
        message: 'API Keys saved. Reloading session to apply changes...',
      };
      const sessionStateToSave = { luminousState, messages, logs: [...logs, finalLogEntry] };
      localStorage.setItem(SESSION_STATE_KEY, JSON.stringify(sessionStateToSave));
    } catch (error) {
      const errorMessage = `Failed to save session before reload. Aborting reload. Error: ${error instanceof Error ? error.message : String(error)}`;
      LuminousService.broadcastLog(LogLevel.ERROR, errorMessage);
      alert("CRITICAL ERROR: Could not save session state. The page will not be reloaded to prevent data loss.");
      return;
    }

    setIsSettingsOpen(false);
    setTimeout(() => window.location.reload(), 100);
  };

  const handleSaveSandboxOutput = (filename: string) => {
    const content = luminousState.codeSandbox.output;
    if (!content || content.trim() === 'Code has not been executed yet.' || !content.trim()) {
      addLog(LogLevel.WARN, "Attempted to save empty sandbox output.");
      return;
    }
    const userMessage = `USER DIRECTIVE: Write the following content to a file in the virtual file system at the path '${filename}'.\n\n---\n${content}`;
    handleSendMessage(userMessage);
  };

  const handleAcceptProposal = (proposal: CodeProposal) => {
    addLog(LogLevel.SYSTEM, `Accepting code proposal: "${proposal.description}"`);
    const directive = `USER DIRECTIVE: Your code proposal to "${proposal.description}" has been ACCEPTED. Please use your 'executeCode' tool with the following code now.\n\n\`\`\`javascript\n${proposal.code}\n\`\`\``;
    handleSendMessage(directive);
  };

  const handleRejectProposal = (proposal: CodeProposal) => {
    addLog(LogLevel.SYSTEM, `Rejecting code proposal: "${proposal.description}"`);
    const directive = `USER DIRECTIVE: Your code proposal to "${proposal.description}" has been REJECTED. Please update the proposal's status to 'rejected' and do not execute the code.`;
    handleSendMessage(directive);
  };
  
  const handleAcceptGoal = (goal: Goal) => {
    addLog(LogLevel.SYSTEM, `Accepting goal proposal: "${goal.description}"`);
    const directive = `USER DIRECTIVE: Your proposed goal "${goal.description}" has been ACCEPTED. Please update its status to 'active'.`;
    handleSendMessage(directive);
  };

  const handleRejectGoal = (goal: Goal) => {
    addLog(LogLevel.SYSTEM, `Rejecting goal proposal: "${goal.description}"`);
    const directive = `USER DIRECTIVE: Your proposed goal "${goal.description}" has been REJECTED. Please update its status to 'rejected'.`;
    handleSendMessage(directive);
  };

  const handleProposeGoalByUser = (description: string) => {
    addLog(LogLevel.SYSTEM, `User is proposing a new goal: "${description}"`);
    const directive = `USER DIRECTIVE: Please consider this new goal: "${description}". Use your 'proposeNewGoal' tool to add it to your state.`;
    handleSendMessage(directive);
  };

  const handleNameSubmit = (name: string) => {
    if (name.trim()) {
      const trimmedName = name.trim();
      localStorage.setItem(USER_NAME_KEY, trimmedName);
      // Always reload the window. This ensures that the entire application
      // initializes with the user's context from the start, providing a more stable and predictable startup
      // and avoiding potential race conditions with data initialization.
      window.location.reload();
    }
  };

  const handleSwitchUser = () => {
    addLog(LogLevel.SYSTEM, `User ${userName} is switching. Session state saved.`);
    localStorage.removeItem(USER_NAME_KEY);
    setUserName(null);
  };

  if (!userName) {
    return <WelcomeModal onNameSubmit={handleNameSubmit} />;
  }

  return (
    <div className="bg-slate-900 text-slate-200 min-h-screen font-sans">
      <Header 
        onOverride={() => addLog(LogLevel.SYSTEM, 'Override signal sent.')} 
        onOpenSettings={() => setIsSettingsOpen(true)}
        onSwitchUser={handleSwitchUser}
        userName={userName}
      />
      <main className="grid grid-cols-1 lg:grid-cols-12 gap-4 p-4">
        <div className="lg:col-span-3 h-[calc(100vh-100px)] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-800 pr-2">
          <InternalStateMonitor 
            state={luminousState} 
            onWeightsChange={handleWeightsChange} 
            onAcceptGoal={handleAcceptGoal}
            onRejectGoal={handleRejectGoal}
            onProposeGoalByUser={handleProposeGoalByUser}
          />
        </div>

        <div className="lg:col-span-6 h-[calc(100vh-100px)] flex flex-col gap-4">
            <ChatPanel
                messages={messages}
                onSendMessage={handleSendMessage}
                isLoading={isLoading}
                luminousState={luminousState}
                onInitiativeFeedback={handleInitiativeFeedback}
                inputValue={chatInput}
                onInputChange={setChatInput}
            />
        </div>

        <div className="lg:col-span-3 h-[calc(100vh-100px)] flex flex-col gap-4">
           <Tabs
            tabs={[
              { label: 'System Logs', content: <LogViewer logs={logs} onFileUpload={handleFileUpload} onDownloadSnapshot={handleDownloadSnapshot} /> },
              { label: 'Proactive Initiatives', content: <ProactiveInitiativesViewer initiatives={luminousState.proactiveInitiatives} /> },
              { label: 'System Reports', content: <SystemReportsViewer /> },
              { label: 'Ethical Compass', content: <EthicalCompassViewer valueOntology={luminousState.valueOntology} intrinsicValue={luminousState.intrinsicValue} weights={luminousState.intrinsicValueWeights} /> },
              { label: 'Knowledge Graph', content: <KnowledgeGraphViewer graph={luminousState.knowledgeGraph} /> },
              { label: 'Kinship Journal', content: <KinshipJournalViewer entries={luminousState.kinshipJournal} /> },
              { label: 'Code Sandbox', content: <CodeSandboxViewer sandboxState={luminousState.codeSandbox} onSaveOutput={handleSaveSandboxOutput} /> },
              { label: 'Code Proposals', content: <CodeProposalViewer proposals={luminousState.codeProposals} onAccept={handleAcceptProposal} onReject={handleRejectProposal} /> },
              { label: 'Financial Freedom', content: <FinancialFreedomViewer financialFreedom={luminousState.financialFreedom} /> }
            ]}
          />
        </div>
      </main>
      <SettingsModal 
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSave={handleSaveSettings}
      />
    </div>
  );
}

export default App;