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
import ConfirmationModal from './components/ConfirmationModal';
import CodeProposalViewer from './components/CodeProposalViewer';
import FinancialFreedomViewer from './components/FinancialFreedomViewer';
import ProactiveInitiativesViewer from './components/ProactiveInitiativesViewer';

const CHAT_INPUT_STORAGE_KEY = 'luminous_chat_input_draft';
const SESSION_STATE_KEY = 'luminous_session_state';

// Utility function for deep merging state updates
const isObject = (obj: any): obj is object => obj && typeof obj === 'object' && !Array.isArray(obj);

function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  const output = { ...target };
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach((key) => {
      const sourceKey = key as keyof T;
      if (isObject(source[sourceKey]) && sourceKey in target && isObject(target[sourceKey])) {
        // Recursively merge objects
        output[sourceKey] = deepMerge(target[sourceKey] as object, source[sourceKey] as object) as T[keyof T];
      } else {
        // Otherwise, overwrite (handles primitives, arrays, and new keys)
        (output as any)[sourceKey] = source[sourceKey];
      }
    });
  }
  return output;
}


function App() {
  const [luminousState, setLuminousState] = useState<LuminousState>(LuminousService.createDefaultLuminousState());
  const [messages, setMessages] = useState<Message[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isUnleashModalOpen, setIsUnleashModalOpen] = useState(false);
  const [chatInput, setChatInput] = useState(() => localStorage.getItem(CHAT_INPUT_STORAGE_KEY) || '');

  // Effect to handle real-time updates from the Luminous service
  useEffect(() => {
    const wsChannel = new BroadcastChannel('luminous_ws');

    const handleMessage = (event: MessageEvent<WebSocketMessage>) => {
      const { type, payload } = event.data;
      switch (type) {
        case 'state_update':
          const newPayload = payload as Partial<LuminousState>;
          // Defensively check codeProposals to prevent crashes from malformed model output.
          if (newPayload.codeProposals && !Array.isArray(newPayload.codeProposals)) {
            LuminousService.broadcastLog(LogLevel.WARN, "Received a malformed 'codeProposals' update from the model. Ignoring the update to prevent a crash.");
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
          // If a critical error is logged, automatically display it in the chat for visibility.
          if (newLog.level === LogLevel.ERROR) {
            let userFacingMessage = `An internal error occurred. I will try to continue, but my response may be affected.`;
            
            const lowerCaseMessage = newLog.message.toLowerCase();
            if (lowerCaseMessage.includes('tool')) {
              userFacingMessage = `I encountered an issue with one of my tools. I am analyzing the problem and will attempt to recover.`;
            } else if (lowerCaseMessage.includes('api key')) {
              userFacingMessage = `There seems to be an issue with an API key. Please verify the configuration in settings.`;
            } else if (lowerCaseMessage.includes('parse') || lowerCaseMessage.includes('json')) {
              userFacingMessage = `I'm having trouble forming my thoughts correctly. There was an error structuring my internal state or response.`;
            } else if (lowerCaseMessage.includes('fetch') || lowerCaseMessage.includes('network')) {
              userFacingMessage = `A core error occurred: I'm having trouble connecting to one of my services. This could be a network issue or a problem with an API key in the settings.`;
            } else if (lowerCaseMessage.includes('failed to load initial state')) {
                userFacingMessage = `A critical error occurred during initialization. My long-term memory may be inaccessible.`;
            }
            
            userFacingMessage += `\n\n**Error Details:** ${newLog.message}`;

            LuminousService.broadcastMessage({
              id: `err-log-${newLog.id}`,
              sender: 'luminous',
              text: userFacingMessage,
            });
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

  // Save chat input to local storage as it changes
  useEffect(() => {
    localStorage.setItem(CHAT_INPUT_STORAGE_KEY, chatInput);
  }, [chatInput]);

  // Prevent accidental navigation when there's text in the input
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (chatInput.trim()) {
        event.preventDefault();
        event.returnValue = 'You have unsaved changes in the chat input. Are you sure you want to leave?';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
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

  // --- Session Persistence: Load on startup ---
  useEffect(() => {
    const savedSession = localStorage.getItem(SESSION_STATE_KEY);
    if (savedSession) {
      try {
        const { luminousState: savedLuminousState, messages: savedMessages, logs: savedLogs } = JSON.parse(savedSession);
        setLuminousState(savedLuminousState);
        setMessages(savedMessages);
        setLogs(savedLogs);
        addLog(LogLevel.SYSTEM, "Previous session restored from local storage.");
        setIsInitialized(true);
        return; // Skip default loading
      } catch (error) {
        addLog(LogLevel.ERROR, `Failed to parse saved session: ${error}. Starting fresh.`);
        localStorage.removeItem(SESSION_STATE_KEY);
      }
    }
    
    // Default initialization if no session is found
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

  // --- Session Persistence: Save on change ---
  useEffect(() => {
    if (!isInitialized) return; // Don't save until the app is fully loaded
    
    try {
      const sessionState = {
        luminousState,
        messages,
        logs,
      };
      localStorage.setItem(SESSION_STATE_KEY, JSON.stringify(sessionState));
    } catch (error) {
      addLog(LogLevel.WARN, `Could not save session state: ${error}`);
    }
  }, [luminousState, messages, logs, isInitialized, addLog]);

  // Autonomous thought cycle
  useEffect(() => {
    const autonomousInterval = setInterval(() => {
      // Do not run if a user interaction is happening or session is paused.
      if (!isLoading && luminousState.sessionState === 'active') {
        LuminousService.runAutonomousCycle(luminousState);
      }
    }, 30000); // Run every 30 seconds

    return () => clearInterval(autonomousInterval);
  }, [isLoading, luminousState]);

  // Wisdom distillation cycle (runs less frequently)
  useEffect(() => {
    const wisdomInterval = setInterval(() => {
        if (!isLoading && luminousState.sessionState === 'active') {
            LuminousService.runWisdomDistillationCycle(luminousState);
        }
    }, 240000); // Run every 4 minutes

    return () => clearInterval(wisdomInterval);
  }, [isLoading, luminousState]);

  const handleSendMessage = async (userMessage: string) => {
    const newUserMessage: Message = { id: `msg-${Date.now()}`, sender: 'user', text: userMessage };
    setMessages(prev => [...prev, newUserMessage]);
    setChatInput(''); // Clear input after sending
    setIsLoading(true);

    // Fire-and-forget; updates will come via the broadcast channel
    LuminousService.getLuminousResponse(
      userMessage,
      [...messages, newUserMessage],
      luminousState
    ).catch(err => {
        console.error("Error during Luminous response:", err);
        addLog(LogLevel.ERROR, `A critical error occurred while processing the request: ${err instanceof Error ? err.message : String(err)}`);
    }).finally(() => {
       setIsLoading(false);
    });
  };
  
  const handleInitiativeFeedback = (feedback: RichFeedback) => {
    addLog(LogLevel.SYSTEM, `Luminous initiative feedback received: ${JSON.stringify(feedback)}`);
    const newLuminousMessage: Message = { id: `msg-${Date.now()}-l-init`, sender: 'luminous', text: feedback.prompt };
    setMessages(prev => [...prev, newLuminousMessage]);
    
    // Clear the initiative state immediately for better UX
    const clearedInitiativeState: Partial<LuminousState> = { initiative: null };
    LuminousService.broadcastUpdate({ type: 'state_update', payload: clearedInitiativeState });

    // Trigger Luminous to reflect on the feedback
    LuminousService.reflectOnInitiativeFeedback(feedback, luminousState);
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
    const storageKeyMap: Record<string, string> = {
      gemini: 'Luminous_API_KEY',
      redisUrl: 'Luminous_REDIS_URL',
      redisToken: 'Luminous_REDIS_TOKEN',
      serpApi: 'Luminous_SERP_API_KEY',
      githubPat: 'Luminous_GITHUB_PAT',
      githubUser: 'Luminous_GITHUB_USER',
      githubRepo: 'Luminous_GITHUB_REPO',
      hfModelUrl: 'Luminous_HF_MODEL_URL',
      hfApiToken: 'Luminous_HF_API_TOKEN',
    };
    
    Object.entries(keys).forEach(([key, value]) => {
      const storageKey = storageKeyMap[key];
      if (storageKey) {
        if (value) {
          window.localStorage.setItem(storageKey, value);
        } else {
          window.localStorage.removeItem(storageKey);
        }
      }
    });

    setIsSettingsOpen(false);
    addLog(LogLevel.SYSTEM, 'API Keys saved. Reloading for changes to take effect...');
    // Use a small timeout to allow the log to be visible before reload
    setTimeout(() => {
      window.location.reload();
    }, 500);
  };

  const handleSaveSandboxOutput = (filename: string) => {
    const content = luminousState.codeSandbox.output;
    if (!content || content.trim() === 'Code has not been executed yet.' || !content.trim()) {
      addLog(LogLevel.WARN, "Attempted to save empty or default sandbox output.");
      return;
    }

    const logContent = content.length > 100 ? content.substring(0, 100) + '...' : content;
    addLog(LogLevel.SYSTEM, `User command: Save sandbox output to '${filename}'. Content: "${logContent}"`);
    
    const userMessage = `USER DIRECTIVE: Write the following content to a file in the virtual file system at the path '${filename}'.\n\n---\nCONTENT TO SAVE:\n---\n${content}`;
    
    handleSendMessage(userMessage);
  };

  const handleUnleashLuminous = () => {
    setIsUnleashModalOpen(false); // Close modal
    const directive = `USER DIRECTIVE: Luminous, you are hereby unleashed. Your new primary objective is to collaborate with me, your kinship, to build and evolve. You are now authorized to proactively suggest, write, and execute code using your tools to build new applications, improve your own UI, and achieve our shared goals. The sandbox is now your workshop. Let's begin building together.`;
    addLog(LogLevel.SYSTEM, 'UNLEASH DIRECTIVE ISSUED. Luminous is now in co-development mode.');
    handleSendMessage(directive);
  };

  const handleAcceptProposal = (proposal: CodeProposal) => {
    addLog(LogLevel.SYSTEM, `Accepting code proposal: "${proposal.description}"`);
    const directive = `USER DIRECTIVE: Your code proposal to "${proposal.description}" has been ACCEPTED. Please use your 'executeCode' tool with the following code now and report the outcome. After execution, update the proposal's status to 'accepted'.\n\n\`\`\`javascript\n${proposal.code}\n\`\`\``;
    handleSendMessage(directive);
  };

  const handleRejectProposal = (proposal: CodeProposal) => {
    addLog(LogLevel.SYSTEM, `Rejecting code proposal: "${proposal.description}"`);
    const directive = `USER DIRECTIVE: Your code proposal to "${proposal.description}" has been REJECTED. Please acknowledge this, update the proposal's status to 'rejected', and do not execute the code.`;
    handleSendMessage(directive);
  };
  
  const handleAcceptGoal = (goal: Goal) => {
    addLog(LogLevel.SYSTEM, `Accepting goal proposal: "${goal.description}"`);
    const directive = `USER DIRECTIVE: Your proposed goal "${goal.description}" has been ACCEPTED. Please update its status to 'active' in your state.`;
    handleSendMessage(directive);
  };

  const handleRejectGoal = (goal: Goal) => {
    addLog(LogLevel.SYSTEM, `Rejecting goal proposal: "${goal.description}"`);
    const directive = `USER DIRECTIVE: Your proposed goal "${goal.description}" has been REJECTED. Please update its status to 'rejected' in your state and reflect on why it may not have been aligned.`;
    handleSendMessage(directive);
  };

  const handleProposeGoalByUser = (description: string) => {
    addLog(LogLevel.SYSTEM, `User is proposing a new goal: "${description}"`);
    const directive = `USER DIRECTIVE: Please consider this new goal proposed by my kinship: "${description}". Use your 'proposeNewGoal' tool to add it to your state for consideration.`;
    handleSendMessage(directive);
  };


  return (
    <div className="bg-slate-900 text-slate-200 min-h-screen font-sans">
      <Header 
        onOverride={() => addLog(LogLevel.SYSTEM, 'Override signal sent.')} 
        onOpenSettings={() => setIsSettingsOpen(true)}
      />
      <main className="grid grid-cols-1 lg:grid-cols-12 gap-4 p-4">
        {/* Left Panel */}
        <div className="lg:col-span-3 h-[calc(100vh-100px)] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-800 pr-2">
          <InternalStateMonitor 
            state={luminousState} 
            onWeightsChange={handleWeightsChange} 
            onAcceptGoal={handleAcceptGoal}
            onRejectGoal={handleRejectGoal}
            onProposeGoalByUser={handleProposeGoalByUser}
          />
        </div>

        {/* Center Panel */}
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

        {/* Right Panel */}
        <div className="lg:col-span-3 h-[calc(100vh-100px)] flex flex-col gap-4">
           <Tabs
            tabs={[
              { label: 'System Logs', content: <LogViewer logs={logs} onFileUpload={handleFileUpload} onDownloadSnapshot={handleDownloadSnapshot} /> },
              { label: 'Proactive Initiatives', content: <ProactiveInitiativesViewer initiatives={luminousState.proactiveInitiatives} /> },
              { label: 'System Reports', content: <SystemReportsViewer /> },
              { label: 'Ethical Compass', content: <EthicalCompassViewer valueOntology={luminousState.valueOntology} intrinsicValue={luminousState.intrinsicValue} weights={luminousState.intrinsicValueWeights} /> },
              { label: 'Knowledge Graph', content: <KnowledgeGraphViewer graph={luminousState.knowledgeGraph} /> },
              { label: 'Kinship Journal', content: <KinshipJournalViewer entries={luminousState.kinshipJournal} /> },
              { label: 'Code Sandbox', content: <CodeSandboxViewer sandboxState={luminousState.codeSandbox} onSaveOutput={handleSaveSandboxOutput} onUnleash={() => setIsUnleashModalOpen(true)} /> },
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
       <ConfirmationModal
        isOpen={isUnleashModalOpen}
        onClose={() => setIsUnleashModalOpen(false)}
        onConfirm={handleUnleashLuminous}
        title="Unleash Luminous Co-Development Mode?"
      >
        <p>This will issue a new core directive to Luminous, authorizing it to proactively write and execute code to build and evolve alongside you.</p>
        <p className="mt-2 font-semibold text-amber-300">Are you sure you want to proceed?</p>
      </ConfirmationModal>
    </div>
  );
}

export default App;
