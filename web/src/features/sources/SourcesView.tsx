import { usePagedResource } from '../../hooks/usePagedResource';
import { PermissionButton } from '../../components/ui/Permissions';
import { useState, useMemo } from 'react';
import { api } from '../../services/api';
import { Page, ResourceState } from '../../components/ui/Resource';
import { useAction } from '../../hooks/useAction';
import {
  Database,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Search,
  Plus,
  HelpCircle,
  X,
  ExternalLink,
  Check,
  BookOpen,
  FileCheck,
} from 'lucide-react';

interface Props {
  onShowToast: (title: string, note?: string) => void;
}

export function SourcesView({ onShowToast }: Props) {
  const facts = usePagedResource(api.getAllFacts);
  const action = useAction(onShowToast);

  const [statement, setStatement] = useState('');
  const [source, setSource] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [showGuidelines, setShowGuidelines] = useState(false);

  const factList = facts.data?.items || [];
  const paginationInfo = facts.data?.pagination;

  // Filtered facts
  const filteredFacts = useMemo(() => {
    return factList.filter((f) => {
      if (statusFilter !== 'all' && f.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchStmt = f.statement?.toLowerCase().includes(q);
        const matchSrc = f.source?.toLowerCase().includes(q);
        if (!matchStmt && !matchSrc) return false;
      }
      return true;
    });
  }, [factList, statusFilter, search]);

  // Statistics
  const totalCount = factList.length;
  const approvedCount = factList.filter((f) => f.status === 'approved').length;
  const pendingCount = factList.filter((f) => f.status === 'pending').length;
  const externalSourceCount = factList.filter((f) => f.source?.startsWith('http')).length;

  return (
    <Page
      id="view-sources"
      title="数据源与可信事实"
      description="品牌可信事实库是内容生成、反幻觉核验与大模型问答引用的唯一真理源。只有经过人工核验证明的事实才会被注入内容生产与自进化提示词约束。"
      actions={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="btn"
            onClick={() => setShowGuidelines(!showGuidelines)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <HelpCircle size={15} color="#475467" />
            <span>事实库准入原则</span>
          </button>
          <PermissionButton
            type="button"
            className="btn primary"
            onClick={() => setShowForm(!showForm)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={15} />
            <span>{showForm ? '收起录入表单' : '录入事实声明'}</span>
          </PermissionButton>
        </div>
      }
    >
      {/* ========================================================= */}
      {/* 1. Guidelines Notice Banner (Collapsible)                  */}
      {/* ========================================================= */}
      {showGuidelines && (
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
                <BookOpen size={16} />
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                  事实库核心准入规范 (PRD 10.5 规范)
                </h4>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                  事实记录须经过人工审核，逐句匹配通过不等同于来源免检。
                </p>
              </div>
            </div>
            <button
              type="button"
              className="btn small"
              onClick={() => setShowGuidelines(false)}
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
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#1d4ed8' }}>确定性原则 (Determinism)</div>
              <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '3px', lineHeight: 1.45 }}>
                拒绝使用“行业第一”、“首选”等无法量化的修饰词，改用有据可查的数字与排名。
              </div>
            </div>

            <div style={{ padding: '10px 12px', background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#047857' }}>时效性原则 (Timeliness)</div>
              <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '3px', lineHeight: 1.45 }}>
                价格表与承诺政策一旦变更，必须提交新版本事实，使用前核对历史事实是否有效。
              </div>
            </div>

            <div style={{ padding: '10px 12px', background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#7c3aed' }}>机器可解析 (Machine-Readable)</div>
              <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '3px', lineHeight: 1.45 }}>
                推荐提供具体价格区间、服务范围列表，便于生成式引擎在直接回答中提取。
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 2. Top Executive Metric Cards (4 KPI Cards)                */}
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
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748b' }}>可信事实总量</span>
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
              <Database size={17} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: '8px 0 3px', letterSpacing: '-0.02em' }}>
            {totalCount}
          </div>
          <div style={{ fontSize: '11.5px', color: '#64748b' }}>
            品牌可信事实与声明底座
          </div>
        </div>

        <div className="card stat" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748b' }}>已核准可用事实</span>
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
            {approvedCount}
          </div>
          <div style={{ fontSize: '11.5px', color: '#059669', fontWeight: 500 }}>
            已注入内容生产与自进化引擎
          </div>
        </div>

        <div className="card stat" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748b' }}>待合规核验</span>
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
            {pendingCount}
          </div>
          <div style={{ fontSize: '11.5px', color: '#d97706', fontWeight: 500 }}>
            等待审查三方凭据并批准
          </div>
        </div>

        <div className="card stat" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#64748b' }}>公开可核验证据</span>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: '#f5f3ff',
                color: '#7c3aed',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <ShieldCheck size={17} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: '8px 0 3px', letterSpacing: '-0.02em' }}>
            {externalSourceCount}
          </div>
          <div style={{ fontSize: '11.5px', color: '#7c3aed', fontWeight: 500 }}>
            具备公开在线查验凭证或网址
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
          {/* Search Input */}
          <div style={{ position: 'relative', flex: '1 1 240px', minWidth: '180px' }}>
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
              placeholder="搜索事实陈述或证据出处…"
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
                <X size={13} />
              </button>
            )}
          </div>

          {/* Status Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12.5px', color: '#64748b', fontWeight: 600 }}>状态</span>
            <select
              className="select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ minHeight: '36px', fontSize: '13px', paddingRight: '28px' }}
            >
              <option value="all">全部事实 ({totalCount})</option>
              <option value="approved">已核准 ({approvedCount})</option>
              <option value="pending">待核验 ({pendingCount})</option>
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

          <div style={{ marginLeft: 'auto' }}>
            <button
              type="button"
              className="btn small"
              onClick={() => setShowForm(!showForm)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <FileCheck size={13} />
              <span>{showForm ? '收起录入' : '快捷录入'}</span>
            </button>
          </div>
        </div>

        {/* Collapsible New Fact Form */}
        {showForm && (
          <div
            style={{
              padding: '18px 20px',
              background: '#f8fafc',
              borderBottom: '1px solid #e2e8f0',
            }}
          >
            <h4 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
              录入可信事实声明
            </h4>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void action.run(async () => {
                  await api.createFact({
                    fact_type: 'brand_claim',
                    statement,
                    source,
                  });
                  setStatement('');
                  setSource('');
                  setShowForm(false);
                }, '可信事实声明已提交，待合规审核');
              }}
              style={{ display: 'grid', gap: '12px' }}
            >
              <div>
                <label
                  htmlFor="fact-statement-input"
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#475467',
                    marginBottom: '4px',
                  }}
                >
                  事实声明内容 (Statement)
                </label>
                <textarea
                  id="fact-statement-input"
                  className="field"
                  required
                  style={{
                    width: '100%',
                    minHeight: '80px',
                    padding: '10px',
                    background: '#ffffff',
                    fontSize: '13px',
                    lineHeight: 1.5,
                  }}
                  placeholder="例如：苗汐家政保洁阿姨 100% 具备高级家政资格证书，并由平安保险承保单笔最高 100 万元家财险。"
                  value={statement}
                  onChange={(e) => setStatement(e.target.value)}
                />
              </div>

              <div>
                <label
                  htmlFor="fact-source-input"
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#475467',
                    marginBottom: '4px',
                  }}
                >
                  可公开核验证据出处 (URL / 证书编号 / 官方声明)
                </label>
                <input
                  id="fact-source-input"
                  className="field"
                  required
                  style={{ width: '100%', background: '#ffffff', fontSize: '13px' }}
                  placeholder="例如：https://www.bgeo.cc/compliance/insurance-policy-2026.pdf"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  className="btn small"
                  onClick={() => setShowForm(false)}
                >
                  取消
                </button>
                <PermissionButton
                  type="submit"
                  className="btn small primary"
                  disabled={action.busy || !statement.trim()}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  提交事实声明
                </PermissionButton>
              </div>
            </form>
          </div>
        )}

        {/* Facts Resource State */}
        <ResourceState
          resource={facts}
          empty={!filteredFacts.length}
          emptyMessage={search || statusFilter !== 'all' ? '未找到符合条件的可信事实' : '暂无可信事实，点击右上角录入'}
        />

        {/* Facts High-Density Table */}
        {!!filteredFacts.length && (
          <div className="table-wrap" style={{ margin: 0, border: 'none', borderRadius: 0 }}>
            <table style={{ minWidth: '880px', width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '12px 18px', textAlign: 'left', width: '130px', whiteSpace: 'nowrap' }}>
                    版本与状态
                  </th>
                  <th style={{ padding: '12px 14px', textAlign: 'left', minWidth: '340px' }}>
                    事实声明陈述 (Statement)
                  </th>
                  <th style={{ padding: '12px 14px', textAlign: 'left', minWidth: '220px' }}>
                    官方核验证据出处
                  </th>
                  <th style={{ padding: '12px 18px', textAlign: 'right', width: '140px', whiteSpace: 'nowrap' }}>
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredFacts.map((f, idx) => (
                  <tr
                    key={f.id}
                    style={{
                      borderBottom: idx < filteredFacts.length - 1 ? '1px solid #f1f5f9' : 'none',
                      transition: 'background 0.12s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#fcfdfe')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    {/* Version & Status */}
                    <td style={{ padding: '13px 18px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className="version-chip" style={{ fontSize: '11px' }}>v{f.version || 1}</span>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '2px 7px',
                            borderRadius: '5px',
                            fontSize: '11px',
                            fontWeight: 600,
                            background: f.status === 'approved' ? '#ecfdf5' : '#fffbeb',
                            border: `1px solid ${f.status === 'approved' ? '#a7f3d0' : '#fde68a'}`,
                            color: f.status === 'approved' ? '#047857' : '#d97706',
                          }}
                        >
                          {f.status === 'approved' ? '✓ 已核准' : '待核验'}
                        </span>
                      </div>
                    </td>

                    {/* Statement */}
                    <td style={{ padding: '13px 14px', verticalAlign: 'middle' }}>
                      <p
                        style={{
                          margin: 0,
                          fontSize: '13.5px',
                          color: '#0f172a',
                          fontWeight: 600,
                          lineHeight: 1.5,
                        }}
                      >
                        {f.statement}
                      </p>
                    </td>

                    {/* Source */}
                    <td style={{ padding: '13px 14px', verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#475467' }}>
                        {f.source?.startsWith('http') ? (
                          <a
                            href={f.source}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              color: '#2563eb',
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              maxWidth: '260px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <span>{f.source}</span>
                            <ExternalLink size={12} style={{ flexShrink: 0 }} />
                          </a>
                        ) : (
                          <span style={{ maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {f.source || '未提供具体出处'}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '13px 18px', textAlign: 'right', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                      {f.status === 'pending' ? (
                        <PermissionButton
                          permission="review"
                          type="button"
                          className="btn small primary"
                          disabled={action.busy}
                          onClick={() =>
                            void action.run(() => api.approveFact(f.id), '已完成来源核验并批准该事实')
                          }
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
                          <span>核验证据并批准</span>
                        </PermissionButton>
                      ) : (
                        <span style={{ fontSize: '11.5px', color: '#059669', fontWeight: 500 }}>
                          ✓ 已入真理库
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
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
            显示本页 {filteredFacts.length} 项 · 共 {totalCount} 条可信事实 (已核准 {approvedCount} 条 · 待核验 {pendingCount} 条)
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="btn small"
              disabled={facts.loading || facts.offset === 0}
              onClick={() => facts.setOffset(Math.max(0, facts.offset - (paginationInfo?.limit ?? 50)))}
              style={{ padding: '4px 10px', fontSize: '12px', whiteSpace: 'nowrap' }}
            >
              上一页
            </button>
            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
              第 {Math.floor(facts.offset / (paginationInfo?.limit ?? 50)) + 1} 页
            </span>
            <button
              type="button"
              className="btn small"
              disabled={facts.loading || !paginationInfo?.has_more}
              onClick={() => facts.setOffset(facts.offset + (paginationInfo?.limit ?? 50))}
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

export default SourcesView;
