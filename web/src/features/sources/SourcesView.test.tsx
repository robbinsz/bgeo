import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, fireEvent, screen, cleanup, waitFor } from '@testing-library/react';
import { SourcesView } from './SourcesView';
import { api } from '../../services/api';
import { PermissionContext } from '../../hooks/permissions';

vi.mock('../../services/api', () => ({
  api: {
    getAllFacts: vi.fn(),
    createFact: vi.fn(),
    approveFact: vi.fn(),
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

describe('SourcesView Component Redesign', () => {
  const mockFacts = [
    {
      id: 'fact-1',
      fact_type: 'brand_claim',
      statement: '苗汐家政服务人员 100% 具备高级母婴护理与高级家政员国家资格认证。',
      source: 'https://www.bgeo.cc/cert/qualification-2026.pdf',
      status: 'pending',
      version: 1,
    },
    {
      id: 'fact-2',
      fact_type: 'pricing',
      statement: '武汉主城区日常家庭保洁基础计费标准统一为 150 元 / 3 小时。',
      source: 'https://www.bgeo.cc/pricing/standard-2026.html',
      status: 'approved',
      version: 2,
    },
  ];

  beforeEach(() => {
    vi.mocked(api.getAllFacts).mockResolvedValue({
      items: mockFacts,
      pagination: { total: 2, limit: 50, has_more: false },
    } as any);
    vi.mocked(api.createFact).mockResolvedValue({} as any);
    vi.mocked(api.approveFact).mockResolvedValue({} as any);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders top KPI cards and facts table', async () => {
    renderWithPerms(<SourcesView onShowToast={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/高级母婴护理/)).toBeDefined();
    });

    // Check KPI cards
    expect(screen.getByText('可信事实总量')).toBeDefined();
    expect(screen.getByText('已核准可用事实')).toBeDefined();
    expect(screen.getByText('待合规核验')).toBeDefined();
    expect(screen.getByText('公开可核验证据')).toBeDefined();

    // Check table headers
    expect(screen.getByText('版本与状态')).toBeDefined();
    expect(screen.getByText(/事实声明陈述/)).toBeDefined();
    expect(screen.getByText('官方核验证据出处')).toBeDefined();
  });

  it('toggles guidelines banner and filters facts by search query', async () => {
    renderWithPerms(<SourcesView onShowToast={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('事实库准入原则')).toBeDefined();
    });

    // Toggle guidelines
    fireEvent.click(screen.getByText('事实库准入原则'));
    expect(screen.getByText(/事实库核心准入规范/)).toBeDefined();

    // Search
    const searchInput = screen.getByPlaceholderText('搜索事实陈述或证据出处…');
    fireEvent.change(searchInput, { target: { value: '保洁基础计费' } });

    expect(screen.getByText(/保洁基础计费标准/)).toBeDefined();
    expect(screen.queryByText(/高级母婴护理/)).toBeNull();
  });

  it('submits new fact claim and approves pending fact', async () => {
    const toastFn = vi.fn();
    renderWithPerms(<SourcesView onShowToast={toastFn} />);

    await waitFor(() => {
      expect(screen.getByText(/高级母婴护理/)).toBeDefined();
    });

    // Approve pending fact
    const approveBtn = screen.getByRole('button', { name: /核验证据并批准/ });
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(api.approveFact).toHaveBeenCalledWith('fact-1');
    });

    // Open form
    fireEvent.click(screen.getByText('录入事实声明'));
    const stmtInput = screen.getByPlaceholderText(/例如：苗汐家政保洁阿姨/);
    const srcInput = screen.getByPlaceholderText(/https:\/\/www.bgeo.cc/);

    fireEvent.change(stmtInput, { target: { value: '新保洁资质声明' } });
    fireEvent.change(srcInput, { target: { value: 'https://bgeo.cc/cert' } });

    fireEvent.click(screen.getByText('提交事实声明'));

    await waitFor(() => {
      expect(api.createFact).toHaveBeenCalledWith({
        fact_type: 'brand_claim',
        statement: '新保洁资质声明',
        source: 'https://bgeo.cc/cert',
      });
    });
  });
});
