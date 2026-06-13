import type { ReactNode } from 'react';
import { useStore } from '../lib/store';
import { useFlow } from './FlowContext';
import { Avatar, FlowCoin, Icon } from './ui';
import type { AppView } from '../FlowApp';

const NAV: { key: AppView; label: string; icon: string }[] = [
  { key: 'today', label: 'Today', icon: 'sun' },
  { key: 'calendar', label: 'Calendar', icon: 'calendar' },
  { key: 'flow', label: 'Flow', icon: 'infinity' },
  { key: 'courses', label: 'Courses', icon: 'book' },
  { key: 'profile', label: 'Profile', icon: 'user' },
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

export function Shell({
  view,
  onNavigate,
  children,
}: {
  view: AppView;
  onNavigate: (view: AppView) => void;
  children: ReactNode;
}) {
  const { profile, user, signOut } = useStore();
  const { state: flowState } = useFlow();
  const flowRunning = flowState.status === 'running';
  const displayName = profile?.display_name || user?.email?.split('@')[0] || 'Student';

  return (
    <div className="app-shell">
      <AmbientBackground />

      {/* Desktop sidebar */}
      <aside className="app-side glass">
        <a className="side-brand" href="/" title="StudentFlow home">
          <FlowCoin size={40} animated />
          <span className="side-brand-name">
            StudentFlow
            <span className="side-brand-sub">Web app</span>
          </span>
        </a>

        <nav className="side-nav" aria-label="App">
          {NAV.map((item) => (
            <button
              key={item.key}
              className={`side-link${view === item.key ? ' active' : ''}`}
              onClick={() => onNavigate(item.key)}
              aria-current={view === item.key ? 'page' : undefined}
            >
              <span className="side-link-ico">
                <Icon name={item.icon} size={19} />
                {item.key === 'flow' && flowRunning && <span className="nav-live" aria-hidden="true" />}
              </span>
              <span>{item.label}</span>
              {item.key === 'flow' && flowRunning && <span className="nav-live-text">In flow</span>}
            </button>
          ))}
        </nav>

        <div className="side-foot">
          <button className="side-user" onClick={() => onNavigate('profile')}>
            <Avatar url={profile?.avatar_url} name={displayName} size={34} />
            <span className="side-user-meta">
              <span className="side-user-name">{displayName}</span>
              <span className="side-user-mail">{user?.email ?? ''}</span>
            </span>
          </button>
          <button className="icon-btn side-signout" onClick={signOut} title="Sign out" aria-label="Sign out">
            <Icon name="logout" size={17} />
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="app-top glass">
        <a className="top-brand" href="/" aria-label="StudentFlow home">
          <FlowCoin size={30} />
        </a>
        <span className="top-title">{NAV.find((n) => n.key === view)?.label}</span>
        <button className="top-avatar" onClick={() => onNavigate('profile')} aria-label="Profile">
          <Avatar url={profile?.avatar_url} name={displayName} size={30} />
        </button>
      </header>

      <main className="app-main">{children}</main>

      {/* Mobile tab bar */}
      <nav className="app-tabs glass" aria-label="App">
        {NAV.map((item) => (
          <button
            key={item.key}
            className={`tab${view === item.key ? ' active' : ''}`}
            onClick={() => onNavigate(item.key)}
            aria-current={view === item.key ? 'page' : undefined}
          >
            <span className="tab-ico">
              <Icon name={item.icon} size={21} />
              {item.key === 'flow' && flowRunning && <span className="nav-live" aria-hidden="true" />}
            </span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
