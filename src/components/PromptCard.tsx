export function PromptCard({ prompt, answered, onCreate }: { prompt: string; answered: number; onCreate: () => void }) {
  return (
    <section className="prompt-card" aria-labelledby="prompt-h">
      <div className="prompt-ribbon" id="prompt-h">
        Today’s prompt
      </div>
      <p className="prompt-text">{prompt}</p>
      <div className="prompt-foot">
        <span className="muted small">
          {answered === 0 ? 'No one has answered yet — be first!' : `${answered} ${answered === 1 ? 'creature has' : 'creatures have'} answered`}
        </span>
        <button type="button" className="btn btn-primary btn-small" onClick={onCreate}>
          Make something ✎
        </button>
      </div>
    </section>
  );
}
