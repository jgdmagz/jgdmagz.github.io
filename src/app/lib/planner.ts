import type { AssignmentRow, CourseRow, TimeBlockRow } from './types';
import {
  blockCompletedOn,
  blockInstanceOn,
  blockOccursOn,
  classMeetingsOn,
  sameDay,
  startOfDay,
} from './time';

/** One renderable thing on the wave timeline. */
export interface WTItem {
  id: string;
  kind: 'event' | 'class' | 'task';
  title: string;
  subtitle?: string;
  start: Date;
  end: Date;
  color: string;
  done: boolean;
  courseId?: string;
  block?: TimeBlockRow;
  assignmentId?: string;
}

export interface DayItems {
  items: WTItem[];
  allDay: TimeBlockRow[];
}

/** Assemble everything happening on `day` from the store's raw rows. */
export function buildDayItems(
  day: Date,
  courses: CourseRow[],
  assignments: AssignmentRow[],
  blocks: TimeBlockRow[]
): DayItems {
  const items: WTItem[] = [];
  const allDay: TimeBlockRow[] = [];
  const courseById = new Map(courses.map((c) => [c.id, c]));

  for (const block of blocks) {
    if (!blockOccursOn(block, day)) continue;
    if (block.is_all_day) {
      allDay.push(block);
      continue;
    }
    const { start, end } = blockInstanceOn(block, day);
    const course = block.course_id ? courseById.get(block.course_id) : undefined;
    items.push({
      id: `block-${block.id}`,
      kind: 'event',
      title: block.title || 'Untitled',
      subtitle: block.location || course?.name || undefined,
      start,
      end,
      color: block.color_hex || '#595BCD',
      done: blockCompletedOn(block, day),
      courseId: block.course_id ?? undefined,
      block,
    });
  }

  for (const cls of classMeetingsOn(courses, day)) {
    items.push({
      id: `class-${cls.course.id}-${cls.start.getHours()}-${cls.start.getMinutes()}`,
      kind: 'class',
      title: cls.course.name,
      subtitle: cls.meeting.location || 'Class',
      start: cls.start,
      end: cls.end,
      color: cls.course.color_hex,
      done: false,
      courseId: cls.course.id,
    });
  }

  for (const a of assignments) {
    const due = new Date(a.due_at);
    if (!sameDay(due, day)) continue;
    const course = courseById.get(a.course_id);
    items.push({
      id: `task-${a.id}`,
      kind: 'task',
      title: a.title || 'Untitled',
      subtitle: course?.name,
      start: due,
      end: due,
      color: course?.color_hex ?? '#595BCD',
      done: a.is_completed,
      courseId: a.course_id,
      assignmentId: a.id,
    });
  }

  items.sort(
    (a, b) =>
      a.start.getTime() - b.start.getTime() ||
      (a.kind === 'task' ? 1 : 0) - (b.kind === 'task' ? 1 : 0)
  );
  return { items, allDay };
}

/* ── Wave timeline layout (port of the app's WT constants/engine) ── */

export const WT = {
  wavelength: 190,
  amplitude: 9,
  phaseSpeed: 0.45, // rad/s — "Gentle"
  minGapMinutes: 42,
  stackTuck: 20,
  stackIndent: 12,
  hCurrent: 136,
  hFuture: 70,
  hPast: 58,
  hTask: 54,
  hGap: 46,
  rowGap: 10,
} as const;

export interface WTGap {
  start: Date;
  end: Date;
}

export type WTEntry =
  | { type: 'item'; item: WTItem; y: number; h: number; depth: number; state: 'now' | 'future' | 'past' }
  | { type: 'gap'; gap: WTGap; y: number; h: number; past: boolean };

export interface WaveLayout {
  entries: WTEntry[];
  totalHeight: number;
  freeMinutes: number;
}

function timeAt(day: Date, hour: number): Date {
  const d = new Date(day);
  d.setHours(hour, 0, 0, 0);
  return d;
}

/** Free slots within the planning window, around the day's busy intervals. */
export function computeGaps(
  items: WTItem[],
  day: Date,
  windowStart: number,
  windowEnd: number
): WTGap[] {
  const winStart = timeAt(day, windowStart);
  const winEnd = timeAt(day, windowEnd);
  const busy = items
    .filter((i) => i.kind !== 'task')
    .map((i) => ({ start: i.start.getTime(), end: i.end.getTime() }))
    .sort((a, b) => a.start - b.start);

  const merged: { start: number; end: number }[] = [];
  for (const b of busy) {
    const last = merged[merged.length - 1];
    if (last && b.start <= last.end) last.end = Math.max(last.end, b.end);
    else merged.push({ ...b });
  }

  const gaps: WTGap[] = [];
  let cursor = winStart.getTime();
  for (const b of merged) {
    if (b.start - cursor >= WT.minGapMinutes * 60000 && b.start > winStart.getTime()) {
      gaps.push({ start: new Date(Math.max(cursor, winStart.getTime())), end: new Date(Math.min(b.start, winEnd.getTime())) });
    }
    cursor = Math.max(cursor, b.end);
  }
  if (winEnd.getTime() - cursor >= WT.minGapMinutes * 60000) {
    gaps.push({ start: new Date(cursor), end: winEnd });
  }
  return gaps.filter((g) => g.end.getTime() - g.start.getTime() >= WT.minGapMinutes * 60000);
}

/** Sequentially stack entries down the wave, tucking overlapping events. */
export function layoutDay(
  items: WTItem[],
  day: Date,
  windowStart: number,
  windowEnd: number,
  now: Date
): WaveLayout {
  const today = sameDay(day, now);
  const dayInPast = startOfDay(day).getTime() < startOfDay(now).getTime();
  const gaps = computeGaps(items, day, windowStart, windowEnd);

  type Pending =
    | { type: 'item'; item: WTItem; sort: number }
    | { type: 'gap'; gap: WTGap; sort: number };
  const pending: Pending[] = [
    ...items.map((item) => ({ type: 'item' as const, item, sort: item.start.getTime() })),
    ...gaps.map((gap) => ({ type: 'gap' as const, gap, sort: gap.start.getTime() + 1 })),
  ].sort((a, b) => a.sort - b.sort);

  const entries: WTEntry[] = [];
  let y = 8;
  let prevEventEnd = 0;
  let prevDepth = 0;

  for (const p of pending) {
    if (p.type === 'gap') {
      const past = today ? p.gap.end.getTime() <= now.getTime() : dayInPast;
      entries.push({ type: 'gap', gap: p.gap, y, h: WT.hGap, past });
      y += WT.hGap + WT.rowGap;
      continue;
    }
    const item = p.item;
    let state: 'now' | 'future' | 'past';
    if (dayInPast) state = 'past';
    else if (!today) state = 'future';
    else if (item.kind === 'task') state = item.start.getTime() < now.getTime() ? 'past' : 'future';
    else if (item.start <= now && now < item.end) state = 'now';
    else state = item.end.getTime() <= now.getTime() ? 'past' : 'future';

    const h =
      item.kind === 'task'
        ? WT.hTask
        : state === 'now'
          ? WT.hCurrent
          : state === 'past'
            ? WT.hPast
            : WT.hFuture;

    let depth = 0;
    if (item.kind !== 'task') {
      if (prevEventEnd > 0 && item.start.getTime() < prevEventEnd) {
        depth = prevDepth + 1;
        y -= WT.stackTuck;
      }
      prevEventEnd = Math.max(prevEventEnd, item.end.getTime());
      prevDepth = depth;
    }

    entries.push({ type: 'item', item, y, h, depth, state });
    y += h + WT.rowGap;
  }

  // Usable free time: a past day has none; today only counts from now on.
  const freeMinutes = gaps.reduce((sum, g) => {
    if (dayInPast) return sum;
    const from = today ? Math.max(g.start.getTime(), now.getTime()) : g.start.getTime();
    return sum + Math.max(0, (g.end.getTime() - from) / 60000);
  }, 0);

  return { entries, totalHeight: Math.max(y + 12, 120), freeMinutes };
}

export interface DayStats {
  planned: number;
  due: number;
  freeMinutes: number;
}

export function dayStats(items: WTItem[], layout: WaveLayout): DayStats {
  return {
    planned: items.filter((i) => i.kind !== 'task').length,
    due: items.filter((i) => i.kind === 'task').length,
    freeMinutes: Math.round(layout.freeMinutes),
  };
}
