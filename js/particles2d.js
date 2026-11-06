/** Lightweight 2D particle overlay (on #fx canvas). */
export class Particles {
  constructor() { this.list = []; this._pool = []; }
  burst(x, y, color, n = 22) {
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + Math.random() * 0.2;
      const sp = 110 + Math.random() * 260;
      const p = this._pool.pop() || {};
      p.x = x; p.y = y; p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp - 60;
      p.life = 0.45 + Math.random() * 0.3; p.age = 0;
      // Mostly white sparkles with a few rope-colored flashes
      p.color = Math.random() < 0.7 ? '#FFFFFF' : (color?.hex || '#fff');
      p.kind = Math.random() < 0.4 ? '+' : '*';
      p.size = 10 + Math.random() * 16; p.rot = Math.random() * Math.PI;
      this.list.push(p);
    }
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += 260 * dt; p.vx *= 0.98;
      if (p.age >= p.life) { this._pool.push(p); this.list.splice(i, 1); }
    }
  }
  draw(ctx) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    for (const p of this.list) {
      const t = 1 - p.age / p.life;
      ctx.save();
      ctx.globalAlpha = Math.min(1, t * 1.2);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot + p.age * 5);
      if (p.kind === '+') {
        ctx.fillStyle = p.color;
        ctx.font = `bold ${p.size}px Fredoka, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('+', 0, 0);
      } else {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.2;
        const s = p.size * 0.4;
        ctx.beginPath();
        ctx.moveTo(-s, 0); ctx.lineTo(s, 0);
        ctx.moveTo(0, -s); ctx.lineTo(0, s);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}
