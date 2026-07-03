import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { buildDayItems, dayStats, layoutDay, type WTItem } from '../lib/planner';
import { addDays, fmtMinutes, fmtTime, sameDay, startOfDay } from '../lib/time';
import { useDayActions, type DaySheet } from '../lib/dayActions';
import { WaveTimeline } from '../components/WaveTimeline';
import { EventSheet } from '../components/EventSheet';
import { AssignmentSheet } from '../components/AssignmentSheet';
import { Icon } from '../components/ui';

/* Web port of the CalRehaul calendar: dynamic date header, month-navigator
   pill with a collapsible week strip / month grid, gradient view-flip button,
   summary + zoom pills, wave day timeline, and a true-time 3-day board. */

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** CalDate.headline — Today / Tomorrow / Yesterday / full weekday. */
function headline(d: Date, today: Date): string {
  if (sameDay(d, today)) return 'Today';
  if (sameDay(d, addDays(today, 1))) return 'Tomorrow';
  if (sameDay(d, addDays(today, -1))) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long' });
}

/** hourCompact — 12a 1a … 12p 1p … */
function hourCompact(h: number): string {
  const base = h % 12 || 12;
  return `${base}${h % 24 < 12 ? 'a' : 'p'}`;
}

/** Calendar zoom window, persisted; CalRehaul default is the full 0–24. */
function useCalWindow(): [number, number, (s: number, e: number) => void] {
  const read = (key: string, fallback: number) => {
    const v = localStorage.getItem(key);
    if (v === null) return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const [win, setWin] = useState<[number, number]>(() => [
    read('sf.calWindowStart', 0),
    read('sf.calWindowEnd', 24),
  ]);
  const update = (s: number, e: number) => {
    const safeEnd = e > s ? e : s + 1;
    localStorage.setItem('sf.calWindowStart', String(s));
    localStorage.setItem('sf.calWindowEnd', String(safeEnd));
    setWin([s, safeEnd]);
  };
  return [win[0], win[1], update];
}

function DayCell({
  date,
  selected,
  today,
  inMonth,
  letter,
  dots,
  onSelect,
}: {
  date: Date;
  selected: boolean;
  today: boolean;
  inMonth: boolean;
  letter?: string;
  dots: string[];
  onSelect: (d: Date) => void;
}) {
  return (
    <button
      className={`cal-daycell${selected ? ' selected' : ''}${today ? ' today' : ''}${inMonth ? '' : ' out'}`}
      onClick={() => onSelect(date)}
      aria-label={date.toDateString()}
      aria-pressed={selected}
    >
      {letter !== undefined && <span className="cal-dc-letter">{letter}</span>}
      <span className="cal-dc-num">{date.getDate()}</span>
      <span className="cal-dc-dots">
        {dots.map((c, i) => (
          <i key={i} style={{ background: c }} />
        ))}
      </span>
    </button>
  );
}

/* ── 3-day board (CalRehaulThreeDay, read-only true-time) ────────── */

const HOUR_H = 52;

function ThreeDayBody({
  selected,
  now,
  itemsFor,
  onTapItem,
}: {
  selected: Date;
  now: Date;
  itemsFor: (d: Date) => WTItem[];
  onTapItem: (item: WTItem) => void;
}) {
  const days = [-1, 0, 1].map((o) => addDays(selected, o));
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const y = ((now.getHours() + now.getMinutes() / 60) * HOUR_H) - el.clientHeight / 2.5;
    el.scrollTop = Math.max(0, y);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const nowY = (now.getHours() * 60 + now.getMinutes()) * (HOUR_H / 60);

  return (
    <div className="td-scroll" ref={scrollRef}>
      <div className="td-board">
        <div className="td-gutter">
          {Array.from({ length: 24 }, (_, h) => (
            <span
              key={h}
              className={`td-hour${h === now.getHours() ? ' now' : h % 3 === 0 ? ' major' : ''}`}
              style={{ top: h * HOUR_H }}
            >
              {hourCompact(h)}
            </span>
          ))}
        </div>
        {days.map((d, di) => {
          const isToday = sameDay(d, now);
          const items = itemsFor(d)
            .filter((i) => i.kind !== 'task')
            .sort((a, b) => a.start.getTime() - b.start.getTime());
          // Lane assignment: overlapping blocks indent 12px per lane (max 2).
          const lanes = items.map((item, idx) => {
            let lane = 0;
            for (let j = 0; j < idx; j++) {
              if (items[j].end > item.start && items[j].start < item.end) lane++;
            }
            return Math.min(lane, 2);
          });
          return (
            <div key={di} className={`td-col${isToday ? ' today' : ''}${di === 1 ? ' center' : ''}`}>
              {Array.from({ length: 23 }, (_, h) => (
                <span
                  key={h}
                  className={`td-line${(h + 1) % 3 === 0 ? ' major' : ''}`}
                  style={{ top: (h + 1) * HOUR_H }}
                />
              ))}
              {items.map((item, idx) => {
                const startMin = item.start.getHours() * 60 + item.start.getMinutes();
                const durMin = Math.max(1, (item.end.getTime() - item.start.getTime()) / 60000);
                const top = startMin * (HOUR_H / 60);
                const height = Math.max(34, durMin * (HOUR_H / 60) - 2);
                const laneIndent = 2 + lanes[idx] * 12;
                const live = isToday && item.start <= now && now < item.end && !item.done;
                const past = item.done || item.end < now;
                return (
                  <button
                    key={item.id}
                    className={`td-block glass${live ? ' live' : ''}${past ? ' past' : ''}`}
                    style={{
                      top,
                      height,
                      left: laneIndent,
                      zIndex: 2 + lanes[idx],
                      borderColor: `color-mix(in srgb, ${item.color} ${past ? 18 : live ? 55 : 32}%, transparent)`,
                      boxShadow: live
                        ? `0 4px 7px color-mix(in srgb, ${item.color} 24%, transparent)`
                        : lanes[idx] > 0
                          ? '-2px 2px 6px rgba(0, 0, 0, 0.13)'
                          : undefined,
                    }}
                    onClick={() => onTapItem(item)}
                  >
                    <span className="td-block-bar" style={{ background: item.color }} />
                    <span className="td-block-main">
                      <span className="td-block-title">
                        {item.title}
                        {live && (
                          <em className="td-block-now" style={{ color: item.color }}>
                            NOW
                          </em>
                        )}
                      </span>
                      {height >= 40 && (
                        <span className="td-block-time">
                          {fmtTime(item.start)} – {fmtTime(item.end)}
                        </span>
                      )}
                    </span>
                    {live && (
                      <span className="td-block-progress">
                        <span
                          style={{
                            width: `${Math.min(100, ((now.getTime() - item.start.getTime()) / (item.end.getTime() - item.start.getTime())) * 100)}%`,
                            background: item.color,
                          }}
                        />
                      </span>
                    )}
                  </button>
                );
              })}
              {isToday && (
                <span className="td-nowline" style={{ top: nowY }}>
                  <i />
                  <em>{fmtTime(now)}</em>
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Calendar root ───────────────────────────────────────────────── */

export function CalendarView() {
  const { courses, assignments, blocks } = useStore();
  const today = useMemo(() => startOfDay(new Date()), []);
  const [now, setNow] = useState(() => new Date());
  const [selected, setSelected] = useState<Date>(today);
  const [monthOpen, setMonthOpen] = useState(false);
  const [threeDay, setThreeDay] = useState(false);
  const [winStart, winEnd, setWindow] = useCalWindow();
  const [zoomOpen, setZoomOpen] = useState(false);
  const [sheet, setSheet] = useState<DaySheet>(null);
  const actions = useDayActions(selected, setSheet);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(id);
  }, []);

  const itemsFor = useMemo(() => {
    const cache = new Map<string, WTItem[]>();
    return (d: Date) => {
      const key = d.toDateString();
      if (!cache.has(key)) cache.set(key, buildDayItems(d, courses, assignments, blocks).items);
      return cache.get(key)!;
    };
  }, [courses, assignments, blocks]);

  const dotsFor = (d: Date): string[] => {
    const dots: string[] = [];
    for (const item of itemsFor(d)) {
      if (!dots.includes(item.color)) dots.push(item.color);
      if (dots.length === 3) break;
    }
    return dots;
  };

  /* Week strip days (Sunday-start week around the selected day). */
  const week = useMemo(() => {
    const start = addDays(selected, -selected.getDay());
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [selected]);

  /* Month grid cells. */
  const monthCells = useMemo(() => {
    const first = new Date(selected.getFullYear(), selected.getMonth(), 1);
    const gridStart = addDays(first, -first.getDay());
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [selected]);

  const { items, allDay } = useMemo(
    () => buildDayItems(selected, courses, assignments, blocks),
    [selected, courses, assignments, blocks]
  );
  const stats = useMemo(
    () => dayStats(items, layoutDay(items, selected, winStart, winEnd, now)),
    [items, selected, winStart, winEnd, now]
  );

  const shift = (delta: number) =>
    setSelected(monthOpen
      ? new Date(selected.getFullYear(), selected.getMonth() + delta, Math.min(selected.getDate(), 28))
      : addDays(selected, delta * 7));

  const eyebrow = threeDay
    ? (() => {
        const a = addDays(selected, -1);
        const c = addDays(selected, 1);
        const tail = a.getMonth() === c.getMonth() ? '' : `${MON3[c.getMonth()]} `;
        return `${MON3[a.getMonth()]} ${a.getDate()} – ${tail}${c.getDate()}`;
      })()
    : headline(selected, today);

  const tapItem = (item: WTItem) => {
    if (item.kind === 'task' && item.assignmentId) {
      setSheet({ kind: 'task', assignmentId: item.assignmentId });
    } else if (item.kind === 'event' && item.block) {
      setSheet({ kind: 'event', block: item.block });
    }
  };

  const addEvent = () => {
    const h = Math.min(21, new Date().getHours() + 1);
    const start = new Date(selected);
    start.setHours(h, 0, 0, 0);
    setSheet({ kind: 'event', start, end: new Date(start.getTime() + 3600000) });
  };

  return (
    <div className="view cal-view">
      {/* Top bar */}
      <header className="cal-top">
        <div>
          <div className="eyebrow eyebrow-muted">{eyebrow}</div>
          <h1 className="cal-title">
            {MON3[selected.getMonth()]} {selected.getDate()}
          </h1>
        </div>
        {!sameDay(selected, today) && (
          <button className="cal-today-pill" onClick={() => setSelected(today)}>
            <Icon name="sun" size={11} strokeWidth={2.4} />
            Today
          </button>
        )}
      </header>

      {/* Month navigator row */}
      <div className="cal-nav-row">
        <div className="cal-pill">
          <button className="cal-pill-nav" onClick={() => shift(-1)} aria-label="Previous">
            <Icon name="chevronLeft" size={13} strokeWidth={2.4} />
          </button>
          <button className="cal-pill-month" onClick={() => setMonthOpen((o) => !o)} aria-expanded={monthOpen}>
            <strong>{MONTHS_FULL[selected.getMonth()]}</strong>
            <span>{selected.getFullYear()}</span>
            <Icon name="chevronDown" size={9} strokeWidth={3} className={`cal-pill-caret${monthOpen ? ' up' : ''}`} />
          </button>
          <button className="cal-pill-nav" onClick={() => shift(1)} aria-label="Next">
            <Icon name="chevronRight" size={13} strokeWidth={2.4} />
          </button>
        </div>
        <div className="cal-pill cal-controls">
          <button
            className="cal-flip"
            onClick={() => setThreeDay((t) => !t)}
            aria-label={threeDay ? 'One-day view' : 'Three-day view'}
            title={threeDay ? 'One-day view' : 'Three-day view'}
          >
            {threeDay ? (
              <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
                <rect x="0.5" y="1" width="3.4" height="11" rx="1.1" fill="currentColor" />
                <rect x="4.8" y="1" width="3.4" height="11" rx="1.1" fill="currentColor" />
                <rect x="9.1" y="1" width="3.4" height="11" rx="1.1" fill="currentColor" />
              </svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
                <rect x="3" y="0.8" width="7" height="11.4" rx="1.6" fill="currentColor" />
              </svg>
            )}
          </button>
          <span className="cal-pill-div" />
          <button className="cal-pill-nav" onClick={addEvent} aria-label="New event">
            <Icon name="plus" size={13} strokeWidth={2.4} />
          </button>
        </div>
      </div>

      {/* Week strip / month grid */}
      <section className="cal-strip glass">
        {!monthOpen ? (
          <div className="cal-week">
            {week.map((d, i) => (
              <DayCell
                key={i}
                date={d}
                letter={DAY_LETTERS[i]}
                selected={sameDay(d, selected)}
                today={sameDay(d, today)}
                inMonth
                dots={dotsFor(d)}
                onSelect={setSelected}
              />
            ))}
            {threeDay && (
              <span
                className="cal-rail"
                style={{
                  left: `calc(${Math.max(0, selected.getDay() - 1) * (100 / 7)}% + ${100 / 7 / 5}%)`,
                  width: `calc(${(100 / 7) * 3}% - ${(100 / 7 / 5) * 2}%)`,
                }}
                aria-hidden="true"
              />
            )}
          </div>
        ) : (
          <div className="cal-month-grid">
            {DAY_LETTERS.map((l, i) => (
              <span key={`h${i}`} className="cal-grid-dow">
                {l}
              </span>
            ))}
            {monthCells.map((d, i) => (
              <DayCell
                key={i}
                date={d}
                selected={sameDay(d, selected)}
                today={sameDay(d, today)}
                inMonth={d.getMonth() === selected.getMonth()}
                dots={dotsFor(d)}
                onSelect={(date) => {
                  setSelected(date);
                  setMonthOpen(false);
                }}
              />
            ))}
          </div>
        )}
      </section>

      {threeDay ? (
        <ThreeDayBody selected={selected} now={now} itemsFor={itemsFor} onTapItem={tapItem} />
      ) : (
        <>
          {/* Structure bar: summary pill + zoom pill */}
          <div className="cal-structure">
            <span className="cal-summary">
              <Icon name="calendar" size={12} strokeWidth={2.2} className="cal-summary-ico" />
              <strong>{stats.planned} planned</strong>
              {stats.due > 0 && <span> · {stats.due} due</span>}
              <span> · {fmtMinutes(stats.freeMinutes)} free</span>
            </span>
            <span className="cal-structure-spacer" />
            <div className="cal-zoom-wrap">
              <button className="cal-zoom" onClick={() => setZoomOpen((o) => !o)} aria-expanded={zoomOpen}>
                <Icon name="arrowRight" size={11} strokeWidth={2.4} className="cal-zoom-arrows" />
                <strong>
                  {winStart === 0 && winEnd === 24
                    ? '24h'
                    : `${hourCompact(winStart)}–${hourCompact(winEnd)}`}
                </strong>
                <Icon name="chevronDown" size={9} strokeWidth={2.6} />
              </button>
              {zoomOpen && (
                <div className="cal-zoom-pop glass">
                  <div className="cal-zoom-row">
                    <span className="eyebrow eyebrow-muted">Starts</span>
                    <div className="cal-zoom-opts">
                      {[0, 6, 7, 8, 9].map((h) => (
                        <button
                          key={h}
                          className={winStart === h ? 'on' : ''}
                          onClick={() => setWindow(h, winEnd)}
                        >
                          {hourCompact(h)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="cal-zoom-row">
                    <span className="eyebrow eyebrow-muted">Ends</span>
                    <div className="cal-zoom-opts">
                      {[20, 21, 22, 23, 24].map((h) => (
                        <button
                          key={h}
                          className={winEnd === h ? 'on' : ''}
                          onClick={() => setWindow(winStart, h)}
                        >
                          {hourCompact(h)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
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
            day={selected}
            items={items}
            windowStart={winStart}
            windowEnd={winEnd}
            onQuickPlan={actions.quickPlan}
            onCustomEvent={(start, end) => setSheet({ kind: 'event', start, end })}
            onToggleDone={actions.toggleDone}
            onEdit={actions.editItem}
            onRemove={actions.removeItem}
          />
        </>
      )}

      {sheet?.kind === 'event' && (
        <EventSheet
          block={sheet.block}
          defaultStart={sheet.start}
          defaultEnd={sheet.end}
          day={selected}
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
