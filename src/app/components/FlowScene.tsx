import { useEffect, useRef, type ReactNode } from 'react';
import { fmtClock } from '../lib/flow';

/* The signature focus visual — a 1:1 port of the app's FlowBlob + DotGridView
   (FlowDesign.swift / EndlessFlowView.swift):

     • a dot-grid ripple field — size-pulsing dots on a slow radial wave, the
       colour easing toward the current phase (DotGridView);
     • a living, iridescent blob — Apple's 3×3 MeshGradient (9 drifting oil-slick
       colours) masked by a continuously morphing 7-lobe BlobShape, with a soft
       tinted glow behind, a rim shimmer, and a radial edge-dissolve so it melts
       into the canvas (FlowBlob);
     • a pool→orb reveal — the blob sits wide-and-flat at the bottom when dormant
       and flows up into a centred orb on first Start;
     • a slow, continuous breathing swell + drifting catch-light — a smooth
       flow rather than any per-second pulse;
     • a progress swell + break tint — in Regular mode the blob fattens as the
       phase nears its end and washes mint (short) / coral (long) on breaks.

   All motion is rAF-driven straight to two <canvas> layers and the centred
   readout's transform — no React re-renders — throttled to ~30fps, paused when
   the tab is hidden, and frozen flat under prefers-reduced-motion. */

// The app's MeshGradient palette, row-major (FlowBlob.meshColors):
//   accentDeep accent     lavender
//   accent     accentSoft mint
//   lavender   amber      accentSoft
const MESH: [number, number, number][] = [
  [0x3f, 0x3f, 0xb4], [0x59, 0x5b, 0xcd], [0xb7, 0x9e, 0xf2],
  [0x59, 0x5b, 0xcd], [0x9e, 0x9f, 0xea], [0x71, 0xbf, 0x9d],
  [0xb7, 0x9e, 0xf2], [0xf6, 0xbe, 0x73], [0x9e, 0x9f, 0xea],
];
const ACCENT: [number, number, number] = [0x59, 0x5b, 0xcd];
const ACCENT_SOFT: [number, number, number] = [0x9e, 0x9f, 0xea];

const LOBES = 7; // BlobShape.lobes
// A touch calmer than the app's 0.18 so the orb reads as a gently-breathing
// pane of liquid glass that flows rather than wobbles.
const WOBBLE = 0.14; // BlobShape.wobble

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
const rgb = (c: number[]) => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;

/* BlobShape — a smooth closed organic outline whose radius is modulated by a
   sum of out-of-phase sines, drawn through every sample with a Catmull-Rom →
   cubic-Bézier conversion (Path init(closedCatmullRomThrough:)). */
function blobPath(cx: number, cy: number, baseR: number, phase: number): Path2D {
  const pts: [number, number][] = [];
  for (let i = 0; i < LOBES; i++) {
    const a = (i / LOBES) * 2 * Math.PI;
    const wob =
      Math.sin(a * 3 + phase) * 0.5 +
      Math.sin(a * 2 - phase * 1.3) * 0.32 +
      Math.sin(a * 5 + phase * 0.7) * 0.18;
    const r = baseR * (1 + WOBBLE * wob);
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  const n = pts.length;
  const p = new Path2D();
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    p.bezierCurveTo(c1x, c1y, c2x, c2y, p2[0], p2[1]);
  }
  p.closePath();
  return p;
}

/* The 3×3 mesh whose edge midpoints and centre drift on slow, out-of-phase
   sines so the colours swirl like an oil slick (FlowBlob.meshPoints). */
function meshPoints(t: number): [number, number][] {
  const f = (base: number, amp: number, speed: number, ph: number) =>
    base + amp * Math.sin(t * speed + ph);
  return [
    [0, 0], [f(0.5, 0.1, 0.8, 0), 0], [1, 0],
    [0, f(0.5, 0.1, 0.7, 1)], [f(0.5, 0.14, 0.62, 2), f(0.5, 0.14, 0.54, 0.5)], [1, f(0.5, 0.1, 0.9, 3)],
    [0, 1], [f(0.5, 0.1, 0.85, 1.5), 1], [1, 1],
  ];
}

export function FlowScene({
  dotColor,
  tint,
  tintAmount,
  running,
  progress,
  getElapsedMs,
  children,
}: {
  /** Phase colour for the dot grid (palette.b). */
  dotColor: string;
  /** Break tint washed over the blob (mint / coral); ignored at amount 0. */
  tint: [number, number, number];
  /** 0 = pure iridescent (work / endless) · ~0.85 = tinted (breaks). */
  tintAmount: number;
  running: boolean;
  /** 0..1 — Regular phase progress for the swell; 0 in Endless. */
  progress: number;
  /** Live elapsed ms of the session — used to open a restored session already revealed. */
  getElapsedMs: () => number;
  children: ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<HTMLCanvasElement>(null);
  const blobRef = useRef<HTMLCanvasElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);

  // Live inputs for the single rAF loop (no re-subscribe on prop change).
  const live = useRef({ dotColor, tint, tintAmount, running, progress });
  live.current = { dotColor, tint, tintAmount, running, progress };

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Eased, frame-persistent state.
    // A restored / in-progress session opens already revealed; a fresh start
    // opens as the dormant pool and flows up on the first frames.
    let reveal = getElapsedMs() > 1200 ? 1 : 0;
    const curTint = live.current.tint.slice();
    let curAmount = live.current.tintAmount;
    const dotCur = hexToRgb(live.current.dotColor);

    const drawDots = (t: number) => {
      const cv = dotsRef.current;
      const wrap = wrapRef.current;
      if (!cv || !wrap) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = wrap.clientWidth;
      const H = wrap.clientHeight;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
        cv.width = Math.round(W * dpr);
        cv.height = Math.round(H * dpr);
      }
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // Crossfade the dot colour toward the phase colour.
      const tgt = hexToRgb(live.current.dotColor);
      for (let i = 0; i < 3; i++) dotCur[i] += (tgt[i] - dotCur[i]) * 0.08;
      const [r, g, b] = [Math.round(dotCur[0]), Math.round(dotCur[1]), Math.round(dotCur[2])];

      const spacing = 18;
      const dotSize = 3.6;
      const cx = W / 2;
      const cy = H * 0.45;
      const maxDist = Math.hypot(W, H) * 0.5;
      const run = live.current.running;

      for (let y = 0; y <= H + spacing; y += spacing) {
        for (let x = 0; x <= W + spacing; x += spacing) {
          const dist = Math.hypot(x - cx, y - cy);
          let mult = 1;
          let extra = 0;
          if (run) {
            const wave = Math.sin(dist / 60 - t * 1.8);
            mult = 1 + wave * 0.35;
            extra = wave * 0.04;
          }
          const fade = Math.max(0.04, 0.2 - (dist / maxDist) * 0.16) + extra;
          const s = (dotSize * mult) / 2;
          ctx.fillStyle = `rgba(${r},${g},${b},${fade.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(x, y, s, 0, 2 * Math.PI);
          ctx.fill();
        }
      }
    };

    const drawBlob = (t: number) => {
      const cv = blobRef.current;
      const wrap = wrapRef.current;
      if (!cv || !wrap) return;
      const dpr = Math.min(1.75, window.devicePixelRatio || 1);
      const W = wrap.clientWidth;
      const H = wrap.clientHeight;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
        cv.width = Math.round(W * dpr);
        cv.height = Math.round(H * dpr);
      }
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const { running: run, progress: prog, tint: tgtTint, tintAmount: tgtAmt } = live.current;

      // Ease reveal → 1, and the tint/amount toward their phase targets.
      reveal += (1 - reveal) * 0.06;
      for (let i = 0; i < 3; i++) curTint[i] += (tgtTint[i] - curTint[i]) * 0.08;
      curAmount += (tgtAmt - curAmount) * 0.08;

      // No per-second beat — just a slow, continuous breathing swell so the orb
      // gently flows in and out (≈11 s cycle) rather than throbbing. A second,
      // slower sine drives a smooth highlight shimmer below.
      const breathe = run ? 0.02 * Math.sin(t * 0.55) : 0;
      const beat = 1 + breathe;
      const shimmer = run ? 0.5 + 0.5 * Math.sin(t * 0.5) : 0.5; // 0..1, smooth

      const cx = W / 2;
      const cy = H / 2;
      const D = Math.min(W, H) * 0.66; // blob core diameter

      // Reveal squash (wide pool → round orb) × progress swell × beat, then a
      // downward offset so the dormant pool rests low in the frame.
      const swell = 1 + 0.45 * prog;
      const sx = (1.7 - 0.7 * reveal) * swell * beat;
      const sy = (0.4 + 0.6 * reveal) * swell * beat;
      const offY = (1 - reveal) * H * 0.34;

      // Keep the centred readout in lock-step with the blob's reveal.
      if (centerRef.current) {
        centerRef.current.style.opacity = String(Math.min(1, reveal * 1.1));
        centerRef.current.style.transform = `scale(${(0.86 + 0.14 * reveal).toFixed(3)})`;
      }

      ctx.save();
      ctx.translate(cx, cy + offY);
      ctx.scale(sx, sy);
      ctx.translate(-cx, -cy);
      ctx.globalAlpha = run ? 1 : 0.72;

      const phase = t; // ~1 rad/s morph, as in the app's TimelineView phase
      const sil = blobPath(cx, cy, D * 0.5, phase); // the glass silhouette, reused
      const lit = run ? 1 : 0.7;

      // A) Contact shadow — a soft cool shadow under the orb so the glass reads
      //    as a real, lifted object over the canvas rather than a flat wash.
      ctx.save();
      ctx.filter = `blur(${(D * 0.1).toFixed(1)}px)`;
      ctx.globalAlpha = lit * 0.16;
      ctx.fillStyle = 'rgb(46,38,92)';
      ctx.translate(0, D * 0.05);
      ctx.fill(sil);
      ctx.restore();

      // B) Colour bloom — a soft saturated halo around the glass, with just
      //    enough spread to give the edge a gentle haze; drifts on a slow shimmer.
      const glowCol = curAmount > 0.02 ? curTint : ACCENT;
      ctx.save();
      ctx.filter = `blur(${(D * 0.17).toFixed(1)}px)`;
      ctx.globalAlpha = lit * (0.66 + 0.06 * shimmer);
      ctx.fillStyle = rgb(glowCol);
      ctx.fill(blobPath(cx, cy, D * 0.5 * 0.98, phase * 0.9 + 0.6));
      ctx.restore();

      // C) Mesh core — the iridescent oil-slick: 9 drifting radial stops over a
      //    light centre (so dark numerals stay legible), softly blurred to fuse.
      ctx.save();
      ctx.filter = `blur(${(D * 0.03).toFixed(1)}px)`;
      ctx.clip(sil);
      const mp = meshPoints(t);
      const x0 = cx - D * 0.62;
      const y0 = cy - D * 0.62;
      const span = D * 1.24;
      const radius = D * 0.62;
      ctx.fillStyle = rgb(ACCENT_SOFT);
      ctx.fillRect(cx - D, cy - D, D * 2, D * 2);
      for (let i = 0; i < 9; i++) {
        const px = x0 + mp[i][0] * span;
        const py = y0 + mp[i][1] * span;
        const c = MESH[i];
        const grad = ctx.createRadialGradient(px, py, 0, px, py, radius);
        grad.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},0.95)`);
        grad.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(cx - D, cy - D, D * 2, D * 2);
      }
      // Break tint — recolour the living mesh toward mint / coral (blendMode .color).
      if (curAmount > 0.02) {
        ctx.globalCompositeOperation = 'color';
        ctx.globalAlpha = lit * curAmount;
        ctx.fillStyle = rgb(curTint);
        ctx.fillRect(cx - D, cy - D, D * 2, D * 2);
      }
      ctx.restore();

      // D) Glass body — depth shading + specular gloss, clipped to the orb. This
      //    is the Liquid-Glass read: a lit top, a deepened base for volume, and a
      //    glossy reflection + catch-light that drift on a slow shimmer.
      ctx.save();
      ctx.clip(sil);
      const depth = ctx.createLinearGradient(cx, cy - D * 0.5, cx, cy + D * 0.55);
      depth.addColorStop(0, 'rgba(255,255,255,0.14)');
      depth.addColorStop(0.45, 'rgba(255,255,255,0)');
      depth.addColorStop(1, 'rgba(30,22,70,0.20)');
      ctx.fillStyle = depth;
      ctx.fillRect(cx - D, cy - D, D * 2, D * 2);
      // Glossy reflection — soft, upper-left, additive. Its centre drifts on a
      // slow sine so the catch-light glides across the glass: a smooth flow,
      // never a flash.
      ctx.globalCompositeOperation = 'screen';
      const hx = cx - D * 0.13 + D * 0.05 * Math.sin(t * 0.35);
      const hy = cy - D * 0.27 + D * 0.035 * Math.cos(t * 0.3);
      const gloss = ctx.createRadialGradient(hx, hy, 0, hx, hy, D * 0.46);
      gloss.addColorStop(0, `rgba(255,255,255,${(0.4 + 0.08 * shimmer).toFixed(3)})`);
      gloss.addColorStop(0.55, 'rgba(255,255,255,0.06)');
      gloss.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gloss;
      ctx.fillRect(cx - D, cy - D, D * 2, D * 2);
      // Catch-light — a small bright glint that drifts with the reflection.
      ctx.globalCompositeOperation = 'source-over';
      const kx = cx - D * 0.22 + D * 0.045 * Math.sin(t * 0.35);
      const ky = cy - D * 0.34 + D * 0.03 * Math.cos(t * 0.3);
      const spark = ctx.createRadialGradient(kx, ky, 0, kx, ky, D * 0.13);
      spark.addColorStop(0, `rgba(255,255,255,${(0.58 + 0.08 * shimmer).toFixed(3)})`);
      spark.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = spark;
      ctx.fillRect(cx - D, cy - D, D * 2, D * 2);
      ctx.restore();

      // E) Lit rim — a bright specular highlight catching the upper-left edge and
      //    fading to nothing on the shadowed side: the signature glass-edge gleam.
      ctx.save();
      ctx.filter = `blur(${(D * 0.006).toFixed(1)}px)`;
      const rimGrad = ctx.createLinearGradient(
        cx - D * 0.5,
        cy - D * 0.5,
        cx + D * 0.4,
        cy + D * 0.42
      );
      rimGrad.addColorStop(0, `rgba(255,255,255,${(0.9 * lit).toFixed(3)})`);
      rimGrad.addColorStop(0.32, 'rgba(255,255,255,0.14)');
      rimGrad.addColorStop(0.62, 'rgba(255,255,255,0)');
      ctx.strokeStyle = rimGrad;
      ctx.lineWidth = 2.4;
      ctx.stroke(sil);
      ctx.restore();

      // F) Iridescent rim whisper — keeps the app's soft dispersion all round.
      ctx.save();
      ctx.filter = `blur(${(D * 0.014).toFixed(1)}px)`;
      ctx.globalAlpha = lit * 0.5;
      ctx.strokeStyle = `rgba(${ACCENT_SOFT.join(',')},0.5)`;
      ctx.lineWidth = 1.5;
      ctx.stroke(sil);
      ctx.restore();

      // G) Edge feather — a soft falloff that keeps the silhouette a defined
      //    glass orb but lets the rim melt a little foggily into the dot grid.
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = 1;
      const diss = ctx.createRadialGradient(cx, cy, 0, cx, cy, D * 1.18);
      diss.addColorStop(0, 'rgba(0,0,0,0)');
      diss.addColorStop(0.4, 'rgba(0,0,0,0)');
      diss.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.fillStyle = diss;
      ctx.fillRect(cx - D * 1.6, cy - D * 1.6, D * 3.2, D * 3.2);
      ctx.globalCompositeOperation = 'source-over';

      ctx.restore();
    };

    if (reduced) {
      reveal = getElapsedMs() > 0 || live.current.running ? 1 : 0;
      if (centerRef.current) {
        centerRef.current.style.opacity = String(reveal);
        centerRef.current.style.transform = `scale(${0.86 + 0.14 * reveal})`;
      }
      drawDots(0);
      drawBlob(0);
      return;
    }

    let raf = 0;
    let lastFrame = 0;
    const tick = (ms: number) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden || ms - lastFrame < 33) return; // ~30fps
      lastFrame = ms;
      const t = ms / 1000;
      drawDots(t);
      drawBlob(t);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flow-scene" ref={wrapRef}>
      <canvas className="flow-dots" ref={dotsRef} aria-hidden="true" />
      <canvas className="flow-blob" ref={blobRef} aria-hidden="true" />
      <div className="flow-center" ref={centerRef}>
        {children}
      </div>
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
        centiRef.current.textContent = '.' + String(Math.floor((ms % 1000) / 10)).padStart(2, '0');
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
      <span ref={mainRef} className="flow-mmss">00:00</span>
      <span ref={centiRef} className="flow-centi">.00</span>
    </span>
  );
}

/** Regular countdown with ticking centiseconds — like the app's RegularFlowView,
    rAF-driven straight to the DOM. Clock + centis derive from one value so they
    stay in lock-step (timeParts). */
export function PhaseTime({ getSeconds, running }: { getSeconds: () => number; running: boolean }) {
  const mainRef = useRef<HTMLSpanElement>(null);
  const centiRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const write = () => {
      const totalCentis = Math.max(0, Math.ceil(getSeconds() * 100));
      const secs = Math.floor(totalCentis / 100);
      if (mainRef.current)
        mainRef.current.textContent = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(
          secs % 60
        ).padStart(2, '0')}`;
      if (centiRef.current)
        centiRef.current.textContent = '.' + String(totalCentis % 100).padStart(2, '0');
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
  }, [getSeconds, running]);

  return (
    <span className="flow-time">
      <span ref={mainRef} className="flow-mmss">00:00</span>
      <span ref={centiRef} className="flow-centi">.00</span>
    </span>
  );
}
