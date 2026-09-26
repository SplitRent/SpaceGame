import type { Condition } from './types';

/**
 * Star map destinations. Every body in the map explains *why* it can or cannot be reached;
 * a lock lifts when its `unless` condition becomes true. `zone` is the space zone the
 * transit arrives in (null = not a travel destination). Order matters: parents first.
 */
export interface StarMapEntry {
  body: string;
  zone: string | null;
  /** Propellant for the transfer burn (kg). */
  cost: number;
  /** Real-world transfer time, for flavour (the playable cruise is compressed). */
  realTime: string;
  locks: { unless: Condition; reason: string }[];
  /** Not drawn on the map until this holds (fog of discovery). */
  hiddenUnless?: Condition;
  /** Seconds of playable cruise (default TRANSIT_SECONDS). */
  seconds?: number;
}

const LAUNCHED = { unless: { flag: 'launched' }, reason: 'The Lantern is not flight-ready.' };
const THERMAL = { unless: { system: 'hull.thermal' }, reason: 'Needs a thermal shield rated for the inner system (fit one at the engineering upgrade console).' };
const RANGE = { unless: { system: 'prop.fusion' }, reason: 'Beyond the hydrolox drive’s reach. A fusion drive would be needed.' };

export const STARMAP: StarMapEntry[] = [
  { body: 'mercury', zone: 'space.mercury', cost: 900, realTime: '~4 months', locks: [LAUNCHED, THERMAL] },
  { body: 'venus', zone: 'space.venus', cost: 700, realTime: '~5 months', locks: [LAUNCHED, THERMAL] },
  {
    body: 'earth', zone: 'space.earth', cost: 800, realTime: '3 days from the Moon',
    locks: [LAUNCHED, { unless: { flag: 'earth.quarantine.lifted' }, reason: 'Directorate quarantine: no vessel exposed to the Blackglass may approach Earth.' }],
  },
  { body: 'moon', zone: 'space.cislunar', cost: 800, realTime: '~7 months from Mars (Hohmann transfer)', locks: [LAUNCHED] },
  {
    body: 'mars', zone: 'space.mars', cost: 800, realTime: '~7 months (Hohmann transfer)',
    locks: [LAUNCHED, { unless: { flag: 'slice.complete' }, reason: 'No flight plan filed with Earth Control. Harbor first.' }],
  },
  {
    body: 'ceres', zone: 'space.ceres', cost: 900, realTime: '~15 months',
    locks: [LAUNCHED, { unless: { any: [{ flag: 'network.briefed' }, { system: 'prop.fusion' }] }, reason: 'At the edge of hydrolox range, and nothing calls you there — yet.' }],
  },
  { body: 'jupiter', zone: null, cost: 0, realTime: '~2.7 years', locks: [{ unless: { never: true }, reason: 'A gas giant has no surface; its moon Europa is the destination.' }] },
  { body: 'europa', zone: 'space.jupiter', cost: 1000, realTime: '~2.7 years (weeks under fusion)', locks: [LAUNCHED, RANGE], seconds: 110 },
  { body: 'saturn', zone: null, cost: 0, realTime: '~6 years', locks: [{ unless: { never: true }, reason: 'A gas giant has no surface; its moon Titan is the destination.' }] },
  { body: 'titan', zone: 'space.saturn', cost: 1100, realTime: '~6 years (months under fusion)', locks: [LAUNCHED, RANGE, { unless: { any: [{ flag: 'cadence.1' }, { questDone: 'mq.cadence' }] }, reason: 'The Cadence points to Europa first.' }], seconds: 110 },
  { body: 'uranus', zone: null, cost: 0, realTime: '~16 years', locks: [RANGE, { unless: { never: true }, reason: 'Nothing calls you there — yet.' }] },
  { body: 'neptune', zone: null, cost: 0, realTime: '~30 years', locks: [RANGE, { unless: { never: true }, reason: 'Nothing calls you there — yet.' }] },
  { body: 'pluto', zone: 'space.pluto', cost: 1200, realTime: '~45 years (a year under fusion)', locks: [LAUNCHED, RANGE, { unless: { any: [{ flag: 'cadence.2' }, { questDone: 'mq.cadence' }] }, reason: 'The Cadence points to Europa and Titan first.' }], seconds: 120 },
  {
    body: 'threshold', zone: 'space.threshold', cost: 1200, realTime: 'Beyond Pluto, 51 AU',
    hiddenUnless: { flag: 'okonkwo.found' },
    locks: [LAUNCHED, RANGE, { unless: { flag: 'okonkwo.found' }, reason: 'Unknown.' }], seconds: 120,
  },
  { body: 'vesper', zone: null, cost: 0, realTime: '—', locks: [{ unless: { never: true }, reason: 'Vesper, an orange dwarf star. You are a very long way from home.' }] },
  { body: 'vesperb', zone: 'space.vesper', cost: 0, realTime: '—', locks: [] },
];

/** Seconds of playable cruise for a transfer (the real months are compressed). */
export const TRANSIT_SECONDS = 90;
