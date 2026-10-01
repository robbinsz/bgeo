import { usePagedResource } from '../../hooks/usePagedResource';
import { PermissionButton } from '../../components/ui/Permissions';
import { useState, useMemo } from 'react';
import { api } from '../../services/api';
import { Page, ResourceState } from '../../components/ui/Resource';
import {
  Target,
  Clock,
  CheckCircle2,
  Search,
  Plus,
  X,
  LayoutGrid,
  List,
  User,
  ShieldAlert,
} from 'lucide-react';

interface Props {
  onShowToast: (title: string, note?: string) => void;
  onOpenModal: (title: string) => void;
}

const columns = [
  { label: '机会池', states: ['backlog', 'draft'], color: '#64748b', bg: '#f1f5f9' },
  { label: '内容生产', states: ['production', 'in_progress'], color: '#2563eb', bg: '#eff6ff' },
  { label: '审核发布', states: ['review', 'pending_approval'], color: '#d97706', bg: '#fffbeb' },
  { label: '复测归因', states: ['analyzing', 'completed', 'archived'], color: '#059669', bg: '#ecfdf5' },
];

function getRiskMeta(risk?: string) {
  switch (risk?.toLowerCase()) {
    case 'high':
      return { label: '高风险 (High)', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' };
    case 'medium':
      return { label: '中风险 (Medium)', color: '#d97706', bg: '#fffbeb', border: '#fde68a' };
    case 'low':
      return { label: '低风险 (Low)', color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' };
    default:
      return { label: risk || '未评估', color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' };
  }
}

export function StrategyView({ onOpenModal }: Props) {
  const resource = usePagedResource(api.getStrategies);
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');
  const [search, setSearch] = useState('');
  const [risk, setRisk] = useState('all');
  const [assignee, setAssignee] = useState('all');

  const all = resource.data?.items ?? [];
  const paginationInfo = resource.data?.pagination;

  const items = useMemo(() => {
    return all.filter((s) => {
      if (risk !== 'all' && s.risk_level !== risk) return false;
      if (assignee !== 'all' && s.assignee !== assignee) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchTitle = s.title?.toLowerCase().includes(q);
        const matchObj = s.objective?.toLowerCase().includes(q);
        const matchHypo = s.hypothesis?.toLowerCase().includes(q);
        if (!matchTitle && !matchObj && !matchHypo) return false;
      }
      return true;
    });
  }, [all, risk, assignee, search]);

  // Statistics
  const totalCount = all.length;
  const inProgressCount = all.filter((s) => ['production', 'in_progress', 'review', 'pending_approval'].includes(s.status)).length;
  const completedCount = all.filter((s) => ['analyzing', 'completed', 'archived'].includes(s.status)).length;
  const highRiskCount = all.filter((s) => s.risk_level?.toLowerCase() === 'high').length;

  const visibleColumns = [
    ...columns,
    {
      label: '其他状态',
      states: [
        ...new Set(
          items
            .map((s) => s.status)
            .filter((status) => !columns.some((c) => c.states.includes(status))),
        ),
      ],
      color: '#64748b',
      bg: '#f1f5f9',
    },
  ];

  const assignees = [...new Set(all.map((s) => s.assignee).filter(Boolean))];

  return (
    <Page
      id="view-strategy"
      title="策略编排"
      description="基于机会诊断与自进化建议建立执行策略，统一驱动内容生产、审核发布与效果归因。状态来自服务端，全流程透明跟踪。"
      actions={
        <PermissionButton
          className="btn primary"
          onClick={() => onOpenModal('创建策略任务')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <Plus size={15} />
          <span>新建策略</span>
        </PermissionButton>
      }
    >
      {/* ========================================================= */}
      {/* 1. Top Executive Metric Cards                              */}
      {/* ========================================================= */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        <div className="card stat" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748b' }}>策略任务总量</span>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: '#eff6ff',
                color: '#2563eb',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Target size={17} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: '8px 0 3px', letterSpacing: '-0.02em' }}>
            {totalCount}
          </div>
          <div style={{ fontSize: '11.5px', color: '#64748b' }}>
            覆盖全生命周期闭环流水线
          </div>
        </div>

        <div className="card stat" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748b' }}>推进与审核中</span>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: '#fffbeb',
                color: '#d97706',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Clock size={17} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: '8px 0 3px', letterSpacing: '-0.02em' }}>
            {inProgressCount}
          </div>
          <div style={{ fontSize: '11.5px', color: '#d97706', fontWeight: 500 }}>
            包含生产中与待审批任务
          </div>
        </div>

        <div className="card stat" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748b' }}>已完成与复测归因</span>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: '#ecfdf5',
                color: '#059669',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <CheckCircle2 size={17} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: '8px 0 3px', letterSpacing: '-0.02em' }}>
            {completedCount}
          </div>
          <div style={{ fontSize: '11.5px', color: '#059669', fontWeight: 500 }}>
            已入库并参与大模型效果复测
          </div>
        </div>

        <div className="card stat" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748b' }}>高风险策略预警</span>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: '#fef2f2',
                color: '#dc2626',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <ShieldAlert size={17} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: '8px 0 3px', letterSpacing: '-0.02em' }}>
            {highRiskCount}
          </div>
          <div style={{ fontSize: '11.5px', color: highRiskCount > 0 ? '#dc2626' : '#64748b', fontWeight: 500 }}>
            {highRiskCount > 0 ? '需严格人工审查实体合规' : '暂无高风险策略'}
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 2. Single Unified Card Container                           */}
      {/* ========================================================= */}
      <article
        className="card"
        style={{
          borderRadius: '14px',
          border: '1px solid #e2e8f0',
          background: '#ffffff',
          boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
          overflow: 'hidden',
        }}
      >
        {/* Integrated Toolbar */}
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid #e2e8f0',
            background: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          {/* Search Field */}
          <div style={{ position: 'relative', flex: '1 1 220px', minWidth: '180px' }}>
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: '11px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#94a3b8',
              }}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索策略标题、目标或假设…"
              style={{
                width: '100%',
                height: '36px',
                padding: '0 12px 0 34px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#f8fafc',
                fontSize: '13px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#94a3b8',
                  padding: '2px',
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Risk Level Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12.5px', color: '#64748b', fontWeight: 600 }}>风险</span>
            <select
              className="select"
              aria-label="风险等级"
              value={risk}
              onChange={(e) => setRisk(e.target.value)}
              style={{ minHeight: '36px', fontSize: '13px', paddingRight: '28px' }}
            >
              <option value="all">全部风险等级</option>
              <option value="low">低风险 (low)</option>
              <option value="medium">中风险 (medium)</option>
              <option value="high">高风险 (high)</option>
            </select>
          </div>

          {/* Assignee Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12.5px', color: '#64748b', fontWeight: 600 }}>负责人</span>
            <select
              className="select"
              aria-label="负责人"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              style={{ minHeight: '36px', fontSize: '13px', paddingRight: '28px' }}
            >
              <option value="all">全部负责人</option>
              {assignees.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          {/* Reset Button */}
          {(search || risk !== 'all' || assignee !== 'all') && (
            <button
              type="button"
              className="btn small"
              onClick={() => {
                setSearch('');
                setRisk('all');
                setAssignee('all');
              }}
              style={{ color: '#dc2626', borderColor: '#fecaca', background: '#fff' }}
            >
              重置筛选
            </button>
          )}

          {/* View Mode Toggle */}
          <div
            style={{
              marginLeft: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              background: '#f1f5f9',
              padding: '3px',
              borderRadius: '8px',
              gap: '2px',
            }}
          >
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: viewMode === 'kanban' ? 700 : 500,
                background: viewMode === 'kanban' ? '#ffffff' : 'transparent',
                color: viewMode === 'kanban' ? '#0f172a' : '#64748b',
                boxShadow: viewMode === 'kanban' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.12s ease',
              }}
            >
              <LayoutGrid size={13} />
              <span>看板视图</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: viewMode === 'table' ? 700 : 500,
                background: viewMode === 'table' ? '#ffffff' : 'transparent',
                color: viewMode === 'table' ? '#0f172a' : '#64748b',
                boxShadow: viewMode === 'table' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.12s ease',
              }}
            >
              <List size={13} />
              <span>队列表格</span>
            </button>
          </div>
        </div>

        {/* State */}
        <ResourceState
          resource={resource}
          empty={!items.length}
          emptyMessage={search || risk !== 'all' || assignee !== 'all' ? '未找到符合条件的策略任务' : '暂无策略任务，点击右上角新建策略'}
        />

        {/* View Mode 1: Kanban Board */}
        {!!items.length && viewMode === 'kanban' && (
          <div
            style={{
              padding: '16px',
              background: '#f8fafc',
              overflowX: 'auto',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${visibleColumns.filter((c) => c.states.length).length}, minmax(260px, 1fr))`,
                gap: '14px',
                alignItems: 'start',
              }}
            >
              {visibleColumns
                .filter((c) => c.states.length)
                .map((c) => {
                  const columnItems = items.filter((s) => c.states.includes(s.status));
                  return (
                    <div
                      key={c.label}
                      style={{
                        background: '#ffffff',
                        borderRadius: '12px',
                        border: '1px solid #e2e8f0',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                      }}
                    >
                      {/* Column Header */}
                      <div
                        style={{
                          padding: '12px 14px',
                          borderBottom: '1px solid #f1f5f9',
                          background: c.bg,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span style={{ fontSize: '13px', fontWeight: 700, color: c.color }}>
                          {c.label}
                        </span>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '999px',
                            background: '#ffffff',
                            color: c.color,
                            border: `1px solid ${c.color}33`,
                          }}
                        >
                          {columnItems.length}
                        </span>
                      </div>

                      {/* Cards Container */}
                      <div
                        style={{
                          padding: '12px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px',
                          minHeight: '120px',
                        }}
                      >
                        {columnItems.length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '24px 8px', color: '#94a3b8', fontSize: '12px' }}>
                            暂无本阶段策略
                          </div>
                        ) : (
                          columnItems.map((s) => {
                            const riskMeta = getRiskMeta(s.risk_level);
                            return (
                              <article
                                key={s.id}
                                style={{
                                  padding: '12px 14px',
                                  borderRadius: '10px',
                                  border: '1px solid #e2e8f0',
                                  background: '#ffffff',
                                  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.03)',
                                  transition: 'all 0.15s ease',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                  <span
                                    style={{
                                      fontSize: '11px',
                                      fontWeight: 600,
                                      padding: '2px 7px',
                                      borderRadius: '4px',
                                      background: riskMeta.bg,
                                      border: `1px solid ${riskMeta.border}`,
                                      color: riskMeta.color,
                                    }}
                                  >
                                    {riskMeta.label}
                                  </span>
                                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                                    {s.status}
                                  </span>
                                </div>

                                <h3
                                  style={{
                                    margin: '0 0 6px',
                                    fontSize: '14px',
                                    fontWeight: 700,
                                    color: '#0f172a',
                                    lineHeight: 1.4,
                                  }}
                                >
                                  {s.title}
                                </h3>

                                <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#475467', lineHeight: 1.45 }}>
                                  {s.objective || '尚未填写目标'}
                                </p>

                                {s.hypothesis && (
                                  <div
                                    style={{
                                      padding: '6px 8px',
                                      borderRadius: '6px',
                                      background: '#f8fafc',
                                      fontSize: '11.5px',
                                      color: '#64748b',
                                      marginBottom: '8px',
                                      border: '1px dashed #e2e8f0',
                                    }}
                                  >
                                    💡 假定：{s.hypothesis}
                                  </div>
                                )}

                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    paddingTop: '6px',
                                    borderTop: '1px solid #f1f5f9',
                                    fontSize: '11px',
                                    color: '#64748b',
                                  }}
                                >
                                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <User size={12} color="#94a3b8" />
                                    <span>{s.assignee || '未指派'}</span>
                                  </span>
                                </div>
                              </article>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* View Mode 2: Table View */}
        {!!items.length && viewMode === 'table' && (
          <div className="table-wrap" style={{ margin: 0, border: 'none', borderRadius: 0 }}>
            <table style={{ minWidth: '840px', width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '12px 18px', textAlign: 'left', minWidth: '240px' }}>策略任务与目标</th>
                  <th style={{ padding: '12px 14px', textAlign: 'left', width: '130px', whiteSpace: 'nowrap' }}>当前状态</th>
                  <th style={{ padding: '12px 14px', textAlign: 'left', minWidth: '220px' }}>核心假设依据</th>
                  <th style={{ padding: '12px 14px', textAlign: 'left', width: '120px', whiteSpace: 'nowrap' }}>风险等级</th>
                  <th style={{ padding: '12px 18px', textAlign: 'right', width: '120px', whiteSpace: 'nowrap' }}>负责人</th>
                </tr>
              </thead>
              <tbody>
                {items.map((s, idx) => {
                  const riskMeta = getRiskMeta(s.risk_level);
                  return (
                    <tr
                      key={s.id}
                      style={{
                        borderBottom: idx < items.length - 1 ? '1px solid #f1f5f9' : 'none',
                        transition: 'background 0.12s ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#fcfdfe')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '13px 18px', verticalAlign: 'middle' }}>
                        <div>
                          <b style={{ fontSize: '13.5px', color: '#0f172a' }}>{s.title}</b>
                          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                            {s.objective || '尚未填写目标'}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '13px 14px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '2px 8px',
                            borderRadius: '5px',
                            fontSize: '11.5px',
                            fontWeight: 600,
                            background: '#f1f5f9',
                            color: '#334155',
                          }}
                        >
                          {s.status}
                        </span>
                      </td>
                      <td style={{ padding: '13px 14px', verticalAlign: 'middle' }}>
                        <span style={{ fontSize: '12px', color: '#475467' }}>
                          {s.hypothesis || '—'}
                        </span>
                      </td>
                      <td style={{ padding: '13px 14px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '2px 7px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                            background: riskMeta.bg,
                            border: `1px solid ${riskMeta.border}`,
                            color: riskMeta.color,
                          }}
                        >
                          {riskMeta.label}
                        </span>
                      </td>
                      <td style={{ padding: '13px 18px', textAlign: 'right', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: '12px', color: '#0f172a', fontWeight: 500 }}>
                          {s.assignee || '未指派'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Integrated Pagination Footer */}
        <div
          style={{
            padding: '12px 18px',
            borderTop: '1px solid #e2e8f0',
            background: '#fcfdfe',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ fontSize: '12.5px', color: '#64748b' }}>
            显示本页 {items.length} 项 · 共 {totalCount} 个策略任务 (推进中 {inProgressCount} 项)
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="btn small"
              disabled={resource.loading || resource.offset === 0}
              onClick={() => resource.setOffset(Math.max(0, resource.offset - (paginationInfo?.limit ?? 50)))}
              style={{ padding: '4px 10px', fontSize: '12px', whiteSpace: 'nowrap' }}
            >
              上一页
            </button>
            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
              第 {Math.floor(resource.offset / (paginationInfo?.limit ?? 50)) + 1} 页
            </span>
            <button
              type="button"
              className="btn small"
              disabled={resource.loading || !paginationInfo?.has_more}
              onClick={() => resource.setOffset(resource.offset + (paginationInfo?.limit ?? 50))}
              style={{ padding: '4px 10px', fontSize: '12px', whiteSpace: 'nowrap' }}
            >
              下一页
            </button>
          </div>
        </div>
      </article>
    </Page>
  );
}

export default StrategyView;
