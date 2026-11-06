/** Verlet ropes + rubber-band wrapping around pegs. */

const SEGMENTS = 36;

export function makeRopeState(rope) {
  return {
    id: rope.id, color: rope.color, points: null, z: rope.id,
    wobble: 0, clearing: false, clearT: 0, stretch: 1,
  };
}

/**
 * Build a short, clean polyline that arcs around pegs between A and B.
 * Hard-capped so TubeGeometry never sees scribble noise.
 */
export function wrapPolyline(ax, ay, bx, by, pegs, clearance) {
  // Seed a slack S-curve longer than the chord so ropes drape, not cable-stretch
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const seed = (ax * 0.013 + ay * 0.017 + bx * 0.011) % 1;
  const amp = len * (0.22 + (seed % 0.12));
  let path = [{ x: ax, y: ay }];
  const midN = 5;
  for (let i = 1; i < midN; i++) {
    const t = i / midN;
    const s = Math.sin(t * Math.PI * 2) * Math.sin(t * Math.PI);
    path.push({
      x: ax + dx * t + nx * s * amp,
      y: ay + dy * t + ny * s * amp,
    });
  }
  path.push({ x: bx, y: by });

  for (let pass = 0; pass < 10; pass++) {
    if (path.length > 28) break;
    let changed = false;
    const next = [path[0]];
    for (let i = 0; i < path.length - 1; i++) {
      const p0 = path[i], p1 = path[i + 1];
      let best = null, bestDepth = 0;
      for (const peg of pegs) {
        if (Math.hypot(peg.x - ax, peg.y - ay) < clearance * 0.9) continue;
        if (Math.hypot(peg.x - bx, peg.y - by) < clearance * 0.9) continue;
        // skip pegs that are already near an existing path vertex
        let nearVert = false;
        for (const v of path) {
          if (Math.hypot(v.x - peg.x, v.y - peg.y) < clearance * 0.55) { nearVert = true; break; }
        }
        if (nearVert) continue;
        const depth = segCirclePenetration(p0, p1, peg, clearance);
        if (depth > bestDepth) { bestDepth = depth; best = peg; }
      }
      if (best && bestDepth > 0.8) {
        const t = closestT(p0, p1, best);
        const cx = p0.x + (p1.x - p0.x) * t;
        const cy = p0.y + (p1.y - p0.y) * t;
        let ox = cx - best.x, oy = cy - best.y;
        let ol = Math.hypot(ox, oy) || 1;
        if (ol < 1e-3) {
          ox = -(p1.y - p0.y); oy = (p1.x - p0.x);
          ol = Math.hypot(ox, oy) || 1;
        }
        // outward unit
        const ux = ox / ol, uy = oy / ol;
        const tx = -uy, ty = ux;
        const wx = best.x + ux * clearance;
        const wy = best.y + uy * clearance;
        // Circular-ish wrap: 5 samples on the clearance circle (stable, round bends)
        const base = Math.atan2(uy, ux);
        const half = 1.05; // radians either side
        for (let k = -2; k <= 2; k++) {
          const ang = base + (k / 2) * half;
          next.push({ x: best.x + Math.cos(ang) * clearance, y: best.y + Math.sin(ang) * clearance });
        }
        next.push(p1);
        changed = true;
      } else {
        next.push(p1);
      }
    }
    // merge near-duplicates
    const cleaned = [next[0]];
    for (let i = 1; i < next.length; i++) {
      const prev = cleaned[cleaned.length - 1];
      if (Math.hypot(next[i].x - prev.x, next[i].y - prev.y) > 10) cleaned.push(next[i]);
      else if (i === next.length - 1) cleaned[cleaned.length - 1] = next[i];
    }
    // force ends
    cleaned[0] = { x: ax, y: ay };
    cleaned[cleaned.length - 1] = { x: bx, y: by };
    path = cleaned;
    if (!changed) break;
  }

  // Final arc-length resample to a modest, even set of control points
  return resamplePath(path, Math.min(20, Math.max(6, path.length + 3)));
}

function resamplePath(path, n) {
  if (path.length <= 2) return [{ x: path[0].x, y: path[0].y }, { x: path[path.length - 1].x, y: path[path.length - 1].y }];
  const lens = [0];
  for (let i = 1; i < path.length; i++) {
    lens.push(lens[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
  }
  const total = lens[lens.length - 1] || 1;
  const out = [];
  for (let i = 0; i < n; i++) {
    const target = (i / (n - 1)) * total;
    let j = 1;
    while (j < lens.length - 1 && lens[j] < target) j++;
    const seg = lens[j] - lens[j - 1] || 1;
    const t = (target - lens[j - 1]) / seg;
    out.push({
      x: path[j - 1].x + (path[j].x - path[j - 1].x) * t,
      y: path[j - 1].y + (path[j].y - path[j - 1].y) * t,
    });
  }
  return out;
}

function closestT(a, b, p) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  return Math.max(0, Math.min(1, t));
}

function segCirclePenetration(a, b, peg, r) {
  const t = closestT(a, b, peg);
  const cx = a.x + (b.x - a.x) * t;
  const cy = a.y + (b.y - a.y) * t;
  const d = Math.hypot(cx - peg.x, cy - peg.y);
  return r - d;
}

export function initPoints(rs, ax, ay, bx, by, pegs, clearance) {
  const path = pegs ? wrapPolyline(ax, ay, bx, by, pegs, clearance) : [
    { x: ax, y: ay }, { x: bx, y: by },
  ];
  const lengths = [0];
  for (let i = 1; i < path.length; i++) {
    lengths.push(lengths[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
  }
  const total = lengths[lengths.length - 1] || 1;
  const pts = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const target = (i / SEGMENTS) * total;
    let j = 1;
    while (j < lengths.length - 1 && lengths[j] < target) j++;
    const segLen = lengths[j] - lengths[j - 1] || 1;
    const t = (target - lengths[j - 1]) / segLen;
    const x = path[j - 1].x + (path[j].x - path[j - 1].x) * t;
    const y = path[j - 1].y + (path[j].y - path[j - 1].y) * t;
    pts.push({ x, y, ox: x, oy: y });
  }
  rs.points = pts;
}

function restLen(ax, ay, bx, by, wrapLen, dragging) {
  const direct = Math.hypot(bx - ax, by - ay);
  if (dragging) {
    // Spring/rubber-band while dragging: rest tracks a bit under current span so tension rises
    return Math.max(60, direct * 0.92);
  }
  // Settled: heavy slack — rope is 1.5–1.65× longer than straight peg distance
  const slack = 1.65;
  const target = Math.max(80, direct * slack);
  // Prefer wrapLen if it already has S-bends baked in
  if (wrapLen && wrapLen > direct * 1.2) return Math.max(target, wrapLen * 0.98);
  return target;
}

export function simulateRope(rs, ax, ay, bx, by, pegs, pegR, ropeHalf, dt) {
  if (!rs.points || rs.clearing) return;
  const pts = rs.points;
  const n = pts.length;
  const clearance = pegR + ropeHalf * 2.0 + 2; // arc radius ≥ rope diameter → no tube fold // keep centerline bend ≥ tube radius

  if (!rs._lastA) rs._lastA = { x: ax, y: ay };
  if (!rs._lastB) rs._lastB = { x: bx, y: by };
  const moved = Math.hypot(ax - rs._lastA.x, ay - rs._lastA.y) + Math.hypot(bx - rs._lastB.x, by - rs._lastB.y);
  if (moved > 28) {
    const old = pts.map(p => ({ x: p.x, y: p.y }));
    initPoints(rs, ax, ay, bx, by, pegs, clearance);
    for (let i = 0; i < n; i++) {
      pts[i].x = old[i].x * 0.35 + pts[i].x * 0.65;
      pts[i].y = old[i].y * 0.35 + pts[i].y * 0.65;
      pts[i].ox = pts[i].x; pts[i].oy = pts[i].y;
    }
    rs._lastA = { x: ax, y: ay }; rs._lastB = { x: bx, y: by };
  }

  pts[0].x = ax; pts[0].y = ay; pts[0].ox = ax; pts[0].oy = ay;
  pts[n - 1].x = bx; pts[n - 1].y = by; pts[n - 1].ox = bx; pts[n - 1].oy = by;

  let curLen = 0;
  for (let i = 1; i < n; i++) curLen += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  const totalRest = restLen(ax, ay, bx, by, curLen, rs._dragging);
  const segRest = totalRest / (n - 1);
  rs.stretch = Math.hypot(bx - ax, by - ay) / Math.max(1, totalRest);

  // Spring/rubber-band: lag + settle into S-curves when slack
  const damp = 0.86;
  const g = rs._dragging ? 40 : 55;
  for (let i = 1; i < n - 1; i++) {
    const p = pts[i];
    let vx = (p.x - p.ox) * damp;
    let vy = (p.y - p.oy) * damp;
    p.ox = p.x; p.oy = p.y;
    p.x += vx;
    p.y += vy + g * dt * dt;
  }
  // When settled with slack, gently bias midpoints into a soft S-bend (floor drape)
  if (!rs._dragging && rs.wobble < 0.05) {
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const seed = (rs.id || 0) * 1.7;
    for (let i = 1; i < n - 1; i++) {
      const t = i / (n - 1);
      const sCurve = Math.sin(t * Math.PI * 2 + seed) * Math.sin(t * Math.PI);
      const amp = len * 0.18;
      pts[i].x += nx * sCurve * amp * dt * 2.2;
      pts[i].y += ny * sCurve * amp * dt * 2.2;
    }
  }

  // Softer constraint iterations → stretchy spring feel; more iters on settle
  const iters = (rs._dragging || rs.wobble > 0.15) ? 6 : 14;
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < n - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      let dx = b.x - a.x, dy = b.y - a.y;
      let d = Math.hypot(dx, dy) || 0.0001;
      // Soft spring: allow stretch, pull back gradually
      const stiffness = (rs._dragging) ? 0.28 : 0.52;
      const corr = ((d - segRest) / d) * stiffness;
      if (i === 0) { b.x -= dx * corr; b.y -= dy * corr; }
      else if (i === n - 2) { a.x += dx * corr; a.y += dy * corr; }
      else {
        a.x += dx * corr * 0.5; a.y += dy * corr * 0.5;
        b.x -= dx * corr * 0.5; b.y -= dy * corr * 0.5;
      }
    }
    for (let i = 1; i < n - 1; i++) {
      const p = pts[i];
      for (const peg of pegs) {
        const dx = p.x - peg.x, dy = p.y - peg.y;
        const d = Math.hypot(dx, dy) || 0.0001;
        if (d < clearance) {
          const push = (clearance - d) / d;
          p.x += dx * push;
          p.y += dy * push;
        }
      }
    }
    pts[0].x = ax; pts[0].y = ay;
    pts[n - 1].x = bx; pts[n - 1].y = by;
  }

  if (rs.wobble > 0) {
    const w = rs.wobble;
    for (let i = 1; i < n - 1; i++) {
      const t = i / (n - 1);
      const wave = Math.sin(t * Math.PI * 2.2 + w * 10) * w * 2.5;
      const nx = -(by - ay), ny = (bx - ax);
      const nl = Math.hypot(nx, ny) || 1;
      pts[i].x += (nx / nl) * wave * 0.14;
      pts[i].y += (ny / nl) * wave * 0.14;
    }
    rs.wobble = Math.max(0, w - dt * 3.2);
  }
}

export function impulseWobble(rs, amount = 1) {
  rs.wobble = Math.min(2.2, (rs.wobble || 0) + amount);
}

/** Kick mid-rope velocities for 1–2 damped body oscillations (cap stays pinned). */
export function springKick(rs, strength = 1) {
  if (!rs.points) return;
  const pts = rs.points;
  const n = pts.length;
  for (let i = 1; i < n - 1; i++) {
    const t = i / (n - 1);
    const amp = Math.sin(t * Math.PI) * strength * 18;
    // Lateral kick relative to current end vector
    const ax = pts[0].x, ay = pts[0].y, bx = pts[n - 1].x, by = pts[n - 1].y;
    const nx = -(by - ay), ny = (bx - ax);
    const nl = Math.hypot(nx, ny) || 1;
    pts[i].ox = pts[i].x - (nx / nl) * amp * 0.35;
    pts[i].oy = pts[i].y - (ny / nl) * amp * 0.35;
  }
  rs.wobble = Math.min(2.2, (rs.wobble || 0) + strength * 0.85);
}
