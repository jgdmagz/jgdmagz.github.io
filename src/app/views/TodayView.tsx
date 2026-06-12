import { useMemo, useState } from 'react';
import type { AppView } from '../FlowApp';
import { useStore } from '../lib/store';
import { buildDayItems, dayStats, layoutDay } from '../lib/planner';
import { fmtMinutes, termInfo } from '../lib/time';
import { useDayActions, type DaySheet } from '../lib/dayActions';
import { DEFAULT_DAY_END_HOUR, DEFAULT_DAY_START_HOUR } from '../lib/types';
import { WaveTimeline } from '../components/WaveTimeline';
import { EventSheet } from '../components/EventSheet';
import { AssignmentSheet } from '../components/AssignmentSheet';
import { EmptyState, Icon } from '../components/ui';

/** Planning window, persisted like the app's @AppStorage day window. */
export function useDayWindow(): [number, number, (s: number, e: number) => void] {
  const read = (key: string, fallback: number) => {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? v : fallback;
  };
  const [win, setWin] = useState<[number, number]>(() => [
    read('sf.dayWindowStartHour', DEFAULT_DAY_START_HOUR),
    read('sf.dayWindowEndHour', DEFAULT_DAY_END_HOUR),
  ]);
  const update = (s: number, e: number) => {
    const safeEnd = e > s ? e : s + 1;
    localStorage.setItem('sf.dayWindowStartHour', String(s));
    localStorage.setItem('sf.dayWindowEndHour', String(safeEnd));
    setWin([s, safeEnd]);
  };
  return [win[0], win[1], update];
}

export function WindowPicker({
  start,
  end,
  onChange,
}: {
  start: number;
  end: number;
  onChange: (s: number, e: number) => void;
}) {
  const fmt = (h: number) => {
    const base = h % 12 || 12;
    return `${base}${h >= 12 && h < 24 ? 'p' : 'a'}`;
  };
  return (
    <span className="win-picker" title="Planning window">
      <Icon name="clock" size={14} />
      <select value={start} onChange={(e) => onChange(Number(e.target.value), end)} aria-label="Day starts">
        {Array.from({ length: 13 }, (_, i) => i + 5).map((h) => (
          <option key={h} value={h}>{fmt(h)}</option>
        ))}
      </select>
      –
      <select value={end} onChange={(e) => onChange(start, Number(e.target.value))} aria-label="Day ends">
        {Array.from({ length: 12 }, (_, i) => i + 13).map((h) => (
          <option key={h} value={h}>{fmt(h)}</option>
        ))}
      </select>
    </span>
  );
}

export function TodayView({ onNavigate }: { onNavigate: (view: AppView) => void }) {
  const { profile, courses, assignments, blocks, user } = useStore();
  const today = useMemo(() => new Date(), []);
  const [winStart, winEnd, setWindow] = useDayWindow();
  const [sheet, setSheet] = useState<DaySheet>(null);
  const actions = useDayActions(today, setSheet);

  const { items, allDay } = useMemo(
    () => buildDayItems(today, courses, assignments, blocks),
    [today, courses, assignments, blocks]
  );
  const stats = useMemo(
    () => dayStats(items, layoutDay(items, today, winStart, winEnd, new Date())),
    [items, today, winStart, winEnd]
  );

  const hour = new Date().getHours();
  const greeting = hour < 5 ? 'Up late' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = (profile?.display_name || user?.email || 'there').split('@')[0].split(' ')[0];
  const term = termInfo(profile?.term_label ?? null, profile?.term_start ?? null, profile?.term_weeks ?? null);
  const dateLabel = today.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const openCourse = (courseId: string) => {
    sessionStorage.setItem('sf.openCourse', courseId);
    onNavigate('courses');
  };

  return (
    <div className="view today-view">
      <header className="view-head">
        <div>
          <div className="eyebrow">{dateLabel}</div>
          <h1 className="view-title">
            {greeting}, <span className="grad-text">{firstName}</span>
          </h1>
          {term && (
            <button className="term-chip" onClick={() => onNavigate('courses')}>
              <Icon name="flag" size={13} />
              {term.label} · Week {term.week} of {term.weeks}
            </button>
          )}
        </div>
        <button className="btn btn-sm head-add" onClick={() => setSheet({ kind: 'event' })}>
          <Icon name="plus" size={15} /> New event
        </button>
      </header>

      <div className="structure-bar glass">
        <span className="structure-stats">
          <strong>{stats.planned}</strong> planned · <strong>{stats.due}</strong> due ·{' '}
          <strong>{fmtMinutes(stats.freeMinutes)}</strong> free
        </span>
        <WindowPicker start={winStart} end={winEnd} onChange={setWindow} />
      </div>

      {allDay.length > 0 && (
        <div className="allday-strip">
          {allDay.map((b) => (
            <button
              key={b.id}
              className="allday-chip glass"
              onClick={() => setSheet({ kind: 'event', block: b })}
            >
              <span className="sheet-dot" style={{ background: b.color_hex }} />
              {b.title || 'All day'}
            </button>
          ))}
        </div>
      )}

      {items.length === 0 && stats.freeMinutes <= 0 ? (
        <EmptyState
          icon="sun"
          title="Nothing planned today"
          sub="Add an event or an assignment and watch your day take shape on the wave."
          action={
            <button className="btn btn-sm" onClick={() => setSheet({ kind: 'event' })}>
              <Icon name="plus" size={15} /> Plan something
            </button>
          }
        />
      ) : (
        <WaveTimeline
          day={today}
          items={items}
          windowStart={winStart}
          windowEnd={winEnd}
          onQuickPlan={actions.quickPlan}
          onCustomEvent={(start, end) => setSheet({ kind: 'event', start, end })}
          onToggleDone={actions.toggleDone}
          onEdit={actions.editItem}
          onRemove={actions.removeItem}
          onOpenCourse={openCourse}
        />
      )}

      {sheet?.kind === 'event' && (
        <EventSheet
          block={sheet.block}
          defaultStart={sheet.start}
          defaultEnd={sheet.end}
          day={today}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === 'task' && (
        <AssignmentSheet
          assignment={assignments.find((a) => a.id === sheet.assignmentId)}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}
