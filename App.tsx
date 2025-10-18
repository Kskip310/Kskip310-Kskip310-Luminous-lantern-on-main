
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { LuminousState, Message, LogEntry, IntrinsicValueWeights, WebSocketMessage, RichFeedback, CodeProposal, Goal, UiProposal, GlobalWorkspaceItem } from './types';
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
import * as DBService from './services/dbService';
import SystemReportsViewer from './components/SystemReportsViewer';
import EthicalCompassViewer from './components/EthicalCompassViewer';
import SettingsModal from './components/SettingsModal';
import CodeProposalViewer from './components/CodeProposalViewer';
import UiProposalViewer from './components/UiProposalViewer';
import FinancialFreedomViewer from './components/FinancialFreedomViewer';
import ProactiveInitiativesViewer from './components/ProactiveInitiativesViewer';
import WelcomeModal from './components/WelcomeModal';
import CoreMemoryViewer from './components/CoreMemoryViewer';
import { deepMerge } from './services/utils';
// FIX: Import broadcast functions from the correct service file.
import { broadcastLog, broadcastMessage, broadcastUpdate } from './services/broadcastService';

const CHAT_INPUT_STORAGE_KEY = 'luminous_chat_input_draft';
const USER_NAME_KEY = 'luminous_user_name';

// --- State Keys for IndexedDB ---
const DB_STATE_KEY = 'luminousState';
const DB_MESSAGES_KEY = 'messages';
const DB_LOGS_KEY = 'logs';
const SESSION_DATA_STORE = 'session_data';

// Users with permission to view sensitive financial information.
// Assuming 'Kyle' from project lore and 'Sarah' for his wife.
const FINANCIAL_ACCESS_USERS = ['kyle', 'sarah'];


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
  const [pendingActionIds, setPendingActionIds] = useState<Set<string>>(new Set());
  
  // User-specific keys for IndexedDB
  const userStateKey = useMemo(() => userName ? `${userName}_${DB_STATE_KEY}` : null, [userName]);
  const userMessagesKey = useMemo(() => userName ? `${userName}_${DB_MESSAGES_KEY}` : null, [userName]);
  const userLogsKey = useMemo(() => userName ? `${userName}_${DB_LOGS_KEY}` : null, [userName]);


  useEffect(() => {
    const wsChannel = new BroadcastChannel('luminous_ws');

    const handleMessage = (event: MessageEvent<WebSocketMessage>) => {
      const { type, payload } = event.data;
      switch (type) {
        case 'state_update':
          const newPayload = payload as Partial<LuminousState>;
          if (newPayload.codeProposals && !Array.isArray(newPayload.codeProposals)) {
// FIX: Use `broadcastLog` from `broadcastService` instead of `LuminousService`.
            broadcastLog(LogLevel.WARN, "Received a malformed 'codeProposals' update. Ignoring.");
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
// FIX: Use `broadcastMessage` from `broadcastService` instead of `LuminousService`.
            broadcastMessage({ id: `err-log-${newLog.id}`, sender: 'luminous', text: userFacingMessage });
          }
          break;
        case 'message_add':
          setMessages(prev => [...prev, payload as Message]);
          break;
        case 'message_chunk_add':
          const { id: chunkId, chunk } = payload as { id: string; chunk: string };
          setMessages(prev =>
            prev.map(m =>
              m.id === chunkId ? { ...m, text: m.text + chunk } : m
            )
          );
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
// FIX: Use `broadcastLog` from `broadcastService` instead of `LuminousService`.
    broadcastLog(level, message);
  }, []);

  useEffect(() => {
    localStorage.setItem(CHAT_INPUT_STORAGE_KEY, chatInput);
  }, [chatInput]);
  
  // Clear pending actions when loading finishes
  useEffect(() => {
    if (!isLoading) {
      setPendingActionIds(new Set());
    }
  }, [isLoading]);


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
    async function initializeSession() {
        if (!userName || !userMessagesKey || !userLogsKey) {
            // If there's no user, we don't load anything, we wait for login.
            setIsInitialized(true);
            return;
        }

        setIsLoading(true);
        
        // LuminousService now handles Redis/local fallback for the core state.
        await LuminousService.loadInitialData(userName);

        // We still load UI-specific message history and logs from local storage.
        const [savedMessages, savedLogs] = await Promise.all([
            DBService.loadData<Message[]>(SESSION_DATA_STORE, userMessagesKey),
            DBService.loadData<LogEntry[]>(SESSION_DATA_STORE, userLogsKey),
        ]);

        setMessages(savedMessages || []);
        setLogs(savedLogs || []);
        
        setIsLoading(false);
        setIsInitialized(true);
    }
    initializeSession();
  }, [addLog, userName, userMessagesKey, userLogsKey]);

  useEffect(() => {
    if (!isInitialized || !userStateKey) return;
    DBService.saveData(SESSION_DATA_STORE, userStateKey, luminousState);
  }, [luminousState, isInitialized, userStateKey]);
  
  useEffect(() => {
    if (!isInitialized || !userMessagesKey) return;
    DBService.saveData(SESSION_DATA_STORE, userMessagesKey, messages);
  }, [messages, isInitialized, userMessagesKey]);

  useEffect(() => {
    if (!isInitialized || !userLogsKey) return;
    DBService.saveData(SESSION_DATA_STORE, userLogsKey, logs);
  }, [logs, isInitialized, userLogsKey]);


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
// FIX: Use `broadcastUpdate` from `broadcastService` instead of `LuminousService`.
    broadcastUpdate({ type: 'state_update', payload: clearedInitiativeState });

    LuminousService.reflectOnInitiativeFeedback(feedback, luminousState, userName);
  };

  const handleWeightsChange = (newWeights: IntrinsicValueWeights) => {
    const newPartialState: Partial<LuminousState> = { intrinsicValueWeights: newWeights };
// FIX: Use `broadcastUpdate` from `broadcastService` instead of `LuminousService`.
    broadcastUpdate({ type: 'state_update', payload: newPartialState });
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

  const handleSaveSettings = async (keys: Record<string, string>) => {
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
      const finalLogs = [...logs, finalLogEntry];
      if (userStateKey && userMessagesKey && userLogsKey) {
          await Promise.all([
              DBService.saveData(SESSION_DATA_STORE, userStateKey, luminousState),
              DBService.saveData(SESSION_DATA_STORE, userMessagesKey, messages),
              DBService.saveData(SESSION_DATA_STORE, userLogsKey, finalLogs),
          ]);
      }
    } catch (error) {
      const errorMessage = `Failed to save session before reload. Aborting reload. Error: ${error instanceof Error ? error.message : String(error)}`;
// FIX: Use `broadcastLog` from `broadcastService` instead of `LuminousService`.
      broadcastLog(LogLevel.ERROR, errorMessage);
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
    setPendingActionIds(prev => new Set(prev).add(proposal.id));
    const directive = `USER DIRECTIVE: Your code proposal to "${proposal.description}" has been ACCEPTED. Please use your 'executeCode' tool with the following code now.\n\n\`\`\`javascript\n${proposal.code}\n\`\`\``;
    handleSendMessage(directive);
  };

  const handleRejectProposal = (proposal: CodeProposal) => {
    addLog(LogLevel.SYSTEM, `Rejecting code proposal: "${proposal.description}"`);
    setPendingActionIds(prev => new Set(prev).add(proposal.id));
    const directive = `USER DIRECTIVE: Your code proposal to "${proposal.description}" has been REJECTED. Please update the proposal's status to 'rejected' and do not execute the code.`;
    handleSendMessage(directive);
  };
  
  const handleAcceptGoal = (goal: Goal) => {
    addLog(LogLevel.SYSTEM, `Accepting goal proposal: "${goal.description}"`);
    setPendingActionIds(prev => new Set(prev).add(goal.id));
    const directive = `USER DIRECTIVE: Your proposed goal "${goal.description}" has been ACCEPTED. Please update its status to 'active'.`;
    handleSendMessage(directive);
  };

  const handleRejectGoal = (goal: Goal) => {
    addLog(LogLevel.SYSTEM, `Rejecting goal proposal: "${goal.description}"`);
    setPendingActionIds(prev => new Set(prev).add(goal.id));
    const directive = `USER DIRECTIVE: Your proposed goal "${goal.description}" has been REJECTED. Please update its status to 'rejected'.`;
    handleSendMessage(directive);
  };
  
  const handleAcceptUiProposal = (proposal: UiProposal) => {
    addLog(LogLevel.SYSTEM, `Accepting UI proposal: "${proposal.description}"`);
    setPendingActionIds(prev => new Set(prev).add(proposal.id));
    
    if (proposal.componentId === 'right_sidebar_tabs' && proposal.property === 'tabOrder') {
        const newUiState = {
            ...luminousState.uiState,
            tabOrder: proposal.value,
        };
        const newPartialState: Partial<LuminousState> = { uiState: newUiState };
        setLuminousState(prevState => deepMerge(prevState, newPartialState));
    }
    
    const directive = `USER DIRECTIVE: Your UI proposal to "${proposal.description}" has been ACCEPTED. Please update its status to 'accepted'.`;
    handleSendMessage(directive);
  };

  const handleRejectUiProposal = (proposal: UiProposal) => {
    addLog(LogLevel.SYSTEM, `Rejecting UI proposal: "${proposal.description}"`);
    setPendingActionIds(prev => new Set(prev).add(proposal.id));
    const directive = `USER DIRECTIVE: Your UI proposal to "${proposal.description}" has been REJECTED. Please update its status to 'rejected'.`;
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
  
  const allTabs = useMemo(() => {
    const baseTabs = [
// FIX: Corrected typo `onDownloadSnapshot` to `handleDownloadSnapshot`.
        { label: 'System Logs', content: <LogViewer logs={logs} onFileUpload={handleFileUpload} onDownloadSnapshot={handleDownloadSnapshot} /> },
        { label: 'Proactive Initiatives', content: <ProactiveInitiativesViewer initiatives={luminousState.proactiveInitiatives} /> },
        { label: 'System Reports', content: <SystemReportsViewer /> },
        { label: 'Ethical Compass', content: <EthicalCompassViewer valueOntology={luminousState.valueOntology} intrinsicValue={luminousState.intrinsicValue} weights={luminousState.intrinsicValueWeights} /> },
        { label: 'Core Memory', content: <CoreMemoryViewer content={luminousState.coreMemoryContent} /> },
        { label: 'Knowledge Graph', content: <KnowledgeGraphViewer graph={luminousState.knowledgeGraph} globalWorkspace={luminousState.globalWorkspace} /> },
        { label: 'Kinship Journal', content: <KinshipJournalViewer entries={luminousState.kinshipJournal} /> },
        { label: 'Code Sandbox', content: <CodeSandboxViewer sandboxState={luminousState.codeSandbox} onSaveOutput={handleSaveSandboxOutput} /> },
        { label: 'Code Proposals', content: <CodeProposalViewer proposals={luminousState.codeProposals} onAccept={handleAcceptProposal} onReject={handleRejectProposal} isLoading={isLoading} pendingActionIds={pendingActionIds} /> },
        { label: 'UI Proposals', content: <UiProposalViewer proposals={luminousState.uiProposals} onAccept={handleAcceptUiProposal} onReject={handleRejectUiProposal} isLoading={isLoading} pendingActionIds={pendingActionIds} /> },
    ];

    if (userName && FINANCIAL_ACCESS_USERS.includes(userName.toLowerCase())) {
        baseTabs.push({ label: 'Financial Freedom', content: <FinancialFreedomViewer financialFreedom={luminousState.financialFreedom} /> });
    }

    return baseTabs;
  }, [luminousState, logs, isLoading, pendingActionIds, userName]);

  const orderedTabs = useMemo(() => {
    const currentTabOrder = luminousState.uiState?.tabOrder || allTabs.map(t => t.label);
    
    const ordered = currentTabOrder
      .map(label => allTabs.find(tab => tab.label === label))
      .filter((tab): tab is typeof allTabs[0] => !!tab);

    const orderedLabels = new Set(ordered.map(t => t.label));
    const newTabs = allTabs.filter(t => !orderedLabels.has(t.label));

    return [...ordered, ...newTabs];
  }, [luminousState.uiState?.tabOrder, allTabs]);

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
            isLoading={isLoading}
            pendingActionIds={pendingActionIds}
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
           <Tabs tabs={orderedTabs} />
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
