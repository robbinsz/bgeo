import { useState, useMemo } from 'react';
import { PermissionButton } from '../../components/ui/Permissions';
import type { ViewType } from '../../types';
import { api, type Job } from '../../services/api';
import { Page, ResourceState } from '../../components/ui/Resource';
import { useResource } from '../../hooks/useResource';
import {
  Award,
  Target,
  Trophy,
  Zap,
  Download,
  Play,
  RotateCcw,
  Activity,
  Sliders,
  Layers,
  FileText,
  FlaskConical,
  Dna,
  Radio,
  Search,
  CheckCircle2,
  AlertTriangle,
  Compass,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

interface Props {
  onNavigate: (view: ViewType) => void;
  onShowToast: (title: string, note?: string) => void;
  isCycleRunning: boolean;
  onStartCycle: () => void;
  cycleStageIndex: number;
}

export function OverviewView({
  onNavigate,
  onShowToast,
  onStartCycle,
  isCycleRunning,
}: Props) {
  const metrics = useResource(api.getMetrics, 5000);
  const jobs = useResource(api.getJobs, 5000);
  const project = useResource(api.getProject);
  const schedule = useResource(api.getSchedule);

  const [activeTab, setActiveTab] = useState<'pipeline' | 'jobs' | 'metrics'>('pipeline');
  const [jobSearch, setJobSearch] = useState('');
  const [jobStatusFilter, setJobStatusFilter] = useState('all');

  const m = metrics.data;
  const value = (n: number | null | undefined, suffix = '') =>
    n == null ? '—' : `${n.toFixed(1)}${suffix}`;

  const exportReport = () => {
    if (!m) return;
    try {
      const url = URL.createObjectURL(
        new Blob(
          [
            JSON.stringify(
              {
                project: project.data,
                metrics: m,
                jobs: jobs.data?.items,
                exported_at: new Date().toISOString(),
              },
              null,
              2,
            ),
          ],
          { type: 'application/json' },
        ),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = 'geo-report.json';
      a.click();
      URL.revokeObjectURL(url);
      onShowToast('数据导出成功', '已生成 geo-report.json 运营报告');
    } catch (err: any) {
      onShowToast('导出失败', err.message);
    }
  };

  // Jobs filtering
  const jobList: Job[] = jobs.data?.items || [];
  const filteredJobs = useMemo(() => {
    return jobList.filter((j) => {
      if (jobStatusFilter !== 'all' && j.status !== jobStatusFilter) return false;
      if (jobSearch.trim()) {
        const q = jobSearch.toLowerCase();
        const matchKind = j.kind?.toLowerCase().includes(q);
        const matchId = j.id?.toLowerCase().includes(q);
        const matchErr = j.error_message?.toLowerCase().includes(q);
        if (!matchKind && !matchId && !matchErr) return false;
      }
      return true;
    });
  }, [jobList, jobStatusFilter, jobSearch]);

  const runningJobsCount = jobList.filter((j) => j.status === 'running').length;
  const queuedJobsCount = jobList.filter((j) => j.status === 'queued').length;
  const failedJobsCount = jobList.filter((j) => j.status === 'failed').length;

  // Pipeline navigation items
  const pipelineModules: {
    id: ViewType;
    step: string;
    title: string;
    desc: string;
    icon: typeof Radio;
    accent: string;
    bg: string;
  }[] = [
    {
      id: 'monitor',
      step: '01 监测',
      title: '监测样本采集',
      desc: '跨主流大模型（DeepSeek、通义千问、Kimi 等）全渠道实时拨测，抓取真实回答快照',
      icon: Radio,
      accent: '#2563eb',
      bg: '#eff6ff',
    },
    {
      id: 'diagnosis',
      step: '02 诊断',
      title: '机会识别诊断',
      desc: '自动对比品牌声量与竞品拦截差距，量化商业意图认知空缺并生成优化机会',
      icon: Target,
      accent: '#7c3aed',
      bg: '#faf5ff',
    },
    {
      id: 'strategy',
      step: '03 策略',
      title: '策略智能编排',
      desc: '4 阶段闭环策略流水线看板，把控高风险变更、分配协同责任人与复测归因',
      icon: Compass,
      accent: '#0891b2',
      bg: '#ecfeff',
    },
    {
      id: 'content',
      step: '04 内容',
      title: '内容工厂与资产',
      desc: '客观权威事实库注入与双锁合规扫描，生产可信、高引用率的结构化品牌内容',
      icon: FileText,
      accent: '#059669',
      bg: '#ecfdf5',
    },
    {
      id: 'publish',
      step: '05 发布',
      title: '发布与渠道分发',
      desc: 'Webhook 渠道幂等保障投递，全流程人工签字审批与异步真实回执核对对账',
      icon: Layers,
      accent: '#d97706',
      bg: '#fffbeb',
    },
    {
      id: 'experiments',
      step: '06 实验',
      title: '配对实验中心',
      desc: '严格 1:1 双样本对照组设计，95% 置信度与卡方显著性检验杜绝相关性误判',
      icon: FlaskConical,
      accent: '#e11d48',
      bg: '#fff1f2',
    },
    {
      id: 'evolution',
      step: '07 进化',
      title: '规则自进化中心',
      desc: '基于真实增益沉淀系统提示词规则，双锁审批门槛与自动回滚保护机制',
      icon: Dna,
      accent: '#4f46e5',
      bg: '#eef2ff',
    },
  ];

  return (
    <Page
      id="view-overview"
      title="GEO 运行总览"
      description="最近一个已结束监测批次的有效回答与全流程自进化闭环。没有有效样本时，比例与排名显示为未知。"
      actions={
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            className="btn"
            disabled={!m}
            onClick={exportReport}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
              fontSize: '12.5px',
            }}
          >
            <Download size={14} />
            <span>导出当前数据</span>
          </button>
          <PermissionButton
            type="button"
            className="btn primary"
            disabled={isCycleRunning || project.data?.is_paused}
            onClick={onStartCycle}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
              fontSize: '12.5px',
            }}
          >
            {isCycleRunning ? (
              <>
                <RotateCcw size={14} className="spin" />
                <span>监测批次运行中…</span>
              </>
            ) : (
              <>
                <Play size={14} fill="currentColor" />
                <span>立即运行监测</span>
              </>
            )}
          </PermissionButton>
        </div>
      }
    >
      <ResourceState resource={project} />
      <ResourceState resource={metrics} />
      <ResourceState resource={schedule} />

      {/* ========================================================= */}
      {/* 1. Real-time Run Status Bar (运行状态流与治理态势)            */}
      {/* ========================================================= */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          padding: '12px 18px',
          borderRadius: '12px',
          border: project.data?.is_paused
            ? '1px solid #fecaca'
            : isCycleRunning
              ? '1px solid #bfdbfe'
              : '1px solid #e2e8f0',
          background: project.data?.is_paused
            ? '#fef2f2'
            : isCycleRunning
              ? '#eff6ff'
              : '#ffffff',
          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.03)',
          marginBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span
            className={`pulse ${isCycleRunning ? 'running' : ''}`}
            style={{
              backgroundColor: project.data?.is_paused
                ? '#e11d48'
                : isCycleRunning
                  ? '#2563eb'
                  : '#10b981',
            }}
          />
          <div>
            <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a' }}>
              {project.data?.is_paused
                ? '项目后台调度已暂停 (Worker 不接单)'
                : isCycleRunning
                  ? '监测采样作业进行中 (多端点批次推进中)'
                  : '监测引擎就绪 · 待命中'}
            </div>
            <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '1px' }}>
              {schedule.data?.next_run_at
                ? `下次计划执行：${new Date(schedule.data.next_run_at).toLocaleString()} · ${schedule.data.frequency === 'daily' ? '每日巡检' : schedule.data.frequency || '定时拨测'}`
                : '未设置定时调度计划'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              fontSize: '11.5px',
              padding: '3px 8px',
              borderRadius: '6px',
              background: '#f1f5f9',
              color: '#334155',
              fontWeight: 600,
            }}
          >
            治理等级：{project.data?.automation_level || 'L2'}
          </div>
          <button
            type="button"
            className="btn"
            onClick={() => onNavigate('settings')}
            style={{
              fontSize: '12px',
              padding: '5px 12px',
              whiteSpace: 'nowrap',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            <Sliders size={13} />
            <span>管理计划与预算</span>
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 2. Top Executive Metric Cards (4 KPI Cards)                */}
      {/* ========================================================= */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        {/* Card 1: 品牌提及声量 */}
        <div className="card stat" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748b' }}>品牌提及声量</span>
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
              <Award size={17} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: '8px 0 3px', letterSpacing: '-0.02em' }}>
            {value(m?.voice_share, '%')}
          </div>
          <div style={{ fontSize: '11.5px', color: '#64748b' }}>
            有效样本提及占比 · {m?.valid_samples ?? 0} 条有效
          </div>
        </div>

        {/* Card 2: 目标问题覆盖度 */}
        <div className="card stat" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748b' }}>目标问题覆盖度</span>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: '#faf5ff',
                color: '#7c3aed',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Target size={17} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: '8px 0 3px', letterSpacing: '-0.02em' }}>
            {value(m?.query_coverage, '%')}
          </div>
          <div style={{ fontSize: '11.5px', color: '#64748b' }}>
            核心意图词覆盖 · 失败 {m?.failed_samples ?? 0} 条
          </div>
        </div>

        {/* Card 3: 平均推荐位次 */}
        <div className="card stat" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748b' }}>平均推荐位次</span>
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
              <Trophy size={17} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: '8px 0 3px', letterSpacing: '-0.02em' }}>
            {m?.avg_rank != null ? `#${m.avg_rank.toFixed(1)}` : '—'}
          </div>
          <div style={{ fontSize: '11.5px', color: '#64748b' }}>
            首屏关键推荐位 · 权重靠前
          </div>
        </div>

        {/* Card 4: 引用与自进化规则 */}
        <div className="card stat" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748b' }}>权威引用 / 生效规则</span>
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
              <Zap size={17} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: '8px 0 3px', letterSpacing: '-0.02em' }}>
            {m ? `${m.citations_count} 引 / ${m.active_rules_count} 规` : '—'}
          </div>
          <div style={{ fontSize: '11.5px', color: '#64748b' }}>
            真实可信出处与线上生效规则
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 3. Single Unified Card Container (消除割裂感)               */}
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
            justifyContent: 'space-between',
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
              onClick={() => setActiveTab('pipeline')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: activeTab === 'pipeline' ? 700 : 500,
                background: activeTab === 'pipeline' ? '#ffffff' : 'transparent',
                color: activeTab === 'pipeline' ? '#0f172a' : '#64748b',
                boxShadow: activeTab === 'pipeline' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                border: 'none',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              <Sparkles size={15} color={activeTab === 'pipeline' ? '#2563eb' : 'currentColor'} />
              <span>GEO 闭环流程导航</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('jobs')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: activeTab === 'jobs' ? 700 : 500,
                background: activeTab === 'jobs' ? '#ffffff' : 'transparent',
                color: activeTab === 'jobs' ? '#0f172a' : '#64748b',
                boxShadow: activeTab === 'jobs' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                border: 'none',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              <Activity size={15} color={activeTab === 'jobs' ? '#059669' : 'currentColor'} />
              <span>持久任务队列</span>
              {runningJobsCount > 0 && (
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: '4px',
                    background: '#ecfdf5',
                    color: '#059669',
                  }}
                >
                  {runningJobsCount} 进行中
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('metrics')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: activeTab === 'metrics' ? 700 : 500,
                background: activeTab === 'metrics' ? '#ffffff' : 'transparent',
                color: activeTab === 'metrics' ? '#0f172a' : '#64748b',
                boxShadow: activeTab === 'metrics' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                border: 'none',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              <Target size={15} color={activeTab === 'metrics' ? '#7c3aed' : 'currentColor'} />
              <span>监测批次质量剖析</span>
            </button>
          </div>

          <div style={{ fontSize: '12px', color: '#64748b' }}>
            端到端 AI 认知驱动 · 严谨数据驱动
          </div>
        </div>

        {/* Tab 1: GEO 闭环流程导航 (7 核心模块) */}
        {activeTab === 'pipeline' && (
          <div style={{ padding: '24px' }}>
            <div style={{ marginBottom: '18px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>
                Bgeo 企业级 GEO 自主运营全流程闭环
              </h3>
              <p style={{ fontSize: '12.5px', color: '#64748b', margin: 0 }}>
                从全渠道拨测采集，到差距诊断、策略落地、内容生产、分发投递，最终通过配对实验验证驱动规则自进化。点击即可直达对应系统工作台。
              </p>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '14px',
              }}
            >
              {pipelineModules.map((item) => {
                const IconComponent = item.icon;
                return (
                  <div
                    key={item.id}
                    onClick={() => onNavigate(item.id)}
                    style={{
                      padding: '18px 20px',
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      background: '#ffffff',
                      boxShadow: '0 1px 3px rgba(15, 23, 42, 0.02)',
                      cursor: 'pointer',
                      transition: 'all 0.18s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = item.accent;
                      e.currentTarget.style.boxShadow = '0 6px 18px rgba(15, 23, 42, 0.06)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#e2e8f0';
                      e.currentTarget.style.boxShadow = '0 1px 3px rgba(15, 23, 42, 0.02)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: '12px',
                        }}
                      >
                        <div
                          style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '9px',
                            background: item.bg,
                            color: item.accent,
                            display: 'grid',
                            placeItems: 'center',
                          }}
                        >
                          <IconComponent size={18} />
                        </div>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '999px',
                            background: '#f1f5f9',
                            color: '#475467',
                          }}
                        >
                          {item.step}
                        </span>
                      </div>

                      <h4
                        style={{
                          fontSize: '14.5px',
                          fontWeight: 700,
                          color: '#0f172a',
                          margin: '0 0 6px',
                        }}
                      >
                        {item.title}
                      </h4>
                      <p
                        style={{
                          fontSize: '12px',
                          color: '#64748b',
                          margin: 0,
                          lineHeight: 1.5,
                        }}
                      >
                        {item.desc}
                      </p>
                    </div>

                    <div
                      style={{
                        marginTop: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        gap: '4px',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: item.accent,
                      }}
                    >
                      <span>进入模块</span>
                      <ArrowRight size={13} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 2: 持久任务队列 (Jobs) */}
        {activeTab === 'jobs' && (
          <div style={{ padding: '24px' }}>
            {/* Integrated Toolbar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
                marginBottom: '16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 320px' }}>
                <div style={{ position: 'relative', width: '100%', maxWidth: '300px' }}>
                  <Search
                    size={14}
                    style={{
                      position: 'absolute',
                      left: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: '#94a3b8',
                    }}
                  />
                  <input
                    className="field"
                    placeholder="搜索任务类型、ID 或错误…"
                    value={jobSearch}
                    onChange={(e) => setJobSearch(e.target.value)}
                    style={{
                      paddingLeft: '32px',
                      fontSize: '12.5px',
                      width: '100%',
                    }}
                  />
                </div>

                <select
                  className="select"
                  value={jobStatusFilter}
                  onChange={(e) => setJobStatusFilter(e.target.value)}
                  style={{ fontSize: '12.5px', minWidth: '110px' }}
                >
                  <option value="all">全部状态</option>
                  <option value="running">运行中 (running)</option>
                  <option value="queued">排队中 (queued)</option>
                  <option value="completed">已完成 (completed)</option>
                  <option value="failed">执行失败 (failed)</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '6px', fontSize: '12px' }}>
                  <span style={{ padding: '3px 8px', borderRadius: '5px', background: '#f1f5f9', color: '#475467' }}>
                    总计 {jobList.length}
                  </span>
                  {runningJobsCount > 0 && (
                    <span style={{ padding: '3px 8px', borderRadius: '5px', background: '#ecfdf5', color: '#059669', fontWeight: 600 }}>
                      运行中 {runningJobsCount}
                    </span>
                  )}
                  {queuedJobsCount > 0 && (
                    <span style={{ padding: '3px 8px', borderRadius: '5px', background: '#eff6ff', color: '#2563eb', fontWeight: 600 }}>
                      排队中 {queuedJobsCount}
                    </span>
                  )}
                  {failedJobsCount > 0 && (
                    <span style={{ padding: '3px 8px', borderRadius: '5px', background: '#fef2f2', color: '#b91c1c', fontWeight: 600 }}>
                      失败 {failedJobsCount}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  className="btn"
                  onClick={() => void jobs.reload()}
                  style={{
                    fontSize: '12px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <RotateCcw size={13} />
                  <span>刷新队列</span>
                </button>
              </div>
            </div>

            <ResourceState resource={jobs} empty={!jobList.length} emptyMessage="当前暂无排队或执行中的任务" />

            {jobList.length > 0 && (
              <div
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  overflow: 'hidden',
                }}
              >
                <div className="table-wrap">
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                        <th style={{ padding: '10px 14px', fontWeight: 600, color: '#475467' }}>任务类型与 ID</th>
                        <th style={{ padding: '10px 14px', fontWeight: 600, color: '#475467' }}>状态</th>
                        <th style={{ padding: '10px 14px', fontWeight: 600, color: '#475467' }}>尝试轮次</th>
                        <th style={{ padding: '10px 14px', fontWeight: 600, color: '#475467' }}>执行结果 / 错误详情</th>
                        <th style={{ padding: '10px 14px', fontWeight: 600, color: '#475467' }}>创建时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredJobs.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>
                            没有匹配筛选条件的任务
                          </td>
                        </tr>
                      ) : (
                        filteredJobs.map((j) => {
                          const isFailed = j.status === 'failed';
                          const isRunning = j.status === 'running';
                          const isQueued = j.status === 'queued';
                          const isCompleted = j.status === 'completed';

                          const statusBadgeStyle = isFailed
                            ? { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca', label: '执行失败' }
                            : isRunning
                              ? { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe', label: '运行中' }
                              : isQueued
                                ? { bg: '#fffbeb', text: '#b45309', border: '#fde68a', label: '排队中' }
                                : isCompleted
                                  ? { bg: '#ecfdf5', text: '#047857', border: '#a7f3d0', label: '已完成' }
                                  : { bg: '#f1f5f9', text: '#475467', border: '#e2e8f0', label: j.status };

                          return (
                            <tr
                              key={j.id}
                              style={{
                                borderBottom: '1px solid #f1f5f9',
                                transition: 'background-color 0.12s ease',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = '#f8fafc';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent';
                              }}
                            >
                              <td style={{ padding: '12px 14px' }}>
                                <div style={{ fontWeight: 700, color: '#0f172a' }}>{j.kind}</div>
                                <code style={{ fontSize: '11px', color: '#64748b', background: '#f1f5f9', padding: '1px 4px', borderRadius: '4px' }}>
                                  {j.id}
                                </code>
                              </td>
                              <td style={{ padding: '12px 14px' }}>
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    padding: '3px 9px',
                                    borderRadius: '6px',
                                    fontSize: '11.5px',
                                    fontWeight: 600,
                                    background: statusBadgeStyle.bg,
                                    color: statusBadgeStyle.text,
                                    border: `1px solid ${statusBadgeStyle.border}`,
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  <span
                                    style={{
                                      width: '6px',
                                      height: '6px',
                                      borderRadius: '50%',
                                      backgroundColor: statusBadgeStyle.text,
                                    }}
                                  />
                                  <span>{statusBadgeStyle.label}</span>
                                </span>
                              </td>
                              <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                                <div style={{ fontWeight: 600, color: '#334155' }}>
                                  {j.attempts} / {j.max_attempts}
                                </div>
                                <div
                                  style={{
                                    width: '60px',
                                    height: '4px',
                                    borderRadius: '2px',
                                    background: '#e2e8f0',
                                    overflow: 'hidden',
                                    marginTop: '4px',
                                  }}
                                >
                                  <div
                                    style={{
                                      width: `${Math.min(100, (j.attempts / (j.max_attempts || 1)) * 100)}%`,
                                      height: '100%',
                                      background: isFailed ? '#e11d48' : '#2563eb',
                                    }}
                                  />
                                </div>
                              </td>
                              <td style={{ padding: '12px 14px', maxWidth: '320px' }}>
                                {j.error_message ? (
                                  <div
                                    style={{
                                      fontSize: '12px',
                                      color: '#b91c1c',
                                      background: '#fef2f2',
                                      padding: '6px 10px',
                                      borderRadius: '6px',
                                      border: '1px solid #fecaca',
                                      lineHeight: 1.4,
                                    }}
                                  >
                                    <AlertTriangle size={12} style={{ display: 'inline', marginRight: '4px' }} />
                                    {j.error_message}
                                  </div>
                                ) : (
                                  <span style={{ color: '#94a3b8', fontSize: '12px' }}>执行正常无报错</span>
                                )}
                              </td>
                              <td style={{ padding: '12px 14px', fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap' }}>
                                {j.created_at ? new Date(j.created_at).toLocaleString() : '—'}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: 监测批次质量剖析 (Metrics Deep Dive) */}
        {activeTab === 'metrics' && (
          <div style={{ padding: '24px' }}>
            <div style={{ marginBottom: '18px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>
                最新监测批次有效性与样本分布剖析
              </h3>
              <p style={{ fontSize: '12.5px', color: '#64748b', margin: 0 }}>
                评估当前批次大模型端点的响应质量、有效提及率与拒答失败样本占比。
              </p>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                gap: '16px',
              }}
            >
              {/* Box 1: Sample Validity Distribution */}
              <div
                style={{
                  padding: '16px 18px',
                  borderRadius: '10px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                }}
              >
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '10px' }}>
                  样本采集质量漏斗
                </div>

                {m ? (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                      <span style={{ color: '#059669', fontWeight: 600 }}>
                        有效回答：{m.valid_samples} 个
                      </span>
                      <span style={{ color: '#dc2626', fontWeight: 600 }}>
                        失败/拒答：{m.failed_samples} 个
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div
                      style={{
                        height: '10px',
                        borderRadius: '5px',
                        background: '#fee2e2',
                        overflow: 'hidden',
                        display: 'flex',
                        marginBottom: '10px',
                      }}
                    >
                      <div
                        style={{
                          width: `${
                            m.valid_samples + m.failed_samples > 0
                              ? (m.valid_samples / (m.valid_samples + m.failed_samples)) * 100
                              : 0
                          }%`,
                          background: '#10b981',
                        }}
                      />
                    </div>

                    <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.5 }}>
                      有效率达{' '}
                      <b>
                        {m.valid_samples + m.failed_samples > 0
                          ? ((m.valid_samples / (m.valid_samples + m.failed_samples)) * 100).toFixed(1)
                          : 0}
                        %
                      </b>
                      。失败样本已自动进入重试或拒答样本分析池。
                    </div>
                  </div>
                ) : (
                  <div style={{ color: '#94a3b8', fontSize: '12px' }}>暂无批次样本数据</div>
                )}
              </div>

              {/* Box 2: Source & Run Details */}
              <div
                style={{
                  padding: '16px 18px',
                  borderRadius: '10px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                }}
              >
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '10px' }}>
                  批次来源与技术指标
                </div>

                <div style={{ display: 'grid', gap: '8px', fontSize: '12.5px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>采样数据源</span>
                    <b>{m?.source || '全部已配置渠道'}</b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>当前批次编号</span>
                    <code>{m?.run_id || 'run_current'}</code>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>引用实体标记</span>
                    <b>{m?.citations_count ?? 0} 个</b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>在线生效规则</span>
                    <b>{m?.active_rules_count ?? 0} 条</b>
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: '16px',
                padding: '12px 16px',
                borderRadius: '8px',
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                color: '#1d4ed8',
                fontSize: '12.5px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={16} />
                <span>欲查看各意图查询词或主流大模型的具体回答快照，请前往监测样本库。</span>
              </div>
              <button
                type="button"
                className="btn primary"
                onClick={() => onNavigate('monitor')}
                style={{ fontSize: '12px', padding: '4px 12px', whiteSpace: 'nowrap' }}
              >
                进入监测样本库 →
              </button>
            </div>
          </div>
        )}
      </article>
    </Page>
  );
}

export default OverviewView;
