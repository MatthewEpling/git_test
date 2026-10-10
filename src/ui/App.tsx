import { useEffect, useState } from 'react';
import { randomSeed } from '../engine/rng';
import { downloadJson, readJsonFile, type SaveRecord, Store } from '../persist/store';
import { Game } from './Game';
import { BUILTIN_PACK_JSON, importPack, loadPacks, type PackEntry } from './packs';
import { resumeSession, type Session, startSession } from './session';

export function App() {
  const [store, setStore] = useState<Store | null>(null);
  const [packs, setPacks] = useState<PackEntry[]>([]);
  const [saves, setSaves] = useState<SaveRecord[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);

  const refresh = async (st: Store) => {
    setPacks(await loadPacks(st));
    setSaves(await st.saves());
  };

  useEffect(() => {
    Store.open()
      .then(async (st) => {
        setStore(st);
        await refresh(st);
      })
      .catch((e) => setFatal(`Lantern Table couldn't start: ${(e as Error).message}`));
  }, []);

  if (fatal) {
    return (
      <div className="title-screen">
        <div className="banner bad" role="alert">
          {fatal} <button onClick={() => location.reload()}>Reload</button>
        </div>
      </div>
    );
  }
  if (!store) return <div className="loading" role="status">Loading…</div>;
  if (session) {
    return (
      <Game
        key={session.record.id}
        initial={session}
        store={store}
        onExit={() => {
          setSession(null);
          void refresh(store);
        }}
      />
    );
  }
  return <Title store={store} packs={packs} saves={saves} onStart={setSession} onChanged={() => refresh(store)} />;
}

function Title({ store, packs, saves, onStart, onChanged }: { store: Store; packs: PackEntry[]; saves: SaveRecord[]; onStart: (s: Session) => void; onChanged: () => void }) {
  const usable = packs.filter((p) => p.content);
  const [packId, setPackId] = useState(usable[0]?.id ?? '');
  const [seed, setSeed] = useState(randomSeed);
  const [name, setName] = useState('My campaign');
  const [message, setMessage] = useState<{ kind: 'ok' | 'bad'; text: string; list?: string[] } | null>(null);

  useEffect(() => {
    if (!packId && usable[0]) setPackId(usable[0].id);
  }, [packId, usable]);

  const start = () => {
    const p = usable.find((x) => x.id === packId);
    if (!p?.content) return;
    try {
      onStart(startSession(p.content, seed.trim() || randomSeed(), name.trim() || 'Campaign'));
    } catch (e) {
      setMessage({ kind: 'bad', text: `Couldn't start: ${(e as Error).message}` });
    }
  };

  const resume = (rec: SaveRecord) => {
    const p = packs.find((x) => x.id === rec.packId);
    if (!p?.content) {
      setMessage({ kind: 'bad', text: `This save needs the content pack "${rec.packId}", which isn't loaded in this browser. Import that pack first.` });
      return;
    }
    try {
      onStart(resumeSession(p.content, rec));
    } catch (e) {
      setMessage({ kind: 'bad', text: `This save can't be resumed: ${(e as Error).message}. The content pack may have changed since it was made (saved with v${rec.packVersion}, loaded v${p.version}).` });
    }
  };

  const onImportPack = async (file: File | undefined) => {
    if (!file) return;
    try {
      const entry = await importPack(store, await readJsonFile(file));
      if (entry.content) {
        setMessage({ kind: 'ok', text: `Imported “${entry.name}” v${entry.version}. It's stored in this browser only.`, list: entry.warnings });
        onChanged();
      } else setMessage({ kind: 'bad', text: `${file.name} isn't a valid content pack:`, list: entry.errors });
    } catch (e) {
      setMessage({ kind: 'bad', text: (e as Error).message });
    }
  };

  const onImportSave = async (file: File | undefined) => {
    if (!file) return;
    try {
      const data = (await readJsonFile(file)) as { format?: string; seed?: string; packId?: string; packVersion?: string; commands?: unknown[]; name?: string };
      if (data.format !== 'lantern-table-save' || typeof data.seed !== 'string' || !Array.isArray(data.commands)) throw new Error(`${file.name} isn't a Lantern Table save.`);
      const now = Date.now();
      const rec: SaveRecord = {
        id: `save-${now.toString(36)}`,
        name: data.name ?? 'Imported save',
        seed: data.seed,
        packId: data.packId ?? '',
        packVersion: data.packVersion ?? '?',
        commands: data.commands as SaveRecord['commands'],
        createdAt: now,
        updatedAt: now,
        summary: 'Imported',
      };
      await store.putSave(rec);
      onChanged();
      setMessage({ kind: 'ok', text: `Imported save “${rec.name}”.` });
    } catch (e) {
      setMessage({ kind: 'bad', text: (e as Error).message });
    }
  };

  return (
    <div className="title-screen">
      <header className="hero">
        <h1>Lantern Table</h1>
        <p className="lede">An unofficial, fan-made rules engine and 3D table for playing your own copy of Kingdom Death: Monster in the browser.</p>
        <p className="disclaimer">
          Not affiliated with or endorsed by Kingdom Death. It ships with <b>original stand-in content only</b> — no official cards, rules text, art or
          miniatures. Official content can be added from materials you own as a local content pack that never leaves your browser.
        </p>
      </header>
      {store.problem && (
        <div className="banner" role="status">
          {store.problem}
        </div>
      )}
      {message && (
        <div className={`banner ${message.kind === 'bad' ? 'bad' : 'ok'}`} role={message.kind === 'bad' ? 'alert' : 'status'}>
          {message.text}
          {message.list && message.list.length > 0 && (
            <ul>
              {message.list.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          )}
          <button onClick={() => setMessage(null)}>Dismiss</button>
        </div>
      )}
      <div className="title-grid">
        <section className="panel">
          <h2>New campaign</h2>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Content pack
            <select value={packId} onChange={(e) => setPackId(e.target.value)}>
              {usable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} v{p.version}
                  {p.source === 'user-provided' ? ' (yours, local)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Seed <span className="muted">(same seed + same choices = same game)</span>
            <span className="row">
              <input value={seed} onChange={(e) => setSeed(e.target.value)} spellCheck={false} />
              <button onClick={() => setSeed(randomSeed())}>New</button>
            </span>
          </label>
          <button className="primary" onClick={start} disabled={!packId}>
            Begin
          </button>
        </section>
        <section className="panel">
          <h2>Continue</h2>
          {saves.length ? (
            <ul className="saves">
              {saves.map((rec) => (
                <li key={rec.id}>
                  <button className="primary" onClick={() => resume(rec)}>
                    {rec.name}
                  </button>
                  <span className="muted">
                    {rec.summary} · {rec.commands.length} choices · {new Date(rec.updatedAt).toLocaleString()}
                  </span>
                  <button
                    className="small"
                    aria-label={`Delete save ${rec.name}`}
                    onClick={async () => {
                      if (confirm(`Delete “${rec.name}”? This can't be undone.`)) {
                        await store.removeSave(rec.id);
                        onChanged();
                      }
                    }}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No saved campaigns in this browser yet.</p>
          )}
          <label className="file">
            Import a save file
            <input type="file" accept=".json,application/json" onChange={(e) => onImportSave(e.target.files?.[0])} />
          </label>
        </section>
        <section className="panel">
          <h2>Content packs</h2>
          <ul className="packs">
            {packs.map((p) => (
              <li key={`${p.id}-${p.version}`}>
                <b>{p.name}</b> v{p.version} <span className="muted">{p.source === 'original-standin' ? 'built in, original stand-in' : 'yours, stored locally'}</span>
                {p.errors.length > 0 && <div className="bad">Invalid: {p.errors.slice(0, 3).join('; ')}</div>}
                {p.source === 'user-provided' && (
                  <button
                    className="small"
                    onClick={async () => {
                      if (confirm(`Remove the pack “${p.name}” from this browser?`)) {
                        await store.removePack(p.id);
                        onChanged();
                      }
                    }}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="muted">
            A content pack is one JSON file: rules values, monsters with AI and hit location decks, hunt events, gear, locations and the campaign
            timeline. Start from the stand-in pack as a template, enter data from your own copy, and import it here. It's validated before use and
            stays in this browser.
          </p>
          <div className="row">
            <button onClick={() => downloadJson('content-pack-template.json', BUILTIN_PACK_JSON)}>Download template</button>
            <label className="file">
              Import pack
              <input type="file" accept=".json,application/json" onChange={(e) => onImportPack(e.target.files?.[0])} />
            </label>
          </div>
        </section>
      </div>
      <footer className="muted foot">
        Kingdom Death: Monster is a trademark of Kingdom Death. Lantern Table is a fan project. Three.js (MIT), React (MIT) and Zod (MIT) are used under
        their licences.
      </footer>
    </div>
  );
}
