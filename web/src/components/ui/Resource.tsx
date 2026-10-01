import type { ReactNode } from 'react';
import type { ItemPage } from '../../services/api';
export function ResourceState({
  resource,
  empty = false,
  emptyMessage = '暂无数据',
}: {
  resource: { loading: boolean; error: string; reload: () => Promise<void> };
  empty?: boolean;
  emptyMessage?: string;
}) {
  if (resource.loading) {
    return (
      <div className="resource-loading" role="status">
        <span className="loading-spinner" aria-hidden="true"></span>
        <span>正在读取最新数据…</span>
      </div>
    );
  }
  if (resource.error) {
    return (
      <div className="resource-error" role="alert">
        <div className="error-copy">
          <strong>数据读取失败</strong>
          <p>{resource.error}</p>
        </div>
        <button className="btn small" onClick={() => void resource.reload()}>
          重试
        </button>
      </div>
    );
  }
  if (empty) {
    return (
      <div className="resource-empty" role="status">
        <div className="empty-icon">📭</div>
        <div className="empty-text">{emptyMessage}</div>
      </div>
    );
  }
  return null;
}
export function Page({
  id,
  className,
  title,
  description,
  actions,
  children,
}: {
  id?: string;
  className?: string;
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className={`view active ${className || ''}`}>
      <div className="page-head">
        <div className="page-title">
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {actions && <div className="head-actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
export function Stats({ items }: { items: { label: string; value: ReactNode; note?: string }[] }) {
  return (
    <div className="stats stats-4">
      {items.map((item) => (
        <article className="card stat" key={item.label}>
          <div className="stat-top">{item.label}</div>
          <div className="stat-value">{item.value}</div>
          {item.note && <div className="stat-foot">{item.note}</div>}
        </article>
      ))}
    </div>
  );
}
export function Pagination({
  resource,
}: {
  resource: {
    data: ItemPage<unknown> | null;
    offset: number;
    setOffset: (value: number) => void;
    loading: boolean;
  };
}) {
  const page = resource.data?.pagination;
  if (!page) return null;
  return (
    <nav className="toolbar" aria-label="列表分页">
      <button
        className="btn"
        disabled={resource.loading || resource.offset === 0}
        onClick={() => resource.setOffset(Math.max(0, resource.offset - page.limit))}
      >
        上一页
      </button>
      <span>
        第 {Math.floor(resource.offset / page.limit) + 1} 页 · 本页{' '}
        {resource.data?.items.length ?? 0} 项
      </span>
      <button
        className="btn"
        disabled={resource.loading || !page.has_more}
        onClick={() => resource.setOffset(resource.offset + page.limit)}
      >
        下一页
      </button>
    </nav>
  );
}
