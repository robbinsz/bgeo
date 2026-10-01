import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, fireEvent, screen, cleanup, waitFor } from '@testing-library/react';
import { DiagnosisView } from './DiagnosisView';
import { api } from '../../services/api';
import { PermissionContext } from '../../hooks/permissions';

vi.mock('../../services/api', () => ({
  api: {
    getOpportunities: vi.fn(),
    updateOpportunityStatus: vi.fn(),
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

describe('DiagnosisView Component Redesign', () => {
  const mockOpportunities = [
    {
      id: 'opp-1',
      title: '武汉家政公司权威对比指南',
      type: 'brand_absent',
      description: '4 个引擎未提及品牌，竞品安心到家覆盖率高出 31%',
      score: 91.0,
      impact_score: 95.0,
      gap_score: 88.0,
      feasibility_score: 90.0,
      confidence_score: 92.0,
      risk_cost: 10.0,
      recommended_action: '补齐武汉家政对比型内容集群与第三方信用背书',
      evidence_ids: 'ev-101',
      status: 'new' as const,
    },
    {
      id: 'opp-2',
      title: '公开服务验收标准与赔付承诺',
      type: 'citation_missing',
      description: '高频价格问题 18 个，当前引用源可信度不足',
      score: 83.0,
      impact_score: 85.0,
      gap_score: 80.0,
      feasibility_score: 85.0,
      confidence_score: 88.0,
      risk_cost: 12.0,
      recommended_action: '增加 FAQ 结构化数据与计价依据页面',
      evidence_ids: 'ev-102',
      status: 'in_progress' as const,
    },
    {
      id: 'opp-3',
      title: '创建开荒保洁验收标准权威指南',
      type: 'content_blank',
      description: '内容缺口明确，月均生成式问答需求约 2,400 次',
      score: 76.0,
      impact_score: 78.0,
      gap_score: 74.0,
      feasibility_score: 80.0,
      confidence_score: 82.0,
      risk_cost: 10.0,
      recommended_action: '基于已核验事实库生成开荒保洁标准说明',
      evidence_ids: 'ev-103',
      status: 'resolved' as const,
    },
  ];

  beforeEach(() => {
    vi.mocked(api.getOpportunities).mockResolvedValue({
      items: mockOpportunities,
      pagination: { limit: 10, offset: 0, has_more: false },
    });
    vi.mocked(api.updateOpportunityStatus).mockResolvedValue({});
    vi.mocked(api.triggerMonitorRun).mockResolvedValue({});
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders top KPI overview cards and opportunity items with priority badges', async () => {
    const onShowToast = vi.fn();
    renderWithPerms(<DiagnosisView onShowToast={onShowToast} />);

    await waitFor(() => {
      expect(screen.getByText('武汉家政公司权威对比指南')).toBeTruthy();
    });

    // Check KPI cards
    expect(screen.getByText('诊断机会总量')).toBeTruthy();
    expect(screen.getByText('P0 核心攻坚机会')).toBeTruthy();
    expect(screen.getByText('平均机会评分')).toBeTruthy();
    expect(screen.getByText('闭环解决进度')).toBeTruthy();

    // Check Priority Tags
    expect(screen.getByText('P0 · 核心攻坚')).toBeTruthy();
    expect(screen.getByText('P1 · 高价值机会')).toBeTruthy();
    expect(screen.getByText('P2 · 持续优化')).toBeTruthy();

    // Check Type Tags
    expect(screen.getByText('品牌缺席')).toBeTruthy();
    expect(screen.getByText('引用缺失')).toBeTruthy();
    expect(screen.getByText('内容空白')).toBeTruthy();
  });

  it('filters opportunities by search query', async () => {
    const onShowToast = vi.fn();
    renderWithPerms(<DiagnosisView onShowToast={onShowToast} />);

    await waitFor(() => {
      expect(screen.getByText('武汉家政公司权威对比指南')).toBeTruthy();
    });

    const searchInput = screen.getByPlaceholderText('搜索机会标题、关键词或应对动作…');
    fireEvent.change(searchInput, { target: { value: '开荒保洁' } });

    expect(screen.queryByText('武汉家政公司权威对比指南')).toBeNull();
    expect(screen.getByText('创建开荒保洁验收标准权威指南')).toBeTruthy();
  });

  it('toggles the PRD 10.4 scoring model formula banner', async () => {
    const onShowToast = vi.fn();
    renderWithPerms(<DiagnosisView onShowToast={onShowToast} />);

    await waitFor(() => {
      expect(screen.getByText('评分模型标准')).toBeTruthy();
    });

    expect(screen.queryByText(/机会诊断综合评分算法模型/)).toBeNull();

    fireEvent.click(screen.getByText('评分模型标准'));
    expect(screen.getByText(/机会诊断综合评分算法模型/)).toBeTruthy();
    expect(screen.getByText(/0.30 × 业务影响/)).toBeTruthy();

    fireEvent.click(screen.getByText('收起'));
    expect(screen.queryByText(/机会诊断综合评分算法模型/)).toBeNull();
  });

  it('switches to competitive gap matrix tab and answers structure gaps tab', async () => {
    const onShowToast = vi.fn();
    renderWithPerms(<DiagnosisView onShowToast={onShowToast} />);

    await waitFor(() => {
      expect(screen.getByText('竞品引用差距矩阵')).toBeTruthy();
    });

    // Switch to matrix tab
    fireEvent.click(screen.getByText('竞品引用差距矩阵'));
    expect(screen.getByText(/Competitive Citation Matrix/)).toBeTruthy();
    expect(screen.getByText('我方品牌 (苗汐)')).toBeTruthy();
    expect(screen.getByText('安心到家')).toBeTruthy();

    // Switch to gaps tab
    fireEvent.click(screen.getByText('答案结构缺口雷达'));
    expect(screen.getByText(/价格信息缺少区间范围/)).toBeTruthy();
    expect(screen.getByText(/服务人员资质缺少公开校验编号/)).toBeTruthy();
  });

  it('opens and closes the in-depth opportunity diagnosis detail drawer', async () => {
    const onShowToast = vi.fn();
    renderWithPerms(<DiagnosisView onShowToast={onShowToast} />);

    await waitFor(() => {
      expect(screen.getByText('武汉家政公司权威对比指南')).toBeTruthy();
    });

    // Click on detail button
    const detailBtns = screen.getAllByText('深度诊断详情');
    fireEvent.click(detailBtns[0]);

    expect(screen.getByText('深度诊断决策报告')).toBeTruthy();
    expect(screen.getByText('五维量化指标拆解 (权重归一化)')).toBeTruthy();
    expect(screen.getByText('推荐 3 步落地推进蓝图')).toBeTruthy();

    // Close drawer
    fireEvent.click(screen.getByText('关闭'));
    expect(screen.queryByText('深度诊断决策报告')).toBeNull();
  });

  it('confirms review status when "确认已核对" is clicked', async () => {
    const onShowToast = vi.fn();
    renderWithPerms(<DiagnosisView onShowToast={onShowToast} />);

    await waitFor(() => {
      expect(screen.getByText('确认已核对')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('确认已核对'));
    await waitFor(() => {
      expect(api.updateOpportunityStatus).toHaveBeenCalledWith('opp-1', 'reviewed');
    });
  });

  it('converts opportunity to strategy task when "转为策略任务" is clicked', async () => {
    const onShowToast = vi.fn();
    const onOpenModal = vi.fn();
    renderWithPerms(<DiagnosisView onShowToast={onShowToast} onOpenModal={onOpenModal} />);

    await waitFor(() => {
      expect(screen.getAllByText('转为策略任务').length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByText('转为策略任务')[0]);
    expect(onOpenModal).toHaveBeenCalledWith('创建策略：武汉家政公司权威对比指南');
  });
});
