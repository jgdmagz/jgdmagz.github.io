import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useFlow } from './FlowContext';
import { EventSheet } from './EventSheet';
import { AssignmentSheet } from './AssignmentSheet';
import { FlowMark, Icon } from './ui';
import type { AppView } from '../FlowApp';

/* Port of ContentView.swift's shell: 3-tab floating pill (Home / Calendar /
   Courses), a stacked "+" FAB with Event/Todo quick actions, and the 64px
   glowing-glass Flow wave button. Flow and Profile are routes, not tabs. */

const TABS: { key: AppView; label: string; icon: string }[] = [
  { key: 'today', label: 'Home', icon: 'house' },
  { key: 'calendar', label: 'Calendar', icon: 'calendar' },
  { key: 'courses', label: 'Courses', icon: 'bookFill' },
];

export function AmbientBackground() {
  return (
    <div className="ambient" aria-hidden="true">
      <div className="ambient-blob ab-indigo" />
      <div className="ambient-blob ab-lavender" />
      <div className="ambient-blob ab-mint" />
    </div>
  );
}

/* headerBubbleOverlay — two faint white circles at the top, geometry per tab. */
function HeaderBubbles({ view }: { view: AppView }) {
  if (view !== 'today' && view !== 'calendar' && view !== 'courses') return null;
  return (
    <div className={`head-bubbles hb-${view}`} aria-hidden="true">
      <span className="hb-big" />
      <span className="hb-small" />
    </div>
  );
}

/** Next round hour → +1h, matching ContentView.nextRoundHour(). */
function nextRoundHour(): Date {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

export function Shell({
  view,
  onNavigate,
  children,
}: {
  view: AppView;
  onNavigate: (view: AppView) => void;
  children: ReactNode;
}) {
  const { state: flowState } = useFlow();
  const flowActive = flowState.status === 'running' || flowState.status === 'paused';

  const [fabOpen, setFabOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [sheet, setSheet] = useState<'event' | 'todo' | null>(null);
  const lastY = useRef(0);

  // Collapse the bar on scroll down (> 8px), expand on scroll up — ContentView's drag gesture.
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const dy = y - lastY.current;
      if (Math.abs(dy) > 8) {
        setCollapsed(dy > 0 && y > 60);
        lastY.current = y;
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const tabIndex = TABS.findIndex((t) => t.key === view);

  const openSheet = (kind: 'event' | 'todo') => {
    setFabOpen(false);
    setSheet(kind);
  };

  return (
    <div className="app-shell">
      <AmbientBackground />
      <HeaderBubbles view={view} />

      <main className="app-main">{children}</main>

      {/* Invisible click-catcher while the FAB menu is open */}
      {fabOpen && <div className="fab-scrim" onClick={() => setFabOpen(false)} />}

      {/* FAB quick actions — Event / Todo */}
      {fabOpen && (
        <div className="fab-menu">
          <div className="fab-row">
            <span className="fab-row-label">Event</span>
            <button className="fab-row-btn fab-event" onClick={() => openSheet('event')} aria-label="New event">
              <Icon name="calendarPlus" size={19} strokeWidth={2.1} />
            </button>
          </div>
          <div className="fab-row">
            <span className="fab-row-label">Todo</span>
            <button className="fab-row-btn fab-todo" onClick={() => openSheet('todo')} aria-label="New todo">
              <Icon name="checklist" size={19} strokeWidth={2.1} />
            </button>
          </div>
        </div>
      )}

      {/* Floating bottom cluster */}
      <div className={`tabbar-cluster${collapsed ? ' collapsed' : ''}`}>
        <nav
          className="tab-pill glow-glass gg-pill"
          aria-label="App"
          onClick={() => collapsed && setCollapsed(false)}
        >
          <span
            className="tab-well"
            style={{ transform: `translateX(${Math.max(0, tabIndex) * 100}%)`, opacity: tabIndex < 0 ? 0 : 1 }}
            aria-hidden="true"
          />
          {TABS.map((item) => (
            <button
              key={item.key}
              className={`tab${view === item.key ? ' active' : ''}`}
              onClick={() => {
                setCollapsed(false);
                onNavigate(item.key);
              }}
              aria-current={view === item.key ? 'page' : undefined}
            >
              <span className="tab-ico">
                <Icon name={item.icon} size={collapsed ? 16 : 18} strokeWidth={2} />
              </span>
              <span className="tab-label">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="bar-right">
          <button
            className={`add-fab glow-glass gg-add${fabOpen ? ' open' : ''}`}
            onClick={() => {
              setFabOpen((o) => !o);
              setCollapsed(false);
            }}
            aria-label={fabOpen ? 'Close quick add' : 'Quick add'}
            aria-expanded={fabOpen}
          >
            <Icon name="plus" size={18} strokeWidth={2.4} />
          </button>
          <button
            className="flow-fab glow-glass gg-flow"
            onClick={() => onNavigate('flow')}
            aria-label="Flow"
            title="Flow"
          >
            {flowActive && view !== 'flow' && <span className="flow-fab-ring" aria-hidden="true" />}
            <FlowMark size={40} color="#475CD1" animated />
          </button>
        </div>
      </div>

      {sheet === 'event' && (
        <EventSheet
          day={new Date()}
          defaultStart={nextRoundHour()}
          defaultEnd={new Date(nextRoundHour().getTime() + 3600000)}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'todo' && <AssignmentSheet onClose={() => setSheet(null)} />}
    </div>
  );
}
