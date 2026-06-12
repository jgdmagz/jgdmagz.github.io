import { useMemo, useState } from 'react';
import { newId, useStore, useToasts } from '../lib/store';
import { EVENT_COLORS, type RepeatRule, type TimeBlockRow } from '../lib/types';
import { dateKey, fmtMinutes } from '../lib/time';
import { Icon, Modal } from './ui';

/* Liquid-glass event editor — a web port of the app's EventDetailSheet:
   color swatches, ±15 min steppers, location, notes, repeat, mark done. */

const REPEAT_OPTIONS: { value: RepeatRule; label: string }[] = [
  { value: 'none', label: 'Never' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'custom', label: 'Custom days' },
];

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']; // index 0=Sun → weekday raw = i+1

function toLocalDateInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

function toLocalTimeInput(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function combine(dateStr: string, timeStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
}

export function EventSheet({
  block,
  defaultStart,
  defaultEnd,
  day,
  onClose,
}: {
  block?: TimeBlockRow;
  defaultStart?: Date;
  defaultEnd?: Date;
  day: Date; // the day being viewed — used for per-day done state
  onClose: () => void;
}) {
  const { user, courses, upsertBlock, deleteBlock, toggleBlockDone } = useStore();
  const { push } = useToasts();

  const isNew = !block;
  const start0 = block ? new Date(block.start_at) : (defaultStart ?? new Date());
  const end0 = block ? new Date(block.end_at) : (defaultEnd ?? new Date(start0.getTime() + 3600000));

  const [title, setTitle] = useState(block?.title ?? '');
  const [color, setColor] = useState(block?.color_hex ?? EVENT_COLORS[0]);
  const [dateStr, setDateStr] = useState(toLocalDateInput(start0));
  const [startStr, setStartStr] = useState(toLocalTimeInput(start0));
  const [endStr, setEndStr] = useState(toLocalTimeInput(end0));
  const [location, setLocation] = useState(block?.location ?? '');
  const [notes, setNotes] = useState(block?.notes ?? '');
  const [repeat, setRepeat] = useState<RepeatRule>(block?.repeat_rule ?? 'none');
  const [repeatDays, setRepeatDays] = useState<number[]>(block?.repeat_weekdays ?? []);
  const [courseId, setCourseId] = useState<string>(block?.course_id ?? '');

  const start = combine(dateStr, startStr);
  let end = combine(dateStr, endStr);
  if (end <= start) end = new Date(start.getTime() + 15 * 60000);
  const durationMin = Math.round((end.getTime() - start.getTime()) / 60000);

  const doneToday = useMemo(
    () => (block ? block.completed_occurrences.includes(dateKey(day)) : false),
    [block, day]
  );

  const bump = (which: 'start' | 'end', mins: number) => {
    if (which === 'start') {
      const next = new Date(start.getTime() + mins * 60000);
      setStartStr(toLocalTimeInput(next));
      if (next >= end) setEndStr(toLocalTimeInput(new Date(next.getTime() + durationMin * 60000)));
    } else {
      const next = new Date(end.getTime() + mins * 60000);
      if (next > start) setEndStr(toLocalTimeInput(next));
    }
  };

  const save = async () => {
    if (!user) return;
    const row: TimeBlockRow = {
      id: block?.id ?? newId(),
      user_id: user.id,
      title: title.trim() || 'Untitled',
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      color_hex: color,
      notes,
      location,
      location_lat: block?.location_lat ?? null,
      location_lng: block?.location_lng ?? null,
      travel_time: block?.travel_time ?? -2,
      estimated_travel_minutes: block?.estimated_travel_minutes ?? null,
      repeat_rule: repeat,
      repeat_weekdays: repeat === 'custom' ? repeatDays : [],
      alert: block?.alert ?? -1,
      course_id: courseId || null,
      is_all_day: block?.is_all_day ?? false,
      completed_occurrences: block?.completed_occurrences ?? [],
    };
    await upsertBlock(row);
    onClose();
  };

  const remove = async () => {
    if (!block) return;
    const snapshot = block;
    onClose();
    await deleteBlock(block.id);
    push('Event removed', () => upsertBlock(snapshot));
  };

  return (
    <Modal
      onClose={onClose}
      title={
        <span className="sheet-title">
          <span className="sheet-dot" style={{ background: color }} />
          {isNew ? 'New event' : 'Edit event'}
        </span>
      }
    >
      <div className="sheet-grid">
        <input
          className="sheet-input sheet-title-input"
          placeholder="Event title"
          value={title}
          autoFocus={isNew}
          onChange={(e) => setTitle(e.target.value)}
        />

        <div className="swatches" role="radiogroup" aria-label="Color">
          {EVENT_COLORS.map((c) => (
            <button
              key={c}
              role="radio"
              aria-checked={color === c}
              className={`swatch${color === c ? ' on' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>

        <div className="field-row">
          <label className="mini-label" htmlFor="ev-date">Date</label>
          <input
            id="ev-date"
            type="date"
            className="sheet-input"
            value={dateStr}
            onChange={(e) => e.target.value && setDateStr(e.target.value)}
          />
        </div>

        <div className="time-row">
          <div className="time-cell">
            <span className="mini-label">Starts</span>
            <input
              type="time"
              className="sheet-input"
              value={startStr}
              onChange={(e) => e.target.value && setStartStr(e.target.value)}
            />
            <span className="steppers">
              <button onClick={() => bump('start', -15)} aria-label="Start 15 minutes earlier">−15</button>
              <button onClick={() => bump('start', 15)} aria-label="Start 15 minutes later">+15</button>
            </span>
          </div>
          <div className="time-cell">
            <span className="mini-label">Ends</span>
            <input
              type="time"
              className="sheet-input"
              value={endStr}
              onChange={(e) => e.target.value && setEndStr(e.target.value)}
            />
            <span className="steppers">
              <button onClick={() => bump('end', -15)} aria-label="End 15 minutes earlier">−15</button>
              <button onClick={() => bump('end', 15)} aria-label="End 15 minutes later">+15</button>
            </span>
          </div>
          <div className="time-cell time-duration">
            <span className="mini-label">Duration</span>
            <span className="duration-value">{fmtMinutes(durationMin)}</span>
          </div>
        </div>

        <div className="field-row">
          <label className="mini-label" htmlFor="ev-repeat">Repeat</label>
          <select
            id="ev-repeat"
            className="sheet-input"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value as RepeatRule)}
          >
            {REPEAT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {repeat === 'custom' && (
          <div className="day-chips" role="group" aria-label="Repeat days">
            {DAY_LETTERS.map((letter, i) => {
              const raw = i + 1;
              const on = repeatDays.includes(raw);
              return (
                <button
                  key={i}
                  className={`day-chip${on ? ' on' : ''}`}
                  aria-pressed={on}
                  onClick={() =>
                    setRepeatDays((prev) => (on ? prev.filter((d) => d !== raw) : [...prev, raw]))
                  }
                >
                  {letter}
                </button>
              );
            })}
          </div>
        )}

        {courses.filter((c) => !c.is_archived).length > 0 && (
          <div className="field-row">
            <label className="mini-label" htmlFor="ev-course">Course</label>
            <select
              id="ev-course"
              className="sheet-input"
              value={courseId}
              onChange={(e) => {
                setCourseId(e.target.value);
                const course = courses.find((c) => c.id === e.target.value);
                if (course && isNew) setColor(course.color_hex);
              }}
            >
              <option value="">None</option>
              {courses
                .filter((c) => !c.is_archived)
                .map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
            </select>
          </div>
        )}

        <div className="field-row">
          <label className="mini-label" htmlFor="ev-loc">Location</label>
          <input
            id="ev-loc"
            className="sheet-input"
            placeholder="Add a location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>

        <div className="field-row">
          <label className="mini-label" htmlFor="ev-notes">Notes</label>
          <textarea
            id="ev-notes"
            className="sheet-input sheet-notes"
            placeholder="Notes…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="sheet-actions">
          {!isNew && (
            <>
              <button
                className="btn-quiet"
                onClick={() => {
                  toggleBlockDone(block!.id, day);
                  onClose();
                }}
              >
                <Icon name="check" size={15} />
                {doneToday ? 'Mark not done' : 'Mark done'}
              </button>
              <button className="icon-btn danger" onClick={remove} aria-label="Remove event">
                <Icon name="trash" size={16} />
              </button>
            </>
          )}
          <span className="sheet-spacer" />
          <button className="btn btn-sm" onClick={save}>
            {isNew ? 'Add event' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
