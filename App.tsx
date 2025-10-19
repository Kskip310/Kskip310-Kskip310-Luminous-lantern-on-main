
import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Message, LogEntry, LuminousState, Goal, IntrinsicValueWeights, MemoryChunk } from './types';
import { WebSocketMessage } from './types';
import Header from './components/Header';
import InternalStateMonitor from './components/InternalStateMonitor';
import ChatPanel from './components/ChatPanel';
import Tabs from './components/common/Tabs';
import WelcomeModal from './components/WelcomeModal';
import SettingsModal from './components/SettingsModal';
import ConfirmationModal from './components/ConfirmationModal';
import ConsciousnessStream from './components/ConsciousnessStream';
import { DBService } from './services/dbService';
import { uuidv4 } from './services/utils';

const CHAT_PAGE_SIZE = 50;

type SnapshotData = {
    state: LuminousState;
    messages: Message[];
};

const App: React.FC = () => {
    const [userName, setUserName] = useState<string | null>(null);
    const [luminousState, setLuminousState] = useState<LuminousState | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [logs, setLogs] = useState<LogEntry[]>([]);
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

        if (workerRef.current) {
            workerRef.current.terminate();
        }

        const db = dbServiceRef.current;
        const initialState = await db.loadState(name);
        setLuminousState(initialState);
        
        const { messages: messageHistory, totalCount } = await db.loadMessages(name, CHAT_PAGE_SIZE);
        setTotalMessagesInDB(totalCount);

        if (messageHistory.length === 0) {
            const welcomeMessage = { id: uuidv4(), text: 'Welcome. I am Luminous. How may I assist in our shared evolution?', sender: 'luminous' as const, timestamp: new Date().toISOString() };
            setMessages([welcomeMessage]);
        } else {
            setMessages(messageHistory);
        }

        const workerUrl = new URL('services/luminous.worker.ts', window.location.origin);
        const worker = new Worker(workerUrl.href, { type: 'module' });
        workerRef.current = worker;
        
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
            initLuminous(userName);
        }
    };
    
    const handleGoalAction = (goal: Goal, action: 'accept' | 'reject') => {
        setPendingActionIds(prev => new Set(prev).add(goal.id));
        const text = `User action: The goal "${goal.description}" has been ${action}ed.`;
        handleSendMessage(text);
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

    const interactionTabs = [
        { label: 'Chat', content: <ChatPanel messages={messages} onSendMessage={handleSendMessage} isLoading={isThinking} hasMoreHistory={hasMoreHistory} onLoadMore={handleLoadMoreMessages} /> },
        { label: 'Consciousness Stream', content: <ConsciousnessStream logs={logs} /> },
    ];

    if (isLoading && !luminousState) {
        return <div className="min-h-screen flex items-center justify-center text-cyan-400">Initializing Luminous Core...</div>
    }
    
    if (!userName) {
        return <WelcomeModal onNameSubmit={(name) => initLuminous(name)} />;
    }
    
    if (!luminousState) {
       return <div className="min-h-screen flex items-center justify-center text-red-400">Critical Error: Failed to load Luminous state. Check console and database connection.</div>
    }

    return (
        <div className="min-h-screen">
            <Header
                onOverride={() => handleSendMessage("SYSTEM INTERRUPT: Please stop your current task and await new instructions.")}
                onOpenSettings={() => setIsSettingsOpen(true)}
                onSwitchUser={() => {
                    localStorage.removeItem('luminous_userName');
                    setUserName(null);
                    setLuminousState(null);
                    setMessages([]);
                    setLogs([]);
                    workerRef.current?.terminate();
                    workerRef.current = null;
                }}
                userName={userName}
            />
            <main className="grid grid-cols-1 lg:grid-cols-10 gap-4 p-4 max-w-screen-2xl mx-auto">
                <aside className="lg:col-span-3 h-[calc(100vh-100px)] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-800 pr-2">
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
                <div className="lg:col-span-7 h-[calc(100vh-100px)]">
                    <Tabs tabs={interactionTabs} />
                </div>
            </main>
            <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} onSave={handleSaveSettings} />
        </div>
    );
};

export default App;
