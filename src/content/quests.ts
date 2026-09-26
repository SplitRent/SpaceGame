import type { QuestDef } from './types';
import { LAUNCH_PROPELLANT } from './shipSystems';

/**
 * Quest data. Objectives are *conditions on world state*, so a quest can never get
 * "stuck" behind a missed event: if the world satisfies the objective, it's done.
 * Order and gating come from autoStart conditions, not hard-coded scripts.
 */
export const QUESTS: QuestDef[] = [
  /* ============================ ACT 0 ============================ */
  {
    id: 'mq.prologue', title: 'Final Approach', kind: 'main', giver: 'okonkwo',
    summary: 'Day three of the Earth–Moon transit. The EXV Lantern will dock at Harbor Station in a few hours, the last stop before a four-year voyage to the edge of the Solar System.',
    autoStart: { all: [{ flag: 'act0' }, { notFlag: 'crashed' }] },
    stages: [
      {
        id: 'cmdr', journal: 'The commander wants to see me on the bridge before we begin approach.',
        objectives: [{ id: 'report', text: 'Report to Commander Okonkwo on the bridge (Deck 2, forward)', done: { flag: 'prologue.cmdr' }, marker: { location: 'lantern.interior', entity: 'bridge' } }],
        next: 'rounds',
      },
      {
        id: 'rounds', journal: 'Final rounds before rendezvous: engineering, the lab, and the medbay.',
        objectives: [
          { id: 'diag', text: 'Run the engineering diagnostic (Deck 3 — engineering console)', done: { flag: 'prologue.diag' } },
          { id: 'lab', text: 'Help Imani catalogue a sample in the lab analyzer', done: { flag: 'prologue.lab' } },
          { id: 'petra', text: 'Check in with Petra in the medbay', done: { flag: 'prologue.petra' } },
          { id: 'earth', text: 'Look back at Earth from the common room window', done: { flag: 'prologue.earthview' }, optional: true },
        ],
        next: 'approach',
      },
      {
        id: 'approach', journal: 'Harbor Station is in sight. Back to the bridge for the approach.',
        objectives: [{ id: 'seat', text: 'Take a jump seat on the bridge for final approach', done: { flag: 'prologue.seated' } }],
        onComplete: [{ story: 'catastrophe' }],
        next: 'complete',
      },
    ],
  },

  /* ============================ ACT 1 ============================ */
  {
    id: 'mq.aftermath', title: 'Aftermath', kind: 'main', giver: 'castellanos',
    summary: 'Something struck the Lantern on approach to Harbor Station. We came down hard on the lunar far side, near the south pole. The ship is dark.',
    autoStart: { flag: 'crashed' },
    stages: [
      {
        id: 'wake', journal: 'I woke in the medbay. The Lantern is dark, silent, and lying at an angle.',
        objectives: [{ id: 'find', text: 'Find Mira in engineering — walk aft down the corridor and take the stairs to Deck 3', done: { flag: 'met.castellanos' } }],
        next: 'power',
      },
      {
        id: 'power', journal: 'Mira: the batteries survived, but their fuel cell was thrown into the cargo hold. No power means no air.',
        objectives: [
          { id: 'cell', text: 'Open the red-banded emergency crate in the cargo hold (Deck 3) to get the fuel cell', done: { any: [{ hasItem: 'fuelcell' }, { system: 'power.batteries', step: 'fuelcell' }] } },
          { id: 'seat', text: 'Seat the fuel cell in the battery bay (engineering, Deck 3)', done: { system: 'power.batteries', step: 'fuelcell' } },
          { id: 'breakers', text: 'At the power distribution panel (engineering), close MAIN BUS first, then DIST A and B, then the rest', done: { system: 'power.batteries', step: 'breakers' } },
          { id: 'online', text: 'Press BUS ONLINE on the power distribution panel', done: { system: 'power.batteries' } },
        ],
        next: 'complete',
      },
    ],
    rewards: [{ relationship: { npc: 'castellanos', delta: 5 } }],
  },
  {
    id: 'mq.air', title: 'Air', kind: 'main', giver: 'castellanos',
    summary: 'We have lights, but no air. Two hull breaches and an empty scrubber plant stand between us and taking our helmets off.',
    autoStart: { questDone: 'mq.aftermath' },
    stages: [
      {
        id: 'seal', journal: 'Each breach takes 2 hull sealant. The emergency crate in the cargo hold had some, and the workshop’s maintenance cabinet holds spares. The ship is still in vacuum: if suit O₂ runs low, the suit lockers (Deck 2, suit room) refill it.',
        objectives: [
          {
            id: 'sealant', text: 'Get hull sealant — the maintenance cabinet in the workshop (Deck 2) has spares',
            done: { any: [{ hasItem: 'sealant', qty: 2 }, { all: [{ system: 'life.hull', step: 'breach.corridor' }, { system: 'life.hull', step: 'breach.lab' }] }] },
          },
          { id: 'corridor', text: 'Seal the corridor breach — the hissing hole in the Deck 2 corridor ceiling, near the lab', done: { system: 'life.hull', step: 'breach.corridor' } },
          { id: 'lab', text: 'Seal the laboratory breach — the lab wall, Deck 2 (port side)', done: { system: 'life.hull', step: 'breach.lab' } },
        ],
        next: 'scrub',
      },
      {
        id: 'scrub', journal: 'Hull sealed. The life support plant needs CO₂ scrubber cartridges before it can repressurize.',
        objectives: [
          { id: 'cart', text: 'Load the two CO₂ scrubber cartridges from the crate at the life support console (Deck 3)', done: { system: 'life.support', step: 'scrubbers' } },
          { id: 'press', text: 'Press REPRESSURIZE on the life support console', done: { system: 'life.support' } },
        ],
        next: 'complete',
      },
    ],
    rewards: [
      { relationship: { npc: 'castellanos', delta: 5 } },
      { relationship: { npc: 'novak', delta: 5 } },
      { relationship: { npc: 'sola', delta: 5 } },
      { relationship: { npc: 'haddad', delta: 5 } },
    ],
  },
  {
    id: 'mq.camp', title: 'Base Camp', kind: 'main', giver: 'castellanos',
    summary: 'The Lantern’s reserves won’t carry six people for long. We need a camp: shelter, solar power, a workbench, and batteries for the long night.',
    autoStart: { questDone: 'mq.air' },
    onStart: [{ setFlag: 'base.unlocked' }],
    stages: [
      {
        id: 'build', journal: 'Construction pads are laid out beside the cargo ramp. Materials come from the regolith, the rocks and the wreckage.',
        objectives: [
          { id: 'shelter', text: 'Build an Inflatable Habitat on a base pad', done: { module: 'shelter' } },
          { id: 'solar', text: 'Build a Solar Array', done: { module: 'solar' } },
          { id: 'bench', text: 'Build a Workbench', done: { module: 'workbench' } },
        ],
        next: 'night',
      },
      {
        id: 'night', journal: 'At the pole the Sun circles the horizon and dips below it for the lunar night. Solar alone won’t do.',
        objectives: [{ id: 'battery', text: 'Build a Battery Bank to carry the base through the night', done: { module: 'battery' } }],
        next: 'complete',
      },
    ],
    rewards: [{ upgrade: { stat: 'oxygenMax', value: 320 } }, { notify: 'Mira fits your suit with a salvaged high-pressure O₂ bottle: +33% oxygen.' }],
  },
  {
    id: 'mq.ice', title: 'Cold Trap', kind: 'main', giver: 'sola',
    summary: 'Water ice means oxygen, drinking water, and — split into hydrogen and oxygen — rocket propellant. The permanently shadowed crater to the west has never seen the Sun.',
    autoStart: { questDone: 'mq.air' },
    stages: [
      {
        id: 'scout', journal: 'Imani: “Forty kelvin in there. Your suit heaters will be screaming. Don’t linger.”',
        objectives: [
          { id: 'reach', text: 'Reach Shadow Crater (west)', done: { discovered: 'moon.shadowcrater' } },
          { id: 'scan', text: 'Scan an ice deposit on the crater floor', done: { scanned: 'db.ice' } },
          { id: 'mine', text: 'Extract water ice', done: { any: [{ hasItem: 'ice', qty: 6 }, { flag: 'iceproc.loaded' }] } },
        ],
        next: 'haul',
      },
      {
        id: 'haul', journal: 'An ice processor at the base can melt, filter and electrolyse the ice.',
        objectives: [
          { id: 'proc', text: 'Build an Ice Processor at base camp', done: { module: 'iceproc' } },
          { id: 'load', text: 'Load ice into the processor', done: { flag: 'iceproc.loaded' } },
        ],
        next: 'complete',
      },
    ],
    rewards: [{ upgrade: { stat: 'suitPowerMax', value: 140 } }, { notify: 'Imani re-flashes your suit heater firmware: +40% suit power capacity.' }],
  },
  {
    id: 'mq.reactor', title: 'Heart of the Ship', kind: 'main', giver: 'castellanos',
    summary: 'Batteries only keep the lights on. To fly — or even think about flying — the Lantern’s fission reactor has to wake up.',
    autoStart: { all: [{ questDone: 'mq.air' }, { module: 'workbench' }] },
    stages: [
      {
        id: 'actuator', journal: 'The control-rod actuator sheared on impact. Mira’s spec: three titanium, two circuit boards. Titanium comes from dark, ilmenite-rich rock.',
        objectives: [
          { id: 'make', text: 'Fabricate a Control-Rod Actuator (workshop fabricator)', done: { any: [{ hasItem: 'actuator' }, { system: 'power.reactor', step: 'actuator' }] } },
          { id: 'fit', text: 'Install it at the reactor vessel (Deck 3)', done: { system: 'power.reactor', step: 'actuator' } },
        ],
        next: 'coolant',
      },
      {
        id: 'coolant', journal: 'The coolant loop was isolated when the reactor scrammed.',
        objectives: [{ id: 'valves', text: 'Open the coolant loop valves in flow order', done: { system: 'power.reactor', step: 'coolant' } }],
        next: 'startup',
      },
      {
        id: 'startup', journal: 'Pumps on. Then withdraw the control rods one step at a time, watching the core temperature.',
        objectives: [{ id: 'start', text: 'Start the reactor from the engineering console', done: { system: 'power.reactor' } }],
        next: 'complete',
      },
    ],
    rewards: [{ relationship: { npc: 'castellanos', delta: 10 } }],
  },
  {
    id: 'mq.earthrise', title: 'Earthrise', kind: 'main', giver: 'haddad',
    summary: 'Nobody knows we are alive. We are on the far side of the Moon: Earth is below the horizon. To call home we need to find a line of sight.',
    autoStart: { questDone: 'mq.reactor' },
    stages: [
      {
        id: 'antenna', journal: 'Rafi: short-range first — the hull antenna on the dorsal spine took a hit.',
        objectives: [
          { id: 'fix', text: 'Repair the hull antenna (climb the ladder beside the airlock)', done: { system: 'comms.short', step: 'antenna' } },
          { id: 'on', text: 'Bring short-range comms online (bridge, comms station)', done: { system: 'comms.short' } },
        ],
        next: 'relay',
      },
      {
        id: 'relay', journal: 'The massif to the north-west is the highest ground for kilometres. From its summit, Earth might just clear the horizon.',
        objectives: [
          { id: 'kit', text: 'Fabricate a Comms Relay Kit', done: { any: [{ hasItem: 'relaykit' }, { system: 'comms.long', step: 'relay' }] } },
          { id: 'deploy', text: 'Climb Earthrise Summit and deploy the relay', done: { system: 'comms.long', step: 'relay' } },
          { id: 'align', text: 'Align the relay dish on Earth', done: { system: 'comms.long' } },
        ],
        next: 'call',
      },
      {
        id: 'call', journal: 'The link is up.',
        objectives: [{ id: 'call', text: 'Open a channel to Earth (bridge, comms station)', done: { flag: 'earth.called' } }],
        next: 'complete',
      },
    ],
    rewards: [{ relationship: { npc: 'haddad', delta: 10 } }],
  },
  {
    id: 'mq.kepler', title: 'Kepler-9', kind: 'main', giver: 'sola',
    summary: 'Our star tracker was destroyed. An abandoned mining survey outpost, Kepler-9, lies north-east of the crash site. Its survey tracker could replace ours.',
    autoStart: { questDone: 'mq.reactor' },
    stages: [
      {
        id: 'find', journal: 'Kepler-9 was mothballed eleven years ago “for budget reasons”.',
        objectives: [
          { id: 'reach', text: 'Travel to Outpost Kepler-9 (north-east)', done: { discovered: 'moon.kepler9' } },
          { id: 'enter', text: 'Find a way into the outpost tunnels', done: { flag: 'k9.opened' } },
        ],
        next: 'inside',
      },
      {
        id: 'inside', journal: 'Someone left in a hurry.',
        objectives: [
          { id: 'tracker', text: 'Recover the survey star tracker', done: { any: [{ hasItem: 'startracker' }, { system: 'nav.core', step: 'tracker' }] } },
          { id: 'logs', text: 'Recover the seismic logs', done: { any: [{ hasItem: 'quakelog' }, { flag: 'quakelog.delivered' }] }, optional: true },
        ],
        next: 'complete',
      },
    ],
  },
  {
    id: 'mq.bearings', title: 'Bearings', kind: 'main', giver: 'sola',
    summary: 'With a working star tracker, the navigation core can find out exactly where — and how — we are.',
    autoStart: { questDone: 'mq.kepler' },
    stages: [
      {
        id: 'nav', journal: 'Install the tracker, then lock three reference stars.',
        objectives: [
          { id: 'install', text: 'Install the star tracker at the navigation station (bridge)', done: { system: 'nav.core', step: 'tracker' } },
          { id: 'cal', text: 'Calibrate on three reference stars', done: { system: 'nav.core' } },
        ],
        next: 'complete',
      },
    ],
  },
  {
    id: 'mq.lift', title: 'Lift', kind: 'main', giver: 'castellanos',
    summary: 'Everything else is done. Mira’s launch list stands between us and the sky.',
    autoStart: { all: [{ questDone: 'mq.bearings' }, { questDone: 'mq.earthrise' }, { questDone: 'mq.ice' }] },
    stages: [
      {
        id: 'prep', journal: 'Injectors, hull, struts, propellant, drive.',
        objectives: [
          { id: 'inj', text: 'Fabricate and install 3 drive injectors (crawlway, Deck 3 aft)', done: { system: 'prop.main', step: 'injectors' } },
          { id: 'hull', text: 'Weld the 3 exterior hull tears (multi-tool + structural frames)', done: { system: 'prop.main', step: 'hull' } },
          { id: 'struts', text: 'Extend the port landing struts to level the ship (engineering console)', done: { system: 'prop.main', step: 'struts' } },
          { id: 'prop', text: `Produce ${LAUNCH_PROPELLANT} kg of propellant from ice`, done: { flag: 'ship.propellant', gte: LAUNCH_PROPELLANT } },
          { id: 'drive', text: 'Bring the main drive online (engineering console)', done: { system: 'prop.main' } },
        ],
        next: 'complete',
      },
    ],
  },
  {
    id: 'mq.ascent', title: 'Ascent', kind: 'main', giver: 'arakawa',
    summary: 'The Lantern is ready. Time to leave the surface.',
    autoStart: { questDone: 'mq.lift' },
    stages: [
      {
        id: 'gather', journal: 'Kit wants the whole crew on the bridge.',
        objectives: [{ id: 'crew', text: 'Talk to Kit on the bridge', done: { flag: 'ascent.crewReady' } }],
        next: 'launch',
      },
      {
        id: 'launch', journal: 'Left seat. Pre-launch checklist. Launch.',
        objectives: [{ id: 'go', text: 'Launch from the pilot’s seat', done: { flag: 'launched' } }],
        next: 'complete',
      },
    ],
  },
  {
    id: 'mq.harbor', title: 'Harbor', kind: 'main', giver: 'haddad',
    summary: 'Harbor Station went dark the moment the Blackglass struck. If anyone is alive aboard, we are the only ones close enough to help.',
    autoStart: { flag: 'launched' },
    stages: [
      {
        id: 'approach', journal: 'Harbor Station is in a halo orbit high over the south pole.',
        objectives: [
          { id: 'fly', text: 'Fly to Harbor Station', done: { flag: 'harbor.approached' } },
          { id: 'dock', text: 'Dock at Harbor Station', done: { flag: 'harbor.docked' } },
        ],
        next: 'inside',
      },
      {
        id: 'inside', journal: 'The station’s emergency lights are on. Somebody powered them.',
        objectives: [{ id: 'find', text: 'Board the station and find survivors', done: { flag: 'harbor.survivors' } }],
        next: 'complete',
      },
    ],
  },

  /* ============================ ACT 2 · THE FRONTIER ============================ */
  {
    id: 'mq.frontier', title: 'The Frontier', kind: 'main', giver: 'haddad',
    summary: 'Melas Station, a science outpost on Mars, went dark at the same second the Blackglass struck Harbor. We are the only crewed ship that can reach it.',
    autoStart: { flag: 'slice.complete' },
    stages: [
      {
        id: 'brief', journal: 'Rafi has news from Earth Control.',
        objectives: [{ id: 'talk', text: 'Talk to Rafi aboard the Lantern', done: { flag: 'frontier.briefed' } }],
        next: 'fuel',
      },
      {
        id: 'fuel', journal: 'The transfer burn to Mars takes 800 kg of propellant; Kit wants a landing reserve. Harbor’s depot has hydrolox, and base camp can make more from ice.',
        objectives: [{ id: 'fuel', text: 'Fill the tanks to at least 1,000 kg (Harbor depot or base camp ice)', done: { any: [{ propellant: 1000 }, { flag: 'course.mars' }] } }],
        next: 'plot',
      },
      {
        id: 'plot', journal: 'Courses are plotted on the holographic star map on the bridge. Transfer burns start from orbit.',
        objectives: [{ id: 'plot', text: 'Plot a course to Mars at the bridge holo table', done: { any: [{ flag: 'course.mars' }, { discovered: 'mars.orbit' }] } }],
        next: 'arrive',
      },
      {
        id: 'arrive', journal: 'Seven months of coasting, compressed. Stay at the helm or walk the ship.',
        objectives: [{ id: 'orbit', text: 'Arrive in Mars orbit', done: { discovered: 'mars.orbit' } }],
        next: 'land',
      },
      {
        id: 'land', journal: 'Melas Station sits on the floor of Melas Chasma, in the middle of Valles Marineris. Descend below 7 km and land.',
        objectives: [{ id: 'land', text: 'Land in Melas Chasma', done: { discovered: 'mars.melas' } }],
        next: 'find',
      },
      {
        id: 'find', journal: 'The station beacon is pinging. Nobody answers it.',
        objectives: [{ id: 'find', text: 'Find Melas Station’s crew', done: { flag: 'melas.found' } }],
        next: 'power',
      },
      {
        id: 'power', journal: 'The reactor feeder was cut outside, and the bus start cells drained, in the same instant as Harbor’s blackout.',
        objectives: [
          { id: 'cable', text: 'Splice the severed feeder cable outside (Power Conduit)', done: { flag: 'melas.cable' } },
          { id: 'cells', text: 'Seat 2 power cells in the station bus', done: { flag: 'melas.cells' } },
          { id: 'restart', text: 'Restart the main bus', done: { flag: 'melas.power' } },
        ],
        next: 'debrief',
      },
      {
        id: 'debrief', journal: 'With power back, the station’s external camera archive can be read.',
        objectives: [{ id: 'rao', text: 'Talk to Dr. Rao', done: { flag: 'melas.debrief' } }],
        next: 'complete',
      },
    ],
    rewards: [{ relationship: { npc: 'haddad', delta: 5 } }, { notify: 'Melas Station is alive again. Its ISRU plant can refuel the Lantern while she is on the pad.' }],
  },
  {
    id: 'mq.footprints', title: 'Footprints', kind: 'main', giver: 'rao',
    summary: 'The station camera caught a figure in the commander’s suit walking east at the moment of the blackout.',
    autoStart: { flag: 'footprints.revealed' },
    stages: [
      {
        id: 'follow', journal: 'The tracks lead east from the station, toward the north canyon wall.',
        objectives: [{ id: 'follow', text: 'Follow the footprints east', done: { discovered: 'mars.spire' } }],
        next: 'scan',
      },
      {
        id: 'scan', journal: 'The tracks end at a spire of the same black material as the fragment.',
        objectives: [{ id: 'scan', text: 'Scan the spire', done: { scanned: 'db.spire' } }],
        next: 'report',
      },
      {
        id: 'report', journal: 'Imani needs to hear about this.',
        objectives: [{ id: 'imani', text: 'Tell Imani what you found (aboard the Lantern)', done: { flag: 'spire.reported' } }],
        next: 'complete',
      },
    ],
  },
  {
    id: 'sq.rover', title: 'Kamau and Ishikawa', kind: 'side', giver: 'rao',
    summary: 'Two of Melas Station’s crew took the rover east chasing a seismic ping, three sols before the blackout.',
    autoStart: { flag: 'melas.found' },
    stages: [
      {
        id: 'find', journal: 'The rover would have left tracks across the dunes — look south-west of the landing zone too; drivers skirt the dune field.',
        objectives: [{ id: 'log', text: 'Find the rover and read its drive log', done: { flag: 'rover.log' } }],
        next: 'complete',
      },
    ],
    rewards: [{ relationship: { npc: 'rao', delta: 5 } }],
  },

  /* ============================ ACT 2 · THE NETWORK ============================ */
  {
    id: 'mq.network', title: 'The Network', kind: 'main', giver: 'haddad',
    summary: 'Every place the Blackglass touched keeps the same time. Harbor’s burst log names one more node — on Ceres — and Ceres Deep has a drive that could take us much further.',
    autoStart: { questDone: 'mq.footprints' },
    stages: [
      {
        id: 'brief', journal: 'Rafi has been decoding Harbor’s burst log.',
        objectives: [{ id: 'talk', text: 'Talk to Rafi aboard the Lantern', done: { flag: 'network.briefed' } }],
        next: 'ceres',
      },
      {
        id: 'ceres', journal: 'Ceres is at the edge of hydrolox range: 900 kg for the transfer. Plot it at the holo table from orbit.',
        objectives: [{ id: 'fly', text: 'Travel to Ceres', done: { any: [{ discovered: 'ceres.orbit' }, { discovered: 'ceres.occator' }] } }],
        next: 'land',
      },
      {
        id: 'land', journal: 'Ceres Deep sits on the floor of Occator crater, beside the bright salt dome.',
        objectives: [{ id: 'land', text: 'Land in Occator crater', done: { discovered: 'ceres.occator' } }],
        next: 'deep',
      },
      {
        id: 'deep', journal: 'The station’s drones locked everything down at 04:12:07.',
        objectives: [{ id: 'meet', text: 'Meet the crew of Ceres Deep', done: { flag: 'ceres.met' } }],
        next: 'pylons',
      },
      {
        id: 'pylons', journal: 'Three drone relay pylons out on the salt hold the quarantine lock on the prototype hangar. Weld each one’s bypass (hold the multi-tool).',
        objectives: [
          { id: 'a', text: 'Reset drone relay A (west)', done: { flag: 'ceres.pylon.1' } },
          { id: 'b', text: 'Reset drone relay B (south-east)', done: { flag: 'ceres.pylon.2' } },
          { id: 'c', text: 'Reset drone relay C (east)', done: { flag: 'ceres.pylon.3' } },
          { id: 'seed', text: 'Optional: visit the seed on Cerealia Facula', done: { flag: 'ceres.seed.touched' }, optional: true },
        ],
        next: 'hangar',
      },
      {
        id: 'hangar', journal: 'With the quorum broken, the hangar hatch will open.',
        objectives: [{ id: 'cradle', text: 'Raise the Kestrel cradle at the hangar hatch', done: { flag: 'ceres.hangar' } }],
        next: 'install',
      },
      {
        id: 'install', journal: 'Seat the core, install both coils, tune and ignite — at the new upgrade console in engineering (Deck 3, west wall).',
        objectives: [{ id: 'torch', text: 'Install and ignite the Kestrel fusion torch', done: { system: 'prop.fusion' } }],
        next: 'complete',
      },
    ],
    rewards: [{ relationship: { npc: 'castellanos', delta: 10 } }],
  },

  /* ============================ ACT 3 · THE CADENCE ============================ */
  {
    id: 'mq.cadence', title: 'The Cadence', kind: 'main', giver: 'haddad',
    summary: 'The Cadence is not one voice. Three nodes along the commander’s path each sing a line of it: Europa, Titan, Pluto.',
    autoStart: { system: 'prop.fusion' },
    stages: [
      {
        id: 'europa', journal: 'Europa first — a node under Conamara Chaos, and a gold-banded suit beacon beside it. Jupiter’s radiation is harsh: be quick outside.',
        objectives: [
          { id: 'land', text: 'Land on Europa', done: { discovered: 'europa.conamara' } },
          { id: 'rec', text: 'Find the commander’s recorder', done: { flag: 'europa.recorder' } },
          { id: 'scan', text: 'Scan the node (hold F)', done: { flag: 'cadence.1' } },
        ],
        next: 'titan',
      },
      {
        id: 'titan', journal: 'Titan: a node in the shallows of Kraken Mare.',
        objectives: [
          { id: 'land', text: 'Land on Titan', done: { discovered: 'titan.kraken' } },
          { id: 'rec', text: 'Find the commander’s second recorder', done: { flag: 'titan.recorder' } },
          { id: 'scan', text: 'Scan the node', done: { flag: 'cadence.2' } },
        ],
        next: 'pluto',
      },
      {
        id: 'pluto', journal: '“I’ll wait at Pluto.”',
        objectives: [
          { id: 'land', text: 'Land on Pluto', done: { discovered: 'pluto.sputnik' } },
          { id: 'find', text: 'Find Commander Okonkwo', done: { flag: 'okonkwo.found' } },
        ],
        next: 'complete',
      },
    ],
    rewards: [{ relationship: { npc: 'haddad', delta: 10 } }],
  },

  /* ============================ ACT 4 · THE THRESHOLD ============================ */
  {
    id: 'mq.threshold', title: 'The Threshold', kind: 'main', giver: 'okonkwo',
    summary: 'Beyond Pluto, at 51 AU, the source of the Cadence: a door someone left open.',
    autoStart: { flag: 'okonkwo.found' },
    stages: [
      {
        id: 'fly', journal: 'The Threshold now shows on the star map. 1,200 kg for the transfer.',
        objectives: [
          { id: 'fly', text: 'Travel to the Threshold', done: { any: [{ discovered: 'threshold.zone' }, { flag: 'threshold.docked' }] } },
          { id: 'dock', text: 'Dock with it', done: { flag: 'threshold.docked' } },
        ],
        next: 'door',
      },
      {
        id: 'door', journal: 'Turn the Door’s rings to the three lines the nodes sang.',
        objectives: [{ id: 'open', text: 'Open the Door (first-person glyph panel)', done: { flag: 'threshold.open' } }],
        next: 'complete',
      },
    ],
  },
  {
    id: 'mq.vesper', title: 'Vesper', kind: 'main', giver: 'okonkwo',
    summary: 'Forty-one light-years from home, around an orange star, a world is alive.',
    autoStart: { flag: 'threshold.open' },
    stages: [
      {
        id: 'land', journal: 'Vesper b is tidally locked; life lives in the band of permanent dusk.',
        objectives: [{ id: 'land', text: 'Land on Vesper b', done: { discovered: 'vesper.terminator' } }],
        next: 'find',
      },
      {
        id: 'find', journal: 'The Builders’ Archive signal comes from the south-west, past their ruins.',
        objectives: [
          { id: 'door', text: 'Find the Archive door', done: { discovered: 'vesper.archive.door' } },
          { id: 'circle', text: 'Optional: read the plinth in the stone circle', done: { flag: 'vesper.circle.read' }, optional: true },
          { id: 'life', text: 'Optional: scan a grazer', done: { scanned: 'db.grazer' }, optional: true },
        ],
        next: 'enter',
      },
      {
        id: 'enter', journal: 'The door is open. It has been open for a billion years.',
        objectives: [{ id: 'enter', text: 'Enter the Archive', done: { discovered: 'vesper.archive' } }],
        next: 'complete',
      },
    ],
  },

  /* ============================ ACT 5 · THE TRUTH ============================ */
  {
    id: 'mq.truth', title: 'The Truth', kind: 'main', giver: 'okonkwo',
    summary: 'The Archive shows everyone the same thing. It doesn’t lie.',
    autoStart: { discovered: 'vesper.archive' },
    stages: [
      {
        id: 'memories', journal: 'Three memory plinths: west alcove, east alcove, and the end of the nave.',
        objectives: [
          { id: 'm1', text: 'The Listening (west alcove)', done: { flag: 'archive.mem1' } },
          { id: 'm2', text: 'The Answer (east alcove)', done: { flag: 'archive.mem2' } },
          { id: 'm3', text: 'The Leaving (end of the nave)', done: { flag: 'archive.mem3' } },
        ],
        next: 'heart',
      },
      {
        id: 'heart', journal: 'The crew has gathered in the Heart. The Archive is waiting for an answer.',
        objectives: [{ id: 'choose', text: 'Talk to Okonkwo in the Heart — and choose', done: { flag: 'game.complete' } }],
        next: 'complete',
      },
    ],
  },

  /* ============================ SIDE · OLDER THAN US ============================ */
  {
    id: 'sq.visited', title: 'Older Than Us', kind: 'side', giver: 'sola',
    summary: 'With a thermal shield, the inner Solar System is open — and the aerostat Halcyon over Venus has found something under the clouds.',
    autoStart: { system: 'hull.thermal' },
    stages: [
      {
        id: 'halcyon', journal: 'Dock with Halcyon, fifty kilometres above Venus.',
        objectives: [{ id: 'radar', text: 'See Halcyon’s deep radar survey', done: { flag: 'halcyon.radar' } }],
        next: 'mercury',
      },
      {
        id: 'mercury', journal: 'A radar-dark point in Chao Meng-Fu crater, at Mercury’s south pole.',
        objectives: [{ id: 'scan', text: 'Find and scan the old spire on Mercury', done: { scanned: 'db.oldspire' } }],
        next: 'report',
      },
      {
        id: 'report', journal: 'Imani will want to see this.',
        objectives: [{ id: 'imani', text: 'Tell Imani', done: { flag: 'oldspire.reported' } }],
        next: 'complete',
      },
    ],
    rewards: [{ relationship: { npc: 'sola', delta: 15 } }, { upgrade: { stat: 'oxygenMax', value: 150 } }, { notify: 'Imani re-tunes your suit’s oxygen recycler as thanks: O₂ capacity increased.' }],
  },

  /* ============================ SIDE / CREW ============================ */
  {
    id: 'sq.kit', title: 'Broken Wings', kind: 'crew', giver: 'novak',
    summary: 'Kit brought the Lantern down alive but broke several ribs doing it.',
    autoStart: { flag: 'met.castellanos' },
    stages: [
      {
        id: 'treat', journal: 'Petra needs a Med Patch. The emergency crate in the cargo hold might have some.',
        objectives: [{ id: 'patch', text: 'Treat Kit’s injuries at the medbay station', done: { flag: 'kit.treated' } }],
        next: 'complete',
      },
    ],
    rewards: [{ relationship: { npc: 'novak', delta: 5 } }],
  },
  {
    id: 'sq.fragment', title: 'Blackglass', kind: 'crew', giver: 'sola',
    summary: 'A shard of the object that struck us lies in a fresh impact scar near the wreck. It reflects nothing.',
    autoStart: { flag: 'fragment.found' },
    stages: [
      {
        id: 'analyze', journal: 'The lab analyzer needs full ship power.',
        objectives: [{ id: 'an', text: 'Place the fragment in the lab analyzer (requires reactor power)', done: { flag: 'fragment.analyzed' } }],
        next: 'talk',
      },
      {
        id: 'talk', journal: 'The analyzer returned something Imani needs to see.',
        objectives: [{ id: 'imani', text: 'Discuss the results with Imani', done: { flag: 'fragment.discussed' } }],
        next: 'complete',
      },
    ],
    rewards: [{ upgrade: { stat: 'scannerTier', value: 2 } }, { notify: 'Imani tunes your scanner to the fragment’s signature: Scanner Tier 2 (anomalous materials).' }],
  },
  {
    id: 'sq.office', title: 'The Empty Chair', kind: 'crew', giver: 'haddad',
    summary: 'Commander Okonkwo’s harness was unbuckled, not torn. Her office has been sealed since the crash.',
    autoStart: { questDone: 'mq.reactor' },
    stages: [
      {
        id: 'enter', journal: 'With reactor power, engineering authority can override the office lock.',
        objectives: [
          { id: 'open', text: 'Get into the commander’s office (Deck 2)', done: { flag: 'office.unlocked' } },
          { id: 'read', text: 'Search her terminal', done: { flag: 'office.log.read' } },
          { id: 'tell', text: 'Tell Rafi what you found', done: { flag: 'office.told' } },
        ],
        next: 'complete',
      },
    ],
  },
  {
    id: 'sq.fallen', title: 'Fallen', kind: 'side',
    summary: 'A cylindrical module lies half-buried to the north-west of the crash site. It did not come from the Lantern.',
    autoStart: { discovered: 'moon.harbordebris' },
    stages: [
      {
        id: 'salvage', journal: 'Its avionics bay may still hold something useful.',
        objectives: [{ id: 'salv', text: 'Salvage the module’s avionics bay', done: { flag: 'harbor.debris.salvaged' } }],
        next: 'complete',
      },
    ],
  },
  {
    id: 'sq.greenhouse', title: 'Something Green', kind: 'crew', giver: 'novak',
    summary: 'Petra brought seeds. Lettuce, radish, and a single stubborn tomato.',
    autoStart: { module: 'shelter' },
    stages: [
      {
        id: 'build', journal: 'A greenhouse needs frames, sealant and a solar cell array for its lights.',
        objectives: [
          { id: 'gh', text: 'Build a Greenhouse at base camp', done: { module: 'greenhouse' } },
          { id: 'visit', text: 'Visit the greenhouse', done: { flag: 'greenhouse.visited' } },
        ],
        next: 'complete',
      },
    ],
    rewards: [{ relationship: { npc: 'novak', delta: 10 } }],
  },
];
