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
  apple: (
    <path
      d="M16.6 12.9c0-2.1.95-3.7 2.9-4.9-1.1-1.55-2.73-2.4-4.9-2.57-1.95-.15-4.3 1.2-5.12 1.2-.87 0-2.86-1.14-4.42-1.14C2.5 5.55 0 8.05 0 13.18c0 1.53.28 3.12.84 4.75.75 2.14 3.46 7.4 6.3 7.3 1.48-.03 2.53-1.05 4.45-1.05 1.87 0 2.84 1.05 4.48 1.05 2.85-.04 5.3-4.82 6.02-6.96-3.83-1.8-3.5-5.28-3.5-5.38zM12.9 4.6c1.78-2.1 1.62-4.03 1.57-4.6-1.57.1-3.4 1.07-4.43 2.28-1.14 1.3-1.8 2.92-1.66 4.7 1.7.14 3.25-.74 4.53-2.26z"
      fill="currentColor"
      stroke="none"
      transform="scale(0.85) translate(2.5 1)"
    />
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

/* ── FlowCoin — the brand coin (gradient disc + three flowing waves) ── */

function coinWavePath(size: number, cy: number, amplitude: number, wavelength: number, phase: number): string {
  const inset = size * 0.22;
  const x0 = inset;
  const x1 = size - inset;
  let d = '';
  for (let x = x0; x <= x1; x += 1.5) {
    const y = cy + amplitude * Math.sin((x / wavelength) * 2 * Math.PI + phase);
    d += (d ? 'L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2);
  }
  return d;
}

export function FlowCoin({ size = 40, animated = false }: { size?: number; animated?: boolean }) {
  const gradId = useId();
  const refs = [useRef<SVGPathElement>(null), useRef<SVGPathElement>(null), useRef<SVGPathElement>(null)];
  const amplitude = size * 0.052;
  const wavelength = size * 0.6;
  const offsets = [-size * 0.165, 0, size * 0.165];

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
        ref.current?.setAttribute(
          'd',
          coinWavePath(size, size / 2 + offsets[i], amplitude, wavelength, phase + i * 0.7)
        );
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animated, size]);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="flow-coin">
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8F90ED" />
          <stop offset="52%" stopColor="#595BCD" />
          <stop offset="100%" stopColor="#4C4EBE" />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={size / 2 - 0.5} fill={`url(#${gradId})`} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={size / 2 - 1}
        fill="none"
        stroke="rgba(255,255,255,0.32)"
        strokeWidth={Math.max(1, size * 0.018)}
      />
      {offsets.map((off, i) => (
        <path
          key={i}
          ref={refs[i]}
          d={coinWavePath(size, size / 2 + off, amplitude, wavelength, i * 0.7)}
          fill="none"
          stroke="#fff"
          strokeOpacity={i === 1 ? 1 : 0.94}
          strokeWidth={size * 0.082}
          strokeLinecap="round"
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
