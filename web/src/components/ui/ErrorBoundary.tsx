import { Component, type ReactNode } from 'react';
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="card panel" role="alert">
        <h2>页面暂时无法显示</h2>
        <p>请重新加载页面；若问题持续，请联系管理员。</p>
        <button className="btn" onClick={() => window.location.reload()}>
          重新加载
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
