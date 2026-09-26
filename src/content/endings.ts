import type { Condition } from './types';

export interface EndingDef {
  id: string;
  title: string;
  subtitle: string;
  /** Paragraphs; conditional ones only appear when their condition holds. */
  paragraphs: (string | { if: Condition; text: string })[];
}

const COMMON_CREW: EndingDef['paragraphs'] = [
  { if: { flag: 'office.truthShared' }, text: 'Rafi Haddad kept the commander’s secret log, and the promise that came with it: nobody on the Lantern would ever be lied to again. Nobody was.' },
  { if: { flag: 'kit.treated' }, text: 'Kit Arakawa’s ribs healed crooked. He tells everyone it was the landing. It was the landing.' },
  { if: { questDone: 'sq.greenhouse' }, text: 'Petra Novak’s tomato, grown in a greenhouse on the Moon, went to seed. Its descendants grow in Harbor, at Melas, and in a bottle on the Lantern’s bridge.' },
  { if: { questDone: 'sq.rover' }, text: 'Kamau and Ishikawa were never found. Melas Station put their names on the spire, which did not object.' },
  { if: { questDone: 'sq.visited' }, text: 'Imani Sola’s paper on the Mercury spire — four billion years old, older than the oldest rocks on Earth — was the most-read scientific paper in history for eleven days, until the next one.' },
];

/**
 * The three endings chosen in the Archive on Vesper b (Act 5). All return the player to
 * free exploration afterwards; the world state records the choice.
 */
export const ENDINGS: EndingDef[] = [
  {
    id: 'open',
    title: 'THE LIGHTHOUSE',
    subtitle: 'You opened the Lattice',
    paragraphs: [
      'The Archive heard the answer and every node in the Solar System woke at once — the scar on the Moon, the spire at Melas, the seed in Occator, the stones under Europa’s ice and Titan’s lakes and Pluto’s glaciers. For one second, 1,969 seconds after the choice, they all shone.',
      'Then the doors were simply there. A step at the spire on Mars, and you were standing on Europa. A step on Europa, and you were on Pluto. The Directorate’s quarantine lasted nine days. It is hard to quarantine a doorway.',
      'Humanity did not become wiser overnight. It argued, it wrote rules, it broke them. But it also walked — scientists and miners and pilgrims and children — out along a road someone had built a billion years ago and left, patiently, lit.',
      ...COMMON_CREW,
      'Adaeze Okonkwo went back to Harbor and asked Ines Carvalho for a job. She runs the station’s node now: the busiest door in the Solar System. She still answers every call.',
      'And somewhere beyond Vesper, where the Builders went, a light came on in a window that had been dark for a very long time.',
    ],
  },
  {
    id: 'close',
    title: 'THE LONG WAY HOME',
    subtitle: 'You closed the Lattice',
    paragraphs: [
      'The Archive heard the answer and, gently, like someone turning down a lamp, let the Solar System’s nodes go to sleep. The scar on the Moon stopped pulsing. The spire at Melas became a strange black rock. The Cadence, which had repeated for eighty-two years, fell silent in the middle of a beat.',
      'The Threshold stayed open exactly long enough for one ship to come home. The Lantern crossed it, and it closed behind her like a held breath let go.',
      'The quarantine was lifted the day she crossed Mars’s orbit. Earth came out to meet her: a flotilla of everything that could fly, and a planet that did not know what to say, and so said welcome.',
      ...COMMON_CREW,
      'Adaeze Okonkwo told the whole story, under oath, to anyone who asked. The Directorate is still deciding whether she is a traitor or the first diplomat. She has stopped waiting for them to decide.',
      'Some nights, on the Moon, the old base camp’s seismometers pick up a faint regular tremor under the scar. Nobody has found it worth mentioning. Nobody has forgotten it is there.',
    ],
  },
  {
    id: 'beyond',
    title: 'BEYOND',
    subtitle: 'You followed the Builders',
    paragraphs: [
      'The Archive heard the answer, and the far door — the one the Builders had taken, a billion years ago — opened for a ship called Lantern.',
      'The crew voted. It was not unanimous. Those who stayed took the long way home through the Threshold with the logs, the samples, the maps and a letter to Earth that began: “We are fine. Please do not worry. We are going to be a while.”',
      'Those who went — Okonkwo, Sola, Haddad, Arakawa, Castellanos, Novak, and you — did not see the door close behind them, because there was no behind. There was a road of light, and at the end of it a sky full of stars no one on Earth had ever named.',
      ...COMMON_CREW,
      'The Cadence changed that day. For the first time in eighty-two years it carried something new: a short, repeating message, received by every radio telescope on Earth.',
      'It said: 1969. And then it said: we are here. Come and see.',
    ],
  },
];

export const CREDITS: [string, string][] = [
  ['A game about', 'getting there'],
  ['Crew', 'Okonkwo · Arakawa · Castellanos · Sola · Novak · Haddad'],
  ['Harbor', 'Ines Carvalho · Tomasz Wren'],
  ['Melas', 'Anand Rao · Lucía Benedetti'],
  ['Ceres Deep', 'Yusuf Adeyemi · Mei-Ling Zhou'],
  ['Halcyon', 'Beatriz Ferreira'],
  ['Engine', 'three.js · Rapier · Preact · TypeScript'],
  ['Coastlines', 'Natural Earth (public domain)'],
  ['Science', 'Apollo, Dawn, Galileo, Cassini–Huygens, New Horizons, MRO, InSight — and everyone who flew them'],
  ['Thank you', 'for playing LANTERN'],
];

export function endingParagraphs(def: EndingDef, check: (c: Condition) => boolean): string[] {
  return def.paragraphs.flatMap((p) => (typeof p === 'string' ? [p] : check(p.if) ? [p.text] : []));
}
