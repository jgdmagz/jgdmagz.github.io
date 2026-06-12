import type { ClassMeeting, CourseRow, TimeBlockRow } from './types';

/* ── Day helpers ────────────────────────────────────────────────── */

export function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Occurrence key — "YYYY-M-D", non-padded, matching TimeBlock.occurrenceKey in the app. */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** App Weekday raw value for a date: 1=Sun … 7=Sat. */
export function appWeekday(d: Date): number {
  return d.getDay() + 1;
}

/* ── TimeBlock recurrence (port of TimeBlock.occurs/instance) ──── */

export function blockOccursOn(block: TimeBlockRow, day: Date): boolean {
  const start = new Date(block.start_at);
  const dayStart = startOfDay(day);
  if (dayStart.getTime() < startOfDay(start).getTime()) return false;

  switch (block.repeat_rule) {
    case 'none':
      return sameDay(start, day);
    case 'daily':
      return true;
    case 'weekdays': {
      const wd = day.getDay();
      return wd >= 1 && wd <= 5;
    }
    case 'weekly':
      return day.getDay() === start.getDay();
    case 'custom':
      return block.repeat_weekdays.includes(appWeekday(day));
    case 'monthly':
      return day.getDate() === start.getDate();
    default:
      return false;
  }
}

export interface BlockInstance {
  start: Date;
  end: Date;
}

/** Map a (possibly repeating) block's times onto a specific day. */
export function blockInstanceOn(block: TimeBlockRow, day: Date): BlockInstance {
  const start = new Date(block.start_at);
  const end = new Date(block.end_at);
  const durationMs = Math.max(0, end.getTime() - start.getTime());
  const mapped = new Date(day);
  mapped.setHours(start.getHours(), start.getMinutes(), 0, 0);
  return { start: mapped, end: new Date(mapped.getTime() + durationMs) };
}

export function blockCompletedOn(block: TimeBlockRow, day: Date): boolean {
  return block.completed_occurrences.includes(dateKey(day));
}

/* ── Class meetings → day instances ─────────────────────────────── */

export interface ClassInstance {
  course: CourseRow;
  meeting: ClassMeeting;
  start: Date;
  end: Date;
}

export function classMeetingsOn(courses: CourseRow[], day: Date): ClassInstance[] {
  const wd = appWeekday(day);
  const out: ClassInstance[] = [];
  for (const course of courses) {
    if (course.is_archived) continue;
    for (const meeting of course.class_meetings ?? []) {
      if (!meeting.days?.includes(wd)) continue;
      const start = new Date(day);
      start.setHours(meeting.startHour, meeting.startMinute, 0, 0);
      const end = new Date(day);
      end.setHours(meeting.endHour, meeting.endMinute, 0, 0);
      if (end > start) out.push({ course, meeting, start, end });
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/* ── Formatting ─────────────────────────────────────────────────── */

/** "9:00a" / "12:30p" — the app's compact time style. */
export function fmtTime(d: Date): string {
  let h = d.getHours();
  const suffix = h >= 12 ? 'p' : 'a';
  h = h % 12 || 12;
  const m = d.getMinutes();
  return m === 0 ? `${h}${suffix}` : `${h}:${String(m).padStart(2, '0')}${suffix}`;
}

export function fmtTimeFull(d: Date): string {
  let h = d.getHours();
  const suffix = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(d.getMinutes()).padStart(2, '0')} ${suffix}`;
}

export function fmtHour(hour: number): string {
  const h = hour % 24;
  const base = h % 12 || 12;
  return `${base}${h >= 12 ? 'p' : 'a'}`;
}

/** "2h 15m" / "45m" */
export function fmtMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest}m`;
  return rest === 0 ? `${h}h` : `${h}h ${rest}m`;
}

const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function fmtDayShort(d: Date): string {
  return `${WEEKDAYS_SHORT[d.getDay()]} ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}

export function fmtMonthYear(d: Date): string {
  return `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtDateLong(d: Date): string {
  const today = new Date();
  if (sameDay(d, today)) return 'Today';
  if (sameDay(d, addDays(today, 1))) return 'Tomorrow';
  if (sameDay(d, addDays(today, -1))) return 'Yesterday';
  return fmtDayShort(d);
}

/** Relative due label: "Due today · 11:59p", "Due tomorrow", "Due Fri Mar 3", "Overdue · 2d". */
export function dueLabel(due: Date, now = new Date()): string {
  const dayDiff = Math.round(
    (startOfDay(due).getTime() - startOfDay(now).getTime()) / 86400000
  );
  if (due.getTime() < now.getTime() && dayDiff <= 0) {
    const days = Math.max(0, -dayDiff);
    return days === 0 ? `Overdue · ${fmtTime(due)}` : `Overdue · ${days}d`;
  }
  if (dayDiff === 0) return `Due today · ${fmtTime(due)}`;
  if (dayDiff === 1) return `Due tomorrow · ${fmtTime(due)}`;
  if (dayDiff < 7) return `Due ${WEEKDAYS_SHORT[due.getDay()]} · ${fmtTime(due)}`;
  return `Due ${fmtDayShort(due)}`;
}

/** Meeting time chip: "MWF · 9:00a–10:15a". */
export function meetingLabel(meeting: ClassMeeting): string {
  const letters: Record<number, string> = { 1: 'Su', 2: 'M', 3: 'Tu', 4: 'W', 5: 'Th', 6: 'F', 7: 'Sa' };
  const days = [...meeting.days].sort((a, b) => a - b).map((d) => letters[d] ?? '').join('');
  const s = new Date();
  s.setHours(meeting.startHour, meeting.startMinute, 0, 0);
  const e = new Date();
  e.setHours(meeting.endHour, meeting.endMinute, 0, 0);
  return `${days} · ${fmtTime(s)}–${fmtTime(e)}`;
}

/** ISO date (yyyy-MM-dd) → local Date at midnight; tolerates full timestamps. */
export function parseISODate(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(iso);
}

/* ── Term math (port of AcademicProfile helpers) ────────────────── */

export interface TermInfo {
  label: string;
  start: Date;
  end: Date;
  weeks: number;
  week: number; // 1-based, clamped
  progress: number; // 0…1
}

export function termInfo(
  label: string | null,
  startISO: string | null,
  weeks: number | null,
  now = new Date()
): TermInfo | null {
  if (!label || !startISO || !weeks || weeks <= 0) return null;
  const start = parseISODate(startISO);
  const end = addDays(start, weeks * 7);
  const elapsed = now.getTime() - start.getTime();
  const span = end.getTime() - start.getTime();
  const progress = Math.min(1, Math.max(0, span > 0 ? elapsed / span : 0));
  const week = Math.min(
    weeks,
    Math.max(1, Math.floor(elapsed / (7 * 86400000)) + 1)
  );
  return { label, start, end, weeks, week, progress };
}
