// Procedural audio: a small synth, a step sequencer whose track evolves with
// each game form, and sound effects that play notes from the current chord.

const SCALES = {
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
};

// Each game form gets its own groove; energy climbs through the loop.
const TRACKS = {
  title: { bpm: 84, root: 50, scale: 'aeolian', prog: [0, 5, 2, 6], kick: '', snare: '', hat: '', bass: 'r...............', arp: { rate: 4, pat: [0, 1, 2, 3], wave: 'sine', vol: 0.05 }, pad: 0.05 },
  0: { bpm: 96, root: 57, scale: 'aeolian', prog: [0, 5, 2, 6], kick: 'x.......x.......', snare: '', hat: '....x.......x...', bass: 'r.......r...f...', arp: { rate: 2, pat: [0, 1, 2, 3, 2, 1], wave: 'triangle', vol: 0.06 }, pad: 0.045 },
  1: { bpm: 104, root: 55, scale: 'aeolian', prog: [0, 3, 5, 4], kick: 'x.....x.x.......', snare: '....x.......x...', hat: '..x...x...x...x.', bass: 'r..r..r.r...f.o.', arp: { rate: 2, pat: [0, 2, 1, 3, 2, 4], wave: 'triangle', vol: 0.055 }, pad: 0.04 },
  2: { bpm: 116, root: 52, scale: 'dorian', prog: [0, 3, 0, 4], kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.xxx.xxx.xxx.xx', bass: 'r.ro.rf.r.ro.fr.', arp: { rate: 1, pat: [0, 2, 1, 3], wave: 'square', vol: 0.03 }, pad: 0.035 },
  3: { bpm: 124, root: 50, scale: 'phrygian', prog: [0, 1, 0, 6], kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', bass: 'roroororroroorfo', arp: { rate: 2, pat: [0, 1, 2, 4, 3, 1], wave: 'sawtooth', vol: 0.028 }, pad: 0.04 },
  4: { bpm: 136, root: 57, scale: 'aeolian', prog: [0, 5, 6, 4], kick: 'x...x...x...x...', snare: '....x.......x..x', hat: 'xxxxxxxxxxxxxxxx', bass: 'r.r.o.r.r.r.f.o.', arp: { rate: 1, pat: [0, 1, 2, 3, 4, 3, 2, 1], wave: 'square', vol: 0.028 }, pad: 0.035 },
  5: { bpm: 128, root: 53, scale: 'mixolydian', prog: [0, 6, 3, 0], kick: 'x..x..x...x.....', snare: '....x.......x...', hat: '..x...x...x...x.', bass: 'r..ro..rf..r.o..', arp: { rate: 2, pat: [0, 2, 4, 2, 1, 3], wave: 'triangle', vol: 0.06 }, pad: 0.04 },
  6: { bpm: 148, root: 52, scale: 'aeolian', prog: [0, 5, 2, 6], kick: 'x...x...x...x...', snare: '....x.......x.xx', hat: 'xxxxxxxxxxxxxxxx', bass: 'rorororororororo', arp: { rate: 1, pat: [0, 1, 2, 3, 4, 5, 4, 2], wave: 'square', vol: 0.03 }, pad: 0.04 },
};

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Audio {
  constructor() {
    this.ctx = null;
    this.musicOn = true;
    this.sfxOn = true;
    this.track = null;
    this.pending = null;
    this.step = 0;
    this.transpose = 0;
    this.chordTones = [57, 60, 64];
    this.kicks = [];
  }

  // 0..1 envelope that spikes on each kick drum, for visuals.
  beat() {
    if (!this.ctx || !this.musicOn) return 0;
    const now = this.ctx.currentTime;
    let last = -1;
    for (const k of this.kicks) if (k <= now && k > last) last = k;
    return last < 0 ? 0 : Math.exp(-(now - last) * 7);
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
      const ctx = (this.ctx = new AC());
      this.master = ctx.createGain();
      this.master.gain.value = 0.75;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4;
      comp.attack.value = 0.003; comp.release.value = 0.2;
      this.master.connect(comp).connect(ctx.destination);
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = this.musicOn ? 0.8 : 0;
      this.musicBus.connect(this.master);
      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = this.sfxOn ? 1 : 0;
      this.sfxBus.connect(this.master);
      // Space reverb from a generated impulse.
      this.verb = ctx.createConvolver();
      this.verb.buffer = this.impulse(2.6, 2.4);
      this.verbSend = ctx.createGain();
      this.verbSend.gain.value = 0.32;
      this.verbSend.connect(this.verb).connect(this.master);
      // Tempo-synced echo for the arpeggio.
      this.delay = ctx.createDelay(1);
      this.delayFb = ctx.createGain();
      this.delayFb.gain.value = 0.32;
      const dl = ctx.createBiquadFilter();
      dl.type = 'lowpass'; dl.frequency.value = 2400;
      this.delay.connect(dl).connect(this.delayFb).connect(this.delay);
      dl.connect(this.musicBus);
      this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.nextTime = ctx.currentTime + 0.1;
      this.timer = setInterval(() => this.schedule(), 25);
    }
    if (this.ctx.state !== 'running') this.ctx.resume();
  }

  impulse(sec, decay) {
    const ctx = this.ctx, n = ctx.sampleRate * sec;
    const b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
    }
    return b;
  }

  setMusic(on) { this.musicOn = on; if (this.musicBus) this.musicBus.gain.setTargetAtTime(on ? 0.8 : 0, this.ctx.currentTime, 0.1); }
  setSfx(on) { this.sfxOn = on; if (this.sfxBus) this.sfxBus.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05); }

  setTrack(key, loop = 0) {
    const tr = TRACKS[key];
    if (!tr) return;
    this.pending = { ...tr, bpm: tr.bpm + loop * 6, root: tr.root + ((loop * 2) % 7) };
    if (!this.track) { this.track = this.pending; this.pending = null; this.step = 0; }
  }

  // ---------- sequencer ----------
  schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || !this.track) return;
    if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + 0.12) {
      if (this.step % 4 === 0 && this.pending) { this.track = this.pending; this.pending = null; this.step = 0; }
      this.playStep(this.track, this.step, this.nextTime);
      this.nextTime += 60 / this.track.bpm / 4;
      this.step++;
    }
  }

  degreeToMidi(tr, deg) {
    const sc = SCALES[tr.scale];
    const o = Math.floor(deg / 7);
    return tr.root + sc[((deg % 7) + 7) % 7] + 12 * o;
  }

  playStep(tr, step, t) {
    const s = step % 16;
    const bar = Math.floor(step / 16);
    const deg = tr.prog[bar % tr.prog.length];
    const chord = [0, 2, 4, 6].map((k) => this.degreeToMidi(tr, deg + k));
    this.chordTones = chord;
    const stepDur = 60 / tr.bpm / 4;
    this.delay.delayTime.setValueAtTime(stepDur * 3, t);
    if (tr.kick[s] === 'x') { this.kick(t); this.kicks.push(t); if (this.kicks.length > 8) this.kicks.shift(); }
    if (tr.snare && tr.snare[s] === 'x') this.snare(t);
    if (tr.hat && tr.hat[s] === 'x') this.hat(t, s % 4 === 2 ? 0.09 : 0.05);
    const b = tr.bass[s];
    if (b && b !== '.') {
      const m = chord[0] - 24 + (b === 'o' ? 12 : 0) + (b === 'f' ? 7 : 0);
      this.bass(t, mtof(m), stepDur * 1.7);
    }
    if (tr.arp && s % tr.arp.rate === 0) {
      const idx = Math.floor(step / tr.arp.rate) % tr.arp.pat.length;
      const k = tr.arp.pat[idx];
      const m = chord[k % 3] + 12 * Math.floor(k / 3) + 12;
      this.pluck(t, mtof(m), tr.arp.wave, tr.arp.vol, stepDur * tr.arp.rate * 1.4);
    }
    if (tr.pad && s === 0) this.pad(t, chord.slice(0, 3).map(mtof), stepDur * 16, tr.pad);
  }

  env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  kick(t) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(170, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
    this.env(g, t, 0.002, 0.85, 0.34);
    o.connect(g).connect(this.musicBus);
    o.start(t); o.stop(t + 0.4);
  }
  snare(t) {
    const c = this.ctx, n = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    n.buffer = this.noiseBuf;
    f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.7;
    this.env(g, t, 0.001, 0.32, 0.17);
    n.connect(f).connect(g).connect(this.musicBus);
    g.connect(this.verbSend);
    n.start(t, Math.random() * 0.5); n.stop(t + 0.2);
    const o = c.createOscillator(), og = c.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
    this.env(og, t, 0.001, 0.25, 0.09);
    o.connect(og).connect(this.musicBus);
    o.start(t); o.stop(t + 0.12);
  }
  hat(t, v) {
    const c = this.ctx, n = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    n.buffer = this.noiseBuf;
    f.type = 'highpass'; f.frequency.value = 7500;
    this.env(g, t, 0.001, v, 0.04);
    n.connect(f).connect(g).connect(this.musicBus);
    n.start(t, Math.random() * 0.5); n.stop(t + 0.06);
  }
  bass(t, f0, dur) {
    const c = this.ctx, o = c.createOscillator(), o2 = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; o.frequency.value = f0;
    o2.type = 'square'; o2.frequency.value = f0 / 2;
    f.type = 'lowpass'; f.Q.value = 6;
    f.frequency.setValueAtTime(1400, t); f.frequency.exponentialRampToValueAtTime(180, t + 0.16);
    this.env(g, t, 0.004, 0.2, dur);
    o.connect(f); o2.connect(f); f.connect(g).connect(this.musicBus);
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }
  pluck(t, f0, wave, vol, dur) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    o.type = wave; o.frequency.value = f0;
    f.type = 'lowpass'; f.frequency.setValueAtTime(5000, t); f.frequency.exponentialRampToValueAtTime(800, t + dur);
    this.env(g, t, 0.003, vol, dur);
    o.connect(f).connect(g).connect(this.musicBus);
    g.connect(this.delay);
    o.start(t); o.stop(t + dur + 0.05);
  }
  pad(t, freqs, dur, vol) {
    const c = this.ctx, f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'lowpass'; f.frequency.setValueAtTime(500, t); f.frequency.linearRampToValueAtTime(1300, t + dur * 0.5); f.frequency.linearRampToValueAtTime(600, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.05);
    f.connect(g).connect(this.musicBus);
    g.connect(this.verbSend);
    for (const fr of freqs) for (const det of [-9, 9]) {
      const o = c.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = fr; o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + dur * 1.1);
    }
  }

  // ---------- sound effects ----------
  get ok() { return this.ctx && this.ctx.state === 'running'; }
  now() { return this.ctx.currentTime; }

  tone({ f = 440, f1, type = 'sine', vol = 0.2, a = 0.004, d = 0.2, verb = 0.3, t = 0, q, lp }) {
    if (!this.ok) return;
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    const st = c.currentTime + t;
    o.type = type; o.frequency.setValueAtTime(f, st);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, st + a + d);
    this.env(g, st, a, vol, d);
    let node = o;
    if (lp) { const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; if (q) fl.Q.value = q; o.connect(fl); node = fl; }
    node.connect(g).connect(this.sfxBus);
    if (verb) { const s = c.createGain(); s.gain.value = verb; g.connect(s).connect(this.verbSend); }
    o.start(st); o.stop(st + a + d + 0.05);
  }
  noise({ vol = 0.3, d = 0.3, type = 'lowpass', f = 2000, f1, q = 1, a = 0.002, verb = 0.3, t = 0 }) {
    if (!this.ok) return;
    const c = this.ctx, n = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    const st = c.currentTime + t;
    n.buffer = this.noiseBuf; n.loop = true;
    fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f, st);
    if (f1) fl.frequency.exponentialRampToValueAtTime(f1, st + a + d);
    this.env(g, st, a, vol, d);
    n.connect(fl).connect(g).connect(this.sfxBus);
    if (verb) { const s = c.createGain(); s.gain.value = verb; g.connect(s).connect(this.verbSend); }
    n.start(st, Math.random() * 0.5); n.stop(st + a + d + 0.05);
  }
  // A note from the current chord; i climbs through chord tones and octaves.
  note(i = 0, o = {}) {
    const ch = this.chordTones;
    const m = ch[i % 3] + 12 * Math.floor(i / 3) + 12 + (o.oct ?? 0) * 12 + this.transpose;
    this.tone({ f: mtof(m), type: o.type ?? 'triangle', vol: o.vol ?? 0.16, d: o.d ?? 0.35, verb: 0.5 });
    if (o.sparkle) this.tone({ f: mtof(m + 12), type: 'sine', vol: 0.06, d: 0.5, t: 0.05, verb: 0.7 });
  }

  tap() { this.tone({ f: 900, f1: 600, type: 'sine', vol: 0.08, d: 0.06, verb: 0.1 }); }
  place(i) { this.note(i, { sparkle: true }); this.tone({ f: 120, f1: 60, vol: 0.2, d: 0.12, verb: 0 }); }
  drop() { this.tone({ f: 200, f1: 70, type: 'sine', vol: 0.35, d: 0.18, verb: 0.2 }); this.noise({ vol: 0.12, d: 0.08, f: 3000, verb: 0 }); }
  eat(n) { this.note(n, { type: 'square', vol: 0.09, d: 0.22, sparkle: true }); }
  laser() { this.tone({ f: 1400 + Math.random() * 200, f1: 240, type: 'square', vol: 0.045, d: 0.09, verb: 0.15, lp: 3500 }); }
  pew() { this.tone({ f: 1900, f1: 500, type: 'sawtooth', vol: 0.035, d: 0.07, verb: 0.1, lp: 4000 }); }
  boom(size = 1) {
    this.noise({ vol: 0.35 * size, d: 0.25 + 0.4 * size, f: 2600, f1: 90, verb: 0.5 });
    this.tone({ f: 110, f1: 32, type: 'sine', vol: 0.5 * size, d: 0.3 + 0.3 * size, verb: 0.2 });
  }
  hit() { this.tone({ f: 300, f1: 900, type: 'square', vol: 0.06, d: 0.05, verb: 0.1, lp: 3000 }); }
  bounce(i = 0) { this.note(i, { type: 'sine', vol: 0.14, d: 0.2 }); }
  powerup() { [0, 1, 2, 3, 4, 5].forEach((i) => setTimeout(() => this.note(i, { type: 'square', vol: 0.06, d: 0.15 }), i * 45)); }
  lose() {
    this.tone({ f: 440, f1: 55, type: 'sawtooth', vol: 0.18, d: 0.9, verb: 0.5, lp: 1800 });
    this.noise({ vol: 0.3, d: 0.8, f: 1500, f1: 60, verb: 0.6 });
  }
  win() { [0, 1, 2, 3, 4, 5, 6].forEach((i) => this.tone({ f: mtof(this.chordTones[i % 3] + 12 * Math.floor(i / 3) + 12), type: 'triangle', vol: 0.12, d: 0.5, t: i * 0.07, verb: 0.6 })); }
  // Rising whoosh used during morphs.
  riser(dur = 1.6) {
    this.noise({ vol: 0.22, a: dur * 0.85, d: dur * 0.25, type: 'bandpass', f: 300, f1: 6000, q: 2, verb: 0.6 });
    this.tone({ f: 80, f1: 640, type: 'sawtooth', vol: 0.06, a: dur * 0.9, d: 0.2, lp: 2000, verb: 0.5 });
  }
  impact() {
    this.tone({ f: 90, f1: 30, vol: 0.6, d: 0.7, verb: 0.6 });
    this.noise({ vol: 0.25, d: 0.9, f: 5000, f1: 200, verb: 0.8 });
  }
  thrust() { this.noise({ vol: 0.05, d: 0.08, f: 600, verb: 0 }); }
  tick() { this.tone({ f: 2400, type: 'sine', vol: 0.04, d: 0.03, verb: 0.2 }); }
}
