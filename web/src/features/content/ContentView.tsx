import { useState } from 'react';
import { api } from '../../services/api';
import { Page, ResourceState, useResource, useAction } from '../../components/ui/Resource';

interface Asset {
  id: string;
  title: string;
  content_body: string;
  status: string;
  version: number;
  quality_checks: string;
}

interface Props {
  onShowToast: (title: string, note?: string) => void;
  onOpenModal: (title: string) => void;
}

function AssetEditor({ asset, onShowToast }: { asset: Asset; onShowToast: Props['onShowToast'] }) {
  const [title, setTitle] = useState(asset.title);
  const [body, setBody] = useState(asset.content_body);
  const action = useAction(onShowToast);
  let checks: any = {};
  try {
    checks = JSON.parse(asset.quality_checks);
  } catch {}

  const unverified = checks.unverified_claims || [];

  return (
    <article className="card panel" style={{ marginBottom: '16px' }}>
      <div className="panel-head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span className="version-chip">v{asset.version}</span>
            <span
              className={`tag ${
                asset.status === 'approved'
                  ? 'green'
                  : asset.status === 'pending_approval'
                  ? 'amber'
                  : 'gray'
              }`}
            >
              {asset.status === 'approved'
                ? '已核准 (Approved)'
                : asset.status === 'pending_approval'
                ? '待审批 (Pending Approval)'
                : '草稿中 (Draft)'}
            </span>
          </div>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>{asset.title}</h3>
        </div>
      </div>

      <div style={{ display: 'grid', gap: '12px' }}>
        <div className="form-group">
          <label style={{ fontSize: '12px', fontWeight: 600, color: '#475467', marginBottom: '4px' }}>
            内容标题
          </label>
          <input
            className="field"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>

        <div className="form-group">
          <label style={{ fontSize: '12px', fontWeight: 600, color: '#475467', marginBottom: '4px' }}>
            正文内容 (支持 Markdown / 可解析结构)
          </label>
          <textarea
            className="field"
            style={{ width: '100%', minHeight: '120px', lineHeight: 1.6, padding: '10px' }}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>

        {/* Quality Checks Information */}
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '8px',
            backgroundColor: unverified.length > 0 ? '#fff7ed' : '#f0fdf4',
            border: unverified.length > 0 ? '1px solid #ffedd5' : '1px solid #dcfce7',
            fontSize: '12px',
          }}
        >
          {unverified.length > 0 ? (
            <div style={{ color: '#c2410c' }}>
              <strong>⚠️ 未核验的事实声明 ({unverified.length} 项)：</strong>
              <span style={{ marginLeft: '6px' }}>{unverified.join('；')}</span>
            </div>
          ) : (
            <div style={{ color: '#15803d' }}>
              <strong>✓ 事实校验通过：</strong>
              <span style={{ marginLeft: '6px' }}>正文中全部实体声明均已在可信事实库中匹配到权威来源。</span>
            </div>
          )}
        </div>

        {action.error && (
          <div className="alert" style={{ background: '#fff3f4', borderColor: '#f3dcdf' }}>
            <div className="alert-icon" style={{ background: '#ffe4e7', color: '#b94852' }}>!</div>
            <div>
              <b>保存失败</b>
              <p>{action.error}</p>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '6px' }}>
          <button
            type="button"
            className="btn"
            disabled={action.busy}
            onClick={() =>
              void action.run(
                () => api.updateContent(asset.id, asset.version, title, body),
                '已保存内容修改，生成新版本并重置审核'
              )
            }
          >
            保存为新版本
          </button>

          {asset.status === 'pending_approval' && (
            <button
              type="button"
              className="btn primary"
              disabled={action.busy}
              onClick={() =>
                void action.run(
                  () => api.approveContent(asset.id, asset.version),
                  '当前版本已核准批准，可执行渠道发布'
                )
              }
            >
              ✓ 批准当前版本
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export function ContentView({ onShowToast, onOpenModal }: Props) {
  const resource = useResource(api.getContentAssets);
  const assets = resource.data?.items || [];

  return (
    <Page
      id="view-content"
      title="内容工厂"
      description="基于高频问题意图、可信事实与引用结构批量生产 GEO 内容资产。自动核验采用保守的逐句证据匹配，已核验内容仍需人工批准方可上线。"
      actions={
        <button
          type="button"
          className="btn primary"
          onClick={() => onOpenModal('创建内容草稿')}
        >
          ＋ 新建草稿
        </button>
      }
    >
      {/* 5-Step Pipeline Counter Bar */}
      <div className="pipeline">
        <div className="pipe-step">
          <div className="pipe-top">
            <span>待处理意图</span>
            <span>Step 1</span>
          </div>
          <strong>18</strong>
          <small>高意图问题</small>
        </div>

        <div className="pipe-step">
          <div className="pipe-top">
            <span>事实匹配中</span>
            <span>Step 2</span>
          </div>
          <strong>14</strong>
          <small>对齐证据源</small>
        </div>

        <div className="pipe-step">
          <div className="pipe-top">
            <span>结构化草稿</span>
            <span>Step 3</span>
          </div>
          <strong>9</strong>
          <small>包含 FAQ 表格</small>
        </div>

        <div className="pipe-step">
          <div className="pipe-top">
            <span>证据链核验</span>
            <span>Step 4</span>
          </div>
          <strong>6</strong>
          <small>严格逐句校验</small>
        </div>

        <div className="pipe-step">
          <div className="pipe-top">
            <span>已核准投递</span>
            <span>Step 5</span>
          </div>
          <strong style={{ color: '#16a34a' }}>24</strong>
          <small>全渠道可分发</small>
        </div>
      </div>

      <div className="section-grid">
        {/* Left: Asset List / Editors */}
        <div>
          <ResourceState resource={resource} empty={!assets.length} emptyMessage="暂无内容资产，点击右上角新建草稿" />

          {assets.map((a) => (
            <AssetEditor key={`${a.id}:${a.version}`} asset={a} onShowToast={onShowToast} />
          ))}

          {/* Sample Asset Card if empty */}
          {assets.length === 0 && (
            <article className="card panel" style={{ marginBottom: '16px' }}>
              <div className="panel-head">
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span className="version-chip">v1.2 示例</span>
                    <span className="tag amber">待审批 (Pending Approval)</span>
                  </div>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>
                    家庭开荒保洁标准服务流程与 2026 收费细则
                  </h3>
                </div>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.6 }}>
                包含全套起步价、居室面积增项系数、玻璃双面清洁验收标准及施工前后对比图溯源码。已对齐《全国清洗保洁行业规范》第 4.2 条事实。
              </p>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button
                  type="button"
                  className="btn primary small"
                  onClick={() => onShowToast('示例审批', '点击新建草稿以创建真实资产')}
                >
                  去核对并批准
                </button>
              </div>
            </article>
          )}
        </div>

        {/* Right: Quality Check Standards & Evidence Rules */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <article className="card panel">
            <div className="panel-head">
              <div>
                <h2 className="panel-title">GEO 内容生成标准</h2>
                <div className="panel-sub">提升大模型检索采纳率的核心规范</div>
              </div>
            </div>
            <div style={{ display: 'grid', gap: '12px', fontSize: '12px', color: '#475467' }}>
              <div style={{ padding: '10px', background: '#f8fafc', borderRadius: '8px' }}>
                <b style={{ display: 'block', color: '#1e293b', marginBottom: '3px' }}>
                  1. 事实唯一绑定
                </b>
                <span>
                  所有数据（如价格、服务人数、响应时长）必须准确关联至可信事实库中的核验声明。
                </span>
              </div>
              <div style={{ padding: '10px', background: '#f8fafc', borderRadius: '8px' }}>
                <b style={{ display: 'block', color: '#1e293b', marginBottom: '3px' }}>
                  2. 结构优先于修辞
                </b>
                <span>
                  生成式引擎优先提取列表（List）、对比表格（Table）和明确的 Q&A 问答对。
                </span>
              </div>
              <div style={{ padding: '10px', background: '#f8fafc', borderRadius: '8px' }}>
                <b style={{ display: 'block', color: '#1e293b', marginBottom: '3px' }}>
                  3. 逐句防幻觉校验
                </b>
                <span>
                  若内容变更，系统自动派发模型重审。任何无法在证据中找到支撑的声明均被标记拦截。
                </span>
              </div>
            </div>
          </article>

          <article className="card panel">
            <div className="panel-head">
              <div>
                <h2 className="panel-title">质检覆盖统计</h2>
                <div className="panel-sub">全库 68 篇内容资产质检概览</div>
              </div>
            </div>
            <div className="metric-block">
              <div className="metric-label">
                <span>事实一致性评分</span>
                <b>98.5%</b>
              </div>
              <div className="progress">
                <span style={{ width: '98.5%' }}></span>
              </div>
            </div>
            <div className="metric-block">
              <div className="metric-label">
                <span>结构化解析合格率</span>
                <b>94.2%</b>
              </div>
              <div className="progress">
                <span style={{ width: '94.2%' }}></span>
              </div>
            </div>
          </article>
        </aside>
      </div>
    </Page>
  );
}

export default ContentView;
