import { useEffect, useRef } from 'react';
import { useStore } from '../lib/store';
import { AmbientBackground } from './Shell';
import { FlowMark, Icon, Splash } from './ui';

/* The sign-in gate. Its hero is a "living pixel ocean" — a grid of soft
   square cells driven by layered, domain-warped FBM value noise. Wave
   amplitude maps onto the brand ramp (deep indigo → accent → periwinkle →
   lavender → white-hot crests) with a high-frequency shimmer on the peaks,
   so the grid reads as one continuous bioluminescent fluid. */

/* ── FBM noise ───────────────────────────────────────────────────── */

function hash2(x: number, y: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return h - Math.floor(h);
}

const smooth = (t: number) => t * t * (3 - 2 * t);

function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  const u = smooth(xf);
  const v = smooth(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** 4-octave FBM. */
function fbm(x: number, y: number): number {
  let value = 0;
  let amp = 0.5;
  let fx = x;
  let fy = y;
  for (let i = 0; i < 4; i++) {
    value += amp * valueNoise(fx, fy);
    fx *= 2.02;
    fy *= 1.98;
    amp *= 0.5;
  }
  return value; // ~0..1
}

/* Light brand ramp — the app's canvas → washes → periwinkle → indigo crests. */
const RAMP: [number, [number, number, number]][] = [
  [0.0, [244, 244, 250]], // canvas trough
  [0.3, [230, 231, 246]], // washIndigo pale
  [0.52, [199, 201, 242]], // soft periwinkle
  [0.7, [158, 159, 234]], // accentSoft
  [0.86, [107, 109, 214]], // accent
  [1.0, [63, 63, 180]], // accentDeep crest
];

function rampColor(t: number): [number, number, number] {
  const v = Math.min(1, Math.max(0, t));
  for (let i = 1; i < RAMP.length; i++) {
    if (v <= RAMP[i][0]) {
      const [t0, c0] = RAMP[i - 1];
      const [t1, c1] = RAMP[i];
      const k = (v - t0) / (t1 - t0);
      return [
        c0[0] + (c1[0] - c0[0]) * k,
        c0[1] + (c1[1] - c0[1]) * k,
        c0[2] + (c1[2] - c0[2]) * k,
      ];
    }
  }
  return RAMP[RAMP.length - 1][1];
}

function PixelOcean() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    const CELL = 11; // css px per cell
    const GAP = 1.5;

    const draw = (t: number) => {
      const wrap = cv.parentElement;
      if (!wrap) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = wrap.clientWidth;
      const H = wrap.clientHeight;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
        cv.width = Math.round(W * dpr);
        cv.height = Math.round(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = 'rgb(226,228,240)';
      ctx.fillRect(0, 0, W, H);

      const cols = Math.ceil(W / CELL);
      const rows = Math.ceil(H / CELL);

      for (let gy = 0; gy < rows; gy++) {
        for (let gx = 0; gx < cols; gx++) {
          const nx = gx * 0.09;
          const ny = gy * 0.11;
          // The FlowMark signature: horizontal wave bands whose edges undulate.
          // Two traveling sines + a soft FBM current bend each band, so the grid
          // reads as the brand's flowing waves rather than blobby noise.
          const bend =
            0.5 * Math.sin(nx * 1.35 + t * 0.85) +
            0.28 * Math.sin(nx * 2.5 - t * 0.55) +
            0.9 * (fbm(nx * 0.55 + t * 0.06, ny * 0.5 - t * 0.04) - 0.5);
          let h = 0.5 + 0.5 * Math.sin((ny + bend) * 3.4 - t * 0.7);
          // Sharpen: pale water between crisp indigo crests.
          h = Math.pow(Math.min(1, Math.max(0, h)), 2.1);

          // Shimmer — sparkle riding only the crests.
          if (h > 0.62) {
            const sparkle = valueNoise(gx * 3.1 + t * 2.2, gy * 3.3 - t * 1.7);
            h = Math.min(1, h + (sparkle > 0.86 ? 0.5 : 0) * (h - 0.62));
          }

          const [r, g, b] = rampColor(h);
          const x = gx * CELL;
          const y = gy * CELL;
          const size = CELL - GAP;
          ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
          ctx.beginPath();
          ctx.roundRect(x + GAP / 2, y + GAP / 2, size, size, 2);
          ctx.fill();
        }
      }
    };

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      draw(4.2);
      return;
    }

    let raf = 0;
    let last = 0;
    const tick = (ms: number) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden || ms - last < 40) return; // ~25fps — plenty for surf
      last = ms;
      draw(ms / 1000);
    };
    raf = requestAnimationFrame(tick);
    draw(4.2); // rich first frame even before the loop kicks in
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="ocean-wrap" aria-hidden="true">
      <canvas ref={canvasRef} className="ocean-canvas" />
      <div className="ocean-fade" />
    </div>
  );
}

/* ── Gate ────────────────────────────────────────────────────────── */

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
        <div className="gate-card">
          <PixelOcean />
          <div className="gate-body">
            <div className="gate-mark">
              <FlowMark size={38} color="#fff" animated />
            </div>
            <h1 className="gate-title">
              Welcome to <span>StudentFlow</span>
            </h1>
            <p className="gate-sub">
              Your courses, assignments and planner — in one calm place. The same account works
              here and in the iOS app.
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
      </div>
    );
  }

  if (dataError) {
    return (
      <div className="gate">
        <AmbientBackground />
        <div className="gate-card gate-card-plain glass">
          <div className="gate-alert">
            <Icon name="alert" size={26} strokeWidth={1.6} />
          </div>
          <h1 className="gate-title dark">Can't reach your study data</h1>
          <p className="gate-sub dark">
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
