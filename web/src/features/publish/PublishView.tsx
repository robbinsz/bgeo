import { useState } from 'react';
import { api, streamSSE } from '../../services/api';
import type { CopilotActionPreview } from '../../types';
import { Page, ResourceState, useResource, useAction } from '../../components/ui/Resource';

export function PublishView({
  onShowToast,
}: {
  onShowToast: (title: string, note?: string) => void;
}) {
  const channels = useResource(api.getChannels);
  const publications = useResource(api.getPublications, 5000);
  const assets = useResource(api.getContentAssets);
  const action = useAction(onShowToast);

  const [name, setName] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [credential, setCredential] = useState('');
  const [asset, setAsset] = useState('');
  const [channel, setChannel] = useState('');
  const [pending, setPending] = useState<{
    session_id: string;
    preview: CopilotActionPreview;
  } | null>(null);

  const approve = async () => {
    if (!pending) return;
    await streamSSE(
      '/copilot/resume',
      { session_id: pending.session_id, interrupt_id: pending.preview.interrupt_id, action: 'confirm' },
      { onError: (e) => { throw e; } }
    );
    setPending(null);
  };

  const channelList = channels.data?.items || [];
  const publicationList = publications.data?.items || [];
  const approvedAssets = (assets.data?.items || []).filter((a) => a.status === 'approved');

  return (
    <Page
      id="view-publish"
      title="发布与分发"
      description="对外 Webhook 渠道必须支持幂等请求键与回执查询。发布只有在取得接收端真实可信回执后才标记为成功；结果不确定时进行异步核对，杜绝重复发布与幻觉投递。"
    >
      <div className="section-grid">
        {/* Left Column: Channels & Creation */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Add Channel Form */}
          <article className="card panel">
            <div className="panel-head">
              <div>
                <h2 className="panel-title">添加发布渠道</h2>
                <div className="panel-sub">配置用于接收内容资产的 HTTPS Webhook 终端</div>
              </div>
            </div>

            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void action.run(async () => {
                  await api.createChannel({ name, endpoint_url: endpoint, credential });
                  setName('');
                  setEndpoint('');
                  setCredential('');
                }, 'Webhook 渠道已成功保存');
              }}
            >
              <div className="form-group">
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475467' }}>
                  渠道标识名称
                </label>
                <input
                  className="field"
                  required
                  placeholder="例如：官网内容中心、知乎专栏、微信公众号"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475467' }}>
                  HTTPS Webhook 地址
                </label>
                <input
                  className="field"
                  required
                  type="url"
                  placeholder="https://api.example.com/v1/geo-articles"
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475467' }}>
                  Bearer Token 或访问凭证 (选填，自动加密存储)
                </label>
                <input
                  className="field"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Bearer tok_..."
                  value={credential}
                  onChange={(e) => setCredential(e.target.value)}
                />
              </div>

              <button
                type="submit"
                className="btn primary"
                disabled={action.busy}
                style={{ justifySelf: 'start', marginTop: '6px' }}
              >
                保存渠道
              </button>
            </form>
          </article>

          {/* Active Channels List */}
          <article className="card panel">
            <div className="panel-head">
              <div>
                <h2 className="panel-title">已配置的发布渠道</h2>
                <div className="panel-sub">共 {channelList.length} 个分发端点</div>
              </div>
            </div>

            <ResourceState resource={channels} empty={!channelList.length} emptyMessage="暂未配置分发渠道" />

            <div style={{ display: 'grid', gap: '10px' }}>
              {channelList.map((c) => (
                <div
                  key={c.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    background: '#f8fafc',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '9px',
                        background: '#0f172a',
                        color: '#fff',
                        display: 'grid',
                        placeItems: 'center',
                        fontWeight: 700,
                        fontSize: '12px',
                      }}
                    >
                      {c.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <b style={{ fontSize: '13px', display: 'block', color: '#1e293b' }}>{c.name}</b>
                      <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                        {c.endpoint_url || '未配置完整 URL'}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className={`tag ${c.is_active ? 'green' : 'gray'}`}>
                      {c.is_active ? '✓ 已启用' : '已停用'}
                    </span>
                    {c.has_credential && <span className="tag blue">已配置鉴权</span>}
                    {c.is_active && (
                      <button
                        type="button"
                        className="btn small"
                        disabled={action.busy}
                        onClick={() => void action.run(() => api.disableChannel(c.id), '渠道已停用')}
                      >
                        停用
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </article>

          {/* Create Publication Approval */}
          <article className="card panel">
            <div className="panel-head">
              <div>
                <h2 className="panel-title">发起发布任务</h2>
                <div className="panel-sub">选择已核准内容与目标渠道，生成幂等发布预览</div>
              </div>
            </div>

            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void action.run(async () => {
                  setPending(await api.previewPublication(asset, channel));
                }, '审批预览已生成');
              }}
            >
              <div className="form-group">
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475467' }}>
                  已核准内容资产
                </label>
                <select
                  className="select"
                  required
                  style={{ width: '100%' }}
                  value={asset}
                  onChange={(e) => setAsset(e.target.value)}
                >
                  <option value="">请选择已审核通过的内容…</option>
                  {approvedAssets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title} (v{a.version})
                    </option>
                  ))}
                  {approvedAssets.length === 0 && (
                    <option value="" disabled>暂无已核准内容（请先在内容工厂批准）</option>
                  )}
                </select>
              </div>

              <div className="form-group">
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475467' }}>
                  目标分发渠道
                </label>
                <select
                  className="select"
                  required
                  style={{ width: '100%' }}
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                >
                  <option value="">请选择启用的渠道…</option>
                  {channelList
                    .filter((c) => c.is_active)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </div>

              <button
                type="submit"
                className="btn primary"
                disabled={action.busy || !asset || !channel || !!pending}
                style={{ justifySelf: 'start', marginTop: '6px' }}
              >
                生成发布预览
              </button>
            </form>
          </article>

          {/* Pending Approval Diff Box */}
          {pending && (
            <article
              className="card panel"
              style={{ borderLeft: '4px solid #f59e0b', background: '#fffbeb' }}
            >
              <div className="panel-head">
                <div>
                  <span className="tag amber" style={{ marginBottom: '4px' }}>
                    安全拦截 · 等待人工签字
                  </span>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>
                    {pending.preview.title}
                  </h3>
                </div>
              </div>
              <pre
                style={{
                  padding: '12px',
                  background: '#0f172a',
                  color: '#f8fafc',
                  borderRadius: '8px',
                  fontSize: '11px',
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {JSON.stringify(pending.preview.details, null, 2)}
              </pre>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button
                  type="button"
                  className="btn primary"
                  disabled={action.busy}
                  onClick={() => void action.run(approve, '发布任务已受理，等待接收端回执')}
                >
                  ✓ 批准并投递
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={action.busy}
                  onClick={() =>
                    void action.run(async () => {
                      await streamSSE(
                        '/copilot/resume',
                        { session_id: pending.session_id, interrupt_id: pending.preview.interrupt_id, action: 'cancel' },
                        { onError: (e) => { throw e; } }
                      );
                      setPending(null);
                    }, '审批已取消')
                  }
                >
                  取消
                </button>
              </div>
            </article>
          )}
        </div>

        {/* Right Column: Publication Receipts */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <article className="card panel table-wrap">
            <div className="panel-head">
              <div>
                <h2 className="panel-title">发布回执与审计记录</h2>
                <div className="panel-sub">
                  共 {publicationList.length} 条记录 · 校验真实可信的 Webhook 响应
                </div>
              </div>
            </div>

            <ResourceState resource={publications} empty={!publicationList.length} emptyMessage="暂无发布回执记录" />

            {publicationList.length > 0 && (
              <table>
                <thead>
                  <tr>
                    <th>发布 ID / 内容</th>
                    <th>回执状态</th>
                    <th>结果地址 / 响应</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {publicationList.map((p) => (
                    <tr key={p.id}>
                      <td className="query">
                        <b>{p.id.slice(0, 14)}…</b>
                        <small>内容版本 v{p.asset_version}</small>
                      </td>
                      <td>
                        <span
                          className={`tag ${
                            p.status === 'success' || p.status === 'published'
                              ? 'green'
                              : p.status === 'publishing'
                              ? 'blue'
                              : p.status === 'failed'
                              ? 'red'
                              : 'amber'
                          }`}
                        >
                          {p.status === 'success' || p.status === 'published'
                            ? '已投递成功'
                            : p.status === 'publishing'
                            ? '投递中'
                            : p.status === 'failed'
                            ? '投递失败'
                            : '结果待对账'}
                        </span>
                      </td>
                      <td style={{ fontSize: '11px', color: 'var(--muted)', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.target_url || p.error_message || '等待回执写入…'}
                      </td>
                      <td>
                        {['publishing', 'outcome_unknown'].includes(p.status) && (
                          <button
                            type="button"
                            className="btn small"
                            disabled={action.busy}
                            onClick={() => void action.run(() => api.reconcilePublication(p.id), '回执对账已完成')}
                          >
                            核对回执
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </article>
        </aside>
      </div>
    </Page>
  );
}

export default PublishView;
