/** WebAudio bus — iOS Safari unlock on first pointerup/touchend. */
export class AudioBus {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.unlocked = false;
    this.clearStreak = 0;
    this._master = null;
    this._silentEl = null;
  }

  /** Call from the first user gesture (prefer pointerup/touchend). */
  unlock() {
    if (this.unlocked && this.ctx && this.ctx.state === 'running') return;
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch (_) {}

    // HTMLAudio silent loop fallback (helps some iOS paths)
    try {
      if (!this._silentEl) {
        this._silentEl = new Audio(
          'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA='
        );
        this._silentEl.loop = true;
        this._silentEl.volume = 0.01;
      }
      const p = this._silentEl.play();
      if (p && p.catch) p.catch(() => {});
    } catch (_) {}

    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!this.ctx) {
      this.ctx = new AC();
      this._master = this.ctx.createGain();
      this._master.gain.value = this.muted ? 0 : 0.6;
      this._master.connect(this.ctx.destination);
    }
    // 1-sample silent buffer kick
    try {
      const b = this.ctx.createBuffer(1, 1, this.ctx.sampleRate || 22050);
      const s = this.ctx.createBufferSource();
      s.buffer = b;
      s.connect(this._master);
      s.start(0);
    } catch (_) {}
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.unlocked = true;
  }

  setMuted(m) {
    this.muted = !!m;
    if (this._master) this._master.gain.value = m ? 0 : 0.6;
  }

  _env(g, t0, a, d, s, r, peak = 1) {
    const p = g.gain;
    p.cancelScheduledValues(t0);
    p.setValueAtTime(0.0001, t0);
    p.exponentialRampToValueAtTime(peak, t0 + a);
    p.exponentialRampToValueAtTime(Math.max(0.0002, peak * s), t0 + a + d);
    p.exponentialRampToValueAtTime(0.0001, t0 + a + d + r);
  }

  pickup() {
    if (!this.unlocked || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(880, t);
    o.frequency.exponentialRampToValueAtTime(520, t + 0.07);
    this._env(g, t, 0.004, 0.03, 0.25, 0.06, 0.2);
    o.connect(g); g.connect(this._master);
    o.start(t); o.stop(t + 0.12);
    this.clearStreak = 0;
  }


  /** Soft magnetic "pop" on lift-off — muted ASMR click */
  pop() {
    if (!this.unlocked || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(620, t);
    o.frequency.exponentialRampToValueAtTime(280, t + 0.07);
    this._env(g, t, 0.002, 0.025, 0.35, 0.06, 0.11);
    o.connect(g); g.connect(this._master);
    o.start(t); o.stop(t + 0.11);
  }

  /** Crisp magnet "탁" — low thump + high tick */
  snap() {
    if (!this.unlocked || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    // Low thump
    const o1 = c.createOscillator();
    const g1 = c.createGain();
    o1.type = 'sine';
    o1.frequency.setValueAtTime(140, t);
    o1.frequency.exponentialRampToValueAtTime(55, t + 0.09);
    this._env(g1, t, 0.001, 0.03, 0.25, 0.07, 0.7);
    o1.connect(g1); g1.connect(this._master);
    o1.start(t); o1.stop(t + 0.15);
    // Mid body
    const o3 = c.createOscillator();
    const g3 = c.createGain();
    o3.type = 'triangle';
    o3.frequency.setValueAtTime(320, t);
    o3.frequency.exponentialRampToValueAtTime(160, t + 0.05);
    this._env(g3, t, 0.001, 0.02, 0.2, 0.04, 0.35);
    o3.connect(g3); g3.connect(this._master);
    o3.start(t); o3.stop(t + 0.1);
    // Soft high tick (no harsh square)
    const o2 = c.createOscillator();
    const g2 = c.createGain();
    o2.type = 'sine';
    o2.frequency.setValueAtTime(1400, t);
    o2.frequency.exponentialRampToValueAtTime(480, t + 0.045);
    this._env(g2, t, 0.001, 0.015, 0.2, 0.04, 0.14);
    o2.connect(g2); g2.connect(this._master);
    o2.start(t); o2.stop(t + 0.09);
  }

  /** Pretty "퐁" — rising pitch on combo */

  /** Soft rubbery stretch whisper — ASMR, not harsh creak. Throttled. */
  stretch(tension) {
    if (!this.unlocked || this.muted) return;
    const now = performance.now();
    if (this._stretchAt && now - this._stretchAt < 95) return;
    this._stretchAt = now;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    const f = c.createBiquadFilter();
    o.type = 'triangle'; // softer than sawtooth
    const ten = Math.max(0, Math.min(1.5, tension));
    o.frequency.setValueAtTime(110 + ten * 140, t);
    o.frequency.linearRampToValueAtTime(130 + ten * 180, t + 0.07);
    f.type = 'lowpass';
    f.frequency.value = 320 + ten * 380;
    f.Q.value = 0.9;
    const peak = 0.007 + ten * 0.014;
    this._env(g, t, 0.012, 0.04, 0.5, 0.07, peak);
    o.connect(f); f.connect(g); g.connect(this._master);
    o.start(t); o.stop(t + 0.14);
  }

  /** Soft boing recoil — warm lingering spring, ASMR not cartoon. */
  boing(tension = 0.4) {
    if (!this.unlocked || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    const ten = Math.max(0.15, Math.min(1.4, tension));
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(220 + ten * 100, t);
    o.frequency.exponentialRampToValueAtTime(110 + ten * 30, t + 0.32);
    this._env(g, t, 0.004, 0.06, 0.45, 0.28, 0.10 + ten * 0.07);
    o.connect(g); g.connect(this._master);
    o.start(t); o.stop(t + 0.42);
    // Soft harmonic bloom
    const o2 = c.createOscillator();
    const g2 = c.createGain();
    o2.type = 'sine';
    o2.frequency.setValueAtTime(330 + ten * 120, t);
    o2.frequency.exponentialRampToValueAtTime(150, t + 0.22);
    this._env(g2, t, 0.003, 0.05, 0.35, 0.18, 0.035 + ten * 0.03);
    o2.connect(g2); g2.connect(this._master);
    o2.start(t); o2.stop(t + 0.32);
  }

  clear() {
    if (!this.unlocked || this.muted) return;
    this.clearStreak = (this.clearStreak || 0) + 1;
    const c = this.ctx, t = c.currentTime;
    const base = 520 + Math.min(8, this.clearStreak) * 55;
    [0, 0.06].forEach((off, i) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(base * (i ? 1.5 : 1), t + off);
      o.frequency.exponentialRampToValueAtTime(base * (i ? 1.2 : 0.85), t + off + 0.18);
      this._env(g, t + off, 0.005, 0.06, 0.4, 0.14, i ? 0.22 : 0.38);
      o.connect(g); g.connect(this._master);
      o.start(t + off); o.stop(t + off + 0.28);
    });
    const nLen = Math.floor(c.sampleRate * 0.07);
    const buf = c.createBuffer(1, nLen, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < nLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / nLen, 2.2);
    const src = c.createBufferSource(); src.buffer = buf;
    const ng = c.createGain();
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 2800; bp.Q.value = 1.6;
    this._env(ng, t, 0.001, 0.02, 0.25, 0.05, 0.14);
    src.connect(bp); bp.connect(ng); ng.connect(this._master);
    src.start(t);
  }

  win() {
    if (!this.unlocked || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'triangle';
      const ti = t + i * 0.11;
      o.frequency.setValueAtTime(f, ti);
      this._env(g, ti, 0.01, 0.1, 0.5, 0.22, 0.32);
      o.connect(g); g.connect(this._master);
      o.start(ti); o.stop(ti + 0.4);
    });
    this.clearStreak = 0;
  }

  fail() {
    if (!this.unlocked || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(300, t);
    o.frequency.exponentialRampToValueAtTime(120, t + 0.3);
    this._env(g, t, 0.01, 0.12, 0.4, 0.2, 0.22);
    o.connect(g); g.connect(this._master);
    o.start(t); o.stop(t + 0.45);
  }
}
