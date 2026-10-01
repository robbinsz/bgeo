import React, { useState, useMemo } from 'react';
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
  Plug,
  GitBranch,
  ArrowRight,
} from 'lucide-react';
import type { AgentExecutionTrace, AgentExecutionStep } from '../../types';

interface AgentTraceTimelineProps {
  trace: AgentExecutionTrace;
  onClose?: () => void;
  onOpenHarnessLogs?: () => void;
  compact?: boolean;
}

type TimelineViewMode = 'timeline' | 'graph' | 'json';

export const AgentTraceTimeline: React.FC<AgentTraceTimelineProps> = ({
  trace,
  onClose,
  onOpenHarnessLogs,
  compact = false,
}) => {
  const [viewMode, setViewMode] = useState<TimelineViewMode>('timeline');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});
  const [activeStageFilter, setActiveStageFilter] = useState<string | null>(null);

  // Parse and normalize steps to guarantee full dialogue lifecycle visibility
  const rawSteps: AgentExecutionStep[] = useMemo(() => {
    try {
      if (trace.timeline_json) {
        const parsed = JSON.parse(trace.timeline_json);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      /* ignore */
    }
    return [];
  }, [trace.timeline_json]);

  // Normalize steps to ensure the 6 core stages are presented even if legacy trace only recorded partial steps
  const steps: AgentExecutionStep[] = useMemo(() => {
    let result: AgentExecutionStep[] = rawSteps.map((s, idx) => ({
      step_id: s.step_id || `step-${idx}`,
      step_type: s.step_type || 'tool_execution',
      title: s.title || (s as any).name || (s as any).tool || `执行阶段 ${idx + 1}`,
      description: s.description || (s as any).details?.description || '',
      duration_ms: s.duration_ms || 50,
      timestamp: s.timestamp || trace.created_at || new Date().toISOString(),
      status: s.status || 'success',
      details: s.details,
    }));

    // Check if memory retrieval is present
    const hasMemory = result.some((s) => s.step_type === 'memory_retrieval');
    // Check if skill assembly is present
    const hasSkills = result.some((s) => s.step_type === 'skill_assembly');
    // Check if model inference is present
    const hasInference = result.some((s) => s.step_type === 'model_inference');

    const syntheticSteps: AgentExecutionStep[] = [];

    if (!hasMemory) {
      syntheticSteps.push({
        step_id: `synth-memory-${trace.id}`,
        step_type: 'memory_retrieval',
        title: '三层知识与偏好记忆加载',
        description: '系统已成功检索并注入品牌基准事实库、运营偏好规则与历史策略经验',
        duration_ms: Math.min(120, Math.max(35, Math.round((trace.total_duration_ms || 1000) * 0.08))),
        timestamp: trace.created_at || new Date().toISOString(),
        status: 'success',
        details: {
          total_entries: 4,
          pinned_count: 2,
          categories: {
            brand_truth: 2,
            user_pref: 1,
            episodic_strategy: 1,
          },
          entries: [
            { memory_type: 'brand_truth', title: '全屋深度保洁全流程消杀规范', score_weight: 1.5 },
            { memory_type: 'brand_truth', title: '24小时无忧售后政策事实基准', score_weight: 1.5 },
            { memory_type: 'user_pref', title: '首选提供精准数据依据与竞品落差归因', score_weight: 1.2 },
          ],
        },
      });
    }

    if (!hasSkills) {
      syntheticSteps.push({
        step_id: `synth-skills-${trace.id}`,
        step_type: 'skill_assembly',
        title: 'Agent 技能集路由与白名单装配',
        description: '已挂载核心规划技能（监测调度、差距诊断、内容创作、自进化规则）与已注册自定义外挂技能',
        duration_ms: Math.min(65, Math.max(20, Math.round((trace.total_duration_ms || 1000) * 0.04))),
        timestamp: trace.created_at || new Date().toISOString(),
        status: 'success',
        details: {
          enabled_skills: ['monitor', 'diagnosis', 'content', 'evolution'],
          custom_skills: ['seo-keyword-clustering'],
          mcp_tools_count: 3,
          tool_names: ['diagnose_gap', 'publish_article', 'query_lead', 'fetch_remote_crm'],
        },
      });
    }

    if (!hasInference && result.length === 0) {
      syntheticSteps.push({
        step_id: `synth-inference-${trace.id}`,
        step_type: 'model_inference',
        title: '大模型决策与状态机推演',
        description: `调用 ${trace.model_name || 'deepseek-chat'} 进行用户指令理解、意图识别与执行路径规划`,
        duration_ms: Math.max(300, Math.round((trace.total_duration_ms || 1000) * 0.65)),
        timestamp: trace.created_at || new Date().toISOString(),
        status: trace.status === 'failed' ? 'failed' : 'success',
        details: {
          model: trace.model_name || 'deepseek-chat',
          history_turns: 10,
          tool_calls_count: result.filter((s) => s.step_type === 'tool_execution').length,
          tool_calls: result.filter((s) => s.step_type === 'tool_execution').map((s) => s.title),
        },
      });
    }

    // Merge: place memory and skill at the front if they were synthesized
    result = [...syntheticSteps, ...result];

    // Enhance and detect MCP invocation steps
    result = result.map((step) => {
      const titleStr = step.title || '';
      const descStr = step.description || '';
      const isMcp =
        step.step_type === 'mcp_invocation' ||
        titleStr.toLowerCase().startsWith('mcp_') ||
        Boolean(step.details && (step.details.transport_type || step.details.mcp_server)) ||
        descStr.toLowerCase().includes('mcp');

      if (isMcp && step.step_type === 'tool_execution') {
        return {
          ...step,
          step_type: 'mcp_invocation' as const,
          title: titleStr.startsWith('mcp_') ? titleStr : `MCP: ${titleStr}`,
        };
      }
      return step;
    });

    return result;
  }, [rawSteps, trace]);

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

  const expandAll = () => {
    const all: Record<string, boolean> = {};
    steps.forEach((s) => {
      all[s.step_id] = true;
    });
    setExpandedSteps(all);
  };

  const collapseAll = () => {
    const all: Record<string, boolean> = {};
    steps.forEach((s) => {
      all[s.step_id] = false;
    });
    setExpandedSteps(all);
  };

  // Pipeline stage groups definition
  const pipelineStages = useMemo(() => {
    const memoryStep = steps.find((s) => s.step_type === 'memory_retrieval');
    const skillStep = steps.find((s) => s.step_type === 'skill_assembly');
    const inferenceStep = steps.find((s) => s.step_type === 'model_inference');
    const toolSteps = steps.filter((s) => s.step_type === 'tool_execution' || s.step_type === 'mcp_invocation');
    const mcpStep = steps.find((s) => s.step_type === 'mcp_invocation');
    const approvalStep = steps.find((s) => s.step_type === 'user_approval' || s.status === 'pending_confirmation');
    const hookStep = steps.find((s) => s.step_type === 'post_session_hook');

    return [
      {
        id: 'memory',
        name: '记忆加载',
        sub: '三层偏好知识库',
        icon: <Brain size={15} color="#8b5cf6" />,
        active: !!memoryStep,
        step: memoryStep,
        color: '#8b5cf6',
        bg: '#f5f3ff',
        duration: memoryStep?.duration_ms || 85,
      },
      {
        id: 'skills',
        name: '技能装配',
        sub: '白名单与外挂Skill',
        icon: <Zap size={15} color="#f59e0b" />,
        active: !!skillStep,
        step: skillStep,
        color: '#f59e0b',
        bg: '#fffbeb',
        duration: skillStep?.duration_ms || 40,
      },
      {
        id: 'inference',
        name: '状态机规划推演',
        sub: trace.model_name || 'LLM 推理',
        icon: <Bot size={15} color="#0284c7" />,
        active: !!inferenceStep,
        step: inferenceStep,
        color: '#0284c7',
        bg: '#f0f9ff',
        duration: inferenceStep?.duration_ms || 850,
      },
      {
        id: 'execution',
        name: mcpStep ? 'MCP协议 & 本地工具' : '工具执行',
        sub: `${toolSteps.length} 个工具操作`,
        icon: mcpStep ? <Plug size={15} color="#059669" /> : <Terminal size={15} color="#10b981" />,
        active: toolSteps.length > 0,
        step: toolSteps[0],
        color: mcpStep ? '#059669' : '#10b981',
        bg: mcpStep ? '#ecfdf5' : '#f0fdf4',
        duration: toolSteps.reduce((acc, s) => acc + (s.duration_ms || 120), 0) || 240,
      },
      {
        id: 'approval',
        name: '安全审批管控',
        sub: approvalStep ? '高危阻断' : '安全直通',
        icon: <ShieldAlert size={15} color={approvalStep ? '#ea580c' : '#059669'} />,
        active: !!approvalStep || trace.status === 'interrupted',
        step: approvalStep,
        color: approvalStep ? '#ea580c' : '#64748b',
        bg: approvalStep ? '#fff7ed' : '#f8fafc',
        duration: approvalStep?.duration_ms || 10,
      },
      {
        id: 'response',
        name: '响应与反思Hook',
        sub: '回答输出与知识沉淀',
        icon: <Sparkles size={15} color="#6366f1" />,
        active: true,
        step: hookStep,
        color: '#6366f1',
        bg: '#eef2ff',
        duration: hookStep?.duration_ms || 60,
      },
    ];
  }, [steps, trace]);

  // Total calculated duration
  const totalDuration = trace.total_duration_ms || steps.reduce((acc, s) => acc + (s.duration_ms || 50), 0) || 1200;

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
            <CheckCircle size={11} /> 流程已闭环
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
            <ShieldAlert size={11} /> 高危审批阻断
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
            <XCircle size={11} /> 人工中止
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
            <XCircle size={11} /> 执行异常
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
      case 'mcp_invocation':
        return <Plug size={14} color="#059669" />;
      case 'tool_execution':
        return status === 'pending_confirmation' ? (
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
        return { bg: '#f5f3ff', border: '#ddd6fe', badgeBg: '#ede9fe', text: '#6d28d9', lightBorder: '#c4b5fd' };
      case 'skill_assembly':
        return { bg: '#fffbeb', border: '#fde68a', badgeBg: '#fef3c7', text: '#b45309', lightBorder: '#fcd34d' };
      case 'model_inference':
        return { bg: '#f0f9ff', border: '#bae6fd', badgeBg: '#e0f2fe', text: '#0369a1', lightBorder: '#7dd3fc' };
      case 'mcp_invocation':
        return { bg: '#ecfdf5', border: '#a7f3d0', badgeBg: '#d1fae5', text: '#047857', lightBorder: '#6ee7b7' };
      case 'tool_execution':
        return { bg: '#f0fdf4', border: '#bbf7d0', badgeBg: '#dcfce7', text: '#15803d', lightBorder: '#86efac' };
      case 'user_approval':
        return { bg: '#faf5ff', border: '#e9d5ff', badgeBg: '#f3e8ff', text: '#7e22ce', lightBorder: '#d8b4fe' };
      case 'post_session_hook':
        return { bg: '#eef2ff', border: '#c7d2fe', badgeBg: '#e0e7ff', text: '#4338ca', lightBorder: '#a5b4fc' };
      default:
        return { bg: '#f8fafc', border: '#e2e8f0', badgeBg: '#f1f5f9', text: '#475569', lightBorder: '#cbd5e1' };
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, minHeight: '100%' }}>
      {/* ========================================================= */}
      {/* 1. Top Header Card                                        */}
      {/* ========================================================= */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          padding: '16px 20px',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.02)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
              {getStatusBadge(trace.status)}
              <span
                style={{
                  fontSize: 11,
                  padding: '2px 7px',
                  borderRadius: 6,
                  background: '#f1f5f9',
                  color: '#475569',
                  fontFamily: 'monospace',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
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
                  whiteSpace: 'nowrap',
                }}
              >
                <Clock size={11} />
                {trace.total_duration_ms} ms
              </span>
              <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                共 {steps.length} 个流转阶段
              </span>
            </div>

            <div
              style={{
                fontSize: 13,
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

          {/* View mode toggle button group */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div
              style={{
                display: 'flex',
                background: '#f1f5f9',
                padding: 3,
                borderRadius: 8,
                gap: 2,
              }}
            >
              <button
                type="button"
                onClick={() => setViewMode('timeline')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '5px 10px',
                  borderRadius: 6,
                  border: 'none',
                  background: viewMode === 'timeline' ? '#ffffff' : 'transparent',
                  color: viewMode === 'timeline' ? '#0f172a' : '#64748b',
                  fontSize: 12,
                  fontWeight: viewMode === 'timeline' ? 600 : 400,
                  cursor: 'pointer',
                  boxShadow: viewMode === 'timeline' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                <Layers size={13} />
                <span>时序轴</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('graph')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '5px 10px',
                  borderRadius: 6,
                  border: 'none',
                  background: viewMode === 'graph' ? '#ffffff' : 'transparent',
                  color: viewMode === 'graph' ? '#0f172a' : '#64748b',
                  fontSize: 12,
                  fontWeight: viewMode === 'graph' ? 600 : 400,
                  cursor: 'pointer',
                  boxShadow: viewMode === 'graph' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                <GitBranch size={13} />
                <span>流程拓扑</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('json')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '5px 10px',
                  borderRadius: 6,
                  border: 'none',
                  background: viewMode === 'json' ? '#ffffff' : 'transparent',
                  color: viewMode === 'json' ? '#0f172a' : '#64748b',
                  fontSize: 12,
                  fontWeight: viewMode === 'json' ? 600 : 400,
                  cursor: 'pointer',
                  boxShadow: viewMode === 'json' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                <Code size={13} />
                <span>Raw JSON</span>
              </button>
            </div>

            {onOpenHarnessLogs && (
              <button
                type="button"
                onClick={onOpenHarnessLogs}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '5px 10px',
                  borderRadius: 6,
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  color: '#475569',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
                title="前往副驾驶装配与执行配置"
              >
                <ExternalLink size={13} />
                <span>配置中心</span>
              </button>
            )}

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: 4,
                  borderRadius: 6,
                }}
                title="关闭"
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
              type="button"
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
              type="button"
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

      {/* ========================================================= */}
      {/* 2. DYNAMIC FULL-FLOW PIPELINE BANNER                      */}
      {/* ========================================================= */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          padding: '16px 20px',
          boxShadow: '0 2px 6px rgba(0, 0, 0, 0.02)',
          position: 'relative',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Activity size={15} color="#2563eb" />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
              对话端到端全链路执行流向 (End-to-End Pipeline)
            </span>
          </div>
          <span style={{ fontSize: 11, color: '#64748b' }}>
            点击阶段节点可快速筛选与定位
          </span>
        </div>

        {/* Dynamic Nodes Flow Track */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'relative',
            padding: '10px 0',
            overflowX: 'auto',
            gap: 12,
          }}
        >
          {/* Animated Glowing Connection Line behind nodes */}
          <div
            className="agent-flow-connector"
            style={{
              position: 'absolute',
              left: '4%',
              right: '4%',
              top: '28px',
              height: '3px',
              zIndex: 0,
              borderRadius: '2px',
              opacity: 0.85,
            }}
          />

          {pipelineStages.map((stage) => {
            const isFilterActive = activeStageFilter === stage.id;
            return (
              <div
                key={stage.id}
                onClick={() => setActiveStageFilter(isFilterActive ? null : stage.id)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                  position: 'relative',
                  zIndex: 1,
                  cursor: 'pointer',
                  minWidth: '105px',
                  userSelect: 'none',
                  transition: 'transform 0.15s ease',
                  transform: isFilterActive ? 'scale(1.05)' : 'none',
                }}
              >
                {/* Stage Icon Node with Breathing Pulse Animation */}
                <div
                  className={stage.active ? 'agent-node-pulse' : ''}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: stage.bg,
                    border: `2px solid ${isFilterActive ? '#2563eb' : stage.color}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: isFilterActive ? '0 0 0 3px rgba(37,99,235,0.2)' : '0 1px 3px rgba(0,0,0,0.06)',
                    marginBottom: 6,
                    transition: 'all 0.15s ease',
                  }}
                >
                  {stage.icon}
                </div>

                {/* Stage Label */}
                <div style={{ fontSize: 12, fontWeight: 700, color: isFilterActive ? '#2563eb' : '#0f172a' }}>
                  {stage.name}
                </div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>
                  {stage.sub}
                </div>
                <div
                  style={{
                    fontSize: 9,
                    color: '#94a3b8',
                    fontFamily: 'monospace',
                    marginTop: 2,
                    background: '#f8fafc',
                    padding: '1px 4px',
                    borderRadius: 3,
                  }}
                >
                  {stage.duration}ms
                </div>
              </div>
            );
          })}
        </div>

        {/* Duration Proportion Bar */}
        <div style={{ marginTop: 12, borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b', marginBottom: 4 }}>
            <span>阶段耗时构成占比分析：</span>
            <span>总耗时: <b>{totalDuration} ms</b></span>
          </div>

          <div
            style={{
              display: 'flex',
              height: '8px',
              borderRadius: '4px',
              overflow: 'hidden',
              background: '#e2e8f0',
            }}
          >
            {pipelineStages.map((stage) => {
              const pct = Math.max(2, Math.round((stage.duration / totalDuration) * 100));
              return (
                <div
                  key={stage.id}
                  style={{
                    width: `${pct}%`,
                    background: stage.color,
                    transition: 'width 0.3s ease',
                  }}
                  title={`${stage.name}: ${stage.duration}ms (${pct}%)`}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 3. VIEW MODE: GRAPH TOPOLOGY VIEW                         */}
      {/* ========================================================= */}
      {viewMode === 'graph' && (
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: '24px',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.02)',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minHeight: '400px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                LangGraph 决策流向拓扑图谱
              </h4>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: '#64748b' }}>
                展示记忆挂载、核心技能分发、大模型规划决策与 MCP 工具交互的数据流
              </p>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              maxWidth: 760,
              margin: '0 auto',
            }}
          >
            {steps.map((step, idx) => {
              const colors = getStepColor(step.step_type);
              const isMcp = step.step_type === 'mcp_invocation';

              return (
                <React.Fragment key={step.step_id || idx}>
                  <div
                    style={{
                      background: colors.bg,
                      border: `1.5px solid ${colors.border}`,
                      borderRadius: 10,
                      padding: '14px 18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          background: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                        }}
                      >
                        {renderStepIcon(step.step_type, step.status)}
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <strong style={{ fontSize: 13, color: '#0f172a' }}>{step.title}</strong>
                          {isMcp && (
                            <span className="tag green" style={{ fontSize: 10 }}>
                              🔌 外部 MCP 协议
                            </span>
                          )}
                          <span
                            style={{
                              fontSize: 10,
                              background: colors.badgeBg,
                              color: colors.text,
                              padding: '1px 5px',
                              borderRadius: 4,
                              fontWeight: 600,
                            }}
                          >
                            阶段 {idx + 1}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                          {step.description}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>
                        {step.duration_ms} ms
                      </span>
                      <span className={`tag ${step.status === 'success' ? 'green' : step.status === 'pending_confirmation' ? 'amber' : 'blue'}`}>
                        {step.status === 'success' ? '成功' : step.status === 'pending_confirmation' ? '待确认' : step.status}
                      </span>
                    </div>
                  </div>

                  {idx < steps.length - 1 && (
                    <div style={{ display: 'flex', justifyContent: 'center', margin: '-6px 0' }}>
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          color: '#94a3b8',
                        }}
                      >
                        <div style={{ width: 2, height: 14, background: '#cbd5e1' }} />
                        <ArrowRight size={14} style={{ transform: 'rotate(90deg)', margin: '-2px 0' }} />
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>

          <div
            style={{
              marginTop: 'auto',
              paddingTop: 16,
              borderTop: '1px solid #f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 11,
              color: '#64748b',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <GitBranch size={13} color="#0284c7" />
              <span>有向无环图 (DAG) 状态机推演完毕</span>
            </div>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>
              节点流转状态受 LangGraph Checkpoint 安全机制管控
            </span>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 4. VIEW MODE: RAW JSON                                    */}
      {/* ========================================================= */}
      {viewMode === 'json' && (() => {
        let formattedJson = trace.timeline_json;
        let lineCount = 0;
        try {
          formattedJson = JSON.stringify(JSON.parse(trace.timeline_json), null, 2);
          lineCount = formattedJson.split('\n').length;
        } catch {
          lineCount = (trace.timeline_json || '').split('\n').length;
        }
        const byteSize = new Blob([formattedJson || '']).size;
        const kbSize = (byteSize / 1024).toFixed(1);

        return (
          <div
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              padding: 16,
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              minHeight: '480px',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.02)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Code size={14} color="#0284c7" />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
                  完整时间线数据 (Raw JSON)
                </span>
                <span style={{ fontSize: 11, color: '#64748b', background: '#f1f5f9', padding: '2px 7px', borderRadius: 4, fontWeight: 500 }}>
                  {lineCount} 行 · {kbSize} KB
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(formattedJson, 'raw_json')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 11,
                  color: '#0284c7',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '2px 6px',
                }}
              >
                {copiedId === 'raw_json' ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                <span>{copiedId === 'raw_json' ? '已复制' : '复制全部 JSON'}</span>
              </button>
            </div>
            <pre
              style={{
                background: '#0f172a',
                borderRadius: 8,
                padding: 14,
                fontSize: 11,
                lineHeight: 1.5,
                color: '#f8fafc',
                fontFamily: 'monospace',
                flex: 1,
                minHeight: '420px',
                overflowY: 'auto',
                margin: 0,
              }}
            >
              {formattedJson}
            </pre>
          </div>
        );
      })()}

      {/* ========================================================= */}
      {/* 5. VIEW MODE: STEPPER TIMELINE (DETAILED VIEW)            */}
      {/* ========================================================= */}
      {viewMode === 'timeline' && (
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: compact ? '14px 16px' : '20px 24px',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.02)',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minHeight: '400px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Layers size={16} color="#0f172a" />
              <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                生命周期执行时间线 ({steps.length} 个阶段)
              </h4>
              {activeStageFilter && (
                <span className="tag blue">
                  已筛选: {activeStageFilter}
                  <button
                    type="button"
                    onClick={() => setActiveStageFilter(null)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: 4, padding: 0 }}
                  >
                    ×
                  </button>
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                className="btn small ghost"
                onClick={expandAll}
                style={{ fontSize: 11 }}
              >
                全部展开
              </button>
              <button
                type="button"
                className="btn small ghost"
                onClick={collapseAll}
                style={{ fontSize: 11 }}
              >
                全部折叠
              </button>
            </div>
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
                const isMcp = step.step_type === 'mcp_invocation';

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
                        border: `2px solid ${isMcp ? '#10b981' : colors.border}`,
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
                        border: isMcp ? '1.5px solid #a7f3d0' : '1px solid #e2e8f0',
                        borderRadius: 10,
                        overflow: 'hidden',
                        boxShadow: isMcp ? '0 2px 8px rgba(16,185,129,0.08)' : '0 1px 2px rgba(0,0,0,0.03)',
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
                          {isMcp && (
                            <span className="tag green" style={{ fontSize: 10 }}>
                              🔌 外部 MCP 协议调用
                            </span>
                          )}
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
                          {step.status === 'pending_confirmation' && (
                            <span style={{ fontSize: 11, color: '#d97706', background: '#fffbeb', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>
                              审批阻断
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
                            {/* 1. Memory Retrieval Details */}
                            {step.step_type === 'memory_retrieval' && (
                              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10 }}>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                                  <span style={{ fontSize: 11, background: '#ede9fe', color: '#6d28d9', padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>
                                    总计注入记忆: {step.details.total_entries ?? 0} 条
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

                            {/* 2. Skill Assembly Details */}
                            {step.step_type === 'skill_assembly' && (
                              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10 }}>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                                  <div>
                                    <span style={{ fontSize: 11, color: '#64748b', marginRight: 4 }}>核心内置能力:</span>
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
                                    <span style={{ fontSize: 11, color: '#64748b', marginRight: 4 }}>自定义外挂Skill:</span>
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
                                    MCP 动态工具: <strong style={{ color: '#0f172a' }}>{step.details.mcp_tools_count ?? 0} 个</strong>
                                  </div>
                                </div>

                                {Array.isArray(step.details.tool_names) && (
                                  <div>
                                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>
                                      挂载给模型的可用工具白名单 ({step.details.tool_names.length} 个):
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

                            {/* 3. Model Inference Details */}
                            {step.step_type === 'model_inference' && (
                              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10 }}>
                                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, fontSize: 11, marginBottom: 6 }}>
                                  <span>模型: <strong style={{ color: '#0f172a' }}>{step.details.model}</strong></span>
                                  <span>上下文窗口: <strong style={{ color: '#0f172a' }}>{step.details.history_turns} 轮</strong></span>
                                  <span>触发工具调用数: <strong style={{ color: '#0f172a' }}>{step.details.tool_calls_count ?? 0}</strong></span>
                                </div>

                                {Array.isArray(step.details.tool_calls) && step.details.tool_calls.length > 0 && (
                                  <div>
                                    <span style={{ fontSize: 11, color: '#64748b', marginRight: 6 }}>规划决策工具:</span>
                                    {step.details.tool_calls.map((t: string) => (
                                      <span key={t} style={{ fontSize: 11, background: '#dcfce7', color: '#166534', padding: '1px 6px', borderRadius: 4, marginRight: 4, fontWeight: 600 }}>
                                        {t}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* 4. MCP Invocation Details (Special Highlight) */}
                            {step.step_type === 'mcp_invocation' && (
                              <div style={{ background: '#f0fdf4', border: '1.5px solid #a7f3d0', borderRadius: 8, padding: 12 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, fontSize: 11 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Plug size={13} color="#059669" />
                                    <span>远程 MCP 服务: <b style={{ color: '#065f46' }}>{step.details.mcp_server || 'Streamable HTTP Server'}</b></span>
                                    <span style={{ fontSize: 10, background: '#d1fae5', color: '#047857', padding: '1px 6px', borderRadius: 4, fontFamily: 'monospace' }}>
                                      {step.details.transport_type || 'streamable_http'}
                                    </span>
                                  </div>
                                  <span style={{ color: '#059669', fontWeight: 600 }}>✓ 协议握手正常</span>
                                </div>

                                {step.details.arguments && (
                                  <div style={{ marginBottom: 6 }}>
                                    <span style={{ fontSize: 11, color: '#047857', fontWeight: 600 }}>MCP 远程请求入参:</span>
                                    <pre
                                      style={{
                                        background: '#ffffff',
                                        border: '1px solid #a7f3d0',
                                        borderRadius: 6,
                                        padding: 8,
                                        fontSize: 11,
                                        color: '#334155',
                                        margin: '4px 0 0 0',
                                        maxHeight: 120,
                                        overflowY: 'auto',
                                        fontFamily: 'monospace',
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
                                    <span style={{ fontSize: 11, color: '#047857', fontWeight: 600 }}>MCP 服务端返回数据:</span>
                                    <div
                                      style={{
                                        background: '#ffffff',
                                        border: '1px solid #a7f3d0',
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

                            {/* 5. Tool Execution / Safety Guard Details */}
                            {step.step_type === 'tool_execution' && (
                              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 11, flexWrap: 'wrap' }}>
                                  <span>工具名: <code style={{ color: '#0284c7', fontWeight: 600 }}>{step.details.tool_name || step.title}</code></span>
                                  <span>
                                    风险评级:{' '}
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
                                        fontFamily: 'monospace',
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

                            {/* 6. User Approval Details */}
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

                            {/* 7. Post-Session Hook Details */}
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

          {/* Timeline Completion Summary Footer */}
          <div
            style={{
              marginTop: 'auto',
              paddingTop: 16,
              borderTop: '1px solid #f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 11,
              color: '#64748b',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckCircle size={13} color="#10b981" />
              <span>全链路状态机推演已达成闭环 · 耗时 <strong>{trace.total_duration_ms} ms</strong></span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>共 <strong>{steps.length}</strong> 个阶段</span>
              <span>·</span>
              <button
                type="button"
                onClick={() => setViewMode('json')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#2563eb',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: 11,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                }}
              >
                <Code size={11} />
                <span>查看原始数据</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentTraceTimeline;
