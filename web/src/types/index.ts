export type ViewType =
  | 'overview'
  | 'monitor'
  | 'diagnosis'
  | 'strategy'
  | 'content'
  | 'publish'
  | 'experiments'
  | 'evolution'
  | 'sources'
  | 'settings'
  | 'copilot'
  | 'harness';

export interface ToastItem {
  id: string;
  title: string;
  note?: string;
}

export interface ModalConfig {
  isOpen: boolean;
  title: string;
  defaultTopic?: string;
}

export interface CopilotSession {
  id: string;
  project_id: string;
  user_id: string;
  title: string;
  last_active_at: string;
  created_at: string;
}

export interface CopilotMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_calls?: string;
  card_type?: string;
  card_payload?: string;
  card_status?: string;
  trace_id?: string;
  steps?: AgentExecutionStep[];
  created_at: string;
}

export interface AgentExecutionStep {
  step_id: string;
  step_type: 'memory_retrieval' | 'skill_assembly' | 'model_inference' | 'tool_execution' | 'post_session_hook' | 'user_approval';
  title: string;
  description: string;
  duration_ms: number;
  timestamp: string;
  status: 'success' | 'pending' | 'failed' | 'fallback' | 'demo' | 'pending_confirmation';
  details?: Record<string, any>;
}

export interface AgentExecutionTrace {
  id: string;
  project_id: string;
  session_id: string;
  user_prompt: string;
  model_name: string;
  total_duration_ms: number;
  status: 'completed' | 'interrupted' | 'failed' | 'aborted';
  timeline_json: string;
  created_at: string;
}

export interface CopilotActionPreview {
  interrupt_id: string;
  card_type: string;
  title: string;
  description: string;
  details: Record<string, any>;
  tool_name: string;
  tool_args: string;
}

export interface CopilotAuditLog {
  id: string;
  session_id: string;
  tool_name: string;
  input_payload: string;
  execution_risk: string;
  user_confirmed: boolean;
  execution_status: string;
  error_message?: string;
  executed_at: string;
}

export interface AIConfig {
  id: string;
  provider: string;
  base_url: string;
  model_name: string;
  temperature: number;
  masked_key: string;
  is_active: boolean;
}
