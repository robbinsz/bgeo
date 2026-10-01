import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, fireEvent, screen, cleanup, waitFor } from '@testing-library/react';
import { ExperimentsView } from './ExperimentsView';
import { api } from '../../services/api';
import { PermissionContext } from '../../hooks/permissions';

vi.mock('../../services/api', () => ({
  api: {
    getExperiments: vi.fn(),
    getMonitorRuns: vi.fn(),
    getFacts: vi.fn(),
    triggerEvolutionRun: vi.fn(),
    createExperiment: vi.fn(),
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

describe('ExperimentsView Component Redesign', () => {
  const mockExperiments = [
    {
      id: 'exp-1',
      title: '补充资质认证对武汉家政词提及率的对照评估',
      hypothesis: '增加国家人社资质说明可提升 25% 引用置信度',
      status: 'statistically_significant',
      sample_size: 45,
      evaluation: 'Chi-Square p=0.012 (<0.05). 提及率增益 +14.2%, 达到统计显著门槛。',
    },
    {
      id: 'exp-2',
      title: '表格化价格呈现对报价偏差率的干预测试',
      hypothesis: '采用结构化区间价格降低幻觉报价概率',
      status: 'evaluating',
      sample_size: 30,
      evaluation: '',
    },
  ];

  const mockRuns = [
    {
      id: 'run-base-101',
      status: 'completed',
      success_count: 50,
    },
    {
      id: 'run-var-102',
      status: 'completed',
      success_count: 50,
    },
  ];

  const mockFacts = [
    {
      id: 'fact-1',
      statement: '具备省人社厅颁发的高级家政资格证书',
    },
  ];

  beforeEach(() => {
    vi.mocked(api.getExperiments).mockResolvedValue({
      items: mockExperiments,
    } as any);
    vi.mocked(api.getMonitorRuns).mockResolvedValue({
      items: mockRuns,
    } as any);
    vi.mocked(api.getFacts).mockResolvedValue({
      items: mockFacts,
      pagination: { total: 1, limit: 50, has_more: false },
    } as any);
    vi.mocked(api.triggerEvolutionRun).mockResolvedValue({} as any);
    vi.mocked(api.createExperiment).mockResolvedValue({} as any);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders top KPI cards and experiments list', async () => {
    renderWithPerms(<ExperimentsView onShowToast={vi.fn()} onOpenModal={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('补充资质认证对武汉家政词提及率的对照评估')).toBeDefined();
    });

    // Check KPI cards
    expect(screen.getByText('实验方案总数')).toBeDefined();
    expect(screen.getByText('已完成评估')).toBeDefined();
    expect(screen.getByText('有效配对样本量')).toBeDefined();
    expect(screen.getByText('统计显著正向')).toBeDefined();

    // Check evaluation report
    expect(screen.getByText(/Chi-Square p=0.012/)).toBeDefined();
  });

  it('filters experiments by keyword and triggers evaluation run', async () => {
    renderWithPerms(<ExperimentsView onShowToast={vi.fn()} onOpenModal={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('补充资质认证对武汉家政词提及率的对照评估')).toBeDefined();
    });

    // Trigger evaluation run
    const evalBtn = screen.getByRole('button', { name: /评估待处理实验/ });
    fireEvent.click(evalBtn);

    await waitFor(() => {
      expect(api.triggerEvolutionRun).toHaveBeenCalled();
    });

    // Search
    const searchInput = screen.getByPlaceholderText('搜索实验名称或假设…');
    fireEvent.change(searchInput, { target: { value: '表格化价格' } });

    expect(screen.getByText('表格化价格呈现对报价偏差率的干预测试')).toBeDefined();
    expect(screen.queryByText('补充资质认证对武汉家政词提及率的对照评估')).toBeNull();
  });

  it('switches to create tab and submits new experiment', async () => {
    renderWithPerms(<ExperimentsView onShowToast={vi.fn()} onOpenModal={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('创建配对实验')).toBeDefined();
    });

    fireEvent.click(screen.getByText('创建配对实验'));
    expect(screen.getByText('创建配对评估实验')).toBeDefined();

    const titleInput = screen.getByPlaceholderText(/例如：补充资质认证/);
    const hypoInput = screen.getByPlaceholderText(/陈述具体干预点/);
    const baselineSelect = screen.getByLabelText(/基线批次/);
    const variantSelect = screen.getByLabelText(/对比批次/);

    fireEvent.change(titleInput, { target: { value: '新保洁时效实验' } });
    fireEvent.change(hypoInput, { target: { value: '承诺30分钟响应提升转化' } });
    fireEvent.change(baselineSelect, { target: { value: 'run-base-101' } });
    fireEvent.change(variantSelect, { target: { value: 'run-var-102' } });

    fireEvent.click(screen.getByRole('button', { name: '创建评估方案' }));

    await waitFor(() => {
      expect(api.createExperiment).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '新保洁时效实验',
          hypothesis: '承诺30分钟响应提升转化',
          baseline_run_id: 'run-base-101',
          variant_run_id: 'run-var-102',
        }),
      );
    });
  });
});
