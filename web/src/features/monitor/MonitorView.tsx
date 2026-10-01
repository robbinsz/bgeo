import { useState, useMemo } from 'react';
import {
  Search,
  Play,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Clock,
  Target,
  Layers,
  HelpCircle,
  X,
  ExternalLink,
  Copy,
  Check,
  Flame,
  Zap,
  Sparkles,
  ShieldAlert,
  Eye,
  Activity,
  ShoppingBag,
  BookOpen,
} from 'lucide-react';
import { usePagedResource } from '../../hooks/usePagedResource';
import { PermissionButton } from '../../components/ui/Permissions';
import { api, type Snapshot } from '../../services/api';
import { Page, ResourceState } from '../../components/ui/Resource';
import { useResource } from '../../hooks/useResource';
import { useAction } from '../../hooks/useAction';
import { BrandBadge } from '../../components/common/BrandIcon';

interface Props {
  onShowToast: (title: string, note?: string) => void;
  onOpenModal: (title: string) => void;
}

type TabType = 'queries' | 'snapshots' | 'batches';

// Helper: Query Intent metadata
function getIntentBadge(intent: string) {
  const i = (intent || '').toLowerCase();
  if (i.includes('comm') || i.includes('商')) {
    return { label: '商业意图', bg: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8', icon: ShoppingBag };
  }
  if (i.includes('info') || i.includes('信')) {
    return { label: '信息咨询', bg: '#f0fdf4', border: '#bbf7d0', color: '#15803d', icon: BookOpen };
  }
  if (i.includes('comp') || i.includes('比')) {
    return { label: '竞品对比', bg: '#fffbeb', border: '#fde68a', color: '#b45309', icon: Layers };
  }
  return { label: intent || '通用意图', bg: '#f8fafc', border: '#e2e8f0', color: '#475467', icon: HelpCircle };
}

// Helper: Query Priority metadata
function getPriorityBadge(priority: string) {
  const p = (priority || '').toLowerCase();
  if (p === 'critical' || p === 'p0' || p === '致命') {
    return { label: 'P0 · 致命核心', bg: '#fef2f2', border: '#fecaca', color: '#dc2626', icon: Flame };
  }
  if (p === 'high' || p === 'p1' || p === '高') {
    return { label: 'P1 · 高优先', bg: '#fffbeb', border: '#fde68a', color: '#d97706', icon: Zap };
  }
  if (p === 'medium' || p === 'p2' || p === '中') {
    return { label: 'P2 · 中等', bg: '#eff6ff', border: '#bfdbfe', color: '#2563eb', icon: Sparkles };
  }
  return { label: 'P3 · 低优先', bg: '#f8fafc', border: '#e2e8f0', color: '#64748b', icon: Activity };
}

// Helper: Snapshot Status metadata
function getSampleStatusBadge(status: string) {
  const s = (status || '').toLowerCase();
  if (s === 'success' || s === 'completed') {
    return { label: '采样成功', bg: '#ecfdf5', border: '#a7f3d0', color: '#047857', icon: CheckCircle2 };
  }
  if (s === 'failed' || s === 'error') {
    return { label: '采样异常', bg: '#fef2f2', border: '#fecaca', color: '#dc2626', icon: AlertCircle };
  }
  if (s === 'refusal' || s === 'refused') {
    return { label: '模型拒答', bg: '#fffbeb', border: '#fde68a', color: '#d97706', icon: ShieldAlert };
  }
  return { label: status || '未知状态', bg: '#f8fafc', border: '#e2e8f0', color: '#64748b', icon: Activity };
}

export function MonitorView({ onOpenModal, onShowToast }: Props) {
  const queries = usePagedResource(api.getQueries);
  const snapshots = useResource(api.getSnapshots, 5000);
  const runs = useResource(api.getMonitorRuns, 5000);
  const action = useAction(onShowToast);

  // Active Navigation Tab
  const [activeTab, setActiveTab] = useState<TabType>('queries');

  // Query Filter States
  const [querySearch, setQuerySearch] = useState('');
  const [intentFilter, setIntentFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');

  // Snapshot Filter States
  const [snapshotSearch, setSnapshotSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState('all');
  const [mentionFilter, setMentionFilter] = useState('all');
  const [sampleStatusFilter, setSampleStatusFilter] = useState('all');

  // Selected Detail Drawer
  const [selectedSnapshot, setSelectedSnapshot] = useState<Snapshot | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const queryItems = queries.data?.items ?? [];
  const snapshotItems = snapshots.data?.items ?? [];
  const runHistory = runs.data?.items ?? [];

  // Filtered Queries
  const filteredQueries = useMemo(() => {
    return queryItems.filter((q) => {
      if (intentFilter !== 'all' && q.intent !== intentFilter) return false;
      if (priorityFilter !== 'all' && q.priority !== priorityFilter) return false;
      if (querySearch.trim()) {
        const needle = querySearch.toLowerCase();
        const matchText = q.query_text?.toLowerCase().includes(needle);
        const matchTopic = q.topic?.toLowerCase().includes(needle);
        if (!matchText && !matchTopic) return false;
      }
      return true;
    });
  }, [queryItems, intentFilter, priorityFilter, querySearch]);

  // Filtered Snapshots
  const filteredSnapshots = useMemo(() => {
    return snapshotItems.filter((s) => {
      if (channelFilter !== 'all' && s.channel_id !== channelFilter) return false;
      if (sampleStatusFilter !== 'all' && s.sample_status !== sampleStatusFilter) return false;
      if (mentionFilter === 'mentioned' && !s.is_brand_mentioned) return false;
      if (mentionFilter === 'unmentioned' && s.is_brand_mentioned) return false;
      if (snapshotSearch.trim()) {
        const needle = snapshotSearch.toLowerCase();
        const matchAnswer = s.raw_answer?.toLowerCase().includes(needle);
        const matchError = s.error_message?.toLowerCase().includes(needle);
        const matchModel = s.model_version?.toLowerCase().includes(needle);
        if (!matchAnswer && !matchError && !matchModel) return false;
      }
      return true;
    });
  }, [snapshotItems, channelFilter, sampleStatusFilter, mentionFilter, snapshotSearch]);

  // Dynamic Channel Options from Snapshot Data
  const availableChannels = useMemo(() => {
    const set = new Set<string>();
    snapshotItems.forEach((s) => {
      if (s.channel_id) set.add(s.channel_id);
    });
    return Array.from(set);
  }, [snapshotItems]);

  // High-Level KPIs
  const commercialQueriesCount = queryItems.filter((q) => q.intent?.includes('comm')).length;
  const infoQueriesCount = queryItems.filter((q) => q.intent?.includes('info')).length;

  const totalSuccessSamples = runHistory.reduce((sum, r) => sum + (r.success_count ?? 0), 0);
  const totalFailureSamples = runHistory.reduce((sum, r) => sum + (r.failure_count ?? 0), 0);
  const totalSamples = totalSuccessSamples + totalFailureSamples;
  const sampleSuccessRate = totalSamples > 0 ? ((totalSuccessSamples / totalSamples) * 100).toFixed(1) : '0.0';

  const mentionedCount = snapshotItems.filter((s) => s.is_brand_mentioned).length;
  const mentionRate = snapshotItems.length > 0 ? ((mentionedCount / snapshotItems.length) * 100).toFixed(1) : '0.0';

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const paginationInfo = queries.data?.pagination;

  return (
    <Page
      id="view-monitor"
      title="监测中心"
      description="实时接入 ChatGPT、DeepSeek、豆包、Kimi、Perplexity 等生成式引擎，实时监测品牌提及、推荐排位与原始引用证据链条。"
      actions={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <PermissionButton
            className="btn"
            disabled={action.busy}
            onClick={() => void action.run(api.triggerMonitorRun, '监测采样批次已受理，正在启动采样引擎…')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Play size={14} className={action.busy ? 'animate-spin' : ''} />
            <span>{action.busy ? '批次运行中…' : '启动监测批次'}</span>
          </PermissionButton>
          <PermissionButton
            className="btn primary"
            onClick={() => onOpenModal('新增监测问题')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <span>＋ 新增问题</span>
          </PermissionButton>
        </div>
      }
    >
      {/* ========================================================= */}
      {/* 1. Top KPI Overview Cards (Unified Visual Hierarchy)      */}
      {/* ========================================================= */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        {/* KPI 1: Monitored Queries */}
        <div className="card stat" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748b' }}>监测核心问题集</span>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: '#eff6ff',
                color: '#2563eb',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <HelpCircle size={17} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: '8px 0 3px', letterSpacing: '-0.02em' }}>
            {queryItems.length}
          </div>
          <div style={{ fontSize: '11.5px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#1d4ed8', fontWeight: 600 }}>商业意图 {commercialQueriesCount}</span>
            <span>·</span>
            <span>信息咨询 {infoQueriesCount}</span>
          </div>
        </div>

        {/* KPI 2: Batches Run */}
        <div className="card stat" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748b' }}>全网采样批次</span>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: '#f5f3ff',
                color: '#7c3aed',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Layers size={17} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: '8px 0 3px', letterSpacing: '-0.02em' }}>
            {runHistory.length}
          </div>
          <div style={{ fontSize: '11.5px', color: '#64748b' }}>
            {runHistory.length > 0 ? `最新：${new Date(runHistory[0].created_at).toLocaleTimeString()}` : '无历史批次'}
          </div>
        </div>

        {/* KPI 3: Brand Mention Rate */}
        <div className="card stat" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748b' }}>品牌生成式提及率</span>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: '#ecfdf5',
                color: '#059669',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Target size={17} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: '8px 0 3px', letterSpacing: '-0.02em' }}>
            {mentionRate}%
          </div>
          <div style={{ fontSize: '11.5px', color: '#059669', fontWeight: 500 }}>
            {mentionedCount} / {snapshotItems.length} 条样本被大模型提及
          </div>
        </div>

        {/* KPI 4: Effective Sample Success Rate */}
        <div className="card stat" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748b' }}>采样健康成功率</span>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: '#fffbeb',
                color: '#d97706',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Activity size={17} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: '8px 0 3px', letterSpacing: '-0.02em' }}>
            {sampleSuccessRate}%
          </div>
          <div style={{ fontSize: '11.5px', color: totalFailureSamples > 0 ? '#dc2626' : '#64748b' }}>
            成功 {totalSuccessSamples} · 异常/拒答 {totalFailureSamples}
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 2. Perspective Tabs Navigation                            */}
      {/* ========================================================= */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #e2e8f0',
          marginBottom: '18px',
          paddingBottom: '2px',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div
          role="tablist"
          aria-label="监测维度导航"
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
            aria-selected={activeTab === 'queries'}
            onClick={() => setActiveTab('queries')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '7px',
              fontSize: '13px',
              fontWeight: activeTab === 'queries' ? 700 : 500,
              background: activeTab === 'queries' ? '#ffffff' : 'transparent',
              color: activeTab === 'queries' ? '#0f172a' : '#64748b',
              boxShadow: activeTab === 'queries' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <HelpCircle size={14} />
            <span>目标监测问题集</span>
            <span
              style={{
                fontSize: '11px',
                padding: '1px 6px',
                borderRadius: '999px',
                background: activeTab === 'queries' ? '#eff6ff' : '#e2e8f0',
                color: activeTab === 'queries' ? '#2563eb' : '#64748b',
                fontWeight: 700,
              }}
            >
              {queryItems.length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'snapshots'}
            onClick={() => setActiveTab('snapshots')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '7px',
              fontSize: '13px',
              fontWeight: activeTab === 'snapshots' ? 700 : 500,
              background: activeTab === 'snapshots' ? '#ffffff' : 'transparent',
              color: activeTab === 'snapshots' ? '#0f172a' : '#64748b',
              boxShadow: activeTab === 'snapshots' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <Eye size={14} />
            <span>原始回答与证据快照</span>
            <span
              style={{
                fontSize: '11px',
                padding: '1px 6px',
                borderRadius: '999px',
                background: activeTab === 'snapshots' ? '#eff6ff' : '#e2e8f0',
                color: activeTab === 'snapshots' ? '#2563eb' : '#64748b',
                fontWeight: 700,
              }}
            >
              {snapshotItems.length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'batches'}
            onClick={() => setActiveTab('batches')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '7px',
              fontSize: '13px',
              fontWeight: activeTab === 'batches' ? 700 : 500,
              background: activeTab === 'batches' ? '#ffffff' : 'transparent',
              color: activeTab === 'batches' ? '#0f172a' : '#64748b',
              boxShadow: activeTab === 'batches' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <Clock size={14} />
            <span>近期采样批次历史</span>
            <span
              style={{
                fontSize: '11px',
                padding: '1px 6px',
                borderRadius: '999px',
                background: activeTab === 'batches' ? '#eff6ff' : '#e2e8f0',
                color: activeTab === 'batches' ? '#2563eb' : '#64748b',
                fontWeight: 700,
              }}
            >
              {runHistory.length}
            </span>
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#64748b' }}>
          <span
            style={{
              display: 'inline-block',
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: '#10b981',
              boxShadow: '0 0 0 3px rgba(16, 185, 129, 0.2)',
            }}
          />
          <span>分布式探针网络在线 · 自动采样间隔 6h</span>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 3. Tab 1: Monitored Queries (ONE UNIFIED CARD CONTAINER)  */}
      {/* ========================================================= */}
      {activeTab === 'queries' && (
        <article
          className="card"
          style={{
            borderRadius: '14px',
            border: '1px solid #e2e8f0',
            background: '#ffffff',
            boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
            overflow: 'hidden',
          }}
        >
          {/* Card Integrated Header Toolbar */}
          <div
            style={{
              padding: '14px 18px',
              borderBottom: '1px solid #e2e8f0',
              background: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            {/* Search Input */}
            <div style={{ position: 'relative', flex: '1 1 260px', minWidth: '220px' }}>
              <Search
                size={16}
                style={{
                  position: 'absolute',
                  left: '11px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#94a3b8',
                }}
              />
              <input
                type="text"
                value={querySearch}
                onChange={(e) => setQuerySearch(e.target.value)}
                placeholder="搜索本页问题文本、关键词或主题…"
                style={{
                  width: '100%',
                  height: '36px',
                  padding: '0 12px 0 34px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              {querySearch && (
                <button
                  type="button"
                  onClick={() => setQuerySearch('')}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#94a3b8',
                    padding: '2px',
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Intent Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12.5px', color: '#64748b', fontWeight: 600 }}>意图</span>
              <select
                className="select"
                value={intentFilter}
                onChange={(e) => setIntentFilter(e.target.value)}
                style={{ minHeight: '36px', fontSize: '13px', paddingRight: '28px' }}
              >
                <option value="all">全部意图</option>
                <option value="commercial">商业意图 (commercial)</option>
                <option value="informational">信息咨询 (informational)</option>
              </select>
            </div>

            {/* Priority Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12.5px', color: '#64748b', fontWeight: 600 }}>优先级</span>
              <select
                className="select"
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                style={{ minHeight: '36px', fontSize: '13px', paddingRight: '28px' }}
              >
                <option value="all">全部优先级</option>
                <option value="critical">P0 · 致命核心 (critical)</option>
                <option value="high">P1 · 高优先 (high)</option>
                <option value="medium">P2 · 中等 (medium)</option>
                <option value="low">P3 · 低优先 (low)</option>
              </select>
            </div>

            {/* Reset Button */}
            {(querySearch || intentFilter !== 'all' || priorityFilter !== 'all') && (
              <button
                type="button"
                className="btn small"
                onClick={() => {
                  setQuerySearch('');
                  setIntentFilter('all');
                  setPriorityFilter('all');
                }}
                style={{ color: '#dc2626', borderColor: '#fecaca', background: '#fff' }}
              >
                重置筛选
              </button>
            )}
          </div>

          {/* Table Container (Flush with Card Edges) */}
          <ResourceState
            resource={queries}
            empty={!filteredQueries.length}
            emptyMessage={querySearch || intentFilter !== 'all' || priorityFilter !== 'all' ? '未找到匹配的监测问题' : '暂无监测目标问题'}
          />

          {!!filteredQueries.length && (
            <div className="table-wrap">
              <table style={{ minWidth: '780px', width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '12px 18px', textAlign: 'left', minWidth: '240px' }}>监测目标问题</th>
                    <th style={{ padding: '12px 14px', textAlign: 'left', width: '130px', whiteSpace: 'nowrap' }}>搜索意图</th>
                    <th style={{ padding: '12px 14px', textAlign: 'left', width: '140px', whiteSpace: 'nowrap' }}>业务优先级</th>
                    <th style={{ padding: '12px 14px', textAlign: 'left', width: '110px', whiteSpace: 'nowrap' }}>监测状态</th>
                    <th style={{ padding: '12px 18px', textAlign: 'right', width: '120px', minWidth: '110px', whiteSpace: 'nowrap' }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredQueries.map((q, idx) => {
                    const intentMeta = getIntentBadge(q.intent);
                    const priorityMeta = getPriorityBadge(q.priority);
                    const IntentIcon = intentMeta.icon;
                    const PriorityIcon = priorityMeta.icon;

                    return (
                      <tr
                        key={q.id}
                        style={{
                          borderBottom: idx < filteredQueries.length - 1 ? '1px solid #f1f5f9' : 'none',
                          transition: 'background 0.12s ease',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#fcfdfe')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ padding: '13px 18px', verticalAlign: 'middle' }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                            <HelpCircle size={15} color="#2563eb" style={{ flexShrink: 0, marginTop: '3px' }} />
                            <div>
                              <span style={{ fontWeight: 650, color: '#0f172a', fontSize: '13.5px' }}>
                                {q.query_text}
                              </span>
                              {q.topic && (
                                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                                  主题集：{q.topic}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '13px 14px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontSize: '11.5px',
                              fontWeight: 600,
                              background: intentMeta.bg,
                              border: `1px solid ${intentMeta.border}`,
                              color: intentMeta.color,
                            }}
                          >
                            <IntentIcon size={12} />
                            <span>{intentMeta.label}</span>
                          </span>
                        </td>
                        <td style={{ padding: '13px 14px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontSize: '11.5px',
                              fontWeight: 600,
                              background: priorityMeta.bg,
                              border: `1px solid ${priorityMeta.border}`,
                              color: priorityMeta.color,
                            }}
                          >
                            <PriorityIcon size={12} />
                            <span>{priorityMeta.label}</span>
                          </span>
                        </td>
                        <td style={{ padding: '13px 14px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                            <span
                              style={{
                                width: '7px',
                                height: '7px',
                                borderRadius: '50%',
                                background: q.status === 'active' ? '#10b981' : '#94a3b8',
                              }}
                            />
                            <span style={{ color: q.status === 'active' ? '#047857' : '#64748b', fontWeight: 500 }}>
                              {q.status === 'active' ? '持续监测' : '已暂停'}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: '13px 18px', textAlign: 'right', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                          <button
                            type="button"
                            className="btn small"
                            onClick={() => {
                              setActiveTab('snapshots');
                              setSnapshotSearch(q.query_text);
                            }}
                            style={{
                              padding: '4px 10px',
                              fontSize: '12px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              whiteSpace: 'nowrap',
                              flexShrink: 0,
                            }}
                            title="查看此问题的引擎回答证据快照"
                          >
                            <Eye size={13} style={{ flexShrink: 0 }} />
                            <span>查看快照</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Card Integrated Bottom Pagination Footer */}
          <div
            style={{
              padding: '12px 18px',
              borderTop: '1px solid #e2e8f0',
              background: '#fcfdfe',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div style={{ fontSize: '12.5px', color: '#64748b' }}>
              显示本页 {filteredQueries.length} 项 · 共 {queryItems.length} 个监测目标问题
            </div>

            {paginationInfo && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="btn small"
                  disabled={queries.loading || queries.offset === 0}
                  onClick={() => queries.setOffset(Math.max(0, queries.offset - paginationInfo.limit))}
                >
                  上一页
                </button>
                <span style={{ fontSize: '12px', color: '#475467', fontWeight: 600 }}>
                  第 {Math.floor(queries.offset / paginationInfo.limit) + 1} 页
                </span>
                <button
                  type="button"
                  className="btn small"
                  disabled={queries.loading || !paginationInfo.has_more}
                  onClick={() => queries.setOffset(queries.offset + paginationInfo.limit)}
                >
                  下一页
                </button>
              </div>
            )}
          </div>
        </article>
      )}

      {/* ========================================================= */}
      {/* 4. Tab 2: Answer Snapshots (ONE UNIFIED CARD CONTAINER)   */}
      {/* ========================================================= */}
      {activeTab === 'snapshots' && (
        <article
          className="card"
          style={{
            borderRadius: '14px',
            border: '1px solid #e2e8f0',
            background: '#ffffff',
            boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
            overflow: 'hidden',
          }}
        >
          {/* Card Integrated Filter Toolbar */}
          <div
            style={{
              padding: '14px 18px',
              borderBottom: '1px solid #e2e8f0',
              background: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            {/* Search */}
            <div style={{ position: 'relative', flex: '1 1 260px', minWidth: '220px' }}>
              <Search
                size={16}
                style={{
                  position: 'absolute',
                  left: '11px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#94a3b8',
                }}
              />
              <input
                type="text"
                value={snapshotSearch}
                onChange={(e) => setSnapshotSearch(e.target.value)}
                placeholder="搜索回答正文、关键词或模型版本…"
                style={{
                  width: '100%',
                  height: '36px',
                  padding: '0 12px 0 34px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              {snapshotSearch && (
                <button
                  type="button"
                  onClick={() => setSnapshotSearch('')}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#94a3b8',
                    padding: '2px',
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Channel / Engine */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12.5px', color: '#64748b', fontWeight: 600 }}>引擎渠道</span>
              <select
                className="select"
                value={channelFilter}
                onChange={(e) => setChannelFilter(e.target.value)}
                style={{ minHeight: '36px', fontSize: '13px', paddingRight: '28px' }}
              >
                <option value="all">全部引擎 ({snapshotItems.length})</option>
                {availableChannels.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12.5px', color: '#64748b', fontWeight: 600 }}>采样结果</span>
              <select
                className="select"
                value={sampleStatusFilter}
                onChange={(e) => setSampleStatusFilter(e.target.value)}
                style={{ minHeight: '36px', fontSize: '13px', paddingRight: '28px' }}
              >
                <option value="all">全部状态</option>
                <option value="success">采样成功</option>
                <option value="failed">采样异常</option>
                <option value="refusal">模型拒答</option>
              </select>
            </div>

            {/* Mention */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12.5px', color: '#64748b', fontWeight: 600 }}>品牌提及</span>
              <select
                className="select"
                value={mentionFilter}
                onChange={(e) => setMentionFilter(e.target.value)}
                style={{ minHeight: '36px', fontSize: '13px', paddingRight: '28px' }}
              >
                <option value="all">全部结果</option>
                <option value="mentioned">提及品牌 ({mentionedCount})</option>
                <option value="unmentioned">未提及品牌 ({snapshotItems.length - mentionedCount})</option>
              </select>
            </div>

            {/* Reset */}
            {(snapshotSearch || channelFilter !== 'all' || sampleStatusFilter !== 'all' || mentionFilter !== 'all') && (
              <button
                type="button"
                className="btn small"
                onClick={() => {
                  setSnapshotSearch('');
                  setChannelFilter('all');
                  setSampleStatusFilter('all');
                  setMentionFilter('all');
                }}
                style={{ color: '#dc2626', borderColor: '#fecaca', background: '#fff' }}
              >
                重置
              </button>
            )}
          </div>

          <ResourceState
            resource={snapshots}
            empty={!filteredSnapshots.length}
            emptyMessage={snapshotSearch || channelFilter !== 'all' ? '未找到符合条件的回答快照' : '暂无回答快照记录'}
          />

          {/* Snapshots List (Flush inside Card, cleanly divided) */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {filteredSnapshots.map((snap, idx) => {
              const statusMeta = getSampleStatusBadge(snap.sample_status);
              const StatusIcon = statusMeta.icon;

              return (
                <div
                  key={snap.id}
                  style={{
                    padding: '18px 20px',
                    borderBottom: idx < filteredSnapshots.length - 1 ? '1px solid #eef2f6' : 'none',
                    background: '#ffffff',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#fbfcfe')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}
                >
                  {/* Top Meta Row */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '10px',
                      marginBottom: '10px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      {/* Engine Logo & Name */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <BrandBadge name={snap.channel_id || 'perplexity'} size={28} />
                        <div>
                          <strong style={{ fontSize: '13.5px', color: '#0f172a', textTransform: 'capitalize' }}>
                            {snap.channel_id || '未知引擎'}
                          </strong>
                          <span style={{ fontSize: '11.5px', color: '#64748b', marginLeft: '6px' }}>
                            {snap.model_version || '实时模型'}
                          </span>
                        </div>
                      </div>

                      {/* Sample Status Badge */}
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 600,
                          background: statusMeta.bg,
                          border: `1px solid ${statusMeta.border}`,
                          color: statusMeta.color,
                        }}
                      >
                        <StatusIcon size={12} />
                        <span>{statusMeta.label}</span>
                      </span>

                      {/* Brand Mention Badge */}
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 600,
                          background: snap.is_brand_mentioned ? '#ecfdf5' : '#f1f5f9',
                          border: `1px solid ${snap.is_brand_mentioned ? '#a7f3d0' : '#e2e8f0'}`,
                          color: snap.is_brand_mentioned ? '#047857' : '#64748b',
                        }}
                      >
                        {snap.is_brand_mentioned ? (
                          <>
                            <Target size={12} />
                            <span>提及品牌 · 排名第 {snap.brand_rank > 0 ? snap.brand_rank : '未知'}</span>
                          </>
                        ) : (
                          <span>未提及我方品牌</span>
                        )}
                      </span>
                    </div>

                    <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                      {new Date(snap.sampled_at).toLocaleString()}
                    </div>
                  </div>

                  {/* Body: Error Banner or Raw Answer Quote */}
                  {snap.error_message || snap.sample_status === 'failed' ? (
                    <div
                      style={{
                        padding: '10px 14px',
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '10px',
                        marginBottom: '8px',
                      }}
                    >
                      <AlertTriangle size={15} color="#dc2626" style={{ flexShrink: 0, marginTop: '2px' }} />
                      <div>
                        <strong style={{ fontSize: '12.5px', color: '#991b1b', display: 'block' }}>
                          采样调用异常或拒答
                        </strong>
                        <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#b91c1c', lineHeight: 1.5 }}>
                          {snap.error_message || '上游引擎返回空内容或网络连接超时，本次样本不计入品牌正向效果指标。'}
                        </p>
                      </div>
                    </div>
                  ) : null}

                  {snap.raw_answer && (
                    <div
                      style={{
                        padding: '10px 12px',
                        background: '#f8fafc',
                        border: '1px solid #edf2f7',
                        borderRadius: '8px',
                        fontSize: '13px',
                        color: '#334155',
                        lineHeight: 1.6,
                        maxHeight: '120px',
                        overflowY: 'auto',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        marginBottom: '8px',
                      }}
                    >
                      {snap.raw_answer}
                    </div>
                  )}

                  {/* Bottom Footer Actions */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '12px',
                      color: '#64748b',
                      paddingTop: '6px',
                    }}
                  >
                    <div>
                      <span>探针链路：{snap.source === 'live' ? '实时联网探针 (Live)' : '离线回放 (Demo)'}</span>
                      <span style={{ margin: '0 8px' }}>·</span>
                      <span>解析置信度：{(snap.confidence * 100).toFixed(0)}%</span>
                    </div>

                    <button
                      type="button"
                      className="btn small"
                      onClick={() => setSelectedSnapshot(snap)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                    >
                      <ExternalLink size={13} />
                      <span>完整证据与推演</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Card Integrated Bottom Footer */}
          <div
            style={{
              padding: '12px 18px',
              borderTop: '1px solid #e2e8f0',
              background: '#fcfdfe',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '12.5px',
              color: '#64748b',
            }}
          >
            <span>共显示 {filteredSnapshots.length} 条探针回答快照</span>
            <span>覆盖 {availableChannels.length} 个引擎渠道</span>
          </div>
        </article>
      )}

      {/* ========================================================= */}
      {/* 5. Tab 3: Batch Run History (ONE UNIFIED CARD CONTAINER)  */}
      {/* ========================================================= */}
      {activeTab === 'batches' && (
        <article
          className="card"
          style={{
            borderRadius: '14px',
            border: '1px solid #e2e8f0',
            background: '#ffffff',
            boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
            overflow: 'hidden',
          }}
        >
          {/* Card Integrated Header */}
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid #e2e8f0',
              background: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 750, color: '#0f172a' }}>
                近期采样批次历史 (Batch Run History)
              </h2>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                记录多渠道并发探测任务的触发时间、成功/失败数量及端到端执行结果
              </div>
            </div>
            <PermissionButton
              className="btn small primary"
              disabled={action.busy}
              onClick={() => void action.run(api.triggerMonitorRun, '已重新发起全网采样任务')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <RefreshCw size={13} className={action.busy ? 'animate-spin' : ''} />
              <span>重新触发采样</span>
            </PermissionButton>
          </div>

          <ResourceState resource={runs} empty={!runHistory.length} emptyMessage="暂无监测批次记录" />

          {/* Batches List (Flush inside Card) */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {runHistory.map((r, idx) => {
              const isFailed = r.status === 'failed' || (r.failure_count ?? 0) > 0;
              const total = r.total_queries ?? (r.success_count ?? 0) + (r.failure_count ?? 0);
              const successPercent = total > 0 ? (((r.success_count ?? 0) / total) * 100).toFixed(0) : '0';
              const failPercent = total > 0 ? (((r.failure_count ?? 0) / total) * 100).toFixed(0) : '0';

              return (
                <div
                  key={r.id}
                  style={{
                    padding: '16px 20px',
                    borderBottom: idx < runHistory.length - 1 ? '1px solid #eef2f6' : 'none',
                    background: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '14px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '9px',
                        background: isFailed ? '#fef2f2' : '#ecfdf5',
                        color: isFailed ? '#dc2626' : '#059669',
                        display: 'grid',
                        placeItems: 'center',
                      }}
                    >
                      <Clock size={18} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '13.5px' }}>
                        {new Date(r.created_at).toLocaleString()}
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                        批次单号：<code style={{ color: '#475467' }}>{r.id.slice(0, 8)}</code>
                      </div>
                    </div>
                  </div>

                  {/* Meter Progress */}
                  <div style={{ flex: '1 1 200px', maxWidth: '320px', minWidth: '160px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', marginBottom: '4px' }}>
                      <span style={{ color: '#059669' }}>成功 {r.success_count ?? 0}</span>
                      <span style={{ color: '#dc2626' }}>失败 {r.failure_count ?? 0}</span>
                      <span style={{ color: '#64748b' }}>总数 {total}</span>
                    </div>
                    <div style={{ height: '6px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden', display: 'flex' }}>
                      <div style={{ height: '100%', width: `${successPercent}%`, background: '#10b981' }} />
                      <div style={{ height: '100%', width: `${failPercent}%`, background: '#ef4444' }} />
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '11.5px',
                        fontWeight: 600,
                        background: r.status === 'completed' ? '#ecfdf5' : '#fef2f2',
                        border: `1px solid ${r.status === 'completed' ? '#a7f3d0' : '#fecaca'}`,
                        color: r.status === 'completed' ? '#047857' : '#dc2626',
                      }}
                    >
                      {r.status === 'completed' ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                      <span>{r.status === 'completed' ? '正常完成' : '执行告警 (failed)'}</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Card Integrated Bottom Footer */}
          <div
            style={{
              padding: '12px 18px',
              borderTop: '1px solid #e2e8f0',
              background: '#fcfdfe',
              fontSize: '12.5px',
              color: '#64748b',
            }}
          >
            最近记录共 {runHistory.length} 轮采样批次
          </div>
        </article>
      )}

      {/* ========================================================= */}
      {/* 6. Snapshot Inspection Slide-Over Drawer                  */}
      {/* ========================================================= */}
      {selectedSnapshot && (
        <div
          className="agent-drawer-backdrop"
          onClick={() => setSelectedSnapshot(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="agent-drawer-panel"
            onClick={(e) => e.stopPropagation()}
            style={{ width: '45vw', minWidth: '440px' }}
          >
            {/* Header */}
            <div
              style={{
                padding: '20px 24px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#f8fafc',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <BrandBadge name={selectedSnapshot.channel_id} size={28} />
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 750, color: '#0f172a' }}>
                    {selectedSnapshot.channel_id} 原始回答与证据详情
                  </h3>
                  <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                    采样时间：{new Date(selectedSnapshot.sampled_at).toLocaleString()}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="close"
                onClick={() => setSelectedSnapshot(null)}
                aria-label="关闭抽屉"
              >
                ×
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Quick Meta Pills */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ padding: '3px 9px', borderRadius: '6px', fontSize: '12px', background: '#eff6ff', color: '#2563eb', fontWeight: 600 }}>
                  模型版本：{selectedSnapshot.model_version || '未标记'}
                </span>
                <span
                  style={{
                    padding: '3px 9px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    background: selectedSnapshot.is_brand_mentioned ? '#ecfdf5' : '#fef2f2',
                    color: selectedSnapshot.is_brand_mentioned ? '#047857' : '#dc2626',
                  }}
                >
                  {selectedSnapshot.is_brand_mentioned
                    ? `提及品牌 (排名第 ${selectedSnapshot.brand_rank > 0 ? selectedSnapshot.brand_rank : '—'})`
                    : '未提及品牌'}
                </span>
                <span style={{ padding: '3px 9px', borderRadius: '6px', fontSize: '12px', background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0' }}>
                  置信度：{(selectedSnapshot.confidence * 100).toFixed(0)}%
                </span>
              </div>

              {/* Error Message if any */}
              {selectedSnapshot.error_message && (
                <div style={{ padding: '12px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#991b1b', fontSize: '12.5px' }}>
                  <strong>异常告警：</strong>
                  <p style={{ margin: '4px 0 0' }}>{selectedSnapshot.error_message}</p>
                </div>
              )}

              {/* Raw Answer Block */}
              <div className="card" style={{ padding: '16px', borderRadius: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <h4 style={{ margin: 0, fontSize: '13.5px', fontWeight: 700, color: '#0f172a' }}>
                    大模型原始生成回答
                  </h4>
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => handleCopy(selectedSnapshot.raw_answer || '', 'raw_answer')}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '2px 8px' }}
                  >
                    {copiedKey === 'raw_answer' ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                    <span>{copiedKey === 'raw_answer' ? '已复制' : '复制文本'}</span>
                  </button>
                </div>
                <div
                  style={{
                    padding: '12px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '12.5px',
                    color: '#334155',
                    lineHeight: 1.6,
                    maxHeight: '260px',
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {selectedSnapshot.raw_answer || '无文本回答内容（调用失败或拒答）'}
                </div>
              </div>

              {/* Parsed Structure JSON */}
              {selectedSnapshot.parsed_data && (
                <div className="card" style={{ padding: '16px', borderRadius: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <h4 style={{ margin: 0, fontSize: '13.5px', fontWeight: 700, color: '#0f172a' }}>
                      解析提取证据链条 (JSON)
                    </h4>
                    <button
                      type="button"
                      className="btn small"
                      onClick={() => handleCopy(selectedSnapshot.parsed_data, 'parsed_data')}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '2px 8px' }}
                    >
                      {copiedKey === 'parsed_data' ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                      <span>{copiedKey === 'parsed_data' ? '已复制' : '复制 JSON'}</span>
                    </button>
                  </div>
                  <pre
                    style={{
                      margin: 0,
                      padding: '12px',
                      background: '#0f172a',
                      color: '#f8fafc',
                      borderRadius: '8px',
                      fontSize: '11.5px',
                      maxHeight: '220px',
                      overflow: 'auto',
                    }}
                  >
                    {selectedSnapshot.parsed_data}
                  </pre>
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                padding: '16px 24px',
                borderTop: '1px solid #e2e8f0',
                background: '#ffffff',
                display: 'flex',
                justifyContent: 'flex-end',
              }}
            >
              <button
                type="button"
                className="btn"
                onClick={() => setSelectedSnapshot(null)}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}

export default MonitorView;
