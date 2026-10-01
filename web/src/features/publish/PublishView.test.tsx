import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, fireEvent, screen, cleanup, waitFor } from '@testing-library/react';
import { PublishView } from './PublishView';
import { api } from '../../services/api';
import { PermissionContext } from '../../hooks/permissions';

vi.mock('../../services/api', () => ({
  api: {
    getChannels: vi.fn(),
    getPublications: vi.fn(),
    getContentAssets: vi.fn(),
    createChannel: vi.fn(),
    disableChannel: vi.fn(),
    previewPublication: vi.fn(),
    reconcilePublication: vi.fn(),
  },
  streamSSE: vi.fn(),
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

describe('PublishView Component Redesign', () => {
  const mockChannels = [
    {
      id: 'chan-1',
      name: '官网知识中心 Webhook',
      endpoint_url: 'https://api.bgeo.cc/v1/articles',
      is_active: true,
      has_credential: true,
    },
    {
      id: 'chan-2',
      name: '第三方内容专栏',
      endpoint_url: 'https://zhihu.com/webhook/geo',
      is_active: false,
      has_credential: false,
    },
  ];

  const mockPublications = [
    {
      id: 'pub-89102-uuid-abc',
      asset_id: 'asset-1',
      asset_version: 2,
      channel_id: 'chan-1',
      status: 'published',
      target_url: 'https://bgeo.cc/articles/wuhan-cleaning-faq',
    },
    {
      id: 'pub-89103-uuid-def',
      asset_id: 'asset-2',
      asset_version: 1,
      channel_id: 'chan-1',
      status: 'outcome_unknown',
      error_message: '网络短暂抖动，正在等待回执核对',
    },
  ];

  const mockAssets = [
    {
      id: 'asset-1',
      title: '武汉保洁日常保洁与深度清洁对比问答',
      content_body: '针对家庭日常保洁与开荒保洁的服务边界...',
      status: 'approved',
      version: 2,
      quality_checks: '{}',
    },
  ];

  beforeEach(() => {
    vi.mocked(api.getChannels).mockResolvedValue({
      items: mockChannels,
    } as any);
    vi.mocked(api.getPublications).mockResolvedValue({
      items: mockPublications,
    } as any);
    vi.mocked(api.getContentAssets).mockResolvedValue({
      items: mockAssets,
      pagination: { total: 1, limit: 50, has_more: false },
    } as any);
    vi.mocked(api.reconcilePublication).mockResolvedValue({} as any);
    vi.mocked(api.disableChannel).mockResolvedValue({} as any);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders top KPI cards and receipts table', async () => {
    renderWithPerms(<PublishView onShowToast={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/pub-89102/)).toBeDefined();
    });

    // Check KPI cards
    expect(screen.getByText('分发渠道总数')).toBeDefined();
    expect(screen.getByText('可发布已核准内容')).toBeDefined();
    expect(screen.getByText('投递成功回执')).toBeDefined();
    expect(screen.getByText('待对账与投递中')).toBeDefined();

    // Check table headers
    expect(screen.getByText(/发布 ID \/ 资产版本/)).toBeDefined();
    expect(screen.getByText('回执核对状态')).toBeDefined();
    expect(screen.getByText(/结果地址 \/ 响应信息/)).toBeDefined();
  });

  it('reconciles publication when "核对回执" is clicked', async () => {
    renderWithPerms(<PublishView onShowToast={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/pub-89103/)).toBeDefined();
    });

    const reconcileBtn = screen.getByRole('button', { name: /核对回执/ });
    fireEvent.click(reconcileBtn);

    await waitFor(() => {
      expect(api.reconcilePublication).toHaveBeenCalledWith('pub-89103-uuid-def');
    });
  });

  it('switches to dispatch tab and channel management tab', async () => {
    renderWithPerms(<PublishView onShowToast={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('发起分发任务')).toBeDefined();
      expect(screen.getByText('渠道配置管理')).toBeDefined();
    });

    // Switch to dispatch tab
    fireEvent.click(screen.getByText('发起分发任务'));
    expect(screen.getByText('发起幂等内容分发')).toBeDefined();
    expect(screen.getByText(/武汉保洁日常保洁与深度清洁对比问答/)).toBeDefined();

    // Switch to channels tab
    fireEvent.click(screen.getByText('渠道配置管理'));
    expect(screen.getByText('官网知识中心 Webhook')).toBeDefined();

    // Click disable channel
    const disableBtn = screen.getByRole('button', { name: /停用/ });
    fireEvent.click(disableBtn);

    await waitFor(() => {
      expect(api.disableChannel).toHaveBeenCalledWith('chan-1');
    });
  });
});
