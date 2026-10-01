import { usePermissions } from '../../hooks/permissions';
import { PermissionButton } from '../../components/ui/Permissions';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import React, { useState, useEffect, useRef } from 'react';
import {
  Bot,
  User,
  X,
  ArrowUp,
  PlusCircle,
  History,
  Trash2,
  Pencil,
  Check,
  SlidersHorizontal,
  Loader2,
  Maximize2,
  Minimize2,
  BarChart3,
  Play,
  FileText,
  Clock,
  Sliders,
  SendHorizontal,
  Copy,
} from 'lucide-react';
import type { ViewType, CopilotActionPreview } from '../../types';
import { useCopilotSession } from '../../hooks/useCopilotSession';
import { CopilotActionCard } from './CopilotActionCard';
import { ThoughtChainCard } from './ThoughtChainCard';
import { MarkdownView } from '../common/MarkdownView';
import { groupSessionsByDate } from '../../utils/sessionGrouping';

interface CopilotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentView: ViewType;
}

const VIEW_LABELS: Record<string, string> = {
  overview: '总览看板',
  monitor: '全渠道监测',
  diagnosis: '诊断与机会',
  strategy: '策略任务库',
  content: '内容生产与质检',
  publish: '渠道发布中心',
  experiments: '策略归因实验',
  evolution: '规则资产自进化',
  sources: '事实资产库',
  settings: '系统设置',
};

const SUGGESTIONS = [
  { icon: BarChart3, text: '查看当前的 GEO 效果与竞品差距' },
  { icon: Play, text: '立即跑一次全量监测拨测' },
  { icon: FileText, text: '针对当前机会生成一篇优化草稿' },
  { icon: Clock, text: '查看自动化定时任务运行状态' },
  { icon: Sliders, text: '把每日定时拨测改成早上 9 点跑' },
  { icon: SendHorizontal, text: '发布一条关于透明收费的答复内容' },
];

export const CopilotDrawer: React.FC<CopilotDrawerProps> = ({ isOpen, onClose, currentView }) => {
  const permissions = usePermissions();
  const controller = useCopilotSession(isOpen, {
    current_route: `/${currentView}`,
    current_view: currentView,
  });
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
    handleSend,
    handleDeleteSession,
    handleRenameSession,
    handleConfirmAction,
    handleCancelAction,
  } = controller;
  const loadSessionDetails = (id: string) => {
    setShowHistory(false);
    return controller.loadSessionDetails(id);
  };
  const startNewSession = () => {
    setShowHistory(false);
    controller.startNewSession();
  };
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  const handleCopyMessage = (content: string, id: string) => {
    navigator.clipboard.writeText(content);
    setCopiedMsgId(id);
    setTimeout(() => setCopiedMsgId(null), 1800);
  };
  const [showHistory, setShowHistory] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming, activeTool]);

  const dialog = useRef<HTMLDivElement>(null);
  useDialogFocus(dialog, isOpen, onClose);
  if (!isOpen) return null;

  return (
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-label="运营副驾驶"
      tabIndex={-1}
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/30 backdrop-blur-xs transition-opacity duration-200"
    >
      <div
        className={`relative flex h-full flex-col bg-white shadow-2xl transition-all duration-300 border-l border-slate-200/80 ${
          isExpanded ? 'w-full md:w-[50vw]' : 'w-full sm:w-[760px]'
        }`}
      >
        {requestError && (
          <p role="alert" className="px-5 py-2 text-red-700">
            {requestError}
          </p>
        )}
        {/* Top Header - Claude & Linear Style */}
        <div className="flex h-14 items-center justify-between border-b border-slate-200/80 bg-white px-5">
          <div className="flex items-center space-x-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-white shadow-xs">
              <Bot className="h-4 w-4 text-emerald-400" />
            </span>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                  GeoPilot 运营副驾驶
                </h3>
                <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-mono text-slate-600">
                  LangGraph
                </span>
              </div>
              <div className="flex items-center space-x-1.5 text-[11px] text-slate-500">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                <span>当前关联: {VIEW_LABELS[currentView] || currentView}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-1">
            <button
              type="button"
              onClick={startNewSession}
              title="开启新对话"
              className="flex items-center space-x-1 rounded-md px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">新会话</span>
            </button>
            <button
              type="button"
              onClick={() => setShowHistory(!showHistory)}
              title="历史会话"
              className={`rounded-md p-1.5 text-xs transition ${
                showHistory
                  ? 'bg-slate-100 text-slate-900'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <History className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              title={isExpanded ? '还原默认宽度 (760px)' : '展开至半屏 (50vw)'}
              className="hidden sm:inline-flex rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition"
            >
              {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              title="关闭 (Esc)"
              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* History Sessions Drawer View */}
        {showHistory ? (
          <div className="flex-1 overflow-y-auto p-5 bg-slate-50/50">
            <div className="mb-3.5 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                历史会话记录
              </span>
              <button
                type="button"
                onClick={startNewSession}
                className="text-xs font-medium text-slate-900 hover:text-slate-700"
              >
                + 新建对话
              </button>
            </div>
            {sessions.length === 0 ? (
              <div className="py-16 text-center text-xs text-slate-400">暂无历史会话</div>
            ) : (
              <div className="space-y-4">
                {groupSessionsByDate(sessions).map((group) => (
                  <div key={group.label}>
                    <div className="text-[11px] font-semibold text-slate-400 mb-1.5 px-1 tracking-wider">
                      {group.label}
                    </div>
                    <div className="space-y-1.5">
                      {group.items.map((s) => {
                        const isSelected = currentSessionId === s.id;
                        const isEditing = editingSessionId === s.id;

                        return (
                          <div
                            key={s.id}
                            onClick={() => {
                              if (!isEditing) loadSessionDetails(s.id);
                            }}
                            className={`group flex items-center justify-between rounded-lg px-3 py-2.5 cursor-pointer transition ${
                              isSelected
                                ? 'bg-slate-200/80 text-slate-900 font-medium'
                                : 'text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            {isEditing ? (
                              <div
                                className="flex items-center w-full space-x-1.5"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <input
                                  autoFocus
                                  type="text"
                                  value={editingTitle}
                                  onChange={(e) => setEditingTitle(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      handleRenameSession(s.id, editingTitle);
                                      setEditingSessionId(null);
                                    }
                                    if (e.key === 'Escape') {
                                      setEditingSessionId(null);
                                    }
                                  }}
                                  className="flex-1 rounded border border-blue-500 px-2 py-1 text-xs text-slate-800 bg-white outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleRenameSession(s.id, editingTitle);
                                    setEditingSessionId(null);
                                  }}
                                  title="保存"
                                  className="rounded p-1 text-emerald-600 hover:bg-emerald-50"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingSessionId(null)}
                                  title="取消"
                                  className="rounded p-1 text-slate-400 hover:bg-slate-100"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : (
                              <>
                                <div className="min-w-0 flex-1 pr-2">
                                  <div
                                    className="truncate text-xs font-medium text-slate-900"
                                    title={s.title}
                                  >
                                    {s.title}
                                  </div>
                                  <div className="text-[10px] text-slate-400 mt-1 font-mono">
                                    {new Date(s.last_active_at || s.created_at).toLocaleString(
                                      'zh-CN',
                                      {
                                        month: 'numeric',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      },
                                    )}
                                  </div>
                                </div>
                                <div
                                  className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    type="button"
                                    disabled={!permissions.write}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingSessionId(s.id);
                                      setEditingTitle(s.title);
                                    }}
                                    title="重命名会话"
                                    className="rounded p-1 text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <PermissionButton
                                    permission="write"
                                    type="button"
                                    onClick={(e) => handleDeleteSession(e, s.id)}
                                    title="删除会话"
                                    className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </PermissionButton>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Chat Message Stream - Clean Claude / ChatGPT layout */
          <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/30">
            {messages.map((m, index) => {
              const isUser = m.role === 'user';
              const isCurrentStreaming = isStreaming && !isUser && index === messages.length - 1;
              let previewData: CopilotActionPreview | null = null;
              if (m.card_payload) {
                try {
                  previewData = JSON.parse(m.card_payload);
                } catch {
                  // Ignore
                }
              }

              return (
                <div key={m.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                  <div className="flex items-start space-x-2.5 max-w-[92%]">
                    {!isUser && (
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-900 text-white mt-0.5">
                        <Bot className="h-3.5 w-3.5 text-emerald-400" />
                      </span>
                    )}

                    <div className="flex flex-col">
                      {!isUser && (
                        <span className="text-[11px] font-medium text-slate-500 mb-1">
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
                          className={`rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                            isUser
                              ? 'bg-slate-900 text-slate-50 rounded-tr-xs shadow-xs'
                              : 'border border-slate-200/90 bg-white text-slate-800 rounded-tl-xs shadow-2xs'
                          }`}
                        >
                          {isUser ? (
                            <div className="whitespace-pre-wrap">{m.content}</div>
                          ) : (
                            <MarkdownView content={m.content} isStreaming={isCurrentStreaming} />
                          )}

                          {/* Action Confirmation Card if any */}
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

                      <div className="mt-1 px-1 flex items-center gap-2">
                        <span className="text-[10px] text-slate-400 font-mono">
                          {new Date(m.created_at).toLocaleTimeString('zh-CN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>

                        {!isUser && m.content && (
                          <button
                            type="button"
                            onClick={() => handleCopyMessage(m.content, m.id)}
                            className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-700 transition"
                            title="复制回答内容"
                          >
                            {copiedMsgId === m.id ? (
                              <Check className="h-3 w-3 text-emerald-500" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                            <span>{copiedMsgId === m.id ? '已复制' : '复制'}</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {isUser && (
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-200 text-slate-700 mt-0.5">
                        <User className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Active Tool Calling Status Indicator */}
            {activeTool && (
              <div className="flex items-center space-x-2.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-700 shadow-2xs">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-600" />
                <span className="font-medium">
                  {activeTool === 'run_monitor_batch'
                    ? '正在并发执行全量关键词监测拨测...'
                    : activeTool === 'get_geo_overview_and_gaps'
                      ? '正在检索最新 GEO 提及率与落后机会数据...'
                      : activeTool === 'generate_optimized_content'
                        ? '正在基于品牌事实库生成针对性答复草稿...'
                        : activeTool === 'get_schedule_status'
                          ? '正在读取定时任务调度与执行历史...'
                          : `正在调用工具 ${activeTool}...`}
                </span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Input Bar & Suggestion Area - Minimalist ChatGPT style */}
        <div className="border-t border-slate-200/80 bg-white p-4">
          {/* Quick Suggestions Chips with Clean Monochrome Icons */}
          <div className="mb-3 flex space-x-2 overflow-x-auto pb-1 scrollbar-none">
            {SUGGESTIONS.map((item, idx) => {
              const IconComp = item.icon;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSend(item.text)}
                  disabled={isStreaming || !permissions.write}
                  className="inline-flex shrink-0 items-center space-x-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition shadow-2xs disabled:opacity-50"
                >
                  <IconComp className="h-3 w-3 text-slate-500" />
                  <span>{item.text}</span>
                </button>
              );
            })}
          </div>

          {/* Context Tag */}
          <div className="mb-2 flex items-center justify-between text-[11px] text-slate-500 font-medium">
            <span className="flex items-center space-x-1.5">
              <SlidersHorizontal className="h-3 w-3 text-slate-600" />
              <span>
                当前上下文：
                {VIEW_LABELS[currentView] || currentView}
              </span>
            </span>
            <div className="flex items-center space-x-1">
              <span className="text-[10px] text-slate-400">呼出快捷键：</span>
              <kbd className="font-mono text-[10px] bg-slate-100 border border-slate-200 rounded px-1 text-slate-600">
                ⌘K
              </kbd>
            </div>
          </div>

          {/* Input Box - Claude style */}
          <div className="relative flex items-end rounded-xl border border-slate-300 bg-white shadow-xs focus-within:border-slate-900 focus-within:ring-1 focus-within:ring-slate-900 transition">
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
              placeholder={`输入指令（例如：“查看当前 GEO 排名差距” 或 “启动全量拨测”）...`}
              disabled={isStreaming || !permissions.write}
              className="flex-1 resize-none bg-transparent px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => handleSend()}
              disabled={!input.trim() || isStreaming || !permissions.write}
              className="m-2 flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-white shadow-xs hover:bg-slate-800 disabled:bg-slate-100 disabled:text-slate-300 transition"
              title="发送指令 (Enter)"
            >
              {isStreaming ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
