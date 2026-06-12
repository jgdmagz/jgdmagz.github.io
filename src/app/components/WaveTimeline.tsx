import { useEffect, useMemo, useRef, useState } from 'react';
import { layoutDay, WT, type WTEntry, type WTGap, type WTItem } from '../lib/planner';
import { fmtMinutes, fmtTime, sameDay } from '../lib/time';
import { Icon } from './ui';

/* The signature Wave Timeline — a living sine spine flowing down the day,
   with glass cards for events, dashed slots for free time and quick-plan
   actions. Ported from the app's WaveSpineCanvas + WT* components. */

interface MenuAction {
  key: string;
  label: string;
  icon: string;
  danger?: boolean;
  run: () => void;
}

export interface WaveTimelineProps {
  day: Date;
  items: WTItem[];
  windowStart: number;
  windowEnd: number;
  onQuickPlan?: (start: Date, end: Date) => void;
  onCustomEvent?: (start: Date, end: Date) => void;
  onToggleDone?: (item: WTItem) => void;
  onEdit?: (item: WTItem) => void;
  onRemove?: (item: WTItem) => void;
  onOpenCourse?: (courseId: string) => void;
}

function waveX(y: number, spineX: number, phase: number): number {
  return spineX + WT.amplitude * Math.sin((y / WT.wavelength) * 2 * Math.PI + phase);
}

function spinePath(height: number, spineX: number, phase: number): string {
  let d = '';
  for (let y = 0; y <= height; y += 8) {
    d += (d ? 'L' : 'M') + waveX(y, spineX, phase).toFixed(2) + ' ' + y.toFixed(2);
  }
  return d;
}

export function WaveTimeline(props: WaveTimelineProps) {
  const { day, items, windowStart, windowEnd } = props;

  // "now" ticks every 30s so the NOW card, countdowns and dimming stay live.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(t);
  }, []);

  // Responsive geometry — the spine hugs the left edge on narrow screens.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const compact = width < 540;
  const spineX = compact ? 42 : 64;
  const cardX = spineX + (compact ? 26 : 32);

  const layout = useMemo(
    () => layoutDay(items, day, windowStart, windowEnd, now),
    [items, day, windowStart, windowEnd, now]
  );

  /* ── Animated spine (mutates SVG attrs directly — no re-renders) ── */
  const pathRef = useRef<SVGPathElement>(null);
  const phaseRef = useRef(0);
  const dotRefs = useRef(new Map<string, SVGCircleElement>());

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const draw = (phase: number) => {
      phaseRef.current = phase;
      pathRef.current?.setAttribute('d', spinePath(layout.totalHeight, spineX, phase));
      dotRefs.current.forEach((el) => {
        const y = Number(el.dataset.y || 0);
        el.setAttribute('cx', waveX(y, spineX, phase).toFixed(2));
      });
    };
    if (reduce) {
      draw(0);
      return;
    }
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden || t - last < 33) return; // ~30fps, paused off-tab
      last = t;
      draw(((t / 1000) * WT.phaseSpeed) % (2 * Math.PI));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [layout.totalHeight, spineX]);

  /* ── Quick-action menu ── */
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const closeMenu = () => setMenuFor(null);

  useEffect(() => {
    if (!menuFor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuFor(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuFor]);

  function entryKey(e: WTEntry): string {
    return e.type === 'gap' ? `gap-${e.gap.start.getTime()}` : e.item.id;
  }

  function actionsFor(entry: WTEntry): { title: string; actions: MenuAction[] } {
    const wrap = (fn?: (...args: never[]) => void) => fn !== undefined;
    if (entry.type === 'gap') {
      const g = entry.gap;
      const mins = Math.round((g.end.getTime() - g.start.getTime()) / 60000);
      const actions: MenuAction[] = [];
      if (props.onQuickPlan) {
        if (mins >= 30)
          actions.push({
            key: 'p30',
            label: 'Plan 30 min',
            icon: 'clock',
            run: () => props.onQuickPlan!(g.start, new Date(g.start.getTime() + 30 * 60000)),
          });
        if (mins >= 60)
          actions.push({
            key: 'p60',
            label: 'Plan 1 hour',
            icon: 'clock',
            run: () => props.onQuickPlan!(g.start, new Date(g.start.getTime() + 60 * 60000)),
          });
        actions.push({
          key: 'fill',
          label: `Fill gap · ${fmtMinutes(mins)}`,
          icon: 'sparkles',
          run: () => props.onQuickPlan!(g.start, g.end),
        });
      }
      if (props.onCustomEvent)
        actions.push({
          key: 'custom',
          label: 'Custom event…',
          icon: 'pencil',
          run: () => props.onCustomEvent!(g.start, new Date(Math.min(g.end.getTime(), g.start.getTime() + 60 * 60000))),
        });
      return { title: 'Free time', actions };
    }

    const item = entry.item;
    const actions: MenuAction[] = [];
    if (item.kind === 'class') {
      if (item.courseId && wrap(props.onOpenCourse))
        actions.push({
          key: 'course',
          label: 'Open course',
          icon: 'book',
          run: () => props.onOpenCourse!(item.courseId!),
        });
      return { title: 'Class', actions };
    }
    if (props.onToggleDone)
      actions.push({
        key: 'done',
        label: item.done ? 'Mark not done' : 'Mark done',
        icon: 'check',
        run: () => props.onToggleDone!(item),
      });
    if (props.onEdit)
      actions.push({
        key: 'edit',
        label: 'Edit details',
        icon: 'pencil',
        run: () => props.onEdit!(item),
      });
    if (props.onRemove)
      actions.push({
        key: 'remove',
        label: 'Remove',
        icon: 'trash',
        danger: true,
        run: () => props.onRemove!(item),
      });
    return { title: item.kind === 'task' ? 'Deadline' : 'Event', actions };
  }

  const menuEntry = layout.entries.find((e) => entryKey(e) === menuFor) ?? null;
  const menu = menuEntry ? actionsFor(menuEntry) : null;
  const menuHeight = menu ? 38 + menu.actions.length * 42 + 12 : 0;
  const menuTop = menuEntry
    ? menuEntry.y + menuEntry.h + 6 + menuHeight > layout.totalHeight
      ? Math.max(4, menuEntry.y - menuHeight - 6)
      : menuEntry.y + menuEntry.h + 6
    : 0;

  const today = sameDay(day, now);

  return (
    <div className="wt" ref={wrapRef} style={{ height: layout.totalHeight }}>
      {/* The living spine */}
      <svg className="wt-spine" width="100%" height={layout.totalHeight} aria-hidden="true">
        <path
          ref={pathRef}
          d={spinePath(layout.totalHeight, spineX, phaseRef.current)}
          fill="none"
          stroke="rgba(158,159,234,0.65)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        {layout.entries.map((e) => {
          if (e.type === 'item' && e.depth > 0) return null;
          const key = entryKey(e);
          const yc = e.y + e.h / 2;
          const isNow = e.type === 'item' && e.state === 'now';
          return (
            <circle
              key={key}
              ref={(el) => {
                if (el) dotRefs.current.set(key, el);
                else dotRefs.current.delete(key);
              }}
              data-y={yc}
              cx={waveX(yc, spineX, phaseRef.current)}
              cy={yc}
              r={isNow ? 5.5 : e.type === 'gap' ? 3 : 4}
              fill={
                e.type === 'gap'
                  ? 'var(--canvas)'
                  : e.item.kind === 'task'
                    ? 'var(--canvas)'
                    : e.item.color
              }
              stroke={e.type === 'gap' ? 'rgba(158,159,234,0.8)' : e.type === 'item' ? e.item.color : 'none'}
              strokeWidth={e.type === 'gap' || (e.type === 'item' && e.item.kind === 'task') ? 1.6 : isNow ? 0 : 0}
              className={isNow ? 'wt-dot-now' : undefined}
            />
          );
        })}
      </svg>

      {/* Time rail */}
      {layout.entries.map((e) => {
        if (e.type === 'item' && e.depth > 0) return null;
        const t = e.type === 'gap' ? e.gap.start : e.item.start;
        return (
          <div
            key={'t' + entryKey(e)}
            className={`wt-time${e.type === 'gap' || (e.type === 'item' && e.state === 'past') ? ' dim' : ''}`}
            style={{ top: e.y + e.h / 2 - 8, width: spineX - 14 }}
          >
            {fmtTime(t)}
          </div>
        );
      })}

      {/* Cards */}
      {layout.entries.map((e, i) => {
        const key = entryKey(e);
        const left = cardX + (e.type === 'item' ? e.depth * WT.stackIndent : 0);
        const style = {
          top: e.y,
          left,
          height: e.h,
          animationDelay: `${Math.min(i, 14) * 24}ms`,
        } as React.CSSProperties;

        if (e.type === 'gap') {
          return (
            <GapRow
              key={key}
              gap={e.gap}
              past={e.past}
              style={style}
              onClick={() => setMenuFor(menuFor === key ? null : key)}
            />
          );
        }
        if (e.state === 'now') {
          return (
            <NowCard
              key={key}
              item={e.item}
              now={now}
              style={style}
              onClick={() => setMenuFor(menuFor === key ? null : key)}
            />
          );
        }
        if (e.item.kind === 'task') {
          return (
            <TaskRow
              key={key}
              item={e.item}
              past={e.state === 'past'}
              today={today}
              style={style}
              onToggle={props.onToggleDone ? () => props.onToggleDone!(e.item) : undefined}
              onClick={() => setMenuFor(menuFor === key ? null : key)}
            />
          );
        }
        return (
          <EventRow
            key={key}
            item={e.item}
            past={e.state === 'past'}
            style={style}
            onClick={() => setMenuFor(menuFor === key ? null : key)}
          />
        );
      })}

      {/* Quick-action menu */}
      {menu && menuEntry && (
        <>
          <div className="wt-menu-backdrop" onMouseDown={closeMenu} />
          <div className="wt-menu glass" style={{ top: menuTop, left: Math.min(cardX, width - 232) }}>
            <div className="wt-menu-title">{menu.title}</div>
            {menu.actions.map((a) => (
              <button
                key={a.key}
                className={`wt-menu-item${a.danger ? ' danger' : ''}`}
                onClick={() => {
                  closeMenu();
                  a.run();
                }}
              >
                <Icon name={a.icon} size={16} />
                {a.label}
              </button>
            ))}
            {menu.actions.length === 0 && <div className="wt-menu-empty">Managed in Courses</div>}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Rows ───────────────────────────────────────────────────────── */

function NowCard({
  item,
  now,
  style,
  onClick,
}: {
  item: WTItem;
  now: Date;
  style: React.CSSProperties;
  onClick: () => void;
}) {
  const total = item.end.getTime() - item.start.getTime();
  const fraction = total > 0 ? (now.getTime() - item.start.getTime()) / total : 0;
  const left = Math.max(0, Math.round((item.end.getTime() - now.getTime()) / 60000));
  return (
    <button className="wt-card wt-now glass" style={style} onClick={onClick}>
      <div className="wt-now-eyebrow">
        <span className="pulse-dot" style={{ background: item.color }} />
        NOW
        <span className="wt-now-left">{fmtMinutes(left)} left</span>
      </div>
      <div className="wt-now-title">{item.title}</div>
      {item.subtitle && <div className="wt-now-sub">{item.subtitle}</div>}
      <div className="wt-progress">
        <div
          className="wt-progress-fill"
          style={{ width: `${Math.min(100, Math.max(2, fraction * 100))}%`, background: item.color }}
        />
      </div>
      <div className="wt-now-times">
        {fmtTime(item.start)} · ends {fmtTime(item.end)}
      </div>
    </button>
  );
}

function EventRow({
  item,
  past,
  style,
  onClick,
}: {
  item: WTItem;
  past: boolean;
  style: React.CSSProperties;
  onClick: () => void;
}) {
  const mins = Math.round((item.end.getTime() - item.start.getTime()) / 60000);
  return (
    <button className={`wt-card wt-event glass${past ? ' past' : ''}${item.done ? ' done' : ''}`} style={style} onClick={onClick}>
      <span className="wt-bar" style={{ background: item.color }} />
      <span className="wt-event-main">
        <span className="wt-event-title">
          {item.title}
          {item.kind === 'class' && <span className="wt-chip">Class</span>}
          {item.done && <Icon name="check" size={13} className="wt-done-check" />}
        </span>
        <span className="wt-event-sub">
          {fmtTime(item.start)}–{fmtTime(item.end)}
          {item.subtitle ? ` · ${item.subtitle}` : ''}
        </span>
      </span>
      <span className="wt-pill" style={{ background: `${item.color}26`, color: item.color }}>
        {fmtMinutes(mins)}
      </span>
    </button>
  );
}

function TaskRow({
  item,
  past,
  today,
  style,
  onToggle,
  onClick,
}: {
  item: WTItem;
  past: boolean;
  today: boolean;
  style: React.CSSProperties;
  onToggle?: () => void;
  onClick: () => void;
}) {
  const overdue = today && past && !item.done;
  return (
    <button
      className={`wt-card wt-task${item.done ? ' done' : ''}${overdue ? ' overdue' : ''}`}
      style={{
        ...style,
        background: `${item.color}${overdue ? '1a' : '12'}`,
        borderColor: `${item.color}${item.done ? '38' : '66'}`,
      }}
      onClick={onClick}
    >
      <span className="wt-task-main">
        <span className="wt-task-title">{item.title}</span>
        {item.subtitle && <span className="wt-task-sub">{item.subtitle}</span>}
      </span>
      {onToggle ? (
        <span
          role="button"
          tabIndex={0}
          className="wt-task-badge"
          style={{ color: item.done ? 'var(--mint)' : item.color }}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              onToggle();
            }
          }}
        >
          {item.done ? (
            <>
              <Icon name="check" size={13} /> Done
            </>
          ) : (
            'Mark done'
          )}
        </span>
      ) : null}
    </button>
  );
}

function GapRow({
  gap,
  past,
  style,
  onClick,
}: {
  gap: WTGap;
  past: boolean;
  style: React.CSSProperties;
  onClick: () => void;
}) {
  const mins = Math.round((gap.end.getTime() - gap.start.getTime()) / 60000);
  return (
    <button className={`wt-card wt-gap${past ? ' past' : ''}`} style={style} onClick={onClick}>
      <span className="wt-gap-label">{fmtMinutes(mins)} free</span>
      <span className="wt-gap-range">
        {fmtTime(gap.start)} – {fmtTime(gap.end)}
      </span>
      {!past && <span className="wt-gap-plan">Plan</span>}
    </button>
  );
}
