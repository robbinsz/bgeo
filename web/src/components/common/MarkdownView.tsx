import React, { useMemo } from 'react';
import { marked, type Tokens } from 'marked';
import { useStreamingText } from '../../hooks/useStreamingText';

interface MarkdownViewProps {
  content: string;
  isStreaming?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

// Custom renderer for Claude-style code blocks with header and copy button
const renderer = new marked.Renderer();
renderer.code = function (token: Tokens.Code): string {
  const lang = token.lang || 'code';
  const text = token.text || '';
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  return `<div class="code-block-wrapper">
    <div class="code-block-header">
      <span class="code-lang">${lang}</span>
      <button type="button" class="copy-code-btn" data-copy-code="${encodeURIComponent(text)}" title="复制代码">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
        <span>复制代码</span>
      </button>
    </div>
    <pre><code class="language-${lang}">${escaped}</code></pre>
  </div>`;
};

marked.use({ renderer, gfm: true, breaks: true });

export const MarkdownView: React.FC<MarkdownViewProps> = ({
  content,
  isStreaming = false,
  className = '',
  style,
}) => {
  const displayedText = useStreamingText(content, isStreaming);

  const html = useMemo(() => {
    if (!displayedText) return '';
    try {
      return marked.parse(displayedText) as string;
    } catch {
      return displayedText;
    }
  }, [displayedText]);

  const handleContainerClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('.copy-code-btn') as HTMLElement;
    if (btn) {
      e.stopPropagation();
      const code = btn.getAttribute('data-copy-code');
      if (code) {
        navigator.clipboard.writeText(decodeURIComponent(code));
        const originalHtml = btn.innerHTML;
        btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><span style="color:#34d399">已复制</span>`;
        setTimeout(() => {
          btn.innerHTML = originalHtml;
        }, 1800);
      }
    }
  };

  return (
    <div
      className={`markdown-body ${className}`}
      style={style}
      onClick={handleContainerClick}
    >
      <div
        className="markdown-content"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {isStreaming && (
        <span className="streaming-cursor" aria-hidden="true">
          ▌
        </span>
      )}
    </div>
  );
};

export default MarkdownView;
