import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppView } from '../FlowApp';
import { useStore } from '../lib/store';
import { useFlow } from '../components/FlowContext';
import { buildDayItems, dayStats, layoutDay, type WTItem } from '../lib/planner';
import { fmtMinutes, fmtTime } from '../lib/time';
import { useDayActions, type DaySheet } from '../lib/dayActions';
import { DEFAULT_DAY_END_HOUR, DEFAULT_DAY_START_HOUR } from '../lib/types';
import { WaveTimeline } from '../components/WaveTimeline';
import { EventSheet } from '../components/EventSheet';
import { AssignmentSheet } from '../components/AssignmentSheet';
import { Icon, Modal, Overlay } from '../components/ui';
import type { AssignmentRow } from '../lib/types';

/* Web port of DashboardView.swift — the "Good morning" Home screen:
   My Day hero (FlowTimelineHero), live class banner, Focus Insight,
   Task Intelligence, jobs card and My Lists. The full planner (the old
   Today view) now lives behind "Explore your day", like MyDayExploreView. */

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

/* ── Shared bits ─────────────────────────────────────────────────── */

/** DashboardView.greeting — exact hour cutoffs. */
function greetingFor(hour: number): string {
  if (hour < 5) return 'Late night';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Good night';
}

/** Course code — first letters of the first two words, else first 2 chars. */
function courseCode(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/** TaskSummaryRow relative date: Today / Tomorrow / Yesterday / Nd ago / weekday / MMM d. */
function relativeDue(due: Date, now: Date): string {
  const d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const d1 = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const days = Math.round((d1.getTime() - d0.getTime()) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days < 0) return `${-days}d ago`;
  if (days < 7) return due.toLocaleDateString('en-US', { weekday: 'long' });
  return due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** iOS-style focus total: "4h 39m" / "5h" / "39m". */
function focusTotal(totalMinutes: number): string {
  if (totalMinutes >= 60) {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  }
  return `${totalMinutes}m`;
}

function ComingSoonModal({
  title,
  sub,
  onClose,
}: {
  title: string;
  sub: string;
  onClose: () => void;
}) {
  return (
    <Modal onClose={onClose}>
      <div className="soon">
        <div className="soon-glyph">
          <Icon name="sparkles" size={26} strokeWidth={1.7} />
        </div>
        <div className="eyebrow soon-eyebrow">Coming soon</div>
        <h2 className="soon-title">{title}</h2>
        <p className="soon-sub">{sub}</p>
        <button className="cta-capsule" onClick={onClose}>
          Got it
        </button>
      </div>
    </Modal>
  );
}

/* ── Wavy vertical line (WavyVerticalLine port: amp 7, wavelength 140) ── */

function WavyLine({ amplitude = 7, wavelength = 140, opacity = [0.55, 0.2] }: {
  amplitude?: number;
  wavelength?: number;
  opacity?: [number, number];
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    let height = 0;
    const draw = (phase: number) => {
      if (!pathRef.current || height <= 0) return;
      let d = '';
      for (let y = 0; y <= height; y += 4) {
        const x = 13 + amplitude * Math.sin((y / wavelength) * 2 * Math.PI + phase);
        d += (d ? 'L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2);
      }
      pathRef.current.setAttribute('d', d);
    };
    const ro = new ResizeObserver(() => {
      height = wrap.clientHeight;
      if (svgRef.current) svgRef.current.setAttribute('viewBox', `0 0 26 ${Math.max(1, height)}`);
      draw(0);
    });
    ro.observe(wrap);

    let raf = 0;
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      let last = 0;
      const tick = (t: number) => {
        raf = requestAnimationFrame(tick);
        if (document.hidden || t - last < 40) return;
        last = t;
        draw(((t / 1000) % 6) * ((2 * Math.PI) / 6)); // phase 0→2π every 6s, flowing down
      };
      raf = requestAnimationFrame(tick);
    }
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [amplitude, wavelength]);

  const gid = useMemo(() => `wl${Math.random().toString(36).slice(2, 8)}`, []);
  return (
    <div className="wavy-line" ref={wrapRef} aria-hidden="true">
      <svg ref={svgRef} width="26" preserveAspectRatio="none">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={`rgba(89,91,205,${opacity[0]})`} />
            <stop offset="100%" stopColor={`rgba(89,91,205,${opacity[1]})`} />
          </linearGradient>
        </defs>
        <path ref={pathRef} fill="none" stroke={`url(#${gid})`} strokeWidth="3" strokeLinecap="round" />
      </svg>
    </div>
  );
}

/* ── My Day hero (FlowTimelineHero) ──────────────────────────────── */

const MAX_VISIBLE_ROWS = 4;

function heroHeadline(items: WTItem[]): string {
  if (items.length === 0) return 'A clear horizon — plan a moment that matters.';
  const active = items.filter((i) => !i.done).length;
  if (active === 1) return 'One thing on your plan today.';
  return `${active} stops on your day.`;
}

function gapHint(mins: number): string {
  if (mins <= 0) return 'Add';
  if (mins < 60) return `${mins} min free`;
  const h = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem === 0 ? `${h}h free` : `${h}h ${rem}m free`;
}

function MyDayHero({
  items,
  now,
  streak,
  onExplore,
  onPlanGap,
  onTapItem,
}: {
  items: WTItem[];
  now: Date;
  streak: number;
  onExplore: () => void;
  onPlanGap: (start: Date, end: Date) => void;
  onTapItem: (item: WTItem) => void;
}) {
  const visible = items.slice(0, MAX_VISIBLE_ROWS);
  const overflow = items.length - visible.length;

  return (
    <section className="hero-card glass">
      <div className="hero-wash" aria-hidden="true" />
      <div className="hero-head">
        <span className="eyebrow eyebrow-muted">My Day</span>
        <span className="streak-chip">
          <Icon name="flame" size={12} className="streak-flame" />
          <strong>{streak}</strong>
          <span className="streak-day">day</span>
        </span>
      </div>
      <h2 className="hero-headline">{heroHeadline(items)}</h2>

      {items.length === 0 ? (
        <div className="hero-empty">
          <WavyLine opacity={[0.45, 0.15]} />
          <p>
            Nothing on the books yet.
            <br />
            Drop in a class, a task, or a focus block to begin.
          </p>
        </div>
      ) : (
        <div className="hero-body">
          <WavyLine />
          {visible.map((item, i) => {
            const next = visible[i + 1];
            const gapMins = next
              ? Math.round((next.start.getTime() - item.end.getTime()) / 60000)
              : 0;
            return (
              <div key={item.id}>
                <HeroRow item={item} now={now} onTap={() => onTapItem(item)} />
                {next && gapMins > 0 && (
                  <button
                    className="hero-gap"
                    onClick={() => {
                      const mid = new Date((item.end.getTime() + next.start.getTime()) / 2);
                      mid.setMinutes(Math.round(mid.getMinutes() / 5) * 5, 0, 0);
                      onPlanGap(mid, new Date(mid.getTime() + 3600000));
                    }}
                  >
                    <span className="hero-gap-plus">
                      <Icon name="plus" size={11} strokeWidth={2.6} />
                    </span>
                    <span className="hero-gap-chip">
                      <strong>Plan</strong> {gapHint(gapMins)}
                    </span>
                  </button>
                )}
              </div>
            );
          })}
          {overflow > 0 && (
            <button className="hero-overflow" onClick={onExplore}>
              <span className="hero-overflow-dot" />+ {overflow} more
            </button>
          )}
        </div>
      )}

      <button className="cta-capsule hero-cta" onClick={onExplore}>
        <Icon name="sparkles" size={14} strokeWidth={2} />
        Explore your day
      </button>
    </section>
  );
}

function HeroRow({ item, now, onTap }: { item: WTItem; now: Date; onTap: () => void }) {
  const isLive = item.start <= now && now < item.end && !item.done;
  const isPast = (item.end < now || item.done) && !isLive;
  const isTask = item.kind === 'task';
  const overdue = isTask && !item.done && item.end < now;

  if (isLive && !isTask) {
    const total = item.end.getTime() - item.start.getTime();
    const frac = Math.min(1, Math.max(0, (now.getTime() - item.start.getTime()) / Math.max(1, total)));
    const minsLeft = Math.max(0, Math.round((item.end.getTime() - now.getTime()) / 60000));
    return (
      <div className="hero-row">
        <span className="hero-time live">
          <strong>{fmtTime(item.start)}</strong>
        </span>
        <span className="hero-node">
          <span className="pulse-dot" style={{ background: item.color }} />
        </span>
        <button className="now-card glass" onClick={onTap}>
          <span className="now-head">
            <span className="pulse-dot sm" style={{ background: 'var(--accent)' }} />
            <span className="eyebrow now-eyebrow">Now</span>
            <span className="now-left" style={{ color: item.color }}>
              {fmtMinutes(minsLeft)} left
            </span>
          </span>
          <span className="now-title">{item.title}</span>
          {item.subtitle && <span className="now-sub">{item.subtitle}</span>}
          <span className="now-track">
            <span className="now-fill" style={{ width: `${Math.max(4, frac * 100)}%`, background: item.color }} />
          </span>
          <span className="now-foot">
            <span>{fmtTime(item.start)}</span>
            <span>ends {fmtTime(item.end)}</span>
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className={`hero-row${isPast ? ' past' : ''}`}>
      <span className={`hero-time${isPast ? ' dim' : ''}`}>
        <strong>{fmtTime(item.start)}</strong>
        {!isTask && <span>{fmtTime(item.end)}</span>}
      </span>
      <span className="hero-node">
        {item.done || (isPast && !isTask) ? (
          <span className="hero-node-done" style={{ background: item.color }}>
            <Icon name="check" size={7} strokeWidth={3.2} />
          </span>
        ) : (
          <span className="hero-node-ring" style={{ borderColor: item.color }} />
        )}
      </span>
      {isTask ? (
        <button
          className={`hero-task${item.done ? ' done' : ''}`}
          style={{
            background: `color-mix(in srgb, ${item.color} ${overdue ? 10 : 7}%, transparent)`,
            borderColor: `color-mix(in srgb, ${item.color} ${item.done ? 22 : 40}%, transparent)`,
          }}
          onClick={onTap}
        >
          <span className="hero-task-main">
            <span className="hero-task-title">{item.title}</span>
            {item.subtitle && <span className="hero-task-sub">{item.subtitle}</span>}
          </span>
          <span
            className="hero-task-pill"
            style={{ borderColor: `color-mix(in srgb, ${item.done ? 'var(--mint)' : item.color} 50%, transparent)`, color: item.done ? 'var(--mint)' : item.color }}
          >
            {item.done ? 'done' : overdue ? 'overdue' : `due ${fmtTime(item.end)}`}
          </span>
        </button>
      ) : (
        <button className="hero-event glass" onClick={onTap}>
          <span className="hero-event-bar" style={{ background: item.color }} />
          <span className="hero-event-main">
            <span className="hero-event-title">{item.title}</span>
            <span className="hero-event-sub">
              {fmtTime(item.start)} – {fmtTime(item.end)} ·{' '}
              {fmtMinutes((item.end.getTime() - item.start.getTime()) / 60000)}
            </span>
          </span>
          <span
            className="hero-event-pill"
            style={
              item.done
                ? undefined
                : { color: item.color, background: `color-mix(in srgb, ${item.color} 15%, transparent)` }
            }
          >
            {item.done ? 'done' : fmtMinutes((item.end.getTime() - item.start.getTime()) / 60000)}
          </span>
        </button>
      )}
    </div>
  );
}

/* ── Live class banner ───────────────────────────────────────────── */

function LiveClassBanner({ items, now }: { items: WTItem[]; now: Date }) {
  const live = items.find((i) => i.kind === 'class' && i.start <= now && now < i.end);
  if (!live) return null;
  const minsLeft = Math.max(0, Math.round((live.end.getTime() - now.getTime()) / 60000));
  return (
    <div className="live-banner">
      <span className="live-dot" aria-hidden="true" />
      <span className="live-main">
        <span className="live-title-row">
          <span className="live-title">{live.title}</span>
          <span className="live-chip">Live</span>
        </span>
        <span className="live-sub">
          {fmtTime(live.start)} – {fmtTime(live.end)}
        </span>
      </span>
      <span className="live-left">{fmtMinutes(minsLeft)} left</span>
    </div>
  );
}

/* ── Focus Insight (last session + 7-day chart) ──────────────────── */

function FocusInsight({ onOpenFlow }: { onOpenFlow: () => void }) {
  const { stats, history, state } = useFlow();
  const active = state.status !== 'idle';
  const [held, setHeld] = useState<number | null>(null);

  const days = useMemo(() => {
    const out: { label: string; minutes: number; isToday: boolean }[] = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const minutes = Math.round(
        history
          .filter((r) => {
            const s = new Date(r.startedAt);
            return (
              s.getFullYear() === d.getFullYear() &&
              s.getMonth() === d.getMonth() &&
              s.getDate() === d.getDate()
            );
          })
          .reduce((sum, r) => sum + r.elapsedSeconds, 0) / 60
      );
      out.push({
        label: d.toLocaleDateString('en-US', { weekday: 'narrow' }),
        minutes,
        isToday: i === 0,
      });
    }
    return out;
  }, [history]);

  const peak = Math.max(1, ...days.map((d) => d.minutes));
  const totalMinutes = Math.round(stats.totalFlowSeconds / 60);
  const avg = stats.totalSessions > 0 ? `${Math.round(totalMinutes / Math.max(1, stats.totalSessions))}m` : '—';

  return (
    <section className="insight-card glass">
      <div className="insight-head">
        <div>
          <span className="eyebrow eyebrow-muted">Focus Insight</span>
          <div className="insight-title">{active ? 'Flow session in motion' : 'Last session'}</div>
        </div>
        {(active || stats.totalSessions > 0) && (
          <button className="insight-start" onClick={onOpenFlow}>
            <Icon name={active ? 'play' : 'restart'} size={11} strokeWidth={2.4} />
            {active ? 'Resume' : 'Start'}
          </button>
        )}
      </div>

      <div className="insight-metrics">
        <div className="insight-metric">
          <span className="insight-value">{focusTotal(totalMinutes)}</span>
          <span className="insight-label">Total focus</span>
        </div>
        <span className="insight-rule" />
        <div className="insight-metric">
          <span className="insight-value">{stats.currentStreak}</span>
          <span className="insight-label">Day streak</span>
        </div>
        <span className="insight-rule" />
        <div className="insight-metric">
          <span className="insight-value">{avg}</span>
          <span className="insight-label">Avg session</span>
        </div>
      </div>

      <div className="insight-chart">
        {days.map((d, i) => (
          <div
            className="insight-col"
            key={i}
            onPointerDown={() => setHeld(i)}
            onPointerUp={() => setHeld(null)}
            onPointerLeave={() => setHeld((h) => (h === i ? null : h))}
          >
            {held === i && (
              <span className="insight-tip">{d.minutes > 0 ? focusTotal(d.minutes) : 'No focus'}</span>
            )}
            <span className={`insight-track${held === i ? ' held' : ''}`}>
              {d.minutes > 0 && (
                <span
                  className={`insight-bar${d.isToday ? ' today' : ''}`}
                  style={{ height: `${Math.max(4, (d.minutes / peak) * 34)}px` }}
                />
              )}
            </span>
            <span className={`insight-dow${d.isToday || held === i ? ' on' : ''}`}>{d.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Task Intelligence ───────────────────────────────────────────── */

type Bucket = 'overdue' | 'today' | 'upcoming';

const BUCKETS: { key: Bucket; label: string; icon: string; tint: string; empty: string }[] = [
  { key: 'overdue', label: 'Overdue', icon: 'alertCircle', tint: 'var(--coral)', empty: "Nothing overdue. You're caught up." },
  { key: 'today', label: 'Today', icon: 'sun', tint: 'var(--accent)', empty: 'Nothing due today. A clear runway.' },
  { key: 'upcoming', label: 'Upcoming', icon: 'calendar', tint: 'var(--lavender)', empty: 'No upcoming tasks scheduled.' },
];

function TaskIntelligence({ now }: { now: Date }) {
  const { assignments, courses, toggleAssignment } = useStore();
  const [open, setOpen] = useState<Bucket | null>('today');

  const buckets = useMemo(() => {
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startTomorrow = new Date(startToday.getTime() + 86400000);
    const pending = assignments
      .filter((a) => !a.is_completed && a.entry_type !== 'event')
      .sort((a, b) => a.due_at.localeCompare(b.due_at));
    return {
      overdue: pending.filter((a) => new Date(a.due_at) < startToday),
      today: pending.filter((a) => {
        const d = new Date(a.due_at);
        return d >= startToday && d < startTomorrow;
      }),
      upcoming: pending.filter((a) => new Date(a.due_at) >= startTomorrow),
    };
  }, [assignments, now]);

  const courseById = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const openDef = BUCKETS.find((b) => b.key === open);

  return (
    <section className="ti-section">
      <span className="eyebrow eyebrow-muted ti-eyebrow">Task Intelligence</span>
      <div className="ti-tiles">
        {BUCKETS.map((b) => (
          <button
            key={b.key}
            className={`ti-tile glass${open === b.key ? ' open' : ''}`}
            style={{ '--tile-tint': b.tint } as React.CSSProperties}
            onClick={() => setOpen(open === b.key ? null : b.key)}
            aria-expanded={open === b.key}
          >
            <span className="ti-glow" aria-hidden="true" />
            <span className="ti-tile-head">
              <Icon name={b.icon} size={13} strokeWidth={2.2} className="ti-tile-ico" />
              <Icon name="chevronDown" size={10} strokeWidth={2.6} className="ti-caret" />
            </span>
            <span className="ti-count">{buckets[b.key].length}</span>
            <span className="ti-label">{b.label}</span>
          </button>
        ))}
      </div>

      {openDef && (
        <div className="ti-list glass">
          {buckets[openDef.key].length === 0 ? (
            <div className="ti-empty">
              <Icon name="checkCircle" size={16} strokeWidth={2} className="ti-empty-ico" />
              {openDef.empty}
            </div>
          ) : (
            buckets[openDef.key].slice(0, 6).map((a) => {
              const course = courseById.get(a.course_id);
              const color = course?.color_hex ?? 'var(--accent)';
              const due = new Date(a.due_at);
              const isOverdue = openDef.key === 'overdue';
              return (
                <div className="ti-row" key={a.id}>
                  <button
                    className={`ti-check${a.is_completed ? ' on' : ''}`}
                    style={a.is_completed ? { background: color, borderColor: color } : undefined}
                    onClick={() => toggleAssignment(a.id)}
                    aria-label={a.is_completed ? 'Mark not done' : 'Mark done'}
                  >
                    {a.is_completed && <Icon name="check" size={11} strokeWidth={3} />}
                  </button>
                  <span className="ti-row-main">
                    <span className={`ti-row-title${a.is_completed ? ' done' : ''}`}>{a.title}</span>
                    <span className="ti-row-meta">
                      <i style={{ background: color }} />
                      <span className="ti-row-code" style={{ color }}>
                        {course ? courseCode(course.name) : '—'}
                      </span>
                      <span className="ti-row-dotsep">·</span>
                      {openDef.key === 'today' ? (
                        <span>{a.estimated_minutes}m</span>
                      ) : (
                        <span style={isOverdue ? { color: 'var(--coral)' } : undefined}>
                          {relativeDue(due, now)}
                        </span>
                      )}
                    </span>
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}
    </section>
  );
}

/* ── Explore overlay (MyDayExploreView) — the full wave planner ──── */

function MyDayExplore({ onClose }: { onClose: () => void }) {
  const { courses, assignments, blocks } = useStore();
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.classList.add('modal-open');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('modal-open');
    };
  }, [onClose]);

  return (
    <Overlay>
    <div className="explore-overlay">
      <div className="explore-inner">
        <header className="explore-head">
          <div>
            <div className="eyebrow eyebrow-muted">My Day</div>
            <h1 className="explore-title">
              {today.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </h1>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" size={17} />
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
        />
      </div>

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
    </Overlay>
  );
}

/* ── Home ────────────────────────────────────────────────────────── */

export function TodayView({ onNavigate }: { onNavigate: (view: AppView) => void }) {
  const { courses, assignments, blocks } = useStore();
  const flow = useFlow();

  // 30-second dashboard clock, like DashboardView's `now`.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(id);
  }, []);

  const { items } = useMemo(
    () => buildDayItems(now, courses, assignments, blocks),
    [now, courses, assignments, blocks]
  );
  const sorted = useMemo(() => [...items].sort((a, b) => a.start.getTime() - b.start.getTime()), [items]);

  const [sheet, setSheet] = useState<DaySheet>(null);
  const [explore, setExplore] = useState(false);
  const [soon, setSoon] = useState<'ai' | 'jobs' | 'lists' | null>(null);
  const [listsOpen, setListsOpen] = useState(true);

  const dateLabel = `${now.toLocaleDateString('en-US', { weekday: 'long' })} · ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

  const tapItem = (item: WTItem) => {
    if (item.kind === 'task' && item.assignmentId) {
      setSheet({ kind: 'task', assignmentId: item.assignmentId });
    } else if (item.kind === 'event' && item.block) {
      setSheet({ kind: 'event', block: item.block });
    }
  };

  return (
    <div className="view home-view">
      {/* Top bar */}
      <header className="home-top">
        <div>
          <div className="eyebrow eyebrow-muted">{dateLabel}</div>
          <h1 className="home-greeting">{greetingFor(now.getHours())}</h1>
        </div>
        <div className="home-icons">
          <button className="glass-ico" onClick={() => setSoon('ai')} aria-label="AI chat — coming soon">
            <Icon name="sparkles" size={14} strokeWidth={2.1} />
          </button>
          <button className="glass-ico" onClick={() => onNavigate('profile')} aria-label="Your account">
            <Icon name="userCircle" size={15} strokeWidth={2} />
          </button>
          <button className="glass-ico" onClick={() => onNavigate('profile')} aria-label="Settings">
            <Icon name="gear" size={14} strokeWidth={1.9} />
          </button>
        </div>
      </header>

      <MyDayHero
        items={sorted}
        now={now}
        streak={flow.stats.currentStreak}
        onExplore={() => setExplore(true)}
        onPlanGap={(start, end) => setSheet({ kind: 'event', start, end })}
        onTapItem={tapItem}
      />

      <LiveClassBanner items={sorted} now={now} />

      <FocusInsight onOpenFlow={() => onNavigate('flow')} />

      <TaskIntelligence now={now} />

      {/* Jobs card — parity with the iOS work-schedule module */}
      <button className="jobs-card glass" onClick={() => setSoon('jobs')}>
        <span className="jobs-rail" aria-hidden="true" />
        <span className="jobs-tile">
          <Icon name="briefcase" size={15} />
        </span>
        <span className="jobs-main">
          <span className="jobs-title">Do you have a job?</span>
          <span className="jobs-sub">Add your shifts — they'll show on your calendar.</span>
        </span>
        <span className="jobs-plus">
          <Icon name="plus" size={12} strokeWidth={2.6} />
        </span>
      </button>

      {/* My Lists */}
      <section className="lists-section">
        <button className="lists-head" onClick={() => setListsOpen((o) => !o)} aria-expanded={listsOpen}>
          <span className="eyebrow eyebrow-muted">My Lists</span>
          <span className="lists-count">0</span>
        </button>
        {listsOpen && (
          <p className="lists-empty" onClick={() => setSoon('lists')}>
            No lists yet. Tap + to add one.
          </p>
        )}
      </section>

      {explore && <MyDayExplore onClose={() => setExplore(false)} />}

      {soon === 'ai' && (
        <ComingSoonModal
          title="AI chat"
          sub="We're polishing the Claude-powered chat experience. It'll know your schedule and your courses — landing in a future update."
          onClose={() => setSoon(null)}
        />
      )}
      {soon === 'jobs' && (
        <ComingSoonModal
          title="Work schedules"
          sub="Track your shifts alongside classes. Work schedules are on the way to the web app — they already live in the iOS app."
          onClose={() => setSoon(null)}
        />
      )}
      {soon === 'lists' && (
        <ComingSoonModal
          title="My Lists"
          sub="Custom todo lists with emoji and priorities are coming to the web app — they already live in the iOS app."
          onClose={() => setSoon(null)}
        />
      )}

      {sheet?.kind === 'event' && (
        <EventSheet
          block={sheet.block}
          defaultStart={sheet.start}
          defaultEnd={sheet.end}
          day={now}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === 'task' && (
        <AssignmentSheet
          assignment={assignments.find((a: AssignmentRow) => a.id === sheet.assignmentId)}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}
