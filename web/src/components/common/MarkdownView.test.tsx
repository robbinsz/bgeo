import { describe, it, expect, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { MarkdownView } from './MarkdownView';

describe('MarkdownView Component', () => {
  it('renders markdown headers, bold text, and lists into HTML elements', () => {
    const md = `### 1. 效果诊断
- **优势维度**: 权威度高
- **落后维度**: 竞品先发`;

    const { container } = render(<MarkdownView content={md} isStreaming={false} />);

    // Should render an h3 element
    const heading = container.querySelector('h3');
    expect(heading).not.toBeNull();
    expect(heading?.textContent).toContain('1. 效果诊断');

    // Should render strong elements
    const strongs = container.querySelectorAll('strong');
    expect(strongs.length).toBe(2);
    expect(strongs[0].textContent).toBe('优势维度');

    // Should render list items
    const listItems = container.querySelectorAll('li');
    expect(listItems.length).toBe(2);

    // Should NOT have cursor
    expect(container.querySelector('.streaming-cursor')).toBeNull();
  });

  it('renders streaming cursor when isStreaming is true', () => {
    const md = '正在为您诊断...';
    const { container } = render(<MarkdownView content={md} isStreaming={true} />);

    const cursor = container.querySelector('.streaming-cursor');
    expect(cursor).not.toBeNull();
    expect(cursor?.textContent?.trim()).toBe('▌');
  });

  it('smoothly types out text during streaming', () => {
    vi.useFakeTimers();
    const targetText = 'Hello World';

    const { container, rerender } = render(
      <MarkdownView content="" isStreaming={true} />
    );

    // Now update content as if SSE chunk arrived
    rerender(<MarkdownView content={targetText} isStreaming={true} />);

    // Fast-forward timers to let typewriter tick
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(container.textContent).toContain('Hello World');
    vi.useRealTimers();
  });

  it('renders code block with language header and copy button', () => {
    const md = '```json\n{"status": "ok"}\n```';
    const { container } = render(<MarkdownView content={md} isStreaming={false} />);

    const wrapper = container.querySelector('.code-block-wrapper');
    expect(wrapper).not.toBeNull();

    const lang = container.querySelector('.code-lang');
    expect(lang?.textContent).toBe('json');

    const copyBtn = container.querySelector('.copy-code-btn');
    expect(copyBtn).not.toBeNull();
    expect(copyBtn?.textContent).toContain('复制代码');
  });
});
