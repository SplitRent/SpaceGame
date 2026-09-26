import type { NpcDef } from './types';

const CRASHED = { flag: 'crashed' } as const;
const PRE = { notFlag: 'crashed' } as const;

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
      // Missing after the crash.
    ],
  },
  {
    id: 'arakawa', name: 'Kit Arakawa', role: 'Pilot',
    bio: 'Test pilot turned expedition flyer. Cocky, warm, allergic to paperwork. Brought the Lantern down alive.',
    suitColor: '#e8ecf2', accentColor: '#2f80ed', skinTone: '#e0b48f', hairColor: '#1b1b1b', height: 1.72,
    dialogue: 'dlg.arakawa',
    presence: [
      { if: PRE, location: 'lantern.interior', spot: 'bridge.pilot', activity: 'sit' },
      { if: { questDone: 'mq.ascent' }, location: 'lantern.interior', spot: 'bridge.pilot', activity: 'sit' },
      { if: { questActive: 'mq.ascent' }, location: 'lantern.interior', spot: 'bridge.pilot', activity: 'sit' },
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
      { if: PRE, location: 'lantern.interior', spot: 'eng.console', activity: 'work' },
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
      { if: PRE, location: 'lantern.interior', spot: 'lab.bench', activity: 'work' },
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
      { if: PRE, location: 'lantern.interior', spot: 'medbay.station', activity: 'work' },
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
      { if: PRE, location: 'lantern.interior', spot: 'bridge.comms', activity: 'sit' },
      { if: { questActive: 'mq.ascent' }, location: 'lantern.interior', spot: 'bridge.comms', activity: 'sit' },
      { if: { questActive: 'mq.earthrise' }, location: 'moon.south', spot: 'base.center', activity: 'work' },
      { if: CRASHED, location: 'lantern.interior', spot: 'bridge.comms', activity: 'work' },
    ],
  },
];
