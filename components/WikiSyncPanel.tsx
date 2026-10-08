"use client";
import { useState } from "react";
import Link from "next/link";
import { parseWikiSync, WikiSyncParseError, wikiSyncUrl } from "@/lib/wikisync";
import type { WikiSyncData } from "@/lib/types";

export default function WikiSyncPanel({
  rsn,
  sync,
  setSync,
  compact = false,
}: {
  rsn: string;
  sync: WikiSyncData | null;
  setSync: (d: WikiSyncData | null) => void;
  compact?: boolean;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(!sync && !compact);

  const submit = () => {
    try {
      const data = parseWikiSync(text);
      if (data.username && data.username.toLowerCase().replace(/[\s_-]+/g, " ") !== rsn.toLowerCase()) {
        setError(`This data is for "${data.username}", not "${rsn}". Open the WikiSync page for the right account.`);
        return;
      }
      setSync(data);
      setText("");
      setError(null);
      setOpen(false);
    } catch (e) {
      setError(e instanceof WikiSyncParseError ? e.message : "Couldn't read that data.");
    }
  };

  const summary = sync
    ? `${Object.values(sync.quests).filter((s) => s === "done").length} quests done · ${Object.values(sync.diaries).reduce(
        (a, r) => a + Object.values(r).filter((t) => t?.complete).length,
        0,
      )} diary tiers · ${sync.collectionLogCount ?? 0} clog slots`
    : null;

  return (
    <section className="card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">Quests, diaries & collection log</h2>
          <p className="text-sm text-muted">
            {sync ? (
              <>
                Synced {sync.timestamp ? new Date(sync.timestamp).toLocaleString() : ""} — {summary}
              </>
            ) : (
              "Not synced. Hiscores can't see quests or diaries — paste your WikiSync data, or tick things by hand."
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => setOpen((o) => !o)}>
            {open ? "Close" : sync ? "Re-sync" : "Sync now"}
          </button>
          {sync && (
            <button className="btn-ghost" onClick={() => setSync(null)} title="Forget synced data and use manual mode">
              Clear
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-4 space-y-3">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
            <li>
              In RuneLite, install the <b className="text-ink">WikiSync</b> plugin and log in to {rsn}.
            </li>
            <li>Open your Collection Log in-game and click through it so the plugin can record it.</li>
            <li>
              Open your WikiSync page (button below), select everything (Ctrl/Cmd + A) and copy it.
            </li>
            <li>Paste it in the box and press Import.</li>
          </ol>
          <a href={wikiSyncUrl(rsn)} target="_blank" rel="noreferrer" className="btn">
            Open my WikiSync page ↗
          </a>
          <textarea
            className="input h-36 font-mono text-xs"
            placeholder="Paste what you see here."
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
          />
          {error && <p className="text-sm text-bad">{error}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn" onClick={submit} disabled={!text.trim()}>
              Import
            </button>
            <Link href="/sync" className="text-sm text-muted underline hover:text-gold">
              Detailed setup help
            </Link>
          </div>
          <p className="text-xs text-muted">
            Parsed in your browser and saved on this device only. Iron Navigator never calls the WikiSync API itself.
          </p>
        </div>
      )}
    </section>
  );
}
