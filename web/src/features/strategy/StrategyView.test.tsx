import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, fireEvent, screen, cleanup, waitFor } from '@testing-library/react';
import { StrategyView } from './StrategyView';
import { api } from '../../services/api';
import { PermissionContext } from '../../hooks/permissions';

vi.mock('../../services/api', () => ({
  api: {
    getStrategies: vi.fn(),
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

describe('StrategyView Component Redesign', () => {
  const mockStrategies = [
    {
      id: 'strat-1',
      title: '武汉家政对比指南优化策略',
      objective: '提升在 DeepSeek 与 Kimi 中对武汉家政搜索的推荐排位',
      hypothesis: '增加权威资质说明可提升 25% 引用置信度',
      assignee: 'Alice',
      risk_level: 'high',
      status: 'production',
    },
    {
      id: 'strat-2',
      title: '日常保洁定价透明度提升',
      objective: '补齐结构化价格资产并消除信息缺口',
      hypothesis: '区间计费可降低大模型报价偏差率',
      assignee: 'Bob',
      risk_level: 'low',
      status: 'backlog',
    },
    {
      id: 'strat-3',
      title: '开荒保洁服务验收标准说明',
      objective: '建立标准 FAQ 问答库',
      hypothesis: '详尽验收条款增加第三方信用背书',
      assignee: 'Alice',
      risk_level: 'medium',
      status: 'completed',
    },
  ];

  beforeEach(() => {
    vi.mocked(api.getStrategies).mockResolvedValue({
      items: mockStrategies,
      pagination: { total: 3, limit: 50, has_more: false },
    } as any);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders top KPI cards and default kanban columns', async () => {
    renderWithPerms(<StrategyView onShowToast={vi.fn()} onOpenModal={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('武汉家政对比指南优化策略')).toBeDefined();
    });

    // Check KPI cards
    expect(screen.getByText('策略任务总量')).toBeDefined();
    expect(screen.getByText('推进与审核中')).toBeDefined();
    expect(screen.getByText('已完成与复测归因')).toBeDefined();
    expect(screen.getByText('高风险策略预警')).toBeDefined();

    // Check Kanban columns
    expect(screen.getByText('机会池')).toBeDefined();
    expect(screen.getByText('内容生产')).toBeDefined();
    expect(screen.getByText('审核发布')).toBeDefined();
    expect(screen.getByText('复测归因')).toBeDefined();
  });

  it('filters strategies by search keyword and risk level', async () => {
    renderWithPerms(<StrategyView onShowToast={vi.fn()} onOpenModal={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('武汉家政对比指南优化策略')).toBeDefined();
      expect(screen.getByText('日常保洁定价透明度提升')).toBeDefined();
    });

    // Filter by search
    const searchInput = screen.getByPlaceholderText('搜索策略标题、目标或假设…');
    fireEvent.change(searchInput, { target: { value: '保洁定价' } });

    expect(screen.getByText('日常保洁定价透明度提升')).toBeDefined();
    expect(screen.queryByText('武汉家政对比指南优化策略')).toBeNull();

    // Reset search
    fireEvent.change(searchInput, { target: { value: '' } });

    // Filter by risk
    const riskSelect = screen.getByLabelText('风险等级');
    fireEvent.change(riskSelect, { target: { value: 'high' } });

    expect(screen.getByText('武汉家政对比指南优化策略')).toBeDefined();
    expect(screen.queryByText('日常保洁定价透明度提升')).toBeNull();
  });

  it('switches between kanban view and table view', async () => {
    renderWithPerms(<StrategyView onShowToast={vi.fn()} onOpenModal={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('队列表格')).toBeDefined();
    });

    // Switch to table view
    fireEvent.click(screen.getByText('队列表格'));
    expect(document.querySelector('table')).not.toBeNull();
    expect(screen.getByText('策略任务与目标')).toBeDefined();
    expect(screen.getByText('当前状态')).toBeDefined();

    // Switch back to kanban view
    fireEvent.click(screen.getByText('看板视图'));
    expect(document.querySelector('table')).toBeNull();
  });

  it('triggers onOpenModal when "新建策略" is clicked', async () => {
    const modalFn = vi.fn();
    renderWithPerms(<StrategyView onShowToast={vi.fn()} onOpenModal={modalFn} />);

    await waitFor(() => {
      expect(screen.getByText('新建策略')).toBeDefined();
    });

    fireEvent.click(screen.getByText('新建策略'));
    expect(modalFn).toHaveBeenCalledWith('创建策略任务');
  });
});
