import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppView } from '../FlowApp';
import { useStore } from '../lib/store';
import { useFlow } from '../components/FlowContext';
import { EndlessTime, FlowScene, PhaseTime } from '../components/FlowScene';
import { FlowMark, Icon, Modal, Overlay } from '../components/ui';
import { fmtClock, fmtTotal, paletteFor } from '../lib/flow';
import type { AssignmentRow } from '../lib/types';

/* Web port of FlowView.swift and friends: mode picker (hero + three gradient
   mode cards), Regular / Endless customizer sheets with Lock-In, the immersive
   session (dot grid + blob + break chips + upcoming bar) and the Flow Summary
   completion screen. */

const ACCENT_RGB: [number, number, number] = [0x59, 0x5b, 0xcd];
const MINT_RGB: [number, number, number] = [0x71, 0xbf, 0x9d];
const CORAL_RGB: [number, number, number] = [0xef, 0x8e, 0x8e];

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** iOS formatFlow — "\(m)m" under an hour, else "\(h)h". */
function formatFlow(totalSeconds: number): string {
  const mins = Math.round(totalSeconds / 60);
  return mins >= 60 ? `${Math.floor(mins / 60)}h` : `${mins}m`;
}

function fmtHM(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/* ── Achievement tiers (FlowSummaryView) ─────────────────────────── */

function achievement(mins: number): { icon: string; tier: string; message: string } {
  if (mins >= 120) return { icon: 'crown', tier: 'Legendary', message: 'Legendary — 2+ hours of pure focus' };
  if (mins >= 60) return { icon: 'star', tier: 'In the Zone', message: 'Incredible focus for over an hour' };
  if (mins >= 30) return { icon: 'flame', tier: 'On Fire', message: 'Solid 30+ minute flow session' };
  if (mins >= 15) return { icon: 'bolt', tier: 'Locked In', message: 'Great focus session!' };
  if (mins >= 5) return { icon: 'checkCircle', tier: 'Nice Work', message: 'Good start — keep building momentum' };
  return { icon: 'checkCircle', tier: 'Nice Work', message: 'Every minute counts' };
}

interface SummaryData {
  mode: 'regular' | 'endless';
  guided: boolean;
  name: string;
  startedAt: Date;
  endedAt: Date;
  totalFocusSeconds: number;
  focusRounds: number;
  prevSeconds: number | null;
}

/* ── Lock-In toggle card (LockInToggleCard) ──────────────────────── */

function LockInToggle({
  on,
  tint,
  onChange,
}: {
  on: boolean;
  tint: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      className={`lockin-card${on ? ' on' : ''}`}
      style={{ '--li-tint': tint } as React.CSSProperties}
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
    >
      <span className="lockin-tile">
        <Icon name="shield" size={18} strokeWidth={2} />
      </span>
      <span className="lockin-main">
        <span className="lockin-title">Lock In</span>
        <span className="lockin-sub">
          {on ? "Distraction guard on — we'll call you back" : 'Silence distractions, stay in your flow'}
        </span>
      </span>
      <span className="lockin-switch">
        <i />
      </span>
    </button>
  );
}

/* ── Session name field ──────────────────────────────────────────── */

function NameField({
  value,
  tint,
  onChange,
}: {
  value: string;
  tint: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flow-name-field" style={{ '--nf-tint': tint } as React.CSSProperties}>
      <span className="flow-name-chip">
        <Icon name="pencil" size={15} />
      </span>
      <input
        placeholder="Session name (optional)"
        value={value}
        maxLength={48}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

/* ── Mode picker ─────────────────────────────────────────────────── */

const MODES = [
  {
    key: 'regular' as const,
    title: 'Regular',
    tag: 'Pomodoro',
    sub: 'Pomodoro style, customize your pace',
    icon: 'clock',
    grad: 'linear-gradient(135deg, #475CBD, #5C70D1)',
  },
  {
    key: 'endless' as const,
    title: 'Endless',
    tag: 'Deep work',
    sub: 'Keep going with gentle reminders',
    icon: 'infinity',
    grad: 'linear-gradient(135deg, #8C47EB, #DB5CB8)',
  },
  {
    key: 'guided' as const,
    title: 'Guided Flow',
    tag: 'Curated',
    sub: 'Pick specific assignments to work through',
    icon: 'checklist',
    grad: 'linear-gradient(135deg, #33B88F, #5C70D1)',
  },
];

function ModePicker({
  onBack,
  onPick,
}: {
  onBack: () => void;
  onPick: (mode: 'regular' | 'endless' | 'guided') => void;
}) {
  const { stats } = useFlow();
  return (
    <div className="flow-picker">
      <button className="flow-back-chip" onClick={onBack}>
        <Icon name="chevronLeft" size={12} strokeWidth={2.6} />
        Back
      </button>

      <section className="flow-hero">
        <span className="flow-hero-deco d1" aria-hidden="true" />
        <span className="flow-hero-deco d2" aria-hidden="true" />
        <div className="flow-hero-head">
          <span className="flow-hero-mark">
            <FlowMark size={30} color="#fff" animated />
          </span>
          <span>
            <span className="flow-hero-eyebrow">Enter the flow</span>
            <span className="flow-hero-title">Flow Mode</span>
          </span>
        </div>
        <p className="flow-hero-sub">Choose a focus style that matches your rhythm.</p>
        <div className="flow-hero-chips">
          <span className="flow-hero-chip">
            <Icon name="flame" size={11} />
            <strong>{stats.currentStreak}</strong> Streak
          </span>
          <span className="flow-hero-chip">
            <Icon name="bolt" size={11} />
            <strong>{formatFlow(stats.totalFlowSeconds)}</strong> Focused
          </span>
        </div>
      </section>

      <div className="flow-modes">
        {MODES.map((m) => (
          <button key={m.key} className="flow-mode-card" onClick={() => onPick(m.key)}>
            <span className="flow-mode-tile" style={{ background: m.grad }}>
              <Icon name={m.icon} size={22} strokeWidth={2} />
            </span>
            <span className="flow-mode-main">
              <span className="flow-mode-title">
                {m.title}
                <em>{m.tag}</em>
              </span>
              <span className="flow-mode-sub">{m.sub}</span>
            </span>
            <span className="flow-mode-arrow">
              <Icon name="arrowRight" size={13} strokeWidth={2.4} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Customizer sheets ───────────────────────────────────────────── */

function StepperRow({
  icon,
  label,
  color,
  value,
  unit,
  onDec,
  onInc,
}: {
  icon: string;
  label: string;
  color: string;
  value: number;
  unit: string;
  onDec: () => void;
  onInc: () => void;
}) {
  return (
    <div className="stepper-row">
      <span className="stepper-chip" style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}>
        <Icon name={icon} size={15} />
      </span>
      <span className="stepper-label">{label}</span>
      <div className="stepper-ctl">
        <button onClick={onDec} aria-label={`Decrease ${label}`}>
          <Icon name="minus" size={14} />
        </button>
        <span className="stepper-value">
          {value} {unit}
        </span>
        <button onClick={onInc} aria-label={`Increase ${label}`}>
          <Icon name="plus" size={14} />
        </button>
      </div>
    </div>
  );
}

function RegularCustomizer({
  lockIn,
  setLockIn,
  onStart,
  onClose,
}: {
  lockIn: boolean;
  setLockIn: (v: boolean) => void;
  onStart: () => void;
  onClose: () => void;
}) {
  const flow = useFlow();
  const { settings, state } = flow;
  const step = (
    key: 'workMin' | 'shortMin' | 'longMin' | 'interval',
    delta: number,
    lo: number,
    hi: number
  ) => flow.updateSettings({ [key]: clamp(settings[key] + delta, lo, hi) });

  return (
    <Modal onClose={onClose}>
      <div className="flow-setup">
        <div className="flow-setup-head">
          <h2>Regular Flow</h2>
          <p>Tailor your Pomodoro cycles</p>
        </div>
        <NameField value={state.name} tint="#4D59D9" onChange={flow.setName} />
        <div className="flow-steppers">
          <StepperRow
            icon="brain" label="Focus" color="#4D59D9"
            value={settings.workMin} unit="min"
            onDec={() => step('workMin', -5, 5, 120)} onInc={() => step('workMin', 5, 5, 120)}
          />
          <StepperRow
            icon="coffee" label="Short Break" color="#14B859"
            value={settings.shortMin} unit="min"
            onDec={() => step('shortMin', -1, 1, 30)} onInc={() => step('shortMin', 1, 1, 30)}
          />
          <StepperRow
            icon="sofa" label="Long Break" color="#4D26CC"
            value={settings.longMin} unit="min"
            onDec={() => step('longMin', -5, 5, 60)} onInc={() => step('longMin', 5, 5, 60)}
          />
          <StepperRow
            icon="repeat" label="Interval" color="#F27314"
            value={settings.interval} unit="ses"
            onDec={() => step('interval', -1, 2, 8)} onInc={() => step('interval', 1, 2, 8)}
          />
        </div>
        <LockInToggle on={lockIn} tint="#4D59D9" onChange={setLockIn} />
        <button className="flow-start-cta" onClick={onStart}>
          Start Flow
          <Icon name="play" size={14} />
        </button>
      </div>
    </Modal>
  );
}

function EndlessCustomizer({
  lockIn,
  setLockIn,
  onStart,
  onClose,
}: {
  lockIn: boolean;
  setLockIn: (v: boolean) => void;
  onStart: () => void;
  onClose: () => void;
}) {
  const flow = useFlow();
  return (
    <Modal onClose={onClose}>
      <div className="flow-setup">
        <div className="flow-setup-head">
          <h2>Start Endless Flow</h2>
          <p>Deep, uninterrupted work time</p>
        </div>
        <NameField value={flow.state.name} tint="#8C47EB" onChange={flow.setName} />
        <LockInToggle on={lockIn} tint="#8C47EB" onChange={setLockIn} />
        <button className="flow-start-cta endless" onClick={onStart}>
          Start Flow
          <Icon name="play" size={14} />
        </button>
      </div>
    </Modal>
  );
}

/* ── Guided picker (GuidedFlowPickerView, condensed) ─────────────── */

function GuidedPicker({
  onStart,
  onClose,
}: {
  onStart: (taskIds: string[]) => void;
  onClose: () => void;
}) {
  const { assignments, courses } = useStore();
  const pending = useMemo(
    () =>
      assignments
        .filter((a) => !a.is_completed)
        .sort((a, b) => a.due_at.localeCompare(b.due_at)),
    [assignments]
  );
  const [selected, setSelected] = useState<Set<string>>(new Set(pending.map((a) => a.id)));

  const byCourse = useMemo(() => {
    const map = new Map<string, AssignmentRow[]>();
    for (const a of pending) {
      map.set(a.course_id, [...(map.get(a.course_id) ?? []), a]);
    }
    return map;
  }, [pending]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const diffChip = (d: number) =>
    d === 1
      ? { label: 'Easy', color: '#34C759' }
      : d === 2
        ? { label: 'Medium', color: '#FF9500' }
        : { label: 'Hard', color: '#FF3B30' };

  return (
    <Modal title="Guided Flow" onClose={onClose}>
      <div className="guided">
        <div className="guided-summary">
          <Icon name="checkCircle" size={16} strokeWidth={2.2} className="guided-summary-ico" />
          <strong>{selected.size} tasks selected</strong>
          <button
            className="guided-selall"
            onClick={() =>
              setSelected(selected.size === pending.length ? new Set() : new Set(pending.map((a) => a.id)))
            }
          >
            {selected.size === pending.length ? 'Clear All' : 'Select All'}
          </button>
        </div>

        {pending.length === 0 ? (
          <div className="guided-empty">No pending reminders</div>
        ) : (
          [...byCourse.entries()].map(([courseId, tasks]) => {
            const course = courses.find((c) => c.id === courseId);
            return (
              <div className="guided-course" key={courseId}>
                <div className="guided-course-head">
                  <i style={{ background: course?.color_hex ?? 'var(--accent)' }} />
                  <strong>{course?.name ?? 'Tasks'}</strong>
                  <span>
                    {tasks.filter((t) => selected.has(t.id)).length}/{tasks.length}
                  </span>
                </div>
                {tasks.map((t) => {
                  const dc = diffChip(t.difficulty);
                  const overdue = new Date(t.due_at) < new Date();
                  return (
                    <button
                      key={t.id}
                      className={`guided-task${selected.has(t.id) ? ' on' : ''}`}
                      onClick={() => toggle(t.id)}
                    >
                      <span className={`ti-check${selected.has(t.id) ? ' on' : ''}`}
                        style={selected.has(t.id) ? { background: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}
                      >
                        {selected.has(t.id) && <Icon name="check" size={11} strokeWidth={3} />}
                      </span>
                      <span className="guided-task-main">
                        <span className="guided-task-title">{t.title}</span>
                        <span className="guided-task-sub">
                          {new Date(t.due_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ·{' '}
                          {t.estimated_minutes}m{overdue && <em className="guided-overdue">Overdue</em>}
                        </span>
                      </span>
                      <span
                        className="guided-diff"
                        style={{ color: dc.color, background: `color-mix(in srgb, ${dc.color} 15%, transparent)` }}
                      >
                        {dc.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })
        )}

        {selected.size > 0 && (
          <button className="flow-start-cta guided-start" onClick={() => onStart([...selected])}>
            <Icon name="sparkles" size={14} />
            Start Guided Flow
          </button>
        )}
      </div>
    </Modal>
  );
}

/* ── Upcoming footer bar ─────────────────────────────────────────── */

function UpcomingBar({ guidedIds }: { guidedIds: string[] | null }) {
  const { assignments, courses, toggleAssignment } = useStore();
  const [open, setOpen] = useState(false);

  const rows = useMemo(() => {
    const base = guidedIds
      ? assignments.filter((a) => guidedIds.includes(a.id))
      : assignments.filter((a) => !a.is_completed);
    return [...base].sort((a, b) => a.due_at.localeCompare(b.due_at));
  }, [assignments, guidedIds]);

  const remaining = rows.filter((r) => !r.is_completed).length;
  const label = guidedIds ? `${remaining} tasks remaining` : `${remaining} reminders`;

  return (
    <div className={`upcoming-bar${open ? ' open' : ''}`}>
      <button className="upcoming-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="upcoming-title">Upcoming</span>
        <span className="upcoming-count">{label}</span>
        <Icon name="chevronDown" size={16} strokeWidth={2.4} className={`upcoming-caret${open ? ' up' : ''}`} />
      </button>
      {open && (
        <div className="upcoming-list">
          {rows.slice(0, 12).map((a) => {
            const course = courses.find((c) => c.id === a.course_id);
            const color = course?.color_hex ?? 'var(--accent)';
            return (
              <div className="upcoming-card" key={a.id}>
                <button
                  className="upcoming-check"
                  style={{
                    borderColor: color,
                    background: a.is_completed ? color : 'transparent',
                  }}
                  onClick={() => toggleAssignment(a.id)}
                  aria-label={a.is_completed ? 'Mark not done' : 'Mark done'}
                >
                  {a.is_completed && <Icon name="check" size={12} strokeWidth={3} />}
                </button>
                <span className="upcoming-rail" style={{ background: color }} />
                <span className="upcoming-main">
                  <span className="upcoming-course">
                    <i style={{ background: color }} />
                    {course?.name ?? 'Task'}
                  </span>
                  <span className={`upcoming-task${a.is_completed ? ' done' : ''}`}>{a.title}</span>
                  <span className="upcoming-due">
                    {guidedIds
                      ? `${a.estimated_minutes} minutes`
                      : new Date(a.due_at).toLocaleDateString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Flow Summary (completion screen) ────────────────────────────── */

function FlowSummary({ data, onDone }: { data: SummaryData; onDone: () => void }) {
  const mins = Math.floor(data.totalFocusSeconds / 60);
  const ach = achievement(mins);
  const delta = data.prevSeconds !== null ? data.totalFocusSeconds - data.prevSeconds : null;

  const vs =
    data.prevSeconds === null
      ? { icon: 'sparkles', text: 'First session!', cls: 'accent' }
      : delta === 0
        ? { icon: 'minus', text: 'Same time', cls: '' }
        : delta! > 0
          ? { icon: 'arrowRight', text: `+${fmtClock(delta!)}`, cls: 'mint' }
          : { icon: 'arrowRight', text: `−${fmtClock(-delta!)}`, cls: 'coral' };

  return (
    <div className="summary-overlay">
      <div className="summary-inner">
        <div className="summary-mark">
          <FlowMark size={40} color="var(--accent)" animated />
        </div>
        <div className="eyebrow eyebrow-muted summary-eyebrow">
          {data.mode === 'regular' ? 'Pomodoro complete' : 'Deep work complete'}
        </div>

        <div className="summary-medallion">
          <span className="summary-ring r1" />
          <span className="summary-ring r2" />
          <span className="summary-ring r3" />
          <span className="summary-halo" />
          <span className="summary-coin">
            <Icon name={ach.icon} size={37} strokeWidth={2.4} />
          </span>
        </div>

        <span className="summary-chip">
          <Icon name={ach.icon} size={12} strokeWidth={2.4} />
          {ach.tier}
        </span>

        <h1 className="summary-title">
          {data.name || (data.mode === 'regular' ? 'Focus Complete' : 'Deep Work Complete')}
        </h1>
        <p className="summary-msg">{ach.message}</p>

        <div className="summary-hero">{fmtClock(data.totalFocusSeconds)}</div>
        <div className="eyebrow summary-total">Total focus</div>

        <div className="summary-grid">
          <div className="summary-stat glass">
            <span className="summary-stat-head">
              <Icon name="restart" size={12} strokeWidth={2.4} />
              Started
            </span>
            <strong>{fmtHM(data.startedAt)}</strong>
          </div>
          <div className="summary-stat glass">
            <span className="summary-stat-head">
              <Icon name="flag" size={12} strokeWidth={2.4} />
              Ended
            </span>
            <strong>{fmtHM(data.endedAt)}</strong>
          </div>
          <div className="summary-stat glass">
            <span className="summary-stat-head">
              <Icon name={data.mode === 'regular' ? 'dots' : 'clock'} size={12} strokeWidth={2.4} />
              {data.mode === 'regular'
                ? data.focusRounds === 1
                  ? 'Focus round'
                  : 'Focus rounds'
                : 'Prev session'}
            </span>
            <strong className={data.mode === 'regular' ? 'accent' : ''}>
              {data.mode === 'regular'
                ? data.focusRounds
                : data.prevSeconds !== null
                  ? fmtClock(data.prevSeconds)
                  : '—'}
            </strong>
          </div>
          <div className="summary-stat glass">
            <span className="summary-stat-head">
              <Icon name={vs.icon} size={12} strokeWidth={2.4} className={`vs-${vs.cls}`} />
              vs Previous
            </span>
            <strong className={vs.cls}>{vs.text}</strong>
          </div>
        </div>

        <button className="summary-done" onClick={onDone}>
          Done
          <Icon name="check" size={15} strokeWidth={2.6} />
        </button>
      </div>
    </div>
  );
}

/* ── Exit confirm (Lock-In hold-to-end) ──────────────────────────── */

function ExitConfirm({ onEnd, onKeep }: { onEnd: () => void; onKeep: () => void }) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | null>(null);

  const startHold = () => {
    setHolding(true);
    timer.current = window.setTimeout(onEnd, 1000);
  };
  const cancelHold = () => {
    setHolding(false);
    if (timer.current) window.clearTimeout(timer.current);
  };

  return (
    <div className="exit-overlay">
      <div className="exit-card">
        <span className="exit-glyph">
          <Icon name="shield" size={32} strokeWidth={2} />
        </span>
        <h2>Leaving so soon?</h2>
        <p>You locked in for this session. Hold the button to end early.</p>
        <button
          className={`exit-hold${holding ? ' holding' : ''}`}
          onPointerDown={startHold}
          onPointerUp={cancelHold}
          onPointerLeave={cancelHold}
        >
          <span className="exit-hold-fill" />
          <span className="exit-hold-label">{holding ? 'Keep holding…' : 'Hold to end'}</span>
        </button>
        <button className="exit-keep" onClick={onKeep}>
          Keep going
        </button>
      </div>
    </div>
  );
}

/* ── Flow root ───────────────────────────────────────────────────── */

export function FlowView({ onNavigate }: { onNavigate?: (view: AppView) => void }) {
  const flow = useFlow();
  const { state, settings } = flow;

  const [sheet, setSheet] = useState<'regular' | 'endless' | 'guided' | null>(null);
  const [armed, setArmed] = useState(false); // session opened, dormant until first play
  const [guidedIds, setGuidedIds] = useState<string[] | null>(() => {
    try {
      const v = sessionStorage.getItem('sf.guidedTasks');
      return v ? (JSON.parse(v) as string[]) : null;
    } catch {
      return null;
    }
  });
  const [lockIn, setLockIn] = useState(() => localStorage.getItem('sf.lockIn') === '1');
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [exitConfirm, setExitConfirm] = useState(false);

  const setLock = (v: boolean) => {
    setLockIn(v);
    localStorage.setItem('sf.lockIn', v ? '1' : '0');
  };

  const running = state.status === 'running';
  const idle = state.status === 'idle';
  const isRegular = state.mode === 'regular';
  const inBreak = isRegular && state.phase !== 'work';
  const palette = paletteFor(state.mode, state.phase);
  const inSession = !idle || armed;

  const secondsLeft = flow.secondsLeft();
  const progress = isRegular && !idle ? clamp(1 - secondsLeft / Math.max(1, state.phaseTotal), 0, 1) : 0;
  const warning = isRegular && state.phase === 'work' && running && secondsLeft <= 300 && state.phaseTotal > 300;

  const tint = !isRegular || state.phase === 'work'
    ? ACCENT_RGB
    : state.phase === 'shortBreak'
      ? MINT_RGB
      : CORAL_RGB;
  const tintAmount = inBreak ? 0.85 : 0;

  const getElapsedMs = () =>
    idle ? 0 : isRegular ? (state.phaseTotal - flow.secondsLeft()) * 1000 : flow.endlessMs();

  const pick = (mode: 'regular' | 'endless' | 'guided') => {
    if (!idle) {
      setArmed(true);
      return;
    }
    if (mode === 'guided') {
      setSheet('guided');
      return;
    }
    flow.setMode(mode);
    setSheet(mode);
  };

  const beginSession = (guided: string[] | null) => {
    setGuidedIds(guided);
    try {
      if (guided) sessionStorage.setItem('sf.guidedTasks', JSON.stringify(guided));
      else sessionStorage.removeItem('sf.guidedTasks');
    } catch {
      /* ignore */
    }
    setSheet(null);
    setArmed(true); // dormant — the pooled blob waits for the first play tap
  };

  const finishSession = () => {
    const now = new Date();
    const startedAt = state.sessionStartedAt ? new Date(state.sessionStartedAt) : now;
    const focusSeconds = isRegular
      ? state.sessionsDone * settings.workMin * 60 +
        (state.phase === 'work' ? Math.round(state.phaseTotal - flow.secondsLeft()) : 0)
      : Math.round(flow.endlessMs() / 1000);
    const key = isRegular ? 'sf.lastPomodoroSeconds' : 'sf.lastEndlessSeconds';
    const prevRaw = localStorage.getItem(key);
    const prev = prevRaw !== null ? Number(prevRaw) : null;

    flow.stop();
    setArmed(false);
    setExitConfirm(false);

    if (focusSeconds >= 5) {
      localStorage.setItem(key, String(focusSeconds));
      setSummary({
        mode: isRegular ? 'regular' : 'endless',
        guided: guidedIds !== null,
        name: state.name,
        startedAt,
        endedAt: now,
        totalFocusSeconds: focusSeconds,
        focusRounds: state.sessionsDone,
        prevSeconds: prev !== null && Number.isFinite(prev) ? prev : null,
      });
    }
    setGuidedIds(null);
    try {
      sessionStorage.removeItem('sf.guidedTasks');
    } catch {
      /* ignore */
    }
  };

  const requestStop = () => {
    if (lockIn && !idle) setExitConfirm(true);
    else finishSession();
  };

  // The immersive session covers the app — keep the page behind it from scrolling.
  useEffect(() => {
    if (!inSession) return;
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, [inSession]);

  /* ── Render ── */

  if (summary) {
    return (
      <Overlay>
        <FlowSummary data={summary} onDone={() => setSummary(null)} />
      </Overlay>
    );
  }

  if (!inSession) {
    return (
      <div className="view flow-view">
        <ModePicker onBack={() => onNavigate?.('today')} onPick={pick} />
        {sheet === 'regular' && (
          <RegularCustomizer
            lockIn={lockIn}
            setLockIn={setLock}
            onStart={() => beginSession(null)}
            onClose={() => setSheet(null)}
          />
        )}
        {sheet === 'endless' && (
          <EndlessCustomizer
            lockIn={lockIn}
            setLockIn={setLock}
            onStart={() => beginSession(null)}
            onClose={() => setSheet(null)}
          />
        )}
        {sheet === 'guided' && (
          <GuidedPicker
            onStart={(ids) => {
              flow.setMode('endless');
              flow.setName('Guided Flow');
              beginSession(ids);
            }}
            onClose={() => setSheet(null)}
          />
        )}
      </div>
    );
  }

  const sessionTitle = guidedIds
    ? 'Guided Flow'
    : isRegular
      ? palette.label
      : 'Endless Flow';
  const sessionSub = state.name && state.name !== 'Guided Flow'
    ? state.name
    : isRegular
      ? `Session ${state.sessionsDone + 1}`
      : '';

  return (
    <Overlay>
    <div className="flow-session">
      <div className="flow-session-top">
        <button className="flow-session-back" onClick={requestStop} aria-label="End session">
          <Icon name="chevronLeft" size={20} strokeWidth={2.2} />
        </button>
        <div className="flow-session-titles">
          <span className="flow-session-state">{sessionTitle}</span>
          {sessionSub && <span className="flow-session-name">{sessionSub}</span>}
        </div>
        <span className="flow-session-balance" />
      </div>

      {lockIn && (
        <span className="lockin-badge">
          <Icon name="shield" size={11} strokeWidth={2.4} />
          Locked in
        </span>
      )}

      <FlowScene
        dotColor={palette.b}
        tint={tint}
        tintAmount={tintAmount}
        running={running}
        progress={progress}
        getElapsedMs={getElapsedMs}
      >
        {isRegular ? (
          <PhaseTime getSeconds={() => flow.secondsLeft()} running={running} />
        ) : (
          <EndlessTime getMs={flow.endlessMs} running={running} />
        )}
        <div className={`flow-status${running ? ' live' : ''}`}>
          {running && (
            <span
              className={`pulse-dot${isRegular ? ' static' : ''}`}
              style={{ background: palette.b, boxShadow: `0 0 4px ${palette.b}` }}
            />
          )}
          {running ? 'Flowing' : 'Paused'}
        </div>
      </FlowScene>

      {warning && (
        <div className="flow-warning">
          <Icon name="bell" size={14} strokeWidth={2.2} />
          Break in 5 minutes
        </div>
      )}

      <div className="flow-session-controls">
        {isRegular && state.phase === 'work' && running && (
          <div className="flow-break-chips">
            <button className="break-chip short" onClick={() => flow.takeBreak('short')}>
              <Icon name="coffee" size={12} strokeWidth={2.2} />
              Short Break
            </button>
            <button className="break-chip long" onClick={() => flow.takeBreak('long')}>
              <Icon name="sofa" size={12} strokeWidth={2.2} />
              Long Break
            </button>
          </div>
        )}
        {inBreak && running && (
          <button className="break-chip skip" onClick={flow.skipBreak}>
            <Icon name="chevronRight" size={12} strokeWidth={2.4} />
            Skip Break
          </button>
        )}
        <div className="flow-ctl-row">
          <button
            className="flow-ctl flow-ctl-main"
            style={{ background: palette.b, boxShadow: `0 8px 12px -2px ${palette.b}66` }}
            onClick={idle ? flow.start : running ? flow.pause : flow.resume}
            aria-label={running ? 'Pause' : 'Play'}
          >
            <Icon name={running ? 'pause' : 'play'} size={28} />
          </button>
          <button className="flow-ctl flow-ctl-stop" onClick={requestStop} aria-label="End session">
            <Icon name="stop" size={18} />
          </button>
        </div>
      </div>

      <UpcomingBar guidedIds={guidedIds} />

      {exitConfirm && <ExitConfirm onEnd={finishSession} onKeep={() => setExitConfirm(false)} />}
    </div>
    </Overlay>
  );
}
