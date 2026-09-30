import React, { useEffect, useState } from 'react';
import { authService, type UserProfile } from '../../services/auth';
import { api } from '../../services/api';

interface LoginViewProps {
  onLoginSuccess: (user: UserProfile) => void;
  onShowToast: (title: string, note?: string) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  onLoginSuccess,
  onShowToast,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [demo, setDemo] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  useEffect(() => {
    let active = true;
    api.getRuntime().then(runtime => { if (active) setDemo(runtime.mode === 'demo'); }).catch(() => {});
    return () => { active = false; };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg('请输入邮箱和密码');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const res = await authService.login(email.trim(), password);
      onShowToast('登录成功', `欢迎回来，${res.user.name || res.user.email}`);
      onLoginSuccess(res.user);
    } catch (err: any) {
      setErrorMsg(err.message || '登录失败，请检查账号密码');
      onShowToast('登录失败', err.message || '请确认账号密码');
    } finally {
      setLoading(false);
    }
  };

  const handleFillDemo = () => {
    setEmail('admin@bgeo.cc');
    setPassword('admin123');
    setErrorMsg('');
    onShowToast('已填入管理员演示账号', '账号: admin@bgeo.cc · 密码: admin123');
  };

  return (
    <div className="login-screen">
      <div className="login-card-container">
        {/* Brand Header */}
        <div className="login-brand">
          <div className="login-logo-chip" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16.5 7.5A7.5 7.5 0 1 0 19 13" />
              <path d="m15.5 4.5 4 3-4 3" />
              <circle cx="11.5" cy="12" r="2.2" />
            </svg>
          </div>
          <div className="login-brand-meta">
            <div className="login-brand-title">
              Bgeo
              <span className="login-chip-tag">bgeo.cc · 自主运营</span>
            </div>
            <p className="login-brand-sub">基于大模型检索自进化的企业级 GEO 品牌声量与可见度运营平台</p>
          </div>
        </div>

        {/* Form Card */}
        <div className="login-card">
          <div className="login-card-header">
            <h3>账号登录</h3>
            <span className="login-security-tag">
              <span className="pulse running" style={{ width: 6, height: 6 }}></span>
              双 Token 鉴权保护
            </span>
          </div>

          {errorMsg && (
            <div className="login-error-alert" role="alert">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="login-form">
            <div className="form-group">
              <label htmlFor="loginEmail">企业邮箱 / 账号</label>
              <div className="input-wrap">
                <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
                <input
                  id="loginEmail"
                  type="email"
                  autoComplete="username"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <div className="form-group-head">
                <label htmlFor="loginPassword">访问密码</label>
                {demo && <button
                  type="button"
                  className="login-link-btn"
                  onClick={handleFillDemo}
                  title="使用预置管理员测试账号"
                >
                  填入演示账号
                </button>}
              </div>
              <div className="input-wrap">
                <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <input
                  id="loginPassword"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                >
                  {showPassword ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn primary login-submit-btn"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="login-spinner"></span>
                  <span>正在验证身份并颁发双 Token...</span>
                </>
              ) : (
                <>
                  <span>进入 GEO 工作台</span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Credentials Footer */}
          {demo && <div className="demo-credentials-box">
            <div className="demo-box-top">
              <b>演示环境预设凭据</b>
              <button
                type="button"
                className="btn small"
                onClick={handleFillDemo}
              >
                点此自动填充
              </button>
            </div>
            <div className="demo-creds-list">
              <div>账号：<code>admin@bgeo.cc</code></div>
              <div>密码：<code>admin123</code> (角色：策略主管 / 增长负责人)</div>
            </div>
          </div>}
        </div>

        {/* Feature Badges Footer */}
        <div className="login-footer-badges">
          <div className="footer-badge-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span>JWT 规范鉴权</span>
          </div>
          <div className="footer-badge-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
            <span>无感静默刷新</span>
          </div>
          <div className="footer-badge-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>单次失效防重放</span>
          </div>
        </div>
      </div>
    </div>
  );
};
