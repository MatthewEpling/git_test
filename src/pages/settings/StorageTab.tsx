import { useEffect, useRef, useState } from 'react';
import { db, requestPersistentStorage, storageEstimate } from '../../storage/db';
import { loadSaveFiles, storeSaveFile, deleteSaveFile, type SaveFileRecord } from '../../storage/saves';
import { formatBytes } from '../../ui/controls';
import { useToast } from '../../ui/toasts';

export function StorageTab({ inGame }: { inGame: boolean }) {
  const toast = useToast();
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [saves, setSaves] = useState<SaveFileRecord[]>([]);
  const importRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    setUsage(await storageEstimate());
    setPersisted((await navigator.storage?.persisted?.()) ?? null);
    setSaves(await loadSaveFiles());
  };
  useEffect(() => {
    void refresh();
  }, []);

  const download = (s: SaveFileRecord) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([s.data as BlobPart]));
    a.download = s.path.split('/').pop()!;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div>
      <div className="group-title">This browser</div>
      <div className="stack" style={{ gap: 8 }}>
        {usage && (
          <>
            <div className="row between small">
              <span>
                Using {formatBytes(usage.usage)} of {formatBytes(usage.quota)}
              </span>
              <span className="muted">{((usage.usage / Math.max(1, usage.quota)) * 100).toFixed(1)}%</span>
            </div>
            <div className="progress" aria-hidden="true">
              <span style={{ width: `${Math.min(100, (usage.usage / Math.max(1, usage.quota)) * 100)}%` }} />
            </div>
          </>
        )}
        <div className="row between">
          <span className="small muted">{persisted ? 'Storage is protected from automatic clean-up.' : 'The browser may clear this data if space runs low.'}</span>
          {!persisted && (
            <button type="button" className="btn btn-sm" onClick={() => void requestPersistentStorage().then(refresh)}>
              Protect my data
            </button>
          )}
        </div>
      </div>

      <div className="group-title">Memory cards and system flash</div>
      <p className="small muted">VMU saves and Dreamcast flash settings. Export them as a backup or to use in another emulator.</p>
      {saves.length === 0 ? (
        <p className="small faint" style={{ marginTop: 8 }}>
          No saves yet.
        </p>
      ) : (
        <div className="stack" style={{ gap: 6, marginTop: 8 }}>
          {saves.map((sv) => (
            <div key={sv.path} className="bios-slot">
              <div className="grow">
                <div className="mono small">{sv.path.split('/').pop()}</div>
                <div className="tiny muted">
                  {formatBytes(sv.data.length)} · updated {new Date(sv.updatedAt).toLocaleString()}
                </div>
              </div>
              <button type="button" className="btn btn-sm" onClick={() => download(sv)}>
                Export
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost btn-danger"
                disabled={inGame}
                title={inGame ? 'Exit the game to delete saves' : undefined}
                onClick={() => {
                  if (confirm(`Delete ${sv.path.split('/').pop()}? This can't be undone.`)) void deleteSaveFile(sv.path).then(refresh);
                }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="row" style={{ marginTop: 10 }}>
        <button type="button" className="btn btn-sm" disabled={inGame} onClick={() => importRef.current?.click()} title={inGame ? 'Exit the game to import saves' : undefined}>
          Import VMU save…
        </button>
        <span className="tiny faint">A .bin VMU image, e.g. vmu_save_A1.bin. It replaces the card with the same name.</span>
        <input
          ref={importRef}
          type="file"
          hidden
          accept=".bin"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            if (f.size !== 128 * 1024) {
              toast({ kind: 'error', text: 'A VMU image is exactly 128 KB.' });
              return;
            }
            // Reuse the folder the core already writes VMUs to, if we've seen one.
            const same = saves.find((s) => s.path.split('/').pop() === f.name);
            const anyVmu = saves.find((s) => /vmu_save_|\.[A-D][1-2]\.bin$/i.test(s.path));
            const dir = (same ?? anyVmu)?.path.replace(/\/[^/]+$/, '') ?? '/saves/dc';
            await storeSaveFile(`${dir}/${f.name}`, new Uint8Array(await f.arrayBuffer()));
            toast({ kind: 'success', text: `Imported ${f.name}.` });
            void refresh();
          }}
        />
      </div>

      <div className="group-title">Save states</div>
      <div className="row">
        <button
          type="button"
          className="btn btn-sm btn-ghost btn-danger"
          onClick={() => {
            if (confirm('Delete all save states for every game?')) void db.clear('states').then(() => toast({ text: 'Save states deleted.' }));
          }}
        >
          Delete all save states
        </button>
      </div>
    </div>
  );
}
