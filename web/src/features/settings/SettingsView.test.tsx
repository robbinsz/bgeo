import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, fireEvent, screen, cleanup, waitFor } from '@testing-library/react';
import { SettingsView } from './SettingsView';
import { api } from '../../services/api';
import { PermissionContext } from '../../hooks/permissions';

vi.mock('../../services/api', () => ({
  api: {
    getSystemStatus: vi.fn(),
    getProject: vi.fn(),
    getSchedule: vi.fn(),
    updateProjectSettings: vi.fn(),
    getAIConfig: vi.fn(),
    updateAIConfig: vi.fn(),
    testAIConfig: vi.fn(),
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

describe('SettingsView Component Redesign', () => {
  const onShowToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (api.getSystemStatus as any).mockResolvedValue({
      expired_leases: 2,
      unknown_publications: 1,
      schema_version: '1.2.0',
      jobs: [
        { status: 'running', count: 3 },
        { status: 'queued', count: 5 },
      ],
      observed_at: '2026-10-01T12:00:00Z',
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
    (api.getAIConfig as any).mockResolvedValue({
      provider: 'deepseek',
      base_url: 'https://api.deepseek.com/v1',
      model_name: 'deepseek-chat',
      temperature: 0.3,
      masked_key: 'sk-****8888',
    });
    (api.updateProjectSettings as any).mockResolvedValue({ status: 'ok' });
    (api.updateAIConfig as any).mockResolvedValue({ status: 'ok', model: 'deepseek-chat' });
    (api.testAIConfig as any).mockResolvedValue({
      success: true,
      message: '端点响应正常 (耗时 120ms)',
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders top KPI cards and default governance view', async () => {
    renderWithPerms(<SettingsView onShowToast={onShowToast} />);

    // Check KPI cards
    expect(screen.getByText('自治治理等级')).toBeDefined();
    expect(screen.getByText('Worker 调度状态')).toBeDefined();
    expect(screen.getByText('底层接入大模型')).toBeDefined();
    expect(screen.getByText('系统架构健康度')).toBeDefined();

    // Check default values
    await waitFor(() => {
      expect(screen.getByText('L2 · 推荐模式')).toBeDefined();
      expect(screen.getByText('正常轮询中')).toBeDefined();
      expect(screen.getByText('v1.2.0')).toBeDefined();
    });

    // Check Tab navigation
    expect(screen.getByText('项目治理与调度')).toBeDefined();
    expect(screen.getByText('AI 大模型引擎接入')).toBeDefined();
    expect(screen.getByText('系统健康与对账')).toBeDefined();
  });

  it('allows switching automation level and toggling worker pause', async () => {
    renderWithPerms(<SettingsView onShowToast={onShowToast} />);

    await waitFor(() => {
      expect(screen.getByText('L2 · 推荐：人机协作自闭环')).toBeDefined();
    });

    // Click L3 level card
    const l3Card = screen.getByText('L3 · 深度自治与自进化');
    fireEvent.click(l3Card);

    // Toggle pause checkbox
    const pauseToggle = screen.getByLabelText(/暂停当前项目全部后台调度任务/i) as HTMLInputElement;
    expect(pauseToggle.checked).toBe(false);
    fireEvent.click(pauseToggle);
    expect(pauseToggle.checked).toBe(true);

    // Submit form
    const saveBtn = screen.getByText('保存治理配置');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(api.updateProjectSettings).toHaveBeenCalledWith({
        automation_level: 'L3',
        is_paused: true,
      });
      expect(onShowToast).toHaveBeenCalledWith('项目治理设置已成功保存');
    });
  });

  it('switches to AI engine tab and manages AI configuration', async () => {
    renderWithPerms(<SettingsView onShowToast={onShowToast} />);

    // Switch to AI tab
    const aiTabBtn = screen.getByText('AI 大模型引擎接入');
    fireEvent.click(aiTabBtn);

    // Verify presets are displayed
    await waitFor(() => {
      expect(screen.getByText('DeepSeek')).toBeDefined();
      expect(screen.getByText('通义千问 (Qwen)')).toBeDefined();
      expect(screen.getByText('Kimi (月之暗面)')).toBeDefined();
      expect(screen.getByText('OpenAI (GPT-4o)')).toBeDefined();
    });

    // Click Qwen preset
    fireEvent.click(screen.getByText('通义千问 (Qwen)'));

    // Check that Base URL updated
    expect(screen.getByDisplayValue('https://dashscope.aliyuncs.com/compatible-mode/v1')).toBeDefined();
    expect(screen.getByDisplayValue('qwen-plus')).toBeDefined();

    // Test connection
    const testBtn = screen.getByText('测试连通性');
    fireEvent.click(testBtn);

    await waitFor(() => {
      expect(api.testAIConfig).toHaveBeenCalled();
      expect(screen.getByText('端点响应正常 (耗时 120ms)')).toBeDefined();
    });

    // Save model configuration
    const saveModelBtn = screen.getByText('保存模型配置');
    fireEvent.click(saveModelBtn);

    await waitFor(() => {
      expect(api.updateAIConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'qwen',
          base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
          model_name: 'qwen-plus',
        }),
      );
      expect(onShowToast).toHaveBeenCalledWith('大模型配置已保存', '当前模型：qwen-plus');
    });
  });

  it('switches to system health tab and displays audit metrics', async () => {
    renderWithPerms(<SettingsView onShowToast={onShowToast} />);

    // Switch to health tab
    const healthTabBtn = screen.getByText('系统健康与对账');
    fireEvent.click(healthTabBtn);

    await waitFor(() => {
      expect(screen.getByText('过期租约 (Expired Leases)')).toBeDefined();
      expect(screen.getByText('待核对发布 (Unknown Pubs)')).toBeDefined();
      expect(screen.getByText('Worker 队列认领与运行概况')).toBeDefined();
      expect(screen.getByText('running')).toBeDefined();
      expect(screen.getByText('queued')).toBeDefined();
    });
  });
});
