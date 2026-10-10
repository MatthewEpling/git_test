# Assets: plan and provenance

## Policy

- **Nothing** is copied, extracted, scraped or redistributed from _Kingdom Death: Monster_, its rulebook, cards, art or miniatures, or from KDM Simulator or fan sites. Owning the game doesn't grant a licence to copy or redistribute its digital or printed assets.
- Mechanics are implemented in original wording. Game and product names are used only to say what the software is for (nominative use).
- Everything visual in this repository is **original** and generated in code, or comes from an **open-source library** under its licence.

## 1. Original or properly licensed (in the repo or bundled)

| Asset | Where | Origin | Licence / permitted use |
| --- | --- | --- | --- |
| Survivor miniatures (base, ring, body, head, arm, lantern) | `src/render/board3d.ts` → `survivorMini` | Built from three.js primitive geometries in code for this project | Original; part of this repository |
| Gloam Stag miniature (body, legs, neck, head, glowing antlers, base) | `board3d.ts` → `stagMini` | Built from three.js primitives in code for this project | Original |
| Board texture (stone squares, speckle, grid) | `board3d.ts` → `boardTexture` | Drawn on a canvas at runtime | Original |
| Name labels | `board3d.ts` → `labelSprite` | Drawn on a canvas at runtime, system font | Original |
| Lighting, floor, fog | `board3d.ts` | three.js lights and materials | Original |
| 2D board | `src/ui/Board.tsx` | SVG drawn by the app | Original |
| UI styling, colours, icons (Unicode symbols: ⛨ ↶ 🜂 ✦ ⓘ) | `src/ui/styles.css`, components | Written for this project; symbols come from system fonts | Original; fonts are the user's system fonts |
| Stand-in content: the "Ashen Proving" pack (the Gloam Stag, its AI and hit location cards, hunt events, gear, locations, innovations, injuries, timeline, survivor names) | `src/content/standin/pack.json` | Written for this project | Original; labelled as stand-in in the app |
| three.js | npm `three` | mrdoob and contributors | MIT |
| React, React DOM | npm | Meta and contributors | MIT |
| Zod | npm | Colin McDonnell and contributors | MIT |
| Vite, @vitejs/plugin-react, Vitest | npm (build and test only) | Vite and Vitest teams | MIT |
| Playwright | npm (tests only) | Microsoft | Apache-2.0 |
| sfc32 PRNG, cyrb128 hash | `src/engine/rng.ts` | Published algorithms (Chris Doty-Humphrey; bryc) | Public domain |

No fonts, images, models, sounds or textures are downloaded at runtime.

## 2. Placeholders (development stand-ins)

Every visual and every piece of game content in the repo is a placeholder for the real thing:

- The survivor and monster minis are simple primitive figures, not sculpts of the official miniatures. Their colour rings identify each survivor.
- The Gloam Stag and the whole Ashen Proving pack stand in for the base game's monsters, events and gear. The app labels them "Stand-in content".
- Cards are text panels with an original layout. They aren't styled after official card art.

## 3. Assets you may provide from materials you own

- **Card and rules data** (text and numbers) as a local content pack. It's stored in your browser's IndexedDB and is never uploaded, committed or deployed. This is the supported path today. See `docs/CONTENT_PACKS.md`.
- **Images** (photos or scans of your own cards or painted miniatures): not supported yet (backlog G). The plan is local-only storage on the same terms as packs. Check Kingdom Death's own fan-content and IP terms before sharing anything outside your device.
- **3D models** you create or are licensed to use (for example, your own scans of minis you painted): not supported yet. A future loader would accept glTF files kept locally. Don't commit models derived from official sculpts unless you have permission.

If you add any non-placeholder asset to the repository later, add a row to table 1 with its source and licence.
