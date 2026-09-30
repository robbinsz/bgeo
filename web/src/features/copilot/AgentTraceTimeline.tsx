import React, { useState } from 'react';
import {
  Brain,
  Zap,
  Bot,
  Terminal,
  ShieldAlert,
  Sparkles,
  CheckCircle,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Code,
  Activity,
  Layers,
  UserCheck,
  UserX,
  ExternalLink,
} from 'lucide-react';
import type { AgentExecutionTrace, AgentExecutionStep } from '../../types';

interface AgentTraceTimelineProps {
  trace: AgentExecutionTrace;
  onClose?: () => void;
  onOpenHarnessLogs?: () => void;
  compact?: boolean;
}

export const AgentTraceTimeline: React.FC<AgentTraceTimelineProps> = ({
  trace,
  onClose,
  onOpenHarnessLogs,
  compact = false,
}) => {
  const [showRawJson, setShowRawJson] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});

  let steps: AgentExecutionStep[] = [];
  try {
    if (trace.timeline_json) {
      steps = JSON.parse(trace.timeline_json);
    }
  } catch {
    steps = [];
  }

  const toggleStep = (stepId: string) => {
    setExpandedSteps((prev) => ({
      ...prev,
      [stepId]: prev[stepId] === undefined ? false : !prev[stepId],
    }));
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(key);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 8px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              background: '#ecfdf5',
              color: '#059669',
              border: '1px solid #a7f3d0',
            }}
          >
            <CheckCircle size={11} /> 已完成
          </span>
        );
      case 'interrupted':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 8px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              background: '#fffbeb',
              color: '#d97706',
              border: '1px solid #fde68a',
            }}
          >
            <ShieldAlert size={11} /> 待审批拦截
          </span>
        );
      case 'aborted':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 8px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              background: '#f1f5f9',
              color: '#64748b',
              border: '1px solid #e2e8f0',
            }}
          >
            <XCircle size={11} /> 已取消
          </span>
        );
      default:
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 8px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              background: '#fef2f2',
              color: '#dc2626',
              border: '1px solid #fecaca',
            }}
          >
            <XCircle size={11} /> 异常
          </span>
        );
    }
  };

  const renderStepIcon = (type: string, status: string) => {
    switch (type) {
      case 'memory_retrieval':
        return <Brain size={14} color="#8b5cf6" />;
      case 'skill_assembly':
        return <Zap size={14} color="#f59e0b" />;
      case 'model_inference':
        return <Bot size={14} color="#0284c7" />;
      case 'tool_execution':
        return status === 'pending' ? (
          <ShieldAlert size={14} color="#f97316" />
        ) : (
          <Terminal size={14} color="#10b981" />
        );
      case 'user_approval':
        return status === 'success' ? (
          <UserCheck size={14} color="#059669" />
        ) : (
          <UserX size={14} color="#dc2626" />
        );
      case 'post_session_hook':
        return <Sparkles size={14} color="#6366f1" />;
      default:
        return <Activity size={14} color="#64748b" />;
    }
  };

  const getStepColor = (type: string) => {
    switch (type) {
      case 'memory_retrieval':
        return { bg: '#f5f3ff', border: '#ddd6fe', badgeBg: '#ede9fe', text: '#6d28d9' };
      case 'skill_assembly':
        return { bg: '#fffbeb', border: '#fde68a', badgeBg: '#fef3c7', text: '#b45309' };
      case 'model_inference':
        return { bg: '#f0f9ff', border: '#bae6fd', badgeBg: '#e0f2fe', text: '#0369a1' };
      case 'tool_execution':
        return { bg: '#f0fdf4', border: '#bbf7d0', badgeBg: '#dcfce7', text: '#15803d' };
      case 'user_approval':
        return { bg: '#faf5ff', border: '#e9d5ff', badgeBg: '#f3e8ff', text: '#7e22ce' };
      case 'post_session_hook':
        return { bg: '#eef2ff', border: '#c7d2fe', badgeBg: '#e0e7ff', text: '#4338ca' };
      default:
        return { bg: '#f8fafc', border: '#e2e8f0', badgeBg: '#f1f5f9', text: '#475569' };
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ── Top Header Card ────────────────────────────────────────── */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          padding: '16px 20px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              {getStatusBadge(trace.status)}
              <span
                style={{
                  fontSize: 11,
                  padding: '2px 7px',
                  borderRadius: 6,
                  background: '#f1f5f9',
                  color: '#475569',
                  fontFamily: 'monospace',
                }}
              >
                {trace.model_name || 'deepseek-chat'}
              </span>
              <span
                style={{
                  fontSize: 11,
                  padding: '2px 7px',
                  borderRadius: 6,
                  background: '#f1f5f9',
                  color: '#475569',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                }}
              >
                <Clock size={11} />
                {trace.total_duration_ms} ms
              </span>
            </div>

            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: '#0f172a',
                lineHeight: 1.5,
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: '8px 12px',
              }}
            >
              <span style={{ color: '#64748b', fontWeight: 500, marginRight: 6 }}>用户指令:</span>
              “{trace.user_prompt}”
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={() => setShowRawJson(!showRawJson)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '6px 12px',
                borderRadius: 7,
                border: '1px solid #e2e8f0',
                background: showRawJson ? '#0f172a' : '#fff',
                color: showRawJson ? '#fff' : '#475569',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <Code size={13} />
              {showRawJson ? '查看时间线' : '原始 JSON'}
            </button>

            {onOpenHarnessLogs && (
              <button
                onClick={onOpenHarnessLogs}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '6px 12px',
                  borderRadius: 7,
                  border: '1px solid #e2e8f0',
                  background: '#fff',
                  color: '#0284c7',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                <ExternalLink size={13} />
                日志中心
              </button>
            )}

            {onClose && (
              <button
                onClick={onClose}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: 4,
                  borderRadius: 6,
                }}
              >
                <XCircle size={18} />
              </button>
            )}
          </div>
        </div>

        {/* Metadata pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, fontSize: 11, color: '#64748b', borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>Trace ID:</span>
            <code style={{ fontFamily: 'monospace', color: '#0f172a' }}>{trace.id}</code>
            <button
              onClick={() => handleCopy(trace.id, 'trace_id')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 1, color: '#94a3b8' }}
              title="复制 Trace ID"
            >
              {copiedId === 'trace_id' ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>会话 ID:</span>
            <code style={{ fontFamily: 'monospace', color: '#0f172a' }}>{trace.session_id}</code>
            <button
              onClick={() => handleCopy(trace.session_id, 'session_id')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 1, color: '#94a3b8' }}
              title="复制会话 ID"
            >
              {copiedId === 'session_id' ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
            </button>
          </div>

          <div style={{ marginLeft: 'auto', color: '#94a3b8' }}>
            {trace.created_at ? new Date(trace.created_at).toLocaleString() : ''}
          </div>
        </div>
      </div>

      {/* ── Raw JSON Toggle ────────────────────────────────────────── */}
      {showRawJson ? (
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
              完整时间线数据 (Raw JSON)
            </span>
            <button
              onClick={() => handleCopy(trace.timeline_json, 'raw_json')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11,
                color: '#0284c7',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {copiedId === 'raw_json' ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
              复制全部 JSON
            </button>
          </div>
          <pre
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              padding: 12,
              fontSize: 11,
              lineHeight: 1.5,
              color: '#334155',
              fontFamily: 'Consolas, Monaco, monospace',
              maxHeight: 450,
              overflowY: 'auto',
              margin: 0,
            }}
          >
            {(() => {
              try {
                return JSON.stringify(JSON.parse(trace.timeline_json), null, 2);
              } catch {
                return trace.timeline_json;
              }
            })()}
          </pre>
        </div>
      ) : (
        /* ── Execution Timeline Stepper ────────────────────────────────── */
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: compact ? '14px 16px' : '20px 24px',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Layers size={16} color="#0f172a" />
              <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                生命周期执行时间线 ({steps.length} 个阶段)
              </h4>
            </div>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>
              按执行时序排列，展开各阶段可查看入参、出参与沉淀详情
            </span>
          </div>

          {steps.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 0', color: '#94a3b8', fontSize: 13 }}>
              暂无详细时间线数据
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
              {/* Stepper vertical line */}
              <div
                style={{
                  position: 'absolute',
                  left: 17,
                  top: 16,
                  bottom: 24,
                  width: 2,
                  background: '#e2e8f0',
                  zIndex: 0,
                }}
              />

              {steps.map((step, idx) => {
                const colors = getStepColor(step.step_type);
                const isExpanded = expandedSteps[step.step_id] !== false; // default expanded

                return (
                  <div
                    key={step.step_id || idx}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 14,
                      position: 'relative',
                      zIndex: 1,
                      marginBottom: idx === steps.length - 1 ? 0 : 16,
                    }}
                  >
                    {/* Node icon circle */}
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        background: colors.bg,
                        border: `2px solid ${colors.border}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                      }}
                    >
                      {renderStepIcon(step.step_type, step.status)}
                    </div>

                    {/* Step Card Body */}
                    <div
                      style={{
                        flex: 1,
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: 10,
                        overflow: 'hidden',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                        transition: 'border-color 0.15s',
                      }}
                    >
                      {/* Step Header */}
                      <div
                        onClick={() => toggleStep(step.step_id)}
                        style={{
                          padding: '10px 14px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: isExpanded ? colors.bg : '#ffffff',
                          borderBottom: isExpanded ? '1px solid #e2e8f0' : 'none',
                          cursor: 'pointer',
                          userSelect: 'none',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: colors.text,
                              background: colors.badgeBg,
                              padding: '1px 6px',
                              borderRadius: 4,
                            }}
                          >
                            Step {idx + 1}
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                            {step.title}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {step.duration_ms !== undefined && (
                            <span style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 3 }}>
                              <Clock size={11} /> {step.duration_ms} ms
                            </span>
                          )}

                          {step.status === 'success' && (
                            <span style={{ fontSize: 11, color: '#059669', background: '#ecfdf5', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>
                              成功
                            </span>
                          )}
                          {step.status === 'pending' && (
                            <span style={{ fontSize: 11, color: '#d97706', background: '#fffbeb', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>
                              阻断等待
                            </span>
                          )}
                          {step.status === 'fallback' && (
                            <span style={{ fontSize: 11, color: '#64748b', background: '#f1f5f9', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>
                              模拟降级
                            </span>
                          )}

                          {isExpanded ? <ChevronDown size={14} color="#64748b" /> : <ChevronRight size={14} color="#64748b" />}
                        </div>
                      </div>

                      {/* Step Content */}
                      <div style={{ padding: '12px 14px' }}>
                        <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.6, marginBottom: isExpanded && step.details ? 10 : 0 }}>
                          {step.description}
                        </div>

                        {/* Expandable Details by Step Type */}
                        {isExpanded && step.details && (
                          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {/* Step 1: Memory Retrieval */}
                            {step.step_type === 'memory_retrieval' && (
                              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10 }}>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                                  <span style={{ fontSize: 11, background: '#ede9fe', color: '#6d28d9', padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>
                                    总计注入: {step.details.total_entries ?? 0} 条
                                  </span>
                                  <span style={{ fontSize: 11, background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: 12 }}>
                                    置顶固定: {step.details.pinned_count ?? 0} 条
                                  </span>
                                  {step.details.categories && typeof step.details.categories === 'object' && (
                                    <>
                                      <span style={{ fontSize: 11, background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: 12 }}>
                                        品牌事实: {step.details.categories['brand_truth'] || 0}
                                      </span>
                                      <span style={{ fontSize: 11, background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: 12 }}>
                                        运营偏好: {step.details.categories['user_pref'] || 0}
                                      </span>
                                      <span style={{ fontSize: 11, background: '#fce7f3', color: '#be185d', padding: '2px 8px', borderRadius: 12 }}>
                                        历史策略: {step.details.categories['episodic_strategy'] || 0}
                                      </span>
                                    </>
                                  )}
                                </div>

                                {Array.isArray(step.details.entries) && step.details.entries.length > 0 && (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 180, overflowY: 'auto' }}>
                                    {step.details.entries.map((m: any, mIdx: number) => (
                                      <div
                                        key={mIdx}
                                        style={{
                                          fontSize: 11,
                                          background: '#ffffff',
                                          border: '1px solid #e2e8f0',
                                          borderRadius: 6,
                                          padding: '5px 8px',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'space-between',
                                        }}
                                      >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                          <span style={{ color: '#0284c7', fontWeight: 600 }}>
                                            [{m.memory_type === 'brand_truth' ? '品牌事实' : m.memory_type === 'user_pref' ? '运营偏好' : '历史策略'}]
                                          </span>
                                          <span style={{ color: '#0f172a', fontWeight: 500 }}>{m.title}</span>
                                          {m.extraction_source === 'agent_hook' && (
                                            <span style={{ fontSize: 9, background: '#e0e7ff', color: '#4338ca', padding: '1px 4px', borderRadius: 3 }}>
                                              Hook沉淀
                                            </span>
                                          )}
                                        </div>
                                        <span style={{ color: '#94a3b8', fontSize: 10 }}>权重 {m.score_weight}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Step 2: Skill & Tool Assembly */}
                            {step.step_type === 'skill_assembly' && (
                              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10 }}>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                                  <div>
                                    <span style={{ fontSize: 11, color: '#64748b', marginRight: 4 }}>原生技能:</span>
                                    {Array.isArray(step.details.enabled_skills) && step.details.enabled_skills.length > 0 ? (
                                      step.details.enabled_skills.map((s: string) => (
                                        <span key={s} style={{ fontSize: 11, background: '#e2e8f0', color: '#334155', padding: '1px 6px', borderRadius: 4, marginRight: 4 }}>
                                          {s}
                                        </span>
                                      ))
                                    ) : (
                                      <span style={{ fontSize: 11, color: '#94a3b8' }}>无</span>
                                    )}
                                  </div>

                                  <div>
                                    <span style={{ fontSize: 11, color: '#64748b', marginRight: 4 }}>自定义技能:</span>
                                    {Array.isArray(step.details.custom_skills) && step.details.custom_skills.length > 0 ? (
                                      step.details.custom_skills.map((s: string) => (
                                        <span key={s} style={{ fontSize: 11, background: '#fef3c7', color: '#b45309', padding: '1px 6px', borderRadius: 4, marginRight: 4 }}>
                                          {s}
                                        </span>
                                      ))
                                    ) : (
                                      <span style={{ fontSize: 11, color: '#94a3b8' }}>无</span>
                                    )}
                                  </div>

                                  <div style={{ fontSize: 11, color: '#64748b' }}>
                                    MCP 扩展工具: <strong style={{ color: '#0f172a' }}>{step.details.mcp_tools_count ?? 0} 个</strong>
                                  </div>
                                </div>

                                {Array.isArray(step.details.tool_names) && (
                                  <div>
                                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>
                                      挂载给模型的工具清单 ({step.details.tool_names.length} 个):
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                      {step.details.tool_names.map((tName: string) => (
                                        <span
                                          key={tName}
                                          style={{
                                            fontSize: 10,
                                            fontFamily: 'monospace',
                                            background: '#ffffff',
                                            border: '1px solid #cbd5e1',
                                            color: '#334155',
                                            padding: '1px 6px',
                                            borderRadius: 4,
                                          }}
                                        >
                                          {tName}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Step 3: Model Inference */}
                            {step.step_type === 'model_inference' && (
                              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10 }}>
                                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, fontSize: 11, marginBottom: 6 }}>
                                  <span>模型: <strong style={{ color: '#0f172a' }}>{step.details.model}</strong></span>
                                  <span>历史轮数: <strong style={{ color: '#0f172a' }}>{step.details.history_turns} 轮</strong></span>
                                  <span>工具调用数: <strong style={{ color: '#0f172a' }}>{step.details.tool_calls_count}</strong></span>
                                </div>

                                {Array.isArray(step.details.tool_calls) && step.details.tool_calls.length > 0 && (
                                  <div>
                                    <span style={{ fontSize: 11, color: '#64748b', marginRight: 6 }}>触发调用的工具:</span>
                                    {step.details.tool_calls.map((t: string) => (
                                      <span key={t} style={{ fontSize: 11, background: '#dcfce7', color: '#166534', padding: '1px 6px', borderRadius: 4, marginRight: 4, fontWeight: 600 }}>
                                        {t}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Step 4: Tool Execution / Safety Guard */}
                            {step.step_type === 'tool_execution' && (
                              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 11 }}>
                                  <span>工具名: <code style={{ color: '#0284c7', fontWeight: 600 }}>{step.details.tool_name}</code></span>
                                  <span>
                                    风险分级:{' '}
                                    {step.details.risk_level === 'confirmed' ? (
                                      <strong style={{ color: '#ea580c' }}>高危阻断 (需确认)</strong>
                                    ) : (
                                      <strong style={{ color: '#16a34a' }}>安全直通 (Direct)</strong>
                                    )}
                                  </span>
                                  {step.details.interrupt_id && (
                                    <span style={{ color: '#64748b' }}>凭证: {step.details.interrupt_id}</span>
                                  )}
                                </div>

                                {step.details.arguments && (
                                  <div style={{ marginBottom: 6 }}>
                                    <span style={{ fontSize: 11, color: '#64748b' }}>输入入参 (Arguments):</span>
                                    <pre
                                      style={{
                                        background: '#ffffff',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: 6,
                                        padding: 8,
                                        fontSize: 11,
                                        color: '#334155',
                                        margin: '4px 0 0 0',
                                        maxHeight: 120,
                                        overflowY: 'auto',
                                      }}
                                    >
                                      {typeof step.details.arguments === 'object'
                                        ? JSON.stringify(step.details.arguments, null, 2)
                                        : String(step.details.arguments)}
                                    </pre>
                                  </div>
                                )}

                                {step.details.result && (
                                  <div>
                                    <span style={{ fontSize: 11, color: '#64748b' }}>执行结果 (Result Output):</span>
                                    <div
                                      style={{
                                        background: '#ffffff',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: 6,
                                        padding: 8,
                                        fontSize: 11,
                                        color: '#0f172a',
                                        marginTop: 4,
                                        whiteSpace: 'pre-wrap',
                                        lineHeight: 1.5,
                                      }}
                                    >
                                      {String(step.details.result)}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Step 5: User Approval */}
                            {step.step_type === 'user_approval' && (
                              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, fontSize: 11 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span>操作动作:</span>
                                  {step.details.action === 'confirm' ? (
                                    <span style={{ color: '#059669', fontWeight: 600 }}>用户已确认放行执行</span>
                                  ) : (
                                    <span style={{ color: '#dc2626', fontWeight: 600 }}>用户已取消拒绝执行</span>
                                  )}
                                  {step.details.interrupt_id && (
                                    <span style={{ color: '#64748b' }}>中断凭证: {step.details.interrupt_id}</span>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Step 6: Post-Session Hook */}
                            {step.step_type === 'post_session_hook' && (
                              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 11 }}>
                                  <Sparkles size={13} color="#6366f1" />
                                  <span>Hook 提炼沉淀条目: <strong style={{ color: '#4338ca' }}>{step.details.extracted_count ?? 0} 条</strong></span>
                                </div>

                                {Array.isArray(step.details.memories) && step.details.memories.length > 0 ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {step.details.memories.map((m: any, mIdx: number) => (
                                      <div
                                        key={mIdx}
                                        style={{
                                          background: '#ffffff',
                                          border: '1px solid #c7d2fe',
                                          borderRadius: 6,
                                          padding: '8px 10px',
                                        }}
                                      >
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span style={{ fontSize: 10, background: '#e0e7ff', color: '#4338ca', padding: '1px 5px', borderRadius: 4, fontWeight: 600 }}>
                                              {m.memory_type}
                                            </span>
                                            <strong style={{ fontSize: 12, color: '#0f172a' }}>{m.title}</strong>
                                          </div>
                                          <span style={{ fontSize: 10, color: '#64748b' }}>权重 {m.score_weight || 1.0}</span>
                                        </div>
                                        <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.5 }}>
                                          {m.content}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div style={{ fontSize: 11, color: '#94a3b8' }}>
                                    复盘审计完成：本轮会话未产生新的知识增量或不可违背的事实基准，未重复沉淀。
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
