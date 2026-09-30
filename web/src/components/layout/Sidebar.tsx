import React from 'react';
import { NavLink } from 'react-router-dom';
import type { ViewType } from '../../types';
import type { UserProfile } from '../../services/auth';

interface SidebarProps {
  currentView?: ViewType;
  onNavigate?: (view: ViewType) => void;
  isOpen: boolean;
  onClose: () => void;
  currentUser?: UserProfile | null;
  onLogout?: () => void;
  onOpenProfile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  currentUser,
  onLogout,
  onOpenProfile,
}) => {
  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`} id="sidebar" aria-label="主导航">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16.5 7.5A7.5 7.5 0 1 0 19 13" />
            <path d="m15.5 4.5 4 3-4 3" />
            <circle cx="11.5" cy="12" r="2.2" />
          </svg>
        </div>
        <div className="brand-name">
          Bgeo<small>bgeo.cc · GEO ENGINE</small>
        </div>
      </div>

      <div className="nav-label">工作台</div>
      <nav className="nav">
        <NavLink
          to="/overview"
          end
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          onClick={onClose}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <rect x="3" y="3" width="7" height="7" rx="2" />
            <rect x="14" y="3" width="7" height="7" rx="2" />
            <rect x="3" y="14" width="7" height="7" rx="2" />
            <rect x="14" y="14" width="7" height="7" rx="2" />
          </svg>
          总览
        </NavLink>

        <NavLink
          to="/monitor"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          onClick={onClose}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M3 12h4l2.2-6 4.1 12 2.2-6H21" />
            <path d="M5 21h14" />
          </svg>
          监测中心 <span className="badge">6</span>
        </NavLink>

        <NavLink
          to="/diagnosis"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          onClick={onClose}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="11" cy="11" r="7" />
            <path d="m16 16 5 5M8 11h6M11 8v6" />
          </svg>
          机会诊断 <span className="badge hot">12</span>
        </NavLink>

        <NavLink
          to="/strategy"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          onClick={onClose}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M5 4h14v5H5zM5 15h14v5H5z" />
            <path d="M8 9v6M16 9v6" />
          </svg>
          策略编排
        </NavLink>

        <NavLink
          to="/content"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          onClick={onClose}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6M8 13h8M8 17h6" />
          </svg>
          内容工厂
        </NavLink>

        <NavLink
          to="/publish"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          onClick={onClose}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M22 2 11 13" />
            <path d="m22 2-7 20-4-9-9-4z" />
          </svg>
          发布与分发
        </NavLink>

        <NavLink
          to="/experiments"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          onClick={onClose}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3" />
            <path d="M7.5 16h9" />
          </svg>
          实验中心
        </NavLink>

        <NavLink
          to="/evolution"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          onClick={onClose}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M20 7h-5V2" />
            <path d="M20 7a8 8 0 1 0 1 8" />
            <path d="M9 12h6M12 9v6" />
          </svg>
          自进化中心 <span className="badge">5</span>
        </NavLink>
      </nav>

      <div className="nav-label">副驾驶</div>
      <nav className="nav">
        <NavLink
          to="/copilot"
          end
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          onClick={onClose}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M12 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16z" />
            <path d="M12 6v6l4 2" />
            <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
          </svg>
          运营副驾驶
        </NavLink>

        <NavLink
          to="/copilot/harness"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          onClick={onClose}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
          Harness 装配
        </NavLink>
      </nav>

      <div className="nav-label">管理</div>
      <nav className="nav">
        <NavLink
          to="/sources"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          onClick={onClose}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <ellipse cx="12" cy="5" rx="8" ry="3" />
            <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
          </svg>
          数据源
        </NavLink>

        <NavLink
          to="/settings"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          onClick={onClose}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1z" />
          </svg>
          系统设置
        </NavLink>
      </nav>

      <div className="side-bottom">
        <div className="usage">
          <div className="usage-top">
            <span>本月拨测额度</span>
            <b>6,820 / 10k</b>
          </div>
          <div className="usage-bar">
            <span></span>
          </div>
          <div className="usage-note">剩余 3,180 次 · 11 天后重置</div>
        </div>

        <div
          className="profile"
          onClick={onOpenProfile}
          title={onOpenProfile ? "点击查看与编辑个人资料" : undefined}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: onOpenProfile ? 'pointer' : 'default',
            padding: '8px 8px 6px',
            borderRadius: '10px',
            transition: 'background-color 0.15s ease',
          }}
          onMouseEnter={(e) => {
            if (onOpenProfile) (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(0, 0, 0, 0.04)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
            {currentUser?.avatar ? (
              <img
                src={currentUser.avatar}
                alt={currentUser.name || '头像'}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '9px',
                  objectFit: 'cover',
                  flexShrink: 0,
                  border: '1px solid rgba(0, 0, 0, 0.06)',
                }}
              />
            ) : (
              <div
                className="avatar"
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '9px',
                  backgroundColor: currentUser?.avatar_bg || '#f5d8a8',
                  color: '#744210',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: '13px',
                  fontWeight: 800,
                  flexShrink: 0,
                }}
              >
                {currentUser?.avatar_letter || (currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : 'B')}
              </div>
            )}
            <div className="profile-copy" style={{ minWidth: 0, flex: 1 }}>
              <b style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {currentUser?.name || 'Bgeo'}
              </b>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {currentUser?.team || '增长团队'} · {currentUser?.role === 'admin' ? '管理员' : '运营人员'}
              </span>
            </div>
          </div>
          {onLogout && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onLogout();
              }}
              className="btn ghost small"
              title="退出登录"
              style={{ padding: '3px 7px', fontSize: '11px', color: '#94a3b8', flexShrink: 0 }}
            >
              退出
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};
