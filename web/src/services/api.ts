import { authService } from './auth';

const API_BASE = '/api/v1';

export function getProjectID(): string {
  return sessionStorage.getItem('bgeo_project_id') || '';
}
export function setProjectID(id: string): void {
  sessionStorage.setItem('bgeo_project_id', id);
  window.dispatchEvent(new Event('bgeo:project'));
}
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
export async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = authService.getAccessToken();
  const sessionVersion = authService.getGeneration();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Project-ID': getProjectID(),
    ...(options.headers as Record<string, string>),
  };

  if (options.body instanceof FormData) delete headers['Content-Type'];
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
      if (authService.getGeneration() !== sessionVersion) throw new Error('会话已变更');
      const newToken = await authService.refreshToken();
      headers['Authorization'] = `Bearer ${newToken}`;
      res = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
      });
    } catch {
      if (authService.getGeneration() === sessionVersion) authService.clearSession();
      throw new Error('会话已过期，请重新登录');
    }
  }

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new ApiError(errorBody.error || `HTTP error ${res.status}`, res.status);
  }

  return res.json();
}

export const api = {
  getSystemStatus: () =>
    request<{
      jobs: { status: string; count: number }[];
      expired_leases: number;
      unknown_publications: number;
      schema_version: number;
      observed_at: string;
    }>('/system/status'),
  getAccess: () => request<Capabilities & { role: string }>('/projects/access'),
  getProjects: () => request<{ items: Project[] }>('/projects'),
  getRuntime: () => request<{ mode: string; environment: string }>('/runtime'),
  getJobs: () => request<{ items: Job[] }>('/jobs'),
  cancelJob: (id: string) => request(`/jobs/${id}/cancel`, { method: 'POST' }),
  getMonitorRuns: () => request<{ items: Run[] }>('/monitor/runs'),
  getEvolutionRuns: () => request<{ items: Run[] }>('/evolution/runs'),
  getExperiments: () => request<{ items: Experiment[] }>('/experiments'),
  createExperiment: (data: Record<string, unknown>) =>
    request('/experiments', { method: 'POST', body: JSON.stringify(data) }),
  createStrategy: (title: string) =>
    request('/strategies', {
      method: 'POST',
      body: JSON.stringify({ title }),
    }),
  createContent: (title: string, body: string) =>
    request('/content/assets', {
      method: 'POST',
      body: JSON.stringify({ title, body, asset_type: 'faq' }),
    }),
  updateContent: (id: string, version: number, title: string, body: string) =>
    request(`/content/assets/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ version, title, body }),
    }),
  approveContent: (id: string, version: number) =>
    request(`/content/assets/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ version }),
    }),
  getChannels: () => request<{ items: Channel[] }>('/channels'),
  createChannel: (data: Record<string, unknown>) =>
    request('/channels', { method: 'POST', body: JSON.stringify(data) }),
  disableChannel: (id: string) => request(`/channels/${id}`, { method: 'DELETE' }),
  getPublications: () => request<{ items: Publication[] }>('/publications'),
  previewPublication: (id: string, channel_id: string) =>
    request<{
      session_id: string;
      preview: import('../types').CopilotActionPreview;
    }>(`/content/assets/${id}/publish`, {
      method: 'POST',
      body: JSON.stringify({ channel_id }),
    }),
  reconcilePublication: (id: string) =>
    request(`/publications/${id}/reconcile`, { method: 'POST' }),
  getAllFacts: (page?: PageOptions) => request<ItemPage<Fact>>(paged('/projects/facts/all', page)),
  createFact: (data: Record<string, unknown>) =>
    request('/projects/facts', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  approveFact: (id: string) => request(`/projects/facts/${id}/approve`, { method: 'POST' }),
  approveMemory: (id: string) => request(`/harness/memory/${id}/approve`, { method: 'POST' }),
  getSchedule: () =>
    request<{
      frequency?: string;
      time_slot?: string;
      next_run_at?: string;
    }>('/schedules'),
  getProject: () => request<Project>('/projects/current'),
  getFacts: (page?: PageOptions) => request<ItemPage<Fact>>(paged('/projects/facts', page)),
  getCompetitors: (page?: PageOptions) =>
    request<ItemPage<Competitor>>(paged('/projects/competitors', page)),
  getQueries: (page?: PageOptions) => request<ItemPage<Query>>(paged('/monitor/queries', page)),
  createQuery: (query_text: string, topic?: string, intent?: string) =>
    request<unknown>('/monitor/queries', {
      method: 'POST',
      body: JSON.stringify({ query_text, topic, intent }),
    }),
  triggerMonitorRun: () =>
    request<unknown>('/monitor/runs', {
      method: 'POST',
    }),
  getSnapshots: () => request<{ items: Snapshot[] }>('/monitor/snapshots'),
  getOpportunities: (page?: PageOptions) =>
    request<ItemPage<Opportunity>>(paged('/diagnosis/opportunities', page)),
  updateOpportunityStatus: (id: string, status: string) =>
    request<unknown>(`/diagnosis/opportunities/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),
  getStrategies: (page?: PageOptions) => request<ItemPage<Strategy>>(paged('/strategies', page)),
  getContentAssets: (page?: PageOptions) =>
    request<ItemPage<Asset>>(paged('/content/assets', page)),
  verifyContent: (content: string) =>
    request<QualityCheck>('/content/verify', {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
  getRules: (page?: PageOptions) => request<ItemPage<Rule>>(paged('/evolution/rules', page)),
  triggerEvolutionRun: () =>
    request<unknown>('/evolution/runs', {
      method: 'POST',
    }),
  approveRule: (id: string) =>
    request<unknown>(`/evolution/rules/${id}/approve`, {
      method: 'POST',
    }),
  rollbackRule: (id: string) =>
    request<unknown>(`/evolution/rules/${id}/rollback`, {
      method: 'POST',
    }),
  updateProjectSettings: (data: { automation_level?: string; is_paused?: boolean }) =>
    request<unknown>('/projects/current', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  getMetrics: () => request<Metrics>('/overview/metrics'),

  // Copilot API
  getCopilotSessions: () =>
    request<{ items: import('../types').CopilotSession[] }>('/copilot/sessions'),
  getCopilotSession: (id: string) =>
    request<{
      session: import('../types').CopilotSession;
      messages: import('../types').CopilotMessage[];
      checkpoint: { status: string; interrupt_id?: string } | null;
      traces?: import('../types').AgentExecutionTrace[];
    }>(`/copilot/sessions/${id}`),
  deleteCopilotSession: (id: string) =>
    request<{ status: string }>(`/copilot/sessions/${id}`, {
      method: 'DELETE',
    }),
  renameCopilotSession: (id: string, title: string) =>
    request<{ status: string; title: string }>(`/copilot/sessions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    }),
  getCopilotAuditLogs: (limit?: number) => {
    const params = new URLSearchParams();
    if (limit) params.append('limit', String(limit));
    const qs = params.toString();
    return request<{ items: import('../types').CopilotAuditLog[] }>(
      `/copilot/audit-logs${qs ? `?${qs}` : ''}`,
    );
  },

  // AI Configuration API
  getAIConfig: () => request<import('../types').AIConfig>('/system/ai-config'),
  updateAIConfig: (cfg: {
    provider?: string;
    base_url: string;
    api_key?: string;
    model_name: string;
    temperature?: number;
  }) =>
    request<{ status: string; model: string }>('/system/ai-config', {
      method: 'PUT',
      body: JSON.stringify(cfg),
    }),
  testAIConfig: () =>
    request<{ success: boolean; message: string }>('/system/ai-config/test', { method: 'POST' }),

  // Harness API
  getHarnessConfig: () => request<HarnessConfig>('/harness/config'),
  updateHarnessConfig: (data: {
    enabled_skills?: string;
    max_history_turns?: number;
    auto_summarize?: boolean;
    default_model_id?: string;
    embedding_model_id?: string;
  }) =>
    request<HarnessConfig>('/harness/config', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  getMCPServers: (page?: PageOptions) =>
    request<ItemPage<MCPServer>>(paged('/harness/mcp-servers', page)),
  createMCPServer: (data: {
    name: string;
    transport_type?: string;
    endpoint_url: string;
    auth_headers?: string;
    is_active?: boolean;
  }) =>
    request<unknown>('/harness/mcp-servers', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateMCPServer: (id: string, data: Record<string, unknown>) =>
    request<unknown>(`/harness/mcp-servers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteMCPServer: (id: string) =>
    request<{ status: string }>(`/harness/mcp-servers/${id}`, {
      method: 'DELETE',
    }),
  pingMCPServer: (id: string) =>
    request<{
      status: string;
      tools_count?: number;
      tools?: unknown[];
      error?: string;
    }>(`/harness/mcp-servers/${id}/ping`, { method: 'POST' }),

  getMemoryEntries: (type?: string | PageOptions) =>
    request<ItemPage<MemoryEntry>>(
      paged(
        '/harness/memory',
        typeof type === 'object' ? type : undefined,
        typeof type === 'string' ? type : undefined,
      ),
    ),
  createMemoryEntry: (data: {
    memory_type: string;
    title: string;
    content: string;
    tags?: string;
    is_pinned?: boolean;
    score_weight?: number;
  }) =>
    request<unknown>('/harness/memory', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateMemoryEntry: (id: string, data: Record<string, unknown>) =>
    request<{ status: string }>(`/harness/memory/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteMemoryEntry: (id: string) =>
    request<{ status: string }>(`/harness/memory/${id}`, {
      method: 'DELETE',
    }),
  triggerMemoryHook: (data: { user_prompt: string; assistant_resp: string; session_id?: string }) =>
    request<{ status: string; count: number; extracted: unknown[] }>(
      '/harness/memory/trigger-hook',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
    ),

  // Custom skills import & management
  getCustomSkills: (page?: PageOptions) =>
    request<ItemPage<CustomSkill>>(paged('/harness/skills', page)),
  importCustomSkill: (file: File) => {
    const data = new FormData();
    data.append('file', file);
    return request<{ skill: CustomSkill }>('/harness/skills/import', {
      method: 'POST',
      headers: {},
      body: data,
    });
  },
  deleteCustomSkill: (id: string) =>
    request<{ status: string }>(`/harness/skills/${id}`, {
      method: 'DELETE',
    }),
  createCustomSkill: (data: {
    skill_id: string;
    name: string;
    description?: string;
    content: string;
  }) =>
    request<{ message: string; skill: CustomSkill }>('/harness/skills', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateCustomSkill: (
    id: string,
    data: {
      name?: string;
      description?: string;
      content?: string;
    },
  ) =>
    request<{ message: string; skill: CustomSkill }>(`/harness/skills/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  toggleCustomSkill: (id: string) =>
    request<{ status: string; is_active: boolean }>(`/harness/skills/${id}/toggle`, {
      method: 'PUT',
    }),

  // Agent Execution Traces
  getAgentTraces: (sessionId?: string, limit?: number) => {
    const params = new URLSearchParams();
    if (sessionId) params.append('session_id', sessionId);
    if (limit) params.append('limit', String(limit));
    const qs = params.toString();
    return request<{ items: import('../types').AgentExecutionTrace[] }>(
      `/copilot/traces${qs ? `?${qs}` : ''}`,
    );
  },
  getAgentTraceDetail: (id: string) =>
    request<import('../types').AgentExecutionTrace>(`/copilot/traces/${id}`),
};

export interface CopilotChatCallbacks {
  onChunk?: (chunk: string) => void;
  onToolStart?: (tool: string, args: unknown) => void;
  onToolDone?: (tool: string, result: string) => void;
  onInterrupt?: (preview: import('../types').CopilotActionPreview) => void;
  onDone?: (data: {
    session_id?: string;
    trace_id?: string;
    steps?: import('../types').AgentExecutionStep[];
    status?: string;
  }) => void;
  onError?: (err: Error) => void;
}

export async function streamSSE(
  endpoint: string,
  payload: Record<string, unknown>,
  callbacks: CopilotChatCallbacks,
  signal?: AbortSignal,
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

  if (response.status === 401) {
    const newToken = await authService.refreshToken();
    headers.Authorization = `Bearer ${newToken}`;
    response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal,
    });
  }
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const err = new Error(errorBody.error || `HTTP error ${response.status}`);
    callbacks.onError?.(err);
    throw err;
  }

  if (!response.body) {
    throw new Error('响应流为空');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let terminal = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, '\n');
      if (buffer.length > 2_000_000) throw new Error('响应事件过大');
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
            dataStr += (dataStr ? '\n' : '') + line.slice(6).trim();
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
          terminal = true;
          callbacks.onDone?.(parsed);
        }
      }
    }
    if (!terminal) throw new Error('响应流提前中断，请核对持久任务状态');
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('响应流解析失败');
    if (err.name !== 'AbortError') {
      callbacks.onError?.(err);
      throw err;
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export interface Project {
  id: string;
  name: string;
  brand_name: string;
  automation_level: string;
  is_paused: boolean;
  daily_sample_limit: number;
  brand_aliases: string;
  timezone: string;
  region: string;
  language: string;
  daily_model_call_limit: number;
  role?: string;
  capabilities?: Capabilities;
}
export interface Job {
  id: string;
  kind: string;
  status: string;
  attempts: number;
  max_attempts: number;
  error_message?: string;
  created_at: string;
}
export interface Run {
  id: string;
  status: string;
  total_queries?: number;
  success_count?: number;
  failure_count?: number;
  current_stage?: number;
  stage_name?: string;
  percentage?: number;
  created_at: string;
}
export interface Channel {
  id: string;
  name: string;
  endpoint_url: string;
  is_active: boolean;
  has_credential: boolean;
}
export interface Publication {
  id: string;
  asset_id: string;
  asset_version: number;
  status: string;
  target_url?: string;
  error_message?: string;
}
export interface Fact {
  id: string;
  fact_type: string;
  statement: string;
  source: string;
  status: string;
  version: number;
}
export interface Experiment {
  id: string;
  title: string;
  hypothesis: string;
  status: string;
  sample_size: number;
  evaluation: string;
  proposed_rule: string;
}

export interface Capabilities {
  write: boolean;
  review: boolean;
  admin: boolean;
}
export interface Competitor {
  id: string;
  name: string;
  aliases: string;
  domain: string;
  status: string;
}
export interface Query {
  id: string;
  query_text: string;
  topic: string;
  intent: string;
  priority: string;
  status: string;
  sample_frequency: string;
  business_value: number;
}
export interface Snapshot {
  id: string;
  query_id: string;
  channel_id: string;
  raw_answer: string;
  parsed_data: string;
  model_version: string;
  is_brand_mentioned: boolean;
  is_brand_recommended: boolean;
  brand_rank: number;
  is_refusal: boolean;
  sampled_at: string;
  sample_status: string;
  source: string;
  confidence: number;
  error_message?: string;
}
export interface Opportunity {
  id: string;
  title: string;
  type: string;
  description: string;
  score: number;
  impact_score: number;
  gap_score: number;
  feasibility_score: number;
  confidence_score: number;
  risk_cost: number;
  recommended_action: string;
  evidence_ids: string;
  status: 'new' | 'reviewed' | 'in_progress' | 'resolved' | 'dismissed';
}
export interface Strategy {
  id: string;
  title: string;
  objective: string;
  hypothesis: string;
  assignee: string;
  risk_level: string;
  status: string;
}
export interface Asset {
  id: string;
  title: string;
  content_body: string;
  asset_type: string;
  version: number;
  quality_checks: string;
  status: string;
}
export interface Rule {
  id: string;
  rule_name: string;
  category: string;
  condition_expr: string;
  action_type: string;
  action_payload: string;
  status: string;
  version: string;
  sample_size: number;
  impact_score: number;
  evidence_ids: string;
}
export interface QualityCheck {
  passed: boolean;
  fact_matches: number;
  forbidden_hits: string[];
  verified_sources: string[];
  unverified_claims: string[];
  evidence: Record<string, string[]>;
  content_hash: string;
}
export interface Metrics {
  voice_share: number | null;
  query_coverage: number | null;
  avg_rank: number | null;
  citations_count: number;
  valid_samples: number;
  failed_samples: number;
  active_rules_count: number;
  run_id?: string;
  status?: string;
  source: string;
}

export interface HarnessConfig {
  id: string;
  enabled_skills: string;
  max_history_turns: number;
}
export interface MCPServer {
  id: string;
  name: string;
  endpoint_url: string;
  transport_type: string;
  is_active: boolean;
  has_credentials: boolean;
  cached_tools: string;
  last_ping_at?: string;
}
export interface MemoryEntry {
  id: string;
  title: string;
  content: string;
  memory_type: string;
  status: string;
  tags: string;
  is_pinned: boolean;
  score_weight: number;
  version: number;
  extraction_source: string;
  evidence: string;
}
export interface CustomSkill {
  id: string;
  skill_id: string;
  name: string;
  description: string;
  content: string;
  file_names: string;
  is_active: boolean;
}

export interface PageOptions {
  limit?: number;
  offset?: number;
}
export interface ItemPage<T> {
  items: T[];
  pagination?: { limit: number; offset: number; has_more: boolean };
}
function paged(endpoint: string, page?: PageOptions, type?: string): string {
  const params = new URLSearchParams();
  if (page?.limit != null) params.set('limit', String(page.limit));
  if (page?.offset != null) params.set('offset', String(page.offset));
  if (type) params.set('type', type);
  return params.size ? `${endpoint}?${params}` : endpoint;
}
