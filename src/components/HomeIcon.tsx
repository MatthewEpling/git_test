import type { HomeStyle } from '../types';

const INK = '#3b2a1e';

export function HomeIcon({ style, door, size = 64 }: { style: HomeStyle; door: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" className="tc-home-icon">
      <ellipse cx="50" cy="93" rx="38" ry="5" fill={INK} opacity="0.12" />
      {style === 'mushroom' && (
        <g>
          <rect x="30" y="50" width="40" height="42" rx="10" fill="#fbf0dc" stroke={INK} strokeWidth="3" />
          <path d="M8 54C10 24 30 10 50 10s40 14 42 44Z" fill="#d9583b" stroke={INK} strokeWidth="3" />
          <circle cx="30" cy="34" r="6" fill="#fff6e6" />
          <circle cx="58" cy="24" r="5" fill="#fff6e6" />
          <circle cx="74" cy="42" r="4" fill="#fff6e6" />
          <rect x="43" y="66" width="14" height="26" rx="7" fill={door} stroke={INK} strokeWidth="2.5" />
          <circle cx="62" cy="64" r="4" fill="#fbe7a1" stroke={INK} strokeWidth="2" />
        </g>
      )}
      {style === 'teapot' && (
        <g>
          <path d="M84 50c10 0 10 20-4 22" fill="none" stroke={INK} strokeWidth="3" />
          <path d="M18 56 4 40" stroke={INK} strokeWidth="6" strokeLinecap="round" />
          <path d="M18 56 4 40" stroke="#8ec5d6" strokeWidth="3" strokeLinecap="round" />
          <ellipse cx="50" cy="62" rx="36" ry="30" fill="#8ec5d6" stroke={INK} strokeWidth="3" />
          <path d="M28 36q22-14 44 0" fill="#7bb1c2" stroke={INK} strokeWidth="3" />
          <circle cx="50" cy="24" r="5" fill="#f2c85b" stroke={INK} strokeWidth="2.5" />
          <path d="M44 92V74a6 6 0 0 1 12 0v18" fill={door} stroke={INK} strokeWidth="2.5" />
          <circle cx="30" cy="62" r="5" fill="#fbe7a1" stroke={INK} strokeWidth="2" />
          <path d="M18 70q32 10 64 0" fill="none" stroke="#fff" strokeWidth="2" opacity="0.6" />
        </g>
      )}
      {style === 'stump' && (
        <g>
          <path d="M18 92V40h64v52Z" fill="#a8774f" stroke={INK} strokeWidth="3" />
          <ellipse cx="50" cy="40" rx="32" ry="10" fill="#e6c79c" stroke={INK} strokeWidth="3" />
          <ellipse cx="50" cy="40" rx="18" ry="5" fill="none" stroke="#a8774f" strokeWidth="2" />
          <path d="M26 54v30M74 50v34" stroke="#7d5636" strokeWidth="2" />
          <path d="M40 92V72a10 10 0 0 1 20 0v20" fill={door} stroke={INK} strokeWidth="2.5" />
          <path d="M66 30c2-10 10-14 16-12-2 8-8 12-16 12Z" fill="#7bb36a" stroke={INK} strokeWidth="2" />
          <circle cx="68" cy="66" r="4" fill="#fbe7a1" stroke={INK} strokeWidth="2" />
        </g>
      )}
      {style === 'shell' && (
        <g>
          <path d="M12 90c0-40 20-70 46-70 22 0 32 18 30 36-2 16-14 24-28 22-12-2-18-12-14-22 3-8 12-10 17-6" fill="#f3c6a6" stroke={INK} strokeWidth="3" />
          <path d="M12 90h80" stroke={INK} strokeWidth="3" />
          <path d="M28 90V74a8 8 0 0 1 16 0v16" fill={door} stroke={INK} strokeWidth="2.5" />
          <circle cx="70" cy="76" r="4" fill="#fbe7a1" stroke={INK} strokeWidth="2" />
        </g>
      )}
    </svg>
  );
}
