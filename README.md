# Tiny Civilization 🏡

A playful little social world: each person cares for one tiny creature, and everyone's small creations (doodles, notes and objects) gradually shape a shared storybook meadow.

> **Local prototype.** There is no backend yet. Everything is saved in your browser's `localStorage`, and the neighbouring creatures and their reactions are sample content, simulated so the world feels alive.

## Run it

Requires Node 18+.

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

```bash
npm test           # unit tests for the world state (Vitest)
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
```

## What's in the MVP

- **World map** (main screen): a hand-drawn meadow with creature homes and community creations. Tap a home to visit it, a creature to say hi, or a tree for a surprise. A 🌙/☀️ toggle switches to night, with fireflies.
- **Your creature**: name, kind, color, accessory, personality, status and home style, chosen at first launch and editable under **Me**.
- **Daily prompt**: rotates each day (e.g. “Make something your creature would build from a leaf.”).
- **Create**: a freehand doodle, a short note or an emoji object, optionally tagged with today's prompt, then placed by tapping a spot on the map.
- **Community feed**: recent creations with reactions (🌱 💛 ✨ 😄) and friendly comments, plus quick “kind words” chips.
- **Visiting and gifts**: visit any creature's home, see their gift shelf, and leave a gift with a tiny note.
- **The world grows**: as more creations appear, the meadow gains wildflowers, lanterns, a bridge, a hot-air balloon and a lighthouse.

## Stack

Vite + React + TypeScript with plain CSS. The project was empty, so I picked a mainstream stack that starts instantly and builds to static files. The art is inline SVG; there are no image assets or UI libraries.

```
src/
  App.tsx              app shell, views, sheets, simulated neighbours
  lib/store.ts         reducer + localStorage persistence
  lib/seed.ts          sample creatures and creations
  lib/content.ts       prompts, gifts, reactions, milestones, chatter
  components/          WorldMap, Terrain, CreationCard, CreateForm, DoodlePad, VisitHome, …
```

## Accessibility

- Text uses dark ink on cream paper for high contrast.
- Every interactive element is a real button with a label, and focus rings are visible.
- Sheets are built on native `<dialog>`, so focus is trapped and Escape closes them.
- With `prefers-reduced-motion` set, all animation stops.
- Placement can be done without precise tapping via **Near my home**.
