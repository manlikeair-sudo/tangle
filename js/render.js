/** Fat opaque tubes + tall solid pegs. Pretty and solid, not sketchy. */

const SHADOW = { dx: -16, dy: -14 };
const _pegCache = new Map();
const _ringCache = new Map();

export function clearSpriteCache() {
  _pegCache.clear();
  _ringCache.clear();
}

export function drawBackground(ctx, w, h) {
  const g = ctx.createRadialGradient(w * 0.5, h * 0.48, 10, w * 0.5, h * 0.5, Math.max(w, h) * 0.7);
  g.addColorStop(0, '#F5F8FB');
  g.addColorStop(0.4, '#E5ECF2');
  g.addColorStop(1, '#AEBCCC');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

export function smoothPath(points, subdivisions = 4) {
  if (!points || points.length < 2) return points || [];
  if (points.length === 2) return [points[0], points[1]];
  const out = [];
  const n = points.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i === 0 ? i : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < n ? i + 2 : n - 1];
    for (let s = 0; s < subdivisions; s++) {
      const t = s / subdivisions;
      out.push(catmull(p0, p1, p2, p3, t));
    }
  }
  out.push({ x: points[n - 1].x, y: points[n - 1].y });
  return out;
}

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return {
    x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}

export function drawPegShadow(ctx, peg, r, bodyH) {
  const h = bodyH || r * 1.4;
  const gx = peg.x + SHADOW.dx;
  const gy = peg.y + h * 0.2 + SHADOW.dy;
  const g = ctx.createRadialGradient(gx, gy, r * 0.1, gx, gy, r * 2.8);
  g.addColorStop(0, 'rgba(20,35,55,0.4)');
  g.addColorStop(0.45, 'rgba(20,35,55,0.14)');
  g.addColorStop(1, 'rgba(20,35,55,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(gx, gy, r * 2.4, r * 1.6, -0.5, 0, Math.PI * 2);
  ctx.fill();
}

function getPegSprite(r, bodyH) {
  const key = `peg|${r.toFixed(1)}|${bodyH.toFixed(1)}`;
  if (_pegCache.has(key)) return _pegCache.get(key);
  const pad = 10;
  const w = Math.ceil(r * 2 + pad * 2);
  const h = Math.ceil(bodyH + r * 1.2 + pad * 2);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const cx = w / 2;
  const topY = pad + r * 0.2;
  const baseY = topY + bodyH;

  // SOLID cylinder body (rounded rect)
  const wall = ctx.createLinearGradient(cx - r, 0, cx + r, 0);
  wall.addColorStop(0, '#5E849E');
  wall.addColorStop(0.3, '#9FC3DA');
  wall.addColorStop(0.55, '#D0E6F2');
  wall.addColorStop(0.8, '#8EB0C8');
  wall.addColorStop(1, '#4E708A');
  ctx.fillStyle = wall;
  ctx.fillRect(cx - r, topY, r * 2, bodyH);

  // bottom cap (ellipse)
  ctx.fillStyle = wall;
  ctx.beginPath();
  ctx.ellipse(cx, baseY, r, r * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(30,55,80,0.3)';
  ctx.beginPath();
  ctx.ellipse(cx, baseY, r, r * 0.4, 0, 0, Math.PI);
  ctx.fill();

  // top disk — solid lighter
  const top = ctx.createRadialGradient(cx - r * 0.3, topY - r * 0.3, 1, cx, topY, r);
  top.addColorStop(0, '#F7FBFD');
  top.addColorStop(0.4, '#D3E6F2');
  top.addColorStop(0.75, '#A9CBE0');
  top.addColorStop(1, '#6E92AC');
  ctx.beginPath();
  ctx.arc(cx, topY, r, 0, Math.PI * 2);
  ctx.fillStyle = top;
  ctx.fill();

  // rim
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = Math.max(2.2, r * 0.12);
  ctx.beginPath();
  ctx.arc(cx, topY, r * 0.8, -Math.PI * 0.9, -Math.PI * 0.1);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(40,70,95,0.4)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, topY, r - 0.5, 0, Math.PI * 2);
  ctx.stroke();

  const sprite = { canvas: c, cx, topY, baseY };
  _pegCache.set(key, sprite);
  return sprite;
}


export function drawPeg(ctx, peg, r, bodyH) {
  const h = bodyH || r * 1.4;
  const sp = getPegSprite(r, h);
  // peg.y is ring/base anchor; top of cylinder above it
  ctx.drawImage(sp.canvas, peg.x - sp.cx, peg.y - (sp.baseY - h * 0.08));
}

export function drawRope(ctx, points, color, width, alpha = 1) {
  if (!points || points.length < 2) return;
  const pts = smoothPath(points, 4);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // floor shadow (opaque-ish soft)
  ctx.strokeStyle = 'rgba(20,35,55,0.3)';
  ctx.lineWidth = width * 1.15;
  pathStroke(ctx, pts, SHADOW.dx * 0.28, SHADOW.dy * 0.28);

  // silhouette
  ctx.strokeStyle = color.dark;
  ctx.lineWidth = width + Math.max(5, width * 0.2);
  pathStroke(ctx, pts, 0, 0);

  // body — FULLY opaque
  ctx.strokeStyle = color.hex;
  ctx.lineWidth = width;
  pathStroke(ctx, pts, 0, 0);

  // underside shade (narrower, doesn't punch holes)
  ctx.strokeStyle = shade(color.dark, 0.15);
  ctx.globalAlpha = alpha * 0.45;
  ctx.lineWidth = width * 0.5;
  pathStrokeOffset(ctx, pts, width * 0.15);

  // highlight band
  ctx.strokeStyle = color.light;
  ctx.globalAlpha = alpha * 0.85;
  ctx.lineWidth = width * 0.26;
  pathStrokeOffset(ctx, pts, -width * 0.2);

  // thin specular
  ctx.strokeStyle = '#ffffff';
  ctx.globalAlpha = alpha * 0.55;
  ctx.lineWidth = Math.max(1.5, width * 0.08);
  pathStrokeOffset(ctx, pts, -width * 0.16);

  // clean diagonal twist grooves (not cross-hatch)
  ctx.globalAlpha = alpha * 0.42;
  ctx.strokeStyle = color.dark;
  ctx.lineWidth = Math.max(2.5, width * 0.12);
  const spacing = width * 0.65;
  let dist = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y) || 1e-4;
    const prev = dist;
    dist += seg;
    let d = Math.ceil(prev / spacing) * spacing;
    while (d < dist) {
      const t = (d - prev) / seg;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const half = width * 0.38;
      // single diagonal groove
      ctx.beginPath();
      ctx.moveTo(x + nx * half + dx / len * width * 0.18, y + ny * half + dy / len * width * 0.18);
      ctx.lineTo(x - nx * half - dx / len * width * 0.18, y - ny * half - dy / len * width * 0.18);
      ctx.stroke();
      d += spacing;
    }
  }
  ctx.restore();
}

function shade(hex, amt) {
  // return hex unchanged — used as stroke color
  return hex;
}

function pathStroke(ctx, pts, ox, oy) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x + ox, pts[0].y + oy);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x + ox, pts[i].y + oy);
  ctx.stroke();
}

function pathStrokeOffset(ctx, pts, amount) {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[Math.min(pts.length - 1, i + 1)];
    let dx = p1.x - p0.x, dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy) || 1;
    const x = p.x + (-dy / len) * amount;
    const y = p.y + (dx / len) * amount;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

export function drawRopeOcclusionShadow(ctx, upperPts, lowerPts, width) {
  if (!upperPts || !lowerPts || upperPts.length < 2) return;
  const up = smoothPath(upperPts, 2);
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = 'rgba(15,25,40,0.32)';
  ctx.lineWidth = width * 0.75;
  ctx.lineCap = 'round';
  ctx.beginPath();
  let on = false;
  for (let i = 0; i < up.length; i += 2) {
    const u = up[i];
    let best = 1e9;
    for (let j = 0; j < lowerPts.length; j += 4) {
      const d = Math.hypot(u.x - lowerPts[j].x, u.y - lowerPts[j].y);
      if (d < best) best = d;
    }
    if (best < width * 1.25) {
      if (!on) { ctx.moveTo(u.x + 1.5, u.y + 3.5); on = true; }
      else ctx.lineTo(u.x + 1.5, u.y + 3.5);
    } else if (on) {
      ctx.stroke(); ctx.beginPath(); on = false;
    }
  }
  if (on) ctx.stroke();
  ctx.restore();
}

function getRingSprite(color, radius) {
  const key = `ring|${color.hex}|${radius.toFixed(1)}`;
  if (_ringCache.has(key)) return _ringCache.get(key);
  const pad = Math.ceil(radius * 0.55 + 8);
  const s = Math.ceil(radius * 2 + pad * 2);
  const c = document.createElement('canvas');
  c.width = s; c.height = s;
  const ctx = c.getContext('2d');
  const cx = s / 2, cy = s / 2;
  const outer = radius;
  const inner = radius * 0.4;

  // shadow
  ctx.fillStyle = 'rgba(20,35,55,0.32)';
  ctx.beginPath();
  ctx.ellipse(cx - 3, cy - 2, outer * 1.1, outer * 0.72, 0, 0, Math.PI * 2);
  ctx.fill();

  // torus body
  const g = ctx.createRadialGradient(cx - outer * 0.32, cy - outer * 0.38, 2, cx, cy, outer);
  g.addColorStop(0, color.light);
  g.addColorStop(0.4, color.hex);
  g.addColorStop(0.78, color.hex);
  g.addColorStop(1, color.dark);
  ctx.beginPath();
  ctx.arc(cx, cy, outer, 0, Math.PI * 2);
  ctx.arc(cx, cy, inner, 0, Math.PI * 2, true);
  ctx.fillStyle = g;
  ctx.fill('evenodd');

  // darker rim
  ctx.beginPath();
  ctx.arc(cx, cy, outer - 1, 0, Math.PI * 2);
  ctx.strokeStyle = color.dark;
  ctx.lineWidth = Math.max(2.5, radius * 0.12);
  ctx.stroke();

  // hole
  ctx.beginPath();
  ctx.arc(cx, cy, inner, 0, Math.PI * 2);
  const hole = ctx.createRadialGradient(cx, cy, 0, cx, cy, inner);
  hole.addColorStop(0, 'rgba(10,18,30,0.92)');
  hole.addColorStop(1, 'rgba(25,40,60,0.55)');
  ctx.fillStyle = hole;
  ctx.fill();
  ctx.strokeStyle = color.dark;
  ctx.lineWidth = 2.6;
  ctx.stroke();

  // glossy arc + pip
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = Math.max(2.4, radius * 0.13);
  ctx.beginPath();
  ctx.arc(cx, cy, (outer + inner) * 0.52, -Math.PI * 0.95, -Math.PI * 0.18);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath();
  ctx.ellipse(cx - outer * 0.3, cy - outer * 0.34, radius * 0.15, radius * 0.1, -0.6, 0, Math.PI * 2);
  ctx.fill();

  const sprite = { canvas: c, cx, cy };
  _ringCache.set(key, sprite);
  return sprite;
}

export function drawRing(ctx, x, y, color, radius, squash = 1, alpha = 1) {
  const sp = getRingSprite(color, radius);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  if (squash !== 1) ctx.scale(1 + (1 - squash) * 0.1, squash);
  ctx.drawImage(sp.canvas, -sp.cx, -sp.cy);
  ctx.restore();
}

export function drawPegHighlight(ctx, peg, r, colorHex) {
  ctx.save();
  ctx.strokeStyle = colorHex || '#5BA0FF';
  ctx.lineWidth = 4.5;
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.arc(peg.x, peg.y, r + 12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = colorHex || '#5BA0FF';
  ctx.beginPath();
  ctx.arc(peg.x, peg.y, r + 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export class Particles {
  constructor() { this.list = []; this._pool = []; }
  burst(x, y, color, n = 26) {
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + Math.random() * 0.2;
      const sp = 100 + Math.random() * 240;
      const p = this._pool.pop() || {};
      p.x = x; p.y = y; p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp - 55;
      p.life = 0.5 + Math.random() * 0.28; p.age = 0;
      p.color = color.hex; p.light = color.light;
      p.kind = Math.random() < 0.55 ? '+' : 'spark';
      p.size = 13 + Math.random() * 12; p.rot = Math.random() * Math.PI;
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
    for (let i = 0; i < this.list.length; i++) {
      const p = this.list[i];
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
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.3;
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
