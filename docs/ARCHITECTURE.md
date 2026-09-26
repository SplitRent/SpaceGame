# LANTERN — Architecture

This document explains the *principles and structure* of the codebase. The design (what
and why) lives in `GAME_DESIGN.md`; details of how live in the source.

## Stack

| Concern | Choice |
|---|---|
| Build / dev server | Vite + TypeScript (strict) — `npm install`, then `npm run dev` (or `npm run start`) |
| Rendering | three.js (WebGL2) + `postprocessing` (bloom, ACES tone mapping, SMAA, vignette) |
| Shadows | three.js cascaded shadow maps (`CSM`) on large outdoor locations |
| Physics | Rapier (`@dimforge/rapier3d-compat`, WASM) — one world per active location |
| UI | Preact + `@preact/signals` DOM overlay; in-world ship screens are canvas textures |
| Saves | IndexedDB (`idb-keyval`) with memory fallback, zod-validated, versioned migrations, JSON export/import |
| Audio | Procedural WebAudio (no asset files required) |
| Tests | Vitest (logic, content validation, save round-trips); headless Chromium smoke via `playwright-core` |

## Core rules

1. **State is truth; the scene is a projection.** Everything meaningful lives in one
   serializable `GameState` (`src/state/GameState.ts`). Only the `Store`
   (`src/state/Store.ts`) mutates it, emitting events (`changed`, `itemAdded`,
   `questStage`, `systemChanged`, …). Locations rebuild their visuals from state in
   `onStateChanged()`. Nothing in a 3D scene is the owner of gameplay truth.
2. **Content is data.** Items, recipes, quests, dialogue, NPCs, ship systems, base
   modules, database entries and celestial bodies are typed data in `src/content/`. A
   shared **Conditions/Effects DSL** (`content/types.ts`) is used by quests, dialogue,
   interactions, NPC presence and recipes, and evaluated in one place (`Store.check/apply`).
3. **Idempotency.** One-time effects (quest rewards, stage completion, dialogue effects,
   first-scan rewards) go through `Store.grant(id, effects)`, which records the id in a
   persistent ledger. Re-running logic after load can never duplicate rewards.
4. **Quests are state-derived.** An objective is complete while its condition holds
   (`gameplay/quests.ts`), so quest progress is always consistent with the world after
   save/load and never depends on transient runtime events.
5. **NPC presence is derived.** `resolvePresence()` (`gameplay/presence.ts`) is a pure
   function of state + day phase that returns where each crew member is and what they are
   doing. NPC positions are never saved; they cannot contradict progress.
6. **Scoped lifetimes.** `engine/Scope.ts` owns subscriptions, listeners, timers and GPU
   resources. Each location, UI panel and session binding has its own scope and is
   disposed as a unit, preventing leaked listeners, duplicated loops and GPU leaks.
7. **Strict transitions.** `LocationManager` is a state machine
   (`idle → exiting → loading → entering → idle`). Only one transition may be in flight;
   input is locked (context `cinematic`) and saving is blocked while not idle.
8. **Input contexts.** `input/Input.ts` keeps a context stack (`gameplay`, `flight`,
   `panel`, `ui`, `dialogue`, `cinematic`, `menu`); only the top context receives actions.
9. **Safe saves.** `Game.canSave()` refuses during transitions, cinematics, dialogue or
   death; autosaves are *deferred* to the next safe moment rather than dropped. Loading
   validates → migrates → reconciles content → resolves a safe spawn → places NPCs.

## Layout

```
src/
  Game.ts            orchestrator: main loop, session binding, saving, death, overlays, repairs
  engine/            Scope, EventBus, Rng, math
  input/             Input (bindings + context stack + pointer lock)
  state/             GameState, Store (conditions/effects), newGame, reconcile
  save/              SaveManager (zod schemas, checksum, atomic writes), migrations
  content/           data: items, recipes, quests, dialogue, npcs, shipSystems, baseModules, database, bodies
  gameplay/          inventory, crafting, quests, dialogue, suit, tools, base, crew, presence
  interaction/       Interactable, InteractionSystem (crosshair raycast), PanelController (first-person panels)
  camera/            CameraDirector (1st / behind / front views, overrides, collision, shake)
  player/            Player (Rapier kinematic character controller, per-location gravity)
  physics/           PhysicsWorld wrapper
  render/            Renderer (two-layer render + post), sky, planets (procedural shaders), particles, screens
  procgen/           terrain (heightfield + LOD chunks), astronaut, lanternShip, rocks, baseMeshes, kit, textures
  locations/         Location base, LocationManager, registry (lazy code-split), and each location
  story/             StoryDirector (opening, load intros, story events, tracked objective)
  ui/                Preact HUD, overlays, title screen
  debug/             dev scenarios (?start=moon|ship|rich)
```

## Adding content

- **Item / recipe / module / system:** add an entry to the relevant `src/content/*.ts` list.
- **Quest:** add a `QuestDef` with stages whose objectives are conditions; rewards are effects.
- **NPC:** add an `NpcDef` with presence rules and a dialogue graph; add spots to the locations they appear in.
- **Location:** subclass `Location`, register in `locations/registry.ts` (lazy import), define spawns/portals.
- **Planet/moon:** add a `CelestialBodyDef` (`content/bodies.ts`); rendering uses `render/planets.ts`.

`tests/content` validates that every reference resolves, so broken content fails CI instead of at runtime.

## Performance principles

- Only the active location exists; everything else is disposed.
- Large structures are merged per material (`procgen/kit.ts`); scatter uses instancing.
- Terrain uses LOD chunks with skirts; physics uses one heightfield matching the render grid exactly.
- Particle pools have fixed capacity. Quality presets scale pixel ratio, shadows and bloom.
- Deterministic procedural content (terrain, rocks, nodes) is regenerated from seeds and never saved — only deltas are.
