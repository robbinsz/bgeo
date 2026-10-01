import React, { useMemo } from 'react';
import { Marked, Renderer, type Tokens } from 'marked';
import DOMPurify from 'dompurify';
import { useStreamingText } from '../../hooks/useStreamingText';

interface MarkdownViewProps {
  content: string;
  isStreaming?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

// Custom renderer for Claude-style code blocks with header and copy button
const escapeHTML = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[char]!,
  );
const renderer = new Renderer();
renderer.code = function (token: Tokens.Code): string {
  const lang = escapeHTML((token.lang || 'code').split(/\s/)[0]);
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
      <button type="button" class="copy-code-btn" data-copy-code="${escapeHTML(encodeURIComponent(text))}" title="复制代码">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
        <span>复制代码</span>
      </button>
    </div>
    <pre><code class="language-${lang}">${escaped}</code></pre>
  </div>`;
};

const markdown = new Marked({ renderer, gfm: true, breaks: true });

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
      return DOMPurify.sanitize(markdown.parse(displayedText) as string, {
        USE_PROFILES: { html: true },
      });
    } catch {
      return escapeHTML(displayedText);
    }
  }, [displayedText]);

  const handleContainerClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('.copy-code-btn') as HTMLElement;
    if (btn) {
      e.stopPropagation();
      const code = btn.getAttribute('data-copy-code');
      if (code) {
        void navigator.clipboard
          ?.writeText(decodeURIComponent(code))
          .then(() => {
            btn.setAttribute('title', '已复制');
            const label = btn.querySelector('span');
            if (label) label.textContent = '已复制';
          })
          .catch(() => {
            btn.setAttribute('title', '复制失败，请手动选择代码');
          });
      }
    }
  };

  return (
    <div className={`markdown-body ${className}`} style={style} onClick={handleContainerClick}>
      <div className="markdown-content" dangerouslySetInnerHTML={{ __html: html }} />
      {isStreaming && (
        <span className="streaming-cursor" aria-hidden="true">
          ▌
        </span>
      )}
    </div>
  );
};

export default MarkdownView;
