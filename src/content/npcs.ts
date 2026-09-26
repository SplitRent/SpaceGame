import type { NpcDef } from './types';

const CRASHED = { flag: 'crashed' } as const;
const PRE = { notFlag: 'crashed' } as const;
const FLOWN = { flag: 'launched' } as const;
/** Act 5: the whole crew gathers in the Archive's Heart for the choice. */
const GATHERED = { all: [{ flag: 'archive.mem3' }, { notFlag: 'game.complete' }] };

/**
 * Crew definitions. Presence is a *function of state*: the first matching rule decides
 * where each crew member is and what they are doing, so their location can never
 * contradict story progress.
 */
export const NPCS: NpcDef[] = [
  {
    id: 'okonkwo', name: 'Cmdr. Adaeze Okonkwo', role: 'Mission Commander',
    bio: 'Veteran of two Mars rotations. Measured, private, and trusted by everyone aboard. Keeps her own counsel about the Cadence.',
    suitColor: '#f1f2f4', accentColor: '#d4af37', skinTone: '#6b4630', hairColor: '#141010', height: 1.74,
    dialogue: 'dlg.okonkwo',
    presence: [
      { if: PRE, location: 'lantern.interior', spot: 'bridge.commander', activity: 'idle' },
      { if: GATHERED, location: 'vesper.archive', spot: 'archive.heart', activity: 'idle' },
      { if: { flag: 'okonkwo.found' }, location: 'lantern.interior', spot: 'bridge.commander', activity: 'work' },
      // Missing after the crash — until the crew finds her on Pluto.
      { if: { discovered: 'pluto.sputnik' }, location: 'pluto.sputnik', spot: 'okonkwo', activity: 'idle' },
    ],
  },
  {
    id: 'arakawa', name: 'Kit Arakawa', role: 'Pilot',
    bio: 'Test pilot turned expedition flyer. Cocky, warm, allergic to paperwork. Brought the Lantern down alive.',
    suitColor: '#e8ecf2', accentColor: '#2f80ed', skinTone: '#e0b48f', hairColor: '#1b1b1b', height: 1.72,
    dialogue: 'dlg.arakawa',
    presence: [
      { if: GATHERED, location: 'vesper.archive', spot: 'archive.c1', activity: 'idle' },
      { if: PRE, location: 'lantern.interior', spot: 'bridge.pilot', activity: 'sit' },
      { if: FLOWN, location: 'lantern.interior', spot: 'bridge.nav', activity: 'work' },
      { if: { questActive: 'mq.ascent' }, location: 'lantern.interior', spot: 'bridge.nav', activity: 'idle' },
      { if: { flag: 'kit.walking' }, location: 'lantern.interior', spot: 'bridge.pilot', activity: 'work' },
      { if: { flag: 'kit.treated' }, location: 'lantern.interior', spot: 'medbay.bed', activity: 'sit' },
      { if: CRASHED, location: 'lantern.interior', spot: 'medbay.bed', activity: 'injured' },
    ],
  },
  {
    id: 'castellanos', name: 'Mira Castellanos', role: 'Chief Engineer',
    bio: 'Built reactors for orbital foundries before she was thirty. Blunt, practical, and quietly terrified of losing anyone.',
    suitColor: '#ececec', accentColor: '#f2994a', skinTone: '#b07a55', hairColor: '#3b2314', height: 1.66,
    dialogue: 'dlg.castellanos',
    presence: [
      { if: GATHERED, location: 'vesper.archive', spot: 'archive.c2', activity: 'idle' },
      { if: PRE, location: 'lantern.interior', spot: 'eng.console', activity: 'work' },
      { if: FLOWN, location: 'lantern.interior', spot: 'bridge.eng', activity: 'work' },
      { if: { all: [{ questActive: 'mq.ascent' }] }, location: 'lantern.interior', spot: 'bridge.eng', activity: 'work' },
      { if: { all: [{ questActive: 'mq.reactor' }] }, location: 'lantern.interior', spot: 'eng.reactor', activity: 'work' },
      { if: { module: 'workbench' }, location: 'moon.south', spot: 'base.workbench', activity: 'work', schedule: [0.1, 0.45] },
      { if: CRASHED, location: 'lantern.interior', spot: 'eng.console', activity: 'work' },
    ],
  },
  {
    id: 'sola', name: 'Dr. Imani Sola', role: 'Planetary Scientist',
    bio: 'Geologist and astrobiologist. Has wanted to touch another world since she was six. The crash has not changed that.',
    suitColor: '#f4f1ea', accentColor: '#27ae60', skinTone: '#4a2f22', hairColor: '#0f0c0b', height: 1.7,
    dialogue: 'dlg.sola',
    presence: [
      { if: GATHERED, location: 'vesper.archive', spot: 'archive.c3', activity: 'idle' },
      { if: PRE, location: 'lantern.interior', spot: 'lab.bench', activity: 'work' },
      { if: FLOWN, location: 'lantern.interior', spot: 'bridge.science', activity: 'work' },
      { if: { questActive: 'mq.ascent' }, location: 'lantern.interior', spot: 'bridge.science', activity: 'work' },
      { if: { module: 'lab' }, location: 'moon.south', spot: 'base.lab', activity: 'work', schedule: [0.5, 0.95] },
      { if: { system: 'life.hull', step: 'breach.lab' }, location: 'lantern.interior', spot: 'lab.bench', activity: 'work' },
      { if: CRASHED, location: 'lantern.interior', spot: 'common.table', activity: 'sit' },
    ],
  },
  {
    id: 'novak', name: 'Dr. Petra Novak', role: 'Medic & Life Sciences',
    bio: 'Trauma surgeon, botanist, and the crew’s steady centre. Talks to her plants. Talks to everyone, really.',
    suitColor: '#f3f3f3', accentColor: '#eb5757', skinTone: '#f0c8a8', hairColor: '#a0652d', height: 1.68,
    dialogue: 'dlg.novak',
    presence: [
      { if: GATHERED, location: 'vesper.archive', spot: 'archive.c4', activity: 'idle' },
      { if: PRE, location: 'lantern.interior', spot: 'medbay.station', activity: 'work' },
      { if: FLOWN, location: 'lantern.interior', spot: 'medbay.station', activity: 'work' },
      { if: { questActive: 'mq.ascent' }, location: 'lantern.interior', spot: 'bridge.medic', activity: 'idle' },
      { if: { module: 'greenhouse' }, location: 'moon.south', spot: 'base.greenhouse', activity: 'work', schedule: [0.55, 0.9] },
      { if: CRASHED, location: 'lantern.interior', spot: 'medbay.station', activity: 'work' },
    ],
  },
  {
    id: 'haddad', name: 'Rafi Haddad', role: 'Communications & Signals',
    bio: 'Former radio astronomer and amateur cryptographer. Wry, fast-talking, and the first person to hear the Cadence repeat.',
    suitColor: '#eef0f2', accentColor: '#9b51e0', skinTone: '#c49a74', hairColor: '#2a1a12', height: 1.8,
    dialogue: 'dlg.haddad',
    presence: [
      { if: GATHERED, location: 'vesper.archive', spot: 'archive.c5', activity: 'idle' },
      { if: PRE, location: 'lantern.interior', spot: 'bridge.comms', activity: 'sit' },
      { if: FLOWN, location: 'lantern.interior', spot: 'bridge.comms', activity: 'work' },
      { if: { questActive: 'mq.ascent' }, location: 'lantern.interior', spot: 'bridge.comms', activity: 'sit' },
      { if: { questActive: 'mq.earthrise' }, location: 'moon.south', spot: 'base.center', activity: 'work' },
      { if: CRASHED, location: 'lantern.interior', spot: 'bridge.comms', activity: 'work' },
    ],
  },
  {
    id: 'carvalho', name: 'Ines Carvalho', role: 'Harbor Station Manager',
    bio: 'Ran Harbor for six years. Kept two people alive through four dark hours with a flashlight and a very firm voice.',
    suitColor: '#dfe3e8', accentColor: '#3fa9f5', skinTone: '#c9956c', hairColor: '#5a3b24', height: 1.69,
    dialogue: 'dlg.carvalho',
    presence: [{ if: FLOWN, location: 'harbor.interior', spot: 'harbor.ops', activity: 'work' }],
  },
  {
    id: 'wren', name: 'Tomasz Wren', role: 'Harbor Systems Technician',
    bio: 'Twenty-three, first rotation off Earth. Has not slept since the lights went out.',
    suitColor: '#dfe3e8', accentColor: '#f2c94c', skinTone: '#f1c9a5', hairColor: '#d8c08a', height: 1.83,
    dialogue: 'dlg.wren',
    presence: [{ if: FLOWN, location: 'harbor.interior', spot: 'harbor.quarters', activity: 'sit' }],
  },
  {
    id: 'rao', name: 'Dr. Anand Rao', role: 'Melas Station Lead Areologist',
    bio: 'Has spent four years reading the canyon walls like a book. Soft-spoken, stubborn, and very cold.',
    suitColor: '#e8742e', accentColor: '#f4f1ea', skinTone: '#8a5a3c', hairColor: '#2a2420', height: 1.71,
    dialogue: 'dlg.rao',
    presence: [
      { if: { flag: 'melas.power' }, location: 'mars.station', spot: 'melas.commons', activity: 'work' },
      { if: { always: true }, location: 'mars.station', spot: 'melas.shelter.a', activity: 'sit' },
    ],
  },
  {
    id: 'benedetti', name: 'Lucía Benedetti', role: 'Melas Station Engineer',
    bio: 'Keeps a hab running 200 million kilometres from spare parts. Talks to machines, and they listen.',
    suitColor: '#e8742e', accentColor: '#3a3f46', skinTone: '#d9a882', hairColor: '#4a2a1a', height: 1.63,
    dialogue: 'dlg.benedetti',
    presence: [
      { if: { flag: 'melas.power' }, location: 'mars.station', spot: 'melas.lab', activity: 'work' },
      { if: { always: true }, location: 'mars.station', spot: 'melas.shelter.b', activity: 'idle' },
    ],
  },
  {
    id: 'adeyemi', name: 'Yusuf Adeyemi', role: 'Ceres Deep Quartermaster',
    bio: 'Runs Ceres Deep like a ship: everything logged, everything stowed. Has not slept properly since the drones stopped listening to him.',
    suitColor: '#d8d2c4', accentColor: '#3fa9f5', skinTone: '#5a3a28', hairColor: '#1a1410', height: 1.86,
    dialogue: 'dlg.adeyemi',
    presence: [{ if: { always: true }, location: 'ceres.deep', spot: 'deep.ops', activity: 'work' }],
  },
  {
    id: 'zhou', name: 'Dr. Mei-Ling Zhou', role: 'Propulsion Engineer, Ceres Deep',
    bio: 'Built a fusion torch in a cave on a dwarf planet because nobody on Earth would fund it. Speaks fast and exactly.',
    suitColor: '#d8d2c4', accentColor: '#c77dff', skinTone: '#e0b890', hairColor: '#101010', height: 1.6,
    dialogue: 'dlg.zhou',
    presence: [{ if: { always: true }, location: 'ceres.deep', spot: 'deep.bench', activity: 'work' }],
  },
  {
    id: 'ferreira', name: 'Dr. Beatriz Ferreira', role: 'Halcyon Aerostat Director',
    bio: 'Has lived above the clouds of Venus for three years. Considers solid ground overrated.',
    suitColor: '#f2e8d0', accentColor: '#ffb347', skinTone: '#c68a5e', hairColor: '#3a2014', height: 1.7,
    dialogue: 'dlg.ferreira',
    presence: [{ if: { always: true }, location: 'venus.halcyon', spot: 'halcyon.lab', activity: 'work' }],
  },
];
