// Flow focus modes — types, persistence, palettes and helpers.
// Mirrors the app's FlowManager: 'regular' (pomodoro cycles) and 'endless'
// (open-ended deep work), with UserStats-style streak bookkeeping.

export type FlowMode = 'regular' | 'endless';
export type FlowPhase = 'work' | 'shortBreak' | 'longBreak';
export type FlowStatus = 'idle' | 'running' | 'paused';

export interface FlowSettings {
  workMin: number;
  shortMin: number;
  longMin: number;
  interval: number; // long break every N work sessions
  sound: boolean;
}

export const DEFAULT_FLOW_SETTINGS: FlowSettings = {
  workMin: 25,
  shortMin: 5,
  longMin: 15,
  interval: 4,
  sound: true,
};

export interface FlowState {
  mode: FlowMode;
  status: FlowStatus;
  phase: FlowPhase; // regular only; 'work' while endless
  /* regular */
  remaining: number; // seconds left (authoritative while paused/idle)
  endsAt: number | null; // wall-clock ms while running
  phaseTotal: number; // seconds in the current phase
  sessionsDone: number; // completed work sessions in the current cycle
  /* endless */
  accumulated: number; // seconds banked while paused
  startedAt: number | null; // wall-clock ms of the running segment
  laps: number[]; // elapsed seconds at each lap mark
  /* shared */
  name: string;
  sessionStartedAt: number | null; // for the history record
}

export interface FlowSessionRecord {
  id: string;
  mode: FlowMode;
  name: string;
  startedAt: string; // ISO
  totalSeconds: number;
  elapsedSeconds: number;
}

export interface FlowStats {
  currentStreak: number;
  lastFlowDate: string | null; // "yyyy-mm-dd"
  totalFlowSeconds: number;
  totalSessions: number;
  longestStreak: number;
}

export const EMPTY_STATS: FlowStats = {
  currentStreak: 0,
  lastFlowDate: null,
  totalFlowSeconds: 0,
  totalSessions: 0,
  longestStreak: 0,
};

export function idleFlowState(mode: FlowMode, settings: FlowSettings): FlowState {
  return {
    mode,
    status: 'idle',
    phase: 'work',
    remaining: settings.workMin * 60,
    endsAt: null,
    phaseTotal: settings.workMin * 60,
    sessionsDone: 0,
    accumulated: 0,
    startedAt: null,
    laps: [],
    name: '',
    sessionStartedAt: null,
  };
}

/* ── Persistence ────────────────────────────────────────────────── */

const KEYS = {
  state: 'sf.flow.state',
  settings: 'sf.flow.settings',
  stats: 'sf.flow.stats',
  history: 'sf.flow.history',
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function readArray<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export const flowStorage = {
  loadSettings: () => read(KEYS.settings, DEFAULT_FLOW_SETTINGS),
  loadStats: () => read(KEYS.stats, EMPTY_STATS),
  loadHistory: () => readArray<FlowSessionRecord>(KEYS.history),
  loadState: (settings: FlowSettings) => read(KEYS.state, idleFlowState('endless', settings)),
  save(key: keyof typeof KEYS, value: unknown) {
    try {
      localStorage.setItem(KEYS[key], JSON.stringify(value));
    } catch {
      /* private mode etc. */
    }
  },
};

/* ── Streak math (mirrors UserStats) ────────────────────────────── */

function dayString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

export function applySession(stats: FlowStats, elapsedSeconds: number, now = new Date()): FlowStats {
  const today = dayString(now);
  const yesterday = dayString(new Date(now.getTime() - 86400000));
  let streak = stats.currentStreak;
  if (stats.lastFlowDate === today) {
    streak = Math.max(1, streak);
  } else if (stats.lastFlowDate === yesterday) {
    streak += 1;
  } else {
    streak = 1;
  }
  return {
    currentStreak: streak,
    lastFlowDate: today,
    totalFlowSeconds: stats.totalFlowSeconds + Math.round(elapsedSeconds),
    totalSessions: stats.totalSessions + 1,
    longestStreak: Math.max(stats.longestStreak, streak),
  };
}

/* ── Per-phase palettes (Flow OS hues) ──────────────────────────── */

export interface FlowPalette {
  a: string;
  b: string;
  c: string;
  label: string;
}

export function paletteFor(mode: FlowMode, phase: FlowPhase): FlowPalette {
  if (mode === 'endless') return { a: '#8F90ED', b: '#595BCD', c: '#71BF9D', label: 'Endless flow' };
  if (phase === 'shortBreak') return { a: '#71BF9D', b: '#4DBFA6', c: '#9E9FEA', label: 'Short break' };
  if (phase === 'longBreak') return { a: '#B79EF2', b: '#9E9FEA', c: '#F6BE73', label: 'Long break' };
  return { a: '#8F90ED', b: '#4C4EBE', c: '#B79EF2', label: 'Focus' };
}

/* ── Formatting ─────────────────────────────────────────────────── */

export function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export function fmtTotal(totalSeconds: number): string {
  const m = Math.round(totalSeconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 === 0 ? `${h}h` : `${h}h ${m % 60}m`;
}

/* ── Chime (WebAudio — no assets) ───────────────────────────────── */

let audioCtx: AudioContext | null = null;

export function flowChime(kind: 'workEnd' | 'breakEnd') {
  try {
    audioCtx ??= new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const notes = kind === 'workEnd' ? [523.25, 783.99] : [659.25, 523.25];
    notes.forEach((freq, i) => {
      const t = audioCtx!.currentTime + i * 0.18;
      const osc = audioCtx!.createOscillator();
      const gain = audioCtx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.14, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      osc.connect(gain).connect(audioCtx!.destination);
      osc.start(t);
      osc.stop(t + 0.65);
    });
  } catch {
    /* audio unavailable — stay silent */
  }
}

/* ── Color lerp for the iridescent blob ─────────────────────────── */

export function lerpHex(from: string, to: string, t: number): string {
  const f = parseInt(from.slice(1), 16);
  const g = parseInt(to.slice(1), 16);
  const ch = (shift: number) => {
    const a = (f >> shift) & 255;
    const b = (g >> shift) & 255;
    return Math.round(a + (b - a) * t);
  };
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

/* ── Demo seeds (preview mode) ──────────────────────────────────── */

export function demoFlowSeeds(now = new Date()): { stats: FlowStats; history: FlowSessionRecord[] } {
  const today = dayString(now);
  const mk = (
    id: string,
    mode: FlowMode,
    name: string,
    hoursAgo: number,
    minutes: number
  ): FlowSessionRecord => ({
    id,
    mode,
    name,
    startedAt: new Date(now.getTime() - hoursAgo * 3600000).toISOString(),
    totalSeconds: minutes * 60,
    elapsedSeconds: minutes * 60,
  });
  return {
    stats: {
      currentStreak: 6,
      lastFlowDate: today,
      totalFlowSeconds: 67 * 3600 + 24 * 60,
      totalSessions: 84,
      longestStreak: 11,
    },
    history: [
      mk('demo-f1', 'endless', 'Heaps deep work', 2, 72),
      mk('demo-f2', 'regular', 'Linear algebra PS', 5, 25),
      mk('demo-f3', 'regular', 'Linear algebra PS', 6, 25),
      mk('demo-f4', 'endless', 'Reading — modern physics', 26, 47),
    ],
  };
}
