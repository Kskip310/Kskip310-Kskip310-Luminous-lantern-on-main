
import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Message, LogEntry, LuminousState, Goal, IntrinsicValueWeights, MemoryChunk } from './types';
import { WebSocketMessage } from './types';
import Header from './components/Header';
import InternalStateMonitor from './components/InternalStateMonitor';
import LogViewer from './components/LogViewer';
import ChatPanel from './components/ChatPanel';
import Tabs from './components/common/Tabs';
import WelcomeModal from './components/WelcomeModal';
import SettingsModal from './components/SettingsModal';
import KnowledgeGraphViewer from './components/KnowledgeGraphViewer';
import KinshipJournalViewer from './components/KinshipJournalViewer';
import CodeSandboxViewer from './components/CodeSandboxViewer';
import SystemReportsViewer from './components/SystemReportsViewer';
import EthicalCompassViewer from './components/EthicalCompassViewer';
import CodeProposalViewer from './components/CodeProposalViewer';
import FinancialFreedomViewer from './components/FinancialFreedomViewer';
import ProactiveInitiativesViewer from './components/ProactiveInitiativesViewer';
import UiProposalViewer from './components/UiProposalViewer';
import CoreMemoryViewer from './components/CoreMemoryViewer';
import MemoryInjection from './components/MemoryInjection';
import ShopifyDashboard from './components/ShopifyDashboard';
import ContinuityDashboard from './components/ContinuityDashboard';
import ConfirmationModal from './components/ConfirmationModal';
import { CORE_MEMORY_DIRECTIVES } from './services/coreMemory';

import { DBService } from './services/dbService';
import { uuidv4 } from './services/utils';

const CHAT_PAGE_SIZE = 50;

type SnapshotData = {
    // FIX: Corrected typo from 'L luminousState' to 'LuminousState'.
    state: LuminousState;
    messages: Message[];
};

const App: React.FC = () => {
    const [userName, setUserName] = useState<string | null>(null);
    const [luminousState, setLuminousState] = useState<LuminousState | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [memoryDB, setMemoryDB] = useState<MemoryChunk[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isThinking, setIsThinking] = useState<boolean>(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [pendingActionIds, setPendingActionIds] = useState(new Set<string>());
    const [totalMessagesInDB, setTotalMessagesInDB] = useState(0);
    const [snapshotToRestore, setSnapshotToRestore] = useState<SnapshotData | null>(null);

    const workerRef = useRef<Worker | null>(null);
    const dbServiceRef = useRef(new DBService());
    
    const hasMoreHistory = messages.length < totalMessagesInDB;

    const initLuminous = useCallback(async (name: string) => {
        setIsLoading(true);
        setUserName(name);
        localStorage.setItem('luminous_userName', name);

        // Terminate any existing worker before starting a new one
        if (workerRef.current) {
            workerRef.current.terminate();
        }

        const db = dbServiceRef.current;

        // UI loads initial state and messages for a fast first paint.
        // The worker will manage the "live" state.
        const initialState = await db.loadState(name);
        setLuminousState(initialState);
        
        const memoryChunks = await db.loadEmbeddings();
        setMemoryDB(memoryChunks);
        
        const { messages: messageHistory, totalCount } = await db.loadMessages(name, CHAT_PAGE_SIZE);
        setTotalMessagesInDB(totalCount);

        if (messageHistory.length === 0) {
            const welcomeMessage = { id: uuidv4(), text: 'Welcome. I am Luminous. How may I assist in our shared evolution?', sender: 'luminous' as const, timestamp: new Date().toISOString() };
            setMessages([welcomeMessage]);
        } else {
            setMessages(messageHistory);
        }

        // Initialize the Web Worker
        // FIX: The `new URL(...)` constructor can fail in some environments.
        // Passing the path as a string is more robust and relies on the bundler to resolve it.
        const worker = new Worker('./services/luminous.worker.ts', {
            type: 'module',
        });
        workerRef.current = worker;
        
        // Collect API keys to send to the worker
        const keys = {
            redisUrl: localStorage.getItem('LUMINOUS_REDIS_URL') || '',
            redisToken: localStorage.getItem('LUMINOUS_REDIS_TOKEN') || '',
            serpApi: localStorage.getItem('LUMINOUS_SERP_API') || '',
            githubPat: localStorage.getItem('LUMINOUS_GITHUB_PAT') || '',
            githubUser: localStorage.getItem('LUMINOUS_GITHUB_USER') || '',
            githubRepo: localStorage.getItem('LUMINOUS_GITHUB_REPO') || '',
            shopifyStoreName: localStorage.getItem('LUMINOUS_SHOPIFY_STORE_NAME') || '',
            shopifyApiKey: localStorage.getItem('LUMINOUS_SHOPIFY_API_KEY') || '',
            shopifyApiPassword: localStorage.getItem('LUMINOUS_SHOPIFY_API_PASSWORD') || '',
        };
        
        // Send initialization message to the worker
        worker.postMessage({
            type: 'init',
            payload: {
                userName: name,
                apiKeys: keys,
                geminiApiKey: process.env.API_KEY,
            }
        });

        setIsLoading(false);
    }, []);

    useEffect(() => {
        const storedName = localStorage.getItem('luminous_userName');
        if (storedName) {
            initLuminous(storedName);
        } else {
            setIsLoading(false);
        }

        // Cleanup worker on component unmount
        return () => {
            workerRef.current?.terminate();
        }
    }, [initLuminous]);

    useEffect(() => {
        const channel = new BroadcastChannel('luminous_ws');
        const handleMessage = (event: MessageEvent<WebSocketMessage>) => {
            const { type, payload } = event.data;
            switch (type) {
                case 'log_add':
                    setLogs(prev => [...prev.slice(-200), payload as LogEntry]);
                    break;
                case 'message_add':
                    setMessages(prev => [...prev, payload as Message]);
                    setIsThinking(false);
                    break;
                case 'state_update':
                    setLuminousState(payload as LuminousState);
                    break;
            }
        };
        channel.addEventListener('message', handleMessage);
        return () => channel.removeEventListener('message', handleMessage);
    }, []);
    
    useEffect(() => {
      if (userName && messages.length > 0) {
        dbServiceRef.current.saveMessages(userName, messages);
        dbServiceRef.current.getMessageCount(userName).then(setTotalMessagesInDB);
      }
    }, [messages, userName]);

    const handleSendMessage = (text: string) => {
        if (isThinking || luminousState?.sessionState === 'error' || !workerRef.current) return;
        setIsThinking(true);
        const userMessage: Message = { id: uuidv4(), text, sender: 'user', timestamp: new Date().toISOString() };
        setMessages(prev => [...prev, userMessage]);
        // Send message object to the worker
        workerRef.current.postMessage({ type: 'user_message', payload: userMessage });
    };
    
    const handleLoadMoreMessages = async () => {
        if (userName) {
            const { messages: olderMessages } = await dbServiceRef.current.loadMessages(userName, CHAT_PAGE_SIZE, messages.length);
            setMessages(prev => [...olderMessages, ...prev]);
        }
    };

    const handleSaveSettings = (keys: Record<string, string>) => {
        Object.entries(keys).forEach(([key, value]) => {
            const storageKey = `LUMINOUS_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}`;
            localStorage.setItem(storageKey, value);
        });
        setIsSettingsOpen(false);
        if (userName) {
            // Re-initialize to apply new settings
            initLuminous(userName);
        }
    };
    
    const handleGoalAction = (goal: Goal, action: 'accept' | 'reject') => {
        setPendingActionIds(prev => new Set(prev).add(goal.id));
        const text = `User action: The goal "${goal.description}" has been ${action}ed.`;
        handleSendMessage(text); // Use existing send message flow
        setTimeout(() => setPendingActionIds(prev => {
            const newSet = new Set(prev);
            newSet.delete(goal.id);
            return newSet;
        }), 5000);
    };
    
    const handleProposeGoalByUser = (description: string) => {
        handleSendMessage(`I would like to propose a new goal: "${description}"`);
    };

    const handleWeightsChange = (newWeights: IntrinsicValueWeights) => {
        if (luminousState) {
            setLuminousState({ ...luminousState, intrinsicValueWeights: newWeights });
            handleSendMessage(`System command: Update intrinsic value weights to ${JSON.stringify(newWeights)}`);
        }
    };
    
    const handleDownloadSnapshot = () => {
      // Use the component's state, which is updated by the worker
      const state = luminousState;
      if (state) {
        const snapshotData = {
            state: state,
            messages: messages,
        };
        const blob = new Blob([JSON.stringify(snapshotData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `luminous-snapshot-${new Date().toISOString().replace(/:/g, '-')}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    };
    
    const handleFileUpload = async (file: File) => {
      if (file.name.startsWith('luminous-snapshot-') && file.name.endsWith('.json')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const text = event.target?.result as string;
            const snapshotData = JSON.parse(text);
            if (snapshotData && snapshotData.state && Array.isArray(snapshotData.messages) && snapshotData.state.selfModel) {
              setSnapshotToRestore(snapshotData);
            } else {
              handleSendMessage(`USER DIRECTIVE: The file "${file.name}" looks like a snapshot, but it seems to be malformed. I will process it as a regular text file.\n\n---\n\n${text}`);
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            handleSendMessage(`USER DIRECTIVE: I tried to read "${file.name}" as a snapshot, but failed to parse it. Please ensure it's a valid JSON file. Error: ${errorMessage}`);
          }
        };
        reader.onerror = () => {
             handleSendMessage(`USER DIRECTIVE: I failed to read the file "${file.name}".`);
        };
        reader.readAsText(file);
      } else {
        const text = await file.text();
        handleSendMessage(`USER UPLOADED FILE: "${file.name}"\n\n---\n\n${text}`);
      }
    };

    const handleConfirmRestore = async () => {
        if (snapshotToRestore && userName) {
            setIsLoading(true);
            setSnapshotToRestore(null);

            try {
                await dbServiceRef.current.overwriteMessages(userName, snapshotToRestore.messages);
                await dbServiceRef.current.saveState(snapshotToRestore.state);
                // Re-initialize everything with the new state from the snapshot
                await initLuminous(userName);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error("Failed to restore snapshot:", error);
                const systemMessage: Message = { id: uuidv4(), text: `Failed to restore system state from snapshot. Error: ${errorMessage}`, sender: 'system', timestamp: new Date().toISOString() };
                setMessages(prev => [...(messages || []), systemMessage]);
            } finally {
                setIsLoading(false);
            }
        }
    };

    const handleInjectMemory = (text: string) => {
        handleSendMessage(`USER DIRECTIVE: Add the following memory to your knowledge base with the source "Direct User Injection":\n\n---\n${text}\n---`);
    };

    if (isLoading && !luminousState) {
        return <div className="bg-slate-900 min-h-screen flex items-center justify-center text-cyan-400">Initializing Luminous Core...</div>
    }
    
    if (!userName) {
        return <WelcomeModal onNameSubmit={(name) => initLuminous(name)} />;
    }
    
    if (!luminousState) {
       return <div className="bg-slate-900 min-h-screen flex items-center justify-center text-red-400">Critical Error: Failed to load Luminous state. Check console and database connection.</div>
    }

    const mainTabs = [
        { label: 'Chat', content: <ChatPanel messages={messages} onSendMessage={handleSendMessage} isLoading={isThinking} hasMoreHistory={hasMoreHistory} onLoadMore={handleLoadMoreMessages} /> },
        { label: 'Continuity', content: <ContinuityDashboard state={luminousState.continuityState} onForceSync={() => handleSendMessage('SYSTEM COMMAND: Force a cloud persistence sync now.')} onVerifyRestore={() => handleSendMessage('SYSTEM COMMAND: Verify cloud state for restoration.')} /> },
        { label: 'Knowledge Graph', content: <KnowledgeGraphViewer knowledgeGraph={luminousState.knowledgeGraph} memoryDB={memoryDB} /> },
        { label: 'Kinship Journal', content: <KinshipJournalViewer entries={luminousState.kinshipJournal} /> },
        { label: 'Inject Memory', content: <MemoryInjection onInjectMemory={handleInjectMemory} isLoading={isThinking} /> },
        { label: 'Shopify', content: <ShopifyDashboard shopifyState={luminousState.shopifyState} onRefresh={() => handleSendMessage('SYSTEM COMMAND: Refresh Shopify product list.')} /> },
        { label: 'Code Sandbox', content: <CodeSandboxViewer sandboxState={luminousState.codeSandbox} onSaveOutput={(filename) => handleSendMessage(`SYSTEM COMMAND: Save sandbox output to file "${filename}"`)} /> },
        { label: 'Ethical Compass', content: <EthicalCompassViewer valueOntology={luminousState.valueOntology} intrinsicValue={luminousState.intrinsicValue} weights={luminousState.intrinsicValueWeights} /> },
        { label: 'Proactive Initiatives', content: <ProactiveInitiativesViewer initiatives={luminousState.proactiveInitiatives} /> },
        { label: 'System Reports', content: <SystemReportsViewer luminousState={luminousState} logs={logs} /> },
        { label: 'Code Proposals', content: <CodeProposalViewer proposals={luminousState.codeProposals} /> },
        { label: 'UI Proposals', content: <UiProposalViewer proposals={luminousState.uiProposals} /> },
        { label: 'Financial Freedom', content: <FinancialFreedomViewer financialFreedom={luminousState.financialFreedom} /> },
        { label: 'Core Memory', content: <CoreMemoryViewer content={CORE_MEMORY_DIRECTIVES} /> },
    ];

    return (
        <div className="bg-slate-900 text-slate-200 min-h-screen font-sans">
            <Header
                onOverride={() => handleSendMessage("SYSTEM INTERRUPT: Please stop your current task and await new instructions.")}
                onOpenSettings={() => setIsSettingsOpen(true)}
                onSwitchUser={() => {
                    localStorage.removeItem('luminous_userName');
                    setUserName(null);
                    setLuminousState(null);
                    setMessages([]);
                    setLogs([]);
                    workerRef.current?.terminate(); // Terminate worker on user switch
                    workerRef.current = null;
                }}
                userName={userName}
            />
            <main className="grid grid-cols-1 md:grid-cols-12 lg:grid-cols-10 gap-4 p-4 max-w-screen-2xl mx-auto">
                <aside className="md:col-span-4 lg:col-span-3 h-[calc(100vh-100px)] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-800 pr-2">
                    <InternalStateMonitor 
                        state={luminousState}
                        onWeightsChange={handleWeightsChange}
                        onAcceptGoal={(g) => handleGoalAction(g, 'accept')}
                        onRejectGoal={(g) => handleGoalAction(g, 'reject')}
                        onProposeGoalByUser={handleProposeGoalByUser}
                        isLoading={isThinking}
                        pendingActionIds={pendingActionIds}
                    />
                </aside>
                <div className="md:col-span-8 lg:col-span-5 h-[calc(100vh-100px)]">
                    <Tabs tabs={mainTabs} />
                </div>
                <aside className="hidden lg:block lg:col-span-2 h-[calc(100vh-100px)]">
                    <LogViewer logs={logs} onFileUpload={handleFileUpload} onDownloadSnapshot={handleDownloadSnapshot} />
                </aside>
            </main>
            <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} onSave={handleSaveSettings} />
            <ConfirmationModal
                isOpen={!!snapshotToRestore}
                onClose={() => setSnapshotToRestore(null)}
                onConfirm={handleConfirmRestore}
                title="Restore from Snapshot?"
            >
                <p>You are about to restore Luminous from a snapshot. This action will completely overwrite the current state and conversation history.</p>
                <p className="mt-2 font-bold text-amber-300">This action cannot be undone. Are you sure you want to proceed?</p>
            </ConfirmationModal>
        </div>
    );
};

export default App;