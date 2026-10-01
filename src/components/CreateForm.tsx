import { useState } from 'react';
import type { CreationKind, Draft, Stroke } from '../types';
import { EMOJI_PALETTE, NOTE_COLORS } from '../lib/content';
import { DoodlePad } from './DoodlePad';

interface Props {
  prompt: string;
  onSubmit: (draft: Draft) => void;
}

const KINDS: { id: CreationKind; label: string; icon: string }[] = [
  { id: 'doodle', label: 'Doodle', icon: '✎' },
  { id: 'note', label: 'Note', icon: '✉' },
  { id: 'emoji', label: 'Object', icon: '🧺' },
];

export function CreateForm({ prompt, onSubmit }: Props) {
  const [kind, setKind] = useState<CreationKind>('doodle');
  const [text, setText] = useState('');
  const [noteColor, setNoteColor] = useState(NOTE_COLORS[0]);
  const [emoji, setEmoji] = useState('');
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [caption, setCaption] = useState('');
  const [usePrompt, setUsePrompt] = useState(true);

  const ready = (kind === 'note' && text.trim().length > 0) || (kind === 'emoji' && !!emoji) || (kind === 'doodle' && strokes.length > 0);
  const hint = kind === 'note' ? 'Write a few words first.' : kind === 'emoji' ? 'Pick an object first.' : 'Draw something first.';

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    const base = { caption: caption.trim().slice(0, 80), prompt: usePrompt ? prompt : undefined };
    if (kind === 'note') onSubmit({ ...base, kind, text: text.trim().slice(0, 140), noteColor });
    else if (kind === 'emoji') onSubmit({ ...base, kind, emoji });
    else onSubmit({ ...base, kind, strokes });
  }

  return (
    <form className="create-form" onSubmit={submit}>
      <label className="prompt-toggle">
        <input type="checkbox" checked={usePrompt} onChange={(e) => setUsePrompt(e.target.checked)} />
        <span>
          <span className="muted small">Answering today’s prompt</span>
          <em>“{prompt}”</em>
        </span>
      </label>

      <div className="segmented" role="tablist" aria-label="What are you making?">
        {KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            role="tab"
            aria-selected={kind === k.id}
            className={kind === k.id ? 'is-on' : ''}
            onClick={() => setKind(k.id)}
          >
            <span aria-hidden="true">{k.icon}</span> {k.label}
          </button>
        ))}
      </div>

      <div className="create-stage" role="tabpanel">
        {kind === 'doodle' && <DoodlePad strokes={strokes} onChange={setStrokes} />}

        {kind === 'note' && (
          <div className="stack gap-s">
            <label className="field">
              <span>Your note</span>
              <textarea
                value={text}
                maxLength={140}
                rows={4}
                style={{ background: noteColor }}
                className="note-input"
                placeholder="Dear whoever finds this…"
                onChange={(e) => setText(e.target.value)}
              />
              <span className="muted small counter">{text.length}/140</span>
            </label>
            <div className="swatches" role="radiogroup" aria-label="Paper color">
              {NOTE_COLORS.map((c, i) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={noteColor === c}
                  aria-label={['Butter', 'Peach', 'Mint', 'Sky', 'Lilac'][i]}
                  className="swatch"
                  style={{ background: c }}
                  onClick={() => setNoteColor(c)}
                />
              ))}
            </div>
          </div>
        )}

        {kind === 'emoji' && (
          <div className="emoji-grid" role="radiogroup" aria-label="Pick an object">
            {EMOJI_PALETTE.map((em) => (
              <button
                key={em}
                type="button"
                role="radio"
                aria-checked={emoji === em}
                className={`emoji-pick ${emoji === em ? 'is-on' : ''}`}
                onClick={() => setEmoji(em)}
              >
                {em}
              </button>
            ))}
          </div>
        )}
      </div>

      <label className="field">
        <span>Caption <span className="muted">(optional)</span></span>
        <input value={caption} maxLength={80} placeholder="A tiny story about it…" onChange={(e) => setCaption(e.target.value)} />
      </label>

      <button type="submit" className="btn btn-primary btn-block" disabled={!ready}>
        Choose a spot on the map →
      </button>
      {!ready && <p className="muted small center">{hint}</p>}
    </form>
  );
}
