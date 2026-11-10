# Contributing

## Setup

Node 20.19 or newer is required.

```bash
npm install
npm run dev
```

## Checks

Run these before opening a pull request:

```bash
npm run typecheck
npm test
npm run lint
npm run build
```

## Layout

- `src/engine/` - pixel buffers, composites, palettes, export formats, procedural tools. No React or DOM.
- `src/editor/` - canvas interaction, tools, timeline, export wiring.
- `src/store/` - project and UI state.
- `src/studios/` - the studio screens and their example gallery.
- `src/components/` - shared dialogs and presentation pieces.
- `tools/scene-forge/` - optional Java tool that renders the opening and hero scene data.

The engine is deliberately framework-free. If a change belongs to drawing or
file formats, put it in `src/engine/` and keep it testable without a browser.

## Style

- TypeScript, two-space indentation, single quotes.
- Comments describe why something is done, not what the next line does.
- Keep new UI keyboard reachable and give controls an accessible name.
- New engine behaviour should come with a Vitest test.
