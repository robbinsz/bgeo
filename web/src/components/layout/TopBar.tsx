import React from 'react';
import { Bot } from 'lucide-react';
import type { UserProfile } from '../../services/auth';
import { api } from '../../services/api';

interface TopBarProps {
  onToggleMenu: () => void;
  onShowToast: (title: string, note?: string) => void;
  onSearch?: (query: string) => void;
  currentUser?: UserProfile | null;
  onLogout?: () => void;
  onOpenProfile?: () => void;
  onOpenCopilot?: () => void;
  projectName?: string;
  projects?: { id: string; name: string }[];
  currentProjectId?: string;
  onSelectProject?: (id: string) => void;
  mode?: string;
  isSidebarCollapsed?: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  onToggleMenu,
  onShowToast,
  onSearch,
  currentUser,
  onLogout,
  onOpenProfile,
  onOpenCopilot,
  projectName,
  projects = [],
  currentProjectId,
  onSelectProject,
  mode,
  isSidebarCollapsed = false,
}) => {
  return (
    <header className="topbar">
      <button
        className={`icon-btn menu-btn ${isSidebarCollapsed ? 'collapsed' : ''}`}
        id="menuBtn"
        aria-label={isSidebarCollapsed ? '展开导航菜单' : '收起导航菜单'}
        title={isSidebarCollapsed ? '展开导航菜单' : '收起导航菜单'}
        onClick={onToggleMenu}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      <div className="workspace-selector">
        <div className="workspace-logo" aria-hidden="true">
          {projectName ? projectName.slice(0, 2).toUpperCase() : 'BG'}
        </div>
        {projects && projects.length > 0 ? (
          <div className="workspace-select-wrap">
            <select
              className="workspace-select"
              value={currentProjectId}
              onChange={(e) => onSelectProject?.(e.target.value)}
              aria-label="切换项目"
              title="切换当前项目"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <span className="workspace-chev" aria-hidden="true">▾</span>
          </div>
        ) : (
          <div
            className="workspace-name-wrap"
            onClick={() => onShowToast('当前项目', projectName || '请先选择有权限的项目')}
            title="当前项目"
          >
            <b>{projectName || 'Bgeo · 选择项目'}</b>
          </div>
        )}

        {mode === 'demo' && (
          <span className="demo-pill" title="演示模式：样本不计入真实效果指标">
            <span className="demo-dot"></span>
            演示模式
          </span>
        )}
      </div>

      <label className="top-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="11" cy="11" r="7" />
          <path d="m16 16 5 5" />
        </svg>
        <input
          id="globalSearch"
          placeholder="搜索问题、内容或任务…"
          aria-label="全局搜索"
          onChange={(e) => onSearch?.(e.target.value)}
        />
      </label>

      <div className="top-actions">
        {onOpenCopilot && (
          <button
            onClick={onOpenCopilot}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 11px',
              borderRadius: '8px',
              backgroundColor: '#0f172a',
              color: '#f8fafc',
              fontSize: '12px',
              fontWeight: 500,
              border: '1px solid #334155',
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
              marginRight: '6px',
              transition: 'background-color 0.15s, border-color 0.15s',
            }}
            title="唤出运营副驾驶 (Cmd+K)"
          >
            <Bot size={13} color="#34d399" />
            <span style={{ letterSpacing: '0.01em' }}>副驾驶</span>
            <kbd
              style={{
                fontSize: '10px',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                color: '#cbd5e1',
                padding: '1px 5px',
                borderRadius: '4px',
                border: '1px solid rgba(255, 255, 255, 0.15)',
              }}
            >
              ⌘K
            </kbd>
          </button>
        )}
        <button
          className="icon-btn"
          aria-label="帮助"
          onClick={() => onShowToast('指标口径', '品牌提及率和引用率仅统计最近结束批次中的有效真实回答；演示、失败和拒答样本不计入分母，无法解析的位次显示未知。')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="9" />
            <path d="M9.8 9a2.4 2.4 0 1 1 3 2.3c-.8.3-.8 1-.8 1.7M12 17h.01" />
          </svg>
        </button>

        <button
          className="icon-btn"
          aria-label="通知"
          onClick={async () => {
            try {
              const {items} = await api.getJobs();
              const failed = (items || []).filter(job => job.status === 'failed');
              onShowToast('最近任务状态', `${failed.length} 项失败任务（最近 ${items?.length || 0} 项）；详情请查看总览任务列表。`);
            } catch (error) {
              onShowToast('读取任务状态失败', error instanceof Error ? error.message : '请稍后重试');
            }
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
          </svg>
        </button>

        {currentUser && onOpenProfile && (
          <button
            onClick={onOpenProfile}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '4px 10px 4px 5px',
              borderRadius: '9px',
              border: '1px solid #e2e8f0',
              backgroundColor: '#ffffff',
              cursor: 'pointer',
              marginLeft: '4px',
            }}
            title="点击查看与编辑个人资料"
          >
            {currentUser.avatar ? (
              <img
                src={currentUser.avatar}
                alt={currentUser.name}
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '7px',
                  objectFit: 'cover',
                  border: '1px solid rgba(0,0,0,0.06)',
                }}
              />
            ) : (
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '7px',
                  backgroundColor: currentUser.avatar_bg || '#f5d8a8',
                  color: '#744210',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: '11px',
                  fontWeight: 800,
                }}
              >
                {currentUser.avatar_letter || (currentUser.name ? currentUser.name.charAt(0).toUpperCase() : 'B')}
              </div>
            )}
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>
              {currentUser.name || 'Bgeo'}
            </span>
          </button>
        )}

        {onLogout && (
          <button
            className="icon-btn"
            aria-label="退出登录"
            title={`当前登录：${currentUser?.name || currentUser?.email || '管理员'}（点击退出）`}
            onClick={onLogout}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        )}
      </div>
    </header>
  );
};
