import { useCallback, useEffect, useRef, useState } from 'react';
import { api, streamSSE } from '../services/api';
import type { AgentExecutionStep, CopilotMessage, CopilotSession } from '../types';

const welcome =
  '你好，我是 **GeoPilot 运营副驾驶**。可以查询监测结果、创建内容草稿和预览操作。涉及发布与配置的操作需要有权限的成员确认。';
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : '请求失败，请重试';

export function useCopilotSession(enabled: boolean, context: Record<string, unknown>) {
  const [sessions, setSessions] = useState<CopilotSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [requestError, setRequestError] = useState('');
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [activeToolArgs, setActiveToolArgs] = useState<unknown>(null);
  const generation = useRef(0);
  const selected = useRef<string | null>(null);
  const stream = useRef<AbortController | null>(null);
  const busy = useRef(false);

  const reset = useCallback(() => {
    generation.current++;
    stream.current?.abort();
    stream.current = null;
    busy.current = false;
    setIsStreaming(false);
    setActiveTool(null);
    setActiveToolArgs(null);
    setRequestError('');
  }, []);
  const startNewSession = useCallback(() => {
    reset();
    selected.current = null;
    setCurrentSessionId(null);
    setMessages([
      {
        id: 'welcome',
        session_id: '',
        role: 'assistant',
        content: welcome,
        created_at: new Date().toISOString(),
      },
    ]);
  }, [reset]);
  const refreshSession = useCallback(async (id: string, version: number) => {
    try {
      const result = await api.getCopilotSession(id);
      if (generation.current !== version || selected.current !== id) return;
      const steps = new Map<string, AgentExecutionStep[]>();
      for (const trace of result.traces ?? []) {
        try {
          const parsed: unknown = JSON.parse(trace.timeline_json);
          if (Array.isArray(parsed)) steps.set(trace.id, parsed as AgentExecutionStep[]);
        } catch {
          /* malformed optional trace does not hide the conversation */
        }
      }
      setMessages(
        (result.messages ?? []).map((message) => ({
          ...message,
          steps: message.trace_id ? steps.get(message.trace_id) : undefined,
        })),
      );
    } catch (error) {
      if (generation.current === version) setRequestError(errorMessage(error));
    }
  }, []);
  const loadSessionDetails = useCallback(
    async (id: string) => {
      reset();
      selected.current = id;
      setCurrentSessionId(id);
      setMessages([]);
      await refreshSession(id, generation.current);
    },
    [reset, refreshSession],
  );

  const invalidate = useCallback(() => {
    generation.current++;
    stream.current?.abort();
    busy.current = false;
  }, []);
  useEffect(() => {
    if (!enabled) return;
    const version = generation.current;
    void api
      .getCopilotSessions()
      .then((result) => {
        if (version !== generation.current) return;
        setSessions(result.items ?? []);
        if (!selected.current) {
          if (result.items?.[0]) void loadSessionDetails(result.items[0].id);
          else startNewSession();
        }
      })
      .catch((error) => {
        if (version === generation.current) setRequestError(errorMessage(error));
      });
    return invalidate;
  }, [enabled, loadSessionDetails, startNewSession, invalidate]);

  useEffect(() => {
    if (
      !enabled ||
      !currentSessionId ||
      isStreaming ||
      !messages.some((m) => m.card_status === 'queued')
    )
      return;
    const version = generation.current;
    const timer = setInterval(() => {
      if (document.visibilityState !== 'hidden') void refreshSession(currentSessionId, version);
    }, 3000);
    return () => clearInterval(timer);
  }, [enabled, currentSessionId, isStreaming, messages, refreshSession]);

  const execute = async (endpoint: string, payload: Record<string, unknown>, userText?: string) => {
    if (busy.current) throw new Error('已有任务正在执行，请稍后确认');
    busy.current = true;
    setIsStreaming(true);
    setRequestError('');
    const version = ++generation.current;
    const controller = new AbortController();
    stream.current = controller;
    const id = crypto.randomUUID(),
      sessionID = selected.current ?? '';
    const assistant: CopilotMessage = {
      id,
      session_id: sessionID,
      role: 'assistant',
      content: '',
      created_at: new Date().toISOString(),
    };
    setMessages((previous) => [
      ...previous,
      ...(userText
        ? [
            {
              ...assistant,
              id: crypto.randomUUID(),
              role: 'user' as const,
              content: userText,
            },
          ]
        : []),
      assistant,
    ]);
    const update = (changes: Partial<CopilotMessage>) => {
      if (generation.current === version)
        setMessages((previous) =>
          previous.map((message) => (message.id === id ? { ...message, ...changes } : message)),
        );
    };
    let content = '';
    let completedSession = selected.current;
    try {
      await streamSSE(
        endpoint,
        payload,
        {
          onChunk: (chunk) => {
            content += chunk;
            update({ content });
          },
          onToolStart: (tool, args) => {
            if (generation.current === version) {
              setActiveTool(tool);
              setActiveToolArgs(args);
            }
          },
          onToolDone: () => {
            if (generation.current === version) {
              setActiveTool(null);
              setActiveToolArgs(null);
            }
          },
          onInterrupt: (preview) =>
            update({
              card_type: preview.card_type,
              card_payload: JSON.stringify(preview),
              card_status: 'pending',
            }),
          onDone: (data) => {
            completedSession = data.session_id ?? completedSession;
            update({ trace_id: data.trace_id, steps: data.steps });
          },
        },
        controller.signal,
      );
      if (generation.current !== version || controller.signal.aborted) return;
      if (completedSession) {
        selected.current = completedSession;
        setCurrentSessionId(completedSession);
        await refreshSession(completedSession, version);
        const result = await api.getCopilotSessions();
        if (generation.current === version) setSessions(result.items);
      }
    } catch (error) {
      if (generation.current === version && !controller.signal.aborted) {
        setRequestError(errorMessage(error));
        throw error;
      }
    } finally {
      if (generation.current === version) {
        busy.current = false;
        setIsStreaming(false);
        setActiveTool(null);
        setActiveToolArgs(null);
      }
    }
  };
  const handleSend = async (textToSend?: string) => {
    const text = (textToSend ?? input).trim();
    if (!text || busy.current) return;
    setInput('');
    try {
      await execute(
        '/copilot/chat',
        {
          session_id: selected.current ?? undefined,
          message: text,
          context,
        },
        text,
      );
    } catch {
      /* rendered by requestError */
    }
  };
  const resume = (interruptID: string, action: 'confirm' | 'cancel') =>
    selected.current
      ? execute('/copilot/resume', {
          session_id: selected.current,
          interrupt_id: interruptID,
          action,
        })
      : Promise.reject(new Error('请先选择审批所属会话'));
  const handleDeleteSession = async (event: React.MouseEvent, id: string) => {
    event.stopPropagation();
    if (!window.confirm('确定要删除此会话记录吗？')) return;
    try {
      await api.deleteCopilotSession(id);
      setSessions((previous) => previous.filter((s) => s.id !== id));
      if (selected.current === id) startNewSession();
    } catch (error) {
      setRequestError(errorMessage(error));
    }
  };
  const handleRenameSession = async (id: string, title: string) => {
    if (!title.trim()) return;
    try {
      await api.renameCopilotSession(id, title.trim());
      setSessions((previous) =>
        previous.map((s) => (s.id === id ? { ...s, title: title.trim() } : s)),
      );
    } catch (error) {
      setRequestError(errorMessage(error));
    }
  };
  return {
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
    handleConfirmAction: (id: string) => resume(id, 'confirm'),
    handleCancelAction: (id: string) => resume(id, 'cancel'),
  };
}
