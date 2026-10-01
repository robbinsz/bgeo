import { useState, useMemo, useEffect } from 'react';
import {
  Activity,
  CheckCircle2,
  AlertCircle,
  Clock,
  Search,
  RefreshCw,
  Eye,
  Copy,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Terminal,
  ShieldCheck,
  Check,
} from 'lucide-react';
import { useResource } from '../../hooks/useResource';
import { Page, ResourceState } from '../../components/ui/Resource';
import { AgentTraceTimeline } from './AgentTraceTimeline';
import { api } from '../../services/api';
import type { AgentExecutionTrace, CopilotAuditLog } from '../../types';

interface Props {
  onShowToast: (title: string, note?: string) => void;
}

type LogViewTab = 'traces' | 'audit';

const loadTraces = () => api.getAgentTraces(undefined, 100);
const loadAuditLogs = () => api.getCopilotAuditLogs(100);

export function CopilotLogsView({ onShowToast }: Props) {
  const [activeTab, setActiveTab] = useState<LogViewTab>('traces');
  const [autoPoll, setAutoPoll] = useState(false);

  // Resources
  const traces = useResource(loadTraces, autoPoll ? 5000 : 0);
  const auditLogs = useResource(loadAuditLogs, autoPoll ? 5000 : 0);

  const traceList: AgentExecutionTrace[] = traces.data?.items || [];
  const auditList: CopilotAuditLog[] = auditLogs.data?.items || [];

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [modelFilter, setModelFilter] = useState<string>('all');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [durationFilter, setDurationFilter] = useState<string>('all');

  // Pagination States
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  // Detail Modal States
  const [selectedTrace, setSelectedTrace] = useState<AgentExecutionTrace | null>(null);
  const [selectedAuditLog, setSelectedAuditLog] = useState<CopilotAuditLog | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Reset page when tab or filters change
  useEffect(() => {
    setPage(1);
  }, [activeTab, searchQuery, statusFilter, modelFilter, riskFilter, durationFilter, pageSize]);

  // Dynamic Models List from Trace Data
  const availableModels = useMemo(() => {
    const set = new Set<string>();
    traceList.forEach((t) => {
      if (t.model_name) set.add(t.model_name);
    });
    return Array.from(set);
  }, [traceList]);

  // Filtered Traces
  const filteredTraces = useMemo(() => {
    return traceList.filter((t) => {
      // Status
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      // Model
      if (modelFilter !== 'all' && t.model_name !== modelFilter) return false;
      // Duration
      if (durationFilter === 'fast' && t.total_duration_ms >= 1000) return false;
      if (durationFilter === 'medium' && (t.total_duration_ms < 1000 || t.total_duration_ms > 3000)) return false;
      if (durationFilter === 'slow' && t.total_duration_ms <= 3000) return false;
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesPrompt = t.user_prompt.toLowerCase().includes(q);
        const matchesId = t.id.toLowerCase().includes(q) || t.session_id.toLowerCase().includes(q);
        const matchesModel = t.model_name && t.model_name.toLowerCase().includes(q);
        if (!matchesPrompt && !matchesId && !matchesModel) return false;
      }
      return true;
    });
  }, [traceList, statusFilter, modelFilter, durationFilter, searchQuery]);

  // Filtered Audit Logs
  const filteredAuditLogs = useMemo(() => {
    return auditList.filter((log) => {
      // Status
      if (statusFilter !== 'all') {
        if (statusFilter === 'completed' && log.execution_status !== 'success') return false;
        if (statusFilter === 'failed' && log.execution_status !== 'failed') return false;
        if (statusFilter === 'interrupted' && log.execution_status !== 'aborted') return false;
      }
      // Risk
      if (riskFilter !== 'all' && log.execution_risk !== riskFilter) return false;
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTool = log.tool_name.toLowerCase().includes(q);
        const matchesPayload = log.input_payload && log.input_payload.toLowerCase().includes(q);
        const matchesId = log.id.toLowerCase().includes(q) || log.session_id.toLowerCase().includes(q);
        if (!matchesTool && !matchesPayload && !matchesId) return false;
      }
      return true;
    });
  }, [auditList, statusFilter, riskFilter, searchQuery]);

  // Active items and pagination
  const currentItemsCount = activeTab === 'traces' ? filteredTraces.length : filteredAuditLogs.length;
  const totalPages = Math.max(1, Math.ceil(currentItemsCount / pageSize));
  const currentPage = Math.min(page, totalPages);

  const paginatedTraces = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTraces.slice(start, start + pageSize);
  }, [filteredTraces, currentPage, pageSize]);

  const paginatedAuditLogs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAuditLogs.slice(start, start + pageSize);
  }, [filteredAuditLogs, currentPage, pageSize]);

  // KPI Statistics
  const completedCount = traceList.filter((t) => t.status === 'completed').length;
  const successRate = traceList.length > 0 ? ((completedCount / traceList.length) * 100).toFixed(1) : '100.0';
  const avgDuration =
    traceList.length > 0
      ? Math.round(traceList.reduce((acc, t) => acc + (t.total_duration_ms || 0), 0) / traceList.length)
      : 0;
  const confirmedAuditCount = auditList.filter((a) => a.execution_risk === 'confirmed').length;

  return (
    <Page
      id="view-copilot-logs"
      title="运营副驾驶执行日志"
      description="记录智能副驾驶全生命周期的 LangGraph 状态机决策链推演、工具执行、高危操作审批与性能耗时剖析。"
    >
      {/* ========================================================= */}
      {/* 1. Top KPI Overview Stats                                 */}
      {/* ========================================================= */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        <div className="card stat" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>总推演追踪次数</span>
            <Activity size={16} color="#3b82f6" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a', margin: '6px 0 2px' }}>
            {traceList.length}
          </div>
          <div style={{ fontSize: '11px', color: '#94a3b8' }}>近 100 轮推演日志样本</div>
        </div>

        <div className="card stat" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>决策完成成功率</span>
            <CheckCircle2 size={16} color="#10b981" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a', margin: '6px 0 2px' }}>
            {successRate}%
          </div>
          <div style={{ fontSize: '11px', color: '#10b981', fontWeight: 500 }}>
            {completedCount} 轮正常完成推演
          </div>
        </div>

        <div className="card stat" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>平均执行耗时</span>
            <Clock size={16} color="#f59e0b" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a', margin: '6px 0 2px' }}>
            {avgDuration} <span style={{ fontSize: '14px', fontWeight: 400 }}>ms</span>
          </div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>单轮端到端状态机总耗时</div>
        </div>

        <div className="card stat" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>工具操作审计</span>
            <ShieldCheck size={16} color="#8b5cf6" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a', margin: '6px 0 2px' }}>
            {auditList.length}
          </div>
          <div style={{ fontSize: '11px', color: '#8b5cf6', fontWeight: 500 }}>
            {confirmedAuditCount} 次高危经审批操作
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 2. Perspective Tabs & Controls                            */}
      {/* ========================================================= */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #e2e8f0',
          marginBottom: '16px',
          paddingBottom: '4px',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div
          role="tablist"
          aria-label="日志维度导航"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: '#f1f5f9',
            padding: '4px',
            borderRadius: '10px',
          }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'traces'}
            onClick={() => setActiveTab('traces')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '7px 14px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: activeTab === 'traces' ? 600 : 500,
              color: activeTab === 'traces' ? '#0f172a' : '#64748b',
              background: activeTab === 'traces' ? '#ffffff' : 'transparent',
              boxShadow: activeTab === 'traces' ? '0 1px 3px rgba(15,23,42,0.08)' : 'none',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <Activity size={15} color={activeTab === 'traces' ? '#2563eb' : '#64748b'} />
            <span>状态机推演追踪 (Agent Traces)</span>
            <span
              style={{
                fontSize: '11px',
                padding: '1px 6px',
                borderRadius: '999px',
                background: activeTab === 'traces' ? '#dbeafe' : '#e2e8f0',
                color: activeTab === 'traces' ? '#1d4ed8' : '#64748b',
                fontWeight: 600,
              }}
            >
              {filteredTraces.length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'audit'}
            onClick={() => setActiveTab('audit')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '7px 14px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: activeTab === 'audit' ? 600 : 500,
              color: activeTab === 'audit' ? '#0f172a' : '#64748b',
              background: activeTab === 'audit' ? '#ffffff' : 'transparent',
              boxShadow: activeTab === 'audit' ? '0 1px 3px rgba(15,23,42,0.08)' : 'none',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <Terminal size={15} color={activeTab === 'audit' ? '#7c3aed' : '#64748b'} />
            <span>工具调用与操作审计 (Audit Logs)</span>
            <span
              style={{
                fontSize: '11px',
                padding: '1px 6px',
                borderRadius: '999px',
                background: activeTab === 'audit' ? '#f3e8ff' : '#e2e8f0',
                color: activeTab === 'audit' ? '#7e22ce' : '#64748b',
                fontWeight: 600,
              }}
            >
              {filteredAuditLogs.length}
            </span>
          </button>
        </div>

        {/* Refresh & Auto-poll Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              color: '#475467',
              cursor: 'pointer',
              background: autoPoll ? '#eff6ff' : '#ffffff',
              border: autoPoll ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
              padding: '4px 10px',
              borderRadius: '8px',
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={autoPoll}
              onChange={(e) => {
                setAutoPoll(e.target.checked);
                if (e.target.checked) onShowToast('实时监控已开启', '日志每 5 秒自动同步最新记录');
              }}
              style={{ width: '14px', height: '14px', accentColor: '#2563eb' }}
            />
            <span style={{ fontWeight: autoPoll ? 600 : 400, color: autoPoll ? '#1d4ed8' : '#475467' }}>
              实时监控 (5s轮询)
            </span>
          </label>

          <button
            type="button"
            className="btn small"
            onClick={() => {
              void traces.reload();
              void auditLogs.reload();
              onShowToast('日志已刷新', '最新执行追踪与审计记录已同步');
            }}
            title="手动刷新日志"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={13} className={traces.loading || auditLogs.loading ? 'animate-spin' : ''} />
            <span>刷新</span>
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 3. Filtering & Search Toolbar                             */}
      {/* ========================================================= */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '10px',
          padding: '12px 16px',
          marginBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', flex: 1 }}>
          {/* Keyword Search */}
          <div style={{ position: 'relative', minWidth: '240px', flex: '1 1 240px' }}>
            <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '10px' }} />
            <input
              type="text"
              placeholder={activeTab === 'traces' ? '搜索用户 Prompt、Session ID 或 ID…' : '搜索工具名称、载荷参数或 Session ID…'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="field"
              style={{ paddingLeft: '30px', height: '34px', width: '100%' }}
            />
          </div>

          {/* Status Filter */}
          <select
            className="field"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ height: '34px', fontSize: '12px', padding: '0 8px', minWidth: '110px' }}
          >
            <option value="all">所有状态</option>
            <option value="completed">已完成 / 成功</option>
            <option value="interrupted">中断待确认</option>
            <option value="failed">执行失败</option>
          </select>

          {/* Model Filter (Traces only) */}
          {activeTab === 'traces' && availableModels.length > 0 && (
            <select
              className="field"
              value={modelFilter}
              onChange={(e) => setModelFilter(e.target.value)}
              style={{ height: '34px', fontSize: '12px', padding: '0 8px', minWidth: '120px' }}
            >
              <option value="all">所有模型</option>
              {availableModels.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          )}

          {/* Duration Filter (Traces only) */}
          {activeTab === 'traces' && (
            <select
              className="field"
              value={durationFilter}
              onChange={(e) => setDurationFilter(e.target.value)}
              style={{ height: '34px', fontSize: '12px', padding: '0 8px', minWidth: '110px' }}
            >
              <option value="all">所有耗时</option>
              <option value="fast">&lt; 1 秒 (极速)</option>
              <option value="medium">1 ~ 3 秒 (正常)</option>
              <option value="slow">&gt; 3 秒 (深度/高耗时)</option>
            </select>
          )}

          {/* Risk Filter (Audit only) */}
          {activeTab === 'audit' && (
            <select
              className="field"
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value)}
              style={{ height: '34px', fontSize: '12px', padding: '0 8px', minWidth: '120px' }}
            >
              <option value="all">所有风险等级</option>
              <option value="confirmed">高危 · 需确认 (Confirmed)</option>
              <option value="direct">安全 · 直接执行 (Direct)</option>
            </select>
          )}

          {/* Reset Filters button if any filter active */}
          {(searchQuery || statusFilter !== 'all' || modelFilter !== 'all' || riskFilter !== 'all' || durationFilter !== 'all') && (
            <button
              type="button"
              className="btn small ghost"
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('all');
                setModelFilter('all');
                setRiskFilter('all');
                setDurationFilter('all');
              }}
              style={{ fontSize: '12px', color: '#64748b' }}
            >
              重置筛选
            </button>
          )}
        </div>

        {/* Page Size Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#64748b' }}>
          <span>每页条数:</span>
          <select
            className="field"
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            style={{ height: '32px', fontSize: '12px', padding: '0 6px', width: '65px' }}
          >
            <option value={10}>10</option>
            <option value={15}>15</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 4. Logs List & Table                                      */}
      {/* ========================================================= */}
      <ResourceState
        resource={activeTab === 'traces' ? traces : auditLogs}
        empty={currentItemsCount === 0}
        emptyMessage={
          searchQuery || statusFilter !== 'all'
            ? '未找到符合筛选条件的执行日志，请调整检索词或条件'
            : '暂无副驾驶执行日志记录'
        }
      />

      {/* VIEW A: Agent Execution Traces Table */}
      {activeTab === 'traces' && currentItemsCount > 0 && (
        <div className="table-wrap card" style={{ borderRadius: '10px', overflowX: 'auto', border: '1px solid #e2e8f0' }}>
          <table style={{ width: '100%', minWidth: '1050px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475467' }}>
                <th style={{ padding: '12px 16px', fontWeight: 600, width: '90px', whiteSpace: 'nowrap' }}>状态</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, minWidth: '260px' }}>执行指令 / 用户 Prompt</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, width: '160px', whiteSpace: 'nowrap' }}>推演模型</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, width: '110px', whiteSpace: 'nowrap' }}>耗时</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, width: '90px', whiteSpace: 'nowrap' }}>步骤数</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, width: '180px', whiteSpace: 'nowrap' }}>执行时间</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, width: '140px', textAlign: 'right', whiteSpace: 'nowrap' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {paginatedTraces.map((t) => {
                let stepsCount = 0;
                try {
                  const parsed = JSON.parse(t.timeline_json || '[]');
                  if (Array.isArray(parsed)) stepsCount = parsed.length;
                } catch {
                  /* ignore */
                }

                const statusTagClass =
                  t.status === 'completed' ? 'green' : t.status === 'interrupted' ? 'blue' : 'red';
                const statusLabel =
                  t.status === 'completed'
                    ? '已完成'
                    : t.status === 'interrupted'
                      ? '中断待审'
                      : t.status === 'failed'
                        ? '执行失败'
                        : t.status;

                return (
                  <tr
                    key={t.id}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      transition: 'background-color 0.15s ease',
                      cursor: 'pointer',
                    }}
                    onClick={() => setSelectedTrace(t)}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                      <span className={`tag ${statusTagClass}`} style={{ whiteSpace: 'nowrap' }}>{statusLabel}</span>
                    </td>
                    <td style={{ padding: '12px 16px', maxWidth: '340px' }}>
                      <div
                        style={{
                          fontWeight: 600,
                          color: '#0f172a',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={t.user_prompt}
                      >
                        {t.user_prompt}
                      </div>
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                        Session: {t.session_id.slice(0, 16)}…
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          background: '#f1f5f9',
                          color: '#334155',
                          fontFamily: 'monospace',
                          whiteSpace: 'nowrap',
                          display: 'inline-block',
                          fontWeight: 500,
                        }}
                      >
                        {t.model_name || 'default'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          color: t.total_duration_ms > 3000 ? '#ea580c' : '#334155',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {t.total_duration_ms} ms
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap' }}>{stepsCount} 节点</span>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap' }}>
                      {t.created_at ? new Date(t.created_at).toLocaleString() : '-'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        className="btn small"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTrace(t);
                        }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                        }}
                      >
                        <Eye size={13} />
                        <span style={{ whiteSpace: 'nowrap' }}>执行时间线</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* VIEW B: Tool Audit Logs Table */}
      {activeTab === 'audit' && currentItemsCount > 0 && (
        <div className="table-wrap card" style={{ borderRadius: '10px', overflowX: 'auto', border: '1px solid #e2e8f0' }}>
          <table style={{ width: '100%', minWidth: '1050px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475467' }}>
                <th style={{ padding: '12px 16px', fontWeight: 600, width: '90px', whiteSpace: 'nowrap' }}>执行状态</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, width: '180px', whiteSpace: 'nowrap' }}>调用工具 (Tool)</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, width: '120px', whiteSpace: 'nowrap' }}>风险级别</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, minWidth: '240px' }}>输入载荷参数 (Payload)</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, width: '110px', whiteSpace: 'nowrap' }}>人工审批</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, width: '180px', whiteSpace: 'nowrap' }}>调用时间</th>
                <th style={{ padding: '12px 16px', fontWeight: 600, width: '110px', textAlign: 'right', whiteSpace: 'nowrap' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {paginatedAuditLogs.map((log) => {
                const isSuccess = log.execution_status === 'success';
                const isConfirmedRisk = log.execution_risk === 'confirmed';

                return (
                  <tr
                    key={log.id}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      transition: 'background-color 0.15s ease',
                      cursor: 'pointer',
                    }}
                    onClick={() => setSelectedAuditLog(log)}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                      <span className={`tag ${isSuccess ? 'green' : 'red'}`} style={{ whiteSpace: 'nowrap' }}>
                        {isSuccess ? '成功' : log.execution_status}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 600, color: '#0f172a', fontFamily: 'monospace', fontSize: '12px', whiteSpace: 'nowrap' }}>
                        {log.tool_name}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                      <span className={`tag ${isConfirmedRisk ? 'amber' : 'gray'}`} style={{ whiteSpace: 'nowrap' }}>
                        {isConfirmedRisk ? '高危 · 确认' : '直接执行'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', maxWidth: '320px' }}>
                      <div
                        style={{
                          fontSize: '11px',
                          fontFamily: 'monospace',
                          color: '#475467',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          background: '#f8fafc',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          border: '1px solid #e2e8f0',
                        }}
                        title={log.input_payload}
                      >
                        {log.input_payload || '{}'}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                      {log.user_confirmed ? (
                        <span style={{ fontSize: '11px', color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: '2px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                          <Check size={12} /> 已核准
                        </span>
                      ) : (
                        <span style={{ fontSize: '11px', color: '#94a3b8', whiteSpace: 'nowrap' }}>无需/免审</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap' }}>
                      {log.executed_at ? new Date(log.executed_at).toLocaleString() : '-'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        className="btn small"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedAuditLog(log);
                        }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}
                      >
                        <Eye size={12} />
                        <span style={{ whiteSpace: 'nowrap' }}>详情</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ========================================================= */}
      {/* 5. Pagination Toolbar                                     */}
      {/* ========================================================= */}
      {currentItemsCount > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: '16px',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            显示第 {(currentPage - 1) * pageSize + 1} -{' '}
            {Math.min(currentPage * pageSize, currentItemsCount)} 条，共 {currentItemsCount} 条记录
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              className="btn small"
              disabled={currentPage <= 1}
              onClick={() => setPage(1)}
              title="首页"
            >
              首页
            </button>
            <button
              type="button"
              className="btn small"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}
            >
              <ChevronLeft size={14} />
              <span>上一页</span>
            </button>

            <span style={{ fontSize: '12px', fontWeight: 600, padding: '0 8px', color: '#0f172a' }}>
              {currentPage} / {totalPages}
            </span>

            <button
              type="button"
              className="btn small"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}
            >
              <span>下一页</span>
              <ChevronRight size={14} />
            </button>
            <button
              type="button"
              className="btn small"
              disabled={currentPage >= totalPages}
              onClick={() => setPage(totalPages)}
              title="末页"
            >
              末页
            </button>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 6. DRAWER: Agent Trace Execution Timeline (40vw)          */}
      {/* ========================================================= */}
      {selectedTrace && (
        <div
          className="agent-drawer-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="执行时间线抽屉"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedTrace(null);
          }}
        >
          <div
            className="agent-drawer-panel"
            style={{ width: '40vw' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                borderBottom: '1px solid #e2e8f0',
                padding: '16px 20px',
                background: '#f8fafc',
                gap: '12px',
                flexShrink: 0,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                    执行时间线
                  </h3>
                  <span className={`tag ${selectedTrace.status === 'completed' ? 'green' : 'blue'}`}>
                    {selectedTrace.status === 'completed' ? '流程闭环' : selectedTrace.status}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: '12px',
                    color: '#64748b',
                    marginTop: '4px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={selectedTrace.user_prompt}
                >
                  Prompt: <span style={{ fontWeight: 600, color: '#1e293b' }}>{selectedTrace.user_prompt}</span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '11px',
                    color: '#94a3b8',
                    marginTop: '4px',
                    fontFamily: 'monospace',
                    flexWrap: 'wrap',
                  }}
                >
                  <span>Trace ID: {selectedTrace.id.slice(0, 12)}…</span>
                  <span>·</span>
                  <span>总耗时: {selectedTrace.total_duration_ms}ms</span>
                  <span>·</span>
                  <span>模型: {selectedTrace.model_name}</span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                <button
                  type="button"
                  className="btn small"
                  onClick={() => handleCopy(selectedTrace.timeline_json, `trace-detail-${selectedTrace.id}`)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}
                >
                  {copiedKey === `trace-detail-${selectedTrace.id}` ? <CheckCheck size={12} /> : <Copy size={12} />}
                  <span>{copiedKey === `trace-detail-${selectedTrace.id}` ? '已复制' : '复制 JSON'}</span>
                </button>
                <button
                  type="button"
                  className="close"
                  onClick={() => setSelectedTrace(null)}
                  style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', lineHeight: 1, color: '#64748b', padding: '2px 6px' }}
                  title="关闭抽屉"
                >
                  ×
                </button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column' }}>
              <AgentTraceTimeline trace={selectedTrace} onClose={() => setSelectedTrace(null)} />
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 7. MODAL: Tool Audit Log Detail Modal                     */}
      {/* ========================================================= */}
      {selectedAuditLog && (
        <div
          className="modal-backdrop open"
          role="dialog"
          aria-modal="true"
          style={{ zIndex: 100 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedAuditLog(null);
          }}
        >
          <div
            style={{
              width: 'min(720px, 95vw)',
              maxHeight: '90vh',
              overflowY: 'auto',
              background: '#ffffff',
              borderRadius: '16px',
              padding: '24px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                borderBottom: '1px solid #e2e8f0',
                paddingBottom: '14px',
                marginBottom: '16px',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#0f172a' }}>
                    工具调用与审批审计详情
                  </h3>
                  <span className={`tag ${selectedAuditLog.execution_status === 'success' ? 'green' : 'red'}`}>
                    {selectedAuditLog.execution_status}
                  </span>
                  <span className={`tag ${selectedAuditLog.execution_risk === 'confirmed' ? 'amber' : 'gray'}`}>
                    {selectedAuditLog.execution_risk === 'confirmed' ? '高危 · 已审批' : '直接调用'}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', fontFamily: 'monospace' }}>
                  工具名称: <b style={{ color: '#0f172a' }}>{selectedAuditLog.tool_name}</b>
                </div>
              </div>
              <button
                type="button"
                className="close"
                onClick={() => setSelectedAuditLog(null)}
                style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Meta Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '10px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '12px',
                }}
              >
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>审计日志 ID</div>
                  <div style={{ fontSize: '12px', fontFamily: 'monospace', fontWeight: 600, color: '#0f172a' }}>
                    {selectedAuditLog.id}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>所属会话 Session ID</div>
                  <div style={{ fontSize: '12px', fontFamily: 'monospace', fontWeight: 600, color: '#0f172a' }}>
                    {selectedAuditLog.session_id}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>执行时间</div>
                  <div style={{ fontSize: '12px', color: '#0f172a' }}>
                    {selectedAuditLog.executed_at ? new Date(selectedAuditLog.executed_at).toLocaleString() : '-'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>人工审批确认</div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: selectedAuditLog.user_confirmed ? '#059669' : '#64748b' }}>
                    {selectedAuditLog.user_confirmed ? '✓ 已人工确认执行' : '免审批 / 自动放行'}
                  </div>
                </div>
              </div>

              {/* Error Message if any */}
              {selectedAuditLog.error_message && (
                <div
                  style={{
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: '8px',
                    padding: '12px',
                  }}
                >
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <AlertCircle size={14} /> 错误排查信息
                  </div>
                  <div style={{ fontSize: '12px', color: '#991b1b', marginTop: '4px', fontFamily: 'monospace' }}>
                    {selectedAuditLog.error_message}
                  </div>
                </div>
              )}

              {/* Input Payload JSON */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>
                    输入参数载荷 (Input Payload JSON)
                  </span>
                  <button
                    type="button"
                    className="btn small ghost"
                    onClick={() => handleCopy(selectedAuditLog.input_payload, `audit-payload-${selectedAuditLog.id}`)}
                    style={{ fontSize: '11px' }}
                  >
                    {copiedKey === `audit-payload-${selectedAuditLog.id}` ? <CheckCheck size={12} /> : <Copy size={12} />}
                    <span>{copiedKey === `audit-payload-${selectedAuditLog.id}` ? '已复制' : '复制参数'}</span>
                  </button>
                </div>
                <pre
                  style={{
                    margin: 0,
                    padding: '14px',
                    background: '#0f172a',
                    color: '#f8fafc',
                    borderRadius: '8px',
                    fontSize: '12px',
                    maxHeight: '260px',
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    fontFamily: 'monospace',
                  }}
                >
                  {(() => {
                    try {
                      return JSON.stringify(JSON.parse(selectedAuditLog.input_payload), null, 2);
                    } catch {
                      return selectedAuditLog.input_payload || '{}';
                    }
                  })()}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}

export default CopilotLogsView;
