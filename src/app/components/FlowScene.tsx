import { useEffect, useId, useRef, type ReactNode } from 'react';
import { fmtClock, lerpHex, type FlowPalette } from '../lib/flow';

/* The signature focus visual, ported from the app's endless-timer scene:
   a dot-grid ripple field + a living, iridescent morphing blob (slowly
   rotating gradient, organic shape breathing at ~30fps), with an optional
   progress ring for pomodoro phases. All motion is rAF-driven, mutating
   SVG/canvas directly (no React re-renders), paused when the tab is hidden
   and frozen under prefers-reduced-motion. */

const VB = 320; // viewBox size
const CENTER = VB / 2;
const BASE_R = 92;
const POINTS = 10;
const SPEEDS = [0.9, 1.22, 0.74, 1.05, 0.86, 1.3, 0.95, 1.12, 0.8, 1.18];
const PHASES = [0.0, 1.7, 3.1, 4.4, 0.9, 2.5, 5.2, 1.3, 3.9, 5.8];
const RING_R = 126;

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** Organic closed blob through POINTS radial samples (catmull-rom → bezier). */
function blobPath(t: number, amp: number, speed: number): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < POINTS; i++) {
    const angle = (i / POINTS) * 2 * Math.PI;
    const r = BASE_R * (1 + amp * Math.sin(t * speed * SPEEDS[i] + PHASES[i]));
    pts.push([CENTER + r * Math.cos(angle), CENTER + r * Math.sin(angle)]);
  }
  const n = pts.length;
  let d = `M${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return d + 'Z';
}

export function FlowScene({
  palette,
  running,
  ringFraction,
  children,
}: {
  palette: FlowPalette;
  running: boolean;
  ringFraction: number | null; // null hides the ring (endless)
  children: ReactNode;
}) {
  const gid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const blobRef = useRef<SVGPathElement>(null);
  const glowRef = useRef<SVGPathElement>(null);
  const gradRef = useRef<SVGLinearGradientElement>(null);
  const stopRefs = [useRef<SVGStopElement>(null), useRef<SVGStopElement>(null), useRef<SVGStopElement>(null)];
  const ringRef = useRef<SVGCircleElement>(null);

  // Live inputs for the single rAF loop.
  const liveRef = useRef({ palette, running, ringFraction });
  liveRef.current = { palette, running, ringFraction };

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const colors = [palette.a, palette.b, palette.c];
    let angle = 0;
    let shownFraction = liveRef.current.ringFraction ?? 0;
    const ringC = 2 * Math.PI * RING_R;

    const drawVector = (t: number) => {
      const { palette: target, running: live, ringFraction: frac } = liveRef.current;
      // Iridescence — ease each gradient stop toward the phase palette.
      const targets = [target.a, target.b, target.c];
      for (let i = 0; i < 3; i++) {
        colors[i] = lerpHex(colors[i], targets[i], 0.06);
        stopRefs[i].current?.setAttribute('stop-color', colors[i]);
      }
      angle += live ? 0.34 : 0.1;
      gradRef.current?.setAttribute('gradientTransform', `rotate(${(angle % 360).toFixed(1)} ${CENTER} ${CENTER})`);

      const amp = live ? 0.085 : 0.045;
      const speed = live ? 1.05 : 0.45;
      const d = blobPath(t, amp, speed);
      blobRef.current?.setAttribute('d', d);
      glowRef.current?.setAttribute('d', d);

      if (ringRef.current) {
        shownFraction += ((frac ?? 0) - shownFraction) * 0.12;
        ringRef.current.setAttribute('stroke-dashoffset', String(ringC * (1 - shownFraction)));
      }
    };

    const drawDots = (t: number) => {
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      if (!canvas || !wrap) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const [r, g, b] = hexToRgb(liveRef.current.palette.b);
      const cx = w / 2;
      const cy = h / 2;
      const maxD = Math.hypot(cx, cy);
      const spacing = 26;
      const speed = liveRef.current.running ? 2.3 : 1.1;
      for (let y = spacing / 2; y < h; y += spacing) {
        for (let x = spacing / 2; x < w; x += spacing) {
          const dist = Math.hypot(x - cx, y - cy);
          const wave = Math.sin(dist * 0.05 - t * speed);
          const fade = 1 - Math.min(1, dist / maxD) * 0.55;
          const alpha = (0.05 + 0.075 * (wave * 0.5 + 0.5)) * fade;
          ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(x + wave * 1.4, y, 1.5, 0, 2 * Math.PI);
          ctx.fill();
        }
      }
    };

    if (reduced) {
      drawVector(0);
      drawDots(0);
      return;
    }

    let raf = 0;
    let last = 0;
    const tick = (ms: number) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden || ms - last < 33) return; // ~30fps
      last = ms;
      const t = ms / 1000;
      drawVector(t);
      drawDots(t);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flow-scene" ref={wrapRef}>
      <canvas className="flow-dots" ref={canvasRef} aria-hidden="true" />
      <svg className="flow-svg" viewBox={`0 0 ${VB} ${VB}`} aria-hidden="true">
        <defs>
          <linearGradient ref={gradRef} id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop ref={stopRefs[0]} offset="0%" stopColor={palette.a} />
            <stop ref={stopRefs[1]} offset="55%" stopColor={palette.b} />
            <stop ref={stopRefs[2]} offset="100%" stopColor={palette.c} />
          </linearGradient>
        </defs>
        {ringFraction !== null && (
          <>
            <circle cx={CENTER} cy={CENTER} r={RING_R} fill="none" stroke="rgba(18,23,41,0.07)" strokeWidth="5" />
            <circle
              ref={ringRef}
              cx={CENTER}
              cy={CENTER}
              r={RING_R}
              fill="none"
              stroke={`url(#${gid})`}
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * RING_R}
              strokeDashoffset={2 * Math.PI * RING_R * (1 - (ringFraction ?? 0))}
              transform={`rotate(-90 ${CENTER} ${CENTER})`}
            />
          </>
        )}
        <path ref={glowRef} className="flow-blob-glow" d={blobPath(0, 0.05, 0.5)} fill={`url(#${gid})`} />
        <path ref={blobRef} d={blobPath(0, 0.05, 0.5)} fill={`url(#${gid})`} />
        <circle cx={CENTER - 26} cy={CENTER - 34} r={44} fill="rgba(255,255,255,0.16)" />
      </svg>
      <div className="flow-center">{children}</div>
    </div>
  );
}

/* ── Time displays ──────────────────────────────────────────────── */

/** Endless elapsed time with ticking centiseconds — rAF writes straight to
    the DOM so the rest of the app never re-renders for it. */
export function EndlessTime({ getMs, running }: { getMs: () => number; running: boolean }) {
  const mainRef = useRef<HTMLSpanElement>(null);
  const centiRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const write = () => {
      const ms = Math.max(0, getMs());
      if (mainRef.current) mainRef.current.textContent = fmtClock(ms / 1000);
      if (centiRef.current)
        centiRef.current.textContent = String(Math.floor((ms % 1000) / 10)).padStart(2, '0');
    };
    write();
    if (!running) return;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!document.hidden) write();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [getMs, running]);

  return (
    <span className="flow-time">
      <span ref={mainRef} className="flow-mmss">0:00</span>
      <span ref={centiRef} className="flow-centi">00</span>
    </span>
  );
}

export function PhaseTime({ seconds }: { seconds: number }) {
  return (
    <span className="flow-time">
      <span className="flow-mmss">{fmtClock(seconds)}</span>
    </span>
  );
}
