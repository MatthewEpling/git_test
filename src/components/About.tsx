import { MILESTONES } from '../lib/content';

export function About({ reached, onReset }: { reached: number; onReset: () => void }) {
  return (
    <div className="about stack gap-m">
      <p>
        <strong>This is a local prototype.</strong> Everything you make is saved only in this browser (using local storage). Nothing is sent to a
        server, and nobody else can see your creations yet.
      </p>
      <ul className="about-list">
        <li>🐾 The other creatures — Pip, Mabel, Bramble and friends — are sample neighbours.</li>
        <li>💬 Their reactions, comments and thank-yous are simulated to show how the shared world would feel.</li>
        <li>🌱 The world grows as more things are made. Milestones so far:</li>
      </ul>
      <ol className="milestones">
        {MILESTONES.map((m, i) => (
          <li key={m.at} className={i < reached ? 'is-done' : ''}>
            <span aria-hidden="true">{i < reached ? '✓' : '○'}</span> {m.label} <span className="muted small">({m.at} creations)</span>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => {
          if (window.confirm('Reset the world? This erases your creature and everything you made in this browser.')) onReset();
        }}
      >
        Reset local world
      </button>
    </div>
  );
}
