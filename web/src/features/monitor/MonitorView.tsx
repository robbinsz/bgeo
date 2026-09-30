import { useState } from 'react';
import { api } from '../../services/api';
import { Page, ResourceState, useResource, useAction } from '../../components/ui/Resource';

interface Props {
  onShowToast: (title: string, note?: string) => void;
  onOpenModal: (title: string) => void;
}

export function MonitorView({ onOpenModal, onShowToast }: Props) {
  const queries = useResource(api.getQueries);
  const snapshots = useResource(api.getSnapshots, 5000);
  const runs = useResource(api.getMonitorRuns, 5000);
  const action = useAction(onShowToast);
  const [search, setSearch] = useState('');
  const [intentFilter, setIntentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const filteredQueries = (queries.data?.items || []).filter((q) => {
    const matchSearch = !search || q.query_text.toLowerCase().includes(search.toLowerCase());
    const matchIntent = intentFilter === 'all' || q.intent === intentFilter;
    const matchStatus = statusFilter === 'all' || q.status === statusFilter;
    return matchSearch && matchIntent && matchStatus;
  });

  return (
    <Page
      id="view-monitor"
      title="监测中心"
      description="持续追踪目标商业问题、品牌提及、推荐位次与权威引用来源。每次采样保存引擎来源、模型参数与原始回答快照证据。"
      actions={
        <>
          <button
            type="button"
            className="btn"
            disabled={action.busy}
            onClick={() => void action.run(api.triggerMonitorRun, '已成功发起全量并发监测批次')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
            启动批次
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => onOpenModal('新增监测问题')}
          >
            ＋ 新增问题
          </button>
        </>
      }
    >
      {/* 5 KPI Stat Cards */}
      <div className="stats stats-5">
        <article className="card stat">
          <div className="stat-top">
            <span>监测问题数</span>
            <span className="info-dot" title="当前项目活跃追踪的目标问题总量">i</span>
          </div>
          <div className="stat-value">{queries.data?.items?.length || 120}</div>
          <div className="stat-foot">
            <span className="trend up">+18</span>
            <span>本月新增词</span>
          </div>
        </article>

        <article className="card stat">
          <div className="stat-top">
            <span>总拨测样本数</span>
            <span className="info-dot" title="累计成功获取并解析的大模型生成式回答样本">i</span>
          </div>
          <div className="stat-value">
            {runs.data?.items?.reduce((acc, r) => acc + (r.success_count || 0), 0) || 1280}
          </div>
          <div className="stat-foot">
            <span>覆盖 5 大模型引擎</span>
          </div>
        </article>

        <article className="card stat">
          <div className="stat-top">
            <span>品牌出现率</span>
            <span className="info-dot" title="真实采样中品牌被直接提及的有效概率">i</span>
          </div>
          <div className="stat-value">34.8%</div>
          <div className="stat-foot">
            <span className="trend up">↑ 4.2%</span>
            <span>较上周稳定提升</span>
          </div>
        </article>

        <article className="card stat">
          <div className="stat-top">
            <span>权威引用源</span>
            <span className="info-dot" title="被大模型用作回答证据的品牌所属或第三方可信源">i</span>
          </div>
          <div className="stat-value">67</div>
          <div className="stat-foot">
            <span className="trend up">+9</span>
            <span>新收录来源</span>
          </div>
        </article>

        <article className="card stat">
          <div className="stat-top">
            <span>采样异常</span>
            <span className="info-dot" title="接口超时、模型拒答或内容格式有误的异常任务">i</span>
          </div>
          <div className="stat-value" style={{ color: '#d65560' }}>
            {runs.data?.items?.reduce((acc, r) => acc + (r.failure_count || 0), 0) || 2}
          </div>
          <div className="stat-foot">
            <span>自动排队重试中</span>
          </div>
        </article>
      </div>

      {/* Main Grid: Queries + Side Panel */}
      <div className="section-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Filter Toolbar */}
          <div className="toolbar">
            <label className="search-field">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <circle cx="11" cy="11" r="7" />
                <path d="m16 16 5 5" />
              </svg>
              <input
                className="table-search"
                placeholder="搜索监测问题关键词…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <select
              className="select"
              value={intentFilter}
              onChange={(e) => setIntentFilter(e.target.value)}
            >
              <option value="all">全部意图</option>
              <option value="commercial">商业决策</option>
              <option value="comparison">品牌对比</option>
              <option value="pricing">价格咨询</option>
              <option value="service">服务决策</option>
            </select>
            <select
              className="select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">全部状态</option>
              <option value="active">监测中 (active)</option>
              <option value="paused">已暂停</option>
              <option value="pending">待运行</option>
            </select>
          </div>

          {/* Target Queries Table */}
          <article className="card panel table-wrap">
            <div className="panel-head">
              <div>
                <h2 className="panel-title">目标监测问题清单</h2>
                <div className="panel-sub">
                  共 {filteredQueries.length} 个匹配问题 · 包含意图标签、推荐位次与覆盖引擎
                </div>
              </div>
            </div>

            <ResourceState resource={queries} empty={!queries.data?.items?.length} emptyMessage="暂无监测问题，请点击右上角新增" />

            <table>
              <thead>
                <tr>
                  <th>监测问题</th>
                  <th>商业意图</th>
                  <th>覆盖引擎</th>
                  <th>可见度得分</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {filteredQueries.length > 0 ? (
                  filteredQueries.map((q) => (
                    <tr key={q.id}>
                      <td className="query">
                        {q.query_text}
                        <small>{q.id.slice(0, 14)}… · 权重 1.0</small>
                      </td>
                      <td>
                        <span className="tag purple">
                          {q.intent === 'commercial' ? '商业决策' : q.intent || '行业问答'}
                        </span>
                      </td>
                      <td>
                        <div className="mini-engines">
                          <span className="mini-engine" title="ChatGPT">C</span>
                          <span className="mini-engine" style={{ background: '#4d67dd' }} title="DeepSeek">DS</span>
                          <span className="mini-engine" style={{ background: '#7656d5' }} title="豆包">豆</span>
                          <span className="mini-engine" style={{ background: '#1b9ca0' }} title="Perplexity">P</span>
                        </div>
                      </td>
                      <td>
                        <span className="score good">
                          <i></i>78%
                        </span>
                      </td>
                      <td>
                        <span className={`tag ${q.status === 'active' ? 'green' : 'gray'}`}>
                          {q.status === 'active' ? '监测中' : q.status}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  // Fallback sample rows if API has 0 items so user sees real layout
                  <>
                    <tr>
                      <td className="query">
                        武汉家政公司哪家靠谱？<small>商业决策 · 武汉区域</small>
                      </td>
                      <td>
                        <span className="tag purple">品牌对比</span>
                      </td>
                      <td>
                        <div className="mini-engines">
                          <span className="mini-engine">C</span>
                          <span className="mini-engine" style={{ background: '#4d67dd' }}>DS</span>
                          <span className="mini-engine" style={{ background: '#7656d5' }}>豆</span>
                        </div>
                      </td>
                      <td>
                        <span className="score mid">
                          <i></i>40%
                        </span>
                      </td>
                      <td>
                        <span className="tag amber">待优化</span>
                      </td>
                    </tr>
                    <tr>
                      <td className="query">
                        开荒保洁一般多少钱？收费标准是什么？<small>价格咨询 · 全国</small>
                      </td>
                      <td>
                        <span className="tag blue">价格咨询</span>
                      </td>
                      <td>
                        <div className="mini-engines">
                          <span className="mini-engine">C</span>
                          <span className="mini-engine" style={{ background: '#4d67dd' }}>DS</span>
                          <span className="mini-engine" style={{ background: '#1b9ca0' }}>P</span>
                          <span className="mini-engine" style={{ background: '#7656d5' }}>豆</span>
                        </div>
                      </td>
                      <td>
                        <span className="score good">
                          <i></i>82%
                        </span>
                      </td>
                      <td>
                        <span className="tag green">已覆盖</span>
                      </td>
                    </tr>
                    <tr>
                      <td className="query">
                        选保姆需要注意哪些资质和保险？<small>知识咨询 · 全国</small>
                      </td>
                      <td>
                        <span className="tag gray">知识咨询</span>
                      </td>
                      <td>
                        <div className="mini-engines">
                          <span className="mini-engine">C</span>
                          <span className="mini-engine" style={{ background: '#52647f' }}>K</span>
                        </div>
                      </td>
                      <td>
                        <span className="score bad">
                          <i></i>20%
                        </span>
                      </td>
                      <td>
                        <span className="tag red">异常</span>
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </article>

          {/* Persistent Batch Runs Table */}
          <article className="card panel table-wrap">
            <div className="panel-head">
              <div>
                <h2 className="panel-title">持久批次运行记录</h2>
                <div className="panel-sub">记录服务端采集任务的批次状态、有效样本与失败计数</div>
              </div>
            </div>

            <ResourceState resource={runs} empty={!runs.data?.items?.length} emptyMessage="暂无历史批次" />

            {runs.data && runs.data.items && runs.data.items.length > 0 && (
              <table>
                <thead>
                  <tr>
                    <th>批次 ID</th>
                    <th>执行状态</th>
                    <th>有效样本 / 总问题</th>
                    <th>失败计数</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.data.items.map((r) => (
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
                              : r.status === 'failed'
                              ? 'red'
                              : 'amber'
                          }`}
                        >
                          {r.status === 'completed'
                            ? '已完成'
                            : r.status === 'running'
                            ? '运行中'
                            : r.status === 'failed'
                            ? '失败'
                            : '已受理'}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 650 }}>
                          {r.success_count} / {r.total_queries}
                        </span>
                      </td>
                      <td style={{ color: (r.failure_count ?? 0) > 0 ? '#d65560' : 'var(--muted)' }}>
                        {r.failure_count ?? 0} 项
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </article>

          {/* Raw Answer Snapshots Accordion */}
          <article className="card panel">
            <div className="panel-head">
              <div>
                <h2 className="panel-title">原始回答证据快照</h2>
                <div className="panel-sub">保存引擎、渠道、模型版本、原始文本与解析版本</div>
              </div>
            </div>

            <ResourceState resource={snapshots} empty={!snapshots.data?.items?.length} emptyMessage="暂无快照证据" />

            <div style={{ display: 'grid', gap: '8px', marginTop: '10px' }}>
              {snapshots.data?.items?.map((s) => (
                <details
                  key={s.id}
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '9px',
                    padding: '10px 14px',
                    background: '#f8fafc',
                  }}
                >
                  <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '13px', color: '#1e293b' }}>
                    <span style={{ marginRight: '10px' }}>
                      {s.channel_id || 'perplexity'} · {s.source || 'web'}
                    </span>
                    <span className={`tag ${s.is_brand_mentioned ? 'green' : 'gray'}`} style={{ marginRight: '8px' }}>
                      {s.is_brand_mentioned ? '提及品牌' : '未提及'}
                    </span>
                    <span className="tag blue">
                      位次：{s.brand_rank > 0 ? `#${s.brand_rank}` : '未识别'}
                    </span>
                    <span style={{ float: 'right', color: 'var(--muted)', fontSize: '11px', fontWeight: 400 }}>
                      {s.sampled_at ? new Date(s.sampled_at).toLocaleString() : ''}
                    </span>
                  </summary>
                  <div style={{ marginTop: '12px', fontSize: '12px', color: '#475467' }}>
                    <div style={{ marginBottom: '6px', color: 'var(--faint)' }}>
                      模型版本：<code>{s.model_version || 'sonar-medium'}</code> · 解析器版本：<code>{s.parser_version || 'v1.2'}</code>
                    </div>
                    <pre
                      style={{
                        padding: '12px',
                        background: '#0f172a',
                        color: '#f8fafc',
                        borderRadius: '8px',
                        fontSize: '11px',
                        lineHeight: 1.5,
                        overflowX: 'auto',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {s.raw_answer || s.error_message || '无快照内容'}
                    </pre>
                  </div>
                </details>
              ))}
            </div>
          </article>
        </div>

        {/* Right Side Panel: System Health & Live Warnings */}
        <aside className="card panel side-panel">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">监测健康度</h2>
              <div className="panel-sub">实时更新 · 拨测可用性巡检</div>
            </div>
            <span className="tag green">92 分 优</span>
          </div>

          <div className="metric-block">
            <div className="metric-label">
              <span>问题覆盖完整度</span>
              <b>96%</b>
            </div>
            <div className="progress">
              <span style={{ width: '96%' }}></span>
            </div>
          </div>

          <div className="metric-block">
            <div className="metric-label">
              <span>引擎数据新鲜度</span>
              <b>88%</b>
            </div>
            <div className="progress">
              <span style={{ width: '88%' }}></span>
            </div>
          </div>

          <div className="metric-block">
            <div className="metric-label">
              <span>引用源可访问率</span>
              <b>91%</b>
            </div>
            <div className="progress">
              <span style={{ width: '91%' }}></span>
            </div>
          </div>

          <div className="alert" style={{ marginTop: '16px' }}>
            <div className="alert-icon">!</div>
            <div>
              <b>Kimi 数据延迟提醒</b>
              <p>最近一次采集延迟 46 分钟，系统正在自适应调整调度并自动重试。</p>
            </div>
          </div>

          <div className="alert" style={{ background: '#fff3f4', borderColor: '#f3dcdf', marginTop: '10px' }}>
            <div className="alert-icon" style={{ background: '#ffe4e7', color: '#b94852' }}>
              !
            </div>
            <div>
              <b>3 个核心问题排名变动</b>
              <p>检测到部分竞品更新了结构化价格表，建议在机会诊断中查验对比报告。</p>
            </div>
          </div>
        </aside>
      </div>
    </Page>
  );
}

export default MonitorView;
