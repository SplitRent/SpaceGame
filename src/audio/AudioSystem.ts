/**
 * Procedural WebAudio sound. No asset files are required: ambiences, SFX and music
 * stingers are synthesised. Environments sound different (vacuum = suit/contact sounds
 * only; ship = machinery & ventilation). CC0 samples can later be layered on top.
 */
export type AmbienceId = 'none' | 'vacuum' | 'ship' | 'ship-dead' | 'station' | 'space' | 'cinematic';
export type Sfx =
  | 'step' | 'stepMetal' | 'jump' | 'land' | 'click' | 'beep' | 'confirm' | 'error' | 'pickup'
  | 'door' | 'airlock' | 'alarm' | 'impact' | 'scan' | 'scanDone' | 'mine' | 'craft' | 'switch'
  | 'breaker' | 'powerUp' | 'powerDown' | 'radio' | 'hurt' | 'build' | 'thruster' | 'explosion' | 'weld';
export type Stinger = 'discovery' | 'quest' | 'danger' | 'wonder' | 'launch' | 'somber' | 'arrival';

interface Ambience {
  stop(): void;
  setLevel(v: number): void;
}

export class AudioSystem {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private ambBus!: GainNode;
  private musicBus!: GainNode;
  private noiseBuf!: AudioBuffer;
  private ambience: Ambience | null = null;
  private ambienceId: AmbienceId = 'none';
  private engineOsc: { stop(): void; set(throttle: number): void } | null = null;
  volumes = { master: 0.8, sfx: 0.9, ambience: 0.7, music: 0.6 };
  /** When true (vacuum outside), airborne sounds are heavily muffled. */
  vacuum = false;
  private muffle!: BiquadFilterNode;

  /** Must be called from a user gesture. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.connect(this.master);
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    this.muffle.connect(comp);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.muffle);
    this.ambBus = ctx.createGain();
    this.ambBus.connect(comp);
    this.musicBus = ctx.createGain();
    this.musicBus.connect(comp);
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    const want = this.ambienceId;
    this.ambienceId = 'none';
    this.setAmbience(want);
  }

  applyVolumes(): void {
    if (!this.ctx) return;
    this.master.gain.value = this.volumes.master;
    this.sfxBus.gain.value = this.volumes.sfx;
    this.ambBus.gain.value = this.volumes.ambience;
    this.musicBus.gain.value = this.volumes.music;
  }

  setVacuum(v: boolean): void {
    this.vacuum = v;
    if (!this.ctx) return;
    this.muffle.frequency.setTargetAtTime(v ? 700 : 20000, this.ctx.currentTime, 0.3);
  }

  private noise(): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    return src;
  }

  private env(g: GainNode, t: number, a: number, peak: number, d: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, peak: number, bus?: AudioNode, delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    this.env(g, t, 0.005, peak, dur);
    o.connect(g).connect(bus ?? this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private burst(freq: number, q: number, dur: number, peak: number, type: BiquadFilterType = 'bandpass', bus?: AudioNode, delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const n = this.noise();
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    this.env(g, t, 0.004, peak, dur);
    n.connect(f).connect(g).connect(bus ?? this.sfxBus);
    n.start(t, Math.random());
    n.stop(t + dur + 0.05);
  }

  play(s: Sfx, volume = 1): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const v = volume;
    switch (s) {
      case 'step':
        // In vacuum, footsteps are felt through the suit: low thump only.
        this.burst(this.vacuum ? 120 : 400, 1.2, 0.09, 0.25 * v, 'lowpass', this.ambBus);
        break;
      case 'stepMetal':
        this.burst(900, 3, 0.07, 0.18 * v);
        this.tone('triangle', 180, 120, 0.08, 0.05 * v);
        break;
      case 'jump':
        this.burst(300, 1, 0.12, 0.12 * v, 'lowpass');
        break;
      case 'land':
        this.burst(160, 0.8, 0.25, 0.35 * v, 'lowpass', this.ambBus);
        break;
      case 'click':
        this.tone('square', 1800, 1200, 0.03, 0.05 * v);
        break;
      case 'switch':
        this.tone('square', 900, 400, 0.04, 0.09 * v);
        this.burst(3000, 2, 0.03, 0.08 * v);
        break;
      case 'breaker':
        this.burst(1800, 1, 0.06, 0.3 * v);
        this.tone('square', 90, 60, 0.12, 0.15 * v);
        break;
      case 'beep':
        this.tone('sine', 880, 880, 0.12, 0.12 * v);
        break;
      case 'confirm':
        this.tone('sine', 660, 660, 0.09, 0.12 * v);
        this.tone('sine', 990, 990, 0.14, 0.12 * v, undefined, 0.09);
        break;
      case 'error':
        this.tone('sawtooth', 220, 180, 0.2, 0.08 * v);
        this.tone('sawtooth', 200, 160, 0.2, 0.08 * v, undefined, 0.2);
        break;
      case 'pickup':
        this.tone('sine', 520, 780, 0.12, 0.12 * v);
        break;
      case 'door':
        this.burst(700, 0.6, 0.5, 0.2 * v, 'bandpass');
        this.tone('sine', 120, 90, 0.4, 0.08 * v);
        break;
      case 'airlock':
        this.burst(2500, 0.4, 1.6, 0.25 * v, 'highpass', this.ambBus);
        this.tone('sine', 70, 50, 1.2, 0.2 * v, this.ambBus);
        break;
      case 'alarm':
        for (let i = 0; i < 3; i++) this.tone('sawtooth', 720, 520, 0.35, 0.09 * v, undefined, i * 0.45);
        break;
      case 'impact':
        this.burst(90, 0.5, 1.2, 0.9 * v, 'lowpass', this.ambBus);
        this.burst(1400, 0.5, 0.4, 0.3 * v, 'bandpass', this.ambBus);
        break;
      case 'explosion':
        this.burst(60, 0.4, 2.5, 1.0 * v, 'lowpass', this.ambBus);
        this.burst(600, 0.3, 1.0, 0.4 * v, 'bandpass', this.ambBus);
        break;
      case 'scan':
        this.tone('sine', 400, 1600, 0.6, 0.05 * v);
        break;
      case 'scanDone':
        this.tone('sine', 1320, 1320, 0.08, 0.1 * v);
        this.tone('sine', 1760, 1760, 0.16, 0.1 * v, undefined, 0.08);
        break;
      case 'mine':
        this.burst(2200, 4, 0.12, 0.1 * v);
        this.tone('sawtooth', 110, 105, 0.12, 0.04 * v);
        break;
      case 'weld':
        this.burst(5000, 1, 0.15, 0.12 * v, 'highpass');
        break;
      case 'craft':
        this.tone('triangle', 300, 600, 0.2, 0.1 * v);
        this.tone('triangle', 600, 900, 0.2, 0.08 * v, undefined, 0.2);
        break;
      case 'build':
        for (let i = 0; i < 4; i++) this.burst(800 + i * 200, 2, 0.08, 0.2 * v, 'bandpass', undefined, i * 0.15);
        this.tone('sine', 200, 400, 0.8, 0.1 * v, undefined, 0.6);
        break;
      case 'powerUp':
        this.tone('sawtooth', 40, 220, 2.2, 0.15 * v, this.ambBus);
        this.tone('sine', 80, 440, 2.4, 0.1 * v, this.ambBus);
        break;
      case 'powerDown':
        this.tone('sawtooth', 220, 30, 2.0, 0.15 * v, this.ambBus);
        break;
      case 'radio':
        this.burst(2000, 1.5, 0.15, 0.12 * v, 'bandpass', this.ambBus);
        this.tone('square', 1200, 1200, 0.05, 0.04 * v, this.ambBus, 0.15);
        break;
      case 'hurt':
        this.tone('sawtooth', 160, 80, 0.25, 0.15 * v);
        break;
      case 'thruster':
        this.burst(300, 0.7, 0.3, 0.15 * v, 'lowpass', this.ambBus);
        break;
    }
  }

  /** Musical stingers for key moments (generative pads). */
  stinger(kind: Stinger): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const chords: Record<Stinger, number[]> = {
      discovery: [261.6, 329.6, 392, 493.9],
      quest: [293.7, 370, 440],
      danger: [110, 116.5, 164.8],
      wonder: [196, 293.7, 392, 587.3, 740],
      launch: [130.8, 196, 261.6, 329.6, 392, 523.3],
      somber: [220, 261.6, 329.6],
      arrival: [174.6, 261.6, 349.2, 440, 523.3],
    };
    const dur = kind === 'launch' || kind === 'wonder' ? 9 : kind === 'danger' ? 3 : 5;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    chords[kind].forEach((f, i) => {
      for (const det of [-4, 4]) {
        const o = ctx.createOscillator();
        o.type = kind === 'danger' ? 'sawtooth' : 'triangle';
        o.frequency.value = f;
        o.detune.value = det;
        const flt = ctx.createBiquadFilter();
        flt.type = 'lowpass';
        flt.frequency.setValueAtTime(400, t);
        flt.frequency.linearRampToValueAtTime(kind === 'danger' ? 900 : 2400, t + dur * 0.4);
        const g = ctx.createGain();
        const start = t + i * (kind === 'wonder' || kind === 'launch' ? 0.35 : 0.08);
        g.gain.setValueAtTime(0.0001, start);
        g.gain.linearRampToValueAtTime(0.035, start + dur * 0.3);
        g.gain.linearRampToValueAtTime(0.0001, start + dur);
        o.connect(flt).connect(g).connect(this.musicBus);
        o.start(start);
        o.stop(start + dur + 0.1);
      }
    });
  }

  setAmbience(id: AmbienceId): void {
    if (id === this.ambienceId) return;
    this.ambienceId = id;
    const old = this.ambience;
    this.ambience = null;
    old?.stop();
    if (!this.ctx || id === 'none') return;
    this.ambience = this.makeAmbience(id);
  }

  private makeAmbience(id: AmbienceId): Ambience {
    const ctx = this.ctx!;
    const out = ctx.createGain();
    out.gain.value = 0.0001;
    out.gain.setTargetAtTime(1, ctx.currentTime, 1.2);
    out.connect(this.ambBus);
    const nodes: AudioScheduledSourceNode[] = [];
    const layerNoise = (freq: number, q: number, gain: number, type: BiquadFilterType = 'lowpass', lfo = 0) => {
      const n = this.noise();
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = gain;
      n.connect(f).connect(g).connect(out);
      n.start();
      nodes.push(n);
      if (lfo) {
        const l = ctx.createOscillator();
        l.frequency.value = lfo;
        const lg = ctx.createGain();
        lg.gain.value = gain * 0.5;
        l.connect(lg).connect(g.gain);
        l.start();
        nodes.push(l);
      }
    };
    const layerTone = (freq: number, gain: number, type: OscillatorType = 'sine') => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = gain;
      o.connect(g).connect(out);
      o.start();
      nodes.push(o);
    };
    switch (id) {
      case 'vacuum':
        // Suit: fan hum + slow breathing
        layerNoise(500, 0.7, 0.02, 'bandpass');
        layerTone(58, 0.015);
        layerNoise(900, 0.8, 0.035, 'bandpass', 0.22);
        break;
      case 'ship':
        layerNoise(180, 0.5, 0.08);
        layerNoise(1200, 0.4, 0.015, 'bandpass', 0.07);
        layerTone(50, 0.05);
        layerTone(100, 0.02);
        layerTone(120.5, 0.008, 'triangle');
        break;
      case 'ship-dead':
        layerNoise(120, 0.5, 0.05);
        layerNoise(3000, 0.6, 0.006, 'highpass', 0.13);
        layerTone(41, 0.02);
        break;
      case 'station':
        layerNoise(250, 0.5, 0.07);
        layerNoise(1500, 0.5, 0.012, 'bandpass', 0.05);
        layerTone(60, 0.04);
        break;
      case 'space':
        layerNoise(140, 0.6, 0.05);
        layerTone(45, 0.04);
        break;
      case 'cinematic':
        layerTone(55, 0.02);
        break;
    }
    return {
      stop: () => {
        const t = ctx.currentTime;
        out.gain.cancelScheduledValues(t);
        out.gain.setTargetAtTime(0.0001, t, 0.5);
        setTimeout(() => {
          nodes.forEach((n) => {
            try {
              n.stop();
            } catch {
              /* already stopped */
            }
          });
          out.disconnect();
        }, 2500);
      },
      setLevel: (v: number) => out.gain.setTargetAtTime(v, ctx.currentTime, 0.3),
    };
  }

  /** Continuous engine sound for flight; call set(throttle) every frame. */
  engine(on: boolean): { set(throttle: number): void } | null {
    if (!this.ctx) return null;
    if (!on) {
      this.engineOsc?.stop();
      this.engineOsc = null;
      return null;
    }
    if (this.engineOsc) return this.engineOsc;
    const ctx = this.ctx;
    const n = this.noise();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 200;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 40;
    const og = ctx.createGain();
    og.gain.value = 0.0001;
    n.connect(f).connect(g).connect(this.ambBus);
    o.connect(og).connect(this.ambBus);
    n.start();
    o.start();
    this.engineOsc = {
      stop: () => {
        g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3);
        og.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3);
        setTimeout(() => {
          n.stop();
          o.stop();
        }, 1500);
      },
      set: (t: number) => {
        const now = ctx.currentTime;
        g.gain.setTargetAtTime(0.02 + t * 0.25, now, 0.1);
        f.frequency.setTargetAtTime(150 + t * 900, now, 0.1);
        og.gain.setTargetAtTime(0.005 + t * 0.03, now, 0.1);
        o.frequency.setTargetAtTime(35 + t * 30, now, 0.1);
      },
    };
    return this.engineOsc;
  }
}
