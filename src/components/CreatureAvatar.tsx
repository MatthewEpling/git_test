import type { Accessory, Species } from '../types';

interface Props {
  species: Species;
  color: string;
  accessory: Accessory;
  size?: number;
  mood?: 'happy' | 'calm';
  className?: string;
  title?: string;
}

const INK = '#3b2a1e';

function Body({ species, color }: { species: Species; color: string }) {
  switch (species) {
    case 'blob':
      return <path d="M50 26c20 0 32 16 32 34 0 16-12 26-32 26S18 76 18 60c0-18 12-34 32-34Z" fill={color} stroke={INK} strokeWidth="3" />;
    case 'sprout':
      return (
        <g>
          <path d="M50 34c0-8 1-14 4-20" fill="none" stroke="#4d7c3a" strokeWidth="3" strokeLinecap="round" />
          <path d="M54 16c6-6 16-6 20-2-6 6-14 6-20 2Z" fill="#9fc490" stroke="#4d7c3a" strokeWidth="2.5" />
          <path d="M53 20c-6-6-15-5-19-1 6 5 14 5 19 1Z" fill="#b8d9a6" stroke="#4d7c3a" strokeWidth="2.5" />
          <circle cx="50" cy="60" r="27" fill={color} stroke={INK} strokeWidth="3" />
        </g>
      );
    case 'moth':
      return (
        <g>
          <path d="M42 30c-4-10-10-14-14-14M58 30c4-10 10-14 14-14" fill="none" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="28" cy="16" r="3" fill={INK} />
          <circle cx="72" cy="16" r="3" fill={INK} />
          <path d="M36 50C18 32 6 42 10 56c4 12 18 14 28 8Z" fill="#fffaf0" stroke={INK} strokeWidth="2.5" opacity="0.95" />
          <path d="M64 50c18-18 30-8 26 6-4 12-18 14-28 8Z" fill="#fffaf0" stroke={INK} strokeWidth="2.5" opacity="0.95" />
          <circle cx="20" cy="52" r="4" fill={color} />
          <circle cx="80" cy="52" r="4" fill={color} />
          <ellipse cx="50" cy="58" rx="20" ry="28" fill={color} stroke={INK} strokeWidth="3" />
        </g>
      );
    case 'pebble':
      return (
        <g>
          <path d="M14 70c0-20 16-34 38-34s34 14 34 32c0 12-14 18-36 18S14 82 14 70Z" fill={color} stroke={INK} strokeWidth="3" />
          <circle cx="30" cy="62" r="2" fill={INK} opacity="0.25" />
          <circle cx="72" cy="74" r="2.5" fill={INK} opacity="0.25" />
          <circle cx="64" cy="50" r="1.8" fill={INK} opacity="0.25" />
        </g>
      );
  }
}

function Face({ species, mood }: { species: Species; mood: 'happy' | 'calm' }) {
  const eyeY = species === 'pebble' ? 62 : 56;
  const mouthY = eyeY + 9;
  return (
    <g>
      <g className="tc-eyes">
        <ellipse cx="41" cy={eyeY} rx="3.4" ry="4.4" fill={INK} />
        <ellipse cx="59" cy={eyeY} rx="3.4" ry="4.4" fill={INK} />
        <circle cx="42.2" cy={eyeY - 1.6} r="1.2" fill="#fff" />
        <circle cx="60.2" cy={eyeY - 1.6} r="1.2" fill="#fff" />
      </g>
      <ellipse cx="33" cy={eyeY + 6} rx="5" ry="3" fill="#e2675a" opacity="0.35" />
      <ellipse cx="67" cy={eyeY + 6} rx="5" ry="3" fill="#e2675a" opacity="0.35" />
      {mood === 'happy' ? (
        <path d={`M44 ${mouthY}q6 6 12 0`} fill="none" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
      ) : (
        <path d={`M46 ${mouthY + 1}q4 2 8 0`} fill="none" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
      )}
    </g>
  );
}

function AccessoryLayer({ accessory, species }: { accessory: Accessory; species: Species }) {
  const top = species === 'pebble' ? 38 : species === 'moth' ? 32 : species === 'sprout' ? 34 : 28;
  switch (accessory) {
    case 'none':
      return null;
    case 'leaf':
      return (
        <g transform={`translate(0 ${top - 28})`}>
          <path d="M30 30c8-14 32-16 42-4-12 6-30 8-42 4Z" fill="#7bb36a" stroke="#3d6b2e" strokeWidth="2.5" />
          <path d="M34 29c12-2 24-4 34-4" fill="none" stroke="#3d6b2e" strokeWidth="1.8" />
        </g>
      );
    case 'scarf': {
      const y = species === 'pebble' ? 74 : 72;
      return (
        <g>
          <path d={`M26 ${y}q24 10 48 0v7q-24 10-48 0Z`} fill="#c4552d" stroke="#3b2a1e" strokeWidth="2" />
          <path d={`M62 ${y + 6}l4 14 7-2-3-13Z`} fill="#c4552d" stroke="#3b2a1e" strokeWidth="2" />
        </g>
      );
    }
    case 'flower':
      return (
        <g transform={`translate(66 ${top + 2})`}>
          {[0, 72, 144, 216, 288].map((r) => (
            <ellipse key={r} cx="0" cy="-6" rx="4" ry="6" fill="#fff6c2" stroke="#3b2a1e" strokeWidth="1.5" transform={`rotate(${r})`} />
          ))}
          <circle r="3.5" fill="#f2b33d" stroke="#3b2a1e" strokeWidth="1.5" />
        </g>
      );
    case 'crown':
      return (
        <path
          d={`M36 ${top + 2}l2-12 6 7 6-10 6 10 6-7 2 12Z`}
          fill="#c79a4b"
          stroke="#3b2a1e"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
      );
  }
}

export function CreatureAvatar({ species, color, accessory, size = 64, mood = 'happy', className, title }: Props) {
  return (
    <svg
      className={`tc-avatar ${className ?? ''}`}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <ellipse cx="50" cy="92" rx="26" ry="4" fill="#3b2a1e" opacity="0.12" />
      <Body species={species} color={color} />
      <Face species={species} mood={mood} />
      <AccessoryLayer accessory={accessory} species={species} />
    </svg>
  );
}
