import { useStore } from '../lib/store';
import { AmbientBackground } from './Shell';
import { FlowCoin, Icon, Splash } from './ui';

/**
 * Wraps the app: shows a branded splash while the session loads, a sign-in
 * card when signed out, and a clear error card if the study tables are
 * missing (SQL migration not run yet). Children render only when ready.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { authStatus, dataReady, dataError, signInWithApple, reload } = useStore();

  if (authStatus === 'loading') {
    return (
      <div className="gate">
        <AmbientBackground />
        <Splash />
      </div>
    );
  }

  if (authStatus === 'signed-out') {
    return (
      <div className="gate">
        <AmbientBackground />
        <div className="gate-card glass">
          <FlowCoin size={64} animated />
          <h1 className="gate-title">
            Welcome to <span className="grad-text">StudentFlow</span>
          </h1>
          <p className="gate-sub">
            Your courses, assignments and planner — in one calm place. The same account works here
            and in the iOS app.
          </p>
          <button className="apple-pill" onClick={signInWithApple}>
            <Icon name="apple" size={18} />
            Sign in with Apple
          </button>
          <a className="gate-demo" href="/app/preview">
            Just looking? Try the live demo →
          </a>
          <p className="gate-fine">
            We only use your Apple&nbsp;ID to sign you in. <a href="/privacy">Privacy</a> ·{' '}
            <a href="/">About StudentFlow</a>
          </p>
        </div>
      </div>
    );
  }

  if (dataError) {
    return (
      <div className="gate">
        <AmbientBackground />
        <div className="gate-card glass">
          <div className="gate-alert">
            <Icon name="alert" size={26} strokeWidth={1.6} />
          </div>
          <h1 className="gate-title">Can't reach your study data</h1>
          <p className="gate-sub">
            {dataError.includes('does not exist') || dataError.includes('schema cache')
              ? 'The study-data tables are not set up on the backend yet (run supabase/002_app_data.sql in the Supabase SQL editor).'
              : dataError}
          </p>
          <button className="apple-pill" onClick={() => reload()}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!dataReady) {
    return (
      <div className="gate">
        <AmbientBackground />
        <Splash label="Opening your flow…" />
      </div>
    );
  }

  return <>{children}</>;
}
