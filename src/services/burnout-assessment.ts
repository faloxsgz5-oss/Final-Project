import { Activity, Schedule, WithId } from '@/types/smartlife';

export type BurnoutLevel = 'normal' | 'tired' | 'at-risk' | 'burnout';

export interface BurnoutAssessment {
  level: BurnoutLevel;
  score: number;
  label: string;
  suggestion: string;
  factors: {
    taskLoad: number;
    overdueCount: number;
    classHours: number;
    freeHoursToday: number;
    weekWorkload: number;
  };
}

function toDate(ts: any): Date {
  if (!ts) return new Date();
  if (ts.toDate && typeof ts.toDate === 'function') {
    return ts.toDate();
  }
  if (ts instanceof Date) {
    return ts;
  }
  return new Date(ts);
}

export function assessBurnout(params: {
  todayActivities: WithId<Activity>[];
  todaySchedules: WithId<Schedule>[];
  weekActivities: WithId<Activity>[];
  pendingTasks: WithId<Activity>[];
}): BurnoutAssessment {
  const { todayActivities, todaySchedules, weekActivities, pendingTasks } = params;
  let score = 0;

  // factors
  const taskLoad = todayActivities.length;
  if (taskLoad > 5) score += 20;

  const now = new Date();
  let overdueCount = 0;
  for (const t of pendingTasks) {
    if (t.status !== 'completed' && t.endAt) {
      const endDate = toDate(t.endAt);
      if (endDate < now) {
        overdueCount++;
      }
    }
  }
  if (overdueCount > 3) score += 15;

  let classHours = 0;
  for (const s of todaySchedules) {
    if (s.startAt && s.endAt) {
      const start = toDate(s.startAt).getTime();
      const end = toDate(s.endAt).getTime();
      classHours += (end - start) / (1000 * 60 * 60);
    }
  }
  if (classHours > 6) score += 15;

  // Calculate free hours between 8:00 and 22:00
  interface Interval {
    start: number;
    end: number;
  }
  const intervals: Interval[] = [];
  const dayStart = new Date(now);
  dayStart.setHours(8, 0, 0, 0);
  const dayEnd = new Date(now);
  dayEnd.setHours(22, 0, 0, 0);

  const addInterval = (startTs: any, endTs: any) => {
    if (!startTs || !endTs) return;
    let s = toDate(startTs).getTime();
    let e = toDate(endTs).getTime();
    s = Math.max(s, dayStart.getTime());
    e = Math.min(e, dayEnd.getTime());
    if (s < e) {
      intervals.push({ start: s, end: e });
    }
  };

  for (const s of todaySchedules) addInterval(s.startAt, s.endAt);
  for (const a of todayActivities) addInterval(a.startAt, a.endAt);

  intervals.sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const iv of intervals) {
    if (merged.length === 0) {
      merged.push(iv);
    } else {
      const last = merged[merged.length - 1];
      if (iv.start <= last.end) {
        last.end = Math.max(last.end, iv.end);
      } else {
        merged.push(iv);
      }
    }
  }

  let occupiedTimeMs = 0;
  for (const iv of merged) {
    occupiedTimeMs += (iv.end - iv.start);
  }

  const freeHoursToday = 14 - (occupiedTimeMs / (1000 * 60 * 60));
  if (freeHoursToday < 2) score += 20;

  const weekWorkload = weekActivities.length;
  if (weekWorkload > 20) score += 15;

  // Consecutive days with > 4 tasks
  const daysMap = new Map<string, number>();
  for (const a of weekActivities) {
    if (a.startAt) {
      const d = toDate(a.startAt);
      const dateStr = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      daysMap.set(dateStr, (daysMap.get(dateStr) || 0) + 1);
    }
  }

  const sortedDays = Array.from(daysMap.keys())
    .map(ds => {
      const [y, m, d] = ds.split('-').map(Number);
      return new Date(y, m, d).getTime();
    })
    .sort((a, b) => a - b);

  let hasConsecutive = false;
  for (let i = 0; i < sortedDays.length - 1; i++) {
    const current = sortedDays[i];
    const next = sortedDays[i + 1];
    const diffDays = Math.round((next - current) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) {
      const currD = new Date(current);
      const nextD = new Date(next);
      const currStr = `${currD.getFullYear()}-${currD.getMonth()}-${currD.getDate()}`;
      const nextStr = `${nextD.getFullYear()}-${nextD.getMonth()}-${nextD.getDate()}`;
      if ((daysMap.get(currStr) || 0) > 4 && (daysMap.get(nextStr) || 0) > 4) {
        hasConsecutive = true;
        break;
      }
    }
  }

  if (hasConsecutive) score += 15;

  score = Math.min(100, Math.max(0, score));

  let level: BurnoutLevel = 'normal';
  let label = '';
  let suggestion = '';

  if (score <= 25) {
    level = 'normal';
    label = 'ปกติ';
    suggestion = 'วันนี้ภาระงานปกติ มีเวลาว่างเพียงพอ';
  } else if (score <= 50) {
    level = 'tired';
    label = 'เริ่มเหนื่อย';
    suggestion = 'เริ่มมีงานเยอะ ควรจัดลำดับความสำคัญและพักเป็นระยะ';
  } else if (score <= 75) {
    level = 'at-risk';
    label = 'เสี่ยงหมดไฟ';
    suggestion = 'ภาระงานสูงมาก ควรเลื่อนงานที่ไม่เร่งด่วนและหาเวลาพักผ่อน';
  } else {
    level = 'burnout';
    label = 'หมดไฟ';
    suggestion = 'ระวังหมดไฟ! ควรพักอย่างน้อย 1-2 ชั่วโมง และลดงานที่ไม่จำเป็น';
  }

  return {
    level,
    score,
    label,
    suggestion,
    factors: {
      taskLoad,
      overdueCount,
      classHours,
      freeHoursToday,
      weekWorkload
    }
  };
}
