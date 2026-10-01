import { usePagedResource } from '../../hooks/usePagedResource';
import { PermissionButton } from '../../components/ui/Permissions';
import { useState, useMemo } from 'react';
import { api, type QualityCheck } from '../../services/api';
import { Page, ResourceState } from '../../components/ui/Resource';
import { useAction } from '../../hooks/useAction';
import {
  FileText,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Search,
  Plus,
  HelpCircle,
  X,
  List,
  LayoutGrid,
  Check,
  ShieldCheck,
  Edit3,
  ChevronDown,
  ChevronUp,
  BookOpen,
} from 'lucide-react';

export interface Asset {
  id: string;
  title: string;
  content_body: string;
  asset_type?: string;
  status: string;
  version: number;
  quality_checks: string;
}

interface Props {
  onShowToast: (title: string, note?: string) => void;
  onOpenModal: (title: string) => void;
}

// Helper: Safely parse quality check JSON
function parseQualityChecks(checksJson?: string): Partial<QualityCheck> {
  if (!checksJson) return {};
  try {
    return JSON.parse(checksJson);
  } catch {
    return {};
  }
}

// Helper: Status presentation metadata
function getStatusMeta(status: string) {
  switch (status) {
    case 'approved':
      return { label: '已核准 (Approved)', shortLabel: '已核准', color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' };
    case 'pending_approval':
      return { label: '待审批 (Pending Approval)', shortLabel: '待审批', color: '#d97706', bg: '#fffbeb', border: '#fde68a' };
    case 'draft':
      return { label: '草稿中 (Draft)', shortLabel: '草稿中', color: '#475467', bg: '#f1f5f9', border: '#e2e8f0' };
    default:
      return { label: status, shortLabel: status, color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' };
  }
}

// -------------------------------------------------------------
// Component: Inline Asset Editor & Quality Workbench
// -------------------------------------------------------------
function InlineAssetEditor({
  asset,
  onShowToast,
  onClose,
}: {
  asset: Asset;
  onShowToast: Props['onShowToast'];
  onClose?: () => void;
}) {
  const [title, setTitle] = useState(asset.title);
  const [body, setBody] = useState(asset.content_body);
  const action = useAction(onShowToast);

  const checks = parseQualityChecks(asset.quality_checks);
  const unverified = checks.unverified_claims || [];
  const forbiddenHits = checks.forbidden_hits || [];
  const verifiedSources = checks.verified_sources || [];
  const dirty = title !== asset.title || body !== asset.content_body;
  const passed = checks.passed === true && !dirty;

  return (
    <div
      style={{
        padding: '20px',
        background: '#f8fafc',
        borderTop: '1px solid #e2e8f0',
        borderBottom: '1px solid #e2e8f0',
      }}
    >
      <div style={{ display: 'grid', gap: '14px' }}>
        {/* Title Input */}
        <div>
          <label
            htmlFor={`asset-title-${asset.id}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '12.5px',
              fontWeight: 700,
              color: '#334155',
              marginBottom: '5px',
            }}
          >
            <span>内容标题</span>
            <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 500 }}>
              建议融入高频搜索意图实体词
            </span>
          </label>
          <input
            id={`asset-title-${asset.id}`}
            className="field"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ width: '100%', background: '#ffffff', fontSize: '13.5px' }}
          />
        </div>

        {/* Body Textarea */}
        <div>
          <label
            htmlFor={`asset-body-${asset.id}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '12.5px',
              fontWeight: 700,
              color: '#334155',
              marginBottom: '5px',
            }}
          >
            <span>正文内容 (支持 Markdown / 可解析结构)</span>
            <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 500 }}>
              当前约 {body.length} 字符 · {body.split(/\s+/).filter(Boolean).length} 词
            </span>
          </label>
          <textarea
            id={`asset-body-${asset.id}`}
            className="field"
            style={{
              width: '100%',
              minHeight: '130px',
              lineHeight: 1.6,
              padding: '12px',
              background: '#ffffff',
              fontSize: '13px',
              fontFamily: 'ui-monospace, SFMono-Regular, monospace',
              boxSizing: 'border-box',
            }}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>

        {/* Quality Check & Fact Verification Box */}
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '10px',
            backgroundColor: !passed ? '#fffbeb' : '#ecfdf5',
            border: !passed ? '1px solid #fde68a' : '1px solid #a7f3d0',
            fontSize: '12px',
          }}
        >
          {!passed ? (
            <div>
              <div style={{ color: '#b45309', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <AlertTriangle size={15} />
                <span>{dirty ? '内容修改尚未保存，需保存后自动重新逐句核验' : '事实校验未通过或尚无核验结果'}</span>
              </div>
              <div style={{ color: '#92400e', marginTop: '5px', lineHeight: 1.5 }}>
                {unverified.length > 0 && (
                  <div>
                    <strong>未核验证据声明：</strong>
                    <span>{unverified.join('；')}</span>
                  </div>
                )}
                {forbiddenHits.length > 0 && (
                  <div style={{ marginTop: '2px', color: '#b91c1c' }}>
                    <strong>命中禁忌词拦截：</strong>
                    <span>{forbiddenHits.join('、')}</span>
                  </div>
                )}
                {!dirty && unverified.length === 0 && forbiddenHits.length === 0 && (
                  <span>暂无逐句匹配事实依据，发布前需关联事实库或补充引用出处。</span>
                )}
              </div>
            </div>
          ) : (
            <div>
              <div style={{ color: '#047857', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ShieldCheck size={15} />
                <span>逐句事实校验通过 (Verified Claims Passed)</span>
              </div>
              <div style={{ color: '#065f46', marginTop: '4px', lineHeight: 1.5 }}>
                当前已保存标题和正文已通过事实库严格证据比对；仍需负责人核准方可进入分发管道。
                {verifiedSources.length > 0 && (
                  <span style={{ marginLeft: '6px', color: '#047857' }}>
                    [已关联出处: {verifiedSources.join(', ')}]
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Error Alert */}
        {action.error && (
          <div
            className="alert"
            style={{
              background: '#fff3f4',
              borderColor: '#f3dcdf',
              padding: '10px 14px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <div className="alert-icon" style={{ background: '#ffe4e7', color: '#b94852' }}>
              !
            </div>
            <div>
              <b>保存失败</b>
              <p style={{ margin: '2px 0 0', fontSize: '12px' }}>{action.error}</p>
            </div>
          </div>
        )}

        {/* Action Controls */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px',
            paddingTop: '6px',
          }}
        >
          {onClose ? (
            <button
              type="button"
              className="btn small"
              onClick={onClose}
              style={{ padding: '5px 12px', fontSize: '12px' }}
            >
              收起编辑
            </button>
          ) : <div />}

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <PermissionButton
              type="button"
              className="btn small"
              disabled={action.busy}
              onClick={() =>
                void action.run(
                  () => api.updateContent(asset.id, asset.version, title, body),
                  '已保存内容修改，生成新版本并重置审核',
                )
              }
              style={{ whiteSpace: 'nowrap' }}
            >
              保存为新版本
            </PermissionButton>

            {asset.status === 'pending_approval' && (
              <PermissionButton
                type="button"
                className="btn small primary"
                permission="review"
                disabled={action.busy || dirty || !passed}
                onClick={() =>
                  void action.run(
                    () => api.approveContent(asset.id, asset.version),
                    '当前版本已核准批准，可执行渠道发布',
                  )
                }
                style={{
                  whiteSpace: 'nowrap',
                  background: !passed || dirty ? undefined : '#059669',
                  borderColor: !passed || dirty ? undefined : '#047857',
                }}
              >
                <Check size={13} />
                <span>批准当前版本</span>
              </PermissionButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// Component: Card View Asset Item
// -------------------------------------------------------------
function AssetCardItem({
  asset,
  onShowToast,
}: {
  asset: Asset;
  onShowToast: Props['onShowToast'];
}) {
  const statusMeta = getStatusMeta(asset.status);
  const checks = parseQualityChecks(asset.quality_checks);
  const passed = checks.passed === true;

  return (
    <article
      className="card"
      style={{
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        background: '#ffffff',
        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
        overflow: 'hidden',
      }}
    >
      {/* Card Top Banner */}
      <div
        style={{
          padding: '14px 18px',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
          background: '#ffffff',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span className="version-chip" style={{ fontSize: '11.5px' }}>v{asset.version}</span>
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
            {statusMeta.label}
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
              background: passed ? '#ecfdf5' : '#fffbeb',
              border: passed ? '1px solid #a7f3d0' : '1px solid #fde68a',
              color: passed ? '#047857' : '#d97706',
            }}
          >
            {passed ? <ShieldCheck size={12} /> : <AlertTriangle size={12} />}
            <span>{passed ? '事实核验通过' : '待核验/未通过'}</span>
          </span>
        </div>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
          {asset.title}
        </h3>
      </div>

      {/* Editor Body */}
      <InlineAssetEditor asset={asset} onShowToast={onShowToast} />
    </article>
  );
}

// -------------------------------------------------------------
// Main Component: ContentView
// -------------------------------------------------------------
export function ContentView({ onShowToast, onOpenModal }: Props) {
  const resource = usePagedResource(api.getContentAssets);
  const action = useAction(onShowToast);

  // States
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [showStandards, setShowStandards] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [verifyFilter, setVerifyFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const assets = resource.data?.items || [];
  const paginationInfo = resource.data?.pagination;

  // Filter & Search
  const filtered = useMemo(() => {
    return assets.filter((a) => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      const checks = parseQualityChecks(a.quality_checks);
      if (verifyFilter === 'passed' && !checks.passed) return false;
      if (verifyFilter === 'failed' && checks.passed) return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        const matchTitle = a.title?.toLowerCase().includes(q);
        const matchBody = a.content_body?.toLowerCase().includes(q);
        if (!matchTitle && !matchBody) return false;
      }
      return true;
    });
  }, [assets, statusFilter, verifyFilter, search]);

  // Statistics
  const totalCount = assets.length;
  const pendingCount = assets.filter((a) => a.status === 'pending_approval').length;
  const approvedCount = assets.filter((a) => a.status === 'approved').length;
  const draftCount = assets.filter((a) => a.status === 'draft').length;
  const passedCount = assets.filter((a) => parseQualityChecks(a.quality_checks).passed === true).length;
  const passedRate = totalCount > 0 ? ((passedCount / totalCount) * 100).toFixed(0) : '0';

  return (
    <Page
      id="view-content"
      title="内容工厂"
      description="基于高频问题意图、可信事实与引用结构批量生产 GEO 内容资产。自动核验采用保守的逐句证据匹配，已核验内容仍需人工批准方可上线。"
      actions={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="btn"
            onClick={() => setShowStandards(!showStandards)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <HelpCircle size={15} color="#475467" />
            <span>审核规范标准</span>
          </button>
          <PermissionButton
            type="button"
            className="btn primary"
            onClick={() => onOpenModal('创建内容草稿')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={15} />
            <span>新建草稿</span>
          </PermissionButton>
        </div>
      }
    >
      {/* ========================================================= */}
      {/* 1. Audit Standards & Fact-Check Banner (Collapsible)       */}
      {/* ========================================================= */}
      {showStandards && (
        <div
          className="card"
          style={{
            padding: '18px 20px',
            marginBottom: '18px',
            background: 'linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)',
            border: '1px solid #cbd5e1',
            borderRadius: '14px',
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
                <BookOpen size={16} />
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                  GEO 语料事实核验与审核口径标准 (PRD 10.5 规范)
                </h4>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                  标题与 Markdown 正文均参与保守的逐句证据链匹配。无法匹配的内容保持草稿。
                </p>
              </div>
            </div>
            <button
              type="button"
              className="btn small"
              onClick={() => setShowStandards(false)}
              style={{ padding: '4px 8px', fontSize: '12px' }}
            >
              收起
            </button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '10px',
            }}
          >
            <div style={{ padding: '10px 12px', background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <ShieldCheck size={14} />
                <span>逐句证据链匹配</span>
              </div>
              <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '3px', lineHeight: 1.45 }}>
                每句陈述必须在知识事实库中检索到对应的高置信度事实。未匹配句子保留为未核验声明。
              </div>
            </div>

            <div style={{ padding: '10px 12px', background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <AlertTriangle size={14} />
                <span>禁忌词与宣传合规拦截</span>
              </div>
              <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '3px', lineHeight: 1.45 }}>
                自动过滤“最专业”、“第一品牌”等极限词及无依据的绝对化承诺，保障模型引用合规。
              </div>
            </div>

            <div style={{ padding: '10px 12px', background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#047857', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle2 size={14} />
                <span>人工核准双保险机制</span>
              </div>
              <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '3px', lineHeight: 1.45 }}>
                程序匹配通过只代表存在已批准事实记录，最终上线前仍需人工确认来源真实性与时效性。
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 2. Top Executive Metric Cards (4 KPI Cards)                */}
      {/* ========================================================= */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        {/* KPI 1: Total Assets */}
        <div className="card stat" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748b' }}>内容资产总量</span>
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
              <FileText size={17} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: '8px 0 3px', letterSpacing: '-0.02em' }}>
            {totalCount}
          </div>
          <div style={{ fontSize: '11.5px', color: '#64748b' }}>
            收录于 GEO 结构化语料库
          </div>
        </div>

        {/* KPI 2: Pending Approval */}
        <div className="card stat" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748b' }}>待审核审批</span>
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
              <Clock size={17} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: '8px 0 3px', letterSpacing: '-0.02em' }}>
            {pendingCount}
          </div>
          <div style={{ fontSize: '11.5px', color: '#d97706', fontWeight: 500 }}>
            需核验事实依据并人工批准
          </div>
        </div>

        {/* KPI 3: Approved Assets */}
        <div className="card stat" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748b' }}>已核准可发布</span>
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
            {approvedCount}
          </div>
          <div style={{ fontSize: '11.5px', color: '#059669', fontWeight: 500 }}>
            具备多渠道分发与检索权重
          </div>
        </div>

        {/* KPI 4: Verification Pass Rate */}
        <div className="card stat" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748b' }}>事实校验通过率</span>
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
              <ShieldCheck size={17} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: '8px 0 3px', letterSpacing: '-0.02em' }}>
            {passedRate}%
          </div>
          <div style={{ fontSize: '11.5px', color: '#7c3aed', fontWeight: 500 }}>
            已通过 {passedCount} 篇 · 草稿 {draftCount} 篇
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 3. Single Unified Card Container                           */}
      {/* ========================================================= */}
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
              placeholder="搜索内容标题或正文关键词…"
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
              <option value="pending_approval">待审批 ({pendingCount})</option>
              <option value="approved">已核准 ({approvedCount})</option>
              <option value="draft">草稿中 ({draftCount})</option>
            </select>
          </div>

          {/* Verification Result Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12.5px', color: '#64748b', fontWeight: 600 }}>核验结果</span>
            <select
              className="select"
              value={verifyFilter}
              onChange={(e) => setVerifyFilter(e.target.value)}
              style={{ minHeight: '36px', fontSize: '13px', paddingRight: '28px' }}
            >
              <option value="all">全部核验结果</option>
              <option value="passed">通过 ({passedCount})</option>
              <option value="failed">未通过/有未核验声明 ({totalCount - passedCount})</option>
            </select>
          </div>

          {/* Reset Filters */}
          {(search || statusFilter !== 'all' || verifyFilter !== 'all') && (
            <button
              type="button"
              className="btn small"
              onClick={() => {
                setSearch('');
                setStatusFilter('all');
                setVerifyFilter('all');
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
              <span>资产表格</span>
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
              <span>编辑看板</span>
            </button>
          </div>
        </div>

        {/* Loading / Empty / Error State */}
        <ResourceState
          resource={resource}
          empty={!filtered.length}
          emptyMessage={
            search || statusFilter !== 'all' || verifyFilter !== 'all'
              ? '未找到符合筛选条件的内容资产'
              : '暂无内容资产，点击右上角新建草稿'
          }
        />

        {/* ========================================================= */}
        {/* View Mode 1: Modern Asset Table (with Inline Expandable)  */}
        {/* ========================================================= */}
        {!!filtered.length && viewMode === 'table' && (
          <div className="table-wrap" style={{ margin: 0, border: 'none', borderRadius: 0 }}>
            <table style={{ minWidth: '880px', width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '12px 18px', textAlign: 'left', width: '150px', whiteSpace: 'nowrap' }}>
                    版本与状态
                  </th>
                  <th style={{ padding: '12px 14px', textAlign: 'left', minWidth: '320px' }}>
                    内容标题与正文摘要
                  </th>
                  <th style={{ padding: '12px 14px', textAlign: 'left', width: '220px', whiteSpace: 'nowrap' }}>
                    事实校验状态
                  </th>
                  <th style={{ padding: '12px 18px', textAlign: 'right', width: '200px', whiteSpace: 'nowrap' }}>
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((asset, idx) => {
                  const statusMeta = getStatusMeta(asset.status);
                  const checks = parseQualityChecks(asset.quality_checks);
                  const passed = checks.passed === true;
                  const isExpanded = expandedId === asset.id;
                  const wordCount = asset.content_body?.length ?? 0;

                  return (
                    <tr key={`${asset.id}:${asset.version}`} style={{ borderBottom: idx < filtered.length - 1 && !isExpanded ? '1px solid #f1f5f9' : 'none' }}>
                      <td colSpan={4} style={{ padding: 0 }}>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '150px minmax(320px, 1fr) 220px 200px',
                            alignItems: 'center',
                            padding: '12px 0',
                            background: isExpanded ? '#f1f5f9' : 'transparent',
                            transition: 'background 0.12s ease',
                          }}
                        >
                          {/* 1. Version & Status */}
                          <div style={{ padding: '0 18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className="version-chip" style={{ fontSize: '11.5px' }}>v{asset.version}</span>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '2px 7px',
                                borderRadius: '5px',
                                fontSize: '11px',
                                fontWeight: 600,
                                background: statusMeta.bg,
                                border: `1px solid ${statusMeta.border}`,
                                color: statusMeta.color,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {statusMeta.shortLabel}
                            </span>
                          </div>

                          {/* 2. Title & Excerpt */}
                          <div style={{ padding: '0 14px' }}>
                            <span
                              onClick={() => setExpandedId(isExpanded ? null : asset.id)}
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
                              {asset.title}
                            </span>
                            <div
                              style={{
                                fontSize: '12px',
                                color: '#64748b',
                                marginTop: '3px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                maxWidth: '520px',
                              }}
                            >
                              {asset.content_body || '（暂无正文）'}
                            </div>
                          </div>

                          {/* 3. Verification State */}
                          <div style={{ padding: '0 14px', whiteSpace: 'nowrap' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '11.5px',
                                fontWeight: 600,
                                background: passed ? '#ecfdf5' : '#fffbeb',
                                border: passed ? '1px solid #a7f3d0' : '1px solid #fde68a',
                                color: passed ? '#047857' : '#b45309',
                              }}
                            >
                              {passed ? <ShieldCheck size={13} /> : <AlertTriangle size={13} />}
                              <span>
                                {passed
                                  ? '逐句校验通过'
                                  : checks.unverified_claims?.length
                                    ? `未核验 (${checks.unverified_claims.length} 项)`
                                    : '需复核'}
                              </span>
                            </span>
                            <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '6px' }}>
                              约 {wordCount} 字符
                            </span>
                          </div>

                          {/* 4. Actions */}
                          <div style={{ padding: '0 18px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                              <button
                                type="button"
                                className="btn small"
                                onClick={() => setExpandedId(isExpanded ? null : asset.id)}
                                style={{
                                  padding: '3px 9px',
                                  fontSize: '11.5px',
                                  whiteSpace: 'nowrap',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                              >
                                <Edit3 size={12} />
                                <span>{isExpanded ? '收起' : '编辑修订'}</span>
                                {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                              </button>

                              {asset.status === 'pending_approval' && (
                                <PermissionButton
                                  type="button"
                                  className="btn small primary"
                                  permission="review"
                                  disabled={action.busy || !passed}
                                  onClick={() =>
                                    void action.run(
                                      () => api.approveContent(asset.id, asset.version),
                                      '当前版本已核准批准，可执行渠道发布',
                                    )
                                  }
                                  style={{
                                    padding: '3px 9px',
                                    fontSize: '11.5px',
                                    whiteSpace: 'nowrap',
                                    background: !passed ? undefined : '#059669',
                                    borderColor: !passed ? undefined : '#047857',
                                  }}
                                  title={!passed ? '需事实核验通过后方可批准' : '核准并通过此版本'}
                                >
                                  <Check size={12} />
                                  <span>批准</span>
                                </PermissionButton>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Expandable Inline Editor */}
                        {isExpanded && (
                          <InlineAssetEditor
                            asset={asset}
                            onShowToast={onShowToast}
                            onClose={() => setExpandedId(null)}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ========================================================= */}
        {/* View Mode 2: Detailed Cards View                          */}
        {/* ========================================================= */}
        {!!filtered.length && viewMode === 'cards' && (
          <div
            style={{
              padding: '16px',
              background: '#f8fafc',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            {filtered.map((asset) => (
              <AssetCardItem
                key={`${asset.id}:${asset.version}`}
                asset={asset}
                onShowToast={onShowToast}
              />
            ))}
          </div>
        )}

        {/* ========================================================= */}
        {/* Card Integrated Bottom Pagination Footer                  */}
        {/* ========================================================= */}
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
            显示本页 {filtered.length} 项 · 共 {totalCount} 篇内容资产 (已核准 {approvedCount} 篇 · 待审批 {pendingCount} 篇)
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="btn small"
              disabled={resource.loading || resource.offset === 0}
              onClick={() => resource.setOffset(Math.max(0, resource.offset - (paginationInfo?.limit ?? 50)))}
              style={{ padding: '4px 10px', fontSize: '12px', whiteSpace: 'nowrap' }}
            >
              上一页
            </button>
            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
              第 {Math.floor(resource.offset / (paginationInfo?.limit ?? 50)) + 1} 页
            </span>
            <button
              type="button"
              className="btn small"
              disabled={resource.loading || !paginationInfo?.has_more}
              onClick={() => resource.setOffset(resource.offset + (paginationInfo?.limit ?? 50))}
              style={{ padding: '4px 10px', fontSize: '12px', whiteSpace: 'nowrap' }}
            >
              下一页
            </button>
          </div>
        </div>
      </article>
    </Page>
  );
}

export default ContentView;
