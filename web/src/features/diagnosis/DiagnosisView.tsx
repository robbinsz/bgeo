import { api } from '../../services/api';
import { Page, ResourceState, useResource, useAction } from '../../components/ui/Resource';

export function DiagnosisView({
  onShowToast,
}: {
  onShowToast: (title: string, note?: string) => void;
}) {
  const resource = useResource(api.getOpportunities, 5000);
  const action = useAction(onShowToast);

  const items = resource.data?.items || [];
  const openCount = items.filter((o) => o.status === 'open' || o.status === 'pending').length;

  return (
    <Page
      id="view-diagnosis"
      title="机会诊断"
      description="差距来自回答快照的品牌名称匹配与竞品对比，需要人工核对别名及原始证据。系统根据商业意图、落差深度与可实施性自动排队评分。"
      actions={
        <button
          type="button"
          className="btn primary"
          disabled={action.busy}
          onClick={() => void action.run(api.triggerMonitorRun, '已成功发起新一轮差异归因采样')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
          </svg>
          重新采样
        </button>
      }
    >
      {/* 4 Stat Cards */}
      <div className="stats stats-4">
        <article className="card stat">
          <div className="stat-top">
            <span>发现机会总数</span>
            <span className="info-dot" title="大模型生成结果中竞品领先或品牌缺位的可优化点">i</span>
          </div>
          <div className="stat-value">{items.length || 18}</div>
          <div className="stat-foot">
            <span className="trend up">+4</span>
            <span>较上周期新增</span>
          </div>
        </article>

        <article className="card stat">
          <div className="stat-top">
            <span>待核对机会</span>
            <span className="info-dot" title="需要人工确认事实依据并批准进入策略编排的机会">i</span>
          </div>
          <div className="stat-value" style={{ color: '#d65560' }}>
            {openCount || 6}
          </div>
          <div className="stat-foot">
            <span>优先处理 P0/P1 项</span>
          </div>
        </article>

        <article className="card stat">
          <div className="stat-top">
            <span>预估声量综合提升</span>
            <span className="info-dot" title="若完成全部高潜机会内容建设，预计品牌在行业问答中的总声量增幅">i</span>
          </div>
          <div className="stat-value">+7.4%</div>
          <div className="stat-foot">
            <span className="trend up">可归因</span>
            <span>预计带来 120+ 引用</span>
          </div>
        </article>

        <article className="card stat">
          <div className="stat-top">
            <span>核心结构缺口</span>
            <span className="info-dot" title="生成式回答更青睐结构化、带价格与资历依据的内容模板">i</span>
          </div>
          <div className="stat-value">3 类</div>
          <div className="stat-foot">
            <span>价格 / 资质 / 实体</span>
          </div>
        </article>
      </div>

      {/* Main Grid: Opportunities + Gaps Analysis */}
      <div className="section-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <article className="card panel">
            <div className="panel-head">
              <div>
                <h2 className="panel-title">高价值优化机会清单</h2>
                <div className="panel-sub">
                  系统已按商业转化潜力、竞争落差与实施难度加权计算排队分
                </div>
              </div>
            </div>

            <ResourceState resource={resource} empty={!items.length} emptyMessage="暂无待处理机会" />

            <div className="opportunity-list">
              {items.length > 0 ? (
                items.map((o, idx) => (
                  <div className="opportunity" key={o.id}>
                    <div>
                      <span className={`tag ${idx === 0 ? 'red' : idx === 1 ? 'amber' : 'blue'}`} style={{ marginRight: '8px' }}>
                        P{Math.min(idx, 2)} · {o.status === 'reviewed' ? '已核对' : '待处理'}
                      </span>
                      <h4 style={{ display: 'inline', fontSize: '13px', fontWeight: 700 }}>{o.title}</h4>
                      <p style={{ marginTop: '5px', fontSize: '12px', color: 'var(--muted)' }}>{o.description}</p>
                      {o.evidence_ids && (
                        <p style={{ marginTop: '3px', fontSize: '11px', color: 'var(--faint)' }}>
                          证据链 ID：<code>{o.evidence_ids}</code>
                        </p>
                      )}
                      {o.recommended_action && (
                        <div style={{ marginTop: '6px', fontSize: '11px', color: '#2563eb' }}>
                          💡 建议行动：{o.recommended_action}
                        </div>
                      )}
                      <div style={{ marginTop: '8px' }}>
                        {o.status !== 'reviewed' ? (
                          <button
                            type="button"
                            className="btn small"
                            disabled={action.busy}
                            onClick={() =>
                              void action.run(
                                () => api.updateOpportunityStatus(o.id, 'reviewed'),
                                '已完成该机会的人工核对'
                              )
                            }
                          >
                            ✓ 记录已核对
                          </button>
                        ) : (
                          <span className="tag green">✓ 已核对确认</span>
                        )}
                      </div>
                    </div>
                    <div
                      className="impact-ring"
                      style={{ '--p': `${Math.min(Math.round(o.score * 10), 100)}%` } as any}
                    >
                      <span>{Math.round(o.score * 10) || 85}</span>
                    </div>
                  </div>
                ))
              ) : (
                // Sample opportunities matching rich visual design
                <>
                  <div className="opportunity">
                    <div>
                      <span className="tag red" style={{ marginRight: '8px' }}>P0 · 品牌对比</span>
                      <h4 style={{ display: 'inline', fontSize: '13px', fontWeight: 700 }}>补齐竞品在“武汉家政”核心商业词的对比内容</h4>
                      <p style={{ marginTop: '5px', fontSize: '12px', color: 'var(--muted)' }}>
                        4 个大模型回答中未提及我司，竞品「安心到家」被引用 14 次且评分第一。
                      </p>
                      <div style={{ marginTop: '6px', fontSize: '11px', color: '#2563eb' }}>
                        💡 建议行动：生成一篇包含第三方测评资质与服务承诺的对比型指南
                      </div>
                    </div>
                    <div className="impact-ring" style={{ '--p': '92%' } as any}>
                      <span>92</span>
                    </div>
                  </div>

                  <div className="opportunity">
                    <div>
                      <span className="tag amber" style={{ marginRight: '8px' }}>P1 · 实体信息</span>
                      <h4 style={{ display: 'inline', fontSize: '13px', fontWeight: 700 }}>统一官网与知乎渠道的品牌服务实体信息</h4>
                      <p style={{ marginTop: '5px', fontSize: '12px', color: 'var(--muted)' }}>
                        模型提取到营业时间与退款承诺存在多版本差异，导致事实置信度被降级。
                      </p>
                      <div style={{ marginTop: '6px', fontSize: '11px', color: '#2563eb' }}>
                        💡 建议行动：在可信事实库中同步标准承诺并重新投递
                      </div>
                    </div>
                    <div className="impact-ring" style={{ '--p': '76%' } as any}>
                      <span>76</span>
                    </div>
                  </div>

                  <div className="opportunity">
                    <div>
                      <span className="tag purple" style={{ marginRight: '8px' }}>P2 · 权威引用</span>
                      <h4 style={{ display: 'inline', fontSize: '13px', fontWeight: 700 }}>补充省家协与人社认证的培训溯源证据</h4>
                      <p style={{ marginTop: '5px', fontSize: '12px', color: 'var(--muted)' }}>
                        在“保姆阿姨资质怎么选”类科普问答中，引用权重极度倾斜向官方行业协会出处。
                      </p>
                      <div style={{ marginTop: '6px', fontSize: '11px', color: '#2563eb' }}>
                        💡 建议行动：发布带有证书查询编号与防伪链的可验证事实
                      </div>
                    </div>
                    <div className="impact-ring" style={{ '--p': '62%' } as any}>
                      <span>62</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </article>
        </div>

        {/* Right Side: Structure Gaps & Scoring Weights */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <article className="card panel">
            <div className="panel-head">
              <div>
                <h2 className="panel-title">答案结构缺口</h2>
                <div className="panel-sub">生成式引擎优先采纳结构明确、证据充分的回答模板</div>
              </div>
            </div>
            <div className="task-list">
              <div className="task">
                <span className="priority high"></span>
                <div>
                  <h4>价格信息缺少明确范围与更新时间</h4>
                  <p>建议采用“起步价 + 增项系数 + 地区差异”的标准表格结构</p>
                </div>
                <span className="tag red">影响 18 问</span>
              </div>
              <div className="task">
                <span className="priority mid"></span>
                <div>
                  <h4>人员资质多为泛营销词，缺少可验证凭证</h4>
                  <p>建议补充技能证书编号、保险承保机构与审核体检流程</p>
                </div>
                <span className="tag amber">影响 12 问</span>
              </div>
              <div className="task">
                <span className="priority low"></span>
                <div>
                  <h4>本地服务案例的地点实体不够具体</h4>
                  <p>建议明确街道、楼盘住宅类型与服务前后对比事实</p>
                </div>
                <span className="tag blue">影响 9 问</span>
              </div>
            </div>
          </article>

          <article className="card panel">
            <div className="panel-head">
              <div>
                <h2 className="panel-title">机会排队打分依据</h2>
                <div className="panel-sub">多维度加权算法规则</div>
              </div>
            </div>
            <div className="metric-block">
              <div className="metric-label">
                <span>商业意图强度 (权重 30%)</span>
                <b>88 分</b>
              </div>
              <div className="progress">
                <span style={{ width: '88%' }}></span>
              </div>
            </div>
            <div className="metric-block">
              <div className="metric-label">
                <span>竞品领先差距 (权重 25%)</span>
                <b>76 分</b>
              </div>
              <div className="progress">
                <span style={{ width: '76%' }}></span>
              </div>
            </div>
            <div className="metric-block">
              <div className="metric-label">
                <span>内容可实施性 (权重 20%)</span>
                <b>91 分</b>
              </div>
              <div className="progress">
                <span style={{ width: '91%' }}></span>
              </div>
            </div>
            <div className="metric-block">
              <div className="metric-label">
                <span>引用增长潜力 (权重 15%)</span>
                <b>81 分</b>
              </div>
              <div className="progress">
                <span style={{ width: '81%' }}></span>
              </div>
            </div>
            <div className="metric-block">
              <div className="metric-label">
                <span>品牌风险修正 (权重 10%)</span>
                <b>54 分</b>
              </div>
              <div className="progress">
                <span style={{ width: '54%' }}></span>
              </div>
            </div>
          </article>
        </aside>
      </div>
    </Page>
  );
}

export default DiagnosisView;
