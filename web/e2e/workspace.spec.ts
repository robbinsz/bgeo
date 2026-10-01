import { test, expect, type Page } from '@playwright/test';
const project = {
  id: 'p1',
  name: '测试项目',
  brand_name: '测试品牌',
  automation_level: 'L2',
  is_paused: false,
  daily_sample_limit: 100,
  brand_aliases: '[]',
  timezone: 'Asia/Shanghai',
};
const user = {
  id: 'u1',
  email: 'owner@example.test',
  name: '测试用户',
  role: 'owner',
};
async function workspace(
  page: Page,
  options: {
    role?: string;
    responses?: Record<string, unknown>;
    failedPath?: string;
  } = {},
) {
  const role = options.role ?? 'owner';
  await page.addInitScript(
    ({ user, role }) => {
      sessionStorage.setItem('geopilot_access_token', 'test-access');
      sessionStorage.setItem('geopilot_user', JSON.stringify({ ...user, role }));
      sessionStorage.setItem('bgeo_project_id', 'p1');
    },
    { user, role },
  );
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    const values: Record<string, unknown> = {
      '/auth/me': { ...user, role },
      '/projects': { items: [project] },
      '/runtime': { mode: 'live', environment: 'test' },
      '/projects/current': project,
      '/projects/access': {
        role,
        write: role !== 'viewer',
        review: role === 'owner',
        admin: role === 'owner',
      },
      '/schedules': {},
      '/overview/metrics': {
        voice_share: null,
        query_coverage: null,
        avg_rank: null,
        citations_count: 0,
        valid_samples: 0,
        failed_samples: 0,
        active_rules_count: 0,
        source: 'live',
      },
      '/system/status': {
        jobs: [],
        expired_leases: 0,
        unknown_publications: 0,
        schema_version: 3,
        observed_at: '2026-09-30T00:00:00Z',
      },
      '/system/ai-config': { model_name: 'test-model' },
      '/harness/config': { enabled_skills: '[]', max_history_turns: 10 },
      ...options.responses,
    };
    await route.fulfill({
      status: path === options.failedPath ? 503 : 200,
      json:
        path === options.failedPath
          ? { error: '测试数据库不可用' }
          : (values[path] ?? { items: [] }),
    });
  });
}
test('empty dashboards show unknown metrics and actual empty lists', async ({ page }) => {
  await workspace(page);
  await page.goto('/overview');
  await expect(page.getByRole('heading', { name: 'GEO 运行总览' })).toBeVisible();
  await expect(page.getByText('未设置监测计划')).toBeVisible();
  await expect(page.getByText('暂无任务', { exact: true })).toBeVisible();
  await expect(page.getByText('34.8%')).toHaveCount(0);
  await page.goto('/strategy');
  await expect(page.getByText('暂无符合条件的策略')).toBeVisible();
  await expect(page.getByText('武汉家政品牌对比内容集群')).toHaveCount(0);
});
test('backend backlog status, risk filter and pagination work together', async ({ page }) => {
  await workspace(page, {
    responses: {
      '/strategies': {
        items: [
          {
            id: 's1',
            title: '真实策略',
            status: 'backlog',
            risk_level: 'high',
            assignee: 'editor',
            objective: '真实目标',
          },
        ],
        pagination: { limit: 100, offset: 0, has_more: false },
      },
    },
  });
  await page.goto('/strategy');
  await expect(page.getByRole('heading', { name: '真实策略' })).toBeVisible();
  await page.getByLabel('风险等级').selectOption('low');
  await expect(page.getByText('暂无符合条件的策略')).toBeVisible();
  await page.getByLabel('风险等级').selectOption('high');
  await expect(page.getByRole('heading', { name: '真实策略' })).toBeVisible();
  await expect(page.getByRole('button', { name: '下一页' })).toBeDisabled();
});
test('viewer controls are disabled and failed reads remain visible', async ({ page }) => {
  await workspace(page, { role: 'viewer', failedPath: '/monitor/queries' });
  await page.goto('/monitor');
  await expect(page.getByRole('button', { name: '＋ 新增问题' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '启动批次' })).toBeDisabled();
  await expect(page.getByRole('alert').filter({ hasText: '测试数据库不可用' })).toBeVisible();
});
test('viewer can read Copilot history but cannot submit instructions or approve actions on mobile', async ({
  page,
}) => {
  await workspace(page, {
    role: 'viewer',
    responses: {
      '/copilot/sessions': {
        items: [
          {
            id: 'session',
            title: '只读会话',
            created_at: '2026-09-30T00:00:00Z',
            last_active_at: '2026-09-30T00:00:00Z',
          },
        ],
      },
      '/copilot/sessions/session': {
        session: { id: 'session' },
        messages: [
          {
            id: 'approval',
            session_id: 'session',
            role: 'assistant',
            content: '待审核操作',
            created_at: '2026-09-30T00:00:00Z',
            card_status: 'pending',
            card_type: 'preview_tool',
            card_payload: JSON.stringify({
              interrupt_id: 'i1',
              card_type: 'preview_tool',
              title: '待审核工具',
              description: '真实预览',
              details: { tool: 'test' },
            }),
          },
        ],
      },
    },
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/copilot');
  await expect(page.getByText('待审核操作', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '运营指令' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '确认并投递任务' })).toBeDisabled();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
});
test('task dialog traps focus and closes with Escape on mobile', async ({ page }) => {
  await workspace(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/content');
  const open = page.getByRole('button', { name: '＋ 新建草稿' });
  await expect(open).toBeEnabled();
  await open.click();
  const dialog = page.getByRole('dialog', { name: '创建内容草稿' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '保存', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: '关闭', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(open).toBeFocused();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
});
test('persisted malicious assistant Markdown cannot execute', async ({ page }) => {
  await workspace(page, {
    responses: {
      '/copilot/sessions': {
        items: [
          {
            id: 'session',
            title: '安全测试',
            created_at: '2026-09-30T00:00:00Z',
            last_active_at: '2026-09-30T00:00:00Z',
          },
        ],
      },
      '/copilot/sessions/session': {
        session: { id: 'session' },
        messages: [
          {
            id: 'm1',
            session_id: 'session',
            role: 'assistant',
            content: '<img src=x onerror="window.__xss=true">\n\n安全消息',
            created_at: '2026-09-30T00:00:00Z',
          },
        ],
      },
    },
  });
  await page.goto('/copilot');
  await expect(page.getByText('安全消息', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => Reflect.get(window, '__xss'))).toBeUndefined();
  await expect(page.locator('.markdown-content [onerror]')).toHaveCount(0);
});

test('every business route renders its empty state without JavaScript errors', async ({ page }) => {
  await workspace(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const route of [
    'diagnosis',
    'evolution',
    'sources',
    'settings',
    'publish',
    'experiments',
    'monitor',
    'content',
    'strategy',
    'copilot/harness',
  ]) {
    await page.goto('/' + route);
    await expect(page.locator('main h1')).toBeVisible();
    await expect(page.getByRole('heading', { name: '页面暂时无法显示' })).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});
