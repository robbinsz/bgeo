import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, fireEvent, screen, cleanup, waitFor } from '@testing-library/react';
import { EvolutionView } from './EvolutionView';
import { api } from '../../services/api';
import { PermissionContext } from '../../hooks/permissions';

vi.mock('../../services/api', () => ({
  api: {
    getRules: vi.fn(),
    getEvolutionRuns: vi.fn(),
    approveRule: vi.fn(),
    rollbackRule: vi.fn(),
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

describe('EvolutionView Component Redesign', () => {
  const mockRules = [
    {
      id: 'rule-1',
      rule_name: '问答开头优先注入省人社高级资质声明',
      category: 'entity_injection',
      condition_expr: 'query.intent == "qualification_check"',
      action_type: 'inject_claim',
      action_payload: 'fact_891',
      status: 'candidate',
      version: '1.2.0',
      sample_size: 45,
      impact_score: 0.42,
      evidence_ids: 'ev-1',
    },
    {
      id: 'rule-2',
      rule_name: '价格表格化区间呈现规则',
      category: 'format_structuring',
      condition_expr: 'query.intent == "price_inquiry"',
      action_type: 'table_structure',
      action_payload: 'price_matrix_1',
      status: 'stable',
      version: '2.0.1',
      sample_size: 120,
      impact_score: 0.38,
      evidence_ids: 'ev-2',
    },
    {
      id: 'rule-3',
      rule_name: '旧版绝对化无事故表述规则',
      category: 'deprecated',
      condition_expr: 'always',
      action_type: 'legacy_filter',
      action_payload: 'none',
      status: 'rolled_back',
      version: '0.9.1',
      sample_size: 20,
      impact_score: -0.15,
      evidence_ids: 'ev-3',
    },
  ];

  const mockRuns = [
    {
      id: 'run-101',
      status: 'completed',
      total_queries: 50,
      success_count: 50,
      failure_count: 0,
      stage_name: '配对差异计算完成',
      percentage: 100,
      created_at: new Date().toISOString(),
    },
  ];

  beforeEach(() => {
    vi.mocked(api.getRules).mockResolvedValue({
      items: mockRules,
      pagination: { total: 3, limit: 50, has_more: false },
    } as any);
    vi.mocked(api.getEvolutionRuns).mockResolvedValue({
      items: mockRuns,
    } as any);
    vi.mocked(api.approveRule).mockResolvedValue({} as any);
    vi.mocked(api.rollbackRule).mockResolvedValue({} as any);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders top KPI cards and rules table', async () => {
    renderWithPerms(
      <EvolutionView
        onShowToast={vi.fn()}
        onStartEvolution={vi.fn()}
        isEvolutionRunning={false}
        evolutionStage={1}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('问答开头优先注入省人社高级资质声明')).toBeDefined();
    });

    // Check KPI cards
    expect(screen.getByText('生效稳定规则')).toBeDefined();
    expect(screen.getByText('候选待审批')).toBeDefined();
    expect(screen.getByText('已回滚保护')).toBeDefined();
    expect(screen.getByText('平均评估增益')).toBeDefined();

    // Check table headers
    expect(screen.getByText('规则名称与版本')).toBeDefined();
    expect(screen.getByText(/条件表达式/)).toBeDefined();
    expect(screen.getByText('动作与载荷')).toBeDefined();
    expect(screen.getByText('样本与评估增益')).toBeDefined();
  });

  it('toggles standards banner and filters rules by keyword', async () => {
    renderWithPerms(
      <EvolutionView
        onShowToast={vi.fn()}
        onStartEvolution={vi.fn()}
        isEvolutionRunning={false}
        evolutionStage={1}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('自进化标准规范')).toBeDefined();
    });

    // Open banner
    fireEvent.click(screen.getByText('自进化标准规范'));
    expect(screen.getByText(/GEO 闭环自进化准入与安全红线/)).toBeDefined();

    // Search rules
    const searchInput = screen.getByPlaceholderText('搜索规则名称、条件或动作类型…');
    fireEvent.change(searchInput, { target: { value: '价格表格化' } });

    expect(screen.getByText('价格表格化区间呈现规则')).toBeDefined();
    expect(screen.queryByText('问答开头优先注入省人社高级资质声明')).toBeNull();
  });

  it('approves candidate rule and rolls back stable rule', async () => {
    renderWithPerms(
      <EvolutionView
        onShowToast={vi.fn()}
        onStartEvolution={vi.fn()}
        isEvolutionRunning={false}
        evolutionStage={1}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('问答开头优先注入省人社高级资质声明')).toBeDefined();
    });

    // Click approve rule
    const approveBtn = screen.getByRole('button', { name: /批准规则/ });
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(api.approveRule).toHaveBeenCalledWith('rule-1');
    });

    // Click rollback rule
    const rollbackBtn = screen.getByRole('button', { name: /回滚规则/ });
    fireEvent.click(rollbackBtn);

    await waitFor(() => {
      expect(api.rollbackRule).toHaveBeenCalledWith('rule-2');
    });
  });

  it('switches to evaluation runs tab', async () => {
    renderWithPerms(
      <EvolutionView
        onShowToast={vi.fn()}
        onStartEvolution={vi.fn()}
        isEvolutionRunning={false}
        evolutionStage={1}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('评估批次记录')).toBeDefined();
    });

    fireEvent.click(screen.getByText('评估批次记录'));
    expect(screen.getByText(/配对差异计算完成/)).toBeDefined();
    expect(screen.getByText('✓ 评估完成')).toBeDefined();
  });
});
