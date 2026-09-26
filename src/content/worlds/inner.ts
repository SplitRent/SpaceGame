import type { SurfaceDef, InteriorDef } from '../worldTypes';
import { outpostRooms, OUTPOST_SPAWN } from './common';

/* ============================ VENUS — HALCYON ============================ */

export const HALCYON: InteriorDef = {
  id: 'venus.halcyon',
  name: 'Halcyon Aerostat, Venus',
  body: 'venus',
  style: 'human',
  gravity: 8.87,
  temperature: 24,
  rooms: outpostRooms(),
  props: [
    { kind: 'table', x: 0, z: -6 },
    { kind: 'desk', x: 13, z: -11.2, w: 4 },
    { kind: 'desk', x: -13, z: -11.2, w: 4 },
    { kind: 'plant', x: -6.8, z: -1 },
    { kind: 'plant', x: 6.8, z: -1 },
    { kind: 'plant', x: -6.8, z: -13 },
    { kind: 'rack', x: 15.4, z: -5 },
  ],
  lights: [{ x: 0, z: -4 }, { x: 0, z: -10 }, { x: -12, z: -7 }, { x: 12, z: -7 }, { x: 0, z: 2.5, intensity: 30 }],
  outside: { ground: '#a88a58', sky: '#9a7c50' },
  spawns: [OUTPOST_SPAWN],
  spots: [{ id: 'halcyon.lab', x: 13, z: -9.6, yaw: 0 }],
  points: [
    { id: 'exit', x: 0, y: 1.15, z: 4.85, size: [1.6, 2.3, 0.2], prompt: 'Back to the Lantern', kind: 'door', travel: { location: 'lantern.interior', spawn: 'airlock', label: 'Crossing to the Lantern…' } },
    {
      id: 'radar', x: -13, y: 1.2, z: -11.9, size: [1.2, 0.6, 0.2], color: '#ffd9a0', prompt: 'Deep radar survey — Maxwell Montes', scan: 'db.venusradar',
      once: false,
      effects: [{ setFlag: 'halcyon.radar' }],
      log: {
        title: 'Halcyon deep radar — survey 88',
        text: 'Synthetic-aperture radar through 50 km of cloud. Venus’s whole surface was repaved by lava roughly 500 million years ago; almost nothing older survives.\n\nAlmost. Beneath the flank of Maxwell Montes the radar finds a vertical structure 11 metres tall, radar-dark, embedded in lava that flowed around it without melting it. The flows date to ~500 million years. The structure is older than the lava.\n\nFerreira’s note: “Something stood on Venus before Venus became Venus. Mercury’s north pole has a similar radar-dark point in Chao Meng-Fu crater. If you have a heat shield and courage, go look.”',
      },
    },
    { id: 'depot', x: 10, y: 1.3, z: -2.2, size: [1.6, 2.6, 0.3], color: '#7fd3ff', prompt: 'Halcyon fuel line — refuel the Lantern', effects: [{ story: 'refuel.full' }] },
  ],
  onEnter: {
    flag: 'halcyon.entered',
    notify: 'Earth-normal pressure and a view of endless yellow cloud: fifty kilometres above the hottest surface in the Solar System.',
  },
};

/* ============================ MERCURY — CHAO MENG-FU ============================ */

export const MERCURY_SURFACE: SurfaceDef = {
  id: 'mercury.chao',
  name: 'Chao Meng-Fu Crater, Mercury',
  body: 'mercury',
  title: 'Mercury',
  subtitle: 'Chao Meng-Fu crater · south pole',
  seed: 3300,
  size: 1536,
  gravity: 3.7,
  atmosphere: 'vacuum',
  airLabel: 'VACUUM',
  temperature: [-120, -170],
  coldLimit: -200,
  ambience: 'vacuum',
  terrain: {
    baseAmp: 12, craterCount: 700, craterMaxR: 80, curvatureR: 2440000,
    features: [
      { kind: 'rim', r0: 560, r1: 750, h: 170 },
      { kind: 'crater', x: -260, z: 220, r: 110, depth: 30 },
      { kind: 'mound', x: 160, z: -200, r: 60, h: 12 },
    ],
  },
  palette: {
    base: '#5a5550', alt: '#6a645e', altScale: 170, rock: '#57524e',
    layers: [
      { mask: 'patch', color: '#dfe8f0', x: -260, z: 220, r: 110, amount: 0.8 },
      { mask: 'crater', color: '#3a3632', amount: 0.3 },
      { mask: 'slope', color: '#7a746c', amount: 0.25 },
    ],
  },
  sky: { kind: 'space', starBrightness: 1 },
  sun: { dir: [0.8, 0.38, -0.3], color: '#ffffff', intensity: 3.6, disc: 2.5 },
  fill: { sky: '#8a8f99', ground: '#5b5a58', intensity: 0.35 },
  lz: [-80, -40],
  pois: [
    {
      id: 'oldspire', kind: 'spire', x: 160, z: -200, rot: 0.3, scale: 1.3, scan: 'db.oldspire', color: '#5a4aaa',
      zone: { id: 'mercury.spire', name: 'The Old Spire', r: 45 },
    },
  ],
  nodes: [
    { id: 'ice', label: 'Polar ice (shadowed)', color: '#dfeef8', yields: [['ice', 3]], db: 'db.mercuryice', count: 14, x: -260, z: 220, r: 100, glow: '#0b2a44' },
    { id: 'iron', label: 'Iron-rich rock', color: '#4a4040', yields: [['iron', 3]], alt: [['titanium', 1]], db: 'db.mercuryrock', count: 12 },
  ],
  rocks: { count: 3500, maxScale: 2.6 },
  ground: { label: 'Mercury regolith', item: 'regolith', db: 'db.mercuryregolith' },
  arrival: {
    lines: [
      ['Arakawa', 'Mercury, south pole. Sun on the horizon, four hundred degrees in the light, minus one-seventy in the shadow. Stay in the shade.'],
      ['Sola', 'Ice. On Mercury. In the crater floors the Sun never reaches.'],
    ],
    hint: 'Mercury: the Sun skims the horizon at seven times Earth’s brightness. The old spire is east, near the crater floor.',
  },
};
