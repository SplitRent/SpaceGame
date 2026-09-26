import type { BarkDef, DialogueDef } from './types';

/**
 * Crew conversations. The first entry whose condition passes decides where a
 * conversation starts, so every crew member always speaks to the current situation —
 * nobody asks you to fix the reactor after it's running.
 */
const PRE = { notFlag: 'crashed' } as const;
const CRASHED = { flag: 'crashed' } as const;

export const DIALOGUES: DialogueDef[] = [
  /* ------------------------------ Okonkwo ------------------------------ */
  {
    id: 'dlg.okonkwo',
    npc: 'okonkwo',
    entries: [
      { if: { all: [{ flag: 'archive.mem1' }, { flag: 'archive.mem2' }, { flag: 'archive.mem3' }, { notFlag: 'game.complete' }] }, node: 'finale' },
      { if: { all: [{ discovered: 'pluto.sputnik' }, { notFlag: 'okonkwo.found' }] }, node: 'pluto' },
      { if: { flag: 'game.complete' }, node: 'after' },
      { if: { questActive: 'mq.truth' }, node: 'archive' },
      { if: { discovered: 'vesper.terminator' }, node: 'vesper' },
      { if: { questActive: 'mq.threshold' }, node: 'threshold' },

      { if: { all: [PRE, { notFlag: 'prologue.cmdr' }] }, node: 'brief' },
      { if: { all: [PRE, { quest: 'mq.prologue', stage: 'approach' }] }, node: 'approach' },
      { if: PRE, node: 'idle' },
    ],
    nodes: {
      pluto: {
        id: 'pluto', speaker: 'okonkwo',
        text: 'You came. Of course you came. I chose you because you would. …Hello. Don’t hug me yet — I’ve been standing on nitrogen ice for, I think, about four minutes, and also for eleven weeks.',
        choices: [
          { text: 'Commander. You lied to all of us.', to: 'lied' },
          { text: 'We came to take you home.', to: 'home' },
        ],
      },
      lied: {
        id: 'lied', speaker: 'okonkwo',
        text: 'Yes. For two years. Project Lighthouse: the Directorate heard the Cadence three decades ago and handed it to me, and I answered it, from Harbor, alone. I thought if anything came, it would come for me and leave you alone. It didn’t understand “alone”.',
        effects: [{ relationship: { npc: 'okonkwo', delta: -5 } }],
        next: 'what',
      },
      home: {
        id: 'home', speaker: 'okonkwo',
        text: 'Home. …Yes. Eventually. I owe every one of you the truth, and I’ll pay it. But not yet — the thing I answered is still calling, and it will only open for a ship that carries what the Moon gave you.',
        effects: [{ relationship: { npc: 'okonkwo', delta: 10 } }],
        next: 'what',
      },
      what: {
        id: 'what', speaker: 'okonkwo',
        text: 'The Blackglass isn’t a weapon. It’s a courier, and the nodes are its roads. Beyond Pluto — fifty-one AU — is where the roads begin: a gate. The Cadence is its voice. The key is this.',
        choices: [{ text: '(Take what she holds out)', to: 'key' }],
      },
      key: {
        id: 'key', speaker: 'okonkwo',
        text: 'The fragment from your lab — the node grew around it while I waited. A key. Put it in your pocket and the gate will know us. Now: take me to my ship, Specialist. I would very much like to sit in my own chair.',
        effects: [
          { setFlag: 'okonkwo.found' }, { give: 'latticekey', qty: 1 },
          { notify: 'Commander Okonkwo rejoins the crew. The Threshold appears on the star map.' },
          { relationship: { npc: 'okonkwo', delta: 10 } },
        ],
        next: 'end',
      },
      threshold: { id: 'threshold', speaker: 'okonkwo', text: 'Fifty-one AU. Plot it on my table — it’s on the map now. And thank you for not letting Kit repaint my chair.', next: 'end' },
      vesper: { id: 'vesper', speaker: 'okonkwo', text: 'The Archive is south-west of the landing zone, past the ruins. Keep your lamp on near it. The things in the shadows there are frightened of light, and so am I, a little.', next: 'end' },
      archive: { id: 'archive', speaker: 'okonkwo', text: 'Three memories: the west alcove, the east, and the end of the nave. Touch them. Then come to the Heart. We’ll all be there.', next: 'end' },
      finale: {
        id: 'finale', speaker: 'okonkwo',
        text: 'So now you know what I know. The Lattice is a lighthouse and a road. The Archive will do one of three things for us, and it will not choose. I answered the first call without asking any of you. I won’t make that mistake twice. You choose.',
        choices: [
          { text: 'Open the Lattice. Let humanity walk the road.', to: 'open' },
          { text: 'Close it. Take us home the long way, and let it sleep.', to: 'close' },
          { text: 'Open the far door. We follow the Builders.', to: 'beyond' },
          { text: 'I need a moment.', to: 'end' },
        ],
      },
      open: {
        id: 'open', speaker: 'okonkwo', text: 'Then let’s leave the light on. For everyone.',
        effects: [{ setFlag: 'ending.chosen', value: 'open' }, { setFlag: 'game.complete' }, { setFlag: 'earth.quarantine.lifted' }, { story: 'ending.open' }],
        next: 'end',
      },
      close: {
        id: 'close', speaker: 'okonkwo', text: 'Then we go home. And one day, when we’re ready, somebody will knock again.',
        effects: [{ setFlag: 'ending.chosen', value: 'close' }, { setFlag: 'game.complete' }, { setFlag: 'earth.quarantine.lifted' }, { story: 'ending.close' }],
        next: 'end',
      },
      beyond: {
        id: 'beyond', speaker: 'okonkwo', text: 'Further, then. I was hoping you’d say that.',
        effects: [{ setFlag: 'ending.chosen', value: 'beyond' }, { setFlag: 'game.complete' }, { setFlag: 'earth.quarantine.lifted' }, { story: 'ending.beyond' }],
        next: 'end',
      },
      after: { id: 'after', speaker: 'okonkwo', text: 'Whatever we chose, it was ours. Go on — the whole Solar System is on the map now, and I’d like to see it with you.', next: 'end' },
      brief: {
        id: 'brief', speaker: 'okonkwo',
        text: '{player}. Good, you’re up. Six hours to Harbor Station. After we undock, the next time any of us sees the Moon this close will be on the way home — four years from now.',
        choices: [
          { text: 'Four years. It still hasn’t sunk in.', to: 'years' },
          { text: 'What do you need before docking?', to: 'rounds' },
        ],
      },
      years: {
        id: 'years', speaker: 'okonkwo',
        text: 'It shouldn’t, yet. Nobody has gone this far. Past Neptune’s orbit and then some — all to listen closely to a signal nobody can explain.',
        choices: [
          { text: 'Do you believe the Cadence is artificial?', to: 'cadence' },
          { text: 'Then let’s not be late. What’s on the list?', to: 'rounds' },
        ],
      },
      cadence: {
        id: 'cadence', speaker: 'okonkwo',
        text: 'I believe it repeats too precisely to be nature, and too quietly to be a greeting. That is exactly why we go and look.',
        next: 'rounds',
      },
      rounds: {
        id: 'rounds', speaker: 'okonkwo',
        text: 'Rounds before rendezvous. Mira has a diagnostic running on Deck 3, Imani wants a second pair of hands in the lab, and Petra has asked to see you. Then back here for approach.',
        effects: [{ setFlag: 'prologue.cmdr' }],
        next: 'end',
      },
      approach: {
        id: 'approach', speaker: 'okonkwo',
        text: 'There she is. Harbor. Take a jump seat, {player} — Kit is flying us in, and Kit is showing off.',
        next: 'end',
      },
      idle: { id: 'idle', speaker: 'okonkwo', text: 'Rounds first, Specialist. Harbor will not wait for us.', next: 'end' },
    },
  },

  /* ------------------------------ Arakawa ------------------------------ */
  {
    id: 'dlg.arakawa',
    npc: 'arakawa',
    entries: [
      { if: { discovered: 'threshold.zone' }, node: 'thresh' },
      { if: { system: 'prop.fusion' }, node: 'fast' },

      { if: PRE, node: 'act0' },
      { if: { flag: 'launched' }, node: 'space' },
      { if: { all: [{ questActive: 'mq.ascent' }, { notFlag: 'ascent.crewReady' }] }, node: 'ascent' },
      { if: { questActive: 'mq.ascent' }, node: 'ascentWait' },
      { if: { all: [CRASHED, { notFlag: 'kit.treated' }] }, node: 'hurt' },
      { if: { flag: 'kit.treated' }, node: 'recover' },
    ],
    nodes: {
      thresh: { id: 'thresh', speaker: 'arakawa', text: 'I flew through a door the size of a city into a star system nobody’s ever seen. My flight instructor said I’d never amount to anything. I want her to know.', next: 'end' },
      fast: { id: 'fast', speaker: 'arakawa', text: 'With the torch, the outer planets are a long nap away. Plot it on the holo table, and I’ll keep her pointy end forward.', next: 'end' },
      act0: {
        id: 'act0', speaker: 'arakawa',
        text: 'Hey, EVA. Coast phase is the boring part — the Moon just gets bigger. Want to see something good?',
        choices: [
          { text: 'Always.', to: 'view' },
          { text: 'Later, Kit. Rounds.', to: 'end' },
        ],
      },
      view: {
        id: 'view', speaker: 'arakawa',
        text: 'Look at the terminator line. See the bright rays splashing out from that crater? Tycho. A hundred million years old and it still looks like somebody threw it yesterday.',
        next: 'end',
      },
      hurt: {
        id: 'hurt', speaker: 'arakawa',
        text: 'Don’t — ow — don’t make me laugh. Ribs. A few. I got us down, though. Mostly down. Petra says I’m not allowed to move.',
        choices: [
          { text: 'What happened up there?', to: 'what' },
          { text: 'I’ll find something for the pain.', to: 'patch' },
          { text: 'Rest. We’ve got this.', to: 'end' },
        ],
      },
      what: {
        id: 'what', speaker: 'arakawa',
        text: 'Something crossed our bow. Radar didn’t show it — radar showed *less* than nothing, like a hole in the sky. Then every system tripped at once. I flew the rest by the seat of my pants and a very old instinct.',
        choices: [
          { text: 'And the commander?', to: 'cmdr' },
          { text: 'You saved us.', to: 'saved' },
        ],
      },
      cmdr: {
        id: 'cmdr', speaker: 'arakawa',
        text: 'She was in her seat when we started the fall. I’m sure of it. After the impact… I don’t know. I blacked out. When I came to, the seat was empty and the harness was just… open.',
        next: 'end',
      },
      saved: { id: 'saved', speaker: 'arakawa', text: 'Tell that to my ribs. …Thanks, {player}.', effects: [{ relationship: { npc: 'arakawa', delta: 5 } }], next: 'end' },
      patch: {
        id: 'patch', speaker: 'arakawa',
        text: 'Petra’s out of patches. There’s an emergency crate in the cargo hold, if it didn’t get crushed. Red band on it. Can’t miss it. Unless it’s dark. Which it is.',
        next: 'end',
      },
      recover: {
        id: 'recover', speaker: 'arakawa',
        text: 'Strapped up and bored out of my mind. Get me a working ship and I’ll fly you anywhere. Well. Anywhere nearby.',
        choices: [
          { text: 'How close are we?', to: 'status', if: { questActive: 'mq.lift' } },
          { text: 'Soon, Kit.', to: 'end' },
        ],
      },
      status: {
        id: 'status', speaker: 'arakawa',
        text: 'Mira’s list is the list. Injectors, hull, struts, gas. Level her out and I’ll stop feeling like I’m sleeping on a ramp.',
        next: 'end',
      },
      ascent: {
        id: 'ascent', speaker: 'arakawa',
        text: 'Look at her. Reactor purring, nav aligned, tanks full. You did this, {player}.',
        choices: [{ text: 'We did. Let’s go.', to: 'go' }],
      },
      go: {
        id: 'go', speaker: 'arakawa',
        text: 'Everyone’s strapped in. You take the left seat — my ribs won’t let me haul on the stick, but I’ll talk you through every second of it. Pre-launch checklist on the flight deck, then the red key.',
        effects: [{ setFlag: 'ascent.crewReady' }],
        next: 'end',
      },
      ascentWait: { id: 'ascentWait', speaker: 'arakawa', text: 'Left seat, {player}. The red key. Whenever you’re ready.', next: 'end' },
      space: { id: 'space', speaker: 'arakawa', text: 'Flying again. My ribs hate it. I love it.', next: 'end' },
    },
  },

  /* ----------------------------- Castellanos ----------------------------- */
  {
    id: 'dlg.castellanos',
    npc: 'castellanos',
    entries: [
      { if: { all: [{ flag: 'ceres.hangar' }, { not: { system: 'prop.fusion' } }] }, node: 'install' },
      { if: { system: 'prop.fusion' }, node: 'torch' },

      { if: PRE, node: 'act0' },
      { if: { notFlag: 'met.castellanos' }, node: 'first' },
      { if: { questActive: 'mq.aftermath' }, node: 'power' },
      { if: { questActive: 'mq.air' }, node: 'air' },
      { if: { questActive: 'mq.reactor' }, node: 'reactor' },
      { if: { questActive: 'mq.camp' }, node: 'camp' },
      { if: { questActive: 'mq.lift' }, node: 'lift' },
      { if: { questActive: 'mq.ascent' }, node: 'ascent' },
      { if: { system: 'power.reactor' }, node: 'alive' },
      { if: CRASHED, node: 'idle' },
    ],
    nodes: {
      install: {
        id: 'install', speaker: 'castellanos',
        text: 'You brought me a fusion torch. You brought me a *fusion torch*. Engineering, Deck 3, west wall — I’ve set up an upgrade console. Seat the core, install both coils, tune and ignite. The thermal tiles go on from the same console if you want the inner planets.',
        next: 'end',
      },
      torch: { id: 'torch', speaker: 'castellanos', text: 'She’s never flown like this. Neither have I. If you need propellant, feed ice to the still in the cargo hold — every world out here has some.', next: 'end' },
      act0: {
        id: 'act0', speaker: 'castellanos',
        text: 'Diagnostic’s queued on the console — go ahead, you know which button. She’s purring. Sixty percent on the reactor, radiators happy. I love this ship more than I love most people.',
        choices: [
          { text: 'Most?', to: 'most' },
          { text: 'I’ll run it.', to: 'end' },
        ],
      },
      most: { id: 'most', speaker: 'castellanos', text: 'Don’t push your luck, {player}. You’re in the top five.', next: 'end' },
      first: {
        id: 'first', speaker: 'castellanos',
        text: '{player}! You’re up. Good. Good. Don’t — just stand there a second. Let me look at you.',
        next: 'first2',
      },
      first2: {
        id: 'first2', speaker: 'castellanos',
        text: 'Okay. Here’s where we are: we’re down on the Moon, far side, south pole, on our side like a beached whale. Kit’s hurt. Harbor isn’t answering. And we’re breathing suit air.',
        choices: [
          { text: 'Where’s the commander?', to: 'cmdr' },
          { text: 'What do we do first?', to: 'plan' },
        ],
      },
      cmdr: {
        id: 'cmdr', speaker: 'castellanos',
        text: 'I don’t know. Her harness was unbuckled. Not torn — unbuckled. The bridge hatch was sealed. Nobody saw her go. …I can’t think about that yet.',
        next: 'plan',
      },
      plan: {
        id: 'plan', speaker: 'castellanos',
        text: 'Power first. The main batteries survived, but the fuel cell that feeds them was thrown clear into the cargo hold. Find it, seat it in the battery bay, close the breakers. Upstream first, or they’ll trip.',
        effects: [{ setFlag: 'met.castellanos' }],
        next: 'end',
      },
      power: {
        id: 'power', speaker: 'castellanos',
        text: 'Fuel cell, battery bay, breakers. Main bus first, then the distribution buses, then the loads. I’d do it myself but my hands won’t stop shaking.',
        choices: [
          { text: 'Are you okay?', to: 'shake', once: true },
          { text: 'On it.', to: 'end' },
        ],
      },
      shake: { id: 'shake', speaker: 'castellanos', text: 'Ask me again when we have air.', effects: [{ relationship: { npc: 'castellanos', delta: 3 } }], next: 'end' },
      air: {
        id: 'air', speaker: 'castellanos',
        text: 'Lights! I missed lights. Next: air. Two breaches — corridor ceiling and the lab wall. The fabricator can sinter sealant from regolith and scrap. Then scrubber cartridges into the life support plant.',
        choices: [
          { text: 'Where do I get regolith?', to: 'regolith' },
          { text: 'Scrubber cartridges?', to: 'scrubbers' },
          { text: 'Got it.', to: 'end' },
        ],
      },
      regolith: {
        id: 'regolith', speaker: 'castellanos',
        text: 'Outside. It’s everywhere. Hold your multi-tool on the ground and it’ll scoop. Scrap metal is all along the crash trench behind us — we left half the ship there.',
        next: 'end',
      },
      scrubbers: {
        id: 'scrubbers', speaker: 'castellanos',
        text: 'The emergency crate should have two. If it doesn’t… Harbor’s hab modules carried spares. I hope we don’t find out whether any of those came down near us.',
        next: 'end',
      },
      camp: {
        id: 'camp', speaker: 'castellanos',
        text: 'We need a real camp. The ship’s reserves won’t carry six people for long. Shelter, solar, a workbench, and batteries for the night. The pads by the ramp are surveyed and ready — materials come out of the ground and the wreckage.',
        choices: [
          { text: 'Where do the metals come from?', to: 'metals' },
          { text: 'I’ll get building.', to: 'end' },
        ],
      },
      metals: {
        id: 'metals', speaker: 'castellanos',
        text: 'Bright anorthosite gives aluminium and silicon. Dark basalt, silicon and a little iron. The really dark rock with a metallic sheen is ilmenite — titanium. Meteorite chunks for iron. Scan first; the scanner will tell you what you’re looking at.',
        next: 'end',
      },
      reactor: {
        id: 'reactor', speaker: 'castellanos',
        text: 'The reactor. The control-rod actuator sheared in the impact. I need a new one: three titanium, two circuit boards, out of the fabricator. Then the coolant valves, then I talk you through start-up.',
        next: 'end',
      },
      alive: {
        id: 'alive', speaker: 'castellanos',
        text: 'Do you hear that hum? That’s sixty kilowatts of “we’re not dead”. She’s alive, {player}.',
        next: 'end',
      },
      lift: {
        id: 'lift', speaker: 'castellanos',
        text: 'The launch list: three injectors into the crawlway, the three hull tears outside welded shut, the port struts out so she sits level, twelve hundred kilos of propellant, then the drive comes online.',
        choices: [
          { text: 'Can she really fly?', to: 'fly' },
          { text: 'Starting now.', to: 'end' },
        ],
      },
      fly: {
        id: 'fly', speaker: 'castellanos',
        text: 'She was built to land on Mars and leave again. The Moon’s easy. It’s the part where we pretend nothing hit us that’s hard.',
        next: 'end',
      },
      ascent: { id: 'ascent', speaker: 'castellanos', text: 'Everything I have is in that ship. Go on. The bridge.', next: 'end' },
      idle: { id: 'idle', speaker: 'castellanos', text: 'Keep moving. Standing still is when it catches up with you.', next: 'end' },
    },
  },

  /* -------------------------------- Sola -------------------------------- */
  {
    id: 'dlg.sola',
    npc: 'sola',
    entries: [
      { if: { all: [{ scanned: 'db.oldspire' }, { notFlag: 'oldspire.reported' }] }, node: 'oldspire' },
      { if: { questActive: 'mq.cadence' }, node: 'outer' },
      { if: { discovered: 'vesper.terminator' }, node: 'life' },

      { if: { all: [PRE, { notFlag: 'prologue.lab' }] }, node: 'act0' },
      { if: PRE, node: 'act0b' },
      { if: { all: [{ flag: 'fragment.analyzed' }, { notFlag: 'fragment.discussed' }] }, node: 'fragment' },
      { if: { all: [{ scanned: 'db.spire' }, { notFlag: 'spire.reported' }] }, node: 'spire' },
      { if: { questActive: 'mq.footprints' }, node: 'tracks' },
      { if: { questActive: 'mq.kepler' }, node: 'kepler' },
      { if: { questActive: 'mq.bearings' }, node: 'bearings' },
      { if: { questActive: 'mq.ice' }, node: 'ice' },
      { if: { all: [{ hasItem: 'quakelog' }, { notFlag: 'quakelog.delivered' }] }, node: 'quakes' },
      { if: { all: [{ flag: 'fragment.found' }, { notFlag: 'fragment.analyzed' }] }, node: 'fragwait' },
      { if: CRASHED, node: 'idle' },
    ],
    nodes: {
      oldspire: {
        id: 'oldspire', speaker: 'sola',
        text: 'Mercury’s spire is buried in rock that cooled four billion years ago. Venus’s is older than its lava. They were here before the oceans on Earth. Before anything was alive to hear them. They have been waiting a very long time.',
        effects: [{ setFlag: 'oldspire.reported' }, { relationship: { npc: 'sola', delta: 5 } }],
        next: 'end',
      },
      outer: {
        id: 'outer', speaker: 'sola',
        text: 'Europa has an ocean under its ice; Titan has seas of methane and air thicker than ours; Pluto has glaciers of nitrogen that churn like soup. Every one of them, a place a probe once flew past for a few hours. And we get to walk there.',
        next: 'end',
      },
      life: {
        id: 'life', speaker: 'sola',
        text: 'Scan everything. Please. Violet leaves because the light is redder. Stalkers that hate light. Sails that face a sun that never moves. I will be writing papers about this for the rest of my life, and I don’t care if anyone reads them.',
        next: 'end',
      },
      spire: {
        id: 'spire', speaker: 'sola',
        text: 'A spire. Of Blackglass. Standing upright on Mars, keeping the same 1,969-second time as the scar on the Moon… and her tracks lead right up to it and stop?',
        choices: [
          { text: 'They stop at the spire. Nothing leads away.', to: 'spire2' },
          { text: 'What is it, Imani?', to: 'spire2' },
        ],
      },
      spire2: {
        id: 'spire2', speaker: 'sola',
        text: 'I don’t know. I don’t think anyone does. But the Moon, Harbor, Melas — every place it touched is keeping the same time. That isn’t damage. That’s a network. And the Cadence is the clock it runs on.',
        effects: [{ setFlag: 'spire.reported' }, { relationship: { npc: 'sola', delta: 10 } }],
        next: 'end',
      },
      tracks: { id: 'tracks', speaker: 'sola', text: 'Bootprints on Mars that aren’t ours. Follow them before the next storm fills them in. Please.', next: 'end' },
      act0: {
        id: 'act0', speaker: 'sola',
        text: 'Oh good — hands! Put the Apollo 16 core in the analyzer for me? I promised the lunar sample lab a catalogue before we dock. They’ll never let me forget it otherwise.',
        choices: [
          { text: 'You brought an Apollo sample on a four-year mission?', to: 'why' },
          { text: 'On it.', to: 'end' },
        ],
      },
      why: {
        id: 'why', speaker: 'sola',
        text: 'Calibration standard. Also — fine — sentiment. Somebody picked this up with gloved hands in 1972. I want it to go further than anyone has.',
        next: 'end',
      },
      act0b: { id: 'act0b', speaker: 'sola', text: 'Anorthositic breccia, exactly as advertised. Thank you, {player}. Now go look out a window. You’re allowed.', next: 'end' },
      fragwait: {
        id: 'fragwait', speaker: 'sola',
        text: 'That shard from the scar — it’s not reflecting anything. At all. Get it into the lab analyzer once the reactor’s up. The analyzer needs full power.',
        next: 'end',
      },
      fragment: {
        id: 'fragment', speaker: 'sola',
        text: 'It isn’t glass. It isn’t anything. The analyzer returns a spectrum, then a different one, then — {player}, it returned the Cadence. The period. Nineteen hundred sixty-nine seconds, written into the lattice itself.',
        choices: [
          { text: 'The thing that hit us and the signal are the same thing.', to: 'same' },
          { text: 'That can’t be a coincidence.', to: 'same' },
        ],
      },
      same: {
        id: 'same', speaker: 'sola',
        text: 'I don’t know what “accident” means to something like that. But I don’t think we ran into it. I think it came to meet us.',
        effects: [{ setFlag: 'fragment.discussed' }, { relationship: { npc: 'sola', delta: 10 } }],
        next: 'end',
      },
      ice: {
        id: 'ice', speaker: 'sola',
        text: 'The cold traps! Permanently shadowed craters that haven’t seen sunlight in two billion years. Ice mixed into the regolith, maybe carbon compounds too. There’s a big one to the west. It’s forty kelvin in there — your suit heaters will be screaming.',
        choices: [
          { text: 'Forty kelvin?', to: 'kelvin' },
          { text: 'Going.', to: 'end' },
        ],
      },
      kelvin: { id: 'kelvin', speaker: 'sola', text: 'Minus two hundred and thirty-three Celsius. Colder than Pluto’s surface. On the Moon. Isn’t that wonderful? Take your headlamp. And don’t linger.', next: 'end' },
      kepler: {
        id: 'kepler', speaker: 'sola',
        text: 'Kepler-9 was a mining survey outpost, abandoned eleven years ago “for budget reasons”. Their survey star tracker is exactly what our nav core needs. And their seismometers — I’d love to see those logs.',
        next: 'end',
      },
      quakes: {
        id: 'quakes', speaker: 'sola',
        text: 'The Kepler logs! Give me a minute… Shallow moonquakes are real, we’ve recorded them since the Apollo seismometers. But these… they’re periodic. One every 1,969 seconds, for four months. Then they stopped. The same week the outpost was abandoned.',
        effects: [{ setFlag: 'quakelog.delivered' }, { take: 'quakelog', qty: 1 }, { relationship: { npc: 'sola', delta: 5 } }],
        next: 'end',
      },
      bearings: { id: 'bearings', speaker: 'sola', text: 'Canopus is bright tonight. Well — it’s always bright here. Install the tracker, then lock three reference stars.', next: 'end' },
      idle: { id: 'idle', speaker: 'sola', text: 'I’m stranded on the Moon. I have never been more terrified or more happy in my life. Is that wrong?', next: 'end' },
    },
  },

  /* ------------------------------- Novak -------------------------------- */
  {
    id: 'dlg.novak',
    npc: 'novak',
    entries: [
      { if: { flag: 'okonkwo.found' }, node: 'cmdr' },

      { if: { all: [PRE, { notFlag: 'prologue.petra' }] }, node: 'act0' },
      { if: PRE, node: 'act0b' },
      { if: { all: [CRASHED, { notFlag: 'kit.treated' }] }, node: 'kit' },
      { if: { questActive: 'mq.air' }, node: 'air' },
      { if: { all: [{ module: 'shelter' }, { not: { module: 'greenhouse' } }] }, node: 'green' },
      { if: { module: 'greenhouse' }, node: 'greendone' },
      { if: CRASHED, node: 'idle' },
    ],
    nodes: {
      cmdr: {
        id: 'cmdr', speaker: 'novak',
        text: 'I checked her over. Heart rate normal, bloodwork normal, eleven weeks older by her suit clock and not a day older by her cells. Medically, the commander is fine. Philosophically, I have questions.',
        next: 'end',
      },
      act0: {
        id: 'act0', speaker: 'novak',
        text: 'There you are. Sit. Blood pressure, pupils, the usual pre-docking ritual… You’re fine. Disgustingly fine. How are you sleeping?',
        choices: [
          { text: 'Like a rock.', to: 'rock' },
          { text: 'Honestly? I keep dreaming about the signal.', to: 'dreams' },
        ],
      },
      rock: { id: 'rock', speaker: 'novak', text: 'Good. Go make Kit jealous.', effects: [{ setFlag: 'prologue.petra' }], next: 'end' },
      dreams: {
        id: 'dreams', speaker: 'novak',
        text: 'You and Rafi both. He hums it in the galley. Tell me if it gets worse — that’s what I’m here for. Not just the broken bones.',
        effects: [{ setFlag: 'prologue.petra' }, { relationship: { npc: 'novak', delta: 5 } }],
        next: 'end',
      },
      act0b: { id: 'act0b', speaker: 'novak', text: 'Clean bill of health, Specialist. Go.', next: 'end' },
      kit: {
        id: 'kit', speaker: 'novak',
        text: 'Kit has broken ribs, a concussion, and an ego that will heal fastest. I used my last patches on — on nobody. There’s an emergency crate in cargo. Bring me a Med Patch and I’ll strap him up.',
        choices: [
          { text: 'You said “on nobody”.', to: 'nobody' },
          { text: 'I’ll bring one.', to: 'end' },
        ],
      },
      nobody: {
        id: 'nobody', speaker: 'novak',
        text: 'I set out a kit for the commander. Force of habit — I always set hers first. Then I turned around and her seat was empty. So. Nobody.',
        next: 'end',
      },
      air: { id: 'air', speaker: 'novak', text: 'Your helmet stays on until Mira says otherwise. That’s medical orders, not advice.', next: 'end' },
      green: {
        id: 'green', speaker: 'novak',
        text: 'Now that we have a habitat… I brought seeds. Lettuce, radish, one stubborn tomato. People need something green to look at, {player}. Especially here.',
        next: 'end',
      },
      greendone: { id: 'greendone', speaker: 'novak', text: 'Did you see the radishes? Tiny. Perfect. Three hundred and eighty thousand kilometres from the nearest garden.', next: 'end' },
      idle: { id: 'idle', speaker: 'novak', text: 'Eat. Sleep. Drink water. You’re allowed to be scared, {player}. Just not alone.', next: 'end' },
    },
  },

  /* ------------------------------- Haddad ------------------------------- */
  {
    id: 'dlg.haddad',
    npc: 'haddad',
    entries: [
      { if: { all: [{ questActive: 'mq.network' }, { notFlag: 'network.briefed' }] }, node: 'network' },
      { if: { questActive: 'mq.network' }, node: 'network2' },
      { if: { questActive: 'mq.cadence' }, node: 'cadence' },
      { if: { questActive: 'mq.threshold' }, node: 'thresh' },
      { if: { discovered: 'vesper.orbit' }, node: 'vesperlines' },

      { if: PRE, node: 'act0' },
      { if: { all: [{ flag: 'office.log.read' }, { notFlag: 'office.told' }] }, node: 'office' },
      { if: { all: [{ questActive: 'mq.frontier' }, { notFlag: 'frontier.briefed' }] }, node: 'frontier' },
      { if: { questActive: 'mq.frontier' }, node: 'frontier2' },
      { if: { questActive: 'mq.earthrise' }, node: 'earthrise' },
      { if: { flag: 'earth.called' }, node: 'aftercall' },
      { if: { not: { system: 'power.batteries' } }, node: 'dark' },
      { if: CRASHED, node: 'idle' },
    ],
    nodes: {
      network: {
        id: 'network', speaker: 'haddad',
        text: 'Ines’s burst log. I finally cracked it. It wasn’t a transmission — it was a handshake. A list of addresses, and every one is a place the Blackglass touched: the Moon, Harbor, Melas… and one more we haven’t visited. Ceres. Occator crater.',
        choices: [
          { text: 'Can we reach Ceres?', to: 'network.b' },
          { text: 'And the Cadence’s source?', to: 'network.c' },
        ],
      },
      'network.b': {
        id: 'network.b', speaker: 'haddad',
        text: 'Just. Nine hundred kilos for the transfer — fill the tanks first. And here’s the good part: Ceres Deep, the mining station in Occator, has been building a fusion torch. A prototype. With that, the outer planets stop being a lifetime away.',
        effects: [{ setFlag: 'network.briefed' }],
        next: 'end',
      },
      'network.c': {
        id: 'network.c', speaker: 'haddad',
        text: 'Past Neptune. Way past. We will never get there on hydrolox. Which is why Ceres matters twice.',
        next: 'network.b',
      },
      network2: { id: 'network2', speaker: 'haddad', text: 'Ceres Deep — Occator crater. Talk to their quartermaster, Adeyemi. Their comms have been one long sigh since 04:12:07.', next: 'end' },
      cadence: {
        id: 'cadence', speaker: 'haddad',
        text: 'With the torch lit, the Cadence split into three voices — three nodes singing it in turn. Europa, Titan, Pluto. It’s a path. It’s her path. Scan each node and I’ll stitch the lines together.',
        next: 'end',
      },
      thresh: { id: 'thresh', speaker: 'haddad', text: 'The commander on the bridge again. I keep turning around to check. …The Threshold is on the map. Eighty-two years of the same three words, and we’re going to go and knock.', next: 'end' },
      vesperlines: { id: 'vesperlines', speaker: 'haddad', text: 'I’ve stopped trying to calculate how far from home we are. It makes my handwriting shake.', next: 'end' },
      frontier: {
        id: 'frontier', speaker: 'haddad',
        text: 'Earth Control just relayed something. Melas Station — the science outpost in Valles Marineris, on Mars — went dark at 04:12:07. The same second the Blackglass hit Harbor. Two hundred million kilometres apart.',
        choices: [
          { text: 'Same second? That’s impossible.', to: 'frontier.b' },
          { text: 'Who’s at Melas?', to: 'frontier.c' },
        ],
      },
      'frontier.b': {
        id: 'frontier.b', speaker: 'haddad',
        text: 'Light takes eleven minutes between here and Mars right now. Nothing we know of does “the same second” across that gap. And their beacon is still pinging on a 1,969-second cycle.',
        next: 'frontier.c',
      },
      'frontier.c': {
        id: 'frontier.c', speaker: 'haddad',
        text: 'Four people. And we’re the only crewed deep-space ship in the sky. Earth wants eyes on it. Earth also doesn’t want us home — quarantine, anything the Blackglass touched stays out past the Moon. So: Mars.',
        choices: [{ text: 'What do we need?', to: 'frontier.d' }],
      },
      'frontier.d': {
        id: 'frontier.d', speaker: 'haddad',
        text: 'Propellant. The transfer burn is eight hundred kilos, and Kit wants a landing reserve on top — call it a thousand. Harbor’s depot still has hydrolox; Ines will let us drink from it. Then plot the course on the bridge holo table.',
        effects: [{ setFlag: 'frontier.briefed' }],
        next: 'end',
      },
      frontier2: { id: 'frontier2', speaker: 'haddad', text: 'Melas beacon, still pinging. Still nobody answering it. Let’s go knock.', next: 'end' },
      act0: {
        id: 'act0', speaker: 'haddad',
        text: 'Harbor relays the Cadence for us now. Listen… there. Nineteen hundred and sixty-nine seconds, every single time. Like a lighthouse nobody built.',
        choices: [
          { text: '1969. Like the first landing.', to: 'year' },
          { text: 'Anything new in it?', to: 'new' },
        ],
      },
      year: {
        id: 'year', speaker: 'haddad',
        text: 'Everybody notices that. Directorate says numerology. I say the universe has a sense of humour, or somebody out there read our history books.',
        next: 'end',
      },
      new: { id: 'new', speaker: 'haddad', text: 'The same nothing, beautifully repeated. Ask me again in four years.', next: 'end' },
      dark: { id: 'dark', speaker: 'haddad', text: 'Everything’s dead up here. Without power I’m just a man talking to static. Get us power and I’ll get us voices.', next: 'end' },
      earthrise: {
        id: 'earthrise', speaker: 'haddad',
        text: 'Short range needs the hull antenna — dorsal spine, climb the ladder by the airlock. Long range is the real problem: we’re on the far side. Earth is below our horizon.',
        choices: [{ text: 'So how do we call home?', to: 'summit' }],
      },
      summit: {
        id: 'summit', speaker: 'haddad',
        text: 'There’s a massif to the north-west. Highest ground for kilometres. From the top, the libration might just lift Earth over the rim. Build me a relay kit and carry it up there. If you see Earth… wave.',
        next: 'end',
      },
      aftercall: {
        id: 'aftercall', speaker: 'haddad',
        text: 'They heard us. Months until anyone can reach us — but they heard us. I’ve been listening to Earth chatter for an hour. Football scores. Weather. It’s the most beautiful noise I’ve ever heard.',
        next: 'end',
      },
      office: {
        id: 'office', speaker: 'haddad',
        text: 'You got into her office? What did you find?',
        choices: [
          { text: 'She knew the period was 1,969 seconds before we launched. The Directorate told her to keep it quiet.', to: 'truth' },
          { text: 'Nothing that helps. Personal logs.', to: 'lie' },
        ],
      },
      truth: {
        id: 'truth', speaker: 'haddad',
        text: '…Before launch. So when I “discovered” the repetition in month two, she already knew. She let me be excited about it. …I don’t know whether to be angry or grateful. Thank you for telling me.',
        effects: [{ setFlag: 'office.told' }, { setFlag: 'office.truthShared' }, { relationship: { npc: 'haddad', delta: 10 } }],
        next: 'end',
      },
      lie: {
        id: 'lie', speaker: 'haddad',
        text: 'Right. Personal. …Okay. If you say so.',
        effects: [{ setFlag: 'office.told' }, { relationship: { npc: 'haddad', delta: -5 } }],
        next: 'end',
      },
      idle: { id: 'idle', speaker: 'haddad', text: 'Still no carrier from Harbor. Still listening.', next: 'end' },
    },
  },
];

/* ------------------------------ Harbor ------------------------------ */
DIALOGUES.push(
  {
    id: 'dlg.carvalho',
    npc: 'carvalho',
    entries: [
      { if: { notFlag: 'harbor.survivors' }, node: 'meet' },
      { if: { questActive: 'mq.frontier' }, node: 'depot' },
      { if: { always: true }, node: 'after' },
    ],
    nodes: {
      meet: {
        id: 'meet', speaker: 'carvalho',
        text: 'You’re — you’re the Lantern? You’re supposed to be dead. We watched you fall. We watched you go over the limb and we held a minute of silence for you.',
        choices: [
          { text: 'Five of us made it. Who’s left here?', to: 'left' },
          { text: 'What happened to the station?', to: 'what' },
        ],
      },
      left: {
        id: 'left', speaker: 'carvalho',
        text: 'Two. Me and Tomasz. Seven were in Hab 3 when it tore loose. …Five of you. That’s — good. That’s good news. I needed some.',
        next: 'what',
      },
      what: {
        id: 'what', speaker: 'carvalho',
        text: 'It didn’t hit us. It passed *through* the ring. Hab 3 came away like paper, and every system on the station died at once. Four hours in the dark. Then everything came back on by itself. Everything.',
        choices: [{ text: 'By itself?', to: 'itself' }],
      },
      itself: {
        id: 'itself', speaker: 'carvalho',
        text: 'No operator. No command. And two things I can’t explain. The airlock on Hab 1 cycled — open, shut — with nobody in it. And our long-range dish transmitted a single burst, aimed outward. Past Mars. Past everything.',
        choices: [
          { text: 'Our commander vanished from a sealed bridge.', to: 'cmdr' },
          { text: 'Where was the burst aimed?', to: 'aim' },
        ],
      },
      cmdr: {
        id: 'cmdr', speaker: 'carvalho',
        text: 'Adaeze? …Then maybe the airlock wasn’t empty. I don’t know what I’m saying. I don’t know anything anymore, except that this isn’t over.',
        next: 'aim',
      },
      aim: {
        id: 'aim', speaker: 'carvalho',
        text: 'Toward the outer system. The same patch of sky the Cadence comes from. Your expedition was going there, wasn’t it? Then take this — the burst log. Whatever you do next, you’ll need it more than I do.',
        effects: [{ setFlag: 'harbor.survivors' }, { setFlag: 'harbor.burstlog' }, { relationship: { npc: 'carvalho', delta: 20 } }],
        next: 'end',
      },
      depot: {
        id: 'depot', speaker: 'carvalho',
        text: 'Mars? …Of course it’s Mars. The propellant depot is off the lobby — take what you need, the relief ship brings more. And Lantern: come back.',
        next: 'end',
      },
      after: {
        id: 'after', speaker: 'carvalho',
        text: 'Earth says a relief ship is four months out. We’ll hold. You go do what you came to do — and come back and tell me what it was.',
        next: 'end',
      },
    },
  },
  {
    id: 'dlg.wren',
    npc: 'wren',
    entries: [{ if: { always: true }, node: 'hi' }],
    nodes: {
      hi: {
        id: 'hi', speaker: 'wren',
        text: 'Sorry. I — sorry. I kept the plant alive. That’s all I did for four hours. Watered the plant and counted. Nineteen hundred and sixty-nine. I don’t know why I was counting that. I just was.',
        choices: [
          { text: 'You did well. You’re safe now.', to: 'safe' },
          { text: 'Counting what?', to: 'count' },
        ],
      },
      safe: { id: 'safe', speaker: 'wren', text: 'Yeah. Yeah. Thanks. …You’re the first new face I’ve seen in a year that wasn’t on a screen.', effects: [{ relationship: { npc: 'wren', delta: 10 } }], next: 'end' },
      count: { id: 'count', speaker: 'wren', text: 'The hum. The station hummed. Every thirty-two minutes and forty-nine seconds, the hull hummed. Ines says I imagined it. I didn’t.', next: 'end' },
    },
  },
);

/* ------------------------------ Mars ------------------------------ */
DIALOGUES.push(
  {
    id: 'dlg.rao',
    npc: 'rao',
    entries: [
      { if: { notFlag: 'melas.found' }, node: 'meet' },
      { if: { all: [{ flag: 'melas.power' }, { notFlag: 'melas.debrief' }] }, node: 'debrief' },
      { if: { notFlag: 'melas.power' }, node: 'waiting' },
      { if: { always: true }, node: 'after' },
    ],
    nodes: {
      meet: {
        id: 'meet', speaker: 'rao',
        text: 'Is — is that a suit light? You’re real. You’re not ours. Who — the Lantern? From the Moon? You came to Mars? …Sorry. Sit. Everything here is cold, including me.',
        choices: [
          { text: 'What happened here?', to: 'what' },
          { text: 'Are you hurt?', to: 'hurt' },
        ],
      },
      hurt: { id: 'hurt', speaker: 'rao', text: 'Cold, hungry, fine. Lucía rationed the heater. We’ve been sitting in this shelter for six sols listening to the walls tick.', next: 'what' },
      what: {
        id: 'what', speaker: 'rao',
        text: '04:12:07. Everything died at once. The feeder cable from the reactor was cut — outside, clean, like a scalpel. And the bus start cells drained to zero in the same instant. We were both in here. Nobody cut it.',
        choices: [
          { text: 'Station status says four crew. Where are the others?', to: 'others' },
          { text: 'I can fix the power.', to: 'fix' },
        ],
      },
      others: {
        id: 'others', speaker: 'rao',
        text: 'Kamau and Ishikawa took the rover east, three sols before the blackout, chasing a seismic ping — a quake every thirty-two minutes and forty-nine seconds. They never came back. I don’t know where the rover is.',
        next: 'fix',
      },
      fix: {
        id: 'fix', speaker: 'rao',
        text: 'Splice the feeder line outside, between the reactor and the hab — you’ll need a power conduit, there’s a spare in the cabinet by the door. Seat two fresh power cells in the bus, in the power bay. Then restart it. Please.',
        effects: [{ setFlag: 'melas.found' }, { relationship: { npc: 'rao', delta: 10 } }],
        next: 'end',
      },
      waiting: { id: 'waiting', speaker: 'rao', text: 'Feeder outside, two cells in the bus, then restart. I’d help, but my hands stopped working about a sol ago.', next: 'end' },
      debrief: {
        id: 'debrief', speaker: 'rao',
        text: 'Heat. Light. Thank you. …Now that the archive is up, there’s something you need to see. The external camera, 04:12:07, the instant before it died.',
        choices: [{ text: 'Show me.', to: 'footage' }],
      },
      footage: {
        id: 'footage', speaker: 'rao',
        text: 'A figure in a surface suit, walking past the hab. Not one of ours — white, with gold trim. No helmet lamp. It doesn’t look at the camera. It just walks east, toward the canyon wall. Then the feed dies.',
        choices: [
          { text: 'White with gold trim… that’s Commander Okonkwo’s suit.', to: 'okonkwo' },
          { text: 'Could it be one of your missing crew?', to: 'notours' },
        ],
      },
      notours: { id: 'notours', speaker: 'rao', text: 'Our suits are orange. And that suit isn’t an areology rig — look at the mission patch. Is that… an expedition patch? Yours?', next: 'okonkwo' },
      okonkwo: {
        id: 'okonkwo', speaker: 'rao',
        text: 'Your commander vanished near the Moon, and walked past my window on Mars, in the same second? …The tracks will still be out there if the wind hasn’t taken them. East, toward the wall. Go before the next storm.',
        effects: [{ setFlag: 'melas.debrief' }, { setFlag: 'footprints.revealed' }, { relationship: { npc: 'rao', delta: 10 } }],
        next: 'end',
      },
      after: { id: 'after', speaker: 'rao', text: 'We’ll hold here. Find out what walked past our window — and if you see our rover, bring Kamau and Ishikawa home.', next: 'end' },
    },
  },
  {
    id: 'dlg.benedetti',
    npc: 'benedetti',
    entries: [
      { if: { notFlag: 'melas.power' }, node: 'cold' },
      { if: { always: true }, node: 'warm' },
    ],
    nodes: {
      cold: {
        id: 'cold', speaker: 'benedetti',
        text: 'Don’t mind me. I’m saving heat by not moving. …That feeder was cut like a laser did it, and there are no lasers on Mars. I checked. Twice.',
        choices: [
          { text: 'You’re the engineer?', to: 'eng' },
          { text: 'Hang on. Help is here.', to: 'end' },
        ],
      },
      eng: { id: 'eng', speaker: 'benedetti', text: 'Lucía Benedetti, station engineer, current occupation: popsicle. Seat the cells cleanly, and let the bus pre-charge before you hit restart. It’ll grumble. That’s normal.', next: 'end' },
      warm: {
        id: 'warm', speaker: 'benedetti',
        text: '¡Agua caliente! You beautiful people. If your ship’s on the pad, the ISRU plant in the power bay can top up your tanks — Melas sits on a lot of buried ice.',
        next: 'end',
      },
    },
  },
);

/* ------------------------------ Ceres, Venus ------------------------------ */
DIALOGUES.push(
  {
    id: 'dlg.adeyemi',
    npc: 'adeyemi',
    entries: [
      { if: { notFlag: 'ceres.met' }, node: 'meet' },
      { if: { flag: 'ceres.hangar' }, node: 'thanks' },
      { if: { always: true }, node: 'pylons' },
    ],
    nodes: {
      meet: {
        id: 'meet', speaker: 'adeyemi',
        text: 'A crewed ship. Out here. You’ll forgive me if I check you’re not a drone. …You’re not. Welcome to Ceres Deep. We have coffee, water, and a problem.',
        choices: [{ text: 'What happened here?', to: 'what' }],
      },
      what: {
        id: 'what', speaker: 'adeyemi',
        text: '04:12:07. Every drone we own stopped mid-task, went home, and engaged a quarantine protocol on the prototype hangar. Nobody told them to. When Mei-Ling tried to override it, they blocked the hatch with their bodies.',
        choices: [
          { text: 'How do we break the lock?', to: 'how' },
          { text: 'What’s in the hangar?', to: 'kestrel' },
        ],
      },
      kestrel: { id: 'kestrel', speaker: 'adeyemi', text: 'The Kestrel. A fusion torch. Mei-Ling’s life’s work. I suspect you want it. I suspect I’ll let you have it, if you can get it out.', next: 'how' },
      how: {
        id: 'how', speaker: 'adeyemi',
        text: 'The protocol needs a quorum from three drone relays out on the salt — west, south-east, east. Weld a bypass into each pylon and it loses its vote. I’d do it myself but they watch me. They don’t know you. The refuel line on the east wall is yours, by the way.',
        effects: [{ setFlag: 'ceres.met' }, { relationship: { npc: 'adeyemi', delta: 10 } }],
        next: 'end',
      },
      pylons: { id: 'pylons', speaker: 'adeyemi', text: 'Three pylons: west, south-east, east. Then the hangar hatch north of the dome. Mind the seed on the bright dome — it’s been pinging since the drones went quiet.', next: 'end' },
      thanks: { id: 'thanks', speaker: 'adeyemi', text: 'The drones are asleep and the hangar’s open. Ceres Deep owes you one. Several. Come back and I’ll keep the coffee hot.', effects: [{ relationship: { npc: 'adeyemi', delta: 5 } }], next: 'end' },
    },
  },
  {
    id: 'dlg.zhou',
    npc: 'zhou',
    entries: [
      { if: { system: 'prop.fusion' }, node: 'lit' },
      { if: { flag: 'ceres.hangar' }, node: 'install' },
      { if: { always: true }, node: 'hi' },
    ],
    nodes: {
      hi: {
        id: 'hi', speaker: 'zhou',
        text: 'Deuterium–helium-3, magnetic nozzle, specific impulse you would not believe. It is sitting in a hangar behind a door guarded by my own drones, which is humiliating. Get it out and it’s yours. I only ask that you fly it somewhere worth the trouble.',
        next: 'end',
      },
      install: {
        id: 'install', speaker: 'zhou',
        text: 'Core first, then both coils, then tune the confinement before ignition — never the other way round. Your engineer will know. I packed thermal tiles in the cradle too, in case you want to visit the Sun. People always want to visit the Sun.',
        next: 'end',
      },
      lit: { id: 'lit', speaker: 'zhou', text: 'I felt it light from here. Don’t redline it past Jupiter. …Actually, do. Tell me what happens.', effects: [{ relationship: { npc: 'zhou', delta: 5 } }], next: 'end' },
    },
  },
  {
    id: 'dlg.ferreira',
    npc: 'ferreira',
    entries: [{ if: { always: true }, node: 'hi' }],
    nodes: {
      hi: {
        id: 'hi', speaker: 'ferreira',
        text: 'Welcome to Halcyon: Earth pressure, Earth temperature, and the finest view in the Solar System, provided you like the colour yellow. Our deep radar found something under the clouds. The survey terminal is behind me — look at survey 88.',
        choices: [
          { text: 'Why live above Venus?', to: 'why' },
          { text: 'I’ll look.', to: 'end' },
        ],
      },
      why: { id: 'why', speaker: 'ferreira', text: 'Fifty kilometres up, the air outside is at one bar and thirty degrees. Breathable air is a lifting gas here, so the whole city floats. It’s the most Earth-like place off Earth — you just can’t go outside without an acid suit.', next: 'end' },
    },
  },
);

/** Ambient crew lines and banter. Conditions keep them truthful to the current state. */
export const BARKS: BarkDef[] = [
  { id: 'b.kit.coast', npc: 'arakawa', text: 'Harbor approach in… a while. Moon’s getting big.', if: PRE, reply: { npc: 'okonkwo', text: 'Eyes on your instruments, Mr Arakawa.' } },
  { id: 'b.rafi.cadence', npc: 'haddad', text: 'Nineteen sixty-nine seconds. Right on time again.', if: PRE },
  { id: 'b.mira.purr', npc: 'castellanos', text: 'Hear that? That’s a happy reactor.', if: PRE },
  { id: 'b.mira.dark', npc: 'castellanos', text: 'Every panel I open is worse than the last one.', if: { all: [CRASHED, { not: { system: 'power.batteries' } }] } },
  { id: 'b.kit.ribs', npc: 'arakawa', text: 'If anyone needs me I’ll be here. Horizontal. Forever.', if: { all: [CRASHED, { notFlag: 'kit.treated' }] }, reply: { npc: 'novak', text: 'Stop talking and breathe, Kit.' } },
  { id: 'b.imani.far', npc: 'sola', text: 'Far side, south pole. Do you know how many geologists would kill to be stranded here?', if: CRASHED, reply: { npc: 'castellanos', text: 'Name one, and I’ll send them the bill.' } },
  { id: 'b.petra.air', npc: 'novak', text: 'Helmets off. Everyone. Breathe. Go on.', if: { system: 'life.support' }, once: true },
  { id: 'b.rafi.static', npc: 'haddad', text: 'Harbor, Lantern. Harbor, Lantern. …Nothing.', if: { all: [CRASHED, { not: { system: 'comms.long' } }] } },
  { id: 'b.mira.reactor', npc: 'castellanos', text: 'Sixty kilowatts. I could cry. I might.', if: { system: 'power.reactor' }, once: true, reply: { npc: 'haddad', text: 'Nobody’s looking.' } },
  { id: 'b.imani.cmdr', npc: 'sola', text: 'She’d have wanted us to keep going. Wherever she is.', if: { all: [CRASHED, { system: 'life.support' }] }, once: true },
  { id: 'b.kit.level', npc: 'arakawa', text: 'Oh, that’s so much better. The floor is a floor again.', if: { system: 'prop.main', step: 'struts' }, once: true },
  { id: 'b.rafi.earth', npc: 'haddad', text: 'Somebody on Earth just asked if we need anything. I said pizza.', if: { flag: 'earth.called' }, once: true, reply: { npc: 'novak', text: 'Tell them vegetables.' } },
  { id: 'b.mira.base', npc: 'castellanos', text: 'Keep an eye on the battery bank when the Sun dips. Night is long.', if: { module: 'solar' }, location: 'moon.south' },
  { id: 'b.kit.mars', npc: 'arakawa', text: 'Landed on Mars on a ship that crashed on the Moon. Put that on my résumé.', if: { discovered: 'mars.melas' }, once: true, reply: { npc: 'castellanos', text: 'Put “crashed” in small print.' } },
  { id: 'b.rafi.quarantine', npc: 'haddad', text: 'Earth won’t take us back until they know what the Blackglass is. Fair. Awful, but fair.', if: { questActive: 'mq.frontier' }, once: true },
  { id: 'b.petra.transit', npc: 'novak', text: 'Seven months compressed into ninety seconds and I still feel it in my knees.', if: { discovered: 'mars.orbit' }, once: true },
  { id: 'b.mira.torch', npc: 'castellanos', text: 'Every time the torch spools up I hear Zhou saying “never the other way round”.', if: { system: 'prop.fusion' }, once: true },
  { id: 'b.kit.europa', npc: 'arakawa', text: 'Jupiter filling the whole window. Somebody pinch me. Not the ribs.', if: { discovered: 'europa.orbit' }, once: true },
  { id: 'b.imani.titan', npc: 'sola', text: 'It rained on me on Titan. Methane rain. I’m putting that on my headstone.', if: { discovered: 'titan.kraken' }, once: true },
  { id: 'b.rafi.cmdr', npc: 'haddad', text: 'The commander asked me for a coffee. Like nothing happened. I made her one. Like nothing happened.', if: { flag: 'okonkwo.found' }, once: true, reply: { npc: 'okonkwo', text: 'It was very good coffee, Rafi.' } },
  { id: 'b.petra.vesper', npc: 'novak', text: 'I keep taking deep breaths of Vesper air in the airlock. Don’t tell anyone.', if: { discovered: 'vesper.terminator' }, once: true },
  { id: 'b.petra.garden', npc: 'novak', text: 'The tomato has a flower. Don’t tell anyone. I don’t want to jinx it.', if: { module: 'greenhouse' }, location: 'moon.south', once: true },
];
