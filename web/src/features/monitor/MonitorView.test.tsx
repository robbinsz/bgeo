import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, fireEvent, screen, cleanup, waitFor } from '@testing-library/react';
import { MonitorView } from './MonitorView';
import { api } from '../../services/api';
import { PermissionContext } from '../../hooks/permissions';

vi.mock('../../services/api', () => ({
  api: {
    getQueries: vi.fn(),
    getSnapshots: vi.fn(),
    getMonitorRuns: vi.fn(),
    triggerMonitorRun: vi.fn(),
  },
  getProjectID: vi.fn(() => 'test-proj'),
  authService: {
    getGeneration: vi.fn(() => 1),
    getUser: vi.fn(() => ({ id: 'u1', role: 'admin' })),
    subscribe: vi.fn(() => () => {}),
  },
}));

function renderWithPerms(ui: React.ReactElement) {
  return render(
    <PermissionContext value={{ write: true, review: true, admin: true }}>
      {ui}
    </PermissionContext>,
  );
}

describe('MonitorView Component Professional Redesign', () => {
  const mockQueries = [
    {
      id: 'q-1',
      query_text: '武汉家政公司哪家靠谱？',
      intent: 'commercial',
      priority: 'critical',
      status: 'active',
      topic: '本地家政',
      sample_frequency: '6h',
      business_value: 95,
    },
    {
      id: 'q-2',
      query_text: '住家育儿嫂主要负责什么？',
      intent: 'informational',
      priority: 'medium',
      status: 'active',
      topic: '育儿保洁',
      sample_frequency: '12h',
      business_value: 70,
    },
  ];

  const mockSnapshots = [
    {
      id: 'snap-1',
      query_id: 'q-1',
      channel_id: 'perplexity',
      raw_answer: '武汉优质家政公司推荐包括安心到家、好慷在家...',
      parsed_data: JSON.stringify({ brand: '安心到家', rank: 1 }),
      model_version: 'sonar-pro',
      is_brand_mentioned: false,
      is_brand_recommended: false,
      brand_rank: 0,
      is_refusal: false,
      sampled_at: new Date('2026-10-01T11:14:08Z').toISOString(),
      sample_status: 'failed',
      source: 'live',
      confidence: 0.88,
      error_message: '网络超时或上游未返回有效 token',
    },
    {
      id: 'snap-2',
      query_id: 'q-2',
      channel_id: 'chatgpt',
      raw_answer: '育儿嫂主要负责新生儿生活照料与早教引导。',
      parsed_data: JSON.stringify({ brand: '苗汐家政', rank: 2 }),
      model_version: 'gpt-4o',
      is_brand_mentioned: true,
      is_brand_recommended: true,
      brand_rank: 2,
      is_refusal: false,
      sampled_at: new Date('2026-10-01T11:15:00Z').toISOString(),
      sample_status: 'success',
      source: 'live',
      confidence: 0.95,
    },
  ];

  const mockRuns = [
    {
      id: 'run-101',
      status: 'failed',
      total_queries: 6,
      success_count: 0,
      failure_count: 6,
      created_at: new Date('2026-10-01T11:14:08Z').toISOString(),
    },
  ];

  beforeEach(() => {
    vi.mocked(api.getQueries).mockResolvedValue({
      items: mockQueries,
      pagination: { limit: 10, offset: 0, has_more: false },
    });
    vi.mocked(api.getSnapshots).mockResolvedValue({ items: mockSnapshots });
    vi.mocked(api.getMonitorRuns).mockResolvedValue({ items: mockRuns });
    vi.mocked(api.triggerMonitorRun).mockResolvedValue({});
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders top KPI overview cards and target queries with intent and priority badges', async () => {
    const onShowToast = vi.fn();
    const onOpenModal = vi.fn();
    renderWithPerms(<MonitorView onShowToast={onShowToast} onOpenModal={onOpenModal} />);

    await waitFor(() => {
      expect(screen.getByText('武汉家政公司哪家靠谱？')).toBeTruthy();
    });

    // Check KPI Cards
    expect(screen.getByText('监测核心问题集')).toBeTruthy();
    expect(screen.getByText('全网采样批次')).toBeTruthy();
    expect(screen.getByText('品牌生成式提及率')).toBeTruthy();
    expect(screen.getByText('采样健康成功率')).toBeTruthy();

    // Check Intent & Priority badges
    expect(screen.getByText('商业意图')).toBeTruthy();
    expect(screen.getByText('信息咨询')).toBeTruthy();
    expect(screen.getByText('P0 · 致命核心')).toBeTruthy();
    expect(screen.getByText('P2 · 中等')).toBeTruthy();
  });

  it('filters target queries by search query', async () => {
    const onShowToast = vi.fn();
    const onOpenModal = vi.fn();
    renderWithPerms(<MonitorView onShowToast={onShowToast} onOpenModal={onOpenModal} />);

    await waitFor(() => {
      expect(screen.getByText('武汉家政公司哪家靠谱？')).toBeTruthy();
    });

    const searchInput = screen.getByPlaceholderText('搜索本页问题文本、关键词或主题…');
    fireEvent.change(searchInput, { target: { value: '育儿嫂' } });

    expect(screen.queryByText('武汉家政公司哪家靠谱？')).toBeNull();
    expect(screen.getByText('住家育儿嫂主要负责什么？')).toBeTruthy();
  });

  it('switches to answer snapshots tab and displays engine logos and mention badges', async () => {
    const onShowToast = vi.fn();
    const onOpenModal = vi.fn();
    renderWithPerms(<MonitorView onShowToast={onShowToast} onOpenModal={onOpenModal} />);

    await waitFor(() => {
      expect(screen.getByText('原始回答与证据快照')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('原始回答与证据快照'));

    expect(screen.getAllByText('perplexity').length).toBeGreaterThan(0);
    expect(screen.getAllByText('chatgpt').length).toBeGreaterThan(0);
    expect(screen.getByText('未提及我方品牌')).toBeTruthy();
    expect(screen.getByText(/提及品牌 · 排名第 2/)).toBeTruthy();
    expect(screen.getAllByText('采样异常').length).toBeGreaterThan(0);
    expect(screen.getAllByText('采样成功').length).toBeGreaterThan(0);
  });

  it('switches to batch runs tab and shows execution progress', async () => {
    const onShowToast = vi.fn();
    const onOpenModal = vi.fn();
    renderWithPerms(<MonitorView onShowToast={onShowToast} onOpenModal={onOpenModal} />);

    await waitFor(() => {
      expect(screen.getByText('近期采样批次历史')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('近期采样批次历史'));

    expect(screen.getByText(/近期采样批次历史 \(Batch Run History\)/)).toBeTruthy();
    expect(screen.getByText('执行告警 (failed)')).toBeTruthy();
    expect(screen.getByText(/失败 6/)).toBeTruthy();
  });

  it('opens and closes the snapshot inspection slide-over drawer', async () => {
    const onShowToast = vi.fn();
    const onOpenModal = vi.fn();
    renderWithPerms(<MonitorView onShowToast={onShowToast} onOpenModal={onOpenModal} />);

    await waitFor(() => {
      expect(screen.getByText('原始回答与证据快照')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('原始回答与证据快照'));

    const inspectBtns = screen.getAllByText('完整证据与推演');
    fireEvent.click(inspectBtns[0]);

    expect(screen.getByText(/原始回答与证据详情/)).toBeTruthy();
    expect(screen.getByText('大模型原始生成回答')).toBeTruthy();

    fireEvent.click(screen.getByText('关闭'));
    expect(screen.queryByText(/原始回答与证据详情/)).toBeNull();
  });

  it('triggers a monitor run batch when "启动监测批次" is clicked', async () => {
    const onShowToast = vi.fn();
    const onOpenModal = vi.fn();
    renderWithPerms(<MonitorView onShowToast={onShowToast} onOpenModal={onOpenModal} />);

    await waitFor(() => {
      expect(screen.getByText('启动监测批次')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('启动监测批次'));
    await waitFor(() => {
      expect(api.triggerMonitorRun).toHaveBeenCalled();
    });
  });

  it('navigates to snapshots tab with filtered query when "查看快照" is clicked', async () => {
    const onShowToast = vi.fn();
    const onOpenModal = vi.fn();
    renderWithPerms(<MonitorView onShowToast={onShowToast} onOpenModal={onOpenModal} />);

    await waitFor(() => {
      expect(screen.getByText('武汉家政公司哪家靠谱？')).toBeTruthy();
    });

    const snapshotBtns = screen.getAllByText('查看快照');
    expect(snapshotBtns.length).toBeGreaterThan(0);
    fireEvent.click(snapshotBtns[0]);

    // Active tab switches to snapshots
    expect(screen.getByText('原始回答与证据快照')).toBeTruthy();
  });
});
