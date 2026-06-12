import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { buildDayItems, dayStats, layoutDay } from '../lib/planner';
import { addDays, fmtDateLong, fmtMinutes, fmtMonthYear, sameDay, startOfDay } from '../lib/time';
import { useDayActions, type DaySheet } from '../lib/dayActions';
import { WaveTimeline } from '../components/WaveTimeline';
import { EventSheet } from '../components/EventSheet';
import { AssignmentSheet } from '../components/AssignmentSheet';
import { Icon } from '../components/ui';
import { useDayWindow, WindowPicker } from './TodayView';

const DAY_HEADERS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

interface MonthCell {
  date: Date;
  inMonth: boolean;
  dots: string[];
}

export function CalendarView() {
  const { courses, assignments, blocks } = useStore();
  const today = useMemo(() => startOfDay(new Date()), []);
  const [selected, setSelected] = useState<Date>(today);
  const [cursor, setCursor] = useState<Date>(new Date(today.getFullYear(), today.getMonth(), 1));
  const [winStart, winEnd, setWindow] = useDayWindow();
  const [sheet, setSheet] = useState<DaySheet>(null);
  const actions = useDayActions(selected, setSheet);

  /* Month grid cells — 6 rows × 7 cols, with event-color dots per day. */
  const cells = useMemo<MonthCell[]>(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const gridStart = addDays(first, -first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const date = addDays(gridStart, i);
      const { items } = buildDayItems(date, courses, assignments, blocks);
      const dots: string[] = [];
      for (const item of items) {
        if (!dots.includes(item.color)) dots.push(item.color);
        if (dots.length === 3) break;
      }
      return { date, inMonth: date.getMonth() === cursor.getMonth(), dots };
    });
  }, [cursor, courses, assignments, blocks]);

  const { items, allDay } = useMemo(
    () => buildDayItems(selected, courses, assignments, blocks),
    [selected, courses, assignments, blocks]
  );
  const stats = useMemo(
    () => dayStats(items, layoutDay(items, selected, winStart, winEnd, new Date())),
    [items, selected, winStart, winEnd]
  );

  const select = (date: Date) => {
    setSelected(date);
    if (date.getMonth() !== cursor.getMonth() || date.getFullYear() !== cursor.getFullYear()) {
      setCursor(new Date(date.getFullYear(), date.getMonth(), 1));
    }
  };

  const shiftMonth = (delta: number) =>
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));

  return (
    <div className="view calendar-view">
      <header className="view-head">
        <div>
          <div className="eyebrow">Planner</div>
          <h1 className="view-title">Calendar</h1>
        </div>
        <button
          className="btn btn-sm head-add"
          onClick={() => {
            const start = new Date(selected);
            start.setHours(Math.max(9, new Date().getHours() + 1), 0, 0, 0);
            setSheet({ kind: 'event', start, end: new Date(start.getTime() + 3600000) });
          }}
        >
          <Icon name="plus" size={15} /> New event
        </button>
      </header>

      <div className="cal-layout">
        {/* Month panel */}
        <section className="cal-month glass">
          <div className="cal-month-head">
            <span className="cal-month-title">{fmtMonthYear(cursor)}</span>
            <span className="cal-month-nav">
              <button className="icon-btn" onClick={() => shiftMonth(-1)} aria-label="Previous month">
                <Icon name="chevronLeft" size={16} />
              </button>
              <button
                className="cal-today-btn"
                onClick={() => {
                  select(today);
                  setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
                }}
              >
                Today
              </button>
              <button className="icon-btn" onClick={() => shiftMonth(1)} aria-label="Next month">
                <Icon name="chevronRight" size={16} />
              </button>
            </span>
          </div>

          <div className="cal-grid" role="grid">
            {DAY_HEADERS.map((d) => (
              <span key={d} className="cal-dow">{d}</span>
            ))}
            {cells.map((cell) => {
              const isToday = sameDay(cell.date, today);
              const isSelected = sameDay(cell.date, selected);
              return (
                <button
                  key={cell.date.getTime()}
                  className={`cal-cell${cell.inMonth ? '' : ' out'}${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}`}
                  onClick={() => select(cell.date)}
                  aria-label={cell.date.toDateString()}
                  aria-pressed={isSelected}
                >
                  <span className="cal-num">{cell.date.getDate()}</span>
                  <span className="cal-dots">
                    {cell.dots.map((c, i) => (
                      <i key={i} style={{ background: c }} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="cal-day-stats">
            <strong>{stats.planned}</strong> planned · <strong>{stats.due}</strong> due ·{' '}
            <strong>{fmtMinutes(stats.freeMinutes)}</strong> free
          </div>
        </section>

        {/* Day planner */}
        <section className="cal-day">
          <div className="cal-day-head">
            <div className="cal-day-title-wrap">
              <button className="icon-btn" onClick={() => select(addDays(selected, -1))} aria-label="Previous day">
                <Icon name="chevronLeft" size={16} />
              </button>
              <span className="cal-day-title">{fmtDateLong(selected)}</span>
              <button className="icon-btn" onClick={() => select(addDays(selected, 1))} aria-label="Next day">
                <Icon name="chevronRight" size={16} />
              </button>
            </div>
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
        </section>
      </div>

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
