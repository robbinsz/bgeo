import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/react';
import { LandingView } from './LandingView';

describe('LandingView Component', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders main marketing headline and key sections', () => {
    render(<LandingView onNavigateLogin={vi.fn()} />);

    expect(screen.getByText(/让每一次商业提问/i)).toBeTruthy();
    expect(screen.getByText(/首推答案/i)).toBeTruthy();
    expect(screen.getAllByText(/4步闭环工作流/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/企业级 GEO 运营闭环/i)).toBeTruthy();
  });

  it('triggers onNavigateLogin when user clicks login CTA while unauthenticated', () => {
    const handleLogin = vi.fn();
    render(<LandingView isAuthenticated={false} onNavigateLogin={handleLogin} />);

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
      />,
    );

    const consoleButtons = screen.getAllByRole('button', { name: /进入项目管理控制台/i });
    expect(consoleButtons.length).toBeGreaterThan(0);

    fireEvent.click(consoleButtons[0]);
    expect(handleConsole).toHaveBeenCalledTimes(1);
  });

  it('opens a real project entry without pretending to submit a lead', () => {
    const handleLogin = vi.fn();
    const handleToast = vi.fn();
    render(<LandingView onNavigateLogin={handleLogin} onShowToast={handleToast} />);
    fireEvent.click(screen.getAllByRole('button', { name: /免费测查品牌 AI 可见度/i })[0]);
    expect(screen.getByRole('dialog', { name: '通过项目监测查看品牌可见度' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '进入项目监测' }));
    expect(handleLogin).toHaveBeenCalledOnce();
    expect(handleToast).not.toHaveBeenCalled();
    expect(screen.queryByText(/申请已成功提交/)).toBeNull();
  });
});
