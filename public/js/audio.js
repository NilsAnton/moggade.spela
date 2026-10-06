// Alla ljud syntetiseras med Web Audio – inga ljudfiler behövs.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Sound {
  constructor() {
    this.ctx = null;
    this.vol = 0.7;
  }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.master = ctx.createGain();
    this.master.gain.value = this.vol;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);

    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.verb = ctx.createConvolver();
    this.verb.buffer = this.impulse(1.6, 3);
    const vg = ctx.createGain();
    vg.gain.value = 0.4;
    this.verb.connect(vg).connect(this.master);
  }

  impulse(sec, decay) {
    const rate = this.ctx.sampleRate, len = Math.floor(rate * sec);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  setVolume(v) {
    this.vol = v;
    if (this.master) this.master.gain.value = v;
  }

  out(gain, pan = 0, verb = 0) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = gain;
    const p = ctx.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    g.connect(p).connect(this.master);
    if (verb) {
      const s = ctx.createGain();
      s.gain.value = verb;
      p.connect(s).connect(this.verb);
    }
    return g;
  }

  env(param, t, g0, dur, attack = 0.002) {
    param.setValueAtTime(0.0001, t);
    param.linearRampToValueAtTime(g0, t + attack);
    param.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  noiseHit(dest, t, dur, { type = 'lowpass', f0 = 4000, f1 = 400, q = 0.7, g0 = 1, rate = 1 } = {}) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = rate;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    this.env(g.gain, t, g0, dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 0.5, dur + 0.05);
  }

  tone(dest, t, dur, { type = 'sine', f0 = 440, f1 = f0, g0 = 0.5, attack = 0.002 } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    this.env(g.gain, t, g0, dur, attack);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // dist = 0 betyder ditt eget vapen
  shoot(dist = 0, pan = 0, type = 'rifle') {
    if (!this.ctx) return;
    const v = {
      rifle: { len: 0.17, thump: 160, vol: 1, rate: 0.9 },
      smg: { len: 0.11, thump: 200, vol: 0.75, rate: 1.15 },
      shotgun: { len: 0.35, thump: 110, vol: 1.3, rate: 0.6 },
      sniper: { len: 0.5, thump: 90, vol: 1.5, rate: 0.55 },
      dmr: { len: 0.32, thump: 120, vol: 1.25, rate: 0.7 },
      lmg: { len: 0.2, thump: 130, vol: 1.1, rate: 0.8 },
    }[type] ?? { len: 0.17, thump: 160, vol: 1, rate: 0.9 };
    const t = this.ctx.currentTime;
    const local = dist === 0;
    const gain = (local ? 0.5 : 0.65 / (1 + dist * 0.12)) * v.vol;
    const lp = local ? 9000 : Math.max(900, 7000 - dist * 110);
    const out = this.out(gain, pan, local ? 0.45 : 0.9);
    this.noiseHit(out, t, v.len, { f0: lp, f1: 250, g0: 1, rate: v.rate + Math.random() * 0.2 });
    this.tone(out, t, v.len * 0.8, { f0: v.thump, f1: 38, g0: local ? 1 : 0.6 });
    if (local) this.noiseHit(out, t, 0.03, { type: 'highpass', f0: 3200, f1: 2000, g0: 0.35 });
  }

  slam(dist = 0, pan = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, out = this.out(0.8 / (1 + dist * 0.1), pan, 0.8);
    this.tone(out, t, 0.5, { f0: 120, f1: 30, g0: 1 });
    this.noiseHit(out, t, 0.4, { f0: 2000, f1: 100, g0: 0.8 });
  }

  whoosh() {
    if (!this.ctx) return;
    this.noiseHit(this.out(0.25), this.ctx.currentTime, 0.25, { type: 'bandpass', f0: 600, f1: 2400, q: 1.2 });
  }

  slide() {
    if (!this.ctx) return;
    this.noiseHit(this.out(0.15), this.ctx.currentTime, 0.5, { type: 'lowpass', f0: 1500, f1: 300 });
  }

  stim() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, out = this.out(0.25, 0, 0.4);
    this.tone(out, t, 0.3, { type: 'triangle', f0: 500, f1: 1000, g0: 0.4 });
    this.tone(out, t + 0.12, 0.35, { type: 'sine', f0: 1200, g0: 0.25 });
  }

  bolt() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, out = this.out(0.3);
    this.noiseHit(out, t, 0.06, { type: 'bandpass', f0: 1800, f1: 1400, q: 3 });
    this.noiseHit(out, t + 0.25, 0.06, { type: 'bandpass', f0: 2600, f1: 2000, q: 3 });
  }

  chat() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, out = this.out(0.15);
    this.tone(out, t, 0.06, { type: 'sine', f0: 880, g0: 0.4 });
    this.tone(out, t + 0.07, 0.08, { type: 'sine', f0: 1320, g0: 0.3 });
  }

  hit() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(this.out(0.22), t, 0.05, { type: 'square', f0: 2400, f1: 1800, g0: 0.4 });
  }

  headshot() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, out = this.out(0.3, 0, 0.2);
    this.tone(out, t, 0.25, { type: 'triangle', f0: 1900, g0: 0.5 });
    this.tone(out, t + 0.03, 0.3, { type: 'sine', f0: 2850, g0: 0.3 });
  }

  kill() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, out = this.out(0.3, 0, 0.3);
    this.tone(out, t, 0.12, { type: 'triangle', f0: 880, g0: 0.5 });
    this.tone(out, t + 0.09, 0.3, { type: 'triangle', f0: 1320, g0: 0.5 });
  }

  levelUp() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, out = this.out(0.35, 0, 0.5);
    [523, 659, 784, 1047].forEach((f, i) => this.tone(out, t + i * 0.08, 0.35, { type: 'triangle', f0: f, g0: 0.45 }));
  }

  multi(n = 2) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, out = this.out(0.35, 0, 0.4);
    for (let i = 0; i < Math.min(n, 5); i++) this.tone(out, t + i * 0.07, 0.2, { type: 'square', f0: 660 + i * 220, g0: 0.25 });
  }

  radar() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, out = this.out(0.3, 0, 0.6);
    this.tone(out, t, 0.6, { type: 'sine', f0: 1400, f1: 700, g0: 0.5 });
    this.tone(out, t + 0.15, 0.6, { type: 'sine', f0: 1400, f1: 700, g0: 0.3 });
  }

  armor() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, out = this.out(0.4, 0, 0.3);
    this.tone(out, t, 0.4, { type: 'sawtooth', f0: 90, f1: 180, g0: 0.5 });
    this.noiseHit(out, t, 0.25, { type: 'bandpass', f0: 600, f1: 2400, q: 2, g0: 0.6 });
  }

  heartbeat() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, out = this.out(0.5);
    this.tone(out, t, 0.12, { f0: 70, f1: 45, g0: 0.9 });
    this.tone(out, t + 0.18, 0.12, { f0: 65, f1: 42, g0: 0.6 });
  }

  hurt() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, out = this.out(0.45);
    this.tone(out, t, 0.2, { f0: 110, f1: 55, g0: 0.9 });
    this.noiseHit(out, t, 0.12, { f0: 1200, f1: 200, g0: 0.5 });
  }

  step() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, out = this.out(0.1 + Math.random() * 0.05, (Math.random() - 0.5) * 0.2);
    this.noiseHit(out, t, 0.07, { f0: 900 + Math.random() * 400, f1: 150, g0: 1 });
  }

  jump() {
    if (!this.ctx) return;
    this.noiseHit(this.out(0.1), this.ctx.currentTime, 0.1, { f0: 700, f1: 200 });
  }

  land() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, out = this.out(0.3);
    this.tone(out, t, 0.12, { f0: 90, f1: 40, g0: 0.8 });
    this.noiseHit(out, t, 0.1, { f0: 600, f1: 100 });
  }

  empty() {
    if (!this.ctx) return;
    this.noiseHit(this.out(0.35), this.ctx.currentTime, 0.03, { type: 'bandpass', f0: 3500, f1: 3000, q: 4 });
  }

  reload(scale = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, out = this.out(0.3);
    const click = (at, f) => {
      this.noiseHit(out, t + at * scale, 0.05, { type: 'bandpass', f0: f, f1: f * 0.7, q: 3, g0: 0.9 });
      this.tone(out, t + at * scale, 0.05, { type: 'square', f0: f / 4, f1: f / 6, g0: 0.08 });
    };
    click(0.2, 2200);
    click(0.9, 2600);
    click(1.3, 1800);
    click(1.42, 3000);
  }

  death() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, out = this.out(0.4, 0, 0.6);
    this.tone(out, t, 0.9, { f0: 320, f1: 55, g0: 0.6 });
  }

  spawn() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, out = this.out(0.18, 0, 0.5);
    this.tone(out, t, 0.4, { f0: 300, f1: 900, g0: 0.35, attack: 0.05 });
  }
}
