/**
 * Voice casting for speech synthesis. Browsers expose different voice sets per OS, so a
 * profile describes what to look for rather than naming one voice: a register (which pool
 * of voices to cast from), preferred accents in order, and pitch/rate so that characters
 * sharing a base voice still sound distinct.
 */
export interface VoiceProfile {
  register: 'high' | 'low';
  /** BCP-47 language tags in order of preference, e.g. ['en-NG', 'en-GB']. */
  accents: string[];
  pitch: number;
  rate: number;
  /** Relative loudness 0..1. */
  volume?: number;
}

export const VOICES: Record<string, VoiceProfile> = {
  okonkwo: { register: 'high', accents: ['en-NG', 'en-GB', 'en-ZA'], pitch: 0.86, rate: 0.93 },
  arakawa: { register: 'low', accents: ['en-US', 'en-CA'], pitch: 1.08, rate: 1.1 },
  castellanos: { register: 'high', accents: ['en-US', 'es-US', 'en-CA'], pitch: 0.96, rate: 1.08 },
  sola: { register: 'high', accents: ['en-KE', 'en-ZA', 'en-GB'], pitch: 1.12, rate: 1.12 },
  novak: { register: 'high', accents: ['en-GB', 'en-IE', 'en-AU'], pitch: 1.0, rate: 0.94 },
  haddad: { register: 'low', accents: ['en-GB', 'en-US'], pitch: 0.94, rate: 1.02 },
  carvalho: { register: 'high', accents: ['en-GB', 'pt-BR', 'en-US'], pitch: 0.92, rate: 1.0 },
  wren: { register: 'low', accents: ['en-GB', 'en-IE'], pitch: 1.05, rate: 1.05 },
  rao: { register: 'low', accents: ['en-IN', 'en-GB'], pitch: 0.9, rate: 0.96 },
  benedetti: { register: 'high', accents: ['en-US', 'it-IT', 'en-GB'], pitch: 1.05, rate: 1.1 },
  adeyemi: { register: 'low', accents: ['en-NG', 'en-ZA', 'en-GB'], pitch: 0.85, rate: 0.98 },
  zhou: { register: 'high', accents: ['en-US', 'en-SG', 'en-HK'], pitch: 1.08, rate: 1.04 },
  ferreira: { register: 'high', accents: ['en-AU', 'en-GB', 'pt-BR'], pitch: 0.98, rate: 0.98 },
  // Non-crew voices
  control: { register: 'low', accents: ['en-US', 'en-GB'], pitch: 0.8, rate: 1.05, volume: 0.9 },
  crowd: { register: 'low', accents: ['en-US'], pitch: 1.1, rate: 1.15, volume: 0.8 },
  archive: { register: 'low', accents: ['en-GB', 'en-US'], pitch: 0.55, rate: 0.82 },
};

/**
 * Subtitles name speakers loosely ("Arakawa", "Kit", "Earth Control"); map any of those to a
 * profile id. Checked as case-insensitive substrings, in order.
 */
export const SPEAKER_ALIASES: [string, string][] = [
  ['okonkwo', 'okonkwo'], ['adaeze', 'okonkwo'], ['commander', 'okonkwo'],
  ['arakawa', 'arakawa'], ['kit', 'arakawa'],
  ['castellanos', 'castellanos'], ['mira', 'castellanos'],
  ['sola', 'sola'], ['imani', 'sola'],
  ['novak', 'novak'], ['petra', 'novak'],
  ['haddad', 'haddad'], ['rafi', 'haddad'],
  ['carvalho', 'carvalho'], ['ines', 'carvalho'],
  ['wren', 'wren'], ['tomasz', 'wren'],
  ['rao', 'rao'], ['anand', 'rao'],
  ['benedetti', 'benedetti'], ['lucía', 'benedetti'],
  ['adeyemi', 'adeyemi'], ['yusuf', 'adeyemi'],
  ['zhou', 'zhou'], ['mei-ling', 'zhou'],
  ['ferreira', 'ferreira'], ['beatriz', 'ferreira'],
  ['control', 'control'], ['capcom', 'control'], ['houston', 'control'],
  ['crowd', 'crowd'],
  ['archive', 'archive'], ['builder', 'archive'],
];

export function voiceIdForSpeaker(speaker: string): string | null {
  const s = speaker.toLowerCase();
  if (!s || s === 'you' || s === 'player') return null;
  if (VOICES[s]) return s;
  for (const [needle, id] of SPEAKER_ALIASES) {
    // Whole-word match so e.g. "kit" doesn't fire inside other words.
    const re = new RegExp(`(^|[^a-z])${needle.replace(/[-]/g, '\\-')}([^a-z]|$)`);
    if (re.test(s)) return id;
  }
  return null;
}
