import React, { useState } from 'react';
import type { MCPServer } from '../../services/api';
import { PermissionButton } from '../../components/ui/Permissions';
import {
  ChevronRight,
  ChevronLeft,
  Cpu,
  Plug,
  Brain,
  Zap,
  Settings,
  CheckSquare,
  Square,
  Circle,
  CheckCircle2,
} from 'lucide-react';
const BUILTIN_SKILLS = [
  {
    id: 'monitor',
    label: '监测拨测巡检',
    desc: '监测、拨测、定时任务',
    risk: 'safe',
  },
  {
    id: 'diagnosis',
    label: '机会差距诊断',
    desc: '竞品归因、落差分析',
    risk: 'safe',
  },
  {
    id: 'content',
    label: '事实核验创作',
    desc: '内容生成、质检评分',
    risk: 'safe',
  },
  {
    id: 'publish',
    label: '渠道发布与分发',
    desc: '高危 · 需人工审批',
    risk: 'high',
  },
  {
    id: 'evolution',
    label: '自进化策略反思',
    desc: '经验切片、偏好记录',
    risk: 'safe',
  },
];

/** 右栏：Harness 运行面板 */
export const HarnessPanel: React.FC<{
  enabledSkills: string[];
  onToggleSkill: (id: string) => void;
  onOpenConfig: () => void;
  mcpServers: MCPServer[];
  memoryHints: string[];
}> = ({ enabledSkills, onToggleSkill, onOpenConfig, mcpServers, memoryHints }) => {
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <div
        className="copilot-harness-panel"
        style={{
          width: '36px',
          flexShrink: 0,
          borderLeft: '1px solid rgba(226, 232, 240, 0.8)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: '12px',
          background: '#f8fafc',
          gap: '16px',
          height: '100%',
        }}
      >
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          title="展开 Harness 面板"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#64748b',
            padding: '4px',
          }}
        >
          <ChevronLeft size={14} />
        </button>
        <Zap size={13} color="#64748b" />
        <Cpu size={13} color="#64748b" />
        <Plug size={13} color="#64748b" />
        <Brain size={13} color="#64748b" />
      </div>
    );
  }

  return (
    <div
      className="copilot-harness-panel"
      style={{
        width: '240px',
        flexShrink: 0,
        borderLeft: '1px solid rgba(226, 232, 240, 0.8)',
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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <Zap size={13} color="#f59e0b" />
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: '#64748b',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            Harness
          </span>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          title="收起面板"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#94a3b8',
            padding: '2px',
          }}
        >
          <ChevronRight size={14} />
        </button>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: '12px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {/* Skills */}
        <section>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              marginBottom: '8px',
            }}
          >
            <Cpu size={11} color="#475569" />
            <span
              style={{
                fontSize: '10px',
                fontWeight: 600,
                color: '#475569',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              挂载技能
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            {BUILTIN_SKILLS.map((skill) => {
              const enabled = enabledSkills.includes(skill.id);
              return (
                <PermissionButton
                  permission="admin"
                  key={skill.id}
                  type="button"
                  onClick={() => onToggleSkill(skill.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '7px',
                    padding: '7px 8px',
                    borderRadius: '7px',
                    background: enabled ? '#fff' : 'transparent',
                    border: enabled ? '1px solid #e2e8f0' : '1px solid transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    boxShadow: enabled ? '0 1px 2px rgba(0,0,0,0.04)' : 'none',
                    transition: 'background 0.1s, border-color 0.1s',
                  }}
                >
                  {enabled ? (
                    <CheckSquare
                      size={13}
                      color="#0f172a"
                      style={{
                        marginTop: '1px',
                        flexShrink: 0,
                      }}
                    />
                  ) : (
                    <Square
                      size={13}
                      color="#94a3b8"
                      style={{
                        marginTop: '1px',
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <div>
                    <div
                      style={{
                        fontSize: '11px',
                        fontWeight: 500,
                        color: enabled ? '#0f172a' : '#64748b',
                      }}
                    >
                      {skill.label}
                    </div>
                    <div
                      style={{
                        fontSize: '10px',
                        color: skill.risk === 'high' ? '#ef4444' : '#94a3b8',
                        marginTop: '1px',
                      }}
                    >
                      {skill.desc}
                    </div>
                  </div>
                </PermissionButton>
              );
            })}
          </div>
        </section>

        {/* MCP Servers */}
        <section>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              marginBottom: '8px',
            }}
          >
            <Plug size={11} color="#475569" />
            <span
              style={{
                fontSize: '10px',
                fontWeight: 600,
                color: '#475569',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              MCP 服务连接
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            {mcpServers.map((srv) => (
              <div
                key={srv.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '7px',
                  padding: '6px 8px',
                  borderRadius: '7px',
                  background: '#fff',
                  border: '1px solid #f1f5f9',
                }}
              >
                <Circle
                  size={7}
                  fill={srv.is_active ? '#10b981' : '#d1d5db'}
                  color={srv.is_active ? '#10b981' : '#d1d5db'}
                  style={{ flexShrink: 0 }}
                />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: 500,
                      color: '#334155',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {srv.name}
                  </div>
                  <div
                    style={{
                      fontSize: '9px',
                      color: '#94a3b8',
                      fontFamily: 'ui-monospace,monospace',
                    }}
                  >
                    {srv.transport_type} · {srv.is_active ? '已配置（需测试连接）' : '未启用'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Memory hints */}
        <section>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              marginBottom: '8px',
            }}
          >
            <Brain size={11} color="#475569" />
            <span
              style={{
                fontSize: '10px',
                fontWeight: 600,
                color: '#475569',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              记忆命中
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            {memoryHints.map((hint, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '6px',
                  padding: '6px 8px',
                  borderRadius: '7px',
                  background: '#fff',
                  border: '1px solid #f1f5f9',
                }}
              >
                <CheckCircle2
                  size={10}
                  color="#10b981"
                  style={{ marginTop: '2px', flexShrink: 0 }}
                />
                <span
                  style={{
                    fontSize: '10px',
                    color: '#475569',
                    lineHeight: 1.5,
                  }}
                >
                  {hint}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Config button */}
        <button
          type="button"
          onClick={onOpenConfig}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '8px',
            borderRadius: '8px',
            background: '#0f172a',
            color: '#f8fafc',
            border: 'none',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: 500,
            marginTop: 'auto',
          }}
        >
          <Settings size={12} />
          完整 Harness 配置
        </button>
      </div>
    </div>
  );
};
