# Lantern Table

An unofficial, fan-made rules engine and 3D tabletop for playing **your own copy of _Kingdom Death: Monster_** (base game) in a web browser.

> **Not affiliated with or endorsed by Kingdom Death.** This repository contains **original stand-in content only**: no official card text, rulebook wording, art, miniature sculpts or other assets from the game or from KDM Simulator. Official content can be added from materials you own as a _local content pack_, which is validated and stored in your browser and never committed or deployed. See [docs/ASSETS.md](docs/ASSETS.md).

## What works now (vertical slice)

One complete campaign loop, played entirely in the browser:

1. **Settlement**: a new settlement with four survivors; the year's timeline event; choose up to four departing survivors and the quarry level.
2. **Hunt**: the party advances along the hunt board; hunt events resolve automatically from a d10 table or the monster's own hunt spaces. You're asked only when an event offers a choice.
3. **Showdown** on a 22×16 board in 3D (or 2D):
   - The monster draws AI cards, picks targets (asking you only on a genuine tie), moves around survivors and attacks.
   - Hits roll on the hit location die. Armor soaks damage; then light injuries, heavy injuries (knockdown) and severe injury rolls follow. You can spend survival to dodge.
   - Your survivors move and attack: to-hit dice against accuracy and evasion, hit location cards with reflex and failure reactions and traps, and to-wound rolls with criticals.
   - Wounds move AI cards to the wound stack. The monster dies when it runs out.
4. **Aftermath**: rewards are drawn from the basic and monster resource decks, and survivors gain hunt XP.
5. **Settlement phase**: spend endeavors to build locations and innovate, craft gear from resources (keyword costs included), and hand gear to survivors. Then the next lantern year begins. The stand-in campaign ends after year 5.

Throughout:
- Every step is logged with **why** it happened (the card or rule, the dice and the numbers compared).
- Illegal options are shown greyed out with the reason.
- **Undo** steps back any number of choices.
- The game autosaves in your browser. "Export save" writes the seed plus every choice, which reproduces the game exactly.

The rules values I couldn't confirm from the rulebook are **flagged as unverified** in the content data and listed in [docs/RULES_BACKLOG.md](docs/RULES_BACKLOG.md), together with everything still missing for full base-game coverage.

## Run it

Requires Node 20+ and a current Chrome, Edge, Firefox or Safari. WebGL 2 is used for 3D; without it the game uses a 2D board.

```bash
npm install
npm run dev            # http://localhost:5173
npm run build          # type-check + production build in dist/ (static files, no server needed)
npm run preview        # serve dist/ locally
```

Tests:

```bash
npm test               # engine + content unit tests (vitest)
npm run test:e2e       # plays the campaign through the real UI in headless Chromium; screenshots in test-results/
```

`dist/` is a static site; any static host works. `netlify.toml` builds it for Netlify deploy previews.

## How to play

- **Begin** a campaign from the title screen. The seed decides every roll and shuffle: the same seed and the same choices always give the same game.
- The **decision panel** on the right is where you answer the game. Options are grouped; unavailable ones say why.
- In a showdown you can also **click the board**: highlighted squares to move, highlighted survivors to choose them, the monster to attack when one weapon applies.
  - Camera: drag to orbit, right-drag or shift-drag to pan, scroll to zoom. **Reset camera** restores the default view.
  - **2D** switches to a flat, keyboard-accessible board: Tab to a highlighted square or survivor, then press Enter.
- **Survivor sheets** sit below the table: stats (gold numbers include gear and showdown modifiers), survival and insanity, armor and injury boxes per location while away from the settlement, and gear and injuries.
- **Event log**: expand an entry (ⓘ) to see why it happened. Filter by rolls or by your choices.
- **Undo** rebuilds the game without your last choice. **Menu** returns to the title screen; the game is saved after every choice.

## Using your own content

The title screen's **Content packs** panel offers **Download template**, which is the stand-in pack in the full format, and **Import pack**.

A pack is one JSON file containing rule values, resources, gear, locations, innovations, monsters (levels, AI cards, hit location cards, resource decks, hunt spaces), hunt events and the event table, severe injury tables, the timeline and campaign setup.

Imported packs are schema- and cross-reference-checked, then stored in IndexedDB in that browser only. See [docs/CONTENT_PACKS.md](docs/CONTENT_PACKS.md). Card effects the engine can't express yet can be written as `manual` effects: the game pauses and asks you to apply them by hand rather than skipping them.

## Architecture

```
src/
  content/   schema.ts (zod schemas for every kind of content + rule values), validate.ts (cross-references),
             standin/pack.json (original stand-in content)
  engine/    pure TypeScript, no DOM: state.ts (serialisable game state), rng.ts (seeded sfc32), core.ts,
             effects.ts (content effect language), board.ts (geometry, pathing), campaign.ts (years, hunt,
             aftermath, settlement), showdown.ts, engine.ts (newGame / apply / replay), autoplay.ts
  render/    view.ts (board view model), board3d.ts (three.js scene, lazy-loaded), webgl.ts
  persist/   store.ts (IndexedDB saves and packs, memory fallback, import/export)
  ui/        React: App (title, packs, saves), Game (layout, undo, autosave, errors), panels, Board (3D + 2D)
tests/       unit/ (vitest), e2e/run.mjs (Playwright)
docs/        PLAN.md, RULES_BACKLOG.md, ASSETS.md, CONTENT_PACKS.md
```

The engine runs a queue of jobs and stops whenever it needs a player decision. A decision lists every option, including disabled ones with their reasons. Answering a decision is a `Command {decisionId, optionId}`. A save is just `(content pack, seed, commands)`: loading replays the commands, and undo replays all but the last. The engine never reads the clock or `Math.random`, so replays are exact. A unit test checks this.

## Known limitations

- **Content is original stand-in content**: one quarry (two levels), 11 hunt events, 9 gear items, 3 locations and 3 innovations. Full base-game play needs a content pack built from your own copy.
- **Many base-game systems aren't implemented yet**, including fighting arts, disorders, the gear grid and affinities, bleeding, brain trauma, most survival actions, terrain, nemeses, settlement events, principles, population and births, milestones, and per-monster showdown setup. These are listed in [docs/RULES_BACKLOG.md](docs/RULES_BACKLOG.md).
- **Several core rule values are recalled from memory**, so they're marked unverified and editable in the pack's `rules` section.
- **Undo after a die roll** lets you try a different choice, and later rolls may then differ. It's meant for correcting mistakes.
- **No touch-specific controls.** The 3D view works with touch orbiting, but the game is designed for desktop sizes.
