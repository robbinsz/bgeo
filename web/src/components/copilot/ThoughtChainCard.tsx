import React, { useState } from 'react';
import {
  Brain,
  Zap,
  Bot,
  Terminal,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Code2,
  Sparkles,
  Loader2,
} from 'lucide-react';
import type { AgentExecutionStep } from '../../types';

interface ThoughtChainCardProps {
  steps?: AgentExecutionStep[];
  activeTool?: string | null;
  activeToolArgs?: unknown;
  isRunning?: boolean;
  defaultExpanded?: boolean;
}

const TOOL_NAME_MAP: Record<string, string> = {
  get_geo_overview_and_gaps: '检索 GEO 整体诊断与竞品差距',
  run_monitor_batch: '触发关键词自动化拨测批次',
  get_schedule_status: '读取定时任务调度与健康状态',
  update_schedule_config: '调整自动化监测调度配置',
  generate_optimized_content: '基于品牌事实库撰写优化答复',
  publish_content_to_channel: '分发优化内容至外部渠道',
};

export const ThoughtChainCard: React.FC<ThoughtChainCardProps> = ({
  steps = [],
  activeTool = null,
  activeToolArgs = null,
  isRunning = false,
  defaultExpanded = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [expandedDetails, setExpandedDetails] = useState<Record<string, boolean>>({});

  // Merge active tool as a live running step if present and not in steps yet
  const displaySteps: AgentExecutionStep[] = [...steps];
  if (isRunning && activeTool) {
    const existingIndex = displaySteps.findIndex(
      (s) => s.step_type === 'tool_execution' && s.title === activeTool && s.status === 'pending',
    );
    if (existingIndex === -1) {
      displaySteps.push({
        step_id: 'live_active_tool',
        step_type: 'tool_execution',
        title: activeTool,
        description: `正在调用工具 ${TOOL_NAME_MAP[activeTool] || activeTool}...`,
        duration_ms: 0,
        timestamp: '',
        status: 'pending',
        details: activeToolArgs ? { arguments: activeToolArgs } : undefined,
      });
    }
  }

  // If there are no steps and not running, don't render anything
  if (displaySteps.length === 0 && !isRunning) {
    return null;
  }

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const toggleDetail = (stepId: string) => {
    setExpandedDetails((prev) => ({
      ...prev,
      [stepId]: !prev[stepId],
    }));
  };

  const stepCount = displaySteps.length;
  const toolSteps = displaySteps.filter((s) => s.step_type === 'tool_execution');

  const getStepIcon = (type: string, status: string) => {
    if (status === 'pending') {
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-500" />;
    }
    switch (type) {
      case 'memory_retrieval':
        return <Brain className="h-3.5 w-3.5 text-purple-500" />;
      case 'skill_assembly':
        return <Zap className="h-3.5 w-3.5 text-amber-500" />;
      case 'model_inference':
        return <Bot className="h-3.5 w-3.5 text-sky-600" />;
      case 'tool_execution':
        return status === 'pending_confirmation' ? (
          <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
        ) : status === 'failed' ? (
          <XCircle className="h-3.5 w-3.5 text-rose-500" />
        ) : (
          <Terminal className="h-3.5 w-3.5 text-emerald-600" />
        );
      default:
        return <Sparkles className="h-3.5 w-3.5 text-slate-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 border border-emerald-200/60">
            <CheckCircle2 className="h-2.5 w-2.5" /> 成功
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 border border-sky-200/60">
            <Loader2 className="h-2.5 w-2.5 animate-spin" /> 执行中
          </span>
        );
      case 'pending_confirmation':
        return (
          <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 border border-amber-200/60">
            <ShieldAlert className="h-2.5 w-2.5" /> 待审批拦截
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700 border border-rose-200/60">
            <XCircle className="h-2.5 w-2.5" /> 失败
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 border border-slate-200">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="mb-2.5 select-none transition-all duration-200">
      {/* Claude-style Thinking Capsule Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className={`group inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${
          isRunning
            ? 'bg-purple-50/80 text-purple-900 border border-purple-200/80 shadow-xs'
            : isExpanded
              ? 'bg-slate-100 text-slate-800 border border-slate-200/90'
              : 'bg-slate-50/90 hover:bg-slate-100/80 text-slate-600 hover:text-slate-900 border border-slate-200/70'
        }`}
      >
        <span className="flex items-center gap-1.5">
          {isRunning ? (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-600" />
            </span>
          ) : (
            <Brain className="h-3.5 w-3.5 text-purple-600 group-hover:scale-105 transition-transform" />
          )}

          <span className="text-[11px] font-medium tracking-tight">
            {isRunning ? (
              activeTool ? (
                <>
                  正在调用工具：
                  <span className="font-semibold text-purple-950">
                    {TOOL_NAME_MAP[activeTool] || activeTool}
                  </span>
                </>
              ) : (
                '思考中 · 检索事实库并规划动作...'
              )
            ) : (
              <>
                已深度思考并调用工具{' '}
                <span className="text-slate-400 font-mono text-[10px]">
                  ({stepCount} 个步骤
                  {toolSteps.length > 0 ? ` · ${toolSteps.length} 次工具` : ''})
                </span>
              </>
            )}
          </span>
        </span>

        <span className="text-slate-400 group-hover:text-slate-600 transition-colors ml-1">
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </span>
      </button>

      {/* Expanded Timeline & Details Drawer */}
      {isExpanded && (
        <div className="mt-2 overflow-hidden rounded-xl border border-slate-200/90 bg-slate-50/60 p-3 shadow-2xs backdrop-blur-xs">
          <div className="flex items-center justify-between border-b border-slate-200/70 pb-2 mb-2.5">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-slate-700 tracking-wide uppercase">
                思维链与工具执行轨迹
              </span>
              <span className="rounded bg-slate-200/80 px-1.5 py-0.2 text-[9px] font-mono text-slate-600">
                {stepCount} STEPS
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleCopy(JSON.stringify(displaySteps, null, 2), 'copy_all_steps')}
                className="inline-flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-800 transition"
                title="复制完整思维链 JSON"
              >
                {copiedKey === 'copy_all_steps' ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-600" />
                    <span className="text-emerald-600">已复制</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    <span>复制全链路</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Steps Timeline */}
          <div className="relative pl-3 space-y-3.5 before:absolute before:left-1 before:top-2 before:bottom-2 before:w-[1.5px] before:bg-slate-200">
            {displaySteps.map((step, idx) => {
              const isTool = step.step_type === 'tool_execution';
              const isDetailsOpen = !!expandedDetails[step.step_id || String(idx)];
              const friendlyTitle = isTool ? TOOL_NAME_MAP[step.title] || step.title : step.title;

              return (
                <div key={step.step_id || idx} className="relative group">
                  {/* Step bullet on vertical line */}
                  <span className="absolute -left-3 top-1 flex h-2.5 w-2.5 -translate-x-1/2 items-center justify-center rounded-full bg-white ring-2 ring-slate-300">
                    <span
                      className={`h-1 w-1 rounded-full ${
                        step.status === 'success'
                          ? 'bg-emerald-500'
                          : step.status === 'pending'
                            ? 'bg-sky-500 animate-ping'
                            : step.status === 'pending_confirmation'
                              ? 'bg-amber-500'
                              : 'bg-slate-400'
                      }`}
                    />
                  </span>

                  <div className="rounded-lg border border-slate-200/80 bg-white p-2.5 shadow-2xs hover:border-slate-300 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-slate-100/80 text-slate-700">
                          {getStepIcon(step.step_type, step.status)}
                        </span>
                        <span className="text-xs font-semibold text-slate-800">
                          {friendlyTitle}
                        </span>
                        {isTool && step.title !== friendlyTitle && (
                          <span className="font-mono text-[10px] text-slate-400">
                            ({step.title})
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {getStatusBadge(step.status)}
                        {step.timestamp && (
                          <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
                            {new Date(step.timestamp).toLocaleTimeString('zh-CN', {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Step description or summary */}
                    {step.description && (
                      <p className="mt-1.5 text-xs text-slate-600 leading-relaxed break-words whitespace-pre-wrap">
                        {step.description}
                      </p>
                    )}

                    {/* Expandable Parameters / Details for Tool Calls */}
                    {step.details && (
                      <div className="mt-2 pt-1.5 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => toggleDetail(step.step_id || String(idx))}
                          className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500 hover:text-slate-800 transition"
                        >
                          <Code2 className="h-3 w-3" />
                          <span>{isDetailsOpen ? '收起入参与调用详情' : '查看工具入参与详情'}</span>
                          {isDetailsOpen ? (
                            <ChevronDown className="h-2.5 w-2.5" />
                          ) : (
                            <ChevronRight className="h-2.5 w-2.5" />
                          )}
                        </button>

                        {isDetailsOpen && (
                          <div className="mt-1.5 relative rounded-md bg-slate-900 p-2 font-mono text-[10px] text-slate-200">
                            <button
                              type="button"
                              onClick={() =>
                                handleCopy(
                                  JSON.stringify(step.details, null, 2),
                                  `detail_${step.step_id || idx}`,
                                )
                              }
                              className="absolute right-2 top-2 rounded bg-slate-800 p-1 text-slate-400 hover:text-white"
                              title="复制代码"
                            >
                              {copiedKey === `detail_${step.step_id || idx}` ? (
                                <Check className="h-3 w-3 text-emerald-400" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                            <pre className="overflow-x-auto whitespace-pre-wrap max-h-48 pr-6">
                              {JSON.stringify(step.details, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ThoughtChainCard;
