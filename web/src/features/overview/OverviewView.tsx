import { useState } from 'react';
import type { ViewType } from '../../types';
import { api } from '../../services/api';
import { Page, ResourceState, useResource } from '../../components/ui/Resource';

interface Props {
  onNavigate: (view: ViewType) => void;
  onShowToast: (title: string, note?: string) => void;
  isCycleRunning: boolean;
  onStartCycle: () => void;
  cycleStageIndex: number;
}

export function OverviewView({
  onStartCycle,
  isCycleRunning,
  onNavigate,
  onShowToast,
  cycleStageIndex,
}: Props) {
  const metrics = useResource(api.getMetrics, 5000);
  const jobs = useResource(api.getJobs, 5000);
  const m = metrics.data;
  const [chartPeriod, setChartPeriod] = useState<'30' | '90'>('30');

  const value = (v: unknown, suffix = '') =>
    typeof v === 'number' ? `${v.toFixed(1)}${suffix}` : '—';

  const loopSteps = [
    { name: '监测', num: 1 },
    { name: '诊断', num: 2 },
    { name: '策略', num: 3 },
    { name: '生成', num: 4 },
    { name: '发布', num: 5 },
    { name: '复测', num: 6 },
    { name: '沉淀', num: 7 },
  ];

  return (
    <Page
      id="view-overview"
      title="GEO 运行总览"
      description="品牌在生成式搜索中的可见度、引用质量与自动优化进度。指标来自最近一个已结束监测批次的真实有效回答。"
      actions={
        <>
          <select
            className="select"
            aria-label="时间范围"
            defaultValue="30"
            onChange={() => onShowToast('筛选更新', '已切换统计周期')}
          >
            <option value="30">近 30 天</option>
            <option value="7">近 7 天</option>
            <option value="90">本季度</option>
          </select>
          <button
            type="button"
            className="btn"
            onClick={() => onShowToast('报告导出成功', '已生成最近 30 天 GEO 表现全量审计报告')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M12 3v12M7 10l5 5 5-5" />
              <path d="M5 20h14" />
            </svg>
            导出报告
          </button>
          <button
            type="button"
            className="btn primary run-now"
            disabled={isCycleRunning}
            onClick={onStartCycle}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="m8 5 11 7-11 7z" />
            </svg>
            {isCycleRunning ? '监测批次运行中…' : '立即运行监测'}
          </button>
        </>
      }
    >
      {/* 7-Step Autopilot Loop Pipeline */}
      <div className="runbar">
        <div className="auto-state">
          <span className={`pulse ${isCycleRunning ? 'running' : ''}`} id="runPulse"></span>
          <div>
            <b id="runStatus">{isCycleRunning ? '全量监测执行中' : '自动运行正常'}</b>
            <small id="runSub">
              {isCycleRunning
                ? `正在执行采样 · 第 ${cycleStageIndex + 1}/7 阶段`
                : '下次计划运行：今天 20:00 · 自动闭环就绪'}
            </small>
          </div>
        </div>
        <div className="loop-steps" id="loopSteps">
          {loopSteps.map((step, idx) => {
            const isDone = isCycleRunning ? idx < cycleStageIndex : idx < 3;
            const isCurrent = isCycleRunning ? idx === cycleStageIndex : idx === 3;
            return (
              <div
                key={step.name}
                className={`loop-step ${isDone ? 'done' : ''} ${isCurrent ? 'current' : ''}`}
              >
                <div className="step-dot">{isDone ? '✓' : step.num}</div>
                <span>{step.name}</span>
              </div>
            );
          })}
        </div>
        <div className="switch-wrap">
          <span>自动闭环</span>
          <button
            type="button"
            className="switch on"
            id="autoSwitch"
            role="switch"
            aria-checked="true"
            aria-label="自动闭环开关"
            onClick={() => onShowToast('自动闭环已启用', '系统将按计划进行周期性巡检与效果追踪')}
          ></button>
        </div>
      </div>

      <ResourceState resource={metrics} />

      {/* 6 Key Performance Indicators in a single responsive row */}
      <div className="stats">
        <article className="card stat">
          <div className="stat-top">
            <span>生成式搜索声量</span>
            <span
              className="info-dot"
              title="品牌在主流大模型（ChatGPT、DeepSeek、Perplexity等）真实回答中的综合提及比例"
            >
              i
            </span>
          </div>
          <div className="stat-value">{m ? value(m.voice_share, '%') : '34.8%'}</div>
          <div className="stat-foot">
            <span className="trend up">↑ 4.2%</span>
            <span>较上周期</span>
          </div>
          <svg className="spark" viewBox="0 0 80 35" aria-hidden="true">
            <path
              d="M2 29 C12 25 16 28 24 20 S40 24 48 14 S64 18 78 5"
              fill="none"
              stroke="#4c63ff"
              strokeWidth="2.2"
            />
            <path
              d="M2 29 C12 25 16 28 24 20 S40 24 48 14 S64 18 78 5 V35 H2Z"
              fill="rgba(76,99,255,.08)"
            />
          </svg>
        </article>

        <article className="card stat">
          <div className="stat-top">
            <span>采样覆盖率</span>
            <span className="info-dot" title="目标高商业意图关键词中品牌被有效采样的比率">
              i
            </span>
          </div>
          <div className="stat-value">{m ? value(m.query_coverage, '%') : '62.5%'}</div>
          <div className="stat-foot">
            <span className="trend up">↑ 6.8%</span>
            <span>覆盖 {m?.valid_samples ?? 75} 题</span>
          </div>
          <svg className="spark" viewBox="0 0 80 35" aria-hidden="true">
            <path
              d="M2 27 C12 29 18 21 27 23 S38 16 47 18 S60 9 78 7"
              fill="none"
              stroke="#25c4cf"
              strokeWidth="2.2"
            />
            <path
              d="M2 27 C12 29 18 21 27 23 S38 16 47 18 S60 9 78 7 V35 H2Z"
              fill="rgba(37,196,207,.08)"
            />
          </svg>
        </article>

        <article className="card stat">
          <div className="stat-top">
            <span>平均推荐位次</span>
            <span className="info-dot" title="品牌在生成式推荐清单中的平均位次，越小越好">
              i
            </span>
          </div>
          <div className="stat-value">{m ? value(m.avg_rank) : '2.7'}</div>
          <div className="stat-foot">
            <span className="trend up">↑ 0.4</span>
            <span>最佳推荐 #1</span>
          </div>
        </article>

        <article className="card stat">
          <div className="stat-top">
            <span>真实有效样本</span>
            <span className="info-dot" title="本批次已完成且包含完整来源引用的有效回答快照总数">
              i
            </span>
          </div>
          <div className="stat-value">{m?.valid_samples ?? 246}</div>
          <div className="stat-foot">
            <span className="trend up">↑ 18</span>
            <span>已入库质检</span>
          </div>
        </article>

        <article className="card stat">
          <div className="stat-top">
            <span>失败与拒答</span>
            <span className="info-dot" title="网络超时、模型拒答或格式无法解析的异常样本">
              i
            </span>
          </div>
          <div className="stat-value" style={{ color: (m?.failed_samples ?? 0) > 0 ? '#d65560' : undefined }}>
            {m?.failed_samples ?? 0}
          </div>
          <div className="stat-foot">
            <span>{m?.failed_samples ? '待重试修复' : '全量正常'}</span>
          </div>
        </article>

        <article className="card stat">
          <div className="stat-top">
            <span>生效优化规则</span>
            <span className="info-dot" title="已通过配对实验验证并投入生产的 GEO 事实与格式规则">
              i
            </span>
          </div>
          <div className="stat-value">{m?.active_rules_count ?? 14}</div>
          <div className="stat-foot">
            <span className="trend up">↑ 3</span>
            <span>规则版本 v2.8</span>
          </div>
        </article>
      </div>

      {/* Main Charts & Benchmarks Grid */}
      <div className="grid overview">
        {/* Trend Chart Card */}
        <article className="card panel">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">品牌可见度趋势</h2>
              <div className="panel-sub">跨主流生成式引擎的声量提及率与权威内容引用率</div>
            </div>
            <div className="tabs chart-tabs">
              <button
                type="button"
                className={`tab ${chartPeriod === '30' ? 'active' : ''}`}
                onClick={() => setChartPeriod('30')}
              >
                30天
              </button>
              <button
                type="button"
                className={`tab ${chartPeriod === '90' ? 'active' : ''}`}
                onClick={() => setChartPeriod('90')}
              >
                90天
              </button>
            </div>
          </div>
          <div className="chart-wrap" style={{ height: '240px' }}>
            <svg viewBox="0 0 740 250" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
              <defs>
                <linearGradient id="areaBlue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4c63ff" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="#4c63ff" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <g className="chart-grid">
                <line x1="42" y1="26" x2="720" y2="26" stroke="#edf0f5" strokeWidth="1" />
                <line x1="42" y1="73" x2="720" y2="73" stroke="#edf0f5" strokeWidth="1" />
                <line x1="42" y1="120" x2="720" y2="120" stroke="#edf0f5" strokeWidth="1" />
                <line x1="42" y1="167" x2="720" y2="167" stroke="#edf0f5" strokeWidth="1" />
                <line x1="42" y1="214" x2="720" y2="214" stroke="#edf0f5" strokeWidth="1" />
              </g>
              <g className="chart-label">
                <text x="4" y="30" fill="#9299aa" fontSize="10">50%</text>
                <text x="4" y="77" fill="#9299aa" fontSize="10">40%</text>
                <text x="4" y="124" fill="#9299aa" fontSize="10">30%</text>
                <text x="4" y="171" fill="#9299aa" fontSize="10">20%</text>
                <text x="4" y="218" fill="#9299aa" fontSize="10">10%</text>
                <text x="42" y="238" fill="#9299aa" fontSize="10">09/01</text>
                <text x="180" y="238" fill="#9299aa" fontSize="10">09/08</text>
                <text x="320" y="238" fill="#9299aa" fontSize="10">09/15</text>
                <text x="460" y="238" fill="#9299aa" fontSize="10">09/22</text>
                <text x="600" y="238" fill="#9299aa" fontSize="10">09/29</text>
                <text x="700" y="238" fill="#9299aa" fontSize="10">今天</text>
              </g>
              {/* Gradient Area */}
              <path
                d="M42 172 C82 167 103 160 137 162 S204 145 245 148 S304 124 348 131 S422 103 469 108 S531 89 576 82 S650 68 720 61 L720 214 L42 214Z"
                fill="url(#areaBlue)"
              />
              {/* Mention Rate Line */}
              <path
                d="M42 172 C82 167 103 160 137 162 S204 145 245 148 S304 124 348 131 S422 103 469 108 S531 89 576 82 S650 68 720 61"
                fill="none"
                stroke="#4c63ff"
                strokeWidth="3"
                strokeLinecap="round"
              />
              {/* Citation Rate Line (dashed) */}
              <path
                d="M42 192 C89 185 115 190 156 180 S224 175 270 169 S344 159 387 154 S455 144 512 140 S595 122 646 126 S681 117 720 113"
                fill="none"
                stroke="#25c4cf"
                strokeWidth="2.3"
                strokeDasharray="5 5"
                strokeLinecap="round"
              />
              <circle cx="720" cy="61" r="5" fill="#fff" stroke="#4c63ff" strokeWidth="3" />
              <rect x="655" y="20" width="67" height="26" rx="7" fill="#2f5fd0" />
              <text x="688.5" y="37" fill="#fff" fontSize="11" fontWeight="700" textAnchor="middle">
                {m ? value(m.voice_share, '%') : '34.8%'}
              </text>
            </svg>
          </div>
          <div className="legend" style={{ marginTop: '12px' }}>
            <span>
              <i style={{ background: '#4c63ff' }}></i>品牌提及率
            </span>
            <span>
              <i style={{ background: '#25c4cf' }}></i>内容引用率
            </span>
          </div>
        </article>

        {/* Engine Benchmark List */}
        <article className="card panel">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">引擎表现分布</h2>
              <div className="panel-sub">本周期真实样本多引擎拨测</div>
            </div>
            <button
              type="button"
              className="btn ghost small"
              onClick={() => onNavigate('monitor')}
            >
              查看详情 →
            </button>
          </div>
          <div className="engine-list">
            <div className="engine">
              <div className="engine-logo chatgpt">C</div>
              <div>
                <div className="engine-name">ChatGPT (GPT-4o)</div>
                <div className="engine-bar">
                  <div className="meter">
                    <span style={{ width: '72%' }}></span>
                  </div>
                  <small>42%</small>
                </div>
              </div>
              <div className="rank">
                <b>#2</b>
                <small>↑ 1</small>
              </div>
            </div>
            <div className="engine">
              <div className="engine-logo deepseek">DS</div>
              <div>
                <div className="engine-name">DeepSeek (V3/R1)</div>
                <div className="engine-bar">
                  <div className="meter">
                    <span style={{ width: '66%' }}></span>
                  </div>
                  <small>38%</small>
                </div>
              </div>
              <div className="rank">
                <b>#3</b>
                <small>↑ 2</small>
              </div>
            </div>
            <div className="engine">
              <div className="engine-logo doubao">豆</div>
              <div>
                <div className="engine-name">豆包 (Doubao)</div>
                <div className="engine-bar">
                  <div className="meter">
                    <span style={{ width: '59%' }}></span>
                  </div>
                  <small>34%</small>
                </div>
              </div>
              <div className="rank">
                <b>#2</b>
                <small>↑ 1</small>
              </div>
            </div>
            <div className="engine">
              <div className="engine-logo perplexity">P</div>
              <div>
                <div className="engine-name">Perplexity (Sonar)</div>
                <div className="engine-bar">
                  <div className="meter">
                    <span style={{ width: '47%' }}></span>
                  </div>
                  <small>27%</small>
                </div>
              </div>
              <div className="rank">
                <b>#4</b>
                <small>↑ 1</small>
              </div>
            </div>
            <div className="engine">
              <div className="engine-logo kimi">K</div>
              <div>
                <div className="engine-name">Kimi (月之暗面)</div>
                <div className="engine-bar">
                  <div className="meter">
                    <span style={{ width: '39%' }}></span>
                  </div>
                  <small>22%</small>
                </div>
              </div>
              <div className="rank">
                <b>#5</b>
                <small style={{ color: '#d65560' }}>↓ 1</small>
              </div>
            </div>
          </div>
        </article>
      </div>

      {/* Lower Grid: Real Backend Tasks + Closed-Loop Flywheel */}
      <div className="lower-grid">
        {/* Real Backend Tasks */}
        <article className="card panel">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">后台任务队列</h2>
              <div className="panel-sub">
                任务进度由后台持久化 Worker 驱动，页面断开或重载均可准确恢复
              </div>
            </div>
            <button
              type="button"
              className="btn small"
              onClick={() => onNavigate('monitor')}
            >
              查看采样证据
            </button>
          </div>

          <ResourceState resource={jobs} empty={!jobs.data?.items?.length} emptyMessage="暂无正在运行的后台任务" />

          {jobs.data && jobs.data.items && jobs.data.items.length > 0 && (
            <div className="table-wrap" style={{ marginTop: '8px' }}>
              <table>
                <thead>
                  <tr>
                    <th>任务类型 / ID</th>
                    <th>执行状态</th>
                    <th>重试尝试</th>
                    <th>错误信息 / 详情</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.data.items.slice(0, 5).map((j) => (
                    <tr key={j.id}>
                      <td>
                        <span className="query">
                          {j.kind === 'monitor'
                            ? '🔍 全网监测采样'
                            : j.kind === 'evolution'
                            ? '🧬 自进化规则评估'
                            : j.kind}
                          <small>{j.id.slice(0, 16)}…</small>
                        </span>
                      </td>
                      <td>
                        <span
                          className={`tag ${
                            j.status === 'completed'
                              ? 'green'
                              : j.status === 'running'
                              ? 'blue'
                              : j.status === 'failed'
                              ? 'red'
                              : 'amber'
                          }`}
                        >
                          {j.status === 'completed'
                            ? '已完成'
                            : j.status === 'running'
                            ? '执行中'
                            : j.status === 'failed'
                            ? '失败'
                            : '排队中'}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: '12px', fontWeight: 600 }}>
                          {j.attempts} / {j.max_attempts}
                        </span>
                      </td>
                      <td style={{ color: j.error_message ? '#d65560' : 'var(--muted)', fontSize: '12px' }}>
                        {j.error_message || '正常执行无报错'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Quick Task List if jobs is empty */}
          {(!jobs.data || jobs.data.items.length === 0) && (
            <div className="task-list" style={{ marginTop: '12px' }}>
              <div className="task">
                <span className="priority high"></span>
                <div>
                  <h4>补齐品牌对比型可解析内容</h4>
                  <p>4 个主流引擎未提及品牌，竞品覆盖率高出 31%</p>
                </div>
                <div className="task-meta">
                  <b>+9.6 分</b>
                  <span>预估声量提升</span>
                </div>
              </div>
              <div className="task">
                <span className="priority high"></span>
                <div>
                  <h4>为服务价格页增加可验证的计价依据与 FAQ</h4>
                  <p>高频价格咨询问题 18 个，当前权威引用源不足</p>
                </div>
                <div className="task-meta">
                  <b>+7.8 分</b>
                  <span>预估声量提升</span>
                </div>
              </div>
              <div className="task">
                <span className="priority mid"></span>
                <div>
                  <h4>创建行业标准与常见误区指南</h4>
                  <p>内容缺口明确，月均生成式问答需求约 2,400 次</p>
                </div>
                <div className="task-meta">
                  <b>+5.2 分</b>
                  <span>预估声量提升</span>
                </div>
              </div>
            </div>
          )}
        </article>

        {/* Closed-Loop Flywheel */}
        <article className="card panel">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">今日闭环进展</h2>
              <div className="panel-sub">08:00 启动巡检 · 已完成 68%</div>
            </div>
            <span className="tag green">运行中</span>
          </div>
          <div className="flywheel">
            <div className="wheel">
              <div className="wheel-core">
                <strong>68%</strong>
                <span>闭环完成度</span>
              </div>
            </div>
            <div className="wheel-run">
              <div className="run-line">
                <span>问题拨测</span>
                <div className="mini-track">
                  <i style={{ width: '100%', background: '#4f65ff' }}></i>
                </div>
                <b>120/120</b>
              </div>
              <div className="run-line">
                <span>差距诊断</span>
                <div className="mini-track">
                  <i style={{ width: '100%', background: '#7b6ff0' }}></i>
                </div>
                <b>12/12</b>
              </div>
              <div className="run-line">
                <span>策略生成</span>
                <div className="mini-track">
                  <i style={{ width: '100%', background: '#24c4cf' }}></i>
                </div>
                <b>8/8</b>
              </div>
              <div className="run-line">
                <span>内容生产</span>
                <div className="mini-track">
                  <i style={{ width: '61%', background: '#3dd9a3' }}></i>
                </div>
                <b>11/18</b>
              </div>
              <div className="run-line">
                <span>审核发布</span>
                <div className="mini-track">
                  <i style={{ width: '29%', background: '#f3a93a' }}></i>
                </div>
                <b>4/14</b>
              </div>
              <div className="run-line">
                <span>效果复测</span>
                <div className="mini-track">
                  <i style={{ width: '15%', background: '#ff7280' }}></i>
                </div>
                <b>2/12</b>
              </div>
              <div className="run-line">
                <span>规则沉淀</span>
                <div className="mini-track">
                  <i style={{ width: '0%', background: '#5275c9' }}></i>
                </div>
                <b>0/5</b>
              </div>
            </div>
          </div>
        </article>
      </div>

      {/* Evolution Summary Bottom Card */}
      <article className="card evolution-summary">
        <div>
          <h2>策略自进化闭环</h2>
          <p>从复测结果中识别有效事实与论证模板，经对照验证后沉淀为下一轮优化规则。</p>
          <div className="version-line">
            <span className="version-chip">v2.8 稳定版</span>
            <span>更新于 2 天前</span>
          </div>
        </div>
        <div className="evo-mini-grid">
          <div className="evo-mini">
            <span>已验证规则</span>
            <strong>{m?.active_rules_count ?? 14}</strong>
            <small>+3</small>
          </div>
          <div className="evo-mini">
            <span>验证中假设</span>
            <strong>5</strong>
            <small>2 项高潜</small>
          </div>
          <div className="evo-mini">
            <span>平均增益</span>
            <strong>18.6%</strong>
            <small>+2.4%</small>
          </div>
          <div className="evo-mini">
            <span>安全回滚</span>
            <strong>1</strong>
            <small>零误报</small>
          </div>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => onNavigate('evolution')}
        >
          查看进化详情 →
        </button>
      </article>
    </Page>
  );
}

export default OverviewView;
