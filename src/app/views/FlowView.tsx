import { useMemo } from 'react';
import { useFlow } from '../components/FlowContext';
import { EndlessTime, FlowScene, PhaseTime } from '../components/FlowScene';
import { Icon } from '../components/ui';
import { fmtClock, fmtTotal, paletteFor, type FlowMode } from '../lib/flow';

const WORK_CHOICES = [15, 20, 25, 30, 45, 50, 60];
const SHORT_CHOICES = [3, 5, 8, 10];
const LONG_CHOICES = [10, 15, 20, 30];
const INTERVAL_CHOICES = [2, 3, 4, 5, 6];

function relDay(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const days = Math.round(
    (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) /
      86400000
  );
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (days <= 0) return `Today · ${time}`;
  if (days === 1) return `Yesterday · ${time}`;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function FlowView() {
  const flow = useFlow();
  const { state, settings, stats, history } = flow;

  const running = state.status === 'running';
  const idle = state.status === 'idle';
  const paused = state.status === 'paused';
  const isRegular = state.mode === 'regular';
  const inBreak = isRegular && state.phase !== 'work';
  const palette = paletteFor(state.mode, state.phase);

  const secondsLeft = flow.secondsLeft();
  const ringFraction = isRegular
    ? Math.min(1, Math.max(0, 1 - secondsLeft / Math.max(1, state.phaseTotal)))
    : null;

  const cycleDots = useMemo(
    () => Array.from({ length: settings.interval }, (_, i) => i < state.sessionsDone % settings.interval ||
      (state.sessionsDone > 0 && state.sessionsDone % settings.interval === 0 && inBreak && state.phase === 'longBreak')),
    [settings.interval, state.sessionsDone, inBreak, state.phase]
  );

  const switchMode = (mode: FlowMode) => {
    if (!idle || mode === state.mode) return;
    flow.setMode(mode);
  };

  return (
    <div className="view flow-view">
      <header className="view-head">
        <div>
          <div className="eyebrow">Focus</div>
          <h1 className="view-title">Flow</h1>
        </div>
        <div className="flow-head-actions">
          <button
            className="icon-btn"
            onClick={() => flow.updateSettings({ sound: !settings.sound })}
            title={settings.sound ? 'Mute chimes' : 'Unmute chimes'}
            aria-label={settings.sound ? 'Mute chimes' : 'Unmute chimes'}
          >
            <Icon name={settings.sound ? 'sound' : 'soundOff'} size={17} />
          </button>
          <div className="segmented" role="radiogroup" aria-label="Flow mode">
            {(['regular', 'endless'] as const).map((m) => (
              <button
                key={m}
                role="radio"
                aria-checked={state.mode === m}
                className={`segment${state.mode === m ? ' on' : ''}`}
                disabled={!idle && state.mode !== m}
                onClick={() => switchMode(m)}
              >
                <Icon name={m === 'regular' ? 'clock' : 'infinity'} size={14} />
                {m === 'regular' ? 'Regular' : 'Endless'}
              </button>
            ))}
          </div>
        </div>
      </header>

      <section className="flow-stage glass">
        <FlowScene palette={palette} running={running} ringFraction={ringFraction}>
          <div className={`flow-phase-label${running ? ' live' : ''}`} style={{ color: palette.b }}>
            {running && <span className="pulse-dot" style={{ background: palette.b }} />}
            {idle ? (isRegular ? 'Ready to focus' : 'Ready to flow') : palette.label}
          </div>

          {isRegular ? (
            <PhaseTime seconds={Math.ceil(secondsLeft)} />
          ) : (
            <EndlessTime getMs={flow.endlessMs} running={running} />
          )}

          {isRegular && (
            <div className="flow-cycle" aria-label="Sessions until long break">
              {cycleDots.map((on, i) => (
                <i key={i} className={on ? 'on' : ''} style={on ? { background: palette.b } : undefined} />
              ))}
            </div>
          )}

          {idle ? (
            <input
              className="flow-name-input"
              placeholder="Name this session (optional)"
              value={state.name}
              maxLength={48}
              onChange={(e) => flow.setName(e.target.value)}
            />
          ) : (
            state.name && <div className="flow-name">{state.name}</div>
          )}
        </FlowScene>
      </section>

      <div className="flow-controls">
        {idle && (
          <button className="btn btn-lg flow-start" onClick={flow.start}>
            <Icon name="play" size={17} /> Start {isRegular ? 'focus' : 'flowing'}
          </button>
        )}
        {running && (
          <>
            <button className="btn-quiet" onClick={flow.pause}>
              <Icon name="pause" size={15} /> Pause
            </button>
            {!isRegular && (
              <button className="btn-quiet" onClick={flow.lap}>
                <Icon name="flag" size={15} /> Lap
              </button>
            )}
            {inBreak && (
              <button className="btn-quiet" onClick={flow.skipBreak}>
                <Icon name="chevronRight" size={15} /> Skip break
              </button>
            )}
            <button className="btn-quiet danger-text" onClick={flow.stop}>
              <Icon name="stop" size={14} /> End session
            </button>
          </>
        )}
        {paused && (
          <>
            <button className="btn btn-sm" onClick={flow.resume}>
              <Icon name="play" size={15} /> Resume
            </button>
            <button className="btn-quiet danger-text" onClick={flow.stop}>
              <Icon name="stop" size={14} /> End session
            </button>
          </>
        )}
      </div>

      {!isRegular && state.laps.length > 0 && (
        <div className="lap-chips">
          {state.laps.map((s, i) => (
            <span className="lap-chip glass" key={i}>
              <Icon name="flag" size={11} /> Lap {i + 1} · {fmtClock(s)}
            </span>
          ))}
        </div>
      )}

      {idle && isRegular && (
        <div className="flow-settings glass">
          <label>
            <span className="mini-label">Focus</span>
            <select
              className="sheet-input"
              value={settings.workMin}
              onChange={(e) => flow.updateSettings({ workMin: Number(e.target.value) })}
            >
              {WORK_CHOICES.map((m) => (
                <option key={m} value={m}>{m} min</option>
              ))}
            </select>
          </label>
          <label>
            <span className="mini-label">Short break</span>
            <select
              className="sheet-input"
              value={settings.shortMin}
              onChange={(e) => flow.updateSettings({ shortMin: Number(e.target.value) })}
            >
              {SHORT_CHOICES.map((m) => (
                <option key={m} value={m}>{m} min</option>
              ))}
            </select>
          </label>
          <label>
            <span className="mini-label">Long break</span>
            <select
              className="sheet-input"
              value={settings.longMin}
              onChange={(e) => flow.updateSettings({ longMin: Number(e.target.value) })}
            >
              {LONG_CHOICES.map((m) => (
                <option key={m} value={m}>{m} min</option>
              ))}
            </select>
          </label>
          <label>
            <span className="mini-label">Long every</span>
            <select
              className="sheet-input"
              value={settings.interval}
              onChange={(e) => flow.updateSettings({ interval: Number(e.target.value) })}
            >
              {INTERVAL_CHOICES.map((m) => (
                <option key={m} value={m}>{m} sessions</option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="stats-strip flow-stats">
        <div className="stat-card glass">
          <div className="stat-ico flame">
            <Icon name="flame" size={19} />
          </div>
          <div>
            <div className="stat-value">{stats.currentStreak}</div>
            <div className="stat-label">day streak · best {stats.longestStreak}</div>
          </div>
        </div>
        <div className="stat-card glass">
          <div className="stat-ico">
            <Icon name="clock" size={19} />
          </div>
          <div>
            <div className="stat-value">{fmtTotal(stats.totalFlowSeconds)}</div>
            <div className="stat-label">in flow, all time</div>
          </div>
        </div>
        <div className="stat-card glass">
          <div className="stat-ico">
            <Icon name="sparkles" size={19} />
          </div>
          <div>
            <div className="stat-value">{stats.totalSessions}</div>
            <div className="stat-label">sessions completed</div>
          </div>
        </div>
      </div>

      {history.length > 0 && (
        <section className="detail-section">
          <div className="detail-section-head">
            <h2 className="section-h">Recent flows</h2>
          </div>
          <div className="flow-history">
            {history.slice(0, 6).map((r) => (
              <div className="flow-row glass" key={r.id}>
                <span className="flow-row-ico">
                  <Icon name={r.mode === 'endless' ? 'infinity' : 'clock'} size={16} />
                </span>
                <span className="flow-row-main">
                  <span className="flow-row-name">{r.name || (r.mode === 'endless' ? 'Endless flow' : 'Focus session')}</span>
                  <span className="flow-row-sub">{relDay(r.startedAt)}</span>
                </span>
                <span className="flow-row-dur">{fmtTotal(r.elapsedSeconds)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
