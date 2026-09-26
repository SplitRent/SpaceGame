import type { SurfaceDef, InteriorDef } from '../worldTypes';
import { outpostRooms, outpostExit, OUTPOST_SPAWN } from './common';

const PYLONS = ['ceres.pylon.1', 'ceres.pylon.2', 'ceres.pylon.3'];
const pylon = (n: number, x: number, z: number) => ({
  id: `pylon${n}`, kind: 'pylon' as const, x, z, color: '#ff5a3a', scan: 'db.cerespylon',
  zone: { id: `ceres.pylon${n}`, name: `Drone Relay ${'ABC'[n - 1]}`, r: 25 },
  weld: {
    label: `Drone relay ${'ABC'[n - 1]} — quarantine lock`,
    available: { all: [{ flag: 'ceres.met' }, { notFlag: PYLONS[n - 1] }] },
    effects: [{ setFlag: PYLONS[n - 1] }, { notify: `Relay ${'ABC'[n - 1]} reset. The drones in its sector power down.` }],
    time: 3,
  },
});

export const CERES_SURFACE: SurfaceDef = {
  id: 'ceres.occator',
  name: 'Occator Crater, Ceres',
  body: 'ceres',
  title: 'Ceres',
  subtitle: 'Occator Crater · the asteroid belt',
  seed: 9101,
  size: 1536,
  gravity: 0.28,
  atmosphere: 'vacuum',
  airLabel: 'VACUUM',
  temperature: [-38, -110],
  ambience: 'vacuum',
  terrain: {
    baseAmp: 9, craterCount: 320, craterMaxR: 55, curvatureR: 470000,
    features: [
      { kind: 'rim', r0: 520, r1: 740, h: 380 },
      // Cerealia Tholus: the salt-crusted dome with its central pit
      { kind: 'mound', x: 230, z: -170, r: 110, h: 42 },
      { kind: 'ridge', x0: -500, z0: 200, x1: 300, z1: 480, w: 10, h: -6 },
      { kind: 'ridge', x0: -300, z0: -500, x1: 500, z1: 100, w: 8, h: -5 },
      { kind: 'flatten', x: 60, z: 120, r: 26 },
    ],
  },
  palette: {
    base: '#55524d', alt: '#65615b', altScale: 180, rock: '#6a6660',
    layers: [
      { mask: 'patch', color: '#f4f2ea', x: 230, z: -170, r: 190, amount: 0.95 },
      { mask: 'patch', color: '#e8e6dc', x: -320, z: 280, r: 150, amount: 0.75 },
      { mask: 'crater', color: '#3a3835', amount: 0.3 },
    ],
  },
  sky: { kind: 'space', starBrightness: 1 },
  sun: { dir: [0.55, 0.42, -0.4], color: '#fff4e6', intensity: 2.8, cycle: 3600 },
  fill: { sky: '#8a8f99', ground: '#3b3a38', intensity: 0.14 },
  lz: [-130, 70],
  pois: [
    {
      id: 'deep', kind: 'dome', x: 60, z: 120, rot: Math.PI, flat: 18, scan: 'db.ceresdeep', spawn: 'deep',
      zone: { id: 'ceres.deepsite', name: 'Ceres Deep', r: 40 },
      interact: { prompt: 'Ceres Deep — airlock', kind: 'door', travel: { location: 'ceres.deep', spawn: 'lock', label: 'Cycling Ceres Deep’s airlock…' }, range: 5 },
    },
    { id: 'drill', kind: 'drill', x: 100, z: 160, rot: 0.5, scan: 'db.cerbrine' },
    { id: 'beacon1', kind: 'beacon', x: 30, z: 90, color: '#ffb347' },
    pylon(1, -230, -90),
    pylon(2, 170, 290),
    pylon(3, 360, -20),
    {
      id: 'hangar', kind: 'hatch', x: 20, z: 170, scale: 2.2, color: '#c77dff',
      zone: { id: 'ceres.hangar', name: 'Prototype Hangar', r: 18 },
      interact: {
        prompt: 'Prototype hangar — raise the Kestrel cradle',
        detail: 'Quarantine lock engaged until all three drone relays are reset',
        available: { all: [{ flag: PYLONS[0] }, { flag: PYLONS[1] }, { flag: PYLONS[2] }] },
        once: true,
        effects: [
          { give: 'fusioncore', qty: 1 }, { give: 'magcoil', qty: 2 }, { give: 'thermaltile', qty: 6 },
          { setFlag: 'ceres.hangar' },
          { notify: 'The cradle rises: the Kestrel fusion core, two nozzle coils, and a stack of thermal tiles Zhou packed “just in case”.' },
        ],
      },
    },
    {
      id: 'seed', kind: 'seed', x: 232, z: -168, scan: 'db.seed', color: '#8a6cff',
      zone: { id: 'ceres.seed', name: 'Cerealia Facula', r: 45 },
      interact: {
        prompt: 'Touch the seed',
        once: true,
        effects: [{ setFlag: 'ceres.seed.touched' }],
        log: {
          title: 'The Seed',
          text: 'Your glove touches nothing. There is no texture, no temperature, no resistance you can feel — and yet your hand stops.\n\nFor one heartbeat the suit display fills with numbers it cannot have measured: a distance to the Moon, to Mars, to a point beyond Neptune. Then a fourth number, much larger, that the suit labels ERROR.\n\nThe dome of salt around you was made by brine rising from far below. The seed did not come from below. It was here first. The salt grew around it.',
        },
      },
    },
    { id: 'wreckdrones', kind: 'wreck', variant: 'debris', x: -60, z: -210, scan: 'db.cerdrone', zone: { id: 'ceres.drones', name: 'Drone Graveyard', r: 30 } },
  ],
  nodes: [
    { id: 'salts', label: 'Carbonate salt crust', color: '#f4f1e6', yields: [['salts', 2]], alt: [['aluminum', 1]], db: 'db.faculae', count: 12, x: 230, z: -170, r: 170, shiny: true },
    { id: 'clay', label: 'Ammoniated clay', color: '#6a5f55', yields: [['silicon', 2]], alt: [['aluminum', 1]], db: 'db.cerclay', count: 14 },
    { id: 'ice', label: 'Buried ice lens', color: '#cfe6f4', yields: [['ice', 3]], db: 'db.cerice', count: 10, x: -250, z: 200, r: 260, glow: '#0b2a44' },
    { id: 'iron', label: 'Metal-rich chondrite', color: '#6b5044', yields: [['iron', 3]], alt: [['titanium', 1]], db: 'db.chondrite', count: 8 },
  ],
  rocks: { count: 3200, maxScale: 2.4 },
  ground: { label: 'Ceres regolith', item: 'regolith', db: 'db.ceresregolith' },
  arrival: {
    lines: [
      ['Sola', 'Ceres. The biggest thing in the asteroid belt — and those bright spots are salt, left by a buried ocean.'],
      ['Haddad', 'Ceres Deep is just east of us. And the bright dome is pinging. Nineteen sixty-nine seconds.'],
    ],
    hint: 'Ceres: 0.03 g. Every step is a long, slow bound — jump carefully. Ceres Deep is the dome east of the landing zone.',
  },
};

export const CERES_DEEP: InteriorDef = {
  id: 'ceres.deep',
  name: 'Ceres Deep',
  body: 'ceres',
  style: 'human',
  gravity: 0.28,
  temperature: 18,
  rooms: outpostRooms(),
  props: [
    { kind: 'table', x: 0, z: -6 },
    { kind: 'desk', x: -5, z: -13.2, w: 4 },
    { kind: 'desk', x: 13, z: -11.2, w: 4 },
    { kind: 'rack', x: 15.4, z: -5, h: 2.4 },
    { kind: 'bunk', x: -14, z: -10.5 },
    { kind: 'bunk', x: -14, z: -4.5 },
    { kind: 'tank', x: 10, z: -3.2 },
    { kind: 'plant', x: 6.8, z: -1 },
    { kind: 'crate', x: -6.5, z: -2 },
  ],
  lights: [{ x: 0, z: -4 }, { x: 0, z: -10 }, { x: -12, z: -7 }, { x: 12, z: -7 }, { x: 0, z: 2.5, intensity: 30 }],
  outside: { ground: '#56534e', sky: '#000000' },
  spawns: [OUTPOST_SPAWN],
  spots: [
    { id: 'deep.ops', x: 12, z: -9.6, yaw: 0 },
    { id: 'deep.bench', x: -4, z: -11.8, yaw: 0 },
  ],
  points: [
    outpostExit('ceres.occator', 'deep'),
    {
      id: 'log', x: 13, y: 1.2, z: -11.9, size: [1, 0.6, 0.2], prompt: 'Station log terminal', scan: 'db.ceresdeep',
      log: {
        title: 'Ceres Deep — station log',
        text: '04:12:07 — All mining drones halted mid-task and returned to their docks. Quarantine protocol engaged on the prototype hangar. Nobody engaged it.\n\n04:12:08 — The facula dome (“the seed”) began emitting in the far infrared. Period: 1,969 s.\n\n04:40 — Zhou attempted manual override of the hangar. Drones re-deployed and physically blocked the hatch. They have never done that. They are not programmed to do that.\n\nNote (Adeyemi): the drone relays are on three pylons out on the salt. Reset all three and the protocol loses its quorum. I’m not walking out there with those drones watching. Anyone who does has my gratitude and the Kestrel.',
      },
    },
    {
      id: 'tanker', x: 10, y: 1.3, z: -2.2, size: [1.6, 2.6, 0.3], color: '#7fd3ff',
      prompt: 'Ice-melt tanker line — refuel the Lantern',
      available: { all: [{ flag: 'ceres.met' }] },
      effects: [{ story: 'refuel.full' }],
    },
    {
      id: 'kestrel', x: -4, y: 1.2, z: -13.3, size: [1.4, 0.6, 0.3], color: '#c77dff', prompt: 'Zhou’s notes: the Kestrel torch',
      log: {
        title: 'KESTREL — D-He3 fusion torch (prototype)',
        text: 'Deuterium–helium-3 fusion, magnetic confinement, magnetic nozzle. He-3 from lunar regolith (yes, really). Specific impulse ~100,000 s at low thrust, or ~20,000 s in high-thrust mode.\n\nInstallation on a Lantern-class hull: (1) seat the core in the aft engineering upgrade bay, (2) install both nozzle coils, (3) tune the confinement field and ignite. The hydrolox drive stays as the landing engine.\n\nIn plain words: with this, Jupiter is weeks away instead of years. Please bring it back. — M-L. Z.',
      },
    },
    {
      id: 'cabinet', x: -6.6, y: 0.9, z: -0.8, size: [1, 1.8, 0.5], prompt: 'Station supply cabinet', once: true,
      effects: [{ give: 'powercell', qty: 2 }, { give: 'o2canister', qty: 2 }, { give: 'circuit', qty: 2 }, { notify: 'Power cells, oxygen and circuit boards.' }],
    },
  ],
  onEnter: { flag: 'ceres.entered', notify: 'Warm air, bright light — and every drone dock on the wall occupied.' },
};
