import { useEffect, useRef, useState } from 'react';
import type { Creature, Point, WorldState } from '../types';
import { CHATTER } from '../lib/content';
import { milestonesReached } from '../lib/store';
import { prefersReducedMotion } from '../lib/time';
import { CreatureAvatar } from './CreatureAvatar';
import { HomeIcon } from './HomeIcon';
import { describeCreation, MapItemContent } from './MapItem';
import { Terrain } from './Terrain';

interface Props {
  world: WorldState;
  placing: boolean;
  highlightId: string | null;
  night: boolean;
  onToggleNight: () => void;
  onPlace: (pos: Point) => void;
  onCancelPlacing: () => void;
  onOpenHome: (creatureId: string) => void;
  onOpenCreation: (creationId: string) => void;
  onSurprise: (text: string, icon: string) => void;
}

const TREES: { x: number; y: number; s: number; fruit: boolean }[] = [
  { x: 9, y: 42, s: 1, fruit: true }, { x: 25, y: 36, s: 0.8, fruit: false }, { x: 57, y: 23, s: 0.9, fruit: false },
  { x: 94, y: 26, s: 1.1, fruit: true }, { x: 13, y: 91, s: 0.9, fruit: false }, { x: 51, y: 92, s: 0.8, fruit: true },
  { x: 96, y: 84, s: 1, fruit: false }, { x: 24, y: 64, s: 0.7, fruit: false }, { x: 80, y: 15, s: 0.8, fruit: true },
];

function Tree({ fruit, shade }: { fruit: boolean; shade: string }) {
  return (
    <svg width="60" height="70" viewBox="0 0 60 70" aria-hidden="true">
      <ellipse cx="30" cy="66" rx="18" ry="3.5" fill="#3b2a1e" opacity="0.12" />
      <rect x="25" y="36" width="10" height="30" rx="3" fill="#a8774f" stroke="#5a4330" strokeWidth="2" />
      <circle cx="30" cy="28" r="25" fill={shade} stroke="#5a4330" strokeWidth="2" />
      <path d="M16 24q6-10 16-10" stroke="#fff" strokeWidth="2.5" fill="none" opacity="0.35" strokeLinecap="round" />
      {fruit && (
        <g fill="#c4552d">
          <circle cx="20" cy="34" r="3.5" />
          <circle cx="40" cy="22" r="3.5" />
          <circle cx="36" cy="40" r="3.5" />
        </g>
      )}
    </svg>
  );
}

const CRITTERS = [
  ['🐞', 'A ladybug tumbles out of the leaves!'],
  ['🐿️', 'A squirrel peeks out, then zooms away.'],
  ['🍎', 'Bonk! An apple falls. Lucky you.'],
  ['🐦', 'A little bird sings you a song.'],
  ['🍂', 'Leaves swirl down like confetti.'],
  ['🐛', 'A caterpillar waves hello.'],
];

export function WorldMap(props: Props) {
  const { world, placing, highlightId, night } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const [speaking, setSpeaking] = useState<{ id: string; line: string } | null>(null);
  const [shaking, setShaking] = useState<number | null>(null);
  const milestones = milestonesReached(world.creations.length);
  const authors = new Map(world.creatures.map((c) => [c.id, c]));
  const player = authors.get(world.playerId)!;

  // Start the view centred on the player's home (matters on narrow screens where the map scrolls).
  useEffect(() => {
    const scroller = scrollRef.current;
    const map = worldRef.current;
    if (!scroller || !map) return;
    scroller.scrollLeft = (player.home.x / 100) * map.offsetWidth - scroller.clientWidth / 2;
    scroller.scrollTop = (player.home.y / 100) * map.offsetHeight - scroller.clientHeight / 2;
  }, []);

  useEffect(() => {
    if (!highlightId) return;
    const el = worldRef.current?.querySelector<HTMLElement>(`[data-id="${highlightId}"]`);
    el?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center', inline: 'center' });
  }, [highlightId]);

  useEffect(() => {
    if (!speaking) return;
    const t = setTimeout(() => setSpeaking(null), 2800);
    return () => clearTimeout(t);
  }, [speaking]);

  function handleMapClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!placing || !worldRef.current) return;
    const rect = worldRef.current.getBoundingClientRect();
    const clamp = (n: number) => Math.round(Math.min(96, Math.max(4, n)) * 10) / 10;
    props.onPlace({
      x: clamp(((e.clientX - rect.left) / rect.width) * 100),
      y: clamp(((e.clientY - rect.top) / rect.height) * 100),
    });
  }

  function poke(c: Creature) {
    const lines = CHATTER[c.personality] ?? ['Hello, neighbour!'];
    setSpeaking({ id: c.id, line: c.id === world.playerId ? c.status : lines[Math.floor(Math.random() * lines.length)] });
  }

  function shakeTree(i: number) {
    setShaking(i);
    setTimeout(() => setShaking(null), 700);
    const [icon, text] = CRITTERS[Math.floor(Math.random() * CRITTERS.length)];
    props.onSurprise(text, icon);
  }

  return (
    <div className={`map-frame ${placing ? 'is-placing' : ''} ${night ? 'is-night' : ''}`}>
      {placing && (
        <div className="place-banner" role="status">
          <span>📍 Tap anywhere on the map to place your creation</span>
          <div className="row gap-s">
            <button
              type="button"
              className="btn btn-small"
              onClick={() =>
                props.onPlace({
                  x: Math.min(94, Math.max(6, player.home.x + (Math.random() * 14 - 7))),
                  y: Math.min(94, Math.max(6, player.home.y + 8 + Math.random() * 6)),
                })
              }
            >
              Near my home
            </button>
            <button type="button" className="btn btn-small btn-ghost" onClick={props.onCancelPlacing}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <button
        type="button"
        className="sky-toggle"
        onClick={props.onToggleNight}
        aria-label={night ? 'Switch to daytime' : 'Switch to night-time'}
        title={night ? 'Daytime' : 'Night-time'}
      >
        {night ? '☀️' : '🌙'}
      </button>
      <div className="map-scroll" ref={scrollRef}>
        <div className="world" ref={worldRef} onClick={handleMapClick}>
          <Terrain milestones={milestones} />

          {milestones >= 4 && (
            <div className="balloon" aria-hidden="true">
              🎈
            </div>
          )}
          <div className="snail" aria-hidden="true">
            🐌
          </div>

          {TREES.map((t, i) => (
            <button
              key={`tree-${i}`}
              type="button"
              className={`tree ${shaking === i ? 'is-shaking' : ''}`}
              style={{ left: `${t.x}%`, top: `${t.y}%`, ['--s' as string]: t.s }}
              onClick={() => shakeTree(i)}
              aria-label="Shake the tree"
              tabIndex={placing ? -1 : 0}
            >
              <Tree fruit={t.fruit} shade={i % 2 ? '#9fc490' : '#8fb67f'} />
            </button>
          ))}

          {world.creatures.map((c, i) => (
            <div key={c.id} className="home" style={{ left: `${c.home.x}%`, top: `${c.home.y}%` }}>
              <button
                type="button"
                className="home-btn"
                onClick={() => props.onOpenHome(c.id)}
                aria-label={c.id === world.playerId ? `Your home, ${c.name}` : `Visit ${c.name}’s home`}
                tabIndex={placing ? -1 : 0}
              >
                <HomeIcon style={c.homeStyle} door={c.color} size={62} />
                <span className={`name-tag ${c.id === world.playerId ? 'is-me' : ''}`}>
                  {c.id === world.playerId ? `★ ${c.name}` : c.name}
                </span>
                {c.gifts.length > 0 && (
                  <span className="gift-count" aria-hidden="true">
                    🎁{c.gifts.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                className="creature-btn"
                style={{ animationDelay: `${(i % 5) * 0.4}s` }}
                onClick={() => poke(c)}
                aria-label={`Say hi to ${c.name}`}
                tabIndex={placing ? -1 : 0}
              >
                <CreatureAvatar species={c.species} color={c.color} accessory={c.accessory} size={38} />
              </button>
              {speaking?.id === c.id && (
                <span className="bubble" role="status">
                  {speaking.line}
                </span>
              )}
            </div>
          ))}

          {world.creations.map((c) => (
            <button
              key={c.id}
              data-id={c.id}
              type="button"
              className={`map-item kind-${c.kind} ${highlightId === c.id ? 'is-highlight' : ''}`}
              style={{ left: `${c.pos.x}%`, top: `${c.pos.y}%` }}
              onClick={() => props.onOpenCreation(c.id)}
              aria-label={describeCreation(c, authors.get(c.authorId)?.name ?? 'Someone')}
              tabIndex={placing ? -1 : 0}
            >
              <MapItemContent creation={c} />
            </button>
          ))}

          {night && (
            <div className="fireflies" aria-hidden="true">
              {Array.from({ length: 14 }, (_, i) => (
                <span key={i} style={{ left: `${(i * 37) % 100}%`, top: `${(i * 53) % 90 + 5}%`, animationDelay: `${(i % 7) * 0.6}s` }} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
