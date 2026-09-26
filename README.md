# LANTERN

An original, fully 3D, science-inspired sci-fi exploration game that begins in our real
Solar System and expands into the unknown. Built with three.js, Rapier and TypeScript.

- Design (what & why): [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md)
- Architecture (how the code is organised): [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

## Run it

Requires Node.js 18+ (20+ recommended) and a browser with WebGL2 (Chrome, Edge, Firefox).

```bash
npm install          # installs every library the game uses
npm run dev          # or: npm run start — then open http://localhost:5173
```

Other scripts:

| Script | Purpose |
|---|---|
| `npm run build` | Type-check and produce a production build in `dist/` |
| `npm run preview` | Serve the production build |
| `npm test` | Unit, content-validation and save tests (Vitest) |
| `npm run typecheck` | TypeScript only |

## Controls

| Action | Keys |
|---|---|
| Move / jump / sprint / crouch | WASD · Space · Shift · C |
| Look | Mouse (click the game to capture the cursor) |
| Cycle camera view (1st person / behind / front) | V |
| Interact | E |
| Scan (hold) | F |
| Multi-tool: mine, weld (hold) | Left mouse |
| Headlamp | L |
| Inventory · Journal · Map | Tab/I · J · M |
| Pause | Esc / P |
| Quicksave · Quickload | F6 · F9 |
| Ship flight | W/S throttle · A/D strafe · Space/C up/down · Q/E roll · mouse steer · Shift boost · Z flight assist · T target · G dock / land / tractor salvage · F scan target · X leave seat |

Ship systems are always operated in first person: walk up to a console and press E, then
click its physical buttons, switches and screens. **Interplanetary travel** is plotted on the
holographic star map at the bridge holo table (reactor power, ship in orbit); take off from a
surface with the pilot seat's flight deck key.

## Dev shortcuts

`http://localhost:5173/?start=moon` (post-crash on the Moon), `?start=ship`, `?start=rich`
(base-building sandbox), `?start=frontier` (Act 2 start, in lunar orbit, ready to plot a
course), `?start=transit`, `?start=marsorbit`, `?start=mars` (landed in Melas Chasma),
`?start=melas` (inside Melas Station); `&quality=low` for weak GPUs. Press `` ` `` for the
debug overlay.

## Assets & licences

All geometry, textures, audio and music are generated procedurally by the game's code.
Earth's coastlines are rasterised from [Natural Earth](https://www.naturalearthdata.com/)
(public domain) by `scripts/build-earth.mjs`; the output is committed in `public/data/`.
