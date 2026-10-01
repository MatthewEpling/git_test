import { useEffect, useRef, useState } from 'react';
import type { Draft, Point } from './types';
import { MILESTONES, promptForDay, REACTIONS } from './lib/content';
import { milestonesReached, uid, useWorld } from './lib/store';
import { About } from './components/About';
import { CreateForm } from './components/CreateForm';
import { CreatureAvatar } from './components/CreatureAvatar';
import { CreatureEditor } from './components/CreatureEditor';
import { CreationCard } from './components/CreationCard';
import { Feed } from './components/Feed';
import { PromptCard } from './components/PromptCard';
import { Sheet } from './components/Sheet';
import { Toasts, type Toast } from './components/Toasts';
import { VisitHome } from './components/VisitHome';
import { WorldMap } from './components/WorldMap';

type View = 'world' | 'feed' | 'me';
type SheetState = { type: 'create' } | { type: 'home'; id: string } | { type: 'creation'; id: string } | { type: 'about' } | null;

const NEIGHBOUR_COMMENTS = ['Ooh, I love this!', 'This makes the meadow cozier 🌿', 'Can I visit it later?', 'So clever!!', 'My whiskers are tingling ✨'];

function isNightNow() {
  const h = new Date().getHours();
  return h >= 20 || h < 6;
}

export default function App() {
  const [world, dispatch] = useWorld();
  const [view, setView] = useState<View>('world');
  const [sheet, setSheet] = useState<SheetState>(null);
  const [placing, setPlacing] = useState<Draft | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [night, setNight] = useState(isNightNow);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<number[]>([]);

  const prompt = promptForDay();
  const player = world.creatures.find((c) => c.id === world.playerId)!;
  const creatures = new Map(world.creatures.map((c) => [c.id, c]));
  const answeredToday = world.creations.filter((c) => c.prompt === prompt).length;
  const reached = milestonesReached(world.creations.length);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  function later(ms: number, fn: () => void) {
    timers.current.push(window.setTimeout(fn, ms));
  }

  function toast(text: string, icon?: string) {
    const id = uid('t');
    setToasts((t) => [...t.slice(-2), { id, text, icon }]);
    later(3800, () => setToasts((t) => t.filter((x) => x.id !== id)));
  }

  // Celebrate when the community's creations unlock a new feature of the world.
  useEffect(() => {
    if (reached > world.seenMilestones) {
      toast(`The world grew! ${MILESTONES[reached - 1].label}.`, '🌟');
      dispatch({ type: 'seeMilestones', count: reached });
    }
  }, [reached, world.seenMilestones]);

  useEffect(() => {
    if (!highlightId) return;
    const t = window.setTimeout(() => setHighlightId(null), 2600);
    return () => clearTimeout(t);
  }, [highlightId]);

  function startPlacing(draft: Draft) {
    setPlacing(draft);
    setSheet(null);
    setView('world');
  }

  function place(pos: Point) {
    if (!placing) return;
    const id = uid('c');
    dispatch({ type: 'addCreation', id, draft: placing, pos, now: Date.now() });
    setPlacing(null);
    setHighlightId(id);
    toast('Placed in the world!', '🎉');
    simulateNeighbours(id);
  }

  /** Sample neighbours notice new creations. Clearly simulated: there is no real community in this prototype. */
  function simulateNeighbours(creationId: string) {
    const neighbours = world.creatures.filter((c) => c.id !== world.playerId);
    const first = neighbours[Math.floor(Math.random() * neighbours.length)];
    const reaction = REACTIONS[Math.floor(Math.random() * REACTIONS.length)];
    later(2600, () => {
      dispatch({ type: 'toggleReaction', creationId, key: reaction.key, by: first.id });
      toast(`${first.name} reacted ${reaction.emoji} to your creation`, reaction.emoji);
    });
    const second = neighbours.filter((n) => n.id !== first.id)[Math.floor(Math.random() * (neighbours.length - 1))];
    later(6500, () => {
      const text = NEIGHBOUR_COMMENTS[Math.floor(Math.random() * NEIGHBOUR_COMMENTS.length)];
      dispatch({ type: 'addComment', creationId, text, by: second.id, id: uid('k'), now: Date.now() });
      toast(`${second.name} left a comment: “${text}”`, '💬');
    });
  }

  function findOnMap(id: string) {
    setSheet(null);
    setView('world');
    setHighlightId(id);
  }

  const openCreation = sheet?.type === 'creation' ? world.creations.find((c) => c.id === sheet.id) : undefined;
  const openHome = sheet?.type === 'home' ? creatures.get(sheet.id) : undefined;

  const tabs: { id: View | 'create'; label: string; icon: React.ReactNode }[] = [
    { id: 'world', label: 'World', icon: '🗺️' },
    { id: 'feed', label: 'Feed', icon: '📜' },
    { id: 'create', label: 'Create', icon: '✎' },
    {
      id: 'me',
      label: 'Me',
      icon: <CreatureAvatar species={player.species} color={player.color} accessory={player.accessory} size={26} />,
    },
  ];

  return (
    <div className={`app view-${view}`}>
      <header className="topbar">
        <h1 className="brand">
          <span className="brand-mark" aria-hidden="true">🏡</span>
          Tiny <em>Civilization</em>
        </h1>
        <button type="button" className="local-pill" onClick={() => setSheet({ type: 'about' })}>
          <span className="dot" aria-hidden="true" /> Local prototype
        </button>
      </header>

      <nav className="tabbar" aria-label="Main">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab ${t.id === 'create' ? 'tab-create' : ''} ${view === t.id ? 'is-on' : ''}`}
            aria-current={view === t.id ? 'page' : undefined}
            onClick={() => (t.id === 'create' ? setSheet({ type: 'create' }) : setView(t.id))}
          >
            <span className="tab-icon" aria-hidden="true">{t.icon}</span>
            <span className="tab-label">{t.label}</span>
          </button>
        ))}
      </nav>

      <main className="main">
        {view === 'world' && (
          <div className="world-layout">
            <div className="world-col">
              <WorldMap
                world={world}
                placing={!!placing}
                highlightId={highlightId}
                night={night}
                onToggleNight={() => setNight((n) => !n)}
                onPlace={place}
                onCancelPlacing={() => setPlacing(null)}
                onOpenHome={(id) => setSheet({ type: 'home', id })}
                onOpenCreation={(id) => setSheet({ type: 'creation', id })}
                onSurprise={(text, icon) => toast(text, icon)}
              />
            </div>
            <aside className="side-col">
              <PromptCard prompt={prompt} answered={answeredToday} onCreate={() => setSheet({ type: 'create' })} />
              <div className="side-feed">
                <div className="row between">
                  <h2 className="section-title">Fresh from the meadow</h2>
                  <button type="button" className="link-btn" onClick={() => setView('feed')}>
                    See all →
                  </button>
                </div>
                <Feed
                  world={world}
                  dispatch={dispatch}
                  todaysPrompt={prompt}
                  onVisit={(id) => setSheet({ type: 'home', id })}
                  onFindOnMap={findOnMap}
                  limit={4}
                />
              </div>
            </aside>
          </div>
        )}

        {view === 'feed' && (
          <div className="column">
            <PromptCard prompt={prompt} answered={answeredToday} onCreate={() => setSheet({ type: 'create' })} />
            <h2 className="section-title">Community feed</h2>
            <Feed world={world} dispatch={dispatch} todaysPrompt={prompt} onVisit={(id) => setSheet({ type: 'home', id })} onFindOnMap={findOnMap} />
          </div>
        )}

        {view === 'me' && (
          <div className="column">
            <section className="card">
              <h2 className="section-title">Your creature</h2>
              <CreatureEditor creature={player} dispatch={dispatch} />
              <button type="button" className="btn btn-block" onClick={() => setSheet({ type: 'home', id: player.id })}>
                Visit my home ({player.gifts.length} {player.gifts.length === 1 ? 'gift' : 'gifts'})
              </button>
            </section>
            <section className="card">
              <h2 className="section-title">About this world</h2>
              <About reached={reached} onReset={() => dispatch({ type: 'reset', now: Date.now() })} />
            </section>
          </div>
        )}
      </main>

      <Sheet open={sheet?.type === 'create'} onClose={() => setSheet(null)} title="Make something tiny">
        <CreateForm prompt={prompt} onSubmit={startPlacing} />
      </Sheet>

      <Sheet open={!!openHome} onClose={() => setSheet(null)} title={openHome ? (openHome.id === player.id ? 'Your home' : `${openHome.name}’s home`) : ''}>
        {openHome && (
          <VisitHome
            creature={openHome}
            world={world}
            dispatch={dispatch}
            onEditProfile={() => {
              setSheet(null);
              setView('me');
            }}
            onOpenCreation={(id) => setSheet({ type: 'creation', id })}
          />
        )}
      </Sheet>

      <Sheet open={!!openCreation} onClose={() => setSheet(null)} title="A little creation">
        {openCreation && (
          <CreationCard
            creation={openCreation}
            creatures={creatures}
            playerId={world.playerId}
            dispatch={dispatch}
            onVisit={(id) => setSheet({ type: 'home', id })}
            expanded
          />
        )}
      </Sheet>

      <Sheet open={sheet?.type === 'about'} onClose={() => setSheet(null)} title="Local prototype">
        <About
          reached={reached}
          onReset={() => {
            dispatch({ type: 'reset', now: Date.now() });
            setSheet(null);
          }}
        />
      </Sheet>

      <Sheet open={!world.onboarded} onClose={() => {}} title="Welcome to the meadow" dismissible={false}>
        <div className="stack gap-m">
          <p className="lead">
            A tiny creature has just hatched near the old mushroom. They’re yours to look after. Give them a name and a look, then help the
            meadow grow by making small things.
          </p>
          <CreatureEditor creature={player} dispatch={dispatch} compact />
          <button type="button" className="btn btn-primary btn-block" onClick={() => dispatch({ type: 'finishOnboarding' })}>
            Move in with {player.name || 'your creature'} →
          </button>
          <p className="muted small center">Local prototype: everything stays in this browser.</p>
        </div>
      </Sheet>

      <Toasts toasts={toasts} />
    </div>
  );
}
