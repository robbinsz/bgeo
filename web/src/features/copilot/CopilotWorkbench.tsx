import { usePermissions } from '../../hooks/permissions';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { useResource } from '../../hooks/useResource';
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bot,
  User,
  ArrowUp,
  Check,
  Loader2,
  BarChart3,
  Play,
  FileText,
  Clock,
  Sliders,
  SendHorizontal,
  Cpu,
  Zap,
  Activity,
  RefreshCw,
  X,
  ExternalLink,
  Copy,
} from 'lucide-react';

import type { CopilotActionPreview, AgentExecutionTrace } from '../../types';
import { api, type MCPServer } from '../../services/api';
import { useCopilotSession } from '../../hooks/useCopilotSession';
import { CopilotActionCard } from '../../components/copilot/CopilotActionCard';
import { ThoughtChainCard } from '../../components/copilot/ThoughtChainCard';
import { AgentTraceTimeline } from './AgentTraceTimeline';
import { MarkdownView } from '../../components/common/MarkdownView';
import { SessionSidebar } from './SessionSidebar';
import { HarnessPanel } from './HarnessPanel';

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

const ACTIVE_TOOL_LABELS: Record<string, string> = {
  run_monitor_batch: '正在并发执行全量关键词监测拨测...',
  get_geo_overview_and_gaps: '正在检索最新 GEO 提及率与落后机会数据...',
  generate_optimized_content: '正在基于品牌事实库生成针对性答复草稿...',
  get_schedule_status: '正在读取定时任务调度与执行历史...',
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export const CopilotWorkbench: React.FC = () => {
  const navigate = useNavigate();
  const permissions = usePermissions();
  const {
    sessions,
    currentSessionId,
    messages,
    input,
    setInput,
    isStreaming,
    requestError,
    activeTool,
    activeToolArgs,
    startNewSession,
    loadSessionDetails,
    handleSend,
    handleDeleteSession,
    handleRenameSession,
    handleConfirmAction,
    handleCancelAction,
  } = useCopilotSession(true, { current_route: '/copilot' });
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  const handleCopyMessage = (content: string, id: string) => {
    navigator.clipboard.writeText(content);
    setCopiedMsgId(id);
    setTimeout(() => setCopiedMsgId(null), 1800);
  };
  const aiResource = useResource(api.getAIConfig),
    harnessResource = useResource(api.getHarnessConfig),
    serverResource = useResource(api.getMCPServers),
    memoryResource = useResource(api.getMemoryEntries);
  const [skillsDraft, setEnabledSkills] = useState<string[] | null>(null);
  let savedSkills: string[] = [];
  try {
    const value: unknown = JSON.parse(harnessResource.data?.enabled_skills ?? '[]');
    if (Array.isArray(value))
      savedSkills = value.filter((item): item is string => typeof item === 'string');
  } catch {
    /* invalid server configuration is shown through its error */
  }
  const enabledSkills = skillsDraft ?? savedSkills;
  const selectedModel = aiResource.data?.model_name ?? '';
  const mcpServers: MCPServer[] = serverResource.data?.items ?? [];
  const memoryHints = (memoryResource.data?.items ?? [])
    .filter((m) => m.status === 'approved' && m.memory_type !== 'brand_truth')
    .map((m) => m.title);
  const [saveConfigError, setConfigError] = useState('');
  const configError =
    saveConfigError ||
    aiResource.error ||
    harnessResource.error ||
    serverResource.error ||
    memoryResource.error;

  // Agent Trace Modal
  const [activeTrace, setActiveTrace] = useState<AgentExecutionTrace | null>(null);
  const [loadingTrace, setLoadingTrace] = useState(false);
  const [showTraceModal, setShowTraceModal] = useState(false);
  const traceDialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(traceDialogRef, showTraceModal, () => setShowTraceModal(false));

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
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming, activeTool]);

  const handleToggleSkill = async (skillId: string) => {
    const next = enabledSkills.includes(skillId)
      ? enabledSkills.filter((s) => s !== skillId)
      : [...enabledSkills, skillId];
    try {
      await api.updateHarnessConfig({
        enabled_skills: JSON.stringify(next),
      });
      setEnabledSkills(next);
      setConfigError('');
    } catch (e) {
      setConfigError(e instanceof Error ? e.message : '配置保存失败');
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
        onRename={handleRenameSession}
      />

      {/* ── 中栏：对话主区 ─────────────────────────────── */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          overflow: 'hidden',
          height: '100%',
        }}
      >
        <div className="copilot-mobile-tools">
          <button className="btn small" onClick={startNewSession}>
            新会话
          </button>
          <select
            className="select"
            aria-label="副驾驶会话"
            value={currentSessionId ?? ''}
            onChange={(e) =>
              e.target.value ? void loadSessionDetails(e.target.value) : startNewSession()
            }
          >
            <option value="">新会话</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </div>
        {/* Workbench top bar */}
        <div
          className="copilot-workbench-header"
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
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
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
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#0f172a',
                  }}
                >
                  GeoPilot 运营副驾驶
                </span>
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
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  marginTop: '1px',
                }}
              >
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: '#10b981',
                    display: 'inline-block',
                  }}
                />
                <span
                  style={{
                    fontSize: '11px',
                    color: '#64748b',
                  }}
                >
                  {enabledSkills.length} 个技能已挂载 ·{' '}
                  {mcpServers.filter((s) => s.is_active).length} 个 MCP 已配置
                </span>
              </div>
            </div>
          </div>

          {/* Right Header Actions: Model Switcher & Harness Quick Access */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
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
              <span>{selectedModel || '未读取配置'}</span>
            </div>

            {configError && <span role="alert">{configError}</span>}
            {requestError && <span role="alert">{requestError}</span>}
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
          {messages.map((m, index) => {
            const isUser = m.role === 'user';
            const isCurrentStreaming = isStreaming && !isUser && index === messages.length - 1;
            let previewData: CopilotActionPreview | null = null;
            if (m.card_payload) {
              try {
                previewData = JSON.parse(m.card_payload);
              } catch {
                /* ignore */
              }
            }

            return (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: isUser ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    maxWidth: '90%',
                  }}
                >
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

                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    {!isUser && (
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 500,
                          color: '#64748b',
                          marginBottom: '4px',
                        }}
                      >
                        GeoPilot 运营副驾驶
                      </span>
                    )}

                    {!isUser && (
                      <ThoughtChainCard
                        steps={m.steps}
                        activeTool={isCurrentStreaming ? activeTool : null}
                        activeToolArgs={isCurrentStreaming ? activeToolArgs : null}
                        isRunning={isCurrentStreaming && (!!activeTool || !m.content)}
                      />
                    )}

                    {(m.content || isCurrentStreaming) && (
                      <div
                        style={{
                          borderRadius: isUser ? '14px 14px 4px 14px' : '4px 14px 14px 14px',
                          padding: '10px 14px',
                          fontSize: '12px',
                          lineHeight: 1.7,
                          ...(isUser
                            ? {
                                background: '#0f172a',
                                color: '#f8fafc',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
                              }
                            : {
                                background: '#fff',
                                color: '#1e293b',
                                border: '1px solid rgba(226, 232, 240, 0.9)',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                              }),
                        }}
                      >
                        {isUser ? (
                          <div
                            style={{
                              whiteSpace: 'pre-wrap',
                            }}
                          >
                            {m.content}
                          </div>
                        ) : (
                          <MarkdownView content={m.content} isStreaming={isCurrentStreaming} />
                        )}

                        {previewData && (
                          <CopilotActionCard
                            preview={previewData}
                            status={m.card_status || 'pending'}
                            onConfirm={handleConfirmAction}
                            onCancel={handleCancelAction}
                          />
                        )}
                      </div>
                    )}

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
                        {new Date(m.created_at).toLocaleTimeString('zh-CN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>

                      {!isUser && m.content && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleCopyMessage(m.content, m.id)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3,
                              background: 'transparent',
                              border: 'none',
                              color: copiedMsgId === m.id ? '#10b981' : '#64748b',
                              fontSize: '10px',
                              cursor: 'pointer',
                              padding: '1px 5px',
                              borderRadius: '4px',
                              transition: 'all 0.15s',
                            }}
                            title="复制回答内容"
                          >
                            {copiedMsgId === m.id ? (
                              <Check size={10} color="#10b981" />
                            ) : (
                              <Copy size={10} />
                            )}
                            <span>{copiedMsgId === m.id ? '已复制' : '复制回答'}</span>
                          </button>

                          <button
                            type="button"
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
                        </>
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
                  disabled={isStreaming || !permissions.write}
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
              aria-label="运营指令"
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
              disabled={isStreaming || !permissions.write}
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
              disabled={!input.trim() || isStreaming || !permissions.write}
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
              {isStreaming ? <Loader2 size={14} className="animate-spin" /> : <ArrowUp size={15} />}
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
            ref={traceDialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Agent 运行日志"
            tabIndex={-1}
            style={{
              background: '#ffffff',
              borderRadius: 14,
              width: '100%',
              maxWidth: 840,
              maxHeight: '88vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow:
                '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
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
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
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
                  <h3
                    style={{
                      margin: 0,
                      fontSize: 15,
                      fontWeight: 700,
                      color: '#0f172a',
                    }}
                  >
                    Agent 运行日志 (Execution Trace)
                  </h3>
                  <span
                    style={{
                      fontSize: 11,
                      color: '#64748b',
                    }}
                  >
                    本轮对话的执行全流程，包含记忆检索、技能装配、模型推理与工具调用
                  </span>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
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
                  aria-label="关闭运行日志"
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
                <div
                  style={{
                    padding: 40,
                    textAlign: 'center',
                    color: '#64748b',
                    fontSize: 13,
                  }}
                >
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
                <div
                  style={{
                    padding: 40,
                    textAlign: 'center',
                    color: '#94a3b8',
                    fontSize: 13,
                  }}
                >
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
