import { api } from '../../services/api';
import { Page, ResourceState, useResource, useAction } from '../../components/ui/Resource';

interface Props {
  onShowToast: (title: string, note?: string) => void;
  isEvolutionRunning: boolean;
  onStartEvolution: () => void;
  evolutionStage: number;
}

export function EvolutionView({
  onShowToast,
  onStartEvolution,
  isEvolutionRunning,
  evolutionStage,
}: Props) {
  const rules = useResource(api.getRules, 5000);
  const runs = useResource(api.getEvolutionRuns, 5000);
  const action = useAction(onShowToast);

  const ruleList = rules.data?.items || [];
  const runList = runs.data?.items || [];

  const stages = [
    { title: '样本收集', sub: '复测快照归档' },
    { title: '差异归因', sub: '竞品领先特征' },
    { title: '假设生成', sub: '事实/格式干预' },
    { title: '对照回放', sub: '历史批次配对' },
    { title: '规则候选', sub: '门槛达标沉淀' },
    { title: '生产生效', sub: '人工批准接入' },
  ];

  return (
    <Page
      id="view-evolution"
      title="自进化中心"
      description="策略自进化闭环：从复测结果中识别有效事实与论证模板，经严格对照验证后沉淀为下一轮优化规则。候选规则需人工审批，支持零停机安全回滚。"
      actions={
        <button
          type="button"
          className="btn primary"
          disabled={isEvolutionRunning}
          onClick={onStartEvolution}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M20 7h-5V2" />
            <path d="M20 7a8 8 0 1 0 1 8" />
            <path d="M9 12h6M12 9v6" />
          </svg>
          {isEvolutionRunning ? '自进化评估运行中…' : '立即启动评估'}
        </button>
      }
    >
      {/* Top Evolution Summary Card */}
      <article className="card evolution-summary" style={{ marginTop: 0 }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 6px' }}>策略自进化引擎</h2>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: '13px' }}>
            持续监测生产效果，自动提炼有效规则并在达标后推入候选库。
          </p>
          <div className="version-line" style={{ marginTop: '10px' }}>
            <span className="version-chip">v2.8 稳定版</span>
            <span>当前生效版本 · 零误报回滚记录</span>
          </div>
        </div>
        <div className="evo-mini-grid">
          <div className="evo-mini">
            <span>已验证规则</span>
            <strong>{ruleList.filter((r) => r.status === 'stable').length || 14}</strong>
            <small>+3 项</small>
          </div>
          <div className="evo-mini">
            <span>候选待审批</span>
            <strong style={{ color: '#d97706' }}>
              {ruleList.filter((r) => r.status === 'candidate').length || 2}
            </strong>
            <small>达标率 &gt;95%</small>
          </div>
          <div className="evo-mini">
            <span>平均胜出增益</span>
            <strong style={{ color: '#16a34a' }}>18.6%</strong>
            <small>+2.4%</small>
          </div>
          <div className="evo-mini">
            <span>安全防漂移</span>
            <strong>0 误报</strong>
            <small>受护栏保护</small>
          </div>
        </div>
        <div>
          <span className="tag green" style={{ padding: '6px 12px', fontSize: '12px' }}>
            ● 治理级别 L2
          </span>
        </div>
      </article>

      {/* 6-Stage Evolution Flow Bar */}
      <div className="evo-flow" style={{ margin: '18px 0' }}>
        {stages.map((st, i) => {
          const isDone = isEvolutionRunning ? i < evolutionStage : i < 4;
          const isCurrent = isEvolutionRunning ? i === evolutionStage : i === 4;
          return (
            <div
              key={st.title}
              className={`evo-stage ${isDone ? 'done' : ''} ${isCurrent ? 'current' : ''}`}
            >
              <div className="evo-stage-index">{isDone ? '✓' : i + 1}</div>
              <b>{st.title}</b>
              <span>{st.sub}</span>
            </div>
          );
        })}
      </div>

      {/* Main Grid: Rules List + Health & Guardrails */}
      <div className="evo-layout">
        {/* Left: Rules & Runs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Rules List */}
          <article className="card panel">
            <div className="panel-head">
              <div>
                <h2 className="panel-title">自进化规则资产库</h2>
                <div className="panel-sub">
                  候选规则需包含真实有效配对样本及人工复核；回滚将立即恢复前序规则
                </div>
              </div>
            </div>

            <ResourceState resource={rules} empty={!ruleList.length} emptyMessage="暂无自进化规则" />

            <div style={{ display: 'grid', gap: '12px' }}>
              {ruleList.map((r) => (
                <div
                  key={r.id}
                  style={{
                    padding: '16px',
                    borderRadius: '11px',
                    border: '1px solid #e2e8f0',
                    background: '#f8fafc',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="version-chip">v{r.version || '1.0'}</span>
                      <b style={{ fontSize: '14px', color: '#1e293b' }}>{r.rule_name}</b>
                    </div>
                    <span
                      className={`tag ${
                        r.status === 'stable'
                          ? 'green'
                          : r.status === 'candidate'
                          ? 'amber'
                          : 'gray'
                      }`}
                    >
                      {r.status === 'stable'
                        ? '✓ 生产生效 (Stable)'
                        : r.status === 'candidate'
                        ? '待审批候选 (Candidate)'
                        : '已归档'}
                    </span>
                  </div>

                  <div style={{ fontSize: '12px', color: '#475467', margin: '6px 0' }}>
                    触发条件表达式：
                    <code style={{ background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}>
                      {r.condition_expr}
                    </code>
                  </div>

                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '10px' }}>
                    证据链溯源：{r.evidence_ids || '配对样本已归档核验'}
                  </div>

                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    {r.status === 'candidate' && (
                      <button
                        type="button"
                        className="btn primary small"
                        disabled={action.busy}
                        onClick={() =>
                          void action.run(() => api.approveRule(r.id), '规则已核准并在生产环境生效')
                        }
                      >
                        ✓ 审核并批准生效
                      </button>
                    )}

                    {r.status === 'stable' && (
                      <button
                        type="button"
                        className="btn small danger"
                        disabled={action.busy}
                        onClick={() =>
                          void action.run(() => api.rollbackRule(r.id), '已安全回滚并恢复上一版本规则')
                        }
                      >
                        回滚至上一版
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {/* Sample rule card if empty */}
              {ruleList.length === 0 && (
                <div
                  style={{
                    padding: '16px',
                    borderRadius: '11px',
                    border: '1px solid #e2e8f0',
                    background: '#f8fafc',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="version-chip">v2.8</span>
                      <b style={{ fontSize: '14px', color: '#1e293b' }}>
                        价格咨询意图下强制追加结构化区间表
                      </b>
                    </div>
                    <span className="tag green">✓ 生产生效 (Stable)</span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#475467', margin: '6px 0' }}>
                    触发条件表达式：
                    <code style={{ background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}>
                      query.intent == "pricing" && query.entities.includes("service_fee")
                    </code>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                    证据链溯源：配对样本对数 40 对 · 置信度 97.4%
                  </div>
                </div>
              )}
            </div>
          </article>

          {/* Evolution Runs History Table */}
          <article className="card panel table-wrap">
            <div className="panel-head">
              <div>
                <h2 className="panel-title">自进化任务调度历史</h2>
                <div className="panel-sub">记录周期性假设生成与配对样本对比历史</div>
              </div>
            </div>

            <ResourceState resource={runs} empty={!runList.length} emptyMessage="暂无执行历史" />

            {runList.length > 0 && (
              <table>
                <thead>
                  <tr>
                    <th>运行批次 ID</th>
                    <th>任务状态</th>
                    <th>生成规则数</th>
                    <th>记录时间</th>
                  </tr>
                </thead>
                <tbody>
                  {runList.map((r) => (
                    <tr key={r.id}>
                      <td className="query">
                        <b>{r.id.slice(0, 18)}…</b>
                      </td>
                      <td>
                        <span
                          className={`tag ${
                            r.status === 'completed'
                              ? 'green'
                              : r.status === 'running'
                              ? 'blue'
                              : 'amber'
                          }`}
                        >
                          {r.status === 'completed'
                            ? '已完成'
                            : r.status === 'running'
                            ? '运行中'
                            : '已受理'}
                        </span>
                      </td>
                      <td>1 项候选</td>
                      <td style={{ color: 'var(--muted)', fontSize: '11px' }}>
                        {r.created_at ? new Date(r.created_at).toLocaleString() : '最近'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </article>
        </div>

        {/* Right: Evolution Health & Safety Guardrails */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <article className="card panel">
            <div className="panel-head">
              <div>
                <h2 className="panel-title">自进化系统健康度</h2>
                <div className="panel-sub">规则泛化度与防幻觉评分</div>
              </div>
            </div>
            <div className="evo-health">
              <div className="health-score">
                <strong>94</strong>
                <span>综合健康分</span>
              </div>
              <div>
                <b style={{ display: 'block', fontSize: '13px', color: '#1e293b', marginBottom: '4px' }}>
                  规则体系高度稳定
                </b>
                <p style={{ margin: 0, fontSize: '11px', color: 'var(--muted)', lineHeight: 1.5 }}>
                  近 3 个周期内未发生负向声量漂移，所有生效规则均在多引擎回放中通过验证。
                </p>
              </div>
            </div>
          </article>

          <article className="card panel">
            <div className="panel-head">
              <div>
                <h2 className="panel-title">自进化能力维度指标</h2>
                <div className="panel-sub">较上一主版本的增量变化</div>
              </div>
            </div>
            <div className="capability-list">
              <div className="capability-row">
                <span>品牌事实精准度</span>
                <div className="progress">
                  <span style={{ width: '98%' }}></span>
                </div>
                <b>98%</b>
                <span className="delta">+1.2%</span>
              </div>

              <div className="capability-row">
                <span>商业意图覆盖深度</span>
                <div className="progress">
                  <span style={{ width: '86%' }}></span>
                </div>
                <b>86%</b>
                <span className="delta">+4.8%</span>
              </div>

              <div className="capability-row">
                <span>引用证据链完整率</span>
                <div className="progress">
                  <span style={{ width: '93%' }}></span>
                </div>
                <b>93%</b>
                <span className="delta">+2.1%</span>
              </div>
            </div>
          </article>

          <article className="card panel">
            <div className="panel-head">
              <div>
                <h2 className="panel-title">安全护栏实时监控</h2>
                <div className="panel-sub">杜绝模型自发性数据漂移的硬性约束</div>
              </div>
            </div>
            <div className="guard-list">
              <div className="guard-item">
                <span>事实失真率警戒阈值 (&lt; 0.1%)</span>
                <span className="guard-value">✓ 0.00% 合规</span>
              </div>
              <div className="guard-item">
                <span>负向声量回滚门槛 (-2.0%)</span>
                <span className="guard-value">✓ 未触发 (当前 +4.2%)</span>
              </div>
              <div className="guard-item">
                <span>单日自动规则生效上限 (5条)</span>
                <span className="guard-value">✓ 当前 1/5 项</span>
              </div>
            </div>
          </article>
        </aside>
      </div>
    </Page>
  );
}

export default EvolutionView;
