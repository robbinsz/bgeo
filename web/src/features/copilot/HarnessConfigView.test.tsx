import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, fireEvent, screen, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HarnessConfigView } from './HarnessConfigView';
import { PermissionContext } from '../../hooks/permissions';
import { api } from '../../services/api';

vi.mock('../../services/api', () => ({
  api: {
    getHarnessConfig: vi.fn(),
    updateHarnessConfig: vi.fn(),
    getMCPServers: vi.fn(),
    createMCPServer: vi.fn(),
    updateMCPServer: vi.fn(),
    deleteMCPServer: vi.fn(),
    pingMCPServer: vi.fn(),
    getMemoryEntries: vi.fn(),
    createMemoryEntry: vi.fn(),
    updateMemoryEntry: vi.fn(),
    deleteMemoryEntry: vi.fn(),
    approveMemory: vi.fn(),
    triggerMemoryHook: vi.fn(),
    getCustomSkills: vi.fn(),
    createCustomSkill: vi.fn(),
    updateCustomSkill: vi.fn(),
    deleteCustomSkill: vi.fn(),
    toggleCustomSkill: vi.fn(),
    importCustomSkill: vi.fn(),
    getAgentTraces: vi.fn(),
  },
  getProjectID: vi.fn(() => 'test-project-id'),
  authService: {
    getGeneration: vi.fn(() => 1),
    getUser: vi.fn(() => ({ id: 'u1', role: 'admin' })),
    subscribe: vi.fn(() => () => {}),
  },
}));

describe('HarnessConfigView Component', () => {
  beforeEach(() => {
    vi.mocked(api.getHarnessConfig).mockResolvedValue({
      id: 'cfg-1',
      enabled_skills: JSON.stringify(['monitor', 'diagnosis', 'content']),
      max_history_turns: 12,
    });
    vi.mocked(api.getAgentTraces).mockResolvedValue({
      items: [
        {
          id: 'trace-1',
          project_id: 'p1',
          session_id: 'sess-1',
          user_prompt: '分析竞品差距',
          model_name: 'gpt-4o',
          total_duration_ms: 1250,
          status: 'completed',
          timeline_json: JSON.stringify([{ step: 1, name: 'diagnosis' }]),
          created_at: new Date().toISOString(),
        },
      ],
    });
    vi.mocked(api.getCustomSkills).mockResolvedValue({
      items: [
        {
          id: 'skill-1',
          skill_id: 'seo-cluster',
          name: 'SEO 关键词聚类',
          description: '关键词矩阵与语义聚合',
          content: '# SEO Cluster Guide',
          file_names: JSON.stringify(['SKILL.md']),
          is_active: true,
        },
      ],
    });
    vi.mocked(api.getMCPServers).mockResolvedValue({
      items: [
        {
          id: 'mcp-1',
          name: '内部 CRM 数据源',
          endpoint_url: 'https://mcp.internal.test/stream',
          transport_type: 'streamable_http',
          is_active: true,
          has_credentials: true,
          cached_tools: JSON.stringify([{ name: 'query_lead', description: '查询线索' }]),
        },
      ],
    });
    vi.mocked(api.getMemoryEntries).mockResolvedValue({
      items: [
        {
          id: 'mem-1',
          title: '上门服务准则',
          content: '开荒保洁必须佩戴鞋套',
          memory_type: 'user_pref',
          status: 'approved',
          tags: '保洁, 规范',
          is_pinned: true,
          score_weight: 1.5,
          version: 1,
          extraction_source: 'manual',
          evidence: '',
        },
      ],
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const renderView = (onShowToast = vi.fn()) =>
    render(
      <MemoryRouter>
        <PermissionContext.Provider value={{ write: true, review: true, admin: true }}>
          <HarnessConfigView onShowToast={onShowToast} />
        </PermissionContext.Provider>
      </MemoryRouter>,
    );

  it('renders all 4 tabs and defaults to "核心能力装配"', async () => {
    const onShowToast = vi.fn();
    renderView(onShowToast);

    // Check all tab buttons
    expect(screen.getByRole('tab', { name: /核心能力装配/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Skill 技能中心/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /MCP 服务/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /长期记忆/i })).toBeTruthy();

    // Default tab contains "已装载的 Agent 能力集" and runtime framework blueprint
    await waitFor(() => {
      expect(screen.getByText('已装载的 Agent 能力集')).toBeTruthy();
      expect(screen.getByText('GEOFlow 运营副驾驶执行框架')).toBeTruthy();
    });
  });

  it('switches to "Skill 技能中心" tab and displays custom skills and actions', async () => {
    const onShowToast = vi.fn();
    renderView(onShowToast);

    const skillsTab = screen.getByRole('tab', { name: /Skill 技能中心/i });
    fireEvent.click(skillsTab);

    await waitFor(() => {
      expect(screen.getByText('Skill 技能中心 (Custom Skills)')).toBeTruthy();
      expect(screen.getByRole('button', { name: /导入 ZIP 技能包/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /新建技能/i })).toBeTruthy();
      expect(screen.getByText('SEO 关键词聚类')).toBeTruthy();
    });
  });

  it('switches to "MCP 服务" tab and displays registered servers', async () => {
    const onShowToast = vi.fn();
    renderView(onShowToast);

    const mcpTab = screen.getByRole('tab', { name: /MCP 服务/i });
    fireEvent.click(mcpTab);

    await waitFor(() => {
      expect(screen.getByText(/外部 MCP 协议服务/i)).toBeTruthy();
      expect(screen.getByRole('button', { name: /注册 MCP 服务/i })).toBeTruthy();
      expect(screen.getByText('内部 CRM 数据源')).toBeTruthy();
    });
  });

  it('switches to "长期记忆" tab and displays knowledge entries and filtering', async () => {
    const onShowToast = vi.fn();
    renderView(onShowToast);

    const memoryTab = screen.getByRole('tab', { name: /长期记忆/i });
    fireEvent.click(memoryTab);

    await waitFor(() => {
      expect(screen.getByText(/副驾驶长期知识与偏好记忆库/i)).toBeTruthy();
      expect(screen.getByRole('button', { name: /录入新记忆/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /对话提取测试/i })).toBeTruthy();
      expect(screen.getByText('上门服务准则')).toBeTruthy();
    });
  });

  it('opens and closes the "新建技能" modal', async () => {
    const onShowToast = vi.fn();
    renderView(onShowToast);

    const skillsTab = screen.getByRole('tab', { name: /Skill 技能中心/i });
    fireEvent.click(skillsTab);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /新建技能/i })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /新建技能/i }));

    expect(screen.getByText('新建自定义技能')).toBeTruthy();
    expect(screen.getByText(/技能唯一标识 \(Skill ID\)/i)).toBeTruthy();

    // Close modal
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    await waitFor(() => {
      expect(screen.queryByText('新建自定义技能')).toBeNull();
    });
  });
});
