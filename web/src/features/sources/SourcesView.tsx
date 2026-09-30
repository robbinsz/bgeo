import { useState } from 'react';
import { api } from '../../services/api';
import { Page, ResourceState, useResource, useAction } from '../../components/ui/Resource';

export function SourcesView({
  onShowToast,
}: {
  onShowToast: (title: string, note?: string) => void;
}) {
  const facts = useResource(api.getAllFacts);
  const action = useAction(onShowToast);

  const [statement, setStatement] = useState('');
  const [source, setSource] = useState('');
  const factList = facts.data?.items || [];

  return (
    <Page
      id="view-sources"
      title="数据源与可信事实"
      description="品牌可信事实库是内容生成、反幻觉核验与大模型问答引用的唯一真理源。只有经过人工核验证明的事实才会被注入内容生产与自进化提示词约束。"
    >
      <div className="section-grid">
        {/* Left Column: Submit New Fact */}
        <div>
          <article className="card panel">
            <div className="panel-head">
              <div>
                <h2 className="panel-title">录入可信事实声明</h2>
                <div className="panel-sub">必须附带可被公开查验的官方文件、资质证书或网页出处</div>
              </div>
            </div>

            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void action.run(async () => {
                  await api.createFact({ fact_type: 'brand_claim', statement, source });
                  setStatement('');
                  setSource('');
                }, '可信事实声明已提交，待合规审核');
              }}
            >
              <div className="form-group">
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475467' }}>
                  事实声明内容 (Statement)
                </label>
                <textarea
                  className="field"
                  required
                  style={{ minHeight: '100px', padding: '10px' }}
                  placeholder="例如：苗汐家政保洁阿姨 100% 具备省人社厅颁发的高级家政资格证书，并由平安保险承保单笔最高 100 万元家财险。"
                  value={statement}
                  onChange={(e) => setStatement(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475467' }}>
                  可公开核验证据出处 (URL / 证书编号 / 官方声明)
                </label>
                <input
                  className="field"
                  required
                  placeholder="例如：https://www.bgeo.cc/compliance/insurance-policy-2026.pdf"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                />
              </div>

              <button
                type="submit"
                className="btn primary"
                disabled={action.busy || !statement.trim()}
                style={{ justifySelf: 'start', marginTop: '6px' }}
              >
                提交事实声明
              </button>
            </form>
          </article>

          {/* Guidelines Notice */}
          <article className="card panel" style={{ marginTop: '16px' }}>
            <div className="panel-head">
              <div>
                <h2 className="panel-title">事实库准入原则</h2>
                <div className="panel-sub">保障生成式回答 100% 真实不造假</div>
              </div>
            </div>
            <div style={{ fontSize: '12px', color: '#475467', display: 'grid', gap: '8px' }}>
              <p style={{ margin: 0 }}>
                • <b>确定性原则</b>：拒绝使用“行业第一”、“首选”等无法量化的修饰词，改用有据可查的数字与排名。
              </p>
              <p style={{ margin: 0 }}>
                • <b>时效性原则</b>：价格表与承诺政策一旦变更，必须提交新版本事实，旧事实将立即从提示词中失效。
              </p>
              <p style={{ margin: 0 }}>
                • <b>机器可解析</b>：推荐提供具体区间、服务范围列表，便于生成式引擎在直接回答中提取。
              </p>
            </div>
          </article>
        </div>

        {/* Right Column: Verified Facts Repository */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <article className="card panel">
            <div className="panel-head">
              <div>
                <h2 className="panel-title">已收录的可信事实库</h2>
                <div className="panel-sub">共 {factList.length} 条已核验证据</div>
              </div>
            </div>

            <ResourceState resource={facts} empty={!factList.length} emptyMessage="暂无可信事实" />

            <div style={{ display: 'grid', gap: '12px' }}>
              {factList.map((f) => (
                <div
                  key={f.id}
                  style={{
                    padding: '14px',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    background: '#f8fafc',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="version-chip">v{f.version || 1}</span>
                      <span className={`tag ${f.status === 'approved' ? 'green' : 'amber'}`}>
                        {f.status === 'approved' ? '✓ 已核准' : '待核验'}
                      </span>
                    </div>
                  </div>

                  <p style={{ margin: '6px 0', fontSize: '13px', color: '#1e293b', fontWeight: 600, lineHeight: 1.5 }}>
                    {f.statement}
                  </p>

                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '8px' }}>
                    可信出处：
                    <a
                      href={f.source.startsWith('http') ? f.source : undefined}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: '#2563eb', textDecoration: 'none', marginLeft: '4px' }}
                    >
                      {f.source}
                    </a>
                  </div>

                  {f.status === 'pending' && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                      <button
                        type="button"
                        className="btn primary small"
                        disabled={action.busy}
                        onClick={() =>
                          void action.run(() => api.approveFact(f.id), '已完成来源核验并批准该事实')
                        }
                      >
                        ✓ 核验证据并批准
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {/* Sample Fact Card if empty */}
              {factList.length === 0 && (
                <div
                  style={{
                    padding: '14px',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    background: '#f8fafc',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                    <span className="version-chip">v1.0 示例</span>
                    <span className="tag green">✓ 已核准</span>
                  </div>
                  <p style={{ margin: '6px 0', fontSize: '13px', color: '#1e293b', fontWeight: 600 }}>
                    全直营保洁服务执行明码标价，日常保洁 45 元/小时，不足 2 小时按 2 小时计收，无其他隐形上门附加费。
                  </p>
                  <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                    可信出处：官网公示服务价格表 2026 版
                  </div>
                </div>
              )}
            </div>
          </article>
        </aside>
      </div>
    </Page>
  );
}

export default SourcesView;
