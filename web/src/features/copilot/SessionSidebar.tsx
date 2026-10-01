import React, { useState, useMemo } from 'react';
import type { CopilotSession } from '../../types';
import { usePermissions } from '../../hooks/permissions';
import { groupSessionsByDate } from '../../utils/sessionGrouping';
import { PlusCircle, Trash2, Pencil, Check, X } from 'lucide-react';
/** 左栏：会话列表 (支持分组与重命名/删除) */
interface SessionSidebarProps {
  sessions: CopilotSession[];
  currentSessionId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (e: React.MouseEvent, id: string) => void;
  onRename: (id: string, newTitle: string) => void;
}

export const SessionSidebar: React.FC<SessionSidebarProps> = ({
  sessions,
  currentSessionId,
  onSelect,
  onNew,
  onDelete,
  onRename,
}) => {
  const permissions = usePermissions();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const groups = useMemo(() => groupSessionsByDate(sessions), [sessions]);

  const startEditing = (e: React.MouseEvent, s: CopilotSession) => {
    e.stopPropagation();
    setEditingId(s.id);
    setEditingTitle(s.title);
  };

  const cancelEditing = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingId(null);
    setEditingTitle('');
  };

  const submitEditing = (e?: React.MouseEvent | React.FormEvent, id?: string) => {
    e?.stopPropagation();
    if (!editingId) return;
    const targetId = id || editingId;
    if (editingTitle.trim()) {
      onRename(targetId, editingTitle.trim());
    }
    setEditingId(null);
    setEditingTitle('');
  };

  return (
    <div
      className="copilot-session-sidebar"
      style={{
        width: '230px',
        flexShrink: 0,
        borderRight: '1px solid rgba(226, 232, 240, 0.8)',
        display: 'flex',
        flexDirection: 'column',
        background: '#f8fafc',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          height: '52px',
          padding: '0 14px',
          borderBottom: '1px solid rgba(226, 232, 240, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          boxSizing: 'border-box',
        }}
      >
        <span
          style={{
            fontSize: '12px',
            fontWeight: 650,
            color: '#475467',
            letterSpacing: '0.02em',
          }}
        >
          会话历史
        </span>
        <button
          type="button"
          onClick={onNew}
          title="新建会话"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            padding: '4px 9px',
            borderRadius: '6px',
            background: '#0f172a',
            color: '#f8fafc',
            border: 'none',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: 550,
            transition: 'background 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#1e293b')}
          onMouseLeave={(e) => (e.currentTarget.style.background = '#0f172a')}
        >
          <PlusCircle size={13} />
          新建
        </button>
      </div>

      {/* Session list grouped */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
        {groups.length === 0 ? (
          <div
            style={{
              padding: '36px 0',
              textAlign: 'center',
              fontSize: '12px',
              color: '#94a3b8',
            }}
          >
            暂无历史会话
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.label} style={{ marginBottom: '12px' }}>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 650,
                  color: '#94a3b8',
                  padding: '6px 8px 4px',
                  letterSpacing: '0.04em',
                }}
              >
                {group.label}
              </div>

              {group.items.map((s) => {
                const isSelected = currentSessionId === s.id;
                const isHovered = hoveredId === s.id;
                const isEditing = editingId === s.id;

                return (
                  <div
                    key={s.id}
                    onClick={() => {
                      if (!isEditing) onSelect(s.id);
                    }}
                    onMouseEnter={() => setHoveredId(s.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      cursor: isEditing ? 'default' : 'pointer',
                      marginBottom: '2px',
                      background: isSelected ? '#e2e8f0' : isHovered ? '#f1f5f9' : 'transparent',
                      border: 'none',
                      boxShadow: 'none',
                      transition: 'background 0.12s ease',
                    }}
                  >
                    {isEditing ? (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          width: '100%',
                          gap: '4px',
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          autoFocus
                          type="text"
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') submitEditing(e, s.id);
                            if (e.key === 'Escape') cancelEditing();
                          }}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            padding: '3px 6px',
                            fontSize: '12px',
                            borderRadius: '4px',
                            border: '1px solid #3b82f6',
                            outline: 'none',
                            background: '#fff',
                            color: '#1e293b',
                          }}
                        />
                        <button
                          type="button"
                          onClick={(e) => submitEditing(e, s.id)}
                          title="保存"
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#10b981',
                            padding: '2px',
                            display: 'flex',
                            alignItems: 'center',
                          }}
                        >
                          <Check size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => cancelEditing(e)}
                          title="取消"
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#94a3b8',
                            padding: '2px',
                            display: 'flex',
                            alignItems: 'center',
                          }}
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div
                          style={{
                            minWidth: 0,
                            flex: 1,
                            marginRight: '6px',
                          }}
                        >
                          <div
                            style={{
                              fontSize: '12px',
                              fontWeight: isSelected ? 600 : 500,
                              color: isSelected ? '#0f172a' : '#334155',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={s.title}
                          >
                            {s.title}
                          </div>
                          <div
                            style={{
                              fontSize: '10px',
                              color: '#94a3b8',
                              marginTop: '2px',
                              fontFamily: 'ui-monospace,monospace',
                            }}
                          >
                            {new Date(s.last_active_at || s.created_at).toLocaleString('zh-CN', {
                              month: 'numeric',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </div>

                        {/* Actions: Rename & Delete */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '2px',
                            opacity: isHovered || isSelected ? 1 : 0,
                            transition: 'opacity 0.15s ease',
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            disabled={!permissions.write}
                            onClick={(e) => startEditing(e, s)}
                            title="重命名会话"
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: '4px',
                              borderRadius: '4px',
                              color: '#64748b',
                              display: 'flex',
                              alignItems: 'center',
                              transition: 'color 0.12s, background 0.12s',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = '#2563eb';
                              e.currentTarget.style.background = '#e0e7ff';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = '#64748b';
                              e.currentTarget.style.background = 'none';
                            }}
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            type="button"
                            disabled={!permissions.write}
                            onClick={(e) => onDelete(e, s.id)}
                            title="删除会话"
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: '4px',
                              borderRadius: '4px',
                              color: '#64748b',
                              display: 'flex',
                              alignItems: 'center',
                              transition: 'color 0.12s, background 0.12s',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = '#e11d48';
                              e.currentTarget.style.background = '#ffe4e6';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = '#64748b';
                              e.currentTarget.style.background = 'none';
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
