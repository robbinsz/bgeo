import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, fireEvent, screen, cleanup, waitFor } from '@testing-library/react';
import { OverviewView } from './OverviewView';
import { api } from '../../services/api';
import { PermissionContext } from '../../hooks/permissions';

vi.mock('../../services/api', () => ({
  api: {
    getMetrics: vi.fn(),
    getJobs: vi.fn(),
    getProject: vi.fn(),
    getSchedule: vi.fn(),
  },
  getProjectID: vi.fn(() => 'test-proj'),
  authService: {
    getGeneration: vi.fn(() => 1),
    getUser: vi.fn(() => ({ id: 'u1', role: 'admin' })),
    subscribe: vi.fn(() => () => {}),
  },
}));

function renderWithPerms(ui: React.ReactElement, admin = true) {
  return render(
    <PermissionContext value={{ write: true, review: true, admin }}>
      {ui}
    </PermissionContext>,
  );
}

describe('OverviewView Component Redesign', () => {
  const onNavigate = vi.fn();
  const onShowToast = vi.fn();
  const onStartCycle = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (api.getMetrics as any).mockResolvedValue({
      voice_share: 78.5,
      query_coverage: 92.0,
      avg_rank: 1.4,
      citations_count: 36,
      valid_samples: 120,
      failed_samples: 8,
      active_rules_count: 14,
      run_id: 'run_20261001_01',
      source: '各主流多模型端点',
    });
    (api.getJobs as any).mockResolvedValue({
      items: [
        {
          id: 'job-101',
          kind: 'monitor_sampling',
          status: 'running',
          attempts: 1,
          max_attempts: 3,
          created_at: '2026-10-01T12:00:00Z',
        },
        {
          id: 'job-102',
          kind: 'quality_scoring',
          status: 'completed',
          attempts: 1,
          max_attempts: 3,
          created_at: '2026-10-01T11:40:00Z',
        },
        {
          id: 'job-103',
          kind: 'webhook_dispatch',
          status: 'failed',
          attempts: 3,
          max_attempts: 3,
          error_message: '对端网络连接超时 (504 Gateway Timeout)',
          created_at: '2026-10-01T11:20:00Z',
        },
      ],
    });
    (api.getProject as any).mockResolvedValue({
      id: 'test-proj',
      name: '智能营销项目',
      automation_level: 'L2',
      is_paused: false,
    });
    (api.getSchedule as any).mockResolvedValue({
      frequency: 'daily',
      time_slot: '今天 20:00',
      next_run_at: '2026-10-01T20:00:00Z',
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders top KPI cards and run status bar', async () => {
    renderWithPerms(
      <OverviewView
        onNavigate={onNavigate}
        onShowToast={onShowToast}
        onStartCycle={onStartCycle}
        isCycleRunning={false}
        cycleStageIndex={0}
      />,
    );

    // Check KPI cards
    expect(screen.getByText('品牌提及声量')).toBeDefined();
    expect(screen.getByText('目标问题覆盖度')).toBeDefined();
    expect(screen.getByText('平均推荐位次')).toBeDefined();
    expect(screen.getByText('权威引用 / 生效规则')).toBeDefined();

    // Check values
    await waitFor(() => {
      expect(screen.getByText('78.5%')).toBeDefined();
      expect(screen.getByText('92.0%')).toBeDefined();
      expect(screen.getByText('#1.4')).toBeDefined();
      expect(screen.getByText('36 引 / 14 规')).toBeDefined();
    });

    // Check Run Status Bar
    expect(screen.getByText('监测引擎就绪 · 待命中')).toBeDefined();
    expect(screen.getByText('治理等级：L2')).toBeDefined();
  });

  it('renders 7-stage pipeline navigation and allows navigating to modules', async () => {
    renderWithPerms(
      <OverviewView
        onNavigate={onNavigate}
        onShowToast={onShowToast}
        onStartCycle={onStartCycle}
        isCycleRunning={false}
        cycleStageIndex={0}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('监测样本采集')).toBeDefined();
      expect(screen.getByText('机会识别诊断')).toBeDefined();
      expect(screen.getByText('策略智能编排')).toBeDefined();
      expect(screen.getByText('内容工厂与资产')).toBeDefined();
      expect(screen.getByText('发布与渠道分发')).toBeDefined();
      expect(screen.getByText('配对实验中心')).toBeDefined();
      expect(screen.getByText('规则自进化中心')).toBeDefined();
    });

    // Click on a module card
    fireEvent.click(screen.getByText('策略智能编排'));
    expect(onNavigate).toHaveBeenCalledWith('strategy');

    // Click on another module
    fireEvent.click(screen.getByText('内容工厂与资产'));
    expect(onNavigate).toHaveBeenCalledWith('content');
  });

  it('switches to持久任务队列 tab and filters jobs', async () => {
    renderWithPerms(
      <OverviewView
        onNavigate={onNavigate}
        onShowToast={onShowToast}
        onStartCycle={onStartCycle}
        isCycleRunning={false}
        cycleStageIndex={0}
      />,
    );

    // Switch to jobs tab
    const jobsTabBtn = screen.getByText('持久任务队列');
    fireEvent.click(jobsTabBtn);

    await waitFor(() => {
      expect(screen.getByText('monitor_sampling')).toBeDefined();
      expect(screen.getByText('quality_scoring')).toBeDefined();
      expect(screen.getByText('webhook_dispatch')).toBeDefined();
    });

    // Filter by search keyword
    const searchInput = screen.getByPlaceholderText('搜索任务类型、ID 或错误…');
    fireEvent.change(searchInput, { target: { value: 'webhook' } });

    expect(screen.getByText('webhook_dispatch')).toBeDefined();
    expect(screen.queryByText('monitor_sampling')).toBeNull();
  });

  it('switches to 监测批次质量剖析 tab and displays details', async () => {
    renderWithPerms(
      <OverviewView
        onNavigate={onNavigate}
        onShowToast={onShowToast}
        onStartCycle={onStartCycle}
        isCycleRunning={false}
        cycleStageIndex={0}
      />,
    );

    // Switch to metrics tab
    const metricsTabBtn = screen.getByText('监测批次质量剖析');
    fireEvent.click(metricsTabBtn);

    await waitFor(() => {
      expect(screen.getByText('样本采集质量漏斗')).toBeDefined();
      expect(screen.getByText('有效回答：120 个')).toBeDefined();
      expect(screen.getByText('失败/拒答：8 个')).toBeDefined();
      expect(screen.getByText('批次来源与技术指标')).toBeDefined();
      expect(screen.getByText('run_20261001_01')).toBeDefined();
    });

    // Click link to monitor view
    const toMonitorBtn = screen.getByText('进入监测样本库 →');
    fireEvent.click(toMonitorBtn);
    expect(onNavigate).toHaveBeenCalledWith('monitor');
  });

  it('triggers cycle monitoring from top action button', async () => {
    renderWithPerms(
      <OverviewView
        onNavigate={onNavigate}
        onShowToast={onShowToast}
        onStartCycle={onStartCycle}
        isCycleRunning={false}
        cycleStageIndex={0}
      />,
    );

    const startBtn = screen.getByText('立即运行监测');
    fireEvent.click(startBtn);
    expect(onStartCycle).toHaveBeenCalled();
  });
});
