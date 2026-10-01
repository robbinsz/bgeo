import { usePagedResource } from '../../hooks/usePagedResource';
import { PermissionButton } from '../../components/ui/Permissions';
import { useState, useMemo } from 'react';
import { api, streamSSE } from '../../services/api';
import type { CopilotActionPreview } from '../../types';
import { Page, ResourceState } from '../../components/ui/Resource';
import { useResource } from '../../hooks/useResource';
import { useAction } from '../../hooks/useAction';
import {
  Send,
  CheckCircle2,
  Clock,
  Radio,
  FileCheck,
  Search,
  Plus,
  X,
  ExternalLink,
  Check,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';

interface Props {
  onShowToast: (title: string, note?: string) => void;
}

export function PublishView({ onShowToast }: Props) {
  const channels = useResource(api.getChannels);
  const publications = useResource(api.getPublications, 5000);
  const assets = usePagedResource(api.getContentAssets);
  const action = useAction(onShowToast);

  const [activeTab, setActiveTab] = useState<'receipts' | 'dispatch' | 'channels'>('receipts');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Channel Creation Form State
  const [showAddChannel, setShowAddChannel] = useState(false);
  const [name, setName] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [credential, setCredential] = useState('');

  // Dispatch Form State
  const [selectedAsset, setSelectedAsset] = useState('');
  const [selectedChannel, setSelectedChannel] = useState('');
  const [pending, setPending] = useState<{
    session_id: string;
    preview: CopilotActionPreview;
  } | null>(null);

  const approve = async () => {
    if (!pending) return;
    await streamSSE(
      '/copilot/resume',
      {
        session_id: pending.session_id,
        interrupt_id: pending.preview.interrupt_id,
        action: 'confirm',
      },
      {
        onError: (e) => {
          throw e;
        },
      },
    );
    setPending(null);
  };

  const channelList = channels.data?.items || [];
  const publicationList = publications.data?.items || [];
  const approvedAssets = (assets.data?.items || []).filter((a) => a.status === 'approved');

  // Filtered publications
  const filteredPublications = useMemo(() => {
    return publicationList.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchId = p.id?.toLowerCase().includes(q);
        const matchUrl = p.target_url?.toLowerCase().includes(q);
        const matchErr = p.error_message?.toLowerCase().includes(q);
        if (!matchId && !matchUrl && !matchErr) return false;
      }
      return true;
    });
  }, [publicationList, statusFilter, search]);

  // Statistics
  const successCount = publicationList.filter((p) => p.status === 'success' || p.status === 'published').length;
  const pendingReceiptCount = publicationList.filter((p) => ['publishing', 'outcome_unknown'].includes(p.status)).length;
  const activeChannelCount = channelList.filter((c) => c.is_active).length;

  return (
    <Page
      id="view-publish"
      title="发布与分发"
      description="对外 Webhook 渠道必须支持幂等请求键与回执查询。发布只有在取得接收端真实可信回执后才标记为成功；结果不确定时进行异步核对，杜绝重复发布与幻觉投递。"
    >
      {/* ========================================================= */}
      {/* 1. Top Executive Metric Cards (4 KPI Cards)                */}
      {/* ========================================================= */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        <div className="card stat" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748b' }}>分发渠道总数</span>
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
              <Radio size={17} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: '8px 0 3px', letterSpacing: '-0.02em' }}>
            {channelList.length}
          </div>
          <div style={{ fontSize: '11.5px', color: '#059669', fontWeight: 500 }}>
            已启用 {activeChannelCount} 个有效端点
          </div>
        </div>

        <div className="card stat" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748b' }}>可发布已核准内容</span>
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
              <FileCheck size={17} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: '8px 0 3px', letterSpacing: '-0.02em' }}>
            {approvedAssets.length}
          </div>
          <div style={{ fontSize: '11.5px', color: '#059669', fontWeight: 500 }}>
            事实核验与人工批准通过
          </div>
        </div>

        <div className="card stat" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748b' }}>投递成功回执</span>
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
              <Send size={17} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: '8px 0 3px', letterSpacing: '-0.02em' }}>
            {successCount}
          </div>
          <div style={{ fontSize: '11.5px', color: '#64748b' }}>
            已取得第三方确切可信回执
          </div>
        </div>

        <div className="card stat" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748b' }}>待对账与投递中</span>
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
            {pendingReceiptCount}
          </div>
          <div style={{ fontSize: '11.5px', color: pendingReceiptCount > 0 ? '#d97706' : '#64748b', fontWeight: 500 }}>
            {pendingReceiptCount > 0 ? '需异步核对避免幻觉投递' : '暂无对账挂起项'}
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 2. Single Unified Card Container                           */}
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
        {/* Integrated Sub-tab Navigation */}
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
          <div
            style={{
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
              onClick={() => setActiveTab('receipts')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 12px',
                borderRadius: '6px',
                fontSize: '12.5px',
                fontWeight: activeTab === 'receipts' ? 700 : 500,
                background: activeTab === 'receipts' ? '#ffffff' : 'transparent',
                color: activeTab === 'receipts' ? '#0f172a' : '#64748b',
                boxShadow: activeTab === 'receipts' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.12s ease',
              }}
            >
              <CheckCircle2 size={13} />
              <span>发布回执与审计</span>
              <span
                style={{
                  fontSize: '10.5px',
                  padding: '1px 5px',
                  borderRadius: '999px',
                  background: activeTab === 'receipts' ? '#eff6ff' : '#e2e8f0',
                  color: activeTab === 'receipts' ? '#2563eb' : '#64748b',
                }}
              >
                {publicationList.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('dispatch')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 12px',
                borderRadius: '6px',
                fontSize: '12.5px',
                fontWeight: activeTab === 'dispatch' ? 700 : 500,
                background: activeTab === 'dispatch' ? '#ffffff' : 'transparent',
                color: activeTab === 'dispatch' ? '#0f172a' : '#64748b',
                boxShadow: activeTab === 'dispatch' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.12s ease',
              }}
            >
              <Send size={13} />
              <span>发起分发任务</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('channels')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 12px',
                borderRadius: '6px',
                fontSize: '12.5px',
                fontWeight: activeTab === 'channels' ? 700 : 500,
                background: activeTab === 'channels' ? '#ffffff' : 'transparent',
                color: activeTab === 'channels' ? '#0f172a' : '#64748b',
                boxShadow: activeTab === 'channels' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.12s ease',
              }}
            >
              <Radio size={13} />
              <span>渠道配置管理</span>
              <span
                style={{
                  fontSize: '10.5px',
                  padding: '1px 5px',
                  borderRadius: '999px',
                  background: activeTab === 'channels' ? '#eff6ff' : '#e2e8f0',
                  color: activeTab === 'channels' ? '#2563eb' : '#64748b',
                }}
              >
                {channelList.length}
              </span>
            </button>
          </div>

          {activeTab === 'receipts' && (
            <>
              {/* Search Field */}
              <div style={{ position: 'relative', flex: '1 1 200px', minWidth: '160px' }}>
                <Search
                  size={15}
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
                  placeholder="搜索发布 ID 或回执地址…"
                  style={{
                    width: '100%',
                    height: '34px',
                    padding: '0 12px 0 32px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#f8fafc',
                    fontSize: '12.5px',
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
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Status Filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>状态</span>
                <select
                  className="select"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  style={{ minHeight: '34px', fontSize: '12.5px', paddingRight: '26px' }}
                >
                  <option value="all">全部回执 ({publicationList.length})</option>
                  <option value="published">已投递成功 ({successCount})</option>
                  <option value="publishing">投递中</option>
                  <option value="outcome_unknown">待对账 ({pendingReceiptCount})</option>
                  <option value="failed">投递失败</option>
                </select>
              </div>

              {(search || statusFilter !== 'all') && (
                <button
                  type="button"
                  className="btn small"
                  onClick={() => {
                    setSearch('');
                    setStatusFilter('all');
                  }}
                  style={{ color: '#dc2626', borderColor: '#fecaca', background: '#fff' }}
                >
                  重置
                </button>
              )}
            </>
          )}

          {activeTab === 'channels' && (
            <div style={{ marginLeft: 'auto' }}>
              <PermissionButton
                permission="admin"
                type="button"
                className="btn small primary"
                onClick={() => setShowAddChannel(!showAddChannel)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                <Plus size={13} />
                <span>{showAddChannel ? '收起配置' : '添加发布渠道'}</span>
              </PermissionButton>
            </div>
          )}
        </div>

        {/* ========================================================= */}
        {/* Tab 1: Receipts & Audit Table                             */}
        {/* ========================================================= */}
        {activeTab === 'receipts' && (
          <div>
            <ResourceState
              resource={publications}
              empty={!filteredPublications.length}
              emptyMessage={search || statusFilter !== 'all' ? '未找到符合条件的发布回执' : '暂无发布回执记录'}
            />

            {filteredPublications.length > 0 && (
              <div className="table-wrap" style={{ margin: 0, border: 'none', borderRadius: 0 }}>
                <table style={{ minWidth: '860px', width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '12px 18px', textAlign: 'left', minWidth: '220px' }}>
                        发布 ID / 资产版本
                      </th>
                      <th style={{ padding: '12px 14px', textAlign: 'left', width: '150px', whiteSpace: 'nowrap' }}>
                        回执核对状态
                      </th>
                      <th style={{ padding: '12px 14px', textAlign: 'left', minWidth: '300px' }}>
                        结果地址 / 响应信息
                      </th>
                      <th style={{ padding: '12px 18px', textAlign: 'right', width: '140px', whiteSpace: 'nowrap' }}>
                        操作
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPublications.map((p, idx) => {
                      const isSuccess = p.status === 'success' || p.status === 'published';
                      const isPending = ['publishing', 'outcome_unknown'].includes(p.status);

                      return (
                        <tr
                          key={p.id}
                          style={{
                            borderBottom: idx < filteredPublications.length - 1 ? '1px solid #f1f5f9' : 'none',
                            transition: 'background 0.12s ease',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#fcfdfe')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          {/* ID & Version */}
                          <td style={{ padding: '13px 18px', verticalAlign: 'middle' }}>
                            <div>
                              <b style={{ fontSize: '13px', color: '#0f172a', fontFamily: 'ui-monospace, monospace' }}>
                                {p.id.slice(0, 16)}…
                              </b>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                                <span className="version-chip" style={{ fontSize: '10.5px' }}>
                                  v{p.asset_version}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Status */}
                          <td style={{ padding: '13px 14px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '2px 8px',
                                borderRadius: '5px',
                                fontSize: '11.5px',
                                fontWeight: 600,
                                background: isSuccess ? '#ecfdf5' : isPending ? '#fffbeb' : '#fef2f2',
                                border: `1px solid ${isSuccess ? '#a7f3d0' : isPending ? '#fde68a' : '#fecaca'}`,
                                color: isSuccess ? '#047857' : isPending ? '#d97706' : '#dc2626',
                              }}
                            >
                              {isSuccess ? '✓ 已投递成功' : p.status === 'publishing' ? '投递中' : p.status === 'failed' ? '投递失败' : '结果待对账'}
                            </span>
                          </td>

                          {/* Result URL or Error */}
                          <td style={{ padding: '13px 14px', verticalAlign: 'middle' }}>
                            {p.target_url ? (
                              <a
                                href={p.target_url}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  color: '#2563eb',
                                  textDecoration: 'none',
                                  fontSize: '12px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  maxWidth: '320px',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                <span>{p.target_url}</span>
                                <ExternalLink size={12} />
                              </a>
                            ) : (
                              <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                                {p.error_message || '等待接收端 Webhook 回执写入…'}
                              </span>
                            )}
                          </td>

                          {/* Action */}
                          <td style={{ padding: '13px 18px', textAlign: 'right', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                            {isPending && (
                              <PermissionButton
                                type="button"
                                className="btn small"
                                disabled={action.busy}
                                onClick={() =>
                                  void action.run(
                                    () => api.reconcilePublication(p.id),
                                    '回执对账已完成',
                                  )
                                }
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '3px 8px',
                                  fontSize: '11.5px',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                <RotateCcw size={12} />
                                <span>核对回执</span>
                              </PermissionButton>
                            )}
                            {isSuccess && (
                              <span style={{ fontSize: '11.5px', color: '#059669', fontWeight: 500 }}>
                                回执已确认
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Bottom Footer */}
            <div
              style={{
                padding: '12px 18px',
                borderTop: '1px solid #e2e8f0',
                background: '#fcfdfe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ fontSize: '12.5px', color: '#64748b' }}>
                显示本页 {filteredPublications.length} 项 · 共 {publicationList.length} 条发布回执 (成功 {successCount} 条)
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* Tab 2: Dispatch Task Form & Human Diff Approval           */}
        {/* ========================================================= */}
        {activeTab === 'dispatch' && (
          <div style={{ padding: '24px 20px', maxWidth: '680px' }}>
            <h3 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
              发起幂等内容分发
            </h3>
            <p style={{ margin: '0 0 18px', fontSize: '12.5px', color: '#64748b' }}>
              请选择已审核核准通过的内容资产与目标分发渠道，系统将生成安全拦截预览并等待人工签字确认。
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void action.run(async () => {
                  setPending(await api.previewPublication(selectedAsset, selectedChannel));
                }, '审批预览已生成');
              }}
              style={{ display: 'grid', gap: '14px' }}
            >
              <div>
                <label
                  htmlFor="publish-asset-select"
                  style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#475467', marginBottom: '5px' }}
                >
                  已核准内容资产
                </label>
                <select
                  id="publish-asset-select"
                  className="select"
                  required
                  style={{ width: '100%', minHeight: '38px', fontSize: '13px' }}
                  value={selectedAsset}
                  onChange={(e) => setSelectedAsset(e.target.value)}
                >
                  <option value="">请选择已审核通过的内容…</option>
                  {approvedAssets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title} (v{a.version})
                    </option>
                  ))}
                  {approvedAssets.length === 0 && (
                    <option value="" disabled>
                      暂无已核准内容（请先在内容工厂完成核准）
                    </option>
                  )}
                </select>
              </div>

              <div>
                <label
                  htmlFor="publish-channel-select"
                  style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#475467', marginBottom: '5px' }}
                >
                  目标分发渠道
                </label>
                <select
                  id="publish-channel-select"
                  className="select"
                  required
                  style={{ width: '100%', minHeight: '38px', fontSize: '13px' }}
                  value={selectedChannel}
                  onChange={(e) => setSelectedChannel(e.target.value)}
                >
                  <option value="">请选择已启用的 Webhook 渠道…</option>
                  {channelList
                    .filter((c) => c.is_active)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.endpoint_url})
                      </option>
                    ))}
                </select>
              </div>

              <PermissionButton
                type="submit"
                className="btn primary"
                permission="review"
                disabled={action.busy || !selectedAsset || !selectedChannel || !!pending}
                style={{ justifySelf: 'start', marginTop: '6px' }}
              >
                生成发布预览并等待签字
              </PermissionButton>
            </form>

            {/* Pending Approval Diff Box */}
            {pending && (
              <div
                style={{
                  marginTop: '20px',
                  padding: '18px',
                  borderRadius: '12px',
                  border: '1px solid #fde68a',
                  borderLeft: '5px solid #f59e0b',
                  background: '#fffbeb',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                  <AlertTriangle size={16} color="#d97706" />
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#b45309' }}>
                    安全拦截 · 等待人工签字审批
                  </span>
                </div>
                <h4 style={{ margin: '0 0 10px', fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                  {pending.preview.title}
                </h4>

                <pre
                  style={{
                    padding: '12px',
                    background: '#0f172a',
                    color: '#f8fafc',
                    borderRadius: '8px',
                    fontSize: '11.5px',
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                  }}
                >
                  {JSON.stringify(pending.preview.details, null, 2)}
                </pre>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end', marginTop: '14px' }}>
                  <PermissionButton
                    type="button"
                    className="btn"
                    disabled={action.busy}
                    onClick={() =>
                      void action.run(async () => {
                        await streamSSE(
                          '/copilot/resume',
                          {
                            session_id: pending.session_id,
                            interrupt_id: pending.preview.interrupt_id,
                            action: 'cancel',
                          },
                          {
                            onError: (e) => {
                              throw e;
                            },
                          },
                        );
                        setPending(null);
                      }, '审批已取消')
                    }
                  >
                    取消
                  </PermissionButton>

                  <PermissionButton
                    type="button"
                    className="btn primary"
                    disabled={action.busy}
                    permission="review"
                    onClick={() => void action.run(approve, '发布任务已受理，等待接收端回执')}
                    style={{ background: '#059669', borderColor: '#047857' }}
                  >
                    <Check size={14} />
                    <span>批准并投递</span>
                  </PermissionButton>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* Tab 3: Channel Configuration Management                   */}
        {/* ========================================================= */}
        {activeTab === 'channels' && (
          <div style={{ padding: '18px 20px' }}>
            {/* Collapsible Add Channel Form */}
            {showAddChannel && (
              <div
                style={{
                  padding: '18px',
                  background: '#f8fafc',
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                  marginBottom: '20px',
                }}
              >
                <h4 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                  添加 HTTPS Webhook 分发端点
                </h4>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void action.run(async () => {
                      await api.createChannel({
                        name,
                        endpoint_url: endpoint,
                        credential,
                      });
                      setName('');
                      setEndpoint('');
                      setCredential('');
                      setShowAddChannel(false);
                    }, 'Webhook 渠道已成功保存');
                  }}
                  style={{ display: 'grid', gap: '12px' }}
                >
                  <div>
                    <label
                      htmlFor="channel-name-input"
                      style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475467', marginBottom: '4px' }}
                    >
                      渠道标识名称
                    </label>
                    <input
                      id="channel-name-input"
                      className="field"
                      required
                      placeholder="例如：官网内容中心、知乎专栏、微信公众号"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      style={{ width: '100%', background: '#ffffff', fontSize: '13px' }}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="channel-endpoint-input"
                      style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475467', marginBottom: '4px' }}
                    >
                      HTTPS Webhook 地址
                    </label>
                    <input
                      id="channel-endpoint-input"
                      className="field"
                      required
                      type="url"
                      placeholder="https://api.example.com/v1/geo-articles"
                      value={endpoint}
                      onChange={(e) => setEndpoint(e.target.value)}
                      style={{ width: '100%', background: '#ffffff', fontSize: '13px' }}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="channel-credential-input"
                      style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475467', marginBottom: '4px' }}
                    >
                      Bearer Token 或访问凭证 (选填，自动加密存储)
                    </label>
                    <input
                      id="channel-credential-input"
                      className="field"
                      type="password"
                      autoComplete="new-password"
                      placeholder="Bearer tok_..."
                      value={credential}
                      onChange={(e) => setCredential(e.target.value)}
                      style={{ width: '100%', background: '#ffffff', fontSize: '13px' }}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                    <button
                      type="button"
                      className="btn small"
                      onClick={() => setShowAddChannel(false)}
                    >
                      取消
                    </button>
                    <PermissionButton
                      type="submit"
                      permission="admin"
                      className="btn small primary"
                      disabled={action.busy}
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      保存渠道
                    </PermissionButton>
                  </div>
                </form>
              </div>
            )}

            <ResourceState
              resource={channels}
              empty={!channelList.length}
              emptyMessage="暂未配置分发渠道"
            />

            {/* Channels List */}
            <div style={{ display: 'grid', gap: '12px' }}>
              {channelList.map((c) => (
                <div
                  key={c.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 16px',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    background: '#f8fafc',
                    flexWrap: 'wrap',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '9px',
                        background: '#0f172a',
                        color: '#fff',
                        display: 'grid',
                        placeItems: 'center',
                        fontWeight: 800,
                        fontSize: '13px',
                      }}
                    >
                      {c.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <b style={{ fontSize: '13.5px', display: 'block', color: '#0f172a' }}>
                        {c.name}
                      </b>
                      <span style={{ fontSize: '11.5px', color: '#64748b' }}>
                        {c.endpoint_url || '未配置完整 URL'}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: '5px',
                        background: c.is_active ? '#ecfdf5' : '#f1f5f9',
                        color: c.is_active ? '#047857' : '#64748b',
                        border: `1px solid ${c.is_active ? '#a7f3d0' : '#e2e8f0'}`,
                      }}
                    >
                      {c.is_active ? '✓ 已启用' : '已停用'}
                    </span>

                    {c.has_credential && (
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: '5px',
                          background: '#eff6ff',
                          color: '#1d4ed8',
                          border: '1px solid #bfdbfe',
                        }}
                      >
                        已配置鉴权
                      </span>
                    )}

                    {c.is_active && (
                      <PermissionButton
                        type="button"
                        className="btn small"
                        disabled={action.busy}
                        permission="admin"
                        onClick={() => void action.run(() => api.disableChannel(c.id), '渠道已停用')}
                        style={{ padding: '3px 8px', fontSize: '11.5px' }}
                      >
                        停用
                      </PermissionButton>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </article>
    </Page>
  );
}

export default PublishView;
