import type { CopilotSession } from '../types';

export type SessionGroupLabel = '今天' | '昨天' | '最近一周' | '近期';

export interface SessionGroup {
  label: SessionGroupLabel;
  items: CopilotSession[];
}

/**
 * Groups sessions by date into:
 * - 今天 (Today)
 * - 昨天 (Yesterday)
 * - 最近一周 (Past 7 days)
 * - 近期 (Older)
 */
export function groupSessionsByDate(sessions: CopilotSession[]): SessionGroup[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;
  const startOfPastWeek = startOfToday - 6 * 86400000;

  const groups: Record<SessionGroupLabel, CopilotSession[]> = {
    今天: [],
    昨天: [],
    最近一周: [],
    近期: [],
  };

  for (const s of sessions) {
    const rawTime = s.last_active_at || s.created_at;
    const time = rawTime ? new Date(rawTime).getTime() : 0;

    if (time >= startOfToday) {
      groups['今天'].push(s);
    } else if (time >= startOfYesterday) {
      groups['昨天'].push(s);
    } else if (time >= startOfPastWeek) {
      groups['最近一周'].push(s);
    } else {
      groups['近期'].push(s);
    }
  }

  const order: SessionGroupLabel[] = ['今天', '昨天', '最近一周', '近期'];

  return order
    .filter((label) => groups[label].length > 0)
    .map((label) => ({
      label,
      items: groups[label],
    }));
}
