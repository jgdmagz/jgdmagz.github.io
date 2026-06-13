import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  applySession,
  DEFAULT_FLOW_SETTINGS,
  demoFlowSeeds,
  flowChime,
  flowStorage,
  idleFlowState,
  type FlowMode,
  type FlowSessionRecord,
  type FlowSettings,
  type FlowState,
  type FlowStats,
} from '../lib/flow';
import { useStore } from '../lib/store';

/* The flow timer lives at app level so pomodoro cycles keep advancing (and
   chiming) while you're on other tabs. All timing is wall-clock based, so
   reloads and background tabs stay accurate; `advance` catches up any phase
   transitions that happened while nobody was ticking. */

interface AdvanceResult {
  state: FlowState;
  records: FlowSessionRecord[];
  chime: 'workEnd' | 'breakEnd' | null;
  changed: boolean;
}

function advance(prev: FlowState, settings: FlowSettings, now: number): AdvanceResult {
  if (prev.mode !== 'regular' || prev.status !== 'running' || !prev.endsAt || now < prev.endsAt) {
    return { state: prev, records: [], chime: null, changed: false };
  }
  let state = { ...prev };
  const records: FlowSessionRecord[] = [];
  let chime: 'workEnd' | 'breakEnd' | null = null;
  let guard = 0;

  while (state.endsAt !== null && now >= state.endsAt && guard < 50) {
    guard += 1;
    const phaseEnd = state.endsAt;
    if (state.phase === 'work') {
      records.push({
        id: crypto.randomUUID(),
        mode: 'regular',
        name: state.name,
        startedAt: new Date(state.sessionStartedAt ?? phaseEnd - state.phaseTotal * 1000).toISOString(),
        totalSeconds: state.phaseTotal,
        elapsedSeconds: state.phaseTotal,
      });
      const sessionsDone = state.sessionsDone + 1;
      const long = sessionsDone % settings.interval === 0;
      const breakSeconds = (long ? settings.longMin : settings.shortMin) * 60;
      state = {
        ...state,
        phase: long ? 'longBreak' : 'shortBreak',
        sessionsDone,
        phaseTotal: breakSeconds,
        remaining: breakSeconds,
        endsAt: phaseEnd + breakSeconds * 1000,
        sessionStartedAt: phaseEnd,
      };
      chime = 'workEnd';
    } else {
      const workSeconds = settings.workMin * 60;
      state = {
        ...state,
        phase: 'work',
        phaseTotal: workSeconds,
        remaining: workSeconds,
        endsAt: phaseEnd + workSeconds * 1000,
        sessionStartedAt: phaseEnd,
      };
      chime = 'breakEnd';
    }
  }
  return { state, records, chime, changed: true };
}

interface FlowContextValue {
  state: FlowState;
  settings: FlowSettings;
  stats: FlowStats;
  history: FlowSessionRecord[];
  /** Wall-clock heartbeat — updates ~2×/s while running so views re-render. */
  now: number;
  /** Seconds left in the current regular phase. */
  secondsLeft: (now?: number) => number;
  /** Elapsed milliseconds of the endless session (smooth, for rAF displays). */
  endlessMs: (now?: number) => number;
  setMode: (mode: FlowMode) => void;
  setName: (name: string) => void;
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  skipBreak: () => void;
  lap: () => void;
  updateSettings: (patch: Partial<FlowSettings>) => void;
}

const FlowContext = createContext<FlowContextValue | null>(null);

export function useFlow(): FlowContextValue {
  const ctx = useContext(FlowContext);
  if (!ctx) throw new Error('useFlow outside provider');
  return ctx;
}

export function FlowProvider({ children }: { children: ReactNode }) {
  const { demo } = useStore();

  const [settings, setSettings] = useState<FlowSettings>(() =>
    demo ? DEFAULT_FLOW_SETTINGS : flowStorage.loadSettings()
  );
  const [state, setState] = useState<FlowState>(() =>
    demo ? idleFlowState('endless', DEFAULT_FLOW_SETTINGS) : flowStorage.loadState(flowStorage.loadSettings())
  );
  const [stats, setStats] = useState<FlowStats>(() =>
    demo ? demoFlowSeeds().stats : flowStorage.loadStats()
  );
  const [history, setHistory] = useState<FlowSessionRecord[]>(() =>
    demo ? demoFlowSeeds().history : flowStorage.loadHistory()
  );

  const stateRef = useRef(state);
  const settingsRef = useRef(settings);
  stateRef.current = state;
  settingsRef.current = settings;

  /* Persist (never in demo) */
  useEffect(() => {
    if (!demo) flowStorage.save('state', state);
  }, [state, demo]);
  useEffect(() => {
    if (!demo) flowStorage.save('settings', settings);
  }, [settings, demo]);
  useEffect(() => {
    if (!demo) flowStorage.save('stats', stats);
  }, [stats, demo]);
  useEffect(() => {
    if (!demo) flowStorage.save('history', history);
  }, [history, demo]);

  const record = useCallback((recs: FlowSessionRecord[]) => {
    if (recs.length === 0) return;
    setHistory((h) => [...recs, ...h].slice(0, 30));
    setStats((s) => recs.reduce((acc, r) => applySession(acc, r.elapsedSeconds), s));
  }, []);

  /* Tick — advances regular phases and bumps `now` (in the context value)
     twice a second while running, so on-screen timers stay fresh. */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (state.status !== 'running') return;
    const id = window.setInterval(() => {
      const res = advance(stateRef.current, settingsRef.current, Date.now());
      if (res.changed) {
        setState(res.state);
        record(res.records);
        if (res.chime && settingsRef.current.sound) flowChime(res.chime);
      }
      setNow(Date.now());
    }, 500);
    return () => window.clearInterval(id);
  }, [state.status, record]);

  /* Catch up transitions that happened while unloaded. */
  useEffect(() => {
    const res = advance(stateRef.current, settingsRef.current, Date.now());
    if (res.changed) {
      setState(res.state);
      record(res.records);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const secondsLeft = useCallback((now = Date.now()) => {
    const s = stateRef.current;
    if (s.status === 'running' && s.endsAt) return Math.max(0, (s.endsAt - now) / 1000);
    return s.remaining;
  }, []);

  const endlessMs = useCallback((now = Date.now()) => {
    const s = stateRef.current;
    const live = s.status === 'running' && s.startedAt ? now - s.startedAt : 0;
    return s.accumulated * 1000 + live;
  }, []);

  /* ── Actions ── */

  const setMode = useCallback(
    (mode: FlowMode) => {
      setState((prev) => (prev.status === 'idle' ? { ...idleFlowState(mode, settingsRef.current), name: prev.name } : prev));
    },
    []
  );

  const setName = useCallback((name: string) => {
    setState((prev) => ({ ...prev, name }));
  }, []);

  const start = useCallback(() => {
    const now = Date.now();
    setState((prev) => {
      if (prev.status !== 'idle') return prev;
      if (prev.mode === 'regular') {
        return { ...prev, status: 'running', endsAt: now + prev.remaining * 1000, sessionStartedAt: now };
      }
      return { ...prev, status: 'running', startedAt: now, accumulated: 0, laps: [], sessionStartedAt: now };
    });
  }, []);

  const pause = useCallback(() => {
    const now = Date.now();
    setState((prev) => {
      if (prev.status !== 'running') return prev;
      if (prev.mode === 'regular') {
        return { ...prev, status: 'paused', remaining: Math.max(0, ((prev.endsAt ?? now) - now) / 1000), endsAt: null };
      }
      const live = prev.startedAt ? (now - prev.startedAt) / 1000 : 0;
      return { ...prev, status: 'paused', accumulated: prev.accumulated + live, startedAt: null };
    });
  }, []);

  const resume = useCallback(() => {
    const now = Date.now();
    setState((prev) => {
      if (prev.status !== 'paused') return prev;
      if (prev.mode === 'regular') {
        return { ...prev, status: 'running', endsAt: now + prev.remaining * 1000 };
      }
      return { ...prev, status: 'running', startedAt: now };
    });
  }, []);

  const stop = useCallback(() => {
    const now = Date.now();
    const s = stateRef.current;
    const recs: FlowSessionRecord[] = [];
    if (s.mode === 'regular' && s.phase === 'work' && s.status !== 'idle') {
      const elapsed = s.phaseTotal - secondsLeft(now);
      if (elapsed >= 60) {
        recs.push({
          id: crypto.randomUUID(),
          mode: 'regular',
          name: s.name,
          startedAt: new Date(s.sessionStartedAt ?? now - elapsed * 1000).toISOString(),
          totalSeconds: s.phaseTotal,
          elapsedSeconds: Math.round(elapsed),
        });
      }
    }
    if (s.mode === 'endless' && s.status !== 'idle') {
      const elapsed = endlessMs(now) / 1000;
      if (elapsed >= 60) {
        recs.push({
          id: crypto.randomUUID(),
          mode: 'endless',
          name: s.name,
          startedAt: new Date(s.sessionStartedAt ?? now - elapsed * 1000).toISOString(),
          totalSeconds: Math.round(elapsed),
          elapsedSeconds: Math.round(elapsed),
        });
      }
    }
    record(recs);
    setState((prev) => ({ ...idleFlowState(prev.mode, settingsRef.current), name: prev.name }));
  }, [record, secondsLeft, endlessMs]);

  const skipBreak = useCallback(() => {
    const now = Date.now();
    setState((prev) => {
      if (prev.mode !== 'regular' || prev.phase === 'work' || prev.status === 'idle') return prev;
      const workSeconds = settingsRef.current.workMin * 60;
      return {
        ...prev,
        phase: 'work',
        phaseTotal: workSeconds,
        remaining: workSeconds,
        endsAt: prev.status === 'running' ? now + workSeconds * 1000 : null,
        sessionStartedAt: now,
      };
    });
  }, []);

  const lap = useCallback(() => {
    const now = Date.now();
    setState((prev) => {
      if (prev.mode !== 'endless' || prev.status !== 'running') return prev;
      return { ...prev, laps: [...prev.laps, Math.round(endlessMs(now) / 1000)] };
    });
  }, [endlessMs]);

  const updateSettings = useCallback((patch: Partial<FlowSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      setState((s) => {
        if (s.status === 'idle' && s.mode === 'regular') {
          return { ...s, remaining: next.workMin * 60, phaseTotal: next.workMin * 60 };
        }
        return s;
      });
      return next;
    });
  }, []);

  const value = useMemo<FlowContextValue>(
    () => ({
      state,
      settings,
      stats,
      history,
      now,
      secondsLeft,
      endlessMs,
      setMode,
      setName,
      start,
      pause,
      resume,
      stop,
      skipBreak,
      lap,
      updateSettings,
    }),
    [state, settings, stats, history, now, secondsLeft, endlessMs, setMode, setName, start, pause, resume, stop, skipBreak, lap, updateSettings]
  );

  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>;
}
