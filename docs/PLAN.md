# Implementation plan

## Starting point

The repository held an unrelated Next.js app (Iron Navigator), which this project replaces; `hello_world.txt` from `main` is kept. There were no existing game assets, rules data or 3D code.

## Constraints that shape the plan

**Legal.** The game's mechanics (stats, dice, turn structure) can be implemented. The game's expressive content (card text, rulebook wording, art, sculpts, the Simulator's assets) is protected, and owning the game doesn't grant permission to copy or redistribute it. Therefore:

- Rules are implemented in my own words.
- The repo ships only original stand-in content.
- Official content can be entered by the owner as a local content pack that stays in their browser.
- Nothing is scraped, extracted or bundled from the Simulator or from fan sites.

**Accuracy.** Rules details I can't confirm are data values flagged `unverified`, and are listed in the rules backlog rather than presented as official. Card effects the engine can't express yet use a `manual` effect that pauses for the player.

**Technical.** The game runs entirely in the browser: static files, IndexedDB for saves, and WebGL 2 with a 2D fallback. The rules engine is pure and deterministic; state is plain data, randomness is seeded, and games are replayable.

## Stages

| Stage | Scope | Status |
| --- | --- | --- |
| 0. Foundations | Vite + React + TS, zod content schemas with cross-reference validation, seeded RNG, serialisable state, job queue with decisions, event log with reasons, replay/undo, IndexedDB persistence, original stand-in pack | **Done** |
| 1. Vertical slice | Settlement → hunt → showdown (monster AI, survivor move/attack, hit locations, wounds, injuries, death) → aftermath → settlement phase (build, innovate, craft, equip) → next year; 3D board with 2D fallback; unit and end-to-end tests | **Done (this PR)** |
| 2. Rules verification | Confirm every `unverified` rule value against the rulebook, fix the defaults, and mark them verified; add tests for each confirmed rule | Next |
| 3. Survivor depth | Gear grid and affinities, armor sets, fighting arts, disorders, abilities and impairments, bleeding, brain trauma, insanity rules, full survival actions, hunt XP and age milestones, weapon proficiency | Planned |
| 4. Showdown depth | Per-monster setup and terrain, full AI targeting keywords, collision and knockback rules, monster traits, moods and persistent injuries, weapon keywords (first strike, reach, sharp, …), choosing hit location order, monster basic action when no AI card is drawn | Planned |
| 5. Campaign depth | Settlement events, principles, population (intimacy, births, naming), milestones, lantern-year timeline structure, quarry levels and nemesis encounters, campaign victory and defeat, settlement locations and innovation deck | Planned |
| 6. Content tooling | In-app content editor, per-card validation reports, local images for your own card scans (local only), pack diffing | Planned |
| 7. Presentation | Better stand-in minis, animated dice, card panels styled after a card layout (original art), sound, accessibility pass, performance tuning and touch controls | Planned |

## Vertical slice: definition of done

- [x] A full year plays end to end through the UI, with no manual bookkeeping.
- [x] The engine pauses only for real decisions: departing survivors, quarry, event choices, ties, dodges, activations, movement, attacks and settlement actions.
- [x] Illegal actions are refused with a reason. The UI shows unavailable options and why.
- [x] Every state change is logged with its cause. Dice are shown.
- [x] The same seed and the same choices give the same game (unit test). Undo works. Saves resume after a reload (end-to-end test).
- [x] 3D board with orbit, pan and zoom, highlights, clickable minis and squares. Keyboard-accessible 2D fallback. Automatic fallback if WebGL is missing or lost.
- [x] Content is data-driven and schema-validated. Users can import packs locally.
- [x] Docs: rules backlog, asset provenance, setup and run instructions.
