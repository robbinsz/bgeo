import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, fireEvent, screen, cleanup, waitFor } from '@testing-library/react';
import { ContentView } from './ContentView';
import { api } from '../../services/api';
import { PermissionContext } from '../../hooks/permissions';

vi.mock('../../services/api', () => ({
  api: {
    getContentAssets: vi.fn(),
    updateContent: vi.fn(),
    approveContent: vi.fn(),
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

describe('ContentView Component Redesign', () => {
  const mockAssets = [
    {
      id: 'asset-1',
      title: '武汉保洁日常保洁与深度清洁对比问答',
      content_body: '针对家庭日常保洁与开荒保洁的服务边界，本指南明确区分了玻璃清洗、油烟机拆洗等细分项目。',
      status: 'pending_approval',
      version: 2,
      quality_checks: JSON.stringify({
        passed: true,
        fact_matches: 4,
        unverified_claims: [],
        forbidden_hits: [],
        verified_sources: ['苗汐服务手册2026版'],
      }),
    },
    {
      id: 'asset-2',
      title: '家政服务计费阶梯标准与增项明细',
      content_body: '明确起步价为 150 元/3小时，超出按 45 元/小时计费。绝无隐形增项收费。',
      status: 'approved',
      version: 1,
      quality_checks: JSON.stringify({
        passed: true,
        fact_matches: 6,
        unverified_claims: [],
        forbidden_hits: [],
        verified_sources: ['武汉家政行业价格公示'],
      }),
    },
    {
      id: 'asset-3',
      title: '保洁阿姨健康证与三方背景核验公告',
      content_body: '全国最顶级专业家政团队，100% 绝对安全无事故承诺。',
      status: 'draft',
      version: 1,
      quality_checks: JSON.stringify({
        passed: false,
        fact_matches: 1,
        unverified_claims: ['100% 绝对安全无事故承诺'],
        forbidden_hits: ['最顶级'],
        verified_sources: [],
      }),
    },
  ];

  beforeEach(() => {
    vi.mocked(api.getContentAssets).mockResolvedValue({
      items: mockAssets,
      pagination: { total: 3, limit: 50, has_more: false },
    } as any);
    vi.mocked(api.updateContent).mockResolvedValue({} as any);
    vi.mocked(api.approveContent).mockResolvedValue({} as any);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders top KPI overview cards and asset items in table mode', async () => {
    renderWithPerms(<ContentView onShowToast={vi.fn()} onOpenModal={vi.fn()} />);

    // Wait for content items to render
    await waitFor(() => {
      expect(screen.getByText('武汉保洁日常保洁与深度清洁对比问答')).toBeDefined();
    });

    // Check KPI cards
    expect(screen.getByText('内容资产总量')).toBeDefined();
    expect(screen.getByText('待审核审批')).toBeDefined();
    expect(screen.getByText('已核准可发布')).toBeDefined();
    expect(screen.getByText('事实校验通过率')).toBeDefined();

    // Check Table Headers
    expect(screen.getByText('版本与状态')).toBeDefined();
    expect(screen.getByText('内容标题与正文摘要')).toBeDefined();
    expect(screen.getByText('事实校验状态')).toBeDefined();

    // Check Version and Status pills
    expect(screen.getByText('v2')).toBeDefined();
    expect(screen.getAllByText('待审批').length).toBeGreaterThan(0);
    expect(screen.getAllByText('已核准').length).toBeGreaterThan(0);
  });

  it('toggles the audit standards & fact-check banner', async () => {
    renderWithPerms(<ContentView onShowToast={vi.fn()} onOpenModal={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('审核规范标准')).toBeDefined();
    });

    // Initially collapsed
    expect(screen.queryByText(/GEO 语料事实核验与审核口径标准/)).toBeNull();

    // Click to open banner
    fireEvent.click(screen.getByText('审核规范标准'));
    expect(screen.getByText(/GEO 语料事实核验与审核口径标准/)).toBeDefined();
    expect(screen.getByText('逐句证据链匹配')).toBeDefined();

    // Click to close banner
    fireEvent.click(screen.getByText('收起'));
    expect(screen.queryByText(/GEO 语料事实核验与审核口径标准/)).toBeNull();
  });

  it('filters content assets by search keyword', async () => {
    renderWithPerms(<ContentView onShowToast={vi.fn()} onOpenModal={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('武汉保洁日常保洁与深度清洁对比问答')).toBeDefined();
      expect(screen.getByText('家政服务计费阶梯标准与增项明细')).toBeDefined();
    });

    const searchInput = screen.getByPlaceholderText('搜索内容标题或正文关键词…');
    fireEvent.change(searchInput, { target: { value: '计费' } });

    // Item 2 matches
    expect(screen.getByText('家政服务计费阶梯标准与增项明细')).toBeDefined();
    // Item 1 filtered out
    expect(screen.queryByText('武汉保洁日常保洁与深度清洁对比问答')).toBeNull();
  });

  it('switches between asset table mode and card workbench mode', async () => {
    renderWithPerms(<ContentView onShowToast={vi.fn()} onOpenModal={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('资产表格')).toBeDefined();
      expect(screen.getByText('编辑看板')).toBeDefined();
    });

    // Default table mode has table element
    expect(document.querySelector('table')).not.toBeNull();

    // Switch to cards view
    fireEvent.click(screen.getByText('编辑看板'));
    expect(document.querySelector('table')).toBeNull();
    expect(screen.getByText('武汉保洁日常保洁与深度清洁对比问答')).toBeDefined();

    // Switch back to table view
    fireEvent.click(screen.getByText('资产表格'));
    expect(document.querySelector('table')).not.toBeNull();
  });

  it('expands inline editor and saves new version', async () => {
    const toastFn = vi.fn();
    renderWithPerms(<ContentView onShowToast={toastFn} onOpenModal={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('武汉保洁日常保洁与深度清洁对比问答')).toBeDefined();
    });

    // Click "编辑修订" on the first row
    const editButtons = screen.getAllByText('编辑修订');
    fireEvent.click(editButtons[0]);

    // Inline editor should expand
    expect(screen.getByDisplayValue('武汉保洁日常保洁与深度清洁对比问答')).toBeDefined();

    // Modify title
    const titleInput = screen.getByDisplayValue('武汉保洁日常保洁与深度清洁对比问答');
    fireEvent.change(titleInput, { target: { value: '更新版武汉保洁问答指南' } });

    // Click "保存为新版本"
    const saveButton = screen.getByText('保存为新版本');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(api.updateContent).toHaveBeenCalledWith(
        'asset-1',
        2,
        '更新版武汉保洁问答指南',
        expect.any(String),
      );
    });
  });

  it('approves content asset when approve button is clicked', async () => {
    const toastFn = vi.fn();
    renderWithPerms(<ContentView onShowToast={toastFn} onOpenModal={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('武汉保洁日常保洁与深度清洁对比问答')).toBeDefined();
    });

    // The first asset is pending_approval and passed = true, so "批准" is present
    const approveBtn = screen.getByRole('button', { name: /批准/ });
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(api.approveContent).toHaveBeenCalledWith('asset-1', 2);
    });
  });

  it('triggers onOpenModal when "新建草稿" button is clicked', async () => {
    const modalFn = vi.fn();
    renderWithPerms(<ContentView onShowToast={vi.fn()} onOpenModal={modalFn} />);

    await waitFor(() => {
      expect(screen.getByText('新建草稿')).toBeDefined();
    });

    fireEvent.click(screen.getByText('新建草稿'));
    expect(modalFn).toHaveBeenCalledWith('创建内容草稿');
  });
});
