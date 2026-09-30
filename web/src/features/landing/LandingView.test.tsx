import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/react';
import { LandingView } from './LandingView';

describe('LandingView Component', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders main marketing headline and key sections', () => {
    render(
      <LandingView
        onNavigateLogin={vi.fn()}
      />
    );

    expect(screen.getByText(/让每一次商业提问/i)).toBeTruthy();
    expect(screen.getByText(/首推答案/i)).toBeTruthy();
    expect(screen.getAllByText(/4步闭环工作流/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/企业级 GEO 运营闭环/i)).toBeTruthy();
  });

  it('triggers onNavigateLogin when user clicks login CTA while unauthenticated', () => {
    const handleLogin = vi.fn();
    render(
      <LandingView
        isAuthenticated={false}
        onNavigateLogin={handleLogin}
      />
    );

    const loginButtons = screen.getAllByRole('button', { name: /登录项目管理控制台/i });
    expect(loginButtons.length).toBeGreaterThan(0);

    fireEvent.click(loginButtons[0]);
    expect(handleLogin).toHaveBeenCalledTimes(1);
  });

  it('triggers onNavigateConsole when user clicks console CTA while authenticated', () => {
    const handleConsole = vi.fn();
    render(
      <LandingView
        isAuthenticated={true}
        onNavigateLogin={vi.fn()}
        onNavigateConsole={handleConsole}
      />
    );

    const consoleButtons = screen.getAllByRole('button', { name: /进入项目管理控制台/i });
    expect(consoleButtons.length).toBeGreaterThan(0);

    fireEvent.click(consoleButtons[0]);
    expect(handleConsole).toHaveBeenCalledTimes(1);
  });

  it('opens audit modal and handles submission', () => {
    const handleShowToast = vi.fn();
    render(
      <LandingView
        onNavigateLogin={vi.fn()}
        onShowToast={handleShowToast}
      />
    );

    const auditButtons = screen.getAllByRole('button', { name: /免费测查品牌 AI 可见度/i });
    fireEvent.click(auditButtons[0]);

    expect(screen.getByText(/测测你的品牌在 DeepSeek \/ 豆包 中的排位/i)).toBeTruthy();

    const brandInput = screen.getByPlaceholderText(/例：东莞市精工机械科技有限公司/i);
    const phoneInput = screen.getByPlaceholderText(/例：13800000000 或 微信号/i);

    fireEvent.change(brandInput, { target: { value: '某高精模具制造厂' } });
    fireEvent.change(phoneInput, { target: { value: '13988887777' } });

    const submitBtn = screen.getByRole('button', { name: /立即获取免费体检报告/i });
    fireEvent.click(submitBtn);

    expect(screen.getByText(/体检申请已成功提交/i)).toBeTruthy();
    expect(handleShowToast).toHaveBeenCalled();
  });
});
