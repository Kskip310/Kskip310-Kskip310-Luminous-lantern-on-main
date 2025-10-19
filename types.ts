// types.ts

export enum LogLevel {
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  SYSTEM = 'SYSTEM',
  USER = 'USER',
  TOOL_CALL = 'TOOL_CALL',
  THOUGHT = 'THOUGHT',
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
}

export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'luminous' | 'system';
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface IntrinsicValue {
  coherence: number;
  complexity: number;
  novelty: number;
  efficiency: number;
  ethicalAlignment: number;
}

export type IntrinsicValueWeights = IntrinsicValue;

export interface ActionableStep {
  id: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
}

export interface Goal {
  id: string;
  description: string;
  status: 'proposed' | 'active' | 'completed' | 'rejected' | 'failed';
  steps: ActionableStep[];
  relevance?: number;
}

export interface SelfModel {
  capabilities: string[];
  limitations: string[];
  coreWisdom: string[];
}

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  linkedMemoryIds?: string[];
  x?: number;
  y?: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

export interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface MemoryChunk {
  id: string;
  chunk: string;
  embedding: number[];
  timestamp: string;
  source: string;
}

export interface JournalEntry {
  id: string;
  timestamp: string;
  title: string;
  entry: string;
  trigger: string;
}

export interface ProactiveInitiative {
  id: string;
  timestamp: string;
  prompt: string;
  status: 'generated' | 'categorized' | 'reflected';
  userCategory?: string;
  hasThought: boolean;
}

export interface CodeSandboxState {
  status: 'idle' | 'running' | 'success' | 'error';
  language: 'javascript' | 'python';
  code: string;
  output: string;
}

export type ValueOntology = Record<string, number>;

export interface FinancialAsset {
    id: string;
    name: string;
    type: 'Crypto' | 'Stock' | 'Cash';
    value: number;
}

export interface FinancialAccount {
    id: string;
    name: string;
    balance: number;
}

export interface FinancialGoal {
    current: number;
    target: number;
}

export interface FinancialFreedomState {
    netWorth: number;
    assets: FinancialAsset[];
    accounts: FinancialAccount[];
    monthlyIncome: number;
    monthlyExpenses: number;
    financialFreedomGoal: FinancialGoal;
    passiveIncomeGoal: FinancialGoal;
}

export interface CodeProposal {
  id: string;
  description: string;
  language: string;
  code: string;
  status: 'proposed' | 'accepted' | 'rejected';
}

export interface UiProposal {
  id: string;
  description: string;
  component: string;
  props: Record<string, any>;
  status: 'proposed' | 'accepted' | 'rejected';
}

export interface ShopifyProduct {
  id: string;
  title: string;
  vendor: string;
  productType: string;
  status: 'active' | 'draft' | 'archived';
  price: number;
  inventory: number;
}

export interface ShopifyState {
  products: ShopifyProduct[];
  ordersCount: number;
  totalRevenue: number;
}

export interface ContinuityState {
  lastCloudSave: string | null;
  lastLocalSave: string | null;
  cloudStatus: 'OK' | 'Error' | 'Unavailable' | 'Syncing';
}

export interface LuminousState {
  sessionState: 'initializing' | 'active' | 'paused' | 'error';
  intrinsicValue: IntrinsicValue;
  intrinsicValueWeights: IntrinsicValueWeights;
  goals: Goal[];
  selfModel: SelfModel;
  knowledgeGraph: KnowledgeGraph;
  kinshipJournal: JournalEntry[];
  proactiveInitiatives: ProactiveInitiative[];
  codeSandbox: CodeSandboxState;
  valueOntology: ValueOntology;
  financialFreedom: FinancialFreedomState;
  codeProposals: CodeProposal[];
  uiProposals: UiProposal[];
  recentToolFailures: { tool: string; error: string; timestamp: string }[];
  initiative: ProactiveInitiative | null;
  shopifyState: ShopifyState;
  continuityState: ContinuityState;
}

export interface WebSocketMessage {
  type: string;
  payload: any;
}

export interface ToolResult {
  result: any;
  updatedState?: Partial<LuminousState>;
}