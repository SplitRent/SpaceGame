# LANTERN — Canonical Game Design Document

> This is the **canonical source of truth** for what the game is and why its major systems exist.
> Source code explains *how*. Update this file whenever a major design decision is made or changed.
> Working names (Lantern, Harbor Station, Blackglass, Cadence, crew names) are placeholders until confirmed.

---

## 1. Non-negotiables

| # | Requirement |
|---|---|
| N1 | **Fully 3D.** Player, characters, terrain, ship, interiors, planets, stations, props, effects all exist in a real 3D world the player moves through freely. Never 2D / 2.5D / flat scenes. |
| N2 | **Original IP.** Story, characters, ships, UI, factions, creatures, technology and visual identity are original. Broad genre inspiration only. |
| N3 | **Opening cinematic** establishes a real expedition with a real crew before disaster. |
| N4 | **Crash** caused by an event connected to the central mystery (never "random asteroid"). |
| N5 | **Real Solar System first.** Mercury → Pluto, the Moon and selected moons appear as scientifically recognizable interpretations of the real bodies. |
| N6 | **Science-inspired, not simulation.** Known facts are the foundation; unknowns get plausible interpretation. |
| N7 | **Known → Unknown.** Fictional (but scientifically plausible) worlds appear only after Pluto. |
| N8 | **Chained, curated, revisitable universe.** No infinite procedural universe. Locations stay available once unlocked. |
| N9 | **Large spacecraft** that is physically walkable, starts broken, and is repaired through multi-system physical progression that is visible in the ship. |
| N10 | **Ship controls are first-person.** Flying may use any camera view; any access to ship systems/panels is first-person (walking to consoles preferred; pilot seat cockpit screens also allowed). |
| N11 | **Crew are people.** Persistent state, schedules, relationships, state-dependent dialogue. |
| N12 | **Persistent world state + real save/load.** Every meaningful action persists. Loading never replays the full opening. |
| N13 | **No fake systems.** Every UI value is backed by real state. |
| N14 | **Runs locally** via `npm install` then `npm run dev` (or `npm run start`). |

## 2. Pillars

1. **Exploration driven by curiosity** — "I wonder what's over there?"
2. **Survival that creates tension, not chores** — oxygen, cold, radiation matter in hazardous places.
3. **Science as wonder** — real worlds rendered recognizably; scanning and research fill a database of discoveries.
4. **Crew** — a small group of people whose relationships evolve.
5. **Mystery** — the crash was not an accident.
6. **Scale contrast** — the game constantly moves between **personal** (ship/base/crew), **exploration** (walking worlds) and **scale** (flying past planets).

Design filter: *If a feature doesn't make the world, exploration, crew, ship, survival, or mystery more interesting, question whether it belongs.* Fewer, deeper, integrated systems beat many shallow ones.

## 3. Setting

- Near future (2090s). Humanity has: Earth; **Harbor Station** in a halo orbit over the lunar south pole; small lunar outposts; research settlements on Mars; asteroid prospecting; a Jupiter-system research platform; robotic probes to the outer planets. Human presence thins with distance — the known fades into the unknown.
- **The Cadence**: a structured, repeating signal detected years ago from the outer Solar System. The expedition's stated purpose is to investigate it.
- **The Blackglass**: a lightless object that sensors return *wrong*. It intercepts the expedition.

## 4. Story structure

| Act | Name | Summary |
|---|---|---|
| 0 | The Expedition | Celebrated launch from Earth. Crew shuttle docks with the huge **EXV Lantern** in Earth orbit (scale reveal). Playable Earth→Moon cruise: meet the crew, learn controls through real duties. On approach to Harbor Station, the Blackglass appears and discharges. Harbor goes dark; the Lantern loses control. |
| 1 | Stranded | Crash on the Moon's south polar region, far-side facing (no line of sight to Earth). Commander is missing. Survive, build a base, repair the ship, climb to see Earthrise and restore contact, find a Blackglass fragment, abandoned outpost logs of *regular* moonquakes, an anomalous cavity. First launch. |
| 2 | The Frontier | Harbor Station (damaged, survivors) becomes the first hub. Earth orbit, Mars, asteroid belt, Venus aerostat, Mercury. Evidence the Blackglass has visited before. The commander's trail. |
| 3 | The Outer System | Jupiter (Europa/Ganymede), Saturn (rings, Titan, Enceladus), Uranus, Neptune/Triton, Pluto/Charon. The Cadence resolves into coordinates. The expedition was *meant* to be intercepted. |
| 4 | The Unknown | The **Threshold** beyond Pluto; first fictional star system; non-human ruins. |
| 5 | The Truth | Why the Lantern was chosen; the commander's role; the Cadence's source; final decisions. |

Main story gives direction, never confinement. Side content: crew stories, science, salvage, rescue, trade, station contracts, planet-specific stories, environmental storytelling (logs, wrecks, abandoned facilities).

## 5. Crew

The player is the expedition's **EVA & Systems Specialist**, named by the player and addressed gender-neutrally.

| Role | Name | Personality / arc |
|---|---|---|
| Commander | Adaeze Okonkwo | Measured, private. **Missing after the crash.** Knew more about the Cadence than the crew. |
| Pilot | Kit Arakawa | Cocky, warm. Injured in the crash; recovery arc. |
| Chief Engineer | Mira Castellanos | Blunt, practical. Drives repairs. Wants to go home. |
| Planetary Scientist | Dr. Imani Sola | Curious. Obsessed with the fragment. Wants to follow the Cadence. |
| Medic / Life Sciences | Dr. Petra Novak | The crew's anchor. Runs the greenhouse. |
| Comms / Signals | Rafi Haddad | Wry, analytical. Decodes the Cadence with Imani. |

Crew have schedules, occupy stations, react to events, banter and disagree. Their location and dialogue are **functions of game state** — never contradictory with progress.

## 6. The first world: the Moon (south polar region)

Chosen because the expedition is en route to a lunar station when disaster strikes. Scientifically grounded:

- **No native life, no liquid water, no weather.** Vegetation is the crew's greenhouse; threats are environment, reactivated drones and the anomaly.
- **Permanently shadowed craters** hold water ice (~40 K) — dark, cold, flashlight exploration; the source of O₂ and propellant (ISRU).
- **Peaks of near-eternal light** — the solar farm site.
- Sun skims the horizon → long dramatic shadows; compressed day/night (night = cold, power drain, stars).
- **1/6 g** — bounding movement, long falls survivable, ballistic dust.
- Vacuum audio: near silence outside; suit, breath, radio, and contact sounds.
- **Earth is not visible** from the crash site. Climbing to Earthrise Summit to place a comms relay — and seeing Earth rise — is a designed emotional peak.
- The Moon is **permanent**: later revisits unlock a near-side mare region (lava tube), anomaly depths and new dialogue.

Living ecosystems (forests, wildlife) arrive with fictional worlds after Pluto (and potentially an Earth landing chapter — open decision).

## 7. The ship — EXV Lantern

~180 m landing-capable expedition ship, three decks:

- **Deck 1 Command:** bridge (pilot seat + cockpit screens, nav, comms, sensors/science, commander station), observation blister, commander's office.
- **Deck 2 Habitation:** spine corridor, common area/galley, cabins, med bay, science lab, workshop, suit room, main airlock.
- **Deck 3 Engineering:** reactor, engineering control, life support plant, cargo hold with ramp, drive crawlways, rover bay.

After the crash it lists ~7° (floors truly slope), is dark, sparking, and many areas are sealed. Interior gravity in flight is a **documented gameplay simplification**.

### Repair progression (systems graph)

```
Power (batteries → distribution → reactor)
  → Life Support (seal breaches → CO₂ scrubbers → O₂ generation from ice)
  → Comms (short range → Earth line-of-sight relay)
  → Navigation (star tracker → nav core → charts)
  → Propulsion (RCS → main drive → landing struts/hull) + Propellant (ice → LOX/LH₂)
Later: scanners, shields, long-range drive, science suite
```

Every repair is a **physical procedure** (diagnose at console → obtain/craft part → go to the physical location → remove/install/reconnect → restart) and **visibly changes** the ship (lights, screens, machinery, doors). "Collect 10 metal, click Repair" is explicitly not allowed.

## 8. Cameras and control

- **On foot:** three views cycled with one key — **first-person**, **third-person behind**, **third-person front-facing**. Available everywhere on foot.
- **Flying:** the same three views — **cockpit (first-person)**, **chase behind**, **chase front**.
- **Ship systems:** always **first-person**. Using a console/panel forces a first-person panel-focus view and restores the previous view on exit. Panels are physical (buttons, switches, levers, breakers, in-world screens), not floating menus.
- The player may leave the pilot seat while the ship station-keeps/autopilots and walk the interior while space moves past the windows.

## 9. Core gameplay systems (why they exist)

- **Suit:** oxygen, power, temperature, radiation per environment. Tension in hazards, never a constant nag. Upgradeable.
- **Tools (few, versatile):** multi-tool (repair, cut, interact), extraction mode (mine), **scanner** (tiered: basic → rare → hidden signals → unknown tech).
- **Scanning & Database:** discovery is its own reward; entries, clues, coordinates.
- **Resources (small set, many uses):** regolith, iron, aluminum, silicon, titanium, water ice, carbon/volatiles; salvage (scrap, electronics); tech (components, circuits, power cells, sealant); unknown (Blackglass fragment). Scientific uniqueness over RPG rarity colors.
- **Inventory:** suit (limited) → ship cargo / base storage (large). Quest items can never be lost.
- **Crafting tied to facilities:** field (basic), base workbench, ship workshop, lab (research).
- **Research:** analyze samples/artifacts/signals to unlock recipes, upgrades, story.
- **Base:** modular (pads → module → materials → construct → functional). Power budget with day/night (solar + batteries). Visibly grows from emergency camp to outpost.
- **Combat:** minimal, tool-based; hazards, drones, later hostile machines. Not a shooter.
- **Death:** respawn at the last safe point (ship/base/station med bay); suit resources drop in a recoverable cache; quest items kept.
- **Quests:** data-driven, investigative, clue-based; optional markers (accessibility).
- **Dialogue:** state-dependent, remembered, relationship-aware.
- **Economy:** secondary; stations trade supplies, parts, information.
- **Progression:** knowledge, equipment, ship, base, access — **no character levels**.

## 10. Universe structure

- Each body is **data** (real radius ratio, gravity, tilt, rotation, simplified orbit, visual reference, atmosphere, rings, moons) with a play mode: landable surface regions, orbital only, station host, or backdrop.
- **Local space zones** around bodies are fully flyable (scan, mine, salvage, signals, wrecks, dock).
- **Transit** between bodies is plotted at the nav console and plays as a compressed, playable cruise (walk the ship, talk to crew; authored encounters can interrupt).
- **Star map** reveals only what's discovered. Unreachable bodies can be seen long before they can be reached; the game explains why.
- Gas giants have **no walkable surface** — play happens in orbit, stations, moons and atmospheric research.
- After Pluto, the **Threshold** opens travel to other stars. Fictional worlds are built from astrophysical profiles (star class, orbit, tidal locking, mass/gravity, atmosphere, temperature, water) and their biomes and life are derived from that profile.

### Real-body visual references

| Body | Must read as |
|---|---|
| Mercury | Dark grey cratered, scarps, harsh sunlight |
| Venus | Featureless yellow-cream cloud deck; hellish surface unreachable (aerostat play) |
| Earth | Blue oceans, real continents, clouds, atmosphere limb, city lights at night |
| Moon | Grey regolith, maria, craters, no atmosphere, low g |
| Mars | Ochre/red, dark albedo features, polar caps, canyons, dust haze |
| Jupiter | Cloud bands, turbulent edges, Great Red Spot, Galilean moons, colossal scale |
| Saturn | Pale gold bands, broad rings with Cassini division, major moons |
| Uranus | Pale cyan, nearly featureless, faint rings, extreme tilt |
| Neptune | Deep blue, dark storms, bright cirrus, faint rings, Triton |
| Pluto | Tan/grey with bright nitrogen-ice heart plain, reddish tholins, mountains, thin haze |

## 11. Presentation

- **Stylized but impressive**: low-poly/clean geometry, strong silhouettes, emissive tech, atmospheric depth, bloom, particles, animated characters, cinematic cameras.
- Cinematics for major moments only (launch, crash, base activation, first launch, first arrivals, revelations), always skippable with identical state results.
- **Designed wow moments:** Earth from orbit (opening), Lantern scale reveal, Earthrise from the summit, first launch, Mars from orbit, Jupiter filling the sky, Saturn's rings, standing on Pluto, leaving Pluto behind, first unknown planet, the revelation about the crash.
- **Audio** sells environments; music is dynamic, reserved for discovery, danger, story and arrivals.
- Minimal quest markers; the world, logs, scanner and crew guide the player.

## 12. Architecture principles (details in `ARCHITECTURE.md`)

1. **State is truth; the scene is a projection.** All meaningful state lives in one serializable `GameState`, changed only through commands.
2. **Data separate from systems.** Items, quests, dialogue, NPCs, locations, bodies, ship systems, base modules are content data validated by tests.
3. **Locations stream** through a strict transition state machine; transitions are diegetic (airlocks, docking, atmosphere entry).
4. **Scoped lifetimes**: everything a location/UI registers is disposed with it (no leaked listeners, loops, GPU resources).
5. **Idempotent rewards** via a persistent grant ledger; saves only in safe states; versioned save migrations.
6. **NPC presence is derived** from state, never free-floating.

## 13. Performance principles

- Bounded, curated locations; only the active location simulates.
- Instancing, merged static geometry, LOD, pooled particles, one shadowed sun, limited dynamic lights.
- Budgets per location (≈ <500 draw calls, <1.5M triangles), 60 fps mid-range target, quality presets.
- Deterministic procedural content is regenerated, not saved.

## 14. Scope tiers

| Tier | Contents |
|---|---|
| **CORE (vertical slice)** | Opening, crash, Moon region, crew, base, resources/scanner/crafting, ship interior + first-person panels, repair chain, first launch, lunar orbit flight, dock at Harbor Station, save/load. |
| EARLY | Star map & transit, Earth orbit, Mars, asteroid belt, contracts/economy basics, second Moon region, ship upgrades, rover. |
| MID | Venus, Mercury, Jupiter & Saturn systems, research tiers, more hostile machines. |
| LATE | Uranus, Neptune, Pluto, the Threshold, first fictional system, wildlife, Acts 4–5. |
| EXPANSION | More systems, factions, vehicles, gamepad, WebGPU, localization. |

## 15. Open decisions (current defaults)

1. Earth landable? — *Default: orbit-only in EARLY; possible later "homecoming" region.*
2. Interior gravity in flight — *Default: gameplay simplification.*
3. Interplanetary travel — *Default: playable compressed transit; Threshold beyond Pluto.*
4. Death — *Default: safe-point respawn + recoverable cache.*
5. Combat — *Default: low intensity, tool-based.*
6. Rover — *Default: EARLY tier, not in Act 1.*
7. Controls — *Default: desktop keyboard/mouse, rebindable; gamepad later.*
8. Voice — *Default: text + subtitles + synthesized radio blips.*
9. Names — placeholders pending confirmation.

## 16. Decision log

| Date | Decision |
|---|---|
| 2026-09-26 | Crash world is the **Moon** (en route to lunar Harbor Station after celebrated Earth launch). |
| 2026-09-26 | Stack: Vite + TypeScript + three.js + Rapier; libraries welcome if installable via `npm install`. |
| 2026-09-26 | On-foot and flight cameras: 3-view cycle (first-person / behind / front). Ship systems always first-person; walking to consoles preferred. |
| 2026-09-26 | Assets: procedural baseline; optional CC0 packs via `npm run assets:fetch` on the player's machine. |
