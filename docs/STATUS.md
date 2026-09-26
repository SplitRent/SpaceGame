# Implementation status — vertical slice (Act 0 → end of Act 1)

This file tracks what exists and how to verify it. Design lives in `GAME_DESIGN.md`,
code structure in `ARCHITECTURE.md`.

## Playable now

| Area | What works |
|---|---|
| Title / flow | Title screen with live 3D backdrop, new game (named player), continue/load, settings, about |
| Act 0 — The Expedition | Earth spaceport launch cinematic → orbit & Lantern reveal → playable trans-lunar coast aboard the intact Lantern (meet the crew, first-person diagnostic, lab sample, medbay check, Earth from the window) → approach → the Blackglass → crash cinematic |
| Act 1 — Stranded | Wake in the dark, listing ship. Power (fuel cell + breaker-order puzzle), air (sealant crafting, breaches, scrubbers, repressurize — helmets come off), base camp (8 pads, 8 module types, solar/battery power over day/night), Shadow Crater ice at −228 °C, ice processor → propellant, reactor (actuator, coolant valve order, start-up sequence), comms (hull antenna, relay kit, Earthrise Summit, dish alignment panel, call to Earth), Kepler-9 (keycard, tunnels, drones, star tracker, seismic logs, the anomalous cavity), navigation calibration (timed star locks), drive (injectors, 3 hull welds, levelling struts), launch from the pilot seat |
| Side content | Treat Kit, Blackglass fragment analysis (scanner tier 2), the commander's office and log (truth or lie to Rafi), the fallen Harbor module, the greenhouse |
| Ship | Walkable 3-deck interior; dark → emergency → powered states; sparks, breaches with light shafts, dust motes, 7° list and levelling; status boards; first-person consoles with physical buttons/switches/breakers/valves/slots and diegetic screens |
| Flight | Launch cinematic → lunar orbit; 6DOF flight with assist toggle, boost, electric RCS fallback; cockpit / chase / front views; targets, scanning, salvage canisters, docking with Harbor, landing back at base, leave the seat and walk the ship in orbit |
| Harbor Station | Dock, walk the habitation ring, meet the survivors, end-of-Act-1 revelation; undock and keep flying |
| Systems | Suit (O₂, power, cold, health, stamina), headlamp, scanner + science database (20 entries), multi-tool mining/welding/overrides, inventory + containers, facility-based crafting, base power, crew schedules, barks, save/load (6 slots, autosave, quicksave, export/import), death caches, survey map, 3 camera views everywhere on foot and in flight |

## How to verify

```bash
npm install
npm test                 # unit + content validation + save round-trip tests (Vitest)
npm run dev              # then in another terminal:
node scripts/e2e-smoke.mjs   # new game → opening → Act 0 → crash → wake → save/load → transition leak check
node scripts/e2e-act1.mjs    # power → air → base → reactor through the real first-person consoles
node scripts/e2e-late.mjs    # launch → orbit → save/load position → dock → Harbor → undock
```

Dev shortcuts (dev server only): `?start=moon | ship | rich | powered | k9 | launch | orbit | harbor`,
`&quality=low`, and `` ` `` toggles the debug overlay (fps, draw calls, triangles, memory, listeners).

## Known limitations / next steps

- Characters and props are procedural low-poly; CC0 art packs are not wired in yet (`assets:fetch` is planned, not implemented).
- No voice acting; text + subtitles + synthesised radio.
- Kepler-9 drones are the only hostile; wildlife arrives with fictional worlds (Act 4).
- Earth is orbit-only (decision pending); the star map/transit to Mars etc. is the next milestone (EARLY tier).
- Gamepad support not yet implemented.
