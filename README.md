# Iron Navigator

A personalised, checkable progression guide for Old School RuneScape Ironman accounts — Sailing included.
Type a name, Iron Navigator reads the hiscores, you optionally paste your WikiSync data, and you get an account
snapshot plus a BRUHsailer-style chapter guide that ticks itself off as you progress.

## Run it

```bash
npm install
cp .env.example .env.local   # optional: add ANTHROPIC_API_KEY for the AI coach
npm run dev                  # http://localhost:3000
```

Requires Node 18.18+ (20+ recommended). TypeScript is pinned to 5.x because Next.js 15 doesn't support TypeScript 7 yet.

## Deploy to Vercel

1. Push this folder to a GitHub repo.
2. Import it at vercel.com/new (framework preset: Next.js, no build settings to change).
3. Add environment variables (Project → Settings → Environment Variables):
   - `HISCORES_USER_AGENT` — e.g. `IronNavigator/1.0 (your-site.com; you@example.com)`. Jagex and Wise Old Man ask for a descriptive UA.
   - `ANTHROPIC_API_KEY` — optional, enables the AI coach.
   - `ANTHROPIC_MODEL` — optional, defaults to `claude-sonnet-5-5`.
4. Deploy.

## What's where

| Path | What it does |
| --- | --- |
| `app/page.tsx` | Home: name search + account type |
| `app/player/[rsn]/setup` | Membership, playstyle, hours/day, goal (saved to localStorage) |
| `app/player/[rsn]` | Account snapshot: skills grid, quests, diaries, clog, boss KC, unlocks, bottlenecks, stage |
| `app/player/[rsn]/guide` | Chapters, checkable steps, filters, branches, next 10, print, copy-as-markdown, AI coach |
| `app/sync` | WikiSync setup help |
| `app/api/hiscores` | Server proxy for the official hiscores (Ironman/HC/UIM; GIM via main), 7-min cache, Wise Old Man fallback, de-iron detection |
| `app/api/coach` | Optional Claude coach, rate-limited (8 req / 10 min / IP, per instance) |
| `lib/engine.ts` | Rules engine: merges wiki requirements into steps, marks done/ready/blocked, inserts training steps, bottlenecks |
| `lib/wikisync.ts` | Client-side parser for pasted WikiSync data |
| `lib/account.ts` | Merges hiscores + WikiSync + manual ticks into one account model (unknowns stay unknown) |
| `data/guide.json` | The master step list — edit this to change the guide |
| `data/quests.json`, `data/diaries.json`, `data/clog-notable.json` | Generated from the OSRS Wiki |
| `data/training.json` | Short training suggestions used for inserted "Train X" steps |
| `data/version.json` | Date the guide was last checked; shown in the footer |

## Keeping game data fresh

```bash
npm run wiki:sync
```

Pulls every quest (quest points, prerequisite quests, skill and QP requirements) and every achievement diary tier's
requirements from the OSRS Wiki, plus item IDs for the notable collection log list. Run it after quest releases,
then bump `data/version.json`. It's a build-time script — the site never hits the wiki per page view.

## Editing the guide

Each step in `data/guide.json` follows the `Step` type in `lib/types.ts`. The useful extras:

- `completesWhen` — `quests`, `questsStarted`, `diaries`, `skills`. The step auto-ticks when the player's data
  meets it, **and** the quest/diary requirements are merged in from the wiki data, so you rarely need to list them.
- `branch` + `branchOnly` — branch point options point at step ids that only appear when chosen.
  The default option follows the player's playstyle.
- `saves` — shown on Sailing steps as "Saves elsewhere".
- `notes.hardcore | ultimate | group` — shown only for that account type.
- `f2p: true` — shown to free-to-play accounts (everything else is members-only).

## Data rules (built in)

- Never guesses: unranked skills show "—", unsynced quests/diaries show "?" or "not synced".
- Never calls the WikiSync API; the player opens their own WikiSync page and pastes it.
- Hiscores requests are cached and sent with a descriptive User-Agent; API keys stay server-side.
- OSRS Wiki credited on every page (CC BY-NC-SA 3.0); not affiliated with Jagex.

## Things to check before launch

- WikiSync's export format: the parser expects `quests` (0/1/2), `achievement_diaries`
  (`{region: {tier: {complete, tasks[]}}}`), `levels`, `combat_achievements`, `collection_log` and
  `collectionLogItemCount`, and tolerates missing pieces. Paste a real export and confirm everything lands.
- The `/sync` page has screenshot placeholders — drop real screenshots in `public/` and swap them in.
- The coach's rate limit is in memory per serverless instance. For a hard global limit use Upstash/Vercel KV.
- Supabase sync across devices is not built; progress lives in localStorage per browser.
