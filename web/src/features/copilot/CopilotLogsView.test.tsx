import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, fireEvent, screen, cleanup, waitFor } from '@testing-library/react';
import { CopilotLogsView } from './CopilotLogsView';
import { api } from '../../services/api';

vi.mock('../../services/api', () => ({
  api: {
    getAgentTraces: vi.fn(),
    getCopilotAuditLogs: vi.fn(),
  },
  getProjectID: vi.fn(() => 'test-project-id'),
  authService: {
    getGeneration: vi.fn(() => 1),
    getUser: vi.fn(() => ({ id: 'u1', role: 'admin' })),
    subscribe: vi.fn(() => () => {}),
  },
}));

describe('CopilotLogsView Component', () => {
  const mockTraces = [
    {
      id: 'trace-1',
      project_id: 'p1',
      session_id: 'sess-100',
      user_prompt: '分析小红书竞品流量差距',
      model_name: 'gpt-4o',
      total_duration_ms: 1540,
      status: 'completed' as const,
      timeline_json: JSON.stringify([{ step: 1, name: 'diagnosis', duration_ms: 500 }]),
      created_at: new Date('2026-10-01T09:00:00Z').toISOString(),
    },
    {
      id: 'trace-2',
      project_id: 'p1',
      session_id: 'sess-200',
      user_prompt: '执行全渠道内容发布上架',
      model_name: 'deepseek-v3',
      total_duration_ms: 3400,
      status: 'interrupted' as const,
      timeline_json: JSON.stringify([{ step: 1, name: 'publish_pending' }]),
      created_at: new Date('2026-10-01T09:30:00Z').toISOString(),
    },
  ];

  const mockAuditLogs = [
    {
      id: 'audit-1',
      session_id: 'sess-200',
      tool_name: 'publish_article',
      input_payload: JSON.stringify({ title: '开荒保洁攻略', channel: 'xiaohongshu' }),
      execution_risk: 'confirmed',
      user_confirmed: true,
      execution_status: 'success',
      error_message: '',
      executed_at: new Date('2026-10-01T09:32:00Z').toISOString(),
    },
    {
      id: 'audit-2',
      session_id: 'sess-100',
      tool_name: 'diagnose_gap',
      input_payload: JSON.stringify({ keyword: '保洁' }),
      execution_risk: 'direct',
      user_confirmed: false,
      execution_status: 'success',
      error_message: '',
      executed_at: new Date('2026-10-01T09:01:00Z').toISOString(),
    },
  ];

  beforeEach(() => {
    vi.mocked(api.getAgentTraces).mockResolvedValue({ items: mockTraces });
    vi.mocked(api.getCopilotAuditLogs).mockResolvedValue({ items: mockAuditLogs });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders top KPI cards and default traces list', async () => {
    const onShowToast = vi.fn();
    render(<CopilotLogsView onShowToast={onShowToast} />);

    // KPI cards
    expect(screen.getByText('总推演追踪次数')).toBeTruthy();
    expect(screen.getByText('决策完成成功率')).toBeTruthy();
    expect(screen.getByText('平均执行耗时')).toBeTruthy();
    expect(screen.getByText('工具操作审计')).toBeTruthy();

    // Default tab check
    expect(screen.getByRole('tab', { name: /状态机推演追踪/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /工具调用与操作审计/i })).toBeTruthy();

    // Check trace records rendered
    await waitFor(() => {
      expect(screen.getByText('分析小红书竞品流量差距')).toBeTruthy();
      expect(screen.getByText('执行全渠道内容发布上架')).toBeTruthy();
    });
  });

  it('filters traces by keyword', async () => {
    const onShowToast = vi.fn();
    render(<CopilotLogsView onShowToast={onShowToast} />);

    await waitFor(() => {
      expect(screen.getByText('分析小红书竞品流量差距')).toBeTruthy();
    });

    const searchInput = screen.getByPlaceholderText(/搜索用户 Prompt/i);
    fireEvent.change(searchInput, { target: { value: '小红书' } });

    await waitFor(() => {
      expect(screen.getByText('分析小红书竞品流量差距')).toBeTruthy();
      expect(screen.queryByText('执行全渠道内容发布上架')).toBeNull();
    });
  });

  it('filters traces by status', async () => {
    const onShowToast = vi.fn();
    render(<CopilotLogsView onShowToast={onShowToast} />);

    await waitFor(() => {
      expect(screen.getByText('分析小红书竞品流量差距')).toBeTruthy();
      expect(screen.getByText('执行全渠道内容发布上架')).toBeTruthy();
    });

    const statusSelect = screen.getByDisplayValue('所有状态');
    fireEvent.change(statusSelect, { target: { value: 'interrupted' } });

    await waitFor(() => {
      expect(screen.queryByText('分析小红书竞品流量差距')).toBeNull();
      expect(screen.getByText('执行全渠道内容发布上架')).toBeTruthy();
    });
  });

  it('switches to "工具调用与操作审计" tab and views audit records', async () => {
    const onShowToast = vi.fn();
    render(<CopilotLogsView onShowToast={onShowToast} />);

    const auditTab = screen.getByRole('tab', { name: /工具调用与操作审计/i });
    fireEvent.click(auditTab);

    await waitFor(() => {
      expect(screen.getByText('publish_article')).toBeTruthy();
      expect(screen.getByText('diagnose_gap')).toBeTruthy();
      expect(screen.getByText('高危 · 确认')).toBeTruthy();
      expect(screen.getByText('直接执行')).toBeTruthy();
    });
  });

  it('opens and closes the audit log detail modal', async () => {
    const onShowToast = vi.fn();
    render(<CopilotLogsView onShowToast={onShowToast} />);

    const auditTab = screen.getByRole('tab', { name: /工具调用与操作审计/i });
    fireEvent.click(auditTab);

    await waitFor(() => {
      expect(screen.getByText('publish_article')).toBeTruthy();
    });

    // Click row or detail button
    const detailButtons = screen.getAllByRole('button', { name: /详情/i });
    fireEvent.click(detailButtons[0]);

    // Modal opens
    expect(screen.getByText('工具调用与审批审计详情')).toBeTruthy();
    expect(screen.getByText(/输入参数载荷 \(Input Payload JSON\)/i)).toBeTruthy();

    // Close modal
    const closeBtn = screen.getByRole('button', { name: '×' });
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByText('工具调用与审批审计详情')).toBeNull();
    });
  });

  it('opens and closes the 40vw execution timeline drawer when "执行时间线" button is clicked', async () => {
    const onShowToast = vi.fn();
    render(<CopilotLogsView onShowToast={onShowToast} />);

    await waitFor(() => {
      expect(screen.getByText('分析小红书竞品流量差距')).toBeTruthy();
    });

    const timelineBtns = screen.getAllByRole('button', { name: /执行时间线/i });
    expect(timelineBtns.length).toBeGreaterThan(0);
    fireEvent.click(timelineBtns[0]);

    // Drawer opens
    const drawer = screen.getByRole('dialog', { name: /执行时间线抽屉/i });
    expect(drawer).toBeTruthy();
    const panel = drawer.querySelector('.agent-drawer-panel') as HTMLElement;
    expect(panel?.style?.width).toBe('40vw');

    // Close drawer
    const closeBtn = screen.getByTitle('关闭抽屉');
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /执行时间线抽屉/i })).toBeNull();
    });
  });
});
