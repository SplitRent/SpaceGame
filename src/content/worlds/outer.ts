import type { SurfaceDef } from '../worldTypes';

/* ================================ EUROPA ================================ */

export const EUROPA_SURFACE: SurfaceDef = {
  id: 'europa.conamara',
  name: 'Conamara Chaos, Europa',
  body: 'europa',
  title: 'Europa',
  subtitle: 'Conamara Chaos · moon of Jupiter',
  seed: 5150,
  size: 1536,
  gravity: 1.31,
  atmosphere: 'vacuum',
  airLabel: 'VACUUM · HIGH RADIATION',
  temperature: [-160, -170],
  coldLimit: -230,
  radiationDamage: 0.04,
  ambience: 'vacuum',
  terrain: {
    baseAmp: 5, craterCount: 30, craterMaxR: 22, curvatureR: 1560000,
    features: [
      { kind: 'rim', r0: 580, r1: 760, h: 110 },
      // Chaos: rafts of old crust, broken, rotated and refrozen in a slushy matrix
      { kind: 'blocks', x: 160, z: -80, r: 380, count: 40, h: 16, size: [30, 90] },
      { kind: 'ridge', x0: -720, z0: -320, x1: 720, z1: 220, w: 16, h: 20, double: true },
      { kind: 'ridge', x0: -520, z0: 640, x1: 600, z1: -660, w: 13, h: 15, double: true },
      { kind: 'ridge', x0: -720, z0: 460, x1: 320, z1: 720, w: 11, h: 11, double: true },
      { kind: 'basin', x: 262, z: -198, r: 26, depth: 5 },
    ],
  },
  palette: {
    base: '#e2e6ea', alt: '#d6d0c6', altScale: 160, rock: '#c9ccd0', detail: false,
    layers: [
      { mask: 'lineae', color: '#a0603c', scale: 260, width: 0.035, amount: 0.75 },
      { mask: 'noise', color: '#b88060', scale: 90, threshold: 0.64, amount: 0.35 },
      { mask: 'slope', color: '#9fc0d6', amount: 0.35 },
      { mask: 'patch', color: '#8a5a44', x: 262, z: -198, r: 60, amount: 0.6 },
    ],
  },
  sky: { kind: 'space', starBrightness: 0.9 },
  sun: { dir: [0.55, 0.24, -0.6], color: '#fff8f0', intensity: 2.3 },
  skyBody: { kind: 'jupiter', angularDeg: 12, dir: [-0.5, 0.42, -0.72], spin: 0.004 },
  fill: { sky: '#d8c29a', ground: '#8a9aa6', intensity: 0.3 },
  lz: [-210, 260],
  pois: [
    {
      id: 'spire', kind: 'spire', x: 262, z: -200, scale: 1.1, scan: 'db.europaspire', color: '#6a8cff',
      zone: { id: 'europa.spire', name: 'The Crack', r: 50 },
    },
    { id: 'plume1', kind: 'geyser', x: 300, z: -238, scan: 'db.plume' },
    { id: 'plume2', kind: 'geyser', x: 228, z: -160 },
    {
      id: 'recorder', kind: 'recorder', x: 248, z: -186, scan: 'db.recorder',
      interact: {
        prompt: 'A suit recorder with a gold band',
        once: true,
        effects: [{ setFlag: 'europa.recorder' }],
        log: {
          title: 'Recorder — Okonkwo (1)',
          text: 'Recorder, Okonkwo. If you’re hearing this, you followed. I hoped you wouldn’t, and I hoped you would.\n\nI unbuckled on my own. I need you to know that. When the Blackglass came alongside, I knew what it was, because I had been waiting for it for two years. It’s not a weapon. It’s a courier. It came for the person who answered the Cadence. That was me.\n\nIt carries you from node to node — no time passes, or all of it does. I have been on the Moon, at Harbor, at Melas, on Ceres, all in one breath. Here there’s an ocean under the ice, and the node listens to it. It likes oceans.\n\nDon’t stay long. Jupiter will cook you. Titan is next. The node will show you the way if you scan it — the Cadence isn’t one voice. Each node sings a line.',
        },
      },
    },
    {
      id: 'edeep', kind: 'wreck', variant: 'lander', x: -430, z: -110, rot: 0.7, scan: 'db.edeep',
      zone: { id: 'europa.lander', name: 'Europa Deep-1', r: 35 },
    },
    {
      id: 'edeeplog', kind: 'terminal', x: -422, z: -102, rot: 0.7,
      interact: {
        prompt: 'Europa Deep-1 — lander memory core',
        once: true,
        effects: [{ give: 'electronics', qty: 4 }, { give: 'powercell', qty: 1 }],
        log: {
          title: 'EUROPA DEEP-1 — final uplink (2046)',
          text: 'Melt probe depth 2,140 m. Liquid water contact at 2,214 m. Salinity 4.1%. Temperature −0.9 °C.\n\nSonar return at 2,260 m: a vertical structure extending from the ice ceiling into the ocean. Acoustic reflectivity: zero. Probe camera: no image (no light returned).\n\nProbe instructed to approach. Probe did not approach. Probe reports it is “already there”. Telemetry repeats every 1,969 s until power loss.\n\n[Classified — Directorate eyes only. Mission record amended: “probe lost to ice fracture”.]',
        },
      },
    },
    { id: 'marker', kind: 'marker', x: -190, z: 240 },
  ],
  nodes: [
    { id: 'ice', label: 'Clean water ice', color: '#dff0fa', yields: [['ice', 3]], db: 'db.europaice', count: 16, shiny: true },
    { id: 'salts', label: 'Hydrated salts (red lineae)', color: '#a0603c', yields: [['salts', 2]], alt: [['carbon', 1]], db: 'db.europasalt', count: 12 },
  ],
  rocks: { count: 1800, maxScale: 2 },
  ground: { label: 'Europa ice', item: 'ice', db: 'db.europaice' },
  arrival: {
    lines: [
      ['Sola', 'Europa. Under this shell there’s more liquid water than in all of Earth’s oceans.'],
      ['Castellanos', 'And over it, Jupiter’s radiation belts. Dosimeters are running. Don’t dawdle out there.'],
      ['Haddad', 'The node is south-east — a crack in the chaos. And a suit beacon. Gold band.'],
    ],
    hint: 'Europa: radiation slowly harms you outside (watch HEALTH). Ceres Deep’s liners keep your suit warm down to −230 °C. The ground here is clean ice — mine it for propellant.',
  },
};

/* ================================= TITAN ================================= */

export const TITAN_SURFACE: SurfaceDef = {
  id: 'titan.kraken',
  name: 'Kraken Mare shore, Titan',
  body: 'titan',
  title: 'Titan',
  subtitle: 'Shore of Kraken Mare · moon of Saturn',
  seed: 6200,
  size: 1536,
  gravity: 1.35,
  atmosphere: 'toxic',
  airLabel: 'N₂/CH₄ · 1.5 BAR',
  temperature: [-179, -180],
  coldLimit: -230,
  ambience: 'mars',
  terrain: {
    baseAmp: 7, craterCount: 12, craterMaxR: 30, curvatureR: 2570000,
    features: [
      { kind: 'rim', r0: 620, r1: 760, h: 140 },
      { kind: 'basin', x: 330, z: -210, r: 400, depth: 14 },
      { kind: 'dunes', x: -260, z: 320, r: 380, wavelength: 60, h: 9, angle: 0.3 },
      { kind: 'mountains', x: -520, z: -470, r: 200, h: 120 },
    ],
  },
  palette: {
    base: '#6b4a2a', alt: '#7d5a34', altScale: 150, rock: '#5a4a3a', detail: true,
    layers: [
      { mask: 'height', color: '#2a1e14', below: -3, amount: 0.85 },
      { mask: 'noise', color: '#3a2818', scale: 60, threshold: 0.55, amount: 0.35 },
      { mask: 'slope', color: '#8a7a64', amount: 0.5 },
    ],
  },
  liquid: { level: -6, color: '#1a120c', opacity: 0.93, x: 330, z: -210, r: 400, label: 'Kraken Mare — liquid methane and ethane' },
  sky: { kind: 'atmo', zenith: '#9a5e24', horizon: '#d09448', halo: '#f0c080', fogNear: 60, fogFar: 950, nightStars: 0 },
  sun: { dir: [0.3, 0.62, -0.5], color: '#ffcc88', intensity: 0.9, disc: 0.3 },
  fill: { sky: '#d49a4a', ground: '#3a2818', intensity: 0.6 },
  weather: { kind: 'rain', color: '#caa070', density: 0.5 },
  lz: [-160, 90],
  pois: [
    {
      id: 'spire', kind: 'spire', x: 20, z: -60, scale: 1.2, scan: 'db.titanspire', color: '#ff9a4a',
      zone: { id: 'titan.spire', name: 'The Shallows', r: 50 },
    },
    {
      id: 'recorder', kind: 'recorder', x: 4, z: -44, scan: 'db.recorder',
      interact: {
        prompt: 'A suit recorder with a gold band',
        once: true,
        effects: [{ setFlag: 'titan.recorder' }],
        log: {
          title: 'Recorder — Okonkwo (2)',
          text: 'Recorder, Okonkwo. Titan. It’s raining. Methane rain, fat slow drops, like a dream of Earth made out of the wrong things.\n\nThe nodes remember everyone who has ever stood at them. I asked it — I don’t know how, you just think at it — who else had come. There is no one else in the memory. Not for a billion years. Just me. And, soon, you.\n\nThe Directorate heard the Cadence thirty-one years ago. They called it Project Lighthouse and they gave it to me. I answered it from Harbor’s dish two years ago, alone, at night, and I never told any of you. I’m sorry.\n\nPluto. I’ll wait at Pluto. It won’t let me go further alone. Scan this node — it sings the second line.',
        },
      },
    },
    {
      id: 'dragonfly', kind: 'wreck', variant: 'rotorcraft', x: -390, z: 130, rot: 1.1, scan: 'db.dragonfly',
      zone: { id: 'titan.dragonfly', name: 'Dragonfly II', r: 30 },
    },
    {
      id: 'dflog', kind: 'terminal', x: -382, z: 138, rot: 1.1,
      interact: {
        prompt: 'Dragonfly II — flight computer',
        once: true,
        effects: [{ give: 'electronics', qty: 3 }, { give: 'circuit', qty: 1 }],
        log: {
          title: 'DRAGONFLY II — rotorcraft lander, flight 212',
          text: 'Titan’s air is four times denser than Earth’s and its gravity a seventh — flying here is easier than anywhere in the Solar System. We flew 212 sorties across the dunes, sniffing organics.\n\nFlight 212: descending to sample the Kraken shore. Unscheduled contact: a vertical object in the shallows, 11 m, no radar return. Mass spectrometer: nothing. Camera: nothing. Rotor 3 icing. Autoland.\n\nWe sat and watched it for the rest of our mission life. Every 1,969 seconds, the methane around it rippled.',
        },
      },
    },
    { id: 'refinery', kind: 'drill', x: -320, z: -260, rot: 0.3, scan: 'db.titanrefinery' },
    {
      id: 'cache', kind: 'crate', x: -300, z: -250, rot: 0.3,
      interact: { prompt: 'Automated refinery cache', once: true, effects: [{ give: 'organics', qty: 6 }, { give: 'o2canister', qty: 2 }, { notify: 'Refined organics and oxygen canisters.' }] },
    },
  ],
  nodes: [
    { id: 'organics', label: 'Tholin dune sand', color: '#4a3220', yields: [['organics', 2]], db: 'db.tholin', count: 14, x: -260, z: 320, r: 360 },
    { id: 'ice', label: 'Water-ice bedrock cobble', color: '#d8d4c8', yields: [['ice', 3]], db: 'db.titanice', count: 14 },
  ],
  rocks: { count: 2400, maxScale: 1.8 },
  ground: { label: 'Titan sand (organics)', item: 'organics', db: 'db.tholin' },
  arrival: {
    lines: [
      ['Arakawa', 'Titan. Air thick enough to fly in and gravity to match. If we had wings, we’d be birds.'],
      ['Sola', 'Methane rain. Rivers. A sea. Everything Earth has, made out of the wrong things.'],
      ['Haddad', 'Node’s in the shallows, north-east. Gold-band beacon again.'],
    ],
    hint: 'Titan: thick, freezing, poisonous air (keep the helmet sealed). The dark flats are a sea of liquid methane — the spire stands in the shallows.',
  },
};

/* ================================= PLUTO ================================= */

export const PLUTO_SURFACE: SurfaceDef = {
  id: 'pluto.sputnik',
  name: 'Sputnik Planitia, Pluto',
  body: 'pluto',
  title: 'Pluto',
  subtitle: 'Sputnik Planitia · the heart',
  seed: 7400,
  size: 1536,
  gravity: 0.62,
  atmosphere: 'vacuum',
  airLabel: 'N₂ · 10 µBAR',
  temperature: [-229, -232],
  coldLimit: -240,
  ambience: 'vacuum',
  terrain: {
    baseAmp: 3, craterCount: 0, craterMaxR: 10, curvatureR: 1190000,
    features: [
      { kind: 'rim', r0: 600, r1: 760, h: 220 },
      { kind: 'cells', scale: 95, depth: 3.5, x: 150, z: 150, r: 560 },
      { kind: 'mountains', x: -470, z: -430, r: 230, h: 240 },
      { kind: 'blocks', x: -520, z: -380, r: 210, count: 22, h: 55, size: [40, 110] },
    ],
  },
  palette: {
    base: '#f2efe8', alt: '#e6ddd0', altScale: 140, rock: '#9a8878', detail: false,
    layers: [
      { mask: 'height', color: '#7a5e4a', above: 25, amount: 0.8 },
      { mask: 'patch', color: '#8a4a32', x: -640, z: 360, r: 320, amount: 0.6 },
      { mask: 'noise', color: '#d8ccbc', scale: 45, threshold: 0.6, amount: 0.4 },
      { mask: 'slope', color: '#6a5244', amount: 0.4 },
    ],
  },
  sky: { kind: 'space', starBrightness: 1.4 },
  sun: { dir: [0.4, 0.2, 0.6], color: '#ffffff', intensity: 1.5, disc: 0.2 },
  skyBody: { kind: 'charon', angularDeg: 3.6, dir: [-0.6, 0.48, -0.55], spin: 0 },
  fill: { sky: '#8fb0ff', ground: '#b0a898', intensity: 0.25 },
  weather: { kind: 'snow', color: '#ffffff', density: 0.25 },
  lz: [-110, 210],
  pois: [
    {
      id: 'spire', kind: 'spire', x: 210, z: -130, scale: 1.6, scan: 'db.plutospire', color: '#9a7aff',
      zone: { id: 'pluto.spire', name: 'The Heart', r: 60 },
    },
    { id: 'okonkwo', kind: 'npcspot', x: 214, z: -116, rot: Math.PI },
    { id: 'cairn', kind: 'marker', x: 190, z: -100, scan: 'db.recorder' },
    { id: 'beacon', kind: 'beacon', x: 222, z: -110, color: '#ffcf7a', visibleIf: { notFlag: 'okonkwo.found' } },
  ],
  nodes: [
    { id: 'ice', label: 'Water-ice block', color: '#d6d0c6', yields: [['ice', 3]], db: 'db.plutoice', count: 14, x: -470, z: -420, r: 280 },
    { id: 'tholin', label: 'Tholin-stained frost', color: '#8a4a32', yields: [['organics', 2]], db: 'db.tholin', count: 10, x: -600, z: 330, r: 260 },
  ],
  rocks: { count: 900, maxScale: 1.6 },
  ground: { label: 'Nitrogen frost and grit', item: 'regolith', db: 'db.nitrogen' },
  arrival: {
    lines: [
      ['Novak', 'Minus two hundred and thirty. Keep moving. Keep your heaters on.'],
      ['Haddad', 'Suit beacon. Live. Two hundred metres east of the spire… it’s hers. It’s her.'],
    ],
    hint: 'Pluto: 0.06 g on a glacier of nitrogen ice that slowly churns. The beacon is at the great spire to the east.',
  },
};
