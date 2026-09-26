import { effect } from '@preact/signals';
import type { Game } from '../Game';
import { ui } from '../ui/uiState';
import { VOICES, voiceIdForSpeaker, type VoiceProfile } from '../content/voices';

/** Voice names that usually belong to a higher-register voice. */
const HIGH = ['female', 'woman', 'samantha', 'victoria', 'karen', 'moira', 'tessa', 'fiona', 'veena', 'zira', 'aria', 'jenny', 'sonia', 'libby', 'natasha', 'clara', 'emma', 'ava', 'allison', 'susan', 'hazel', 'heera', 'catherine', 'linda', 'michelle', 'sara', 'serena', 'kate', 'ezinne', 'leah', 'luna', 'nancy', 'neerja', 'molly', 'asilia', 'jane', 'amber', 'ashley', 'cora', 'elizabeth', 'monica', 'paulina', 'kathy', 'vicki', 'salli', 'joanna', 'kimberly', 'ivy', 'kendra', 'nicole', 'raveena', 'aditi', 'emily', 'olivia', 'isabella', 'maisie', 'yan', 'rosa', 'google us english'];
/** …and to a lower-register voice. */
const LOW = ['male', 'daniel', 'alex', 'fred', 'rishi', 'oliver', 'tom', 'aaron', 'arthur', 'guy', 'davis', 'ryan', 'thomas', 'george', 'james', 'william', 'christopher', 'eric', 'roger', 'steffan', 'brian', 'andrew', 'prabhat', 'abeo', 'connor', 'liam', 'mitchell', 'david', 'mark', 'richard', 'gordon', 'lee', 'justin', 'joey', 'matthew', 'russell', 'geraint', 'ravi', 'hemant', 'tony', 'jason', 'brandon', 'noah', 'elliot', 'wayne', 'chilemba', 'luke'];
/** macOS novelty voices: never cast these. */
const NOVELTY = ['albert', 'bad news', 'bahh', 'bells', 'boing', 'bubbles', 'cellos', 'deranged', 'good news', 'hysterical', 'pipe organ', 'trinoids', 'whisper', 'zarvox', 'wobble', 'jester', 'organ', 'superstar', 'ralph', 'grandma', 'grandpa', 'eddy', 'flo', 'reed', 'rocko', 'sandy', 'shelley'];

function hintOf(name: string): 'high' | 'low' | null {
  const n = name.toLowerCase();
  // "female" contains "male": test the high list first.
  if (HIGH.some((h) => n.includes(h))) return 'high';
  if (LOW.some((h) => new RegExp(`(^|[^a-z])${h}([^a-z]|$)`).test(n))) return 'low';
  return null;
}

/** Rough speaking time for a line, used to pace subtitles to the voice. */
export function speechSeconds(text: string, rate = 1): number {
  const words = text.trim().split(/\s+/).length;
  return words / (2.6 * rate) + 0.7;
}

function clean(text: string): string {
  return text
    .replace(/[“”]/g, '"')
    .replace(/\s*—\s*/g, ', ')
    .replace(/…/g, '...')
    .replace(/CO₂/g, 'C O 2')
    .replace(/O₂/g, 'O 2')
    .replace(/H₂O/g, 'water')
    .replace(/°C/g, ' degrees')
    .replace(/[*_#]/g, '');
}

/**
 * Character voices via the browser's speech synthesis. Every subtitle and dialogue line
 * is spoken by its character's cast voice. Casting is per-machine (browsers expose
 * different voices), stable for a session, and spreads characters across the available
 * voices so no two crew members share voice + pitch.
 */
export class VoiceSystem {
  private synth: SpeechSynthesis | null = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
  private cast = new Map<string, SpeechSynthesisVoice | null>();
  private voices: SpeechSynthesisVoice[] = [];
  private lastKey = '';
  private pausedByGame = false;

  constructor(private game: Game) {
    if (!this.synth) return;
    const load = () => {
      this.voices = this.synth!.getVoices().filter((v) => !NOVELTY.some((n) => v.name.toLowerCase().includes(n)));
      this.cast.clear();
      // Cast everyone up front, crew first, so voices spread the same way every session.
      if (this.voices.length) for (const id of Object.keys(VOICES)) this.voiceFor(id, VOICES[id]);
    };
    load();
    this.synth.addEventListener?.('voiceschanged', load);

    // Speak subtitles (story radio, barks, cinematics) and dialogue lines as they appear.
    effect(() => {
      const s = ui.subtitle.value;
      if (s) this.say(s.speaker, s.text);
    });
    effect(() => {
      const d = ui.dialogue.value;
      if (!d) {
        if (this.lastKey.startsWith('dlg:')) this.stop();
        return;
      }
      if (d.speaker === this.game.dialogue.playerName && !d.speakerRole) return;
      this.say(d.speaker, d.text, 'dlg:');
    });
  }

  get enabled(): boolean {
    return !!this.synth && this.game.settings.voices !== false;
  }

  /** Speaking-time estimate for pacing subtitles (0 when voices are off). */
  duration(speaker: string, text: string): number {
    if (!this.enabled) return 0;
    const id = voiceIdForSpeaker(speaker);
    return speechSeconds(text, id ? VOICES[id].rate : 1);
  }

  say(speaker: string, text: string, tag = 'sub:'): void {
    if (!this.enabled || !text) return;
    const key = `${tag}${speaker}|${text}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    const id = voiceIdForSpeaker(speaker) ?? (speaker && speaker.length < 30 ? 'control' : null);
    if (!id) return;
    const profile = VOICES[id];
    const synth = this.synth!;
    const u = new SpeechSynthesisUtterance(clean(text));
    const voice = this.voiceFor(id, profile);
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    } else u.lang = profile.accents[0];
    u.pitch = profile.pitch;
    u.rate = profile.rate;
    const vol = this.game.settings.volumes.master * (this.game.settings.voiceVolume ?? 1) * (profile.volume ?? 1);
    u.volume = Math.max(0, Math.min(1, vol * 1.15));
    u.onend = () => {
      if (this.lastKey === key) this.lastKey = '';
    };
    // A new line always interrupts the previous one; subtitle pacing leaves room for it.
    if (synth.speaking || synth.pending) {
      synth.cancel();
      setTimeout(() => synth.speak(u), 40);
    } else synth.speak(u);
  }

  stop(): void {
    this.lastKey = '';
    this.synth?.cancel();
  }

  /** Pause speech while the game is paused (menus). */
  setPaused(paused: boolean): void {
    if (!this.synth || paused === this.pausedByGame) return;
    this.pausedByGame = paused;
    if (paused) this.synth.pause();
    else this.synth.resume();
  }

  private voiceFor(id: string, p: VoiceProfile): SpeechSynthesisVoice | null {
    if (this.cast.has(id)) return this.cast.get(id)!;
    const english = this.voices.filter((v) => v.lang.toLowerCase().startsWith('en') || p.accents.some((a) => v.lang.toLowerCase() === a.toLowerCase()));
    if (!english.length) {
      this.cast.set(id, null);
      return null;
    }
    const used = new Map<string, number>();
    for (const v of this.cast.values()) if (v) used.set(v.name, (used.get(v.name) ?? 0) + 1);
    let best: SpeechSynthesisVoice | null = null;
    let bestScore = -Infinity;
    for (const v of english) {
      const lang = v.lang.toLowerCase().replace('_', '-');
      let score = 0;
      p.accents.forEach((a, i) => {
        if (lang === a.toLowerCase()) score = Math.max(score, 10 - i * 2.5);
      });
      if (lang.startsWith('en')) score += 2;
      const h = hintOf(v.name);
      if (h === p.register) score += 6;
      else if (h === null) score += 1.5;
      else score -= 7;
      if (/natural|neural|online|premium|enhanced/i.test(v.name)) score += 3;
      score -= (used.get(v.name) ?? 0) * 3.5;
      if (score > bestScore) {
        bestScore = score;
        best = v;
      }
    }
    this.cast.set(id, best);
    return best;
  }
}
