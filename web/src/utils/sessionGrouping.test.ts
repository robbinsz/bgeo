import { describe, it, expect } from 'vitest';
import { groupSessionsByDate } from './sessionGrouping';
import type { CopilotSession } from '../types';

describe('groupSessionsByDate', () => {
  it('correctly classifies sessions into 今天, 昨天, 最近一周, and 近期', () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 14, 0).toISOString();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 10, 0).toISOString();
    const threeDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 3, 10, 0).toISOString();
    const tenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 10, 10, 0).toISOString();

    const mockSessions: CopilotSession[] = [
      { id: '1', project_id: 'p1', user_id: 'u1', title: '今日会话 1', last_active_at: today, created_at: today },
      { id: '2', project_id: 'p1', user_id: 'u1', title: '昨日会话 2', last_active_at: yesterday, created_at: yesterday },
      { id: '3', project_id: 'p1', user_id: 'u1', title: '前几天会话 3', last_active_at: threeDaysAgo, created_at: threeDaysAgo },
      { id: '4', project_id: 'p1', user_id: 'u1', title: '更早会话 4', last_active_at: tenDaysAgo, created_at: tenDaysAgo },
    ];

    const groups = groupSessionsByDate(mockSessions);

    expect(groups.length).toBe(4);
    expect(groups[0].label).toBe('今天');
    expect(groups[0].items[0].id).toBe('1');

    expect(groups[1].label).toBe('昨天');
    expect(groups[1].items[0].id).toBe('2');

    expect(groups[2].label).toBe('最近一周');
    expect(groups[2].items[0].id).toBe('3');

    expect(groups[3].label).toBe('近期');
    expect(groups[3].items[0].id).toBe('4');
  });

  it('omits empty groups when no sessions match', () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 30).toISOString();

    const mockSessions: CopilotSession[] = [
      { id: '1', project_id: 'p1', user_id: 'u1', title: '今日会话', last_active_at: today, created_at: today },
    ];

    const groups = groupSessionsByDate(mockSessions);
    expect(groups.length).toBe(1);
    expect(groups[0].label).toBe('今天');
  });
});
