import type { SurfaceDef, InteriorDef } from '../worldTypes';
import { builderRooms } from './common';

/* ============================== THE THRESHOLD ============================== */

export const THRESHOLD_HALL: InteriorDef = {
  id: 'threshold.interior',
  name: 'The Threshold',
  body: 'threshold',
  style: 'alien',
  gravity: 6.5,
  temperature: 14,
  rooms: [
    { id: 'dock', x0: -3, x1: 3, z0: 0, z1: 6, y: 0, h: 5, openings: [{ side: 'n', at: 0, width: 3 }] },
    { id: 'nave', x0: -12, x1: 12, z0: -40, z1: 0, y: 0, h: 14, openings: [{ side: 's', at: 0, width: 3 }, { side: 'n', at: 0, width: 5 }] },
    { id: 'door', x0: -9, x1: 9, z0: -58, z1: -40, y: 0, h: 18, openings: [{ side: 's', at: 0, width: 5 }] },
  ],
  props: [
    ...[-32, -24, -16, -8].flatMap((z) => [
      { kind: 'pillar' as const, x: -9, z, h: 13 },
      { kind: 'pillar' as const, x: 9, z, h: 13 },
    ]),
    { kind: 'glyphwall', x: -11.8, z: -20, rot: Math.PI / 2, w: 8, h: 5 },
    { kind: 'glyphwall', x: 11.8, z: -20, rot: -Math.PI / 2, w: 8, h: 5 },
    { kind: 'pool', x: 0, z: -49, w: 5 },
    { kind: 'plinth', x: 0, z: -44, w: 1.6, h: 1.1, d: 1 },
  ],
  lights: [
    { x: 0, y: 10, z: -12, intensity: 120, range: 30 },
    { x: 0, y: 10, z: -30, intensity: 120, range: 30 },
    { x: 0, y: 12, z: -50, intensity: 220, range: 40 },
    { x: 0, y: 3, z: 3, intensity: 25, range: 10 },
  ],
  outside: null,
  spawns: [{ id: 'dock', x: 0, z: 3.5, yaw: 0 }],
  spots: [{ id: 'threshold.door', x: 2.5, z: -44, yaw: Math.PI }],
  points: [
    { id: 'exit', x: 0, y: 1.3, z: 5.8, size: [2.6, 2.6, 0.2], prompt: 'Back to the Lantern', kind: 'door', travel: { location: 'lantern.interior', spawn: 'airlock', label: 'Crossing back to the Lantern…' } },
    {
      id: 'door', x: 0, y: 1.3, z: -44, size: [1.2, 0.3, 0.7], color: '#b8a8ff',
      prompt: 'The Door — first-person glyph panel', kind: 'panel', panel: 'glyph',
      available: { notFlag: 'threshold.open' },
      scan: 'db.threshold',
    },
    {
      id: 'mural', x: -11.6, y: 2.5, z: -20, size: [0.3, 4, 7.5], color: '#7a5cff', prompt: 'Read the glyph wall (with the Lattice Key)',
      log: {
        title: 'The Threshold — glyph wall',
        text: 'The key in your pocket grows warm and the marks resolve, not into words, but into meaning, the way a face resolves out of shadow.\n\nA WAY IS KEPT HERE.\nIT OPENS FOR THOSE WHO WERE CALLED AND FOR THOSE WHO CAME WITH THEM.\nWE LISTENED FOR A LONG TIME. WE HEARD YOU FALL ONTO YOUR MOON, AND YOUR MOON RANG.\nCOME AND SEE.',
      },
    },
  ],
  onEnter: {
    flag: 'threshold.entered',
    lines: [
      ['Okonkwo', 'This is where the Cadence comes from. It has been saying the same thing for eighty-two years.'],
      ['Haddad', 'What is it saying?'],
      ['Okonkwo', '“Come and see.”'],
    ],
  },
};

/* ============================== VESPER GATE HALL ============================== */

export const VESPER_GATEHALL: InteriorDef = {
  id: 'vesper.gatehall',
  name: 'The Far Gate',
  body: 'vesperb',
  style: 'alien',
  gravity: 6.5,
  temperature: 14,
  rooms: [
    { id: 'dock', x0: -3, x1: 3, z0: 0, z1: 6, y: 0, h: 5, openings: [{ side: 'n', at: 0, width: 3 }] },
    { id: 'hall', x0: -8, x1: 8, z0: -18, z1: 0, y: 0, h: 10, openings: [{ side: 's', at: 0, width: 3 }] },
  ],
  props: [
    { kind: 'pillar', x: -6, z: -6, h: 9 },
    { kind: 'pillar', x: 6, z: -6, h: 9 },
    { kind: 'pillar', x: -6, z: -14, h: 9 },
    { kind: 'pillar', x: 6, z: -14, h: 9 },
    { kind: 'pool', x: 0, z: -12, w: 3 },
    { kind: 'plinth', x: 0, z: -8, w: 1.4, h: 1.1, d: 1 },
  ],
  lights: [{ x: 0, y: 7, z: -9, intensity: 140, range: 25 }, { x: 0, y: 3, z: 3, intensity: 25, range: 10 }],
  outside: null,
  spawns: [{ id: 'dock', x: 0, z: 3.5, yaw: 0 }],
  spots: [],
  points: [
    { id: 'exit', x: 0, y: 1.3, z: 5.8, size: [2.6, 2.6, 0.2], prompt: 'Back to the Lantern', kind: 'door', travel: { location: 'lantern.interior', spawn: 'airlock', label: 'Crossing back to the Lantern…' } },
    {
      id: 'return', x: 0, y: 1.3, z: -8, size: [1.1, 0.3, 0.7], color: '#ffb070',
      prompt: 'Open the way home (the Lantern crosses to the Threshold)',
      effects: [{ story: 'gate.return' }],
    },
  ],
};

/* ================================ VESPER b ================================ */

export const VESPER_SURFACE: SurfaceDef = {
  id: 'vesper.terminator',
  name: 'The Terminator, Vesper b',
  body: 'vesperb',
  title: 'Vesper b',
  subtitle: 'The first world beyond the Sun',
  seed: 8800,
  size: 1536,
  gravity: 9.2,
  atmosphere: 'breathable',
  airLabel: 'BREATHABLE',
  temperature: [14, 14],
  ambience: 'mars',
  terrain: {
    baseAmp: 20, craterCount: 12, craterMaxR: 35, curvatureR: 6250000,
    features: [
      { kind: 'rim', r0: 620, r1: 760, h: 160 },
      { kind: 'basin', x: 380, z: 330, r: 240, depth: 14 },
      { kind: 'mountains', x: -640, z: -620, r: 170, h: 170 },
      { kind: 'flatten', x: -300, z: -330, r: 34 },
      { kind: 'flatten', x: 60, z: -280, r: 22 },
      { kind: 'flatten', x: -120, z: -100, r: 16 },
    ],
  },
  palette: {
    base: '#6e3a56', alt: '#7a5040', altScale: 120, rock: '#6a5452',
    layers: [
      { mask: 'noise', color: '#3a6a5a', scale: 70, threshold: 0.6, amount: 0.45 },
      { mask: 'slope', color: '#6a5a50', amount: 0.7 },
      { mask: 'height', color: '#8a7a60', below: -3, amount: 0.8 },
      { mask: 'patch', color: '#1a1420', x: -300, z: -330, r: 70, amount: 0.7 },
    ],
  },
  liquid: { level: -5, color: '#1f5a6a', opacity: 0.85, x: 380, z: 330, r: 240, label: 'A lake of water' },
  sky: { kind: 'atmo', zenith: '#2c3a7a', horizon: '#e08a5a', halo: '#ffb070', fogNear: 160, fogFar: 1700, nightStars: 0.3 },
  sun: { dir: [1, 0.2, 0.15], color: '#ffb888', intensity: 2.8, disc: 3 },
  skyBody: { kind: 'neptune', angularDeg: 5, dir: [-0.5, 0.35, -0.8], spin: 0.002 },
  fill: { sky: '#9a8ae0', ground: '#6a4a52', intensity: 1.3 },
  flora: { count: 2600, x: 0, z: 0, r: 700 },
  fauna: [
    { kind: 'grazer', count: 10, x: 250, z: 130, r: 200 },
    { kind: 'kite', count: 8, x: 0, z: 0, r: 320 },
    { kind: 'stalker', count: 4, x: -380, z: -380, r: 170 },
  ],
  weather: { kind: 'spores', color: '#9affe0', density: 0.4 },
  lz: [100, 60],
  pois: [
    { id: 'arch', kind: 'ruin', variant: 'arch', x: -120, z: -100, rot: 0.6, scan: 'db.builders', zone: { id: 'vesper.arch', name: 'The First Arch', r: 25 } },
    {
      id: 'circle', kind: 'ruin', variant: 'pillars', x: 60, z: -280, scan: 'db.builders', zone: { id: 'vesper.circle', name: 'Stone Circle', r: 25 },
      interact: {
        prompt: 'The circle’s plinth (Lattice Key)',
        once: true,
        effects: [{ setFlag: 'vesper.circle.read' }],
        log: {
          title: 'Stone Circle',
          text: 'The Lattice Key hums and the plinth answers with a picture in your head: this plain, green-violet under the same unmoving sun — but crowded. Tall, slow, many-limbed people, thousands of them, standing in the circle and looking up.\n\nThen fewer. Then none. Not dying — walking away, through an arch of black glass, one after another, until the plain was empty and the lights inside the ruins stayed on for no one.\n\nThe last image is of the ruins to the south-west, a stair and a great door. It is not a warning. It is a signpost.',
        },
      },
    },
    { id: 'stair', kind: 'ruin', variant: 'stair', x: -470, z: 120, rot: -0.4, scan: 'db.builders', zone: { id: 'vesper.stair', name: 'The Stair', r: 30 } },
    {
      id: 'archivedoor', kind: 'ruin', variant: 'gate', x: -300, z: -330, rot: 0.4, spawn: 'archive', scan: 'db.archive',
      zone: { id: 'vesper.archive.door', name: 'The Archive Door', r: 35 },
      interact: { prompt: 'Enter the Archive', kind: 'door', travel: { location: 'vesper.archive', spawn: 'entry', label: 'Into the Archive…' }, range: 7 },
    },
  ],
  nodes: [
    { id: 'bio', label: 'Glowbulb cluster', color: '#ff8ae0', yields: [['biosample', 1]], alt: [['carbon', 1]], db: 'db.glowbulb', count: 14, glow: '#ff8ae0' },
    { id: 'water', label: 'Freshwater seep', color: '#6ac8d8', yields: [['ice', 3]], db: 'db.vesperwater', count: 12, x: 380, z: 330, r: 300, shiny: true },
    { id: 'rock', label: 'Basalt outcrop', color: '#3a2e2e', yields: [['iron', 2]], alt: [['titanium', 1]], db: 'db.vesperrock', count: 10 },
  ],
  rocks: { count: 1500, maxScale: 2.2 },
  ground: { label: 'Living soil', item: 'regolith', db: 'db.vespersoil' },
  arrival: {
    lines: [
      ['Okonkwo', 'Helmets. Take them off. It’s all right — I checked.'],
      ['Sola', 'Oxygen. Made by something alive. We’re not alone. We were never alone.'],
      ['Novak', 'Breathe slowly. The air’s thicker than home. Oh… it smells like rain.'],
      ['Haddad', 'The Archive signal is south-west, past the ruins. Watch the shadows near it — something moves there.'],
    ],
    hint: 'Vesper b: breathable air, heavy gravity (0.94 g), a sun that never moves. Stalkers hunt near the Archive — they fear light: keep your headlamp (L) on and face them.',
  },
};

/* ================================ THE ARCHIVE ================================ */

const memory = (id: string, n: number, x: number, z: number, title: string, text: string) => ({
  id, x, y: 1.3, z, size: [1.2, 0.3, 1.2] as [number, number, number], color: '#ffb070',
  prompt: `Touch the memory plinth (${n}/3)`, once: true,
  effects: [{ setFlag: `archive.mem${n}` }],
  log: { title, text },
});

export const ARCHIVE: InteriorDef = {
  id: 'vesper.archive',
  name: 'The Archive',
  body: 'vesperb',
  style: 'alien',
  gravity: 9.2,
  temperature: 16,
  rooms: builderRooms(),
  props: [
    ...[-34, -26, -18, -10].flatMap((z) => [
      { kind: 'pillar' as const, x: -11, z, h: 13 },
      { kind: 'pillar' as const, x: 11, z, h: 13 },
    ]),
    { kind: 'plinth', x: -21, z: -24, w: 1.4, h: 1, d: 1.4 },
    { kind: 'plinth', x: 21, z: -24, w: 1.4, h: 1, d: 1.4 },
    { kind: 'plinth', x: 0, z: -36, w: 1.4, h: 1, d: 1.4 },
    { kind: 'glyphwall', x: -23.8, z: -24, rot: Math.PI / 2, w: 8, h: 5 },
    { kind: 'glyphwall', x: 23.8, z: -24, rot: -Math.PI / 2, w: 8, h: 5 },
    { kind: 'pool', x: 0, z: -52, w: 6 },
    { kind: 'glyphwall', x: 0, z: -61.7, w: 14, h: 10 },
  ],
  lights: [
    { x: 0, y: 11, z: -10, intensity: 140, range: 35 },
    { x: 0, y: 11, z: -30, intensity: 140, range: 35 },
    { x: -19, y: 5, z: -24, intensity: 60, range: 14, color: '#ffb070' },
    { x: 19, y: 5, z: -24, intensity: 60, range: 14, color: '#ffb070' },
    { x: 0, y: 13, z: -52, intensity: 300, range: 45 },
    { x: 0, y: 3, z: 4, intensity: 30, range: 12 },
  ],
  outside: null,
  spawns: [{ id: 'entry', x: 0, z: 5, yaw: 0 }],
  spots: [
    { id: 'archive.heart', x: 0, z: -46, yaw: Math.PI },
    { id: 'archive.c1', x: -4, z: -44, yaw: Math.PI * 0.85 },
    { id: 'archive.c2', x: 4, z: -44, yaw: -Math.PI * 0.85 },
    { id: 'archive.c3', x: -6.5, z: -48, yaw: Math.PI / 2 },
    { id: 'archive.c4', x: 6.5, z: -48, yaw: -Math.PI / 2 },
    { id: 'archive.c5', x: -2.5, z: -41.5, yaw: Math.PI },
  ],
  points: [
    { id: 'exit', x: 0, y: 1.5, z: 7.8, size: [3, 3, 0.2], prompt: 'Leave the Archive', kind: 'door', travel: { location: 'vesper.terminator', spawn: 'archive', label: 'Out into the dusk…' } },
    memory('mem1', 1, -21, -24, 'Memory — the Listening',
      'You see them build the first node: a seed of black glass sunk into the ice of a young moon, a billion years ago, around a star not this one. Then another. Then thousands, scattered on the winds between stars, each one falling onto a world and waiting.\n\nThey did not want to conquer. They wanted to hear. Every node listens for one thing — a world that rings. The first time someone who is not a rock lands on a world hard enough to make it ring, the nearest node wakes, and begins to call.\n\nYou understand, with a jolt, what rang. Apollo 12’s discarded ascent stage, November 1969, struck the Moon and made it ring for almost an hour. Someone was listening.'),
    memory('mem2', 2, 21, -24, 'Memory — the Answer',
      'A call is a question. The node on the Moon learned the only number it could hear clearly in our radio noise — the year it woke — and has repeated it ever since, as a period: 1,969 seconds.\n\nWhoever answers is fetched. That is what the courier is. It came when Adaeze Okonkwo answered from Harbor’s dish, and when it came it touched every node in the system at once, the way you might touch every key of a piano to find the one that sounded. Blackouts. Cut cables. An empty airlock cycling.\n\nIt did not mean harm. It had never met anything as fragile as us.'),
    memory('mem3', 3, 0, -36, 'Memory — the Leaving',
      'The Builders are not dead. When the last of them understood everything the Lattice could teach, they built a further door, and went through it, and left the Archive running with the lights on — for whoever came next.\n\nThe Archive can do three things with a new people. It can open the Lattice to them: every node a door. It can close it: let them sleep, and send them home. Or it can open the further door, the one the Builders took.\n\nIt will not choose. It is waiting for you in the Heart.'),
  ],
  onEnter: {
    flag: 'archive.entered',
    lines: [
      ['Okonkwo', 'Whatever this place shows you — it shows everyone the same thing. It doesn’t lie. Walk through it. I’ll be in the Heart.'],
    ],
  },
};
