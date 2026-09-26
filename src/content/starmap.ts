import type { Condition } from './types';

/**
 * Star map destinations. Every body in the map explains *why* it can or cannot be reached;
 * a lock lifts when its `unless` condition becomes true. `zone` is the space zone the
 * transit arrives in (null = not a travel destination yet).
 */
export interface StarMapEntry {
  body: string;
  zone: string | null;
  /** Propellant for the transfer burn (kg). */
  cost: number;
  /** Real-world transfer time, for flavour (the playable cruise is compressed). */
  realTime: string;
  locks: { unless: Condition; reason: string }[];
}

const THERMAL = { unless: { flag: 'upgrade.thermal' }, reason: 'Needs a thermal shield rated for the inner system. The Lantern was built for the cold.' };
const RANGE = { unless: { flag: 'upgrade.drive' }, reason: 'Beyond the hydrolox drive’s reach. A long-range drive would be needed.' };

export const STARMAP: StarMapEntry[] = [
  { body: 'mercury', zone: null, cost: 0, realTime: '~4 months', locks: [THERMAL] },
  { body: 'venus', zone: null, cost: 0, realTime: '~5 months', locks: [THERMAL] },
  {
    body: 'earth', zone: null, cost: 0, realTime: '3 days',
    locks: [{ unless: { flag: 'earth.quarantine.lifted' }, reason: 'Directorate quarantine: no vessel exposed to the Blackglass may approach Earth.' }],
  },
  {
    body: 'moon', zone: 'space.cislunar', cost: 800, realTime: '~7 months from Mars (Hohmann transfer)',
    locks: [{ unless: { flag: 'launched' }, reason: 'The Lantern is not flight-ready.' }],
  },
  {
    body: 'mars', zone: 'space.mars', cost: 800, realTime: '~7 months (Hohmann transfer)',
    locks: [
      { unless: { flag: 'launched' }, reason: 'The Lantern is not flight-ready.' },
      { unless: { flag: 'slice.complete' }, reason: 'No flight plan filed with Earth Control. Harbor first.' },
    ],
  },
  { body: 'ceres', zone: null, cost: 0, realTime: '~15 months', locks: [RANGE] },
  { body: 'jupiter', zone: null, cost: 0, realTime: '~2.7 years', locks: [RANGE] },
  { body: 'saturn', zone: null, cost: 0, realTime: '~6 years', locks: [RANGE] },
  { body: 'uranus', zone: null, cost: 0, realTime: '~16 years', locks: [RANGE] },
  { body: 'neptune', zone: null, cost: 0, realTime: '~30 years', locks: [RANGE] },
  { body: 'pluto', zone: null, cost: 0, realTime: '~45 years', locks: [RANGE] },
];

/** Seconds of playable cruise for any transfer (the real months are compressed). */
export const TRANSIT_SECONDS = 90;
