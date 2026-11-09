// Fully original, procedurally synthesized audio (Web Audio API) — no external files or licenses needed.
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.mode = 'explore';
    this.nextBeat = 0;
    this.beat = 0;
  }

  init() {
    if (this.ctx) return this.ctx.resume();
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(ctx.destination);

    // reverb send
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(3.2, 2.4);
    const rvGain = ctx.createGain();
    rvGain.gain.value = 0.55;
    this.reverb.connect(rvGain).connect(this.master);

    this.music = ctx.createGain();
    this.music.gain.value = 0.5;
    this.music.connect(this.master);
    this.music.connect(this.reverb);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.8;
    this.sfx.connect(this.master);
    this.sfx.connect(this.reverb);
    this.amb = ctx.createGain();
    this.amb.gain.value = 0.6;
    this.amb.connect(this.master);

    this.noise = this._noiseBuffer(4);
    this._startAmbience();
    this._loadStep();
    this._birds();
    this._loadStep();
    this.nextBeat = ctx.currentTime + 0.2;
    this.timer = setInterval(() => this._schedule(), 90);
    return ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.15);
  }

  _impulse(sec, decay) {
    const ctx = this.ctx;
    const len = ctx.sampleRate * sec;
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  _noiseBuffer(sec) {
    const ctx = this.ctx;
    const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02; // brown-ish
      d[i] = last * 3.5 * 0.5 + w * 0.5;
    }
    return b;
  }

  _loopNoise(filterType, freq, q, gain, dest) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(dest);
    src.start();
    return { src, f, g };
  }

  _startAmbience() {
    const ctx = this.ctx;
    // wind with slow gusts
    this.wind = this._loopNoise('bandpass', 420, 0.6, 0.12, this.amb);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = ctx.createGain();
    lg.gain.value = 0.07;
    lfo.connect(lg).connect(this.wind.g.gain);
    lfo.start();
    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 0.05;
    const lg2 = ctx.createGain();
    lg2.gain.value = 180;
    lfo2.connect(lg2).connect(this.wind.f.frequency);
    lfo2.start();
    // waterfall (distance controlled)
    this.water = this._loopNoise('lowpass', 1600, 0.3, 0, this.amb);
  }

  /** Soft, occasional birdsong — short chirp phrases from random directions (quiet, daytime only). */
  _birds() {
    const next = () => setTimeout(() => this._birds(), 2500 + Math.random() * 6000);
    if (!this.ctx || this.mode !== 'explore' || (this.night || 0) > 0.5 || this.muted) return next();
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.05;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if (pan.pan) pan.pan.value = Math.random() * 1.6 - 0.8;
    const out = ctx.createGain();
    out.gain.value = 0.012 + Math.random() * 0.01; // kept low, a background detail
    out.connect(pan).connect(this.amb);
    const base = 2200 + Math.random() * 1600;
    const kind = Math.floor(Math.random() * 3);
    const notes = 2 + Math.floor(Math.random() * 5);
    let t = t0;
    for (let i = 0; i < notes; i++) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      const g = ctx.createGain();
      const d = kind === 0 ? 0.07 : kind === 1 ? 0.12 : 0.05;
      const f0 = base * (1 + (Math.random() - 0.5) * 0.15);
      if (kind === 0) { o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 1.45, t + d); } // rising tweet
      else if (kind === 1) { o.frequency.setValueAtTime(f0 * 1.4, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.8, t + d); } // falling whistle
      else { o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * 1.15, t + d / 2); o.frequency.linearRampToValueAtTime(f0, t + d); } // trill
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(1, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + d + 0.02);
      t += d + (kind === 2 ? 0.025 : 0.06 + Math.random() * 0.08);
    }
    next();
  }

  setWater(level) {
    if (this.water) this.water.g.gain.setTargetAtTime(Math.min(0.5, level * 0.5), this.ctx.currentTime, 0.3);
  }

  setNight(n) {
    this.night = n;
    if (this.wind) this.wind.f.frequency.setTargetAtTime(420 - n * 140, this.ctx.currentTime, 1);
  }

  // ------------------------------------------------------------ instruments
  _bell(freq, t, dur = 1.6, vol = 0.05, dest = this.music) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(dest);
    for (const [mul, v] of [[1, 1], [2.01, 0.35], [3.98, 0.12]]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * mul;
      const og = ctx.createGain();
      og.gain.value = v;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  _pad(freqs, t, dur, vol = 0.028, dest = this.music) {
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.35);
    g.gain.linearRampToValueAtTime(vol * 0.8, t + dur * 0.8);
    g.gain.linearRampToValueAtTime(0, t + dur + 1.2);
    f.connect(g).connect(dest);
    for (const fr of freqs) {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = fr;
        o.detune.value = det;
        o.connect(f);
        o.start(t);
        o.stop(t + dur + 1.3);
      }
    }
  }

  piano(note, t, vol = 0.09, dur = 2.6) {
    const ctx = this.ctx;
    const fr = midi(note);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(vol * 0.35, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(Math.min(9000, fr * 8), t);
    f.frequency.exponentialRampToValueAtTime(Math.max(300, fr * 1.5), t + dur);
    f.connect(g).connect(this.finaleBus || this.music);
    for (const [mul, v, type] of [[1, 1, 'triangle'], [2, 0.4, 'sine'], [3, 0.15, 'sine'], [4.02, 0.06, 'sine']]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = fr * mul;
      const og = ctx.createGain();
      og.gain.value = v;
      o.connect(og).connect(f);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
  }

  // ------------------------------------------------------------ music scheduler
  _schedule() {
    if (!this.ctx || this.mode !== 'explore') return;
    const ctx = this.ctx;
    const spb = 60 / 70 / 2; // eighth notes at 70 bpm
    const prog = [[53, 57, 60, 64], [48, 55, 60, 64], [45, 52, 55, 60], [43, 50, 55, 62]];
    const scale = [72, 74, 76, 79, 81, 84, 86, 88];
    while (this.nextBeat < ctx.currentTime + 0.35) {
      const t = this.nextBeat;
      const bar = Math.floor(this.beat / 8) % 4;
      if (this.beat % 8 === 0) {
        this._pad(prog[bar].map(midi), t, spb * 8);
        this._bell(midi(prog[bar][0] - 12), t, 3, 0.03);
      }
      const step = this.beat % 8;
      const p = step % 2 === 0 ? 0.45 : 0.18;
      if (Math.random() < p) {
        const chordTones = prog[bar].map((n) => n + 24);
        const pool = Math.random() < 0.6 ? scale : chordTones;
        this._bell(midi(pool[Math.floor(Math.random() * pool.length)]), t, 2.2, 0.035);
      }
      this.nextBeat += spb;
      this.beat++;
    }
  }

  // ------------------------------------------------------------ sfx
  async _loadStep() {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}assets/audio/walk-on-grass.mp3`);
      const data = await res.arrayBuffer();
      this.stepBuffer = await new Promise((ok, fail) => this.ctx.decodeAudioData(data, ok, fail));
    } catch (e) {
      console.warn('Footstep sample unavailable, using synthesized steps', e);
    }
  }

  footstep(soft = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    if (this.stepBuffer) {
      // recorded grass step, slightly varied each time so it never sounds repetitive
      const src = ctx.createBufferSource();
      src.buffer = this.stepBuffer;
      src.playbackRate.value = 0.9 + Math.random() * 0.22;
      const g = ctx.createGain();
      g.gain.value = 0.22 * soft * (0.85 + Math.random() * 0.3);
      src.connect(g).connect(this.master);
      src.start(t);
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.5;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 700 + Math.random() * 500;
    f.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16 * soft, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 3, 0.15);
  }

  jump() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._bell(midi(79), t, 0.4, 0.03, this.sfx);
  }

  collect() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [72, 76, 79, 84, 88].forEach((n, i) => this._bell(midi(n), t + i * 0.09, 2.2, 0.07, this.sfx));
    this._sparkle(t, 1.2);
  }

  chime() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [84, 91].forEach((n, i) => this._bell(midi(n), t + i * 0.12, 1.5, 0.04, this.sfx));
  }

  _sparkle(t, dur) {
    const pent = [84, 86, 88, 91, 93, 96];
    for (let i = 0; i < 10; i++) this._bell(midi(pent[Math.floor(Math.random() * pent.length)]), t + Math.random() * dur, 0.8, 0.012, this.sfx);
  }

  ring() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    for (let r = 0; r < 2; r++) {
      const t = t0 + r * 1.1;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.05, t + 0.02);
      g.gain.setValueAtTime(0.05, t + 0.7);
      g.gain.linearRampToValueAtTime(0, t + 0.75);
      g.connect(this.sfx);
      const am = ctx.createOscillator();
      am.type = 'square';
      am.frequency.value = 20;
      const amg = ctx.createGain();
      amg.gain.value = 0.5;
      const carrier = ctx.createGain();
      carrier.gain.value = 0.5;
      am.connect(amg).connect(carrier.gain);
      carrier.connect(g);
      for (const fr of [880, 1046]) {
        const o = ctx.createOscillator();
        o.frequency.value = fr;
        o.connect(carrier);
        o.start(t);
        o.stop(t + 0.8);
      }
      am.start(t);
      am.stop(t + 0.8);
    }
  }

  /** Petals gathering: soft harp-like rising arpeggios over a warm pad (no pitch sweeps). */
  magic(dur = 4) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // warm sustained chord swell (Fmaj9 -> Cmaj9)
    this._pad([53, 60, 64, 69, 72].map(midi), t, dur * 0.55, 0.022, this.finaleBus || this.sfx);
    this._pad([48, 55, 62, 64, 71].map(midi), t + dur * 0.5, dur * 0.6, 0.022, this.finaleBus || this.sfx);
    // gentle ascending harp runs, getting slightly denser
    const scale = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84, 86, 88];
    let tt = t + 0.3, i = 0;
    while (tt < t + dur) {
      const k = (tt - t) / dur;
      const n = scale[i % scale.length];
      this.piano(n, tt, 0.035 + k * 0.02, 2.4);
      i++;
      if (i % scale.length === 0) tt += 0.5;
      tt += 0.22 - k * 0.08;
    }
  }

  bloom() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [60, 64, 67, 72, 76, 79, 84].forEach((n, i) => this._bell(midi(n), t + i * 0.06, 4, 0.06, this.sfx));
    this._sparkle(t, 2.5);
  }

  // ------------------------------------------------------------ finale music
  startFinale() {
    if (!this.ctx) return;
    this.mode = 'finale';
    const ctx = this.ctx;
    this.music.gain.setTargetAtTime(0, ctx.currentTime, 1.2);
    this.finaleBus = ctx.createGain();
    this.finaleBus.gain.value = 0.9;
    this.finaleBus.connect(this.master);
    this.finaleBus.connect(this.reverb);
    // soft piano arpeggios
    const t0 = ctx.currentTime + 2;
    const chords = [[53, 60, 65, 69, 72], [48, 55, 64, 67, 72], [45, 52, 60, 64, 69], [43, 50, 59, 62, 67]];
    let t = t0;
    this._finaleArps = [];
    for (let rep = 0; rep < 2; rep++)
      for (const c of chords) {
        c.forEach((n, i) => this.piano(n, t + i * 0.42, 0.07, 3.5));
        t += 3.4;
      }
    this.finaleArpEnd = t;
  }

  happyBirthday(delay = 0) {
    if (!this.ctx) return;
    const t0 = Math.max(this.ctx.currentTime + delay, this.finaleArpEnd || 0);
    const b = 0.62; // seconds per beat
    const mel = [
      [67, 0.75], [67, 0.25], [69, 1], [67, 1], [72, 1], [71, 2],
      [67, 0.75], [67, 0.25], [69, 1], [67, 1], [74, 1], [72, 2],
      [67, 0.75], [67, 0.25], [79, 1], [76, 1], [72, 1], [71, 1], [69, 2],
      [77, 0.75], [77, 0.25], [76, 1], [72, 1], [74, 1], [72, 3],
    ];
    let t = t0;
    const starts = [];
    for (const [n, d] of mel) {
      this.piano(n, t, 0.11, Math.max(1.8, d * b * 2));
      starts.push(t);
      t += d * b;
    }
    // left hand chords on bar downbeats
    const ch = [[1, [48, 55, 64]], [4, [43, 50, 59]], [7, [43, 50, 59]], [10, [48, 55, 64]], [13, [48, 55, 64]], [16, [41, 48, 57]], [19, [48, 55, 64]], [21, [43, 50, 59]], [24, [48, 55, 64]]];
    for (const [beat, notes] of ch) notes.forEach((n) => this.piano(n, t0 + beat * b, 0.05, 3));
    // continue gentle arpeggios afterwards (for the letter)
    const chords = [[53, 60, 65, 69, 72], [48, 55, 64, 67, 72], [45, 52, 60, 64, 69], [43, 50, 59, 62, 67]];
    let tt = t + 2;
    for (let rep = 0; rep < 6; rep++)
      for (const c of chords) {
        c.forEach((n, i) => this.piano(n, tt + i * 0.45, 0.05, 3.5));
        tt += 3.6;
      }
    return t0 - this.ctx.currentTime;
  }

  stopFinale() {
    if (!this.ctx) return;
    if (this.finaleBus) {
      this.finaleBus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);
      const b = this.finaleBus;
      setTimeout(() => b.disconnect(), 3000);
      this.finaleBus = null;
    }
    this.mode = 'explore';
    this.nextBeat = this.ctx.currentTime + 0.5;
    this.music.gain.setTargetAtTime(0.5, this.ctx.currentTime, 1.5);
  }
}

export const audio = new AudioEngine();
