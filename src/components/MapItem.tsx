import type { Creation } from '../types';
import { Doodle } from './Doodle';

/** The tiny version of a creation that sits on the world map. */
export function MapItemContent({ creation }: { creation: Creation }) {
  switch (creation.kind) {
    case 'emoji':
      return <span className="map-emoji">{creation.emoji}</span>;
    case 'note':
      return (
        <span className="map-note" style={{ background: creation.noteColor }}>
          {creation.text?.slice(0, 18)}…
        </span>
      );
    case 'doodle':
      return (
        <span className="map-doodle">
          <Doodle strokes={creation.strokes ?? []} size={46} />
        </span>
      );
  }
}

export function describeCreation(c: Creation, authorName: string): string {
  const what = c.kind === 'note' ? 'note' : c.kind === 'emoji' ? `${c.emoji} creation` : 'doodle';
  const detail = c.caption || c.text || '';
  return `${authorName}’s ${what}${detail ? `: ${detail}` : ''}`;
}
