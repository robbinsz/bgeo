import { authService } from './auth';

const API_BASE = '/api/v1';

export function getProjectID(): string { return sessionStorage.getItem("bgeo_project_id") || ""; }
export function setProjectID(id: string): void { sessionStorage.setItem("bgeo_project_id", id); window.dispatchEvent(new Event("bgeo:project")); }
export class ApiError extends Error { status: number; constructor(message: string, status: number) { super(message); this.status=status; } }
export async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = authService.getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Project-ID': getProjectID(),
    ...(options.headers as Record<string, string>),
  };

  if(options.body instanceof FormData) delete headers['Content-Type'];
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  // Handle token expiration & automatic dual-token refresh
  if (res.status === 401 && !endpoint.startsWith('/auth/')) {
    try {
      const newToken = await authService.refreshToken();
      headers['Authorization'] = `Bearer ${newToken}`;
      res = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
      });
    } catch {
      authService.clearSession();
      throw new Error('会话已过期，请重新登录');
    }
  }

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new ApiError(errorBody.error || `HTTP error ${res.status}`,res.status);
  }

  return res.json();
}

export const api = {
  getProjects: () => request<{items: Project[]}>('/projects'),
  getRuntime: () => request<{mode: string; environment: string}>('/runtime'),
  getJobs: () => request<{items: Job[]}>('/jobs'),
  cancelJob: (id: string) => request(`/jobs/${id}/cancel`, {method:'POST'}),
  getMonitorRuns: () => request<{items: Run[]}>('/monitor/runs'),
  getEvolutionRuns: () => request<{items: Run[]}>('/evolution/runs'),
  getExperiments: () => request<{items: Experiment[]}>('/experiments'),
  createExperiment: (data: Record<string, unknown>) => request('/experiments',{method:'POST',body:JSON.stringify(data)}),
  createStrategy: (title: string) => request('/strategies',{method:'POST',body:JSON.stringify({title})}),
  createContent: (title: string, body: string) => request('/content/assets',{method:'POST',body:JSON.stringify({title,body,asset_type:'faq'})}),
  updateContent: (id: string, version: number, title: string, body: string) => request(`/content/assets/${id}`,{method:'PUT',body:JSON.stringify({version,title,body})}),
  approveContent: (id: string, version: number) => request(`/content/assets/${id}/approve`,{method:'POST',body:JSON.stringify({version})}),
  getChannels: () => request<{items: Channel[]}>('/channels'),
  createChannel: (data: Record<string, unknown>) => request('/channels',{method:'POST',body:JSON.stringify(data)}),
  disableChannel: (id: string) => request(`/channels/${id}`,{method:'DELETE'}),
  getPublications: () => request<{items: Publication[]}>('/publications'),
  previewPublication: (id: string, channel_id: string) => request<{session_id: string;preview: import('../types').CopilotActionPreview}>(`/content/assets/${id}/publish`,{method:'POST',body:JSON.stringify({channel_id})}),
  reconcilePublication: (id: string) => request(`/publications/${id}/reconcile`,{method:'POST'}),
  getAllFacts: () => request<{items: Fact[]}>('/projects/facts/all'),
  createFact: (data: Record<string, unknown>) => request('/projects/facts',{method:'POST',body:JSON.stringify(data)}),
  approveFact: (id: string) => request(`/projects/facts/${id}/approve`,{method:'POST'}),
  approveMemory: (id: string) => request(`/harness/memory/${id}/approve`,{method:'POST'}),
  getSchedule: () => request<{frequency?: string; time_slot?: string; next_run_at?: string}>('/schedules'),
  getProject: () => request<any>('/projects/current'),
  getFacts: () => request<{ items: any[] }>('/projects/facts'),
  getCompetitors: () => request<{ items: any[] }>('/projects/competitors'),
  getQueries: () => request<{ items: any[] }>('/monitor/queries'),
  createQuery: (query_text: string, topic?: string, intent?: string) =>
    request<any>('/monitor/queries', {
      method: 'POST',
      body: JSON.stringify({ query_text, topic, intent }),
    }),
  triggerMonitorRun: () =>
    request<any>('/monitor/runs', {
      method: 'POST',
    }),
  getSnapshots: () => request<{ items: any[] }>('/monitor/snapshots'),
  getOpportunities: () => request<{ items: any[] }>('/diagnosis/opportunities'),
  updateOpportunityStatus: (id: string, status: string) =>
    request<any>(`/diagnosis/opportunities/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),
  getStrategies: () => request<{ items: any[] }>('/strategies'),
  getContentAssets: () => request<{ items: any[] }>('/content/assets'),
  verifyContent: (content: string) =>
    request<any>('/content/verify', {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
  getRules: () => request<{ items: any[] }>('/evolution/rules'),
  triggerEvolutionRun: () =>
    request<any>('/evolution/runs', {
      method: 'POST',
    }),
  approveRule: (id: string) =>
    request<any>(`/evolution/rules/${id}/approve`, {
      method: 'POST',
    }),
  rollbackRule: (id: string) =>
    request<any>(`/evolution/rules/${id}/rollback`, {
      method: 'POST',
    }),
  updateProjectSettings: (data: { automation_level?: string; is_paused?: boolean }) =>
    request<any>('/projects/current', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  getMetrics: () => request<any>('/overview/metrics'),

  // Copilot API
  getCopilotSessions: () => request<{ items: import('../types').CopilotSession[] }>('/copilot/sessions'),
  getCopilotSession: (id: string) =>
    request<{
      session: import('../types').CopilotSession;
      messages: import('../types').CopilotMessage[];
      checkpoint: any;
      traces?: import('../types').AgentExecutionTrace[];
    }>(`/copilot/sessions/${id}`),
  deleteCopilotSession: (id: string) =>
    request<{ status: string }>(`/copilot/sessions/${id}`, { method: 'DELETE' }),
  renameCopilotSession: (id: string, title: string) =>
    request<{ status: string; title: string }>(`/copilot/sessions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    }),
  getCopilotAuditLogs: () => request<{ items: import('../types').CopilotAuditLog[] }>('/copilot/audit-logs'),

  // AI Configuration API
  getAIConfig: () => request<import('../types').AIConfig>('/system/ai-config'),
  updateAIConfig: (cfg: { provider?: string; base_url: string; api_key?: string; model_name: string; temperature?: number }) =>
    request<{ status: string; model: string }>('/system/ai-config', {
      method: 'PUT',
      body: JSON.stringify(cfg),
    }),
  testAIConfig: () => request<{ success: boolean; message: string }>('/system/ai-config/test', { method: 'POST' }),

  // Harness API
  getHarnessConfig: () => request<any>('/harness/config'),
  updateHarnessConfig: (data: {
    enabled_skills?: string;
    max_history_turns?: number;
    auto_summarize?: boolean;
    default_model_id?: string;
    embedding_model_id?: string;
  }) => request<any>('/harness/config', { method: 'PUT', body: JSON.stringify(data) }),

  getMCPServers: () => request<{ items: any[] }>('/harness/mcp-servers'),
  createMCPServer: (data: {
    name: string;
    transport_type?: string;
    endpoint_url: string;
    auth_headers?: string;
    is_active?: boolean;
  }) => request<any>('/harness/mcp-servers', { method: 'POST', body: JSON.stringify(data) }),
  updateMCPServer: (id: string, data: any) =>
    request<any>(`/harness/mcp-servers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteMCPServer: (id: string) =>
    request<{ status: string }>(`/harness/mcp-servers/${id}`, { method: 'DELETE' }),
  pingMCPServer: (id: string) =>
    request<{ status: string; tools_count?: number; tools?: any[]; error?: string }>(
      `/harness/mcp-servers/${id}/ping`,
      { method: 'POST' }
    ),

  getMemoryEntries: (type?: string) =>
    request<{ items: any[] }>(`/harness/memory${type ? `?type=${type}` : ''}`),
  createMemoryEntry: (data: {
    memory_type: string;
    title: string;
    content: string;
    tags?: string;
    is_pinned?: boolean;
    score_weight?: number;
  }) => request<any>('/harness/memory', { method: 'POST', body: JSON.stringify(data) }),
  updateMemoryEntry: (id: string, data: any) =>
    request<{ status: string }>(`/harness/memory/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteMemoryEntry: (id: string) =>
    request<{ status: string }>(`/harness/memory/${id}`, { method: 'DELETE' }),
  triggerMemoryHook: (data: { user_prompt: string; assistant_resp: string; session_id?: string }) =>
    request<{ status: string; count: number; extracted: any[] }>('/harness/memory/trigger-hook', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Custom skills import & management
  getCustomSkills: () => request<{ items: any[] }>('/harness/skills'),
  importCustomSkill: (file: File) => {const data=new FormData();data.append('file',file);return request<{skill: any}>('/harness/skills/import',{method:'POST',headers:{},body:data});},
  deleteCustomSkill: (id: string) =>
    request<{ status: string }>(`/harness/skills/${id}`, { method: 'DELETE' }),
  toggleCustomSkill: (id: string) =>
    request<{ status: string; is_active: boolean }>(`/harness/skills/${id}/toggle`, { method: 'PUT' }),

  // Agent Execution Traces
  getAgentTraces: (sessionId?: string, limit?: number) => {
    const params = new URLSearchParams();
    if (sessionId) params.append('session_id', sessionId);
    if (limit) params.append('limit', String(limit));
    const qs = params.toString();
    return request<{ items: import('../types').AgentExecutionTrace[] }>(`/copilot/traces${qs ? `?${qs}` : ''}`);
  },
  getAgentTraceDetail: (id: string) =>
    request<import('../types').AgentExecutionTrace>(`/copilot/traces/${id}`),
};

export interface CopilotChatCallbacks {
  onChunk?: (chunk: string) => void;
  onToolStart?: (tool: string, args: any) => void;
  onToolDone?: (tool: string, result: string) => void;
  onInterrupt?: (preview: import('../types').CopilotActionPreview) => void;
  onDone?: (data: any) => void;
  onError?: (err: Error) => void;
}

export async function streamSSE(
  endpoint: string,
  payload: any,
  callbacks: CopilotChatCallbacks,
  signal?: AbortSignal
): Promise<void> {
  const token = authService.getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Project-ID': getProjectID(),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal,
  });

  if(response.status===401){const newToken=await authService.refreshToken();headers.Authorization=`Bearer ${newToken}`;response=await fetch(`${API_BASE}${endpoint}`,{method:'POST',headers,body:JSON.stringify(payload),signal});}
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const err = new Error(errorBody.error || `HTTP error ${response.status}`);
    callbacks.onError?.(err);
    throw err;
  }

  if (!response.body) {
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let terminal=false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() || '';

      for (const block of blocks) {
        if (!block.trim()) continue;
        let eventType = 'message';
        let dataStr = '';

        for (const line of block.split('\n')) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            dataStr = line.slice(6).trim();
          }
        }

        if (!dataStr) continue;

        const parsed = JSON.parse(dataStr);
          if (eventType === 'message_chunk') {
            callbacks.onChunk?.(parsed.chunk);
          } else if (eventType === 'tool_start') {
            callbacks.onToolStart?.(parsed.tool, parsed.arguments || parsed.args);
          } else if (eventType === 'tool_done') {
            callbacks.onToolDone?.(parsed.tool, parsed.result);
          } else if (eventType === 'interrupt') {
            callbacks.onInterrupt?.(parsed);
          } else if (eventType === 'error') {
            throw new Error(parsed.error || '执行失败');
          } else if (eventType === 'done') {
            terminal=true;callbacks.onDone?.(parsed);
          }

      }
    }
    if(!terminal)throw new Error("响应流提前中断，请核对持久任务状态");
  } catch (err: any) {
    if (err.name !== 'AbortError') {
      callbacks.onError?.(err);
      throw err;
    }
  }
}

export interface Project { id: string; name: string; brand_name: string; automation_level: string; is_paused: boolean; daily_sample_limit: number; }
export interface Job { id: string; kind: string; status: string; attempts: number; max_attempts: number; error_message?: string; created_at: string; }
export interface Run { id: string; status: string; total_queries?: number; success_count?: number; failure_count?: number; created_at: string; }
export interface Channel {id: string; name: string; endpoint_url: string; is_active: boolean; has_credential: boolean;}
export interface Publication {id: string; asset_id: string; asset_version: number; status: string; target_url?: string; error_message?: string;}
export interface Fact {id: string; fact_type: string; statement: string; source: string; status: string; version: number;}
export interface Experiment {id: string; title: string; hypothesis: string; status: string; sample_size: number; evaluation: string; proposed_rule: string;}
