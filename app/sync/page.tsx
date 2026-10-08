import Link from "next/link";

export const metadata = { title: "WikiSync setup — Iron Navigator" };

const STEPS = [
  {
    title: "Install RuneLite",
    body: "WikiSync is a RuneLite plugin. If you play on the official client, install RuneLite from runelite.net first.",
    shot: "RuneLite launcher",
  },
  {
    title: "Install the WikiSync plugin",
    body: "Open the Plugin Hub (the wrench icon → Plugin Hub), search “WikiSync”, and click Install. It's made by the OSRS Wiki team.",
    shot: "Plugin Hub search for WikiSync",
  },
  {
    title: "Log in to your Ironman",
    body: "Log in normally. WikiSync records your quests, achievement diaries, levels and combat achievements automatically.",
    shot: "Logged in, WikiSync enabled",
  },
  {
    title: "Record your collection log",
    body: "Open the Collection Log in-game and click through the tabs. Then press the WikiSync button in the log so it saves your entries.",
    shot: "Collection log with the WikiSync button",
  },
  {
    title: "Open your WikiSync page",
    body: "On your player page in Iron Navigator, press “Open my WikiSync page”. It opens sync.runescape.wiki for your name in a new tab.",
    shot: "WikiSync page in the browser",
  },
  {
    title: "Copy everything and paste it back",
    body: "Select all (Ctrl+A / Cmd+A), copy, come back and paste into the box, then press Import. If you see an error, the copy was probably cut off — try again.",
    shot: "Paste box on the snapshot page",
  },
];

export default function SyncHelp() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-3xl font-bold text-gold">Sync with WikiSync</h1>
      <p className="mt-2 text-muted">
        The hiscores show levels and boss kills, but not quests, diaries or your collection log. WikiSync fills that gap. You copy your own data; we
        never call the WikiSync API, as the OSRS Wiki asks third-party sites not to.
      </p>
      <ol className="mt-6 space-y-4">
        {STEPS.map((s, i) => (
          <li key={s.title} className="card grid gap-4 sm:grid-cols-[1fr_200px]">
            <div>
              <p className="label">Step {i + 1}</p>
              <h2 className="mt-1 text-lg font-bold">{s.title}</h2>
              <p className="mt-1 text-sm">{s.body}</p>
            </div>
            <div
              className="flex h-28 items-center justify-center rounded-md border border-dashed border-line bg-panel2 p-2 text-center text-xs text-muted"
              aria-label={`Screenshot placeholder: ${s.shot}`}
            >
              Screenshot: {s.shot}
            </div>
          </li>
        ))}
      </ol>
      <div className="card mt-6">
        <h2 className="text-lg font-bold">Prefer not to use RuneLite?</h2>
        <p className="mt-1 text-sm">
          Use manual mode: on your snapshot page, mark quests done, click diary cells to tick them, and toggle key unlocks. We never guess quest progress
          from levels.
        </p>
      </div>
      <p className="mt-6 text-center">
        <Link href="/" className="btn">
          Back to search
        </Link>
      </p>
    </div>
  );
}
