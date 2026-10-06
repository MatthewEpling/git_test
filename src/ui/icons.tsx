// Inline SVG icons (stroke-based, 24px grid).
import type { SVGProps } from 'react';

const base = (props: SVGProps<SVGSVGElement>) => ({
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...props,
});

type P = SVGProps<SVGSVGElement>;
export const Icon = {
  Play: (p: P) => (
    <svg {...base(p)}>
      <path d="M7 4.5v15l12-7.5z" fill="currentColor" />
    </svg>
  ),
  Pause: (p: P) => (
    <svg {...base(p)}>
      <path d="M8 5v14M16 5v14" />
    </svg>
  ),
  Save: (p: P) => (
    <svg {...base(p)}>
      <path d="M5 3h11l3 3v15H5z" />
      <path d="M8 3v6h8V3M8 21v-7h8v7" />
    </svg>
  ),
  Load: (p: P) => (
    <svg {...base(p)}>
      <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
    </svg>
  ),
  Forward: (p: P) => (
    <svg {...base(p)}>
      <path d="M4 6l8 6-8 6zM12 6l8 6-8 6z" fill="currentColor" />
    </svg>
  ),
  Camera: (p: P) => (
    <svg {...base(p)}>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  ),
  Users: (p: P) => (
    <svg {...base(p)}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c2 .6 3.2 2.5 3.5 5.5" />
    </svg>
  ),
  Trophy: (p: P) => (
    <svg {...base(p)}>
      <path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4.5a3 3 0 0 0 3.5 4M16 6h3.5a3 3 0 0 1-3.5 4M12 13v4M8 21h8M9 17h6v4H9z" />
    </svg>
  ),
  Settings: (p: P) => (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
    </svg>
  ),
  Fullscreen: (p: P) => (
    <svg {...base(p)}>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </svg>
  ),
  Close: (p: P) => (
    <svg {...base(p)}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  Exit: (p: P) => (
    <svg {...base(p)}>
      <path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11" />
    </svg>
  ),
  Reset: (p: P) => (
    <svg {...base(p)}>
      <path d="M4 12a8 8 0 1 0 2.3-5.7M4 4v5h5" />
    </svg>
  ),
  Disc: (p: P) => (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 3a9 9 0 0 1 9 9" opacity="0.5" />
    </svg>
  ),
  Menu: (p: P) => (
    <svg {...base(p)}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  ),
  More: (p: P) => (
    <svg {...base(p)}>
      <circle cx="5" cy="12" r="1.3" fill="currentColor" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" />
      <circle cx="19" cy="12" r="1.3" fill="currentColor" />
    </svg>
  ),
  Folder: (p: P) => (
    <svg {...base(p)}>
      <path d="M3 6h6l2 2h10v11H3z" />
    </svg>
  ),
  File: (p: P) => (
    <svg {...base(p)}>
      <path d="M6 3h8l4 4v14H6zM14 3v4h4" />
    </svg>
  ),
  Gamepad: (p: P) => (
    <svg {...base(p)}>
      <path d="M7 8h10a5 5 0 0 1 4.6 6.9l-1 2.4A2.5 2.5 0 0 1 16.3 18l-1.8-2h-5l-1.8 2a2.5 2.5 0 0 1-4.3-.7l-1-2.4A5 5 0 0 1 7 8z" />
      <path d="M8 11v3M6.5 12.5h3M15 11.5h.01M17 13.5h.01" />
    </svg>
  ),
  Volume: (p: P) => (
    <svg {...base(p)}>
      <path d="M4 9h4l5-4v14l-5-4H4zM17 9a4 4 0 0 1 0 6" />
    </svg>
  ),
  Mute: (p: P) => (
    <svg {...base(p)}>
      <path d="M4 9h4l5-4v14l-5-4H4zM17 9l5 5M22 9l-5 5" />
    </svg>
  ),
  Copy: (p: P) => (
    <svg {...base(p)}>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
    </svg>
  ),
  Lock: (p: P) => (
    <svg {...base(p)}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  ),
};

export function Logo(props: P) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" {...props}>
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffb07a" />
          <stop offset="1" stopColor="#ff6a2e" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="13.5" fill="none" stroke="url(#lg)" strokeWidth="3" />
      <path d="M16 7.5a8.5 8.5 0 1 1-8.5 8.5" fill="none" stroke="#5aa9ff" strokeWidth="3" strokeLinecap="round" />
      <circle cx="16" cy="16" r="3" fill="#edf0f7" />
    </svg>
  );
}
