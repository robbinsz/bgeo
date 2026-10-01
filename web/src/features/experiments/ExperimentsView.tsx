import { usePagedResource } from '../../hooks/usePagedResource';
import { PermissionButton } from '../../components/ui/Permissions';
import { useState, useMemo } from 'react';
import { api } from '../../services/api';
import { Page, ResourceState } from '../../components/ui/Resource';
import { useResource } from '../../hooks/useResource';
import { useAction } from '../../hooks/useAction';
import {
  FlaskConical,
  CheckCircle2,
  Clock,
  TrendingUp,
  Search,
  Plus,
  Play,
  X,
  Scale,
} from 'lucide-react';

interface Props {
  onShowToast: (title: string, note?: string) => void;
  onOpenModal: (title: string) => void;
}

export function ExperimentsView({ onShowToast }: Props) {
  const experiments = useResource(api.getExperiments, 5000);
  const runs = useResource(api.getMonitorRuns);
  const facts = usePagedResource(api.getFacts);
  const action = useAction(onShowToast);

  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Form State
  const [title, setTitle] = useState('');
  const [hypothesis, setHypothesis] = useState('');
  const [baseline, setBaseline] = useState('');
  const [variant, setVariant] = useState('');
  const [fact, setFact] = useState('');

  const completedRuns = runs.data?.items.filter((r) => r.status === 'completed') || [];
  const expList = experiments.data?.items || [];
  const factItems = facts.data?.items || [];

  // Filtered experiments
  const filteredExperiments = useMemo(() => {
    return expList.filter((e) => {
      if (statusFilter !== 'all' && e.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchTitle = e.title?.toLowerCase().includes(q);
        const matchHypo = e.hypothesis?.toLowerCase().includes(q);
        const matchEval = e.evaluation?.toLowerCase().includes(q);
        if (!matchTitle && !matchHypo && !matchEval) return false;
      }
      return true;
    });
  }, [expList, statusFilter, search]);

  // Statistics
  const totalCount = expList.length;
  const evaluatedCount = expList.filter((e) => !!e.evaluation || e.status === 'completed' || e.status === 'statistically_significant').length;
  const totalSamples = expList.reduce((sum, e) => sum + (e.sample_size || 0), 0);
  const significantCount = expList.filter((e) => e.status === 'statistically_significant').length;

  return (
    <Page
      id="view-experiments"
      title="实验中心"
      description="配对比较相同商业问题、渠道与大模型的真实有效样本。至少 20 对真实样本、95% 置信水平和 5 个百分点增益门槛方可产生候选规则，杜绝相关性误判。"
      actions={
        <PermissionButton
          type="button"
          className="btn primary"
          disabled={action.busy}
          onClick={() =>
            void action.run(api.triggerEvolutionRun, '评估任务已受理，Worker 正在计算配对样本差异')
          }
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <Play size={14} fill="currentColor" />
          <span>评估待处理实验</span>
        </PermissionButton>
      }
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
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748b' }}>实验方案总数</span>
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
              <FlaskConical size={17} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: '8px 0 3px', letterSpacing: '-0.02em' }}>
            {totalCount}
          </div>
          <div style={{ fontSize: '11.5px', color: '#64748b' }}>
            严格对照组与实验组设计
          </div>
        </div>

        <div className="card stat" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748b' }}>已完成评估</span>
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
            {evaluatedCount}
          </div>
          <div style={{ fontSize: '11.5px', color: '#059669', fontWeight: 500 }}>
            已具备配对置信度评估报告
          </div>
        </div>

        <div className="card stat" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748b' }}>有效配对样本量</span>
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
              <Scale size={17} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: '8px 0 3px', letterSpacing: '-0.02em' }}>
            {totalSamples} <span style={{ fontSize: '14px', fontWeight: 500, color: '#94a3b8' }}>对</span>
          </div>
          <div style={{ fontSize: '11.5px', color: '#7c3aed', fontWeight: 500 }}>
            多引擎真实盲测样本
          </div>
        </div>

        <div className="card stat" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748b' }}>统计显著正向</span>
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
              <TrendingUp size={17} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: '8px 0 3px', letterSpacing: '-0.02em' }}>
            {significantCount}
          </div>
          <div style={{ fontSize: '11.5px', color: '#d97706', fontWeight: 500 }}>
            达到 95% 置信度与净增益门槛
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
              onClick={() => setActiveTab('list')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 12px',
                borderRadius: '6px',
                fontSize: '12.5px',
                fontWeight: activeTab === 'list' ? 700 : 500,
                background: activeTab === 'list' ? '#ffffff' : 'transparent',
                color: activeTab === 'list' ? '#0f172a' : '#64748b',
                boxShadow: activeTab === 'list' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.12s ease',
              }}
            >
              <FlaskConical size={13} />
              <span>实验方案与评估结果</span>
              <span
                style={{
                  fontSize: '10.5px',
                  padding: '1px 5px',
                  borderRadius: '999px',
                  background: activeTab === 'list' ? '#eff6ff' : '#e2e8f0',
                  color: activeTab === 'list' ? '#2563eb' : '#64748b',
                }}
              >
                {expList.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('create')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 12px',
                borderRadius: '6px',
                fontSize: '12.5px',
                fontWeight: activeTab === 'create' ? 700 : 500,
                background: activeTab === 'create' ? '#ffffff' : 'transparent',
                color: activeTab === 'create' ? '#0f172a' : '#64748b',
                boxShadow: activeTab === 'create' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.12s ease',
              }}
            >
              <Plus size={13} />
              <span>创建配对实验</span>
            </button>
          </div>

          {activeTab === 'list' && (
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
                  placeholder="搜索实验名称或假设…"
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
                  <option value="all">全部状态 ({expList.length})</option>
                  <option value="completed">已评估完成</option>
                  <option value="evaluating">正在计算</option>
                  <option value="pending">待评估</option>
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
        </div>

        {/* ========================================================= */}
        {/* Tab 1: Experiments List & Evaluation View                 */}
        {/* ========================================================= */}
        {activeTab === 'list' && (
          <div>
            <ResourceState
              resource={experiments}
              empty={!filteredExperiments.length}
              emptyMessage={search || statusFilter !== 'all' ? '未找到符合条件的实验方案' : '暂无实验方案，点击上方创建'}
            />

            {filteredExperiments.length > 0 && (
              <div style={{ padding: '16px', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {filteredExperiments.map((e) => {
                  const isDone = e.status === 'completed' || e.status === 'statistically_significant';
                  const isEvaluating = e.status === 'evaluating';

                  return (
                    <article
                      key={e.id}
                      style={{
                        padding: '18px 20px',
                        borderRadius: '12px',
                        border: '1px solid #e2e8f0',
                        borderLeft: `5px solid ${isDone ? '#059669' : isEvaluating ? '#2563eb' : '#d97706'}`,
                        background: '#ffffff',
                        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: '10px',
                          marginBottom: '8px',
                        }}
                      >
                        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                          {e.title}
                        </h3>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '2px 8px',
                              borderRadius: '5px',
                              fontSize: '11.5px',
                              fontWeight: 600,
                              background: isDone ? '#ecfdf5' : isEvaluating ? '#eff6ff' : '#fffbeb',
                              border: `1px solid ${isDone ? '#a7f3d0' : isEvaluating ? '#bfdbfe' : '#fde68a'}`,
                              color: isDone ? '#047857' : isEvaluating ? '#1d4ed8' : '#b45309',
                            }}
                          >
                            {isDone ? <CheckCircle2 size={12} /> : isEvaluating ? <Clock size={12} /> : <Clock size={12} />}
                            <span>{isDone ? '评估已完成' : isEvaluating ? '正在计算' : '待评估'}</span>
                          </span>

                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              padding: '2px 8px',
                              borderRadius: '5px',
                              fontSize: '11.5px',
                              fontWeight: 600,
                              background: '#f1f5f9',
                              color: '#475467',
                            }}
                          >
                            配对样本：{e.sample_size ?? 0} 对
                          </span>
                        </div>
                      </div>

                      <div style={{ fontSize: '13px', color: '#475467', lineHeight: 1.5, marginBottom: '12px' }}>
                        💡 <b>假设与干预说明：</b> {e.hypothesis}
                      </div>

                      {e.evaluation && (
                        <div
                          style={{
                            padding: '12px 14px',
                            background: '#0f172a',
                            borderRadius: '8px',
                            color: '#f8fafc',
                            fontSize: '12px',
                            fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                            lineHeight: 1.55,
                            overflowX: 'auto',
                          }}
                        >
                          <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px', fontWeight: 700 }}>
                            📊 统计检验差异报告 (Statistical Significance Report)
                          </div>
                          <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{e.evaluation}</pre>
                        </div>
                      )}
                    </article>
                  );
                })}
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
                显示本页 {filteredExperiments.length} 项 · 共 {expList.length} 项配对实验
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* Tab 2: Create Paired Comparison Experiment Form           */}
        {/* ========================================================= */}
        {activeTab === 'create' && (
          <div style={{ padding: '24px 20px', maxWidth: '720px' }}>
            <h3 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
              创建配对评估实验
            </h3>
            <p style={{ margin: '0 0 18px', fontSize: '12.5px', color: '#64748b' }}>
              基于已完成的历史批次设立严格的对照组（Baseline）与实验组（Variant），检验干预动作的真实引用排位收益。
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void action.run(async () => {
                  await api.createExperiment({
                    title,
                    hypothesis,
                    baseline_run_id: baseline,
                    variant_run_id: variant,
                    proposed_rule: fact
                      ? {
                          name: title,
                          condition_expr: 'query.intent == "commercial"',
                          action_payload: {
                            fact_id: fact,
                          },
                        }
                      : undefined,
                  });
                  setTitle('');
                  setHypothesis('');
                  setBaseline('');
                  setVariant('');
                  setFact('');
                  setActiveTab('list');
                }, '实验方案已成功保存');
              }}
              style={{ display: 'grid', gap: '14px' }}
            >
              <div>
                <label
                  htmlFor="exp-title-input"
                  style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#475467', marginBottom: '5px' }}
                >
                  实验名称
                </label>
                <input
                  id="exp-title-input"
                  className="field"
                  required
                  maxLength={255}
                  placeholder="例如：补充资质认证对武汉家政词提及率的对照评估"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  style={{ width: '100%', minHeight: '38px', fontSize: '13px' }}
                />
              </div>

              <div>
                <label
                  htmlFor="exp-hypo-input"
                  style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#475467', marginBottom: '5px' }}
                >
                  假设与干预说明
                </label>
                <textarea
                  id="exp-hypo-input"
                  className="field"
                  required
                  style={{ width: '100%', minHeight: '90px', padding: '10px', fontSize: '13px', lineHeight: 1.5 }}
                  placeholder="陈述具体干预点（如新增表格化价格）及预期效果..."
                  value={hypothesis}
                  onChange={(e) => setHypothesis(e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label
                    htmlFor="exp-baseline-select"
                    style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#475467', marginBottom: '5px' }}
                  >
                    基线批次 (Baseline)
                  </label>
                  <select
                    id="exp-baseline-select"
                    className="select"
                    required
                    style={{ width: '100%', minHeight: '38px', fontSize: '13px' }}
                    value={baseline}
                    onChange={(e) => setBaseline(e.target.value)}
                  >
                    <option value="">选择已完成基线批次…</option>
                    {completedRuns.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.id.slice(0, 16)}… ({r.success_count} 题)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="exp-variant-select"
                    style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#475467', marginBottom: '5px' }}
                  >
                    对比批次 (Variant)
                  </label>
                  <select
                    id="exp-variant-select"
                    className="select"
                    required
                    style={{ width: '100%', minHeight: '38px', fontSize: '13px' }}
                    value={variant}
                    onChange={(e) => setVariant(e.target.value)}
                  >
                    <option value="">选择已完成对比批次…</option>
                    {completedRuns.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.id.slice(0, 16)}… ({r.success_count} 题)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="exp-fact-select"
                  style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#475467', marginBottom: '5px' }}
                >
                  胜出时沉淀的已核准事实 (选填，自动沉淀候选规则)
                </label>
                <select
                  id="exp-fact-select"
                  className="select"
                  style={{ width: '100%', minHeight: '38px', fontSize: '13px' }}
                  value={fact}
                  onChange={(e) => setFact(e.target.value)}
                >
                  <option value="">仅评估数据，不自动生成规则</option>
                  {factItems.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.statement.slice(0, 42)}…
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                <PermissionButton
                  type="submit"
                  className="btn primary"
                  disabled={action.busy || !baseline || baseline === variant}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  创建评估方案
                </PermissionButton>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setActiveTab('list')}
                >
                  取消
                </button>
              </div>
            </form>
          </div>
        )}
      </article>
    </Page>
  );
}

export default ExperimentsView;
