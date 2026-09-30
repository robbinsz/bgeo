import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { LoginView } from './LoginView';

describe('LoginView Component', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders light theme login screen with back-to-landing link and form inputs', () => {
    render(
      <BrowserRouter>
        <LoginView
          onLoginSuccess={vi.fn()}
          onShowToast={vi.fn()}
        />
      </BrowserRouter>
    );

    const backLink = screen.getByTitle('返回官网首页');
    expect(backLink).toBeTruthy();
    expect(backLink.getAttribute('href')).toBe('/');

    expect(screen.getByText('GeoPilot (Bgeo)')).toBeTruthy();
    expect(screen.getByText('账号登录')).toBeTruthy();
    expect(screen.getByLabelText(/企业邮箱 \/ 账号/i)).toBeTruthy();
    expect(screen.getByLabelText(/访问密码/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /进入 GEO 工作台/i })).toBeTruthy();
  });

  it('toggles password visibility when password reveal icon is clicked', () => {
    render(
      <BrowserRouter>
        <LoginView
          onLoginSuccess={vi.fn()}
          onShowToast={vi.fn()}
        />
      </BrowserRouter>
    );

    const passwordInput = screen.getByLabelText(/访问密码/i) as HTMLInputElement;
    expect(passwordInput.type).toBe('password');

    const toggleBtns = screen.getAllByRole('button', { name: '显示密码' });
    expect(toggleBtns.length).toBeGreaterThan(0);
    fireEvent.click(toggleBtns[0]);

    expect(passwordInput.type).toBe('text');

    const hideBtns = screen.getAllByRole('button', { name: '隐藏密码' });
    expect(hideBtns.length).toBeGreaterThan(0);
    fireEvent.click(hideBtns[0]);

    expect(passwordInput.type).toBe('password');
  });
});
