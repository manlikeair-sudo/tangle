/** Soft, cute WebAudio sounds — prettier than the reference pops. */
export class AudioBus {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.unlocked = false;
    this.clearStreak = 0;
    this._master = null;
  }

  unlock() {
    if (this.unlocked) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this._master = this.ctx.createGain();
    this._master.gain.value = 0.55;
    this._master.connect(this.ctx.destination);
    // silent buffer kick for iOS
    const b = this.ctx.createBuffer(1, 1, 22050);
    const s = this.ctx.createBufferSource();
    s.buffer = b; s.connect(this._master); s.start(0);
    this.unlocked = true;
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = !!m;
    if (this._master) this._master.gain.value = m ? 0 : 0.55;
  }

  _env(g, t0, a, d, s, r, peak = 1) {
    const p = g.gain;
    p.cancelScheduledValues(t0);
    p.setValueAtTime(0.0001, t0);
    p.exponentialRampToValueAtTime(peak, t0 + a);
    p.exponentialRampToValueAtTime(Math.max(0.0002, peak * s), t0 + a + d);
    p.exponentialRampToValueAtTime(0.0001, t0 + a + d + r);
  }

  /** Soft tick/pluck when picking up a ring */
  pickup() {
    if (!this.unlocked || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(720, t);
    o.frequency.exponentialRampToValueAtTime(480, t + 0.08);
    this._env(g, t, 0.005, 0.04, 0.3, 0.08, 0.22);
    o.connect(g); g.connect(this._master);
    o.start(t); o.stop(t + 0.15);
    this.clearStreak = 0;
  }

  /** Soft bubbly pop with slight pitch drop — magnet snap onto peg */
  snap() {
    if (!this.unlocked || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    // soft thud body
    const o1 = c.createOscillator();
    const g1 = c.createGain();
    o1.type = 'sine';
    o1.frequency.setValueAtTime(220, t);
    o1.frequency.exponentialRampToValueAtTime(110, t + 0.12);
    this._env(g1, t, 0.004, 0.05, 0.35, 0.1, 0.35);
    o1.connect(g1); g1.connect(this._master);
    o1.start(t); o1.stop(t + 0.2);
    // bubble click
    const o2 = c.createOscillator();
    const g2 = c.createGain();
    o2.type = 'sine';
    o2.frequency.setValueAtTime(880, t);
    o2.frequency.exponentialRampToValueAtTime(420, t + 0.07);
    this._env(g2, t, 0.002, 0.03, 0.2, 0.06, 0.18);
    o2.connect(g2); g2.connect(this._master);
    o2.start(t); o2.stop(t + 0.12);
  }

  /** Bright pleasant pong-pong on rope clear; rises with streak */
  clear() {
    if (!this.unlocked || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    const base = 523.25 * Math.pow(1.05946, Math.min(this.clearStreak, 5)); // C5 up
    this.clearStreak++;
    const notes = [base, base * 1.25, base * 1.5];
    notes.forEach((f, i) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = i === 2 ? 'triangle' : 'sine';
      const ti = t + i * 0.055;
      o.frequency.setValueAtTime(f, ti);
      o.frequency.exponentialRampToValueAtTime(f * 1.04, ti + 0.12);
      this._env(g, ti, 0.008, 0.08, 0.4, 0.22, 0.28 - i * 0.04);
      // soft lowpass for sweetness
      const f2 = c.createBiquadFilter();
      f2.type = 'lowpass'; f2.frequency.value = 3200;
      o.connect(f2); f2.connect(g); g.connect(this._master);
      o.start(ti); o.stop(ti + 0.4);
    });
    // tiny sparkle noise burst
    const nLen = Math.floor(c.sampleRate * 0.08);
    const buf = c.createBuffer(1, nLen, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < nLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / nLen, 2);
    const src = c.createBufferSource(); src.buffer = buf;
    const ng = c.createGain();
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 2;
    this._env(ng, t, 0.001, 0.02, 0.3, 0.06, 0.12);
    src.connect(bp); bp.connect(ng); ng.connect(this._master);
    src.start(t);
  }

  /** Happy short jingle on level clear */
  win() {
    if (!this.unlocked || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    const melody = [523.25, 659.25, 783.99, 1046.5];
    melody.forEach((f, i) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'triangle';
      const ti = t + i * 0.12;
      o.frequency.setValueAtTime(f, ti);
      this._env(g, ti, 0.01, 0.1, 0.5, 0.25, 0.3);
      o.connect(g); g.connect(this._master);
      o.start(ti); o.stop(ti + 0.45);
    });
    this.clearStreak = 0;
  }

  fail() {
    if (!this.unlocked || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(320, t);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.35);
    this._env(g, t, 0.01, 0.15, 0.4, 0.25, 0.25);
    o.connect(g); g.connect(this._master);
    o.start(t); o.stop(t + 0.5);
  }
}
