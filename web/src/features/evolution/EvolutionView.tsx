import { usePagedResource } from '../../hooks/usePagedResource';
import { PermissionButton } from '../../components/ui/Permissions';
import { useState, useMemo } from 'react';
import { api } from '../../services/api';
import { Page, ResourceState } from '../../components/ui/Resource';
import { useResource } from '../../hooks/useResource';
import { useAction } from '../../hooks/useAction';
import {
  Sparkles,
  ShieldCheck,
  Clock,
  RotateCcw,
  TrendingUp,
  Search,
  Check,
  HelpCircle,
  X,
  Layers,
  History,
  Activity,
  AlertTriangle,
} from 'lucide-react';

interface Props {
  onShowToast: (title: string, note?: string) => void;
  isEvolutionRunning: boolean;
  onStartEvolution: () => void;
  evolutionStage: number;
}

function getRuleStatusMeta(status: string) {
  switch (status) {
    case 'stable':
      return { label: '生效中 (Stable)', color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' };
    case 'candidate':
      return { label: '候选待审 (Candidate)', color: '#d97706', bg: '#fffbeb', border: '#fde68a' };
    case 'rolled_back':
      return { label: '已回滚 (Rolled Back)', color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' };
    default:
      return { label: status, color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' };
  }
}

export function EvolutionView({ onShowToast, onStartEvolution, isEvolutionRunning }: Props) {
  const rules = usePagedResource(api.getRules, 5000);
  const runs = useResource(api.getEvolutionRuns, 5000);
  const action = useAction(onShowToast);

  const [activeTab, setActiveTab] = useState<'rules' | 'runs'>('rules');
  const [showStandards, setShowStandards] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const items = rules.data?.items ?? [];
  const history = runs.data?.items ?? [];
  const paginationInfo = rules.data?.pagination;

  // Filter rules
  const filteredRules = useMemo(() => {
    return items.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = r.rule_name?.toLowerCase().includes(q);
        const matchExpr = r.condition_expr?.toLowerCase().includes(q);
        const matchAction = r.action_type?.toLowerCase().includes(q);
        if (!matchName && !matchExpr && !matchAction) return false;
      }
      return true;
    });
  }, [items, statusFilter, search]);

  // Statistics
  const stableCount = items.filter((r) => r.status === 'stable').length;
  const candidateCount = items.filter((r) => r.status === 'candidate').length;
  const rolledBackCount = items.filter((r) => r.status === 'rolled_back').length;
  const avgImpact = items.length > 0
    ? (items.reduce((s, r) => s + (r.impact_score || 0), 0) / items.length).toFixed(2)
    : '0.00';

  return (
    <Page
      id="view-evolution"
      title="自进化中心"
      description="基于配对实验数据闭环沉淀候选规则，经严格人工审批后生效并反哺内容生产，驱动系统持续端到端自我进化。"
      actions={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="btn"
            onClick={() => setShowStandards(!showStandards)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <HelpCircle size={15} color="#475467" />
            <span>自进化标准规范</span>
          </button>
          <PermissionButton
            className="btn primary"
            disabled={isEvolutionRunning}
            onClick={onStartEvolution}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Sparkles size={15} />
            <span>{isEvolutionRunning ? '评估运行中…' : '立即启动评估'}</span>
          </PermissionButton>
        </div>
      }
    >
      {/* ========================================================= */}
      {/* 1. Evolution Standards Banner (Collapsible)                */}
      {/* ========================================================= */}
      {showStandards && (
        <div
          className="card"
          style={{
            padding: '18px 20px',
            marginBottom: '18px',
            background: 'linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)',
            border: '1px solid #cbd5e1',
            borderRadius: '14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '8px',
                  background: '#eff6ff',
                  color: '#2563eb',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <Sparkles size={16} />
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                  GEO 闭环自进化准入与安全红线 (PRD 10.6 规范)
                </h4>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                  候选规则由真实配对样本差异驱动生成，杜绝盲目幻觉与单点过拟合。
                </p>
              </div>
            </div>
            <button
              type="button"
              className="btn small"
              onClick={() => setShowStandards(false)}
              style={{ padding: '4px 8px', fontSize: '12px' }}
            >
              收起
            </button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '10px',
            }}
          >
            <div style={{ padding: '10px 12px', background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <TrendingUp size={14} />
                <span>硬性统计门槛</span>
              </div>
              <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '3px', lineHeight: 1.45 }}>
                至少 20 对真实样本、95% 置信水平且具备 5 个百分点净增益方可沉淀为候选规则。
              </div>
            </div>

            <div style={{ padding: '10px 12px', background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <AlertTriangle size={14} />
                <span>人工核准双锁防护</span>
              </div>
              <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '3px', lineHeight: 1.45 }}>
                系统生成的候选规则默认不参与生产，必须由具有审批权限的管理人员签字批准方可生效。
              </div>
            </div>

            <div style={{ padding: '10px 12px', background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#047857', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <RotateCcw size={14} />
                <span>一键安全回滚机制</span>
              </div>
              <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '3px', lineHeight: 1.45 }}>
                任何已生效规则若在后续复测中引起负向波动，支持随时一键秒级回滚到历史版本。
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 2. Top Executive KPI Cards (4 KPI Cards)                   */}
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
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748b' }}>生效稳定规则</span>
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
              <ShieldCheck size={17} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: '8px 0 3px', letterSpacing: '-0.02em' }}>
            {stableCount}
          </div>
          <div style={{ fontSize: '11.5px', color: '#059669', fontWeight: 500 }}>
            正在约束内容工厂生产逻辑
          </div>
        </div>

        <div className="card stat" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748b' }}>候选待审批</span>
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
            {candidateCount}
          </div>
          <div style={{ fontSize: '11.5px', color: '#d97706', fontWeight: 500 }}>
            配对实验已验证 · 待人工签字
          </div>
        </div>

        <div className="card stat" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748b' }}>已回滚保护</span>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: '#f1f5f9',
                color: '#64748b',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <RotateCcw size={17} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: '8px 0 3px', letterSpacing: '-0.02em' }}>
            {rolledBackCount}
          </div>
          <div style={{ fontSize: '11.5px', color: '#64748b' }}>
            历史已熔断或下线规则
          </div>
        </div>

        <div className="card stat" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748b' }}>平均评估增益</span>
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
              <TrendingUp size={17} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: '8px 0 3px', letterSpacing: '-0.02em' }}>
            +{avgImpact}
          </div>
          <div style={{ fontSize: '11.5px', color: '#2563eb', fontWeight: 500 }}>
            大模型真实回答提升增益幅度
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 3. Single Unified Card Container                           */}
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
        {/* Integrated Header Toolbar */}
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
          {/* Sub-tabs Toggle */}
          <div
            style={{
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
              onClick={() => setActiveTab('rules')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 12px',
                borderRadius: '6px',
                fontSize: '12.5px',
                fontWeight: activeTab === 'rules' ? 700 : 500,
                background: activeTab === 'rules' ? '#ffffff' : 'transparent',
                color: activeTab === 'rules' ? '#0f172a' : '#64748b',
                boxShadow: activeTab === 'rules' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.12s ease',
              }}
            >
              <Layers size={13} />
              <span>自进化规则编排</span>
              <span
                style={{
                  fontSize: '10.5px',
                  padding: '1px 5px',
                  borderRadius: '999px',
                  background: activeTab === 'rules' ? '#eff6ff' : '#e2e8f0',
                  color: activeTab === 'rules' ? '#2563eb' : '#64748b',
                }}
              >
                {items.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('runs')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 12px',
                borderRadius: '6px',
                fontSize: '12.5px',
                fontWeight: activeTab === 'runs' ? 700 : 500,
                background: activeTab === 'runs' ? '#ffffff' : 'transparent',
                color: activeTab === 'runs' ? '#0f172a' : '#64748b',
                boxShadow: activeTab === 'runs' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.12s ease',
              }}
            >
              <History size={13} />
              <span>评估批次记录</span>
              <span
                style={{
                  fontSize: '10.5px',
                  padding: '1px 5px',
                  borderRadius: '999px',
                  background: activeTab === 'runs' ? '#eff6ff' : '#e2e8f0',
                  color: activeTab === 'runs' ? '#2563eb' : '#64748b',
                }}
              >
                {history.length}
              </span>
            </button>
          </div>

          {activeTab === 'rules' && (
            <>
              {/* Search Field */}
              <div style={{ position: 'relative', flex: '1 1 200px', minWidth: '160px' }}>
                <Search
                  size={15}
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
                  placeholder="搜索规则名称、条件或动作类型…"
                  style={{
                    width: '100%',
                    height: '34px',
                    padding: '0 12px 0 32px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#f8fafc',
                    fontSize: '12.5px',
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
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Status Filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>状态</span>
                <select
                  className="select"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  style={{ minHeight: '34px', fontSize: '12.5px', paddingRight: '26px' }}
                >
                  <option value="all">全部规则 ({items.length})</option>
                  <option value="stable">生效中 ({stableCount})</option>
                  <option value="candidate">候选待审 ({candidateCount})</option>
                  <option value="rolled_back">已回滚 ({rolledBackCount})</option>
                </select>
              </div>

              {/* Reset Filter */}
              {(search || statusFilter !== 'all') && (
                <button
                  type="button"
                  className="btn small"
                  onClick={() => {
                    setSearch('');
                    setStatusFilter('all');
                  }}
                  style={{ color: '#dc2626', borderColor: '#fecaca', background: '#fff' }}
                >
                  重置
                </button>
              )}
            </>
          )}
        </div>

        {/* ========================================================= */}
        {/* Tab 1: Rules Table                                        */}
        {/* ========================================================= */}
        {activeTab === 'rules' && (
          <>
            <ResourceState
              resource={rules}
              empty={!filteredRules.length}
              emptyMessage={
                search || statusFilter !== 'all'
                  ? '未找到符合条件的规则'
                  : '尚未产生候选规则；请先创建并评估配对实验'
              }
            />

            {!!filteredRules.length && (
              <div className="table-wrap" style={{ margin: 0, border: 'none', borderRadius: 0 }}>
                <table style={{ minWidth: '920px', width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '12px 18px', textAlign: 'left', minWidth: '220px' }}>
                        规则名称与版本
                      </th>
                      <th style={{ padding: '12px 14px', textAlign: 'left', minWidth: '240px' }}>
                        条件表达式 (Condition)
                      </th>
                      <th style={{ padding: '12px 14px', textAlign: 'left', width: '150px', whiteSpace: 'nowrap' }}>
                        动作与载荷
                      </th>
                      <th style={{ padding: '12px 14px', textAlign: 'left', width: '160px', whiteSpace: 'nowrap' }}>
                        样本与评估增益
                      </th>
                      <th style={{ padding: '12px 14px', textAlign: 'left', width: '120px', whiteSpace: 'nowrap' }}>
                        状态
                      </th>
                      <th style={{ padding: '12px 18px', textAlign: 'right', width: '130px', whiteSpace: 'nowrap' }}>
                        操作
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRules.map((r, idx) => {
                      const statusMeta = getRuleStatusMeta(r.status);
                      return (
                        <tr
                          key={r.id}
                          style={{
                            borderBottom: idx < filteredRules.length - 1 ? '1px solid #f1f5f9' : 'none',
                            transition: 'background 0.12s ease',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#fcfdfe')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          {/* Name & Version */}
                          <td style={{ padding: '13px 18px', verticalAlign: 'middle' }}>
                            <div>
                              <b style={{ fontSize: '13.5px', color: '#0f172a' }}>{r.rule_name}</b>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                                <span className="version-chip" style={{ fontSize: '11px' }}>v{r.version}</span>
                                {r.category && (
                                  <span style={{ fontSize: '11px', color: '#64748b' }}>{r.category}</span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Condition Expression */}
                          <td style={{ padding: '13px 14px', verticalAlign: 'middle' }}>
                            <code
                              style={{
                                display: 'inline-block',
                                padding: '3px 8px',
                                background: '#f8fafc',
                                border: '1px solid #e2e8f0',
                                borderRadius: '5px',
                                fontSize: '11.5px',
                                color: '#1e293b',
                                fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                                maxWidth: '300px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                              title={r.condition_expr}
                            >
                              {r.condition_expr || '—'}
                            </code>
                          </td>

                          {/* Action Type */}
                          <td style={{ padding: '13px 14px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                            <span style={{ fontSize: '12px', color: '#334155', fontWeight: 600 }}>
                              {r.action_type || 'default'}
                            </span>
                          </td>

                          {/* Sample & Impact */}
                          <td style={{ padding: '13px 14px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#059669', fontWeight: 700 }}>
                                <TrendingUp size={13} />
                                <span>+{r.impact_score.toFixed(2)} 增益</span>
                              </div>
                              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                                配对样本：{r.sample_size} 对
                              </span>
                            </div>
                          </td>

                          {/* Status */}
                          <td style={{ padding: '13px 14px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '2px 8px',
                                borderRadius: '5px',
                                fontSize: '11.5px',
                                fontWeight: 600,
                                background: statusMeta.bg,
                                border: `1px solid ${statusMeta.border}`,
                                color: statusMeta.color,
                              }}
                            >
                              {statusMeta.label}
                            </span>
                          </td>

                          {/* Actions */}
                          <td style={{ padding: '13px 18px', textAlign: 'right', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                            {r.status === 'candidate' && (
                              <PermissionButton
                                permission="review"
                                className="btn small primary"
                                disabled={action.busy}
                                onClick={() => void action.run(() => api.approveRule(r.id), '规则已批准生效')}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '4px 10px',
                                  fontSize: '11.5px',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                <Check size={12} />
                                <span>批准规则</span>
                              </PermissionButton>
                            )}

                            {r.status === 'stable' && (
                              <PermissionButton
                                permission="review"
                                className="btn small"
                                disabled={action.busy}
                                onClick={() => void action.run(() => api.rollbackRule(r.id), '规则已回滚')}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '4px 10px',
                                  fontSize: '11.5px',
                                  color: '#dc2626',
                                  borderColor: '#fecaca',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                <RotateCcw size={12} />
                                <span>回滚规则</span>
                              </PermissionButton>
                            )}

                            {r.status === 'rolled_back' && (
                              <span style={{ fontSize: '11px', color: '#94a3b8' }}>已归档</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Bottom Footer */}
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
                显示本页 {filteredRules.length} 项 · 共 {items.length} 条自进化规则 (生效中 {stableCount} 条 · 候选 {candidateCount} 条)
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="btn small"
                  disabled={rules.loading || rules.offset === 0}
                  onClick={() => rules.setOffset(Math.max(0, rules.offset - (paginationInfo?.limit ?? 50)))}
                  style={{ padding: '4px 10px', fontSize: '12px', whiteSpace: 'nowrap' }}
                >
                  上一页
                </button>
                <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                  第 {Math.floor(rules.offset / (paginationInfo?.limit ?? 50)) + 1} 页
                </span>
                <button
                  type="button"
                  className="btn small"
                  disabled={rules.loading || !paginationInfo?.has_more}
                  onClick={() => rules.setOffset(rules.offset + (paginationInfo?.limit ?? 50))}
                  style={{ padding: '4px 10px', fontSize: '12px', whiteSpace: 'nowrap' }}
                >
                  下一页
                </button>
              </div>
            </div>
          </>
        )}

        {/* ========================================================= */}
        {/* Tab 2: Runs History Timeline                              */}
        {/* ========================================================= */}
        {activeTab === 'runs' && (
          <div style={{ padding: '16px' }}>
            <ResourceState resource={runs} empty={!history.length} emptyMessage="暂无历史评估批次记录" />

            {!!history.length && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {history.map((r) => (
                  <div
                    key={r.id}
                    style={{
                      padding: '14px 16px',
                      borderRadius: '10px',
                      border: '1px solid #e2e8f0',
                      background: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '8px',
                          background: r.status === 'running' ? '#eff6ff' : '#f1f5f9',
                          color: r.status === 'running' ? '#2563eb' : '#64748b',
                          display: 'grid',
                          placeItems: 'center',
                        }}
                      >
                        <Activity size={16} />
                      </div>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                          批次：{r.id.slice(0, 16)}…
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                          {new Date(r.created_at).toLocaleString()} · {r.stage_name || '评估阶段已完成'}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {r.status === 'running' && (
                        <div style={{ width: '120px' }}>
                          <progress max={100} value={r.percentage ?? 0} aria-label="评估进度" style={{ width: '100%' }} />
                        </div>
                      )}
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '3px 8px',
                          borderRadius: '5px',
                          fontSize: '11.5px',
                          fontWeight: 600,
                          background: r.status === 'completed' ? '#ecfdf5' : r.status === 'running' ? '#eff6ff' : '#f1f5f9',
                          color: r.status === 'completed' ? '#059669' : r.status === 'running' ? '#2563eb' : '#64748b',
                        }}
                      >
                        {r.status === 'completed' ? '✓ 评估完成' : r.status === 'running' ? '评估进行中' : r.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </article>
    </Page>
  );
}

export default EvolutionView;
