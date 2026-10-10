# Rules and content backlog

What remains for full _Kingdom Death: Monster_ base-game coverage, and every place where the current behaviour is a guess or a simplification. Nothing listed here is silently invented in play: rule values live in the content pack's `rules` section with a `verification` note, and stand-in behaviour is labelled in the log.

Status key:
- **unverified**: implemented from memory; confirm against the rulebook.
- **simplified**: deliberately reduced for the slice.
- **missing**: not implemented.

## A. Rule values used now (confirm against your rulebook)

All of these are editable in a content pack (`rules.*`) without code changes.

| Key | Current value | Status |
| --- | --- | --- |
| `board` | 22 × 16 squares | unverified |
| `survivorBase` | movement 5; accuracy, strength, evasion, luck, speed 0; survival 1; insanity 0 | unverified |
| `survivalLimitStart` | 1 | unverified |
| `hitLocationDie` | head, arms, body, body, waist, legs | unverified |
| `noLightInjury` | head | unverified |
| `injuryPerHit` | one injury level per hit that gets past armor | unverified |
| `lanternAlwaysSucceeds` / `oneAlwaysFails` | natural 10 always hits/wounds; natural 1 always fails (survivors) | unverified |
| `woundCompare` | to-wound total must **exceed** toughness | unverified |
| `criticalOn` | natural 10, lowered by survivor luck, raised by monster luck | unverified |
| `monsterLanternAlwaysHits` | off | unverified |
| `diagonalMovement` | off: movement and adjacency are orthogonal | unverified |
| `dodge` | spend 1 survival to cancel one hit, once per round, not while knocked down | unverified |
| `monsterActsFirst` | each round: monster turn, then survivors' turn | unverified |
| `maxDeparting` | 4 | unverified |
| `huntBoardLength` | 12 | unverified |
| `endeavorsPerReturningSurvivor` | 1, plus innovation bonuses; unspent endeavors carry over | simplified |

Behaviour that is implemented in code but should be confirmed:

- **Knockdown**: knocked-down survivors can't activate and stand at the end of the survivors' turn. (unverified)
- **Monster death**: a wound removes the top AI card. An empty AI deck is refilled from the AI discard first. A wound with no AI cards left anywhere slays the monster. (unverified)
- **Monster draw**: an empty AI deck is refilled from the discard. If every card is in the wound stack, the monster does nothing that turn. (missing: its basic action)
- **Targeting ties**: ties are put to the player, because the official tie-break order isn't encoded. (simplified)
- **Monster movement**: orthogonal shortest path around survivors; it stops when adjacent, then turns to face its target. No collision, no knocking survivors aside, no passing over them. (simplified)
- **Monster attacks**: need the target adjacent after moving. Hit on (die + monster accuracy modifier) ≥ (card accuracy + survivor evasion). (unverified)
- **Survivor attacks**: dice = weapon speed + survivor speed (minimum 1). Hit on (die + accuracy) ≥ (weapon accuracy + monster evasion). (unverified)
- **Hit location cards**: one per hit, resolved in the order drawn. **Missing:** choosing the order. A trap ends the attack, discards the other drawn cards and reshuffles the deck. (unverified)
- **Reflex timing**: reflex effects resolve before the wound roll; failure effects after a failed wound; wound and critical effects after a wound. Impervious locations can't be wounded but still trigger criticals. (unverified)
- **Survivor movement**: may pass through other survivors but not end on them; can't pass through the monster. (unverified)
- **Survival and insanity**: survival is capped at the survival limit, and neither can drop below 0. (unverified; brain trauma at 0 insanity is missing)
- **Rewards**: draws come from shuffled copies of the basic and monster resource decks at the level's counts, and returning survivors gain 1 hunt XP. (simplified)
- **Death**: only from severe injury results and `death` effects. (Bleeding and other death conditions are missing.)

## B. Survivors (missing unless noted)

- [ ] Gear grid (3 × 3), affinities, armor sets, gear keywords and special rules. Now: a carry limit of 9 items, with armor summed per location. (simplified)
- [ ] Fighting arts, secret fighting arts, disorders, abilities and impairments (fields exist; no effects yet)
- [ ] Bleeding tokens and death by bleeding; brain trauma; frenzy and other insanity effects
- [ ] Survival actions besides Dodge (Encourage, Surge, Dash, Endure, …) and the settlement rules that unlock them
- [ ] Hunt XP milestones and age, courage and understanding with their milestones, weapon proficiency and specialization
- [ ] Permanent injuries with mechanical effects beyond stat changes (e.g. "cannot use two-handed weapons")
- [ ] Renaming, the cannot-depart condition, retired survivors, the skip-next-hunt condition
- [ ] Survivor tokens (+1/−1 stat tokens) vs permanent changes vs gear: the model exists (`mods`), but token sources are missing

## C. Showdown (missing unless noted)

- [ ] Per-monster showdown setup (survivor and monster placement, terrain cards and tiles, starting effects). Now: generic stand-in placement. (simplified)
- [ ] Terrain: blocking, cover, terrain cards and their effects
- [ ] Full AI targeting vocabulary (in field of view, threats, facing, blind spot, range, …) and the monster's "pick a target" tie-break rules
- [ ] Monster traits, moods, persistent injuries and instinct; monster basic action
- [ ] Collision, knockback into other pieces, grab and full-move keywords
- [ ] Weapon keywords: reach (range exists), first strike, sharp, slow, block, cumbersome, …
- [ ] Choosing the order of drawn hit locations; persistent and lingering hit location effects
- [ ] Surviving the showdown versus fleeing; showdown turn limits where a monster has them
- [ ] Nemesis encounters (separate setup, AI, no hunt)

## D. Hunt (simplified)

- [ ] The official hunt board structure: the monster's hunt event cards at set spaces, the d100 hunt event table, survivor and monster movement rules, overwhelming darkness, starvation
- [ ] Hunt event effects that need gear or abilities checks
- [ ] Arriving at the monster: ambush rules (survivors or monster)

Now: survivors advance one space per hunt turn and resolve one event from a d10 table, or the monster's event for that space. Reaching the quarry starts the showdown. (stand-in)

## E. Settlement and campaign (missing unless noted)

- [ ] The official lantern-year timeline (story events, settlement events, nemesis encounters per year), campaign victory and defeat conditions and the finale
- [ ] Settlement events deck; principles (death, new life, society, conviction)
- [ ] Population: intimacy, births, newborn naming, survivor generation, death count milestones
- [ ] Innovation deck mechanics (drawing two and choosing, consequences) and the full innovation list
- [ ] Settlement locations' special rules and endeavor actions; the full gear crafting lists per location
- [ ] Strange resources and special resource keywords; the Lantern Hoard and the starting settlement
- [ ] Endeavor sources as the rules define them. Now: 1 per returning survivor plus innovation bonuses, with leftovers carried over. (simplified)
- [ ] Prologue showdown (first story) and its special rules

## F. Content still needed (from your own copy)

Build these as a local content pack; the schema already covers most of them:

- [ ] Quarry monsters with every level: stats, AI decks, hit location decks, resource decks, hunt events
- [ ] Nemesis monsters
- [ ] Hunt event table and story events
- [ ] Settlement locations, gear, armor sets, resources and the innovation deck
- [ ] Fighting arts, disorders, severe injury tables and the timeline

Where the engine can't express an effect yet, use `{ "op": "manual", "text": "…" }`. The game then pauses for you to apply it by hand.

## G. Engine and tooling

- [ ] Content editor UI and per-card preview
- [ ] Local images for your own card scans or photos (kept in the browser; never deployed)
- [ ] Effect language extensions: conditions, monster-side effects (monster stat tokens, monster movement), deck manipulation, ongoing effects with durations
- [ ] Replay viewer (step through a saved game) and a "why can't I?" explainer for every disabled option (partly done: each disabled option carries a reason)
