import { useCallback, useEffect, useState } from 'react';
import { StoreProvider } from './lib/store';
import { AuthGate } from './components/AuthGate';
import { Shell } from './components/Shell';
import { Toasts } from './components/ui';
import { TodayView } from './views/TodayView';
import { CalendarView } from './views/CalendarView';
import { CoursesView } from './views/CoursesView';
import { ProfileView } from './views/ProfileView';

export type AppView = 'today' | 'calendar' | 'courses' | 'profile';

const TITLES: Record<AppView, string> = {
  today: 'Today',
  calendar: 'Calendar',
  courses: 'Courses',
  profile: 'Profile',
};

function viewFromPath(pathname: string): AppView {
  const seg = pathname.replace(/\/+$/, '').split('/').pop();
  if (seg === 'calendar' || seg === 'courses' || seg === 'profile') return seg;
  return 'today';
}

function pathForView(view: AppView): string {
  return view === 'today' ? '/app' : `/app/${view}`;
}

export default function FlowApp({
  initialView = 'today',
  demo = false,
}: {
  initialView?: AppView;
  demo?: boolean;
}) {
  const [view, setView] = useState<AppView>(() => {
    if (demo && typeof location !== 'undefined') {
      const v = new URLSearchParams(location.search).get('view');
      if (v === 'calendar' || v === 'courses' || v === 'profile' || v === 'today') return v;
    }
    return initialView;
  });

  // The static splash in AppLayout is replaced the moment the island mounts.
  useEffect(() => {
    document.getElementById('app-splash')?.remove();
  }, []);

  // Each top-level view is a real static page (deep links + refresh work);
  // in-app navigation swaps views client-side via pushState. The demo page
  // keeps its own URL and just swaps views in place.
  const navigate = useCallback(
    (next: AppView) => {
      setView((current) => {
        if (next !== current && !demo) {
          history.pushState({ view: next }, '', pathForView(next));
        }
        return next;
      });
    },
    [demo]
  );

  useEffect(() => {
    if (demo) return;
    const onPop = () => setView(viewFromPath(location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [demo]);

  useEffect(() => {
    document.title = `${TITLES[view]} · StudentFlow`;
  }, [view]);

  return (
    <StoreProvider demo={demo}>
      <AuthGate>
        <Shell view={view} onNavigate={navigate}>
          <div className="view-fade" key={view}>
            {view === 'today' && <TodayView onNavigate={navigate} />}
            {view === 'calendar' && <CalendarView />}
            {view === 'courses' && <CoursesView />}
            {view === 'profile' && <ProfileView />}
          </div>
        </Shell>
      </AuthGate>
      {demo && (
        <a className="demo-pill glass" href="/app">
          Demo data — sign in to make it yours →
        </a>
      )}
      <Toasts />
    </StoreProvider>
  );
}
