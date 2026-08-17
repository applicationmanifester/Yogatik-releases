export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  toolInvocations?: ToolInvocationSummary[];
  metadata?: MessageMetadata;
}

export interface ToolInvocationSummary {
  toolId: string;
  toolName: string;
  parameters: Record<string, unknown>;
  result?: unknown;
  error?: string;
  duration: number;
  status: 'pending' | 'success' | 'error';
}

export interface MessageMetadata {
  model?: string;
  tokensUsed?: number;
  finishReason?: string;
  correlationId?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  userId?: string;
  settings?: ChatSettings;
}

export interface ChatSettings {
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt?: string;
  enabledTools: string[];
}

export interface UserPreferences {
  theme: 'dark' | 'light' | 'system';
  language: string;
  fontSize: 'sm' | 'md' | 'lg';
  reducedMotion: boolean;
  autoScroll: boolean;
  showToolStatus: boolean;
  compactMode: boolean;
}

export interface AppState {
  currentSessionId: string | null;
  sessions: ChatSession[];
  preferences: UserPreferences;
  isLoading: boolean;
  error: string | null;
}