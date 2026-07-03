import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useToasts } from '../lib/store';

/* ── Icons — consistent 24×24 stroke set ─────────────────────────── */

const ICON_PATHS: Record<string, ReactNode> = {
  sun: (
    <>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.2" y="4.8" width="17.6" height="16" rx="4" />
      <path d="M3.2 9.8h17.6M8 2.8v4M16 2.8v4" />
    </>
  ),
  book: (
    <>
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H20v15.5H6.5A2.5 2.5 0 0 0 4 22z" />
      <path d="M4 19.5V6.5M20 19.5H6.5A2.5 2.5 0 0 0 4 22" />
      <path d="M8.5 8.5h7" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.2" r="3.8" />
      <path d="M4.5 20.4c1.2-3.6 4-5.4 7.5-5.4s6.3 1.8 7.5 5.4" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="M4.5 12.5l5 5L19.5 7" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  chevronLeft: <path d="M14.5 5.5L8 12l6.5 6.5" />,
  chevronRight: <path d="M9.5 5.5L16 12l-6.5 6.5" />,
  chevronDown: <path d="M5.5 9.5L12 16l6.5-6.5" />,
  trash: (
    <>
      <path d="M4.5 6.5h15M9.5 6V4.5A1.5 1.5 0 0 1 11 3h2a1.5 1.5 0 0 1 1.5 1.5V6" />
      <path d="M6.5 6.5l.8 12A2.5 2.5 0 0 0 9.8 21h4.4a2.5 2.5 0 0 0 2.5-2.5l.8-12" />
      <path d="M10 10.5v6M14 10.5v6" />
    </>
  ),
  pencil: (
    <>
      <path d="M4 20l.9-3.8L16.4 4.7a2 2 0 0 1 2.9 0l.1.1a2 2 0 0 1 0 2.9L7.8 19.1z" />
      <path d="M14.5 6.5l3 3" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.8" />
      <path d="M12 7.2V12l3.2 2" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21.5s-7-5.8-7-11a7 7 0 0 1 14 0c0 5.2-7 11-7 11z" />
      <circle cx="12" cy="10.2" r="2.4" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 4l1.7 4.3L18 10l-4.3 1.7L12 16l-1.7-4.3L6 10l4.3-1.7z" />
      <path d="M18.5 15.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" />
    </>
  ),
  logout: (
    <>
      <path d="M14.5 8V5.5A1.5 1.5 0 0 0 13 4H6.5A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20H13a1.5 1.5 0 0 0 1.5-1.5V16" />
      <path d="M10 12h10.5M17 8.5l3.5 3.5-3.5 3.5" />
    </>
  ),
  external: (
    <>
      <path d="M10 5H6.5A2.5 2.5 0 0 0 4 7.5v10A2.5 2.5 0 0 0 6.5 20h10a2.5 2.5 0 0 0 2.5-2.5V14" />
      <path d="M14 4h6v6M20 4l-9 9" />
    </>
  ),
  dots: (
    <>
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  gradcap: (
    <>
      <path d="M2.5 9.5L12 4.5l9.5 5L12 14.5z" />
      <path d="M6.5 12v4.4c0 1.2 2.5 2.6 5.5 2.6s5.5-1.4 5.5-2.6V12M21.5 9.5V15" />
    </>
  ),
  flag: (
    <>
      <path d="M5.5 21V4" />
      <path d="M5.5 4.8c2.2-1.3 4.2-1.3 6.4 0s4.2 1.3 6.4 0v8.4c-2.2 1.3-4.2 1.3-6.4 0s-4.2-1.3-6.4 0" />
    </>
  ),
  undo: (
    <>
      <path d="M8.5 5.5L4.5 9.5l4 4" />
      <path d="M4.5 9.5h9a6 6 0 0 1 0 12H10" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3.5l9.3 16.1a.6.6 0 0 1-.5.9H3.2a.6.6 0 0 1-.5-.9z" />
      <path d="M12 9.5v4.5M12 17.2v.4" />
    </>
  ),
  star: (
    <path d="M12 3.6l2.5 5.2 5.7.7-4.2 3.9 1.1 5.6-5.1-2.8-5.1 2.8 1.1-5.6-4.2-3.9 5.7-.7z" />
  ),
  waves: (
    <path d="M3 7.8c3-2.4 6-2.4 9 0s6 2.4 9 0M3 12.4c3-2.4 6-2.4 9 0s6 2.4 9 0M3 17c3-2.4 6-2.4 9 0s6 2.4 9 0" />
  ),
  infinity: (
    <path d="M6.5 7.8a4.2 4.2 0 1 0 0 8.4c2.4 0 3.8-1.9 5.5-4.2 1.7-2.3 3.1-4.2 5.5-4.2a4.2 4.2 0 1 1 0 8.4c-2.4 0-3.8-1.9-5.5-4.2C10.3 9.7 8.9 7.8 6.5 7.8Z" />
  ),
  flame: (
    <path
      d="M12 2s4 4 4 8a4 4 0 0 1-8 0c0-1 .5-2 .5-2S6 11 6 14a6 6 0 0 0 12 0c0-5-6-12-6-12z"
      fill="currentColor"
      stroke="none"
    />
  ),
  sound: (
    <>
      <path d="M4.5 9.6v4.8h3.2L12 18.4V5.6L7.7 9.6z" />
      <path d="M15.2 9.3c1.5 1.6 1.5 3.8 0 5.4M17.9 6.7c2.8 2.9 2.8 7.7 0 10.6" />
    </>
  ),
  soundOff: (
    <>
      <path d="M4.5 9.6v4.8h3.2L12 18.4V5.6L7.7 9.6z" />
      <path d="M15.5 9.5l5 5M20.5 9.5l-5 5" />
    </>
  ),
  play: <path d="M8 5.2v13.6L19 12z" />,
  pause: <path d="M8.2 5.5v13M15.8 5.5v13" />,
  stop: <rect x="6.5" y="6.5" width="11" height="11" rx="2.4" />,
  minus: <path d="M5 12h14" />,
  brain: (
    <>
      <path d="M12 6a2.6 2.6 0 0 0-4.8-1.1A2.7 2.7 0 0 0 4.7 8.4a2.8 2.8 0 0 0 .2 4.2A2.5 2.5 0 0 0 7 17a2.5 2.5 0 0 0 5 .2z" />
      <path d="M12 6a2.6 2.6 0 0 1 4.8-1.1A2.7 2.7 0 0 1 19.3 8.4a2.8 2.8 0 0 1-.2 4.2A2.5 2.5 0 0 1 17 17a2.5 2.5 0 0 1-5 .2z" />
    </>
  ),
  coffee: (
    <>
      <path d="M5 8.5h11v4.5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z" />
      <path d="M16 9.5h1.8a2.2 2.2 0 0 1 0 4.4H16" />
      <path d="M5 21h11" />
    </>
  ),
  sofa: (
    <>
      <path d="M5 11V9a2.5 2.5 0 0 1 2.5-2.5h9A2.5 2.5 0 0 1 19 9v2" />
      <path d="M3.5 14.5a2 2 0 0 1 4 0V16h9v-1.5a2 2 0 1 1 4 0V19h-17z" />
      <path d="M6.5 19v1.6M17.5 19v1.6" />
    </>
  ),
  repeat: (
    <>
      <path d="M16.5 4 19.5 7l-3 3" />
      <path d="M19.5 7H8.5a4 4 0 0 0-4 4v.5" />
      <path d="M7.5 20 4.5 17l3-3" />
      <path d="M4.5 17h11a4 4 0 0 0 4-4v-.5" />
    </>
  ),
  apple: (
    <path
      d="M16.6 12.9c0-2.1.95-3.7 2.9-4.9-1.1-1.55-2.73-2.4-4.9-2.57-1.95-.15-4.3 1.2-5.12 1.2-.87 0-2.86-1.14-4.42-1.14C2.5 5.55 0 8.05 0 13.18c0 1.53.28 3.12.84 4.75.75 2.14 3.46 7.4 6.3 7.3 1.48-.03 2.53-1.05 4.45-1.05 1.87 0 2.84 1.05 4.48 1.05 2.85-.04 5.3-4.82 6.02-6.96-3.83-1.8-3.5-5.28-3.5-5.38zM12.9 4.6c1.78-2.1 1.62-4.03 1.57-4.6-1.57.1-3.4 1.07-4.43 2.28-1.14 1.3-1.8 2.92-1.66 4.7 1.7.14 3.25-.74 4.53-2.26z"
      fill="currentColor"
      stroke="none"
      transform="scale(0.85) translate(2.5 1)"
    />
  ),
  /* iOS parity set — house.fill, book.fill, gearshape, person.crop.circle,
     calendar.badge.plus, checklist, exclamationmark.circle, sun.max,
     checkmark.circle, briefcase.fill, mappin.and.ellipse, arrow.clockwise,
     rectangle.stack, arrow.right, lock.shield, list of guided tasks. */
  house: (
    <path
      d="M12 3.2l8.2 6.9a1.4 1.4 0 0 1 .5 1.07v8.03a1.8 1.8 0 0 1-1.8 1.8h-3.6a1 1 0 0 1-1-1v-4.3a2.3 2.3 0 0 0-4.6 0V20a1 1 0 0 1-1 1H5.1a1.8 1.8 0 0 1-1.8-1.8v-8.03a1.4 1.4 0 0 1 .5-1.07z"
      fill="currentColor"
      stroke="none"
    />
  ),
  bookFill: (
    <path
      d="M4 6.3A2.8 2.8 0 0 1 6.8 3.5H19a1 1 0 0 1 1 1v12.2a1 1 0 0 1-1 1H6.8c-.66 0-1.26.23-1.75.6-.44.35-1.05.06-1.05-.5zm2.8 13.4h12.4a.9.9 0 0 1 0 1.8H6.6a2.6 2.6 0 0 1-2.55-2.1c.63.2 1.6.3 2.75.3z"
      fill="currentColor"
      stroke="none"
    />
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M12 2.9l1 2.3a7 7 0 0 1 2.1.87l2.4-.83 1.26 2.18-1.62 1.93c.17.66.26 1.35.26 2.05l1.9 1.55-1.26 2.18-2.46-.5a7 7 0 0 1-1.58 1.4l.06 2.5-2.52.44-.96-2.32a7 7 0 0 1-2.1-.36l-1.9 1.63-1.93-1.63 1.06-2.27a7 7 0 0 1-1.06-1.83l-2.48-.4V9.9l2.4-.55c.24-.68.58-1.32 1-1.9L4.6 5.2l1.93-1.63 2.1 1.4a7 7 0 0 1 1.94-.68z" />
    </>
  ),
  userCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="9.6" r="3" fill="currentColor" stroke="none" />
      <path
        d="M5.9 18.6c1.1-2.6 3.3-4 6.1-4s5 1.4 6.1 4a9 9 0 0 1-12.2 0z"
        fill="currentColor"
        stroke="none"
      />
    </>
  ),
  calendarPlus: (
    <>
      <path d="M20.8 10.5V8.8a4 4 0 0 0-4-4H7.2a4 4 0 0 0-4 4v8a4 4 0 0 0 4 4h5.3" />
      <path d="M3.2 9.8h17.6M8 2.8v4M16 2.8v4" />
      <path d="M18.5 14.5v6M15.5 17.5h6" />
    </>
  ),
  checklist: (
    <>
      <path d="M3.5 6.5l1.6 1.6 3-3.2" />
      <path d="M11.5 7h9" />
      <path d="M3.5 15.5l1.6 1.6 3-3.2" />
      <path d="M11.5 16h9" />
    </>
  ),
  alertCircle: (
    <>
      <circle cx="12" cy="12" r="8.8" />
      <path d="M12 7.6v5M12 15.9v.4" />
    </>
  ),
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="8.8" />
      <path d="M8.2 12.4l2.6 2.6 5-5.6" />
    </>
  ),
  briefcase: (
    <path
      d="M9 6.2V5.4A2.4 2.4 0 0 1 11.4 3h1.2A2.4 2.4 0 0 1 15 5.4v.8h3.2a2.8 2.8 0 0 1 2.8 2.8v8.2a2.8 2.8 0 0 1-2.8 2.8H5.8A2.8 2.8 0 0 1 3 17.2V9a2.8 2.8 0 0 1 2.8-2.8zm1.8 0h2.4v-.8a.6.6 0 0 0-.6-.6h-1.2a.6.6 0 0 0-.6.6z"
      fill="currentColor"
      stroke="none"
    />
  ),
  mapPin: (
    <>
      <path d="M12 21.5s-7-5.8-7-11a7 7 0 0 1 14 0c0 5.2-7 11-7 11z" />
      <circle cx="12" cy="10.2" r="2.4" />
    </>
  ),
  restart: (
    <>
      <path d="M19.8 12a7.8 7.8 0 1 1-2.3-5.5" />
      <path d="M18 2.8v3.9h-3.9" />
    </>
  ),
  layers: (
    <>
      <rect x="5" y="4" width="14" height="10" rx="2.4" />
      <path d="M6.4 17h11.2M7.8 20h8.4" />
    </>
  ),
  arrowRight: <path d="M4.5 12h15M13.5 6l6 6-6 6" />,
  bolt: (
    <path
      d="M13.2 2.5L5 13.4h5.2L9.6 21.5l8.4-11.4h-5.3z"
      fill="currentColor"
      stroke="none"
    />
  ),
  crown: (
    <path
      d="M3 8.2l4.4 3.4L12 5.2l4.6 6.4L21 8.2l-1.6 9.3a1.6 1.6 0 0 1-1.58 1.3H6.18a1.6 1.6 0 0 1-1.58-1.3z"
      fill="currentColor"
      stroke="none"
    />
  ),
  bell: (
    <>
      <path d="M12 3.2a6 6 0 0 1 6 6v3.2l1.5 3a1 1 0 0 1-.9 1.4H5.4a1 1 0 0 1-.9-1.4l1.5-3V9.2a6 6 0 0 1 6-6z" />
      <path d="M9.8 19.8a2.3 2.3 0 0 0 4.4 0" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l7 2.6v5.2c0 4.6-2.9 8.2-7 10.2-4.1-2-7-5.6-7-10.2V5.6z" />
      <rect x="9.4" y="10" width="5.2" height="4.6" rx="1.2" />
      <path d="M10.6 10V8.8a1.4 1.4 0 0 1 2.8 0V10" />
    </>
  ),
};

export function Icon({
  name,
  size = 20,
  strokeWidth = 1.8,
  className,
}: {
  name: string;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {ICON_PATHS[name] ?? null}
    </svg>
  );
}

/* ── FlowMark / FlowCoin — the brand glyph (three flowing sine waves) ──
   Exact port of FlowDesign.swift's FlowMark: rows at ±0.165·S with the middle
   row widest (0.155–0.845 vs 0.20–0.80), centered sine, one shared phase that
   loops every 4 s at ≤30 fps. */

const MARK_ROWS: { off: number; x0: number; x1: number; alpha: number }[] = [
  { off: -0.165, x0: 0.2, x1: 0.8, alpha: 0.96 },
  { off: 0, x0: 0.155, x1: 0.845, alpha: 1 },
  { off: 0.165, x0: 0.2, x1: 0.8, alpha: 0.96 },
];

function markWavePath(size: number, row: (typeof MARK_ROWS)[number], phase: number): string {
  const amp = size * 0.052;
  const wavelength = size * 0.6;
  const cy = size / 2 + row.off * size;
  let d = '';
  for (let x = row.x0 * size; x <= row.x1 * size; x += 1.5) {
    const y = cy + amp * Math.sin(((x - size / 2) / wavelength) * 2 * Math.PI + phase);
    d += (d ? 'L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2);
  }
  return d;
}

function useMarkAnimation(size: number, animated: boolean) {
  const refs = [useRef<SVGPathElement>(null), useRef<SVGPathElement>(null), useRef<SVGPathElement>(null)];
  useEffect(() => {
    if (!animated) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden || t - last < 33) return;
      last = t;
      const phase = (t / 1000) * ((2 * Math.PI) / 4); // full cycle every 4s
      refs.forEach((ref, i) => {
        ref.current?.setAttribute('d', markWavePath(size, MARK_ROWS[i], phase));
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animated, size]);
  return refs;
}

/** Bare three-wave mark (no coin) — the shell's Flow button glyph. */
export function FlowMark({
  size = 40,
  color = '#475CD1',
  animated = false,
}: {
  size?: number;
  color?: string;
  animated?: boolean;
}) {
  const refs = useMarkAnimation(size, animated);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="flow-mark">
      {MARK_ROWS.map((row, i) => (
        <path
          key={i}
          ref={refs[i]}
          d={markWavePath(size, row, 0)}
          fill="none"
          stroke={color}
          strokeOpacity={row.alpha}
          strokeWidth={size * 0.082}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

export function FlowCoin({ size = 40, animated = false }: { size?: number; animated?: boolean }) {
  const gradId = useId();
  const refs = useMarkAnimation(size, animated);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="flow-coin">
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8F90ED" />
          <stop offset="52%" stopColor="#595BCD" />
          <stop offset="100%" stopColor="#4C4EBE" />
        </linearGradient>
        <linearGradient id={`${gradId}-rim`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.35)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.10)" />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={size / 2 - 0.5} fill={`url(#${gradId})`} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={size / 2 - 1}
        fill="none"
        stroke={`url(#${gradId}-rim)`}
        strokeWidth={Math.max(1, size * 0.012)}
      />
      {MARK_ROWS.map((row, i) => (
        <path
          key={i}
          ref={refs[i]}
          d={markWavePath(size, row, 0)}
          fill="none"
          stroke="#fff"
          strokeOpacity={row.alpha}
          strokeWidth={size * 0.082}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

/* ── Progress ring ──────────────────────────────────────────────── */

export function ProgressRing({
  size = 56,
  stroke = 5,
  progress,
  color = 'var(--accent)',
  track = 'rgba(89,91,205,0.12)',
  children,
}: {
  size?: number;
  stroke?: number;
  progress: number; // 0…1
  color?: string;
  track?: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(1, Math.max(0, progress));
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="ring-fg"
        />
      </svg>
      {children ? <div className="ring-center">{children}</div> : null}
    </div>
  );
}

/* ── Overlay portal — full-screen surfaces escape any transformed ancestor ── */

export function Overlay({ children }: { children: ReactNode }) {
  return createPortal(children, document.body);
}

/* ── Modal (bottom sheet on small screens, centered card on desktop) ── */

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('modal-open');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('modal-open');
    };
  }, [onClose]);

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal-card glass${wide ? ' modal-wide' : ''}`} role="dialog" aria-modal="true">
        {title !== undefined && (
          <div className="modal-head">
            <div className="modal-title">{title}</div>
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              <Icon name="x" size={17} />
            </button>
          </div>
        )}
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body
  );
}

/* ── Toasts ─────────────────────────────────────────────────────── */

export function Toasts() {
  const { toasts, dismiss } = useToasts();
  if (toasts.length === 0) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast glass">
          <span>{t.message}</span>
          {t.undo && (
            <button
              className="toast-undo"
              onClick={() => {
                t.undo?.();
                dismiss(t.id);
              }}
            >
              <Icon name="undo" size={14} /> Undo
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Empty state ────────────────────────────────────────────────── */

export function EmptyState({
  icon,
  title,
  sub,
  action,
}: {
  icon: string;
  title: string;
  sub?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty glass">
      <div className="empty-ico">
        <Icon name={icon} size={26} strokeWidth={1.6} />
      </div>
      <div className="empty-title">{title}</div>
      {sub && <div className="empty-sub">{sub}</div>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

/* ── Avatar ─────────────────────────────────────────────────────── */

export function Avatar({
  url,
  name,
  size = 34,
}: {
  url: string | null | undefined;
  name: string | null | undefined;
  size?: number;
}) {
  const initial = (name || 'S').trim().charAt(0).toUpperCase();
  const style: CSSProperties = { width: size, height: size, fontSize: size * 0.42 };
  return (
    <span className="sf-avatar" style={style}>
      {url ? <img src={url} alt="" loading="lazy" /> : initial}
    </span>
  );
}

/* ── Splash / loading ───────────────────────────────────────────── */

export function Splash({ label }: { label?: string }) {
  return (
    <div className="splash">
      <div className="splash-coin">
        <FlowCoin size={64} animated />
      </div>
      {label && <div className="splash-label">{label}</div>}
    </div>
  );
}
