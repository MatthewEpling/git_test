# Content packs

A content pack is one JSON file holding everything the engine knows about cards, monsters, events, gear and rule values. The engine has no game content built in, so correcting or extending content never needs a code change.

- The built-in pack, `src/content/standin/pack.json`, is **original stand-in content**. Use it as a template: on the title screen, choose **Content packs → Download template**.
- Packs you import are marked `user-provided` and stored **only in that browser** (IndexedDB). Remove them from the same panel.
- On import, a pack must pass the zod schema (`src/content/schema.ts`) and the cross-reference checks (`src/content/validate.ts`). For example: every resource, gear, location and event id that something refers to exists; every roll table covers each die face exactly once; and AI decks have enough cards for each level. Any errors are listed so you can fix them.
- A save records which pack and version it was made with. If you change a pack, an older save may no longer replay; the game says so instead of guessing.

## Top-level sections

| Section | What it holds |
| --- | --- |
| `meta` | `id` (lower-case-with-hyphens, unique), `name`, `version`, `source`, `notes` |
| `rules` | Every rule number the engine uses, plus `verification` notes (see the rules backlog) |
| `resources` | `id`, `name`, `kind` (basic / monster / strange), `keywords` |
| `gear` | Weapons (`speed`, `accuracy`, `strength`, `range`), armor (`locations`, `value`), stat `bonuses`, crafting `cost` (resource ids or `keyword:<word>`), `craftedAt` location |
| `locations` | Settlement locations: build cost in endeavors and resources, `startsBuilt` |
| `innovations` | Endeavor cost, prerequisites and grants (survival limit, endeavors per year) |
| `monsters` | `size`, `levels` (movement, toughness, modifiers, AI deck composition, hunt position, rewards), `aiCards`, `hitLocations`, `resourceDeck`, `huntSpaces` |
| `huntEvents` + `huntEventTable` | Events and the die table that picks them |
| `basicResourceDeck` | Resource id → copies |
| `severeInjuries` | One die table per hit location. `record: false` marks results that don't stay on the survivor's sheet |
| `timeline` | Events by lantern year |
| `campaign` | Settlement name, number of starting survivors, survivor names, starting resources and gear, starting quarry, last year |

## The effect language

AI cards (`before`, `onHit`, `noTarget`), hit locations (`reflex`, `failure`, `wound`, `critical`), hunt events, injury results and timeline events all list **effects**:

| Effect | Meaning |
| --- | --- |
| `{ "op": "damage", "who": W, "amount": n, "location": L? }` | Damage one location (`random` rolls the hit location die) |
| `{ "op": "knockdown", "who": W }` | Knock down (showdown only) |
| `{ "op": "knockback", "who": W, "spaces": n }` | Push straight away from the monster |
| `{ "op": "survival" \| "insanity", "who": W, "amount": ±n }` | Change survival or insanity |
| `{ "op": "stat", "who": W, "stat": S, "amount": ±n, "duration": "showdown" \| "permanent" }` | Change a stat |
| `{ "op": "severeInjury", "who": W, "location": L }` | Roll on a severe injury table |
| `{ "op": "death", "who": W, "cause": "…" }` | Kill a survivor |
| `{ "op": "resource", "id": R, "count": n }` | Gain resources |
| `{ "op": "huntMove", "spaces": ±n }` | Move the hunting party on the hunt board |
| `{ "op": "choice", "prompt": "…", "options": [{ "label", "detail", "effects" }] }` | Ask the player |
| `{ "op": "roll", "label": "…", "die": n, "table": [{ "min", "max", "label", "effects" }] }` | Roll on a table |
| `{ "op": "log", "text": "…" }` | Just note something |
| `{ "op": "manual", "text": "…" }` | **Anything the engine can't do yet.** The game pauses and asks you to apply it by hand. |

`who` (W) is one of: `attacker` (the survivor whose attack caused this), `target` (the monster's target, or the survivor an injury belongs to), `all`, `random`, or `choose` (the player picks).

AI card `targeting` is one of `closest`, `closestInFront`, `lastAttacker`, `mostInjured` or `random`, with optional `reach` (in squares). A card with `move: false` doesn't move.

## Workflow for your own copy

1. Download the template.
2. Change `meta.id` and `meta.name`.
3. Correct the `rules` values against your rulebook. Change a `verification` entry's status to `verified` once you've checked it.
4. Replace the stand-in monsters, events, gear and so on with data from your cards. Use `manual` for any effect the language can't express.
5. Import the file. Fix any listed errors, then start a new campaign with your pack.

Keep the file on your own device. Don't commit it to this repository or publish it.
