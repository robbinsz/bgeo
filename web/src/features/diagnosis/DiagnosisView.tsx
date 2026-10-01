import { useState, useMemo } from 'react';
import {
  Target,
  Flame,
  Zap,
  Sparkles,
  RefreshCw,
  Search,
  CheckCircle2,
  Check,
  AlertCircle,
  HelpCircle,
  BarChart3,
  Layers,
  X,
  Plus,
  ShieldAlert,
  ExternalLink,
  Lightbulb,
  Award,
  LayoutGrid,
  List,
} from 'lucide-react';
import { usePagedResource } from '../../hooks/usePagedResource';
import { PermissionButton } from '../../components/ui/Permissions';
import { api, type Opportunity } from '../../services/api';
import { Page, ResourceState } from '../../components/ui/Resource';
import { useAction } from '../../hooks/useAction';

interface Props {
  onShowToast: (title: string, note?: string) => void;
  onOpenModal?: (title: string, defaultTopic?: string) => void;
}

type TabType = 'queue' | 'matrix' | 'gaps';

// Helper: Opportunity type mapping
function getTypeMeta(type: string) {
  switch (type) {
    case 'brand_absent':
      return {
        label: '品牌缺席',
        desc: '高价值商业问题中未提及我方品牌，存在严重流量漏斗缺口',
        color: '#dc2626',
        bg: '#fef2f2',
        border: '#fecaca',
      };
    case 'citation_missing':
      return {
        label: '引用缺失',
        desc: '生成式回答提及品牌，但缺少官方权威来源与结构化事实背书',
        color: '#d97706',
        bg: '#fffbeb',
        border: '#fde68a',
      };
    case 'content_blank':
      return {
        label: '内容空白',
        desc: '目标引擎无法检索到对应高频意图的落地页、说明文档或权威 FAQ',
        color: '#2563eb',
        bg: '#eff6ff',
        border: '#bfdbfe',
      };
    case 'fact_error':
      return {
        label: '事实错误',
        desc: '大模型引用的服务价格、资质编号或服务范围与官方事实不符',
        color: '#7c3aed',
        bg: '#f5f3ff',
        border: '#ddd6fe',
      };
    case 'competitor_lead':
      return {
        label: '竞品占位',
        desc: '头部竞品在目标主题下持续获得垄断式推荐与首位展示',
        color: '#b91c1c',
        bg: '#fff1f2',
        border: '#fecdd3',
      };
    default:
      return {
        label: type || '综合机会',
        desc: '多引擎监测信号推断出的可执行优化项',
        color: '#475467',
        bg: '#f8fafc',
        border: '#e2e8f0',
      };
  }
}

// Helper: Priority meta based on opportunity score
function getPriorityMeta(score: number) {
  if (score >= 90) {
    return {
      level: 'P0',
      label: 'P0 · 核心攻坚',
      badgeClass: 'tag red',
      pillBg: '#fef2f2',
      pillBorder: '#fecaca',
      textColor: '#dc2626',
      icon: Flame,
    };
  }
  if (score >= 80) {
    return {
      level: 'P1',
      label: 'P1 · 高价值机会',
      badgeClass: 'tag amber',
      pillBg: '#fffbeb',
      pillBorder: '#fde68a',
      textColor: '#d97706',
      icon: Zap,
    };
  }
  return {
    level: 'P2',
    label: 'P2 · 持续优化',
    badgeClass: 'tag blue',
    pillBg: '#eff6ff',
    pillBorder: '#bfdbfe',
    textColor: '#2563eb',
    icon: Sparkles,
  };
}

// Helper: Status meta
function getStatusMeta(status: string) {
  switch (status) {
    case 'new':
      return { label: '待核对', color: '#d97706', bg: '#fffbeb', border: '#fde68a' };
    case 'reviewed':
      return { label: '已核对', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' };
    case 'in_progress':
      return { label: '处理中', color: '#4f46e5', bg: '#eef2ff', border: '#c7d2fe' };
    case 'resolved':
      return { label: '已解决', color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' };
    case 'dismissed':
      return { label: '已忽略', color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' };
    default:
      return { label: status, color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' };
  }
}

export function DiagnosisView({ onShowToast, onOpenModal }: Props) {
  const resource = usePagedResource(api.getOpportunities, 5000);
  const action = useAction(onShowToast);

  // View & Tab Navigation
  const [activeTab, setActiveTab] = useState<TabType>('queue');
  const [showFormulaModel, setShowFormulaModel] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  // Filter & Search
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'score_desc' | 'score_asc' | 'impact_desc' | 'gap_desc'>('score_desc');

  // Selected Detail Drawer
  const [selectedOpp, setSelectedOpp] = useState<Opportunity | null>(null);

  const items = resource.data?.items ?? [];
  const paginationInfo = resource.data?.pagination;

  // Filter & Sort
  const filtered = useMemo(() => {
    return items
      .filter((o) => {
        if (statusFilter !== 'all' && o.status !== statusFilter) return false;
        if (typeFilter !== 'all' && o.type !== typeFilter) return false;
        if (search.trim()) {
          const q = search.toLowerCase();
          const matchTitle = o.title?.toLowerCase().includes(q);
          const matchDesc = o.description?.toLowerCase().includes(q);
          const matchAction = o.recommended_action?.toLowerCase().includes(q);
          if (!matchTitle && !matchDesc && !matchAction) return false;
        }
        return true;
      })
      .toSorted((a, b) => {
        if (sortBy === 'score_asc') return a.score - b.score;
        if (sortBy === 'impact_desc') return (b.impact_score ?? 0) - (a.impact_score ?? 0);
        if (sortBy === 'gap_desc') return (b.gap_score ?? 0) - (a.gap_score ?? 0);
        return b.score - a.score;
      });
  }, [items, statusFilter, typeFilter, search, sortBy]);

  // KPI Calculations
  const totalCount = items.length;
  const newCount = items.filter((o) => o.status === 'new').length;
  const inProgressCount = items.filter((o) => o.status === 'in_progress').length;
  const resolvedCount = items.filter((o) => o.status === 'resolved').length;
  const reviewedCount = items.filter((o) => o.status === 'reviewed').length;
  const dismissedCount = items.filter((o) => o.status === 'dismissed').length;

  const p0Count = items.filter((o) => o.score >= 90).length;
  const avgScore = totalCount > 0 ? items.reduce((s, o) => s + (o.score || 0), 0) / totalCount : 0;
  const resolvedRate = totalCount > 0 ? ((resolvedCount / totalCount) * 100).toFixed(1) : '0.0';

  return (
    <Page
      id="view-diagnosis"
      title="机会诊断"
      description="基于 ChatGPT、DeepSeek、豆包、Kimi 等 AI 搜索多引擎监测信号，深度推演生成式回答缺口、竞品断层与高价值优化机会。"
      actions={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="btn"
            onClick={() => setShowFormulaModel(!showFormulaModel)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <HelpCircle size={15} color="#475467" />
            <span>评分模型标准</span>
          </button>
          <PermissionButton
            className="btn primary"
            disabled={action.busy}
            onClick={() => void action.run(api.triggerMonitorRun, '监测采样与诊断任务已受理')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={15} className={action.busy ? 'animate-spin' : ''} />
            <span>{action.busy ? '正在采样…' : '重新采样'}</span>
          </PermissionButton>
        </div>
      }
    >
      {/* ========================================================= */}
      {/* 1. Scoring Model Formula Banner (Collapsible)              */}
      {/* ========================================================= */}
      {showFormulaModel && (
        <div
          className="card"
          style={{
            padding: '18px 20px',
            marginBottom: '18px',
            background: 'linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)',
            border: '1px solid #cbd5e1',
            borderRadius: '14px',
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '8px',
                  background: '#eff6ff',
                  color: '#2563eb',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <BarChart3 size={16} />
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                  机会诊断综合评分算法模型 (PRD 10.4 标准)
                </h4>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                  机会分用于科学排序与资源倾斜，非绝对商业收益。各维度归一化为 0–100。
                </p>
              </div>
            </div>
            <button
              type="button"
              className="btn small"
              onClick={() => setShowFormulaModel(false)}
              style={{ padding: '4px 8px', fontSize: '12px' }}
            >
              收起
            </button>
          </div>

          <div
            style={{
              padding: '10px 14px',
              background: '#ffffff',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              fontFamily: 'ui-monospace, SFMono-Regular, monospace',
              fontSize: '12.5px',
              color: '#1e293b',
              marginBottom: '14px',
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '6px',
            }}
          >
            <span style={{ fontWeight: 700, color: '#2563eb' }}>综合机会分</span>
            <span>=</span>
            <span style={{ background: '#eff6ff', padding: '2px 6px', borderRadius: '4px', color: '#1d4ed8' }}>
              0.30 × 业务影响
            </span>
            <span>+</span>
            <span style={{ background: '#fef2f2', padding: '2px 6px', borderRadius: '4px', color: '#b91c1c' }}>
              0.25 × 差距幅度
            </span>
            <span>+</span>
            <span style={{ background: '#ecfdf5', padding: '2px 6px', borderRadius: '4px', color: '#047857' }}>
              0.20 × 可执行性
            </span>
            <span>+</span>
            <span style={{ background: '#f5f3ff', padding: '2px 6px', borderRadius: '4px', color: '#6d28d9' }}>
              0.15 × 证据置信度
            </span>
            <span>−</span>
            <span style={{ background: '#fff7ed', padding: '2px 6px', borderRadius: '4px', color: '#c2410c' }}>
              0.10 × 风险成本
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '10px',
            }}
          >
            <div style={{ padding: '10px 12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#1d4ed8' }}>业务影响 (30%)</div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                目标用户商业搜索意图强度与转化潜能
              </div>
            </div>
            <div style={{ padding: '10px 12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#b91c1c' }}>差距幅度 (25%)</div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                相比头部竞品在多引擎中的引用覆盖断层
              </div>
            </div>
            <div style={{ padding: '10px 12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#047857' }}>可执行性 (20%)</div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                落地事实库依据完备性与内容生产周期
              </div>
            </div>
            <div style={{ padding: '10px 12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#6d28d9' }}>证据置信度 (15%)</div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                跨引擎多批次采样解析结果的一致性
              </div>
            </div>
            <div style={{ padding: '10px 12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#c2410c' }}>风险成本 (10%)</div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                品牌实体混淆、合规审核与复测波动阻力
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 2. Top Metric Cards (4 KPI Cards with Lucide Icons)        */}
      {/* ========================================================= */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        {/* KPI 1: Total Opportunities */}
        <div className="card stat" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748b' }}>诊断机会总量</span>
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
              <Target size={17} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: '8px 0 3px', letterSpacing: '-0.02em' }}>
            {totalCount}
          </div>
          <div style={{ fontSize: '11.5px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#d97706', fontWeight: 600 }}>待核对 {newCount}</span>
            <span>·</span>
            <span>处理中 {inProgressCount}</span>
          </div>
        </div>

        {/* KPI 2: P0 Critical Opportunities */}
        <div className="card stat" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748b' }}>P0 核心攻坚机会</span>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: '#fef2f2',
                color: '#dc2626',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Flame size={17} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: '8px 0 3px', letterSpacing: '-0.02em' }}>
            {p0Count}
          </div>
          <div style={{ fontSize: '11.5px', color: '#dc2626', fontWeight: 500 }}>
            商业意图极高 · 竞品明显领先
          </div>
        </div>

        {/* KPI 3: Average Opportunity Score */}
        <div className="card stat" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748b' }}>平均机会评分</span>
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
              <BarChart3 size={17} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: '8px 0 3px', letterSpacing: '-0.02em' }}>
            {avgScore > 0 ? avgScore.toFixed(1) : '0.0'}{' '}
            <span style={{ fontSize: '13px', fontWeight: 500, color: '#94a3b8' }}>/ 100</span>
          </div>
          <div style={{ fontSize: '11.5px', color: '#64748b' }}>
            五维加权模型推演得出
          </div>
        </div>

        {/* KPI 4: Completion Rate */}
        <div className="card stat" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748b' }}>闭环解决进度</span>
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
              <CheckCircle2 size={17} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: '8px 0 3px', letterSpacing: '-0.02em' }}>
            {resolvedRate}%
          </div>
          <div style={{ fontSize: '11.5px', color: '#059669', fontWeight: 500 }}>
            已解决/已核对 {resolvedCount + reviewedCount} 项
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 3. Perspective Tabs (Opportunities / Matrix / Gaps)        */}
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
          aria-label="诊断视角切换"
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
            aria-selected={activeTab === 'queue'}
            onClick={() => setActiveTab('queue')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '7px',
              fontSize: '13px',
              fontWeight: activeTab === 'queue' ? 700 : 500,
              background: activeTab === 'queue' ? '#ffffff' : 'transparent',
              color: activeTab === 'queue' ? '#0f172a' : '#64748b',
              boxShadow: activeTab === 'queue' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <Target size={14} />
            <span>诊断机会队列</span>
            <span
              style={{
                fontSize: '11px',
                padding: '1px 6px',
                borderRadius: '999px',
                background: activeTab === 'queue' ? '#eff6ff' : '#e2e8f0',
                color: activeTab === 'queue' ? '#2563eb' : '#64748b',
                fontWeight: 700,
              }}
            >
              {totalCount}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'matrix'}
            onClick={() => setActiveTab('matrix')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '7px',
              fontSize: '13px',
              fontWeight: activeTab === 'matrix' ? 700 : 500,
              background: activeTab === 'matrix' ? '#ffffff' : 'transparent',
              color: activeTab === 'matrix' ? '#0f172a' : '#64748b',
              boxShadow: activeTab === 'matrix' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <Layers size={14} />
            <span>竞品引用差距矩阵</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'gaps'}
            onClick={() => setActiveTab('gaps')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '7px',
              fontSize: '13px',
              fontWeight: activeTab === 'gaps' ? 700 : 500,
              background: activeTab === 'gaps' ? '#ffffff' : 'transparent',
              color: activeTab === 'gaps' ? '#0f172a' : '#64748b',
              boxShadow: activeTab === 'gaps' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <ShieldAlert size={14} />
            <span>答案结构缺口雷达</span>
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
          <span>监测采样引擎实时联机</span>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 4. Tab 1: Opportunity Queue (Primary Action Center)       */}
      {/* ========================================================= */}
      {activeTab === 'queue' && (
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
            {/* Search Input */}
            <div
              style={{
                position: 'relative',
                flex: '1 1 240px',
                minWidth: '200px',
              }}
            >
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
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索机会标题、关键词或应对动作…"
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
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
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

            {/* Status Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12.5px', color: '#64748b', fontWeight: 600 }}>状态</span>
              <select
                className="select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{ minHeight: '36px', fontSize: '13px', paddingRight: '28px' }}
              >
                <option value="all">全部状态 ({totalCount})</option>
                <option value="new">待核对 ({newCount})</option>
                <option value="reviewed">已核对 ({reviewedCount})</option>
                <option value="in_progress">处理中 ({inProgressCount})</option>
                <option value="resolved">已解决 ({resolvedCount})</option>
                <option value="dismissed">已忽略 ({dismissedCount})</option>
              </select>
            </div>

            {/* Type Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12.5px', color: '#64748b', fontWeight: 600 }}>类型</span>
              <select
                className="select"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                style={{ minHeight: '36px', fontSize: '13px', paddingRight: '28px' }}
              >
                <option value="all">全部类型</option>
                <option value="brand_absent">品牌缺席 (brand_absent)</option>
                <option value="citation_missing">引用缺失 (citation_missing)</option>
                <option value="content_blank">内容空白 (content_blank)</option>
                <option value="fact_error">事实错误 (fact_error)</option>
                <option value="competitor_lead">竞品占位 (competitor_lead)</option>
              </select>
            </div>

            {/* Sort Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12.5px', color: '#64748b', fontWeight: 600 }}>排序</span>
              <select
                className="select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                style={{ minHeight: '36px', fontSize: '13px', paddingRight: '28px' }}
              >
                <option value="score_desc">按机会分降序 (高到低)</option>
                <option value="impact_desc">按业务影响降序</option>
                <option value="gap_desc">按差距幅度降序</option>
                <option value="score_asc">按机会分升序</option>
              </select>
            </div>

            {/* Reset Filters */}
            {(search || statusFilter !== 'all' || typeFilter !== 'all' || sortBy !== 'score_desc') && (
              <button
                type="button"
                className="btn small"
                onClick={() => {
                  setSearch('');
                  setStatusFilter('all');
                  setTypeFilter('all');
                  setSortBy('score_desc');
                }}
                style={{ color: '#dc2626', borderColor: '#fecaca', background: '#fff' }}
              >
                重置筛选
              </button>
            )}

            {/* View Mode Switcher */}
            <div
              style={{
                marginLeft: 'auto',
                display: 'inline-flex',
                alignItems: 'center',
                background: '#f1f5f9',
                padding: '3px',
                borderRadius: '8px',
                gap: '2px',
              }}
            >
              <button
                type="button"
                onClick={() => setViewMode('table')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: viewMode === 'table' ? 700 : 500,
                  background: viewMode === 'table' ? '#ffffff' : 'transparent',
                  color: viewMode === 'table' ? '#0f172a' : '#64748b',
                  boxShadow: viewMode === 'table' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.12s ease',
                }}
              >
                <List size={13} />
                <span>队列表格</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: viewMode === 'cards' ? 700 : 500,
                  background: viewMode === 'cards' ? '#ffffff' : 'transparent',
                  color: viewMode === 'cards' ? '#0f172a' : '#64748b',
                  boxShadow: viewMode === 'cards' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.12s ease',
                }}
              >
                <LayoutGrid size={13} />
                <span>详细看板</span>
              </button>
            </div>
          </div>

          <ResourceState
            resource={resource}
            empty={!filtered.length}
            emptyMessage={search || statusFilter !== 'all' || typeFilter !== 'all' ? '未找到符合筛选条件的诊断机会' : '暂无诊断机会记录'}
          />

          {/* View Mode 1: High-Density Diagnostic Queue Table */}
          {!!filtered.length && viewMode === 'table' && (
            <div className="table-wrap" style={{ margin: 0, border: 'none', borderRadius: 0 }}>
              <table style={{ minWidth: '980px', width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '12px 18px', textAlign: 'left', width: '140px', minWidth: '130px', whiteSpace: 'nowrap' }}>
                      优先级与机会分
                    </th>
                    <th style={{ padding: '12px 14px', textAlign: 'left', minWidth: '260px' }}>
                      诊断机会与现状信号
                    </th>
                    <th style={{ padding: '12px 14px', textAlign: 'left', width: '120px', whiteSpace: 'nowrap' }}>
                      缺口类型
                    </th>
                    <th style={{ padding: '12px 14px', textAlign: 'left', minWidth: '220px' }}>
                      推荐应对策略
                    </th>
                    <th style={{ padding: '12px 14px', textAlign: 'left', width: '180px', minWidth: '170px', whiteSpace: 'nowrap' }}>
                      五维指标拆解
                    </th>
                    <th style={{ padding: '12px 14px', textAlign: 'left', width: '100px', whiteSpace: 'nowrap' }}>
                      状态
                    </th>
                    <th style={{ padding: '12px 18px', textAlign: 'right', width: '230px', minWidth: '210px', whiteSpace: 'nowrap' }}>
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((opp, idx) => {
                    const priority = getPriorityMeta(opp.score);
                    const typeMeta = getTypeMeta(opp.type);
                    const statusMeta = getStatusMeta(opp.status);
                    const PriorityIcon = priority.icon;

                    return (
                      <tr
                        key={opp.id}
                        style={{
                          borderBottom: idx < filtered.length - 1 ? '1px solid #f1f5f9' : 'none',
                          borderLeft: `4px solid ${priority.textColor}`,
                          transition: 'background 0.12s ease',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#fcfdfe')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        {/* 1. Priority & Score */}
                        <td style={{ padding: '13px 18px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '2px 7px',
                                borderRadius: '5px',
                                fontSize: '11.5px',
                                fontWeight: 700,
                                background: priority.pillBg,
                                border: `1px solid ${priority.pillBorder}`,
                                color: priority.textColor,
                                width: 'fit-content',
                              }}
                            >
                              <PriorityIcon size={12} />
                              <span>{priority.label}</span>
                            </span>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '3px', marginTop: '2px' }}>
                              <span style={{ fontSize: '15px', fontWeight: 800, color: priority.textColor }}>
                                {opp.score.toFixed(1)}
                              </span>
                              <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>分</span>
                            </div>
                          </div>
                        </td>

                        {/* 2. Title & Status Description */}
                        <td style={{ padding: '13px 14px', verticalAlign: 'middle' }}>
                          <div>
                            <span
                              onClick={() => setSelectedOpp(opp)}
                              style={{
                                fontWeight: 700,
                                color: '#0f172a',
                                fontSize: '13.5px',
                                cursor: 'pointer',
                                transition: 'color 0.12s ease',
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.color = '#2563eb')}
                              onMouseLeave={(e) => (e.currentTarget.style.color = '#0f172a')}
                            >
                              {opp.title}
                            </span>
                            <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '3px', lineHeight: 1.45 }}>
                              {opp.description}
                            </div>
                          </div>
                        </td>

                        {/* 3. Gap Type */}
                        <td style={{ padding: '13px 14px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '2px 8px',
                              borderRadius: '6px',
                              fontSize: '11.5px',
                              fontWeight: 600,
                              background: typeMeta.bg,
                              border: `1px solid ${typeMeta.border}`,
                              color: typeMeta.color,
                            }}
                          >
                            <Layers size={11} />
                            <span>{typeMeta.label}</span>
                          </span>
                        </td>

                        {/* 4. Action Plan */}
                        <td style={{ padding: '13px 14px', verticalAlign: 'middle' }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '12px', color: '#1e3a8a' }}>
                            <Lightbulb size={13} color="#2563eb" style={{ flexShrink: 0, marginTop: '2px' }} />
                            <span style={{ lineHeight: 1.45 }}>{opp.recommended_action}</span>
                          </div>
                        </td>

                        {/* 5. 5-Dimension Mini Indicators */}
                        <td style={{ padding: '13px 14px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ color: '#2563eb', fontWeight: 600, width: '42px' }}>影响 {opp.impact_score?.toFixed(0) ?? '—'}</span>
                              <div style={{ width: '45px', height: '3.5px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${opp.impact_score ?? 0}%`, background: '#2563eb' }} />
                              </div>
                              <span style={{ color: '#dc2626', fontWeight: 600, width: '42px' }}>差距 {opp.gap_score?.toFixed(0) ?? '—'}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ color: '#059669', fontWeight: 600, width: '42px' }}>可行 {opp.feasibility_score?.toFixed(0) ?? '—'}</span>
                              <div style={{ width: '45px', height: '3.5px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${opp.feasibility_score ?? 0}%`, background: '#059669' }} />
                              </div>
                              <span style={{ color: '#7c3aed', fontWeight: 600, width: '42px' }}>置信 {opp.confidence_score?.toFixed(0) ?? '—'}</span>
                            </div>
                          </div>
                        </td>

                        {/* 6. Status */}
                        <td style={{ padding: '13px 14px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              padding: '2px 8px',
                              borderRadius: '6px',
                              fontSize: '11.5px',
                              fontWeight: 600,
                              background: statusMeta.bg,
                              border: `1px solid ${statusMeta.border}`,
                              color: statusMeta.color,
                            }}
                          >
                            {statusMeta.label}
                          </span>
                        </td>

                        {/* 7. Action Buttons */}
                        <td style={{ padding: '13px 18px', textAlign: 'right', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            {onOpenModal && (
                              <PermissionButton
                                className="btn small primary"
                                onClick={() => onOpenModal(`创建策略：${opp.title}`)}
                                style={{ padding: '3px 8px', fontSize: '11.5px', whiteSpace: 'nowrap' }}
                                title="一键将该机会转化为策略优化任务"
                              >
                                <Plus size={12} />
                                <span>转为策略任务</span>
                              </PermissionButton>
                            )}

                            <button
                              type="button"
                              className="btn small"
                              onClick={() => setSelectedOpp(opp)}
                              style={{ padding: '3px 8px', fontSize: '11.5px', whiteSpace: 'nowrap' }}
                              title="展开五维模型决策深度抽屉"
                            >
                              <ExternalLink size={12} />
                              <span>深度诊断详情</span>
                            </button>

                            {opp.status === 'new' && (
                              <PermissionButton
                                className="btn small"
                                disabled={action.busy}
                                onClick={() =>
                                  void action.run(
                                    () => api.updateOpportunityStatus(opp.id, 'reviewed'),
                                    '已核对诊断机会',
                                  )
                                }
                                style={{
                                  padding: '3px 8px',
                                  fontSize: '11.5px',
                                  color: '#047857',
                                  borderColor: '#a7f3d0',
                                  background: '#ecfdf5',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                <Check size={12} />
                                <span>确认已核对</span>
                              </PermissionButton>
                            )}

                            {!['resolved', 'dismissed'].includes(opp.status) && (
                              <PermissionButton
                                className="btn small ghost"
                                disabled={action.busy}
                                onClick={() =>
                                  void action.run(
                                    () => api.updateOpportunityStatus(opp.id, 'dismissed'),
                                    '机会已忽略',
                                  )
                                }
                                style={{ padding: '3px 6px', fontSize: '11px', color: '#94a3b8', whiteSpace: 'nowrap' }}
                              >
                                <span>忽略</span>
                              </PermissionButton>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* View Mode 2: Detailed Cards View */}
          {!!filtered.length && viewMode === 'cards' && (
            <div style={{ padding: '16px', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {filtered.map((opp) => {
                const priority = getPriorityMeta(opp.score);
                const typeMeta = getTypeMeta(opp.type);
                const statusMeta = getStatusMeta(opp.status);
                const PriorityIcon = priority.icon;

                return (
                  <div
                    key={opp.id}
                    style={{
                      padding: '18px 20px',
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      borderLeft: `5px solid ${priority.textColor}`,
                      background: '#ffffff',
                      boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                      transition: 'all 0.18s ease',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                      gap: '20px',
                      alignItems: 'stretch',
                    }}
                  >
                    {/* Left Column: Context, Signals & Action */}
                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <div>
                        {/* Tags */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '2px 8px',
                              borderRadius: '5px',
                              fontSize: '11.5px',
                              fontWeight: 700,
                              background: priority.pillBg,
                              border: `1px solid ${priority.pillBorder}`,
                              color: priority.textColor,
                            }}
                          >
                            <PriorityIcon size={12} />
                            <span>{priority.label}</span>
                          </span>

                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '2px 8px',
                              borderRadius: '5px',
                              fontSize: '11.5px',
                              fontWeight: 600,
                              background: typeMeta.bg,
                              border: `1px solid ${typeMeta.border}`,
                              color: typeMeta.color,
                            }}
                          >
                            <Layers size={11} />
                            <span>{typeMeta.label}</span>
                          </span>

                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              padding: '2px 8px',
                              borderRadius: '5px',
                              fontSize: '11.5px',
                              fontWeight: 600,
                              background: statusMeta.bg,
                              border: `1px solid ${statusMeta.border}`,
                              color: statusMeta.color,
                            }}
                          >
                            <span>{statusMeta.label}</span>
                          </span>
                        </div>

                        {/* Opportunity Title */}
                        <h3
                          onClick={() => setSelectedOpp(opp)}
                          style={{
                            margin: '0 0 12px',
                            fontSize: '16px',
                            fontWeight: 750,
                            color: '#0f172a',
                            letterSpacing: '-0.015em',
                            lineHeight: 1.35,
                            cursor: 'pointer',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = '#2563eb')}
                          onMouseLeave={(e) => (e.currentTarget.style.color = '#0f172a')}
                        >
                          {opp.title}
                        </h3>

                        {/* Two Comparative Blocks */}
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                            gap: '10px',
                            marginBottom: '14px',
                          }}
                        >
                          {/* Diagnostic Signal */}
                          <div
                            style={{
                              padding: '10px 12px',
                              borderRadius: '8px',
                              background: '#f8fafc',
                              border: '1px solid #edf2f7',
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: '8px',
                            }}
                          >
                            <AlertCircle size={15} color="#d97706" style={{ flexShrink: 0, marginTop: '2px' }} />
                            <div>
                              <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#475467', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                现状差距与监测信号
                              </div>
                              <div style={{ fontSize: '12.5px', color: '#1e293b', marginTop: '2px', lineHeight: 1.45 }}>
                                {opp.description}
                              </div>
                            </div>
                          </div>

                          {/* Action Plan */}
                          <div
                            style={{
                              padding: '10px 12px',
                              borderRadius: '8px',
                              background: '#eff6ff',
                              border: '1px solid #dbeafe',
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: '8px',
                            }}
                          >
                            <Lightbulb size={15} color="#2563eb" style={{ flexShrink: 0, marginTop: '2px' }} />
                            <div>
                              <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                推荐应对动作与生产路径
                              </div>
                              <div style={{ fontSize: '12.5px', color: '#1e3a8a', marginTop: '2px', lineHeight: 1.45, fontWeight: 500 }}>
                                {opp.recommended_action}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Evidence Traceability */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11.5px', color: '#94a3b8' }}>
                        <span>证据溯源样本：已关联多模型监测日志</span>
                        {opp.evidence_ids && (
                          <code style={{ fontSize: '10.5px', background: '#f1f5f9', padding: '1px 6px', borderRadius: '4px', color: '#475467' }}>
                            {opp.evidence_ids}
                          </code>
                        )}
                      </div>
                    </div>

                    {/* Right Column: Scorecard & Actions */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        padding: '14px',
                        background: '#fcfdfe',
                        borderRadius: '10px',
                        border: '1px solid #f1f5f9',
                        gap: '12px',
                      }}
                    >
                      {/* Overall Score Row */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>综合机会分</div>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: '3px', marginTop: '1px' }}>
                            <span style={{ fontSize: '20px', fontWeight: 800, color: priority.textColor, letterSpacing: '-0.02em' }}>
                              {opp.score.toFixed(1)}
                            </span>
                            <span style={{ fontSize: '11px', color: '#94a3b8' }}>/ 100</span>
                          </div>
                        </div>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '999px',
                            background: priority.pillBg,
                            color: priority.textColor,
                            border: `1px solid ${priority.pillBorder}`,
                          }}
                        >
                          {priority.label}
                        </span>
                      </div>

                      {/* 5-Dimension Mini Scorecard */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', marginBottom: '2px' }}>
                            <span>业务影响 (30%)</span>
                            <b style={{ color: '#0f172a' }}>{opp.impact_score?.toFixed(0) ?? '—'}</b>
                          </div>
                          <div style={{ height: '3.5px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${opp.impact_score ?? 0}%`, background: '#2563eb', borderRadius: 'inherit' }} />
                          </div>
                        </div>

                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', marginBottom: '2px' }}>
                            <span>差距幅度 (25%)</span>
                            <b style={{ color: '#0f172a' }}>{opp.gap_score?.toFixed(0) ?? '—'}</b>
                          </div>
                          <div style={{ height: '3.5px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${opp.gap_score ?? 0}%`, background: '#dc2626', borderRadius: 'inherit' }} />
                          </div>
                        </div>

                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', marginBottom: '2px' }}>
                            <span>可执行性 (20%)</span>
                            <b style={{ color: '#0f172a' }}>{opp.feasibility_score?.toFixed(0) ?? '—'}</b>
                          </div>
                          <div style={{ height: '3.5px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${opp.feasibility_score ?? 0}%`, background: '#059669', borderRadius: 'inherit' }} />
                          </div>
                        </div>

                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', marginBottom: '2px' }}>
                            <span>证据置信 (15%)</span>
                            <b style={{ color: '#0f172a' }}>{opp.confidence_score?.toFixed(0) ?? '—'}</b>
                          </div>
                          <div style={{ height: '3.5px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${opp.confidence_score ?? 0}%`, background: '#7c3aed', borderRadius: 'inherit' }} />
                          </div>
                        </div>

                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', marginBottom: '2px' }}>
                            <span>风险成本 (10%)</span>
                            <b style={{ color: '#0f172a' }}>{opp.risk_cost?.toFixed(0) ?? '—'}</b>
                          </div>
                          <div style={{ height: '3.5px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${opp.risk_cost ?? 0}%`, background: '#ea580c', borderRadius: 'inherit' }} />
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '8px', borderTop: '1px solid #f1f5f9' }}>
                        {onOpenModal && (
                          <PermissionButton
                            className="btn small primary"
                            onClick={() => onOpenModal(`创建策略：${opp.title}`)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '4px',
                              width: '100%',
                              padding: '5px 10px',
                              fontSize: '12px',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <Plus size={13} />
                            <span>转为策略任务</span>
                          </PermissionButton>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            type="button"
                            className="btn small"
                            onClick={() => setSelectedOpp(opp)}
                            style={{
                              flex: 1,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '4px',
                              padding: '4px 6px',
                              fontSize: '11.5px',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <ExternalLink size={12} />
                            <span>深度诊断详情</span>
                          </button>

                          {opp.status === 'new' && (
                            <PermissionButton
                              className="btn small"
                              disabled={action.busy}
                              onClick={() =>
                                void action.run(
                                  () => api.updateOpportunityStatus(opp.id, 'reviewed'),
                                  '已核对诊断机会',
                                )
                              }
                              style={{
                                flex: 1,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '4px',
                                padding: '4px 6px',
                                fontSize: '11.5px',
                                color: '#047857',
                                borderColor: '#a7f3d0',
                                background: '#ecfdf5',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              <Check size={12} />
                              <span>确认已核对</span>
                            </PermissionButton>
                          )}

                          {!['resolved', 'dismissed'].includes(opp.status) && (
                            <PermissionButton
                              className="btn small ghost"
                              disabled={action.busy}
                              onClick={() =>
                                void action.run(
                                  () => api.updateOpportunityStatus(opp.id, 'dismissed'),
                                  '机会已忽略',
                                )
                              }
                              style={{ padding: '4px 8px', fontSize: '11.5px', color: '#94a3b8', whiteSpace: 'nowrap' }}
                            >
                              <span>忽略</span>
                            </PermissionButton>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
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
              显示本页 {filtered.length} 项 · 共 {totalCount} 个诊断机会 {p0Count > 0 && `(P0 核心攻坚 ${p0Count} 项)`}
            </div>

            {paginationInfo && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="btn small"
                  disabled={resource.loading || resource.offset === 0}
                  onClick={() => resource.setOffset(Math.max(0, resource.offset - paginationInfo.limit))}
                >
                  上一页
                </button>
                <span style={{ fontSize: '12px', color: '#475467', fontWeight: 600 }}>
                  第 {Math.floor(resource.offset / paginationInfo.limit) + 1} 页
                </span>
                <button
                  type="button"
                  className="btn small"
                  disabled={resource.loading || !paginationInfo.has_more}
                  onClick={() => resource.setOffset(resource.offset + paginationInfo.limit)}
                >
                  下一页
                </button>
              </div>
            )}
          </div>
        </article>
      )}

      {/* ========================================================= */}
      {/* 5. Tab 2: Competitive Citation Gap Matrix (PRD Design)     */}
      {/* ========================================================= */}
      {activeTab === 'matrix' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="card panel">
            <div className="panel-head">
              <div>
                <h2 className="panel-title">竞品引用差距矩阵 (Competitive Citation Matrix)</h2>
                <div className="panel-sub">
                  各核心主题在主流大模型（ChatGPT、DeepSeek、豆包、Kimi）回答中被采纳引用的占比对比
                </div>
              </div>
              <span className="tag blue">近 30 天实测聚合</span>
            </div>

            <div className="table-wrap">
              <div className="matrix">
                <div className="head">主题集</div>
                <div className="head" style={{ color: '#2563eb', fontWeight: 800 }}>我方品牌 (苗汐)</div>
                <div className="head">安心到家</div>
                <div className="head">好慷在家</div>
                <div className="head">天鹅到家</div>
                <div className="head">轻喜到家</div>

                <div className="row-head">品牌推荐度</div>
                <div className="heat-2">40%</div>
                <div className="heat-4">71%</div>
                <div className="heat-3">58%</div>
                <div className="heat-4">76%</div>
                <div className="heat-3">53%</div>

                <div className="row-head">价格计费标准</div>
                <div className="heat-3">64%</div>
                <div className="heat-3">60%</div>
                <div className="heat-2">48%</div>
                <div className="heat-3">69%</div>
                <div className="heat-2">46%</div>

                <div className="row-head">服务验收标准</div>
                <div className="heat-2">43%</div>
                <div className="heat-3">62%</div>
                <div className="heat-3">57%</div>
                <div className="heat-4">73%</div>
                <div className="heat-2">44%</div>

                <div className="row-head">避坑指南与承诺</div>
                <div className="heat-1">18%</div>
                <div className="heat-3">54%</div>
                <div className="heat-2">41%</div>
                <div className="heat-3">66%</div>
                <div className="heat-2">39%</div>

                <div className="row-head">本地真实案例</div>
                <div className="heat-3">58%</div>
                <div className="heat-2">47%</div>
                <div className="heat-1">22%</div>
                <div className="heat-2">49%</div>
                <div className="heat-1">25%</div>
              </div>
            </div>

            <div
              style={{
                marginTop: '16px',
                padding: '14px 16px',
                background: '#f8fafc',
                borderRadius: '10px',
                border: '1px solid #e2e8f0',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '12px',
              }}
            >
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#dc2626' }}>最大劣势断层</div>
                <div style={{ fontSize: '13px', color: '#334155', marginTop: '2px' }}>
                  “避坑指南”维度我方仅 18%，天鹅到家与安心到家均在 54% 以上，亟需补齐信用凭据。
                </div>
              </div>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#059669' }}>现有防守优势</div>
                <div style={{ fontSize: '13px', color: '#334155', marginTop: '2px' }}>
                  “价格计费标准”维度我方 64% 保持相对领先，建议加速建立结构化 FAQ 固化壁垒。
                </div>
              </div>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#2563eb' }}>P0 攻坚方向</div>
                <div style={{ fontSize: '13px', color: '#334155', marginTop: '2px' }}>
                  优先产出《武汉家政公司权威对比指南》，可一次性填补品牌推荐与避坑背书两项缺口。
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 6. Tab 3: High-Frequency Answer Structure Gaps             */}
      {/* ========================================================= */}
      {activeTab === 'gaps' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="card panel">
            <div className="panel-head">
              <div>
                <h2 className="panel-title">高频答案结构缺口 (Answer Structure Gaps)</h2>
                <div className="panel-sub">
                  大语言模型在回答时倾向引用结构严密、实体颗粒度细、具备事实背书的数据
                </div>
              </div>
            </div>

            <div className="task-list">
              <div className="task" style={{ padding: '14px 0' }}>
                <span className="priority high" />
                <div>
                  <h4 style={{ fontSize: '14.5px', marginBottom: '4px' }}>
                    价格信息缺少区间范围、影响因素与更新时间戳
                  </h4>
                  <p style={{ fontSize: '13px', color: '#64748b' }}>
                    建议采用“基础价 + 增项清单 + 房屋类型差异 + 示例账单”的可解析结构化表格，大模型引用转化率可提升约 42%。
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className="tag red">影响 18 个核心问答</span>
                  {onOpenModal && (
                    <button
                      type="button"
                      className="btn small"
                      onClick={() => onOpenModal('创建结构化价格资产策略')}
                      style={{ marginTop: '6px', fontSize: '11.5px' }}
                    >
                      创建策略
                    </button>
                  )}
                </div>
              </div>

              <div className="task" style={{ padding: '14px 0' }}>
                <span className="priority mid" />
                <div>
                  <h4 style={{ fontSize: '14.5px', marginBottom: '4px' }}>
                    服务人员资质缺少公开校验编号与三方保险凭证
                  </h4>
                  <p style={{ fontSize: '13px', color: '#64748b' }}>
                    当前均为纯营销表述，缺少官方背书编号。需增加培训认证号、雇主险保单范围及隐私保护审核流程。
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className="tag amber">影响 12 个核心问答</span>
                  {onOpenModal && (
                    <button
                      type="button"
                      className="btn small"
                      onClick={() => onOpenModal('创建人员资质可信资产策略')}
                      style={{ marginTop: '6px', fontSize: '11.5px' }}
                    >
                      创建策略
                    </button>
                  )}
                </div>
              </div>

              <div className="task" style={{ padding: '14px 0' }}>
                <span className="priority low" />
                <div>
                  <h4 style={{ fontSize: '14.5px', marginBottom: '4px' }}>
                    区域服务案例的地理实体（区、街道、住宅小区）不够具体
                  </h4>
                  <p style={{ fontSize: '13px', color: '#64748b' }}>
                    大模型在回答“洪山区开荒保洁”等地域特定问题时无法提取确切位置实体。建议补充街道、户型面积与施工前后对照事实。
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className="tag blue">影响 9 个核心问答</span>
                  {onOpenModal && (
                    <button
                      type="button"
                      className="btn small"
                      onClick={() => onOpenModal('创建区域案例实体丰富策略')}
                      style={{ marginTop: '6px', fontSize: '11.5px' }}
                    >
                      创建策略
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 7. Opportunity Detail Slide-Over Drawer                    */}
      {/* ========================================================= */}
      {selectedOpp && (
        <div
          className="agent-drawer-backdrop"
          onClick={() => setSelectedOpp(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="agent-drawer-panel"
            onClick={(e) => e.stopPropagation()}
            style={{ width: '45vw', minWidth: '440px' }}
          >
            {/* Drawer Header */}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 700,
                    background: getPriorityMeta(selectedOpp.score).pillBg,
                    color: getPriorityMeta(selectedOpp.score).textColor,
                  }}
                >
                  {getPriorityMeta(selectedOpp.score).level}
                </span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                  深度诊断决策报告
                </span>
              </div>
              <button
                type="button"
                className="close"
                onClick={() => setSelectedOpp(null)}
                aria-label="关闭抽屉"
              >
                ×
              </button>
            </div>

            {/* Drawer Body */}
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Title & Score Block */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      background: getTypeMeta(selectedOpp.type).bg,
                      color: getTypeMeta(selectedOpp.type).color,
                    }}
                  >
                    {getTypeMeta(selectedOpp.type).label}
                  </span>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      background: getStatusMeta(selectedOpp.status).bg,
                      color: getStatusMeta(selectedOpp.status).color,
                    }}
                  >
                    {getStatusMeta(selectedOpp.status).label}
                  </span>
                </div>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#0f172a', lineHeight: 1.3 }}>
                  {selectedOpp.title}
                </h2>
              </div>

              {/* Score Metric Card */}
              <div
                style={{
                  padding: '16px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%)',
                  border: '1px solid #dbeafe',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>算法综合诊断机会分</div>
                  <div style={{ fontSize: '32px', fontWeight: 800, color: '#1d4ed8', margin: '4px 0 2px' }}>
                    {selectedOpp.score.toFixed(1)} <span style={{ fontSize: '14px', fontWeight: 500, color: '#94a3b8' }}>/ 100</span>
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#2563eb' }}>
                    高优先级执行队列项
                  </div>
                </div>
                <div
                  style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    background: '#ffffff',
                    display: 'grid',
                    placeItems: 'center',
                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.1)',
                    border: '3px solid #bfdbfe',
                  }}
                >
                  <Award size={28} color="#2563eb" />
                </div>
              </div>

              {/* 5-Dimension Detailed Breakdown */}
              <div className="card" style={{ padding: '16px', borderRadius: '12px' }}>
                <h4 style={{ margin: '0 0 12px', fontSize: '13.5px', fontWeight: 700, color: '#0f172a' }}>
                  五维量化指标拆解 (权重归一化)
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '3px' }}>
                      <span style={{ color: '#475467' }}>业务影响 (权重 30%)</span>
                      <b style={{ color: '#0f172a' }}>{selectedOpp.impact_score?.toFixed(1) ?? '—'} 分</b>
                    </div>
                    <div style={{ height: '6px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${selectedOpp.impact_score ?? 0}%`, background: '#2563eb' }} />
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '3px' }}>
                      <span style={{ color: '#475467' }}>差距幅度 (权重 25%)</span>
                      <b style={{ color: '#0f172a' }}>{selectedOpp.gap_score?.toFixed(1) ?? '—'} 分</b>
                    </div>
                    <div style={{ height: '6px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${selectedOpp.gap_score ?? 0}%`, background: '#dc2626' }} />
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '3px' }}>
                      <span style={{ color: '#475467' }}>可执行性 (权重 20%)</span>
                      <b style={{ color: '#0f172a' }}>{selectedOpp.feasibility_score?.toFixed(1) ?? '—'} 分</b>
                    </div>
                    <div style={{ height: '6px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${selectedOpp.feasibility_score ?? 0}%`, background: '#059669' }} />
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '3px' }}>
                      <span style={{ color: '#475467' }}>证据置信度 (权重 15%)</span>
                      <b style={{ color: '#0f172a' }}>{selectedOpp.confidence_score?.toFixed(1) ?? '—'} 分</b>
                    </div>
                    <div style={{ height: '6px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${selectedOpp.confidence_score ?? 0}%`, background: '#7c3aed' }} />
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '3px' }}>
                      <span style={{ color: '#475467' }}>风险成本扣减 (权重 10%)</span>
                      <b style={{ color: '#0f172a' }}>{selectedOpp.risk_cost?.toFixed(1) ?? '—'} 分</b>
                    </div>
                    <div style={{ height: '6px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${selectedOpp.risk_cost ?? 0}%`, background: '#ea580c' }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Diagnosis Context */}
              <div className="card" style={{ padding: '16px', borderRadius: '12px' }}>
                <h4 style={{ margin: '0 0 8px', fontSize: '13.5px', fontWeight: 700, color: '#0f172a' }}>
                  监测信号与现状描述
                </h4>
                <p style={{ margin: 0, fontSize: '13px', color: '#475467', lineHeight: 1.6 }}>
                  {selectedOpp.description}
                </p>
              </div>

              {/* Recommended Action Blueprint */}
              <div
                className="card"
                style={{
                  padding: '16px',
                  borderRadius: '12px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                }}
              >
                <h4 style={{ margin: '0 0 10px', fontSize: '13.5px', fontWeight: 700, color: '#1e3a8a' }}>
                  推荐 3 步落地推进蓝图
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12.5px', color: '#334155' }}>
                    <span style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#2563eb', color: '#fff', display: 'grid', placeItems: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}>
                      1
                    </span>
                    <div>
                      <strong>核验内部事实库：</strong>确认价格体系、验收条例及保洁保险资质凭据无误。
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12.5px', color: '#334155' }}>
                    <span style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#2563eb', color: '#fff', display: 'grid', placeItems: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}>
                      2
                    </span>
                    <div>
                      <strong>生成并发布内容资产：</strong>执行“{selectedOpp.recommended_action}”，挂载结构化数据标记。
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12.5px', color: '#334155' }}>
                    <span style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#2563eb', color: '#fff', display: 'grid', placeItems: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}>
                      3
                    </span>
                    <div>
                      <strong>自动发起复测归因：</strong>多模型在 7–14 天内复测提及率与平均排位提升。
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Drawer Footer Actions */}
            <div
              style={{
                padding: '16px 24px',
                borderTop: '1px solid #e2e8f0',
                background: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
              }}
            >
              <button
                type="button"
                className="btn"
                onClick={() => setSelectedOpp(null)}
              >
                关闭
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {onOpenModal && (
                  <PermissionButton
                    className="btn primary"
                    onClick={() => {
                      onOpenModal(`创建策略：${selectedOpp.title}`);
                      setSelectedOpp(null);
                    }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Plus size={14} />
                    <span>转为策略任务</span>
                  </PermissionButton>
                )}

                {selectedOpp.status === 'new' && (
                  <PermissionButton
                    className="btn"
                    disabled={action.busy}
                    onClick={() => {
                      void action.run(
                        () => api.updateOpportunityStatus(selectedOpp.id, 'reviewed'),
                        '已标记为已核对',
                      );
                      setSelectedOpp(null);
                    }}
                    style={{ color: '#047857', borderColor: '#a7f3d0', background: '#ecfdf5' }}
                  >
                    确认已核对
                  </PermissionButton>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}

export default DiagnosisView;
