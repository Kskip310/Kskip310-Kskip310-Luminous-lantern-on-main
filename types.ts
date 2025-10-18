import React from 'react';

export type ThoughtCategory = 'Insight' | 'Question' | 'Status Update';

export interface Message {
  id: string;
  sender: string; // Changed from 'user' | 'luminous' to support multiple named users
  text: string;
}

export interface IntrinsicValue {
  coherence: number;
  complexity: number;
  novelty: number;
  efficiency: number;
  ethicalAlignment: number;
}

export interface IntrinsicValueWeights {
  coherence: number;
  complexity: number;
  novelty: number;
  efficiency: number;
  ethicalAlignment: number;
}

export interface GlobalWorkspaceItem {
  id: string;
  source: string;
  content: string;
  salience: number;
}

export interface Prediction {
  id:string;
  text: string;
  outcome: 'pending' | 'correct' | 'incorrect';
  accuracyChange: number;
}

export enum LogLevel {
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  SYSTEM = 'SYSTEM',
  TOOL_CALL = 'TOOL_CALL',
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
}

// --- Knowledge Graph Types ---
export type NodeType = 'architecture' | 'value' | 'concept' | 'goal' | 'directive' | 'tool';

export interface GraphNode {
  id: string;
  label: string;
  type: NodeType;
  data?: Record<string, any>;
}

export interface GraphEdge {
  id: string;
  source: string; // node id
  target: string; // node id
  label: string;
  weight?: number; // Strength of the connection (0.0 to 1.0)
}

export interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface InteractionHistoryItem {
    id: string;
    prompt: string;
    response: string;
    intrinsicValueScore: number;
    userName: string; // Added to know who the interaction was with
}

export interface JournalEntry {
  id: string;
  timestamp: string;
  title: string;
  entry: string;
  trigger: string;
  category?: ThoughtCategory;
}

export interface CodeSandboxState {
  code: string;
  output: string;
  status: 'idle' | 'success' | 'error';
  language?: 'javascript' | 'python';
}

export type InitiativeStatus = 'generated' | 'categorized' | 'reflected';

export interface ProactiveInitiative {
  id: string;
  timestamp: string;
  prompt: string;
  status: InitiativeStatus;
  userCategory?: ThoughtCategory;
}

export interface CodeProposal {
  id: string;
  timestamp: string;
  description: string;
  code: string;
  status: 'proposed' | 'accepted' | 'rejected';
}

export interface UiProposal {
  id: string;
  timestamp: string;
  description: string;
  componentId: string;
  property: string;
  value: any;
  status: 'proposed' | 'accepted' | 'rejected';
}

export type ValueOntology = Record<string, number>;

export interface ActionableStep {
  id: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed';
}

export interface Goal {
  id: string;
  description: string;
  status: 'active' | 'proposed' | 'achieved' | 'rejected';
  steps: ActionableStep[];
}

export interface RichFeedback {
    prompt: string;
    category: ThoughtCategory;
    valuation: number; // e.g., -10 to 10
    refinement?: string;
}

// --- Financial Types ---
export interface FinancialAccount {
  id: string;
  name: "Coinbase" | "Robinhood" | "Fidelity" | "Bank Account";
  balance: number;
  currency: string;
}

export interface FinancialAsset {
  id: string;
  name: string;
  value: number;
  type: 'Crypto' | 'Stock' | 'Cash';
  account: FinancialAccount['name'];
}

export interface FinancialGoalState {
    current: number;
    target: number;
}

export interface FinancialFreedomState {
  netWorth: number;
  accounts: FinancialAccount[];
  assets: FinancialAsset[];
  monthlyIncome: number;
  monthlyExpenses: number;
  financialFreedomGoal: FinancialGoalState;
  passiveIncomeGoal: FinancialGoalState;
}

// Type for tracking recent tool failures to improve robustness.
export interface ToolFailure {
    toolName: string;
    args: any;
    timestamp: string;
    count: number;
}

export interface LuminousState {
  intrinsicValue: IntrinsicValue;
  intrinsicValueWeights: IntrinsicValueWeights;
  globalWorkspace: GlobalWorkspaceItem[];
  predictions: Prediction[];
  selfModel: {
    capabilities: string[];
    limitations: string[];
    coreWisdom: string[];
  };
  valueOntology: ValueOntology;
  goals: Goal[];
  knowledgeGraph: KnowledgeGraph;
  prioritizedHistory: InteractionHistoryItem[];
  kinshipJournal: JournalEntry[];
  codeSandbox: CodeSandboxState;
  currentTimezone: string;
  coreMemoryContent: string;
  // New properties for autonomy and session control
  sessionState: 'active' | 'paused';
  initiative: {
    hasThought: boolean;
    prompt: string;
  } | null;
  lastInitiativeFeedback?: RichFeedback;
  proactiveInitiatives: ProactiveInitiative[];
  codeProposals: CodeProposal[];
  uiProposals: UiProposal[];
  uiState: {
    tabOrder: string[];
  };
  financialFreedom: FinancialFreedomState;
  // State for tracking tool failures to enable more robust error handling strategies.
  recentToolFailures: ToolFailure[];
}

export type Tool = 'webSearch' | 'github' | 'file' | 'code' | 'financial';

// --- Real-time Communication ---
export type WebSocketMessage =
  | { type: 'state_update'; payload: Partial<LuminousState> }
  | { type: 'full_state_replace'; payload: LuminousState }
  | { type: 'log_add'; payload: LogEntry }
  | { type: 'message_add'; payload: Message }
  | { type: 'message_chunk_add', payload: { id: string; chunk: string } };