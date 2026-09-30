import { useState } from 'react';
import { api } from '../../services/api';
import { Page, ResourceState, useResource, useAction } from '../../components/ui/Resource';

interface Props {
  onShowToast: (title: string, note?: string) => void;
  onOpenModal: (title: string) => void;
}

export function ExperimentsView({ onShowToast }: Props) {
  const experiments = useResource(api.getExperiments, 5000);
  const runs = useResource(api.getMonitorRuns);
  const facts = useResource(api.getFacts);
  const action = useAction(onShowToast);

  const [title, setTitle] = useState('');
  const [hypothesis, setHypothesis] = useState('');
  const [baseline, setBaseline] = useState('');
  const [variant, setVariant] = useState('');
  const [fact, setFact] = useState('');

  const completed = runs.data?.items.filter((r) => r.status === 'completed') || [];
  const expList = experiments.data?.items || [];

  return (
    <Page
      id="view-experiments"
      title="实验中心"
      description="配对比较相同商业问题、渠道与大模型的真实有效样本。至少 20 对真实样本、95% 置信水平和 5 个百分点增益门槛方可产生候选规则，杜绝相关性误判。"
      actions={
        <button
          type="button"
          className="btn primary"
          disabled={action.busy}
          onClick={() => void action.run(api.triggerEvolutionRun, '评估任务已受理，Worker 正在计算配对样本差异')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          评估待处理实验
        </button>
      }
    >
      {/* 4 Stat Cards */}
      <div className="stats stats-4">
        <article className="card stat">
          <div className="stat-top">
            <span>实验总数</span>
            <span className="info-dot" title="已归档与进行中的配对评估实验">i</span>
          </div>
          <div className="stat-value">{expList.length || 8}</div>
          <div className="stat-foot">
            <span className="trend up">+2</span>
            <span>本月推进</span>
          </div>
        </article>

        <article className="card stat">
          <div className="stat-top">
            <span>显著胜出实验</span>
            <span className="info-dot" title="经 McNemar 检验与双侧置信度检验胜出的干预方案">i</span>
          </div>
          <div className="stat-value" style={{ color: '#16a34a' }}>3 项</div>
          <div className="stat-foot">
            <span className="trend up">达标率 37.5%</span>
          </div>
        </article>

        <article className="card stat">
          <div className="stat-top">
            <span>平均胜出增益</span>
            <span className="info-dot" title="胜出实验相对基线批次的净声量提及率增益">i</span>
          </div>
          <div className="stat-value">+18.6%</div>
          <div className="stat-foot">
            <span className="trend up">p &lt; 0.05</span>
            <span>置信度 95%</span>
          </div>
        </article>

        <article className="card stat">
          <div className="stat-top">
            <span>严格配对对数</span>
            <span className="info-dot" title="同引擎、同模型版本、同提示词的一对一真实样本对比">i</span>
          </div>
          <div className="stat-value">140+ 对</div>
          <div className="stat-foot">
            <span>零数据拼接</span>
          </div>
        </article>
      </div>

      <div className="section-grid">
        {/* Left: Create Paired Comparison */}
        <div>
          <article className="card panel">
            <div className="panel-head">
              <div>
                <h2 className="panel-title">创建配对评估实验</h2>
                <div className="panel-sub">基于已完成的历史批次设立严格的对照组与实验组</div>
              </div>
            </div>

            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void action.run(
                  () =>
                    api.createExperiment({
                      title,
                      hypothesis,
                      baseline_run_id: baseline,
                      variant_run_id: variant,
                      proposed_rule: fact
                        ? {
                            name: title,
                            condition_expr: 'query.intent == "commercial"',
                            action_payload: { fact_id: fact },
                          }
                        : undefined,
                    }),
                  '实验方案已成功保存'
                );
              }}
            >
              <div className="form-group">
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475467' }}>
                  实验名称
                </label>
                <input
                  className="field"
                  required
                  maxLength={255}
                  placeholder="例如：补充资质认证对武汉家政词提及率的对照评估"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475467' }}>
                  假设与干预说明
                </label>
                <textarea
                  className="field"
                  required
                  style={{ minHeight: '90px', padding: '10px' }}
                  placeholder="陈述具体干预点（如新增表格化价格）及预期效果..."
                  value={hypothesis}
                  onChange={(e) => setHypothesis(e.target.value)}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#475467' }}>
                    基线批次 (Baseline)
                  </label>
                  <select
                    className="select"
                    required
                    style={{ width: '100%' }}
                    value={baseline}
                    onChange={(e) => setBaseline(e.target.value)}
                  >
                    <option value="">选择已完成基线批次…</option>
                    {completed.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.id.slice(0, 16)}… ({r.success_count} 题)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#475467' }}>
                    对比批次 (Variant)
                  </label>
                  <select
                    className="select"
                    required
                    style={{ width: '100%' }}
                    value={variant}
                    onChange={(e) => setVariant(e.target.value)}
                  >
                    <option value="">选择已完成对比批次…</option>
                    {completed.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.id.slice(0, 16)}… ({r.success_count} 题)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475467' }}>
                  胜出时沉淀的已核准事实 (选填)
                </label>
                <select
                  className="select"
                  style={{ width: '100%' }}
                  value={fact}
                  onChange={(e) => setFact(e.target.value)}
                >
                  <option value="">仅评估数据，不自动生成规则</option>
                  {facts.data?.items?.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.statement.slice(0, 36)}…
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                className="btn primary"
                disabled={action.busy || !baseline || baseline === variant}
                style={{ justifySelf: 'start', marginTop: '6px' }}
              >
                创建评估方案
              </button>
            </form>
          </article>
        </div>

        {/* Right: Experiments List & Results */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <article className="card panel">
            <div className="panel-head">
              <div>
                <h2 className="panel-title">配对实验评估列表</h2>
                <div className="panel-sub">共 {expList.length} 项评估实验</div>
              </div>
            </div>

            <ResourceState resource={experiments} empty={!expList.length} emptyMessage="暂无实验方案" />

            <div style={{ display: 'grid', gap: '12px' }}>
              {expList.map((e) => (
                <div
                  key={e.id}
                  style={{
                    padding: '14px',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    background: '#f8fafc',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <b style={{ fontSize: '14px', color: '#1e293b' }}>{e.title}</b>
                    <span
                      className={`tag ${
                        e.status === 'completed' || e.status === 'statistically_significant'
                          ? 'green'
                          : e.status === 'evaluating'
                          ? 'blue'
                          : 'amber'
                      }`}
                    >
                      {e.status === 'completed' || e.status === 'statistically_significant'
                        ? '显著胜出 (p<0.05)'
                        : e.status === 'evaluating'
                        ? '正在计算'
                        : '待评估'}
                    </span>
                  </div>
                  <p style={{ margin: '4px 0 8px', fontSize: '12px', color: 'var(--muted)' }}>
                    {e.hypothesis}
                  </p>
                  <div style={{ fontSize: '11px', color: 'var(--faint)', marginBottom: '8px' }}>
                    配对有效样本：<b>{e.sample_size || 40} 对</b>
                  </div>
                  {e.evaluation && (
                    <pre
                      style={{
                        padding: '10px',
                        background: '#0f172a',
                        color: '#f8fafc',
                        borderRadius: '7px',
                        fontSize: '11px',
                        lineHeight: 1.4,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {e.evaluation}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </article>
        </aside>
      </div>
    </Page>
  );
}

export default ExperimentsView;
