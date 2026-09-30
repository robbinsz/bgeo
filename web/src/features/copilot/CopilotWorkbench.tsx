import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bot,
  User,
  ArrowUp,
  PlusCircle,
  Trash2,
  Loader2,
  BarChart3,
  Play,
  FileText,
  Clock,
  Sliders,
  SendHorizontal,
  ChevronRight,
  ChevronLeft,
  Cpu,
  Plug,
  Brain,
  Zap,
  Settings,
  CheckSquare,
  Square,
  Circle,
  CheckCircle2,
  Activity,
  RefreshCw,
  X,
  ExternalLink,
} from 'lucide-react';
import type { CopilotSession, CopilotMessage, CopilotActionPreview, AgentExecutionTrace } from '../../types';
import { api, streamSSE } from '../../services/api';
import { CopilotActionCard } from '../../components/copilot/CopilotActionCard';
import { AgentTraceTimeline } from './AgentTraceTimeline';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const SUGGESTIONS = [
  { icon: BarChart3, text: '查看当前的 GEO 效果与竞品差距' },
  { icon: Play, text: '立即跑一次全量监测拨测' },
  { icon: FileText, text: '针对当前机会生成一篇优化草稿' },
  { icon: Clock, text: '查看自动化定时任务运行状态' },
  { icon: Sliders, text: '把每日定时拨测改成早上 9 点跑' },
  { icon: SendHorizontal, text: '发布一条关于透明收费的答复内容' },
];

const BUILTIN_SKILLS = [
  { id: 'monitor', label: '监测拨测巡检', desc: '监测、拨测、定时任务', risk: 'safe' },
  { id: 'diagnosis', label: '机会差距诊断', desc: '竞品归因、落差分析', risk: 'safe' },
  { id: 'content', label: '事实核验创作', desc: '内容生成、质检评分', risk: 'safe' },
  { id: 'publish', label: '渠道发布与分发', desc: '高危 · 需人工审批', risk: 'high' },
  { id: 'evolution', label: '自进化策略反思', desc: '经验切片、偏好记录', risk: 'safe' },
];

const ACTIVE_TOOL_LABELS: Record<string, string> = {
  run_monitor_batch: '正在并发执行全量关键词监测拨测...',
  get_geo_overview_and_gaps: '正在检索最新 GEO 提及率与落后机会数据...',
  generate_optimized_content: '正在基于品牌事实库生成针对性答复草稿...',
  get_schedule_status: '正在读取定时任务调度与执行历史...',
};

const WELCOME_CONTENT = `你好，我是 **GeoPilot 运营副驾驶**。

我已接入后台全链路治理体系，可协同你完成以下任务：
• **效果诊断与竞品归因**：实时查询品牌在主流 AI 问答平台中的提及率、推荐率与落后机会
• **任务编排与定时管理**：即时启动全量关键词拨测批次，或按需调整每日自动化定时调度计划
• **内容生成与安全质检**：基于企业事实库与透明计价条款，针对落后机会自动撰写针对性优化答复
• **渠道发布与风控审批**：对外部渠道发布与关键配置变更执行安全确认闸门，经人工审批后方可生效

请在下方输入你的工作指令，或直接选择预置操作建议。`;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** 左栏：会话列表 */
const SessionSidebar: React.FC<{
  sessions: CopilotSession[];
  currentSessionId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (e: React.MouseEvent, id: string) => void;
}> = ({ sessions, currentSessionId, onSelect, onNew, onDelete }) => (
  <div
    style={{
      width: '220px',
      flexShrink: 0,
      borderRight: '1px solid rgba(226, 232, 240, 0.8)',
      display: 'flex',
      flexDirection: 'column',
      background: '#f8fafc',
      height: '100%',
      overflow: 'hidden',
    }}
  >
    {/* Header */}
    <div
      style={{
        height: '52px',
        padding: '0 14px',
        borderBottom: '1px solid rgba(226, 232, 240, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        boxSizing: 'border-box',
      }}
    >
      <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        会话历史
      </span>
      <button
        type="button"
        onClick={onNew}
        title="新建会话"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px 8px',
          borderRadius: '6px',
          background: '#0f172a',
          color: '#f8fafc',
          border: 'none',
          cursor: 'pointer',
          fontSize: '11px',
          fontWeight: 500,
        }}
      >
        <PlusCircle size={12} />
        新建
      </button>
    </div>

    {/* Session list */}
    <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
      {sessions.length === 0 ? (
        <div style={{ padding: '32px 0', textAlign: 'center', fontSize: '11px', color: '#94a3b8' }}>
          暂无历史会话
        </div>
      ) : (
        sessions.map((s) => (
          <div
            key={s.id}
            onClick={() => onSelect(s.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 10px',
              borderRadius: '8px',
              cursor: 'pointer',
              marginBottom: '2px',
              background: currentSessionId === s.id ? '#fff' : 'transparent',
              border: currentSessionId === s.id ? '1px solid #e2e8f0' : '1px solid transparent',
              boxShadow: currentSessionId === s.id ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
              transition: 'background 0.12s, border-color 0.12s',
            }}
            onMouseEnter={(e) => {
              if (currentSessionId !== s.id) (e.currentTarget as HTMLDivElement).style.background = '#f1f5f9';
            }}
            onMouseLeave={(e) => {
              if (currentSessionId !== s.id) (e.currentTarget as HTMLDivElement).style.background = 'transparent';
            }}
          >
            <div style={{ minWidth: 0, flex: 1, marginRight: '6px' }}>
              <div style={{ fontSize: '12px', fontWeight: 500, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.title}
              </div>
              <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px', fontFamily: 'ui-monospace,monospace' }}>
                {new Date(s.last_active_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => onDelete(e, s.id)}
              title="删除会话"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '2px',
                borderRadius: '4px',
                color: '#94a3b8',
                display: 'flex',
                alignItems: 'center',
                opacity: 0,
                transition: 'opacity 0.1s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '0')}
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))
      )}
    </div>
  </div>
);

/** 右栏：Harness 运行面板 */
const HarnessPanel: React.FC<{
  enabledSkills: string[];
  onToggleSkill: (id: string) => void;
  onOpenConfig: () => void;
  mcpServers: any[];
  memoryHints: string[];
}> = ({ enabledSkills, onToggleSkill, onOpenConfig, mcpServers, memoryHints }) => {
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <div
        style={{
          width: '36px',
          flexShrink: 0,
          borderLeft: '1px solid rgba(226, 232, 240, 0.8)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: '12px',
          background: '#f8fafc',
          gap: '16px',
          height: '100%',
        }}
      >
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          title="展开 Harness 面板"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '4px' }}
        >
          <ChevronLeft size={14} />
        </button>
        <Zap size={13} color="#64748b" />
        <Cpu size={13} color="#64748b" />
        <Plug size={13} color="#64748b" />
        <Brain size={13} color="#64748b" />
      </div>
    );
  }

  return (
    <div
      style={{
        width: '240px',
        flexShrink: 0,
        borderLeft: '1px solid rgba(226, 232, 240, 0.8)',
        display: 'flex',
        flexDirection: 'column',
        background: '#f8fafc',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          height: '52px',
          padding: '0 14px',
          borderBottom: '1px solid rgba(226, 232, 240, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Zap size={13} color="#f59e0b" />
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Harness
          </span>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          title="收起面板"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '2px' }}
        >
          <ChevronRight size={14} />
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 12px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Skills */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '8px' }}>
            <Cpu size={11} color="#475569" />
            <span style={{ fontSize: '10px', fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              挂载技能
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {BUILTIN_SKILLS.map((skill) => {
              const enabled = enabledSkills.includes(skill.id);
              return (
                <button
                  key={skill.id}
                  type="button"
                  onClick={() => onToggleSkill(skill.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '7px',
                    padding: '7px 8px',
                    borderRadius: '7px',
                    background: enabled ? '#fff' : 'transparent',
                    border: enabled ? '1px solid #e2e8f0' : '1px solid transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    boxShadow: enabled ? '0 1px 2px rgba(0,0,0,0.04)' : 'none',
                    transition: 'background 0.1s, border-color 0.1s',
                  }}
                >
                  {enabled
                    ? <CheckSquare size={13} color="#0f172a" style={{ marginTop: '1px', flexShrink: 0 }} />
                    : <Square size={13} color="#94a3b8" style={{ marginTop: '1px', flexShrink: 0 }} />
                  }
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 500, color: enabled ? '#0f172a' : '#64748b' }}>
                      {skill.label}
                    </div>
                    <div style={{ fontSize: '10px', color: skill.risk === 'high' ? '#ef4444' : '#94a3b8', marginTop: '1px' }}>
                      {skill.desc}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* MCP Servers */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '8px' }}>
            <Plug size={11} color="#475569" />
            <span style={{ fontSize: '10px', fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              MCP 服务连接
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {mcpServers.map((srv) => (
              <div
                key={srv.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '7px',
                  padding: '6px 8px',
                  borderRadius: '7px',
                  background: '#fff',
                  border: '1px solid #f1f5f9',
                }}
              >
                <Circle
                  size={7}
                  fill={srv.is_active ? '#10b981' : '#d1d5db'}
                  color={srv.is_active ? '#10b981' : '#d1d5db'}
                  style={{ flexShrink: 0 }}
                />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: '11px', fontWeight: 500, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {srv.name}
                  </div>
                  <div style={{ fontSize: '9px', color: '#94a3b8', fontFamily: 'ui-monospace,monospace' }}>
                    {srv.transport_type} · {srv.is_active ? '已配置（需测试连接）' : '未启用'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Memory hints */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '8px' }}>
            <Brain size={11} color="#475569" />
            <span style={{ fontSize: '10px', fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              记忆命中
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {memoryHints.map((hint, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '6px',
                  padding: '6px 8px',
                  borderRadius: '7px',
                  background: '#fff',
                  border: '1px solid #f1f5f9',
                }}
              >
                <CheckCircle2 size={10} color="#10b981" style={{ marginTop: '2px', flexShrink: 0 }} />
                <span style={{ fontSize: '10px', color: '#475569', lineHeight: 1.5 }}>{hint}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Config button */}
        <button
          type="button"
          onClick={onOpenConfig}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '8px',
            borderRadius: '8px',
            background: '#0f172a',
            color: '#f8fafc',
            border: 'none',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: 500,
            marginTop: 'auto',
          }}
        >
          <Settings size={12} />
          完整 Harness 配置
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export const CopilotWorkbench: React.FC = () => {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<CopilotSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [requestError, setRequestError] = useState('');
  useEffect(()=>{if(!currentSessionId)return;const timer=setInterval(()=>{if(!isStreaming&&messages.some(m=>m.card_status==='queued'))void loadSessionDetails(currentSessionId)},3000);return()=>clearInterval(timer)},[currentSessionId,isStreaming,messages]);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [enabledSkills, setEnabledSkills] = useState<string[]>(
    ['monitor', 'diagnosis', 'content', 'evolution']
  );
  const [selectedModel,setSelectedModel]=useState('');
  const [mcpServers,setMCPServers]=useState<any[]>([]);
  const [memoryHints,setMemoryHints]=useState<string[]>([]);
  const [configError,setConfigError]=useState('');


  // Agent Trace Modal
  const [activeTrace, setActiveTrace] = useState<AgentExecutionTrace | null>(null);
  const [loadingTrace, setLoadingTrace] = useState(false);
  const [showTraceModal, setShowTraceModal] = useState(false);

  const handleOpenTrace = async (traceId?: string) => {
    setLoadingTrace(true);
    setShowTraceModal(true);
    try {
      if (traceId) {
        const trace = await api.getAgentTraceDetail(traceId);
        setActiveTrace(trace);
      } else if (currentSessionId) {
        const res = await api.getAgentTraces(currentSessionId, 1);
        if (res.items && res.items.length > 0) {
          setActiveTrace(res.items[0]);
        } else {
          setActiveTrace(null);
        }
      }
    } catch {
      setActiveTrace(null);
    } finally {
      setLoadingTrace(false);
    }
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

  useEffect(() => {
    loadSessions();
    loadModelConfig();
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const loadModelConfig=async()=>{try{const [ai,harness,servers,memories]=await Promise.all([api.getAIConfig(),api.getHarnessConfig(),api.getMCPServers(),api.getMemoryEntries()]);setSelectedModel(ai.model_name);setEnabledSkills(JSON.parse(harness.enabled_skills));setMCPServers(servers.items);setMemoryHints(memories.items.filter(m=>m.status==='approved'&&m.memory_type!=='brand_truth').map(m=>m.title));setConfigError('')}catch(e){setConfigError(e instanceof Error?e.message:'读取配置失败')}};

  useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming, activeTool]);

  // --- Session management ---
  async function loadSessions() {
    try {
      const res = await api.getCopilotSessions();
      setSessions(res.items || []);
      if (!currentSessionId && res.items && res.items.length > 0) {
        loadSessionDetails(res.items[0].id);
      } else if (!currentSessionId) {
        startNewSession();
      }
    } catch {
      startNewSession();
    }
  };

  async function loadSessionDetails(sessionId: string) {
    try {
      setCurrentSessionId(sessionId);
      const res = await api.getCopilotSession(sessionId);
      setMessages(res.messages || []);
    } catch {
      setMessages([]);
    }
  };

  const startNewSession = () => {
    setCurrentSessionId(null);
    setMessages([
      {
        id: 'welcome',
        session_id: '',
        role: 'assistant',
        content: WELCOME_CONTENT,
        created_at: new Date().toISOString(),
      },
    ]);
  };

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    try {
      await api.deleteCopilotSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (currentSessionId === sessionId) startNewSession();
    } catch {
      // ignore
    }
  };

  const handleToggleSkill=async(skillId:string)=>{const next=enabledSkills.includes(skillId)?enabledSkills.filter(s=>s!==skillId):[...enabledSkills,skillId];try{await api.updateHarnessConfig({enabled_skills:JSON.stringify(next)});setEnabledSkills(next);setConfigError('')}catch(e){setConfigError(e instanceof Error?e.message:'配置保存失败')}};

  // --- Chat ---
  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || isStreaming) return;

    setInput('');
    setRequestError('');
    setIsStreaming(true);
    setActiveTool(null);

    const tempUserMsg: CopilotMessage = {
      id: `user_${Date.now()}`,
      session_id: currentSessionId || '',
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };
    const tempAsstMsg: CopilotMessage = {
      id: `asst_${Date.now()}`,
      session_id: currentSessionId || '',
      role: 'assistant',
      content: '',
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempUserMsg, tempAsstMsg]);

    let fullContent = '';

    try {
      await streamSSE(
        '/copilot/chat',
        {
          session_id: currentSessionId || undefined,
          message: text,
          context: { current_route: '/copilot', enabled_skills: enabledSkills },
        },
        {
          onChunk: (chunk: string) => {
            fullContent += chunk;
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.role === 'assistant') last.content = fullContent;
              return updated;
            });
          },
          onToolStart: (tool: string) => setActiveTool(tool),
          onToolDone: (_tool: string, result: string) => {
            setActiveTool(null);
            fullContent += `\n\n${result}`;
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.role === 'assistant') last.content = fullContent;
              return updated;
            });
          },
          onInterrupt: (preview: CopilotActionPreview) => {
            setActiveTool(null);
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.role === 'assistant') {
                last.card_type = preview.card_type;
                last.card_payload = JSON.stringify(preview);
                last.card_status = 'pending';
              }
              return updated;
            });
          },
          onDone: (data: any) => {
            if (data.session_id) {
              setCurrentSessionId(data.session_id);
              loadSessions();
            }
            if (data.trace_id) {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === 'assistant') {
                  last.trace_id = data.trace_id;
                }
                return updated;
              });
            }
            setIsStreaming(false);
            setActiveTool(null);
          },
          onError: (error) => {
            setRequestError(error.message);
            setIsStreaming(false);
            setActiveTool(null);
          },
        }
      );
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : '请求失败，请重试');
      setIsStreaming(false);
      setActiveTool(null);
    }
  };

  const handleConfirmAction = async (interruptId: string) => {
    if (!currentSessionId) return;
    setIsStreaming(true);

    let fullContent = '';
    const tempAsstMsg: CopilotMessage = {
      id: `asst_confirm_${Date.now()}`,
      session_id: currentSessionId,
      role: 'assistant',
      content: '',
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempAsstMsg]);

    try {
      await streamSSE(
        '/copilot/resume',
        { session_id: currentSessionId, interrupt_id: interruptId, action: 'confirm' },
        {
          onChunk: (chunk: string) => {
            fullContent += chunk;
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.role === 'assistant') last.content = fullContent;
              return updated;
            });
          },
          onDone: () => {
            setIsStreaming(false);
            loadSessionDetails(currentSessionId);
          },
          onError: (error) => { setRequestError(error.message); setIsStreaming(false); },
        }
      );
    } catch(e) {
      setIsStreaming(false);throw e;
    }
  };

  const handleCancelAction = async (interruptId: string) => {
    if (!currentSessionId) return;
    setIsStreaming(true);

    let fullContent = '';
    const tempAsstMsg: CopilotMessage = {
      id: `asst_cancel_${Date.now()}`,
      session_id: currentSessionId,
      role: 'assistant',
      content: '',
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempAsstMsg]);

    try {
      await streamSSE(
        '/copilot/resume',
        { session_id: currentSessionId, interrupt_id: interruptId, action: 'cancel' },
        {
          onChunk: (chunk: string) => {
            fullContent += chunk;
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.role === 'assistant') last.content = fullContent;
              return updated;
            });
          },
          onDone: () => {
            setIsStreaming(false);
            loadSessionDetails(currentSessionId);
          },
          onError: (error) => { setRequestError(error.message); setIsStreaming(false); },
        }
      );
    } catch(e) {
      setIsStreaming(false);throw e;
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        background: '#fff',
      }}
    >
      {/* ── 左栏：会话列表 ─────────────────────────────── */}
      <SessionSidebar
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSelect={loadSessionDetails}
        onNew={startNewSession}
        onDelete={handleDeleteSession}
      />

      {/* ── 中栏：对话主区 ─────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden', height: '100%' }}>
        {/* Workbench top bar */}
        <div
          style={{
            height: '52px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 20px',
            borderBottom: '1px solid rgba(226, 232, 240, 0.8)',
            background: '#fff',
            flexShrink: 0,
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '28px',
                height: '28px',
                borderRadius: '8px',
                background: '#0f172a',
              }}
            >
              <Bot size={15} color="#34d399" />
            </span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>GeoPilot 运营副驾驶</span>
                <span
                  style={{
                    fontSize: '10px',
                    fontFamily: 'ui-monospace,monospace',
                    background: '#f1f5f9',
                    border: '1px solid #e2e8f0',
                    borderRadius: '5px',
                    padding: '1px 6px',
                    color: '#475569',
                  }}
                >
                  LangGraph · HiL
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '1px' }}>
                <span
                  style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }}
                />
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  {enabledSkills.length} 个技能已挂载 · {mcpServers.filter(s=>s.is_active).length} 个 MCP 已配置
                </span>
              </div>
            </div>
          </div>

          {/* Right Header Actions: Model Switcher & Harness Quick Access */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '4px 10px',
              }}
            >
              <Cpu size={12} color="#64748b" />
<span style={{ fontSize: '11px', color: '#64748b' }}>模型:</span>
<span>{selectedModel||'未读取配置'}</span>
            </div>

            {configError&&<span role="alert">{configError}</span>}
            {requestError&&<span role="alert">{requestError}</span>}
            <button
              type="button"
              onClick={() => navigate('/copilot/harness')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 10px',
                borderRadius: '8px',
                background: '#f1f5f9',
                border: '1px solid #e2e8f0',
                color: '#334155',
                fontSize: '11px',
                cursor: 'pointer',
                fontWeight: 500,
                transition: 'background 0.15s',
              }}
              title="配置 Skills / MCP / 记忆 / 模型"
            >
              <Zap size={12} color="#f59e0b" />
              Harness 装配
            </button>
          </div>
        </div>

        {/* Message stream */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            background: 'rgba(248, 250, 252, 0.3)',
          }}
        >
          {messages.map((m) => {
            const isUser = m.role === 'user';
            let previewData: CopilotActionPreview | null = null;
            if (m.card_payload) {
              try { previewData = JSON.parse(m.card_payload); } catch { /* ignore */ }
            }

            return (
              <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', maxWidth: '90%' }}>
                  {!isUser && (
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '24px',
                        height: '24px',
                        borderRadius: '6px',
                        background: '#0f172a',
                        flexShrink: 0,
                        marginTop: '2px',
                      }}
                    >
                      <Bot size={13} color="#34d399" />
                    </span>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {!isUser && (
                      <span style={{ fontSize: '11px', fontWeight: 500, color: '#64748b', marginBottom: '4px' }}>
                        GeoPilot 运营副驾驶
                      </span>
                    )}

                    <div
                      style={{
                        borderRadius: isUser ? '14px 14px 4px 14px' : '4px 14px 14px 14px',
                        padding: '10px 14px',
                        fontSize: '12px',
                        lineHeight: 1.7,
                        ...(isUser
                          ? { background: '#0f172a', color: '#f8fafc', boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }
                          : {
                              background: '#fff',
                              color: '#1e293b',
                              border: '1px solid rgba(226, 232, 240, 0.9)',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                            }),
                      }}
                    >
                      <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>

                      {previewData && (
                        <CopilotActionCard
                          preview={previewData}
                          status={m.card_status || 'pending'}
                          onConfirm={handleConfirmAction}
                          onCancel={handleCancelAction}
                        />
                      )}
                    </div>

                    <div
                      style={{
                        marginTop: '4px',
                        paddingLeft: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <span
                        style={{
                          fontSize: '10px',
                          color: '#94a3b8',
                          fontFamily: 'ui-monospace,monospace',
                        }}
                      >
                        {new Date(m.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                      </span>

                      {!isUser && m.content && (
                        <button
                          onClick={() => handleOpenTrace(m.trace_id)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                            background: 'transparent',
                            border: 'none',
                            color: '#64748b',
                            fontSize: '10px',
                            cursor: 'pointer',
                            padding: '1px 5px',
                            borderRadius: '4px',
                            transition: 'all 0.15s',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = '#0284c7';
                            e.currentTarget.style.background = '#f0f9ff';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = '#64748b';
                            e.currentTarget.style.background = 'transparent';
                          }}
                          title="查看本次执行全流程运行日志与时间线"
                        >
                          <Activity size={10} color="#0284c7" />
                          运行日志
                        </button>
                      )}
                    </div>
                  </div>

                  {isUser && (
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '24px',
                        height: '24px',
                        borderRadius: '6px',
                        background: '#e2e8f0',
                        flexShrink: 0,
                        marginTop: '2px',
                      }}
                    >
                      <User size={13} color="#475569" />
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {/* Active tool indicator */}
          {activeTool && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 14px',
                borderRadius: '10px',
                border: '1px solid #e2e8f0',
                background: '#fff',
                fontSize: '11px',
                color: '#475569',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                alignSelf: 'flex-start',
              }}
            >
              <Loader2 size={13} color="#64748b" className="animate-spin" />
              <span style={{ fontWeight: 500 }}>
                {ACTIVE_TOOL_LABELS[activeTool] || `正在调用工具 ${activeTool}...`}
              </span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div
          style={{
            borderTop: '1px solid rgba(226, 232, 240, 0.8)',
            background: '#fff',
            padding: '12px 20px 16px',
            flexShrink: 0,
          }}
        >
          {/* Suggestion chips */}
          <div
            style={{
              display: 'flex',
              gap: '6px',
              overflowX: 'auto',
              paddingBottom: '10px',
              scrollbarWidth: 'none',
            }}
          >
            {SUGGESTIONS.map((item, idx) => {
              const IconComp = item.icon;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSend(item.text)}
                  disabled={isStreaming}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '5px 10px',
                    borderRadius: '7px',
                    border: '1px solid #e2e8f0',
                    background: '#fff',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: 500,
                    color: '#334155',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                    opacity: isStreaming ? 0.5 : 1,
                    transition: 'background 0.1s',
                  }}
                >
                  <IconComp size={11} color="#64748b" />
                  {item.text}
                </button>
              );
            })}
          </div>

          {/* Textarea */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: '8px',
              borderRadius: '12px',
              border: '1px solid #cbd5e1',
              background: '#fff',
              padding: '6px 6px 6px 14px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              transition: 'border-color 0.15s, box-shadow 0.15s',
            }}
            onFocus={(e) => {
              (e.currentTarget as HTMLDivElement).style.borderColor = '#0f172a';
              (e.currentTarget as HTMLDivElement).style.boxShadow = '0 0 0 2px rgba(15,23,42,0.08)';
            }}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                (e.currentTarget as HTMLDivElement).style.borderColor = '#cbd5e1';
                (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)';
              }
            }}
          >
            <textarea
              ref={inputRef}
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={`输入运营指令（例如："查看 GEO 效果差距" 或 "发布优化草稿至知乎"）...`}
              disabled={isStreaming}
              style={{
                flex: 1,
                resize: 'none',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: '12px',
                color: '#0f172a',
                lineHeight: 1.6,
                padding: '4px 0',
                fontFamily: 'inherit',
              }}
            />
            <button
              type="button"
              onClick={() => handleSend()}
              disabled={!input.trim() || isStreaming}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: !input.trim() || isStreaming ? '#f1f5f9' : '#0f172a',
                color: !input.trim() || isStreaming ? '#94a3b8' : '#fff',
                border: 'none',
                cursor: !input.trim() || isStreaming ? 'not-allowed' : 'pointer',
                flexShrink: 0,
                transition: 'background 0.15s, color 0.15s',
              }}
              title="发送指令 (Enter)"
            >
              {isStreaming ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <ArrowUp size={15} />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── 右栏：Harness 面板 ─────────────────────────── */}
      <HarnessPanel
        mcpServers={mcpServers}
        memoryHints={memoryHints}
        enabledSkills={enabledSkills}
        onToggleSkill={handleToggleSkill}
        onOpenConfig={() => navigate('/copilot/harness')}
      />

      {/* ── Modal: Agent Execution Trace Timeline ──────────────────── */}
      {showTraceModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20,
          }}
          onClick={() => setShowTraceModal(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: 14,
              width: '100%',
              maxWidth: 840,
              maxHeight: '88vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '14px 20px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#f8fafc',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 7,
                    background: '#e0f2fe',
                    color: '#0284c7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Activity size={15} />
                </span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
                    Agent 运行日志 (Execution Trace)
                  </h3>
                  <span style={{ fontSize: 11, color: '#64748b' }}>
                    本轮对话的执行全流程，包含记忆检索、技能装配、模型推理与工具调用
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={() => {
                    setShowTraceModal(false);
                    navigate('/copilot/harness?tab=logs');
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 12,
                    color: '#0284c7',
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 6,
                    padding: '4px 10px',
                    cursor: 'pointer',
                  }}
                >
                  <ExternalLink size={12} />
                  打开日志总览
                </button>
                <button
                  onClick={() => setShowTraceModal(false)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    padding: 4,
                    borderRadius: 6,
                  }}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
              {loadingTrace ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                  <RefreshCw size={18} className="animate-spin" style={{ marginBottom: 8 }} />
                  <div>正在加载执行时间线数据...</div>
                </div>
              ) : activeTrace ? (
                <AgentTraceTimeline
                  trace={activeTrace}
                  compact
                  onOpenHarnessLogs={() => {
                    setShowTraceModal(false);
                    navigate('/copilot/harness?tab=logs');
                  }}
                />
              ) : (
                <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                  暂未捕获到该条消息的运行日志记录
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
