import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { TopBar } from './TopBar';

describe('TopBar Component', () => {
  it('calls onToggleMenu when the hamburger menu button is clicked', () => {
    const handleToggle = vi.fn();
    const { getByRole } = render(
      <TopBar
        onToggleMenu={handleToggle}
        onShowToast={vi.fn()}
        isSidebarCollapsed={false}
      />
    );

    const menuBtn = getByRole('button', { name: '收起导航菜单' });
    expect(menuBtn).not.toBeNull();
    expect(menuBtn.getAttribute('title')).toBe('收起导航菜单');

    fireEvent.click(menuBtn);
    expect(handleToggle).toHaveBeenCalledTimes(1);
  });

  it('updates title, aria-label, and collapsed class when isSidebarCollapsed is true', () => {
    const { getByRole } = render(
      <TopBar
        onToggleMenu={vi.fn()}
        onShowToast={vi.fn()}
        isSidebarCollapsed={true}
      />
    );

    const menuBtn = getByRole('button', { name: '展开导航菜单' });
    expect(menuBtn).not.toBeNull();
    expect(menuBtn.getAttribute('title')).toBe('展开导航菜单');
    expect(menuBtn.classList.contains('collapsed')).toBe(true);
  });
});
