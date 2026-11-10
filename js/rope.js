/**
 * Damped spring-chain ropes (verlet, fixed 120Hz substeps).
 * Elastic rest length stays fixed while dragging so stretch/tension are real.
 */

const SEGMENTS = 28;
export const FIXED_DT = 1 / 120;
const MAX_SUBSTEPS = 4;

export function makeRopeState(rope) {
  return {
    id: rope.id, color: rope.color, bend: rope.bend, path: rope.path || null, points: null, z: rope.id,
    wobble: 0, clearing: false, clearT: 0, stretch: 1,
    elasticRest: 0, tension: 0, _accum: 0,
    _sleeping: false, _stillFrames: 0, _sBiasBaked: false,
  };
}

export function wrapPolyline(ax, ay, bx, by, pegs, clearance) {
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
        let nearVert = false;
        for (const v of path) {
          if (Math.hypot(v.x - peg.x, v.y - peg.y) < clearance * 0.55) { nearVert = true; break; }
        }
        if (nearVert) continue;
        const depth = segCirclePenetration(p0, p1, peg, clearance);
        if (depth > bestDepth) { bestDepth = depth; best = peg; }
      }
      if (best && bestDepth > 0.8) {
        let ox = (p0.x + (p1.x - p0.x) * closestT(p0, p1, best)) - best.x;
        let oy = (p0.y + (p1.y - p0.y) * closestT(p0, p1, best)) - best.y;
        let ol = Math.hypot(ox, oy) || 1;
        if (ol < 1e-3) { ox = -(p1.y - p0.y); oy = (p1.x - p0.x); ol = Math.hypot(ox, oy) || 1; }
        const ux = ox / ol, uy = oy / ol;
        const base = Math.atan2(uy, ux);
        const half = 1.05;
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
    const cleaned = [next[0]];
    for (let i = 1; i < next.length; i++) {
      const prev = cleaned[cleaned.length - 1];
      if (Math.hypot(next[i].x - prev.x, next[i].y - prev.y) > 10) cleaned.push(next[i]);
      else if (i === next.length - 1) cleaned[cleaned.length - 1] = next[i];
    }
    cleaned[0] = { x: ax, y: ay };
    cleaned[cleaned.length - 1] = { x: bx, y: by };
    path = cleaned;
    if (!changed) break;
  }
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
  return Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
}

function segCirclePenetration(a, b, peg, r) {
  const t = closestT(a, b, peg);
  const cx = a.x + (b.x - a.x) * t;
  const cy = a.y + (b.y - a.y) * t;
  return r - Math.hypot(cx - peg.x, cy - peg.y);
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
  // Slack rest ≈ path length (already curved) — fixed elastic length
  const chord = Math.hypot(bx - ax, by - ay);
  rs.elasticRest = Math.max(chord * 1.35, total * 0.98, 90);
  rs.stretch = chord / rs.elasticRest;
  rs._accum = 0;
  rs._alpha = 1;
  rs._stillTime = 0;
  rs._sBiasBaked = true;
  rs._prevPts = pts.map(p => ({ x: p.x, y: p.y }));
  rs._framePts = pts.map(p => ({ x: p.x, y: p.y }));
  rs._lastA = { x: ax, y: ay };
  rs._lastB = { x: bx, y: by };
}

/** Render pose: blend the previous physics step toward the latest one.
 *  Ends stay live so a dragged cap remains 1:1. */
export function displayPoints(rs) {
  const curr = rs && rs.points;
  if (!curr) return null;
  const prev = rs._prevPts;
  const a = (rs._sleeping || !prev || prev.length !== curr.length) ? 1 : (rs._alpha ?? 1);
  if (a >= 0.999) return curr;
  const out = new Array(curr.length);
  for (let i = 0; i < curr.length; i++) {
    if (i === 0 || i === curr.length - 1) {
      out[i] = curr[i];
    } else {
      const q = prev[i];
      out[i] = {
        x: q.x + (curr[i].x - q.x) * a,
        y: q.y + (curr[i].y - q.y) * a,
      };
    }
  }
  return out;
}

function pathLen(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y;
    if (Number.isFinite(dx) && Number.isFinite(dy)) L += Math.hypot(dx, dy);
  }
  return L;
}

function stepOnce(rs, ax, ay, bx, by, pegs, clearance, dt) {
  const pts = rs.points;
  const n = pts.length;
  if (!Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(bx) || !Number.isFinite(by)) return;
  const rest = rs.elasticRest || Math.max(90, Math.hypot(bx - ax, by - ay) * 1.4);
  const segRest = rest / (n - 1);

  // Pin ends
  pts[0].x = ax; pts[0].y = ay; pts[0].ox = ax; pts[0].oy = ay;
  pts[n - 1].x = bx; pts[n - 1].y = by; pts[n - 1].ox = bx; pts[n - 1].oy = by;

  // Heal any NaN midpoints before integrating
  for (let i = 1; i < n - 1; i++) {
    const p = pts[i];
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.ox) || !Number.isFinite(p.oy)) {
      const t = i / (n - 1);
      p.x = ax + (bx - ax) * t;
      p.y = ay + (by - ay) * t;
      p.ox = p.x; p.oy = p.y;
    }
  }

  // Drag keeps soft inertia (rubber lag). Release keeps a fraction of the
  // constraint motion — enough for one small hump, not a traveling wave.
  const dragging = !!rs._dragging;
  const damp = dragging ? 0.972 : 0.62;
  const g = dragging ? 220 : 680;
  for (let i = 1; i < n - 1; i++) {
    const p = pts[i];
    let vx = (p.x - p.ox) * damp;
    let vy = (p.y - p.oy) * damp;
    if (!dragging) {
      const sp = Math.hypot(vx, vy);
      const cap = 6;
      if (sp > cap) { vx *= cap / sp; vy *= cap / sp; }
    }
    p.ox = p.x; p.oy = p.y;
    p.x += vx;
    p.y += vy + g * dt * dt;
  }

  // Soft rubber while dragged; a bit firmer once the finger stops.
  const stiffness = dragging ? 0.22 : 0.5;
  const iters = dragging ? 4 : 6;
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < n - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      let dx = b.x - a.x, dy = b.y - a.y;
      let d = Math.hypot(dx, dy);
      // A collapsed segment has no direction, so the solver thrashes the
      // point beside the pin forever. Open it along the chord.
      if (d < segRest * 0.25) {
        const cdx = bx - ax, cdy = by - ay;
        const cl = Math.hypot(cdx, cdy) || 1;
        if (d < 1e-3) { dx = cdx / cl; dy = cdy / cl; d = 1e-3; }
      }
      // Nonlinear spring: stretch harder beyond rest (rubber)
      const strain = (d - segRest) / segRest;
      const k = stiffness * (1 + Math.max(0, Math.min(2, strain)) * 0.7);
      const corr = Math.max(-0.9, Math.min(0.9, ((d - segRest) / d) * k));
      if (i === 0) { b.x -= dx * corr; b.y -= dy * corr; }
      else if (i === n - 2) { a.x += dx * corr; a.y += dy * corr; }
      else {
        a.x += dx * corr * 0.5; a.y += dy * corr * 0.5;
        b.x -= dx * corr * 0.5; b.y -= dy * corr * 0.5;
      }
    }
    // Peg collision — push out, prevent tunneling
    for (let i = 1; i < n - 1; i++) {
      const p = pts[i];
      for (const peg of pegs) {
        const dx = p.x - peg.x, dy = p.y - peg.y;
        const d = Math.hypot(dx, dy) || 1e-4;
        if (d < clearance) {
          const push = (clearance - d) / d;
          p.x += dx * push;
          p.y += dy * push;
          // Kill inward velocity (via ox/oy)
          const vx = p.x - p.ox, vy = p.y - p.oy;
          const vn = vx * (dx / d) + vy * (dy / d);
          if (vn < 0) {
            p.ox = p.x - (vx - vn * (dx / d));
            p.oy = p.y - (vy - vn * (dy / d));
          }
        }
      }
    }
    // Min bend radius — stop hairpin kinks without demanding a radius the
    // short segments can never satisfy (that fight was a permanent orbit).
    const minBendR = Math.max(segRest * 1.25, Math.min(26, clearance * 0.35));
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < n - 1; i++) {
        const a = pts[i - 1], b = pts[i], c = pts[i + 1];
        const d1 = Math.hypot(b.x - a.x, b.y - a.y) || 1e-6;
        const d2 = Math.hypot(c.x - b.x, c.y - b.y) || 1e-6;
        const d3 = Math.hypot(c.x - a.x, c.y - a.y) || 1e-6;
        const area2 = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
        if (area2 < 1e-4) continue;
        const R = (d1 * d2 * d3) / (2 * area2);
        if (R >= minBendR) continue;
        const mx = (a.x + c.x) * 0.5, my = (a.y + c.y) * 0.5;
        const t = Math.min(0.7, (minBendR - R) / Math.max(1e-3, minBendR));
        b.x += (mx - b.x) * t;
        b.y += (my - b.y) * t;
      }
    }
    pts[0].x = ax; pts[0].y = ay;
    pts[n - 1].x = bx; pts[n - 1].y = by;
  }

  // Drop most of the velocity the solver just created. While dragging we
  // keep it, so the body lags the finger. At rest it would otherwise orbit.
  if (!dragging) {
    const keep = 0.22;
    for (let i = 1; i < n - 1; i++) {
      const p = pts[i];
      const vx = p.x - p.ox, vy = p.y - p.oy;
      p.ox = p.x - vx * keep;
      p.oy = p.y - vy * keep;
    }
  }
  rs.wobble = 0;
}

/**
 * Frame-rate independent spring sim. Returns wall-clock ms spent (for profiling).
 */
const SLEEP_NEED = 16;       // legacy counter kept for debug readers
const WAKE_END_MOVE = 0.8;   // px ends moved → wake

export function wakeRope(rs) {
  if (!rs) return;
  rs._sleeping = false;
  rs._stillFrames = 0;
  rs._stillTime = 0;
  rs._awakeTime = 0;
  rs._sBiasBaked = true;
  if (rs.points) {
    rs._prevPts = rs.points.map(p => ({ x: p.x, y: p.y }));
    rs._alpha = 1;
  }
}

export function simulateRope(rs, ax, ay, bx, by, pegs, pegR, ropeHalf, dt) {
  if (!rs.points || rs.clearing) return 0;
  const t0 = performance.now();
  const pts = rs.points;
  const n = pts.length;
  const clearance = pegR + ropeHalf * 2.0 + 2;

  if (!rs._lastA) rs._lastA = { x: ax, y: ay };
  if (!rs._lastB) rs._lastB = { x: bx, y: by };
  const moved = Math.hypot(ax - rs._lastA.x, ay - rs._lastA.y) + Math.hypot(bx - rs._lastB.x, by - rs._lastB.y);
  // Wake only when an end actually moves or the player is dragging.
  // Internal constraint velocity must not toggle sleep (that was the quiver).
  if (moved > WAKE_END_MOVE || rs._dragging) {
    if (rs._sleeping) wakeRope(rs);
  }
  // Reseed only on large jumps (level load / teleport), blend to avoid pop
  if (moved > 80) {
    const old = pts.map(p => ({ x: p.x, y: p.y }));
    const keepRest = rs.elasticRest;
    initPoints(rs, ax, ay, bx, by, pegs, clearance);
    if (keepRest > 40) rs.elasticRest = keepRest;
    for (let i = 1; i < n - 1; i++) {
      pts[i].x = old[i].x * 0.4 + pts[i].x * 0.6;
      pts[i].y = old[i].y * 0.4 + pts[i].y * 0.6;
      pts[i].ox = pts[i].x; pts[i].oy = pts[i].y;
    }
    pts[0].x = ax; pts[0].y = ay; pts[0].ox = ax; pts[0].oy = ay;
    pts[n - 1].x = bx; pts[n - 1].y = by; pts[n - 1].ox = bx; pts[n - 1].oy = by;
  }
  rs._lastA = { x: ax, y: ay }; rs._lastB = { x: bx, y: by };

  if (!rs.elasticRest || rs.elasticRest < 40) {
    const chord = Math.hypot(bx - ax, by - ay);
    rs.elasticRest = Math.max(90, chord * 1.4);
  }

  // Rest length stays at the captured / wrapped length. Shrinking it toward
  // the straight chord made tangled ropes crush into the pegs and orbit.

  // Sleeping: pin ends only, zero mid velocities, skip constraints (kills 부들부들)
  if (rs._sleeping && !rs._dragging) {
    pts[0].x = ax; pts[0].y = ay; pts[0].ox = ax; pts[0].oy = ay;
    pts[n - 1].x = bx; pts[n - 1].y = by; pts[n - 1].ox = bx; pts[n - 1].oy = by;
    for (let i = 1; i < n - 1; i++) {
      pts[i].ox = pts[i].x;
      pts[i].oy = pts[i].y;
    }
    rs._accum = 0;
    rs._alpha = 1;
    if (rs._prevPts && rs._prevPts.length === n) {
      for (let i = 0; i < n; i++) { rs._prevPts[i].x = pts[i].x; rs._prevPts[i].y = pts[i].y; }
    }
    rs.stretch = Math.max(0.75, Math.min(2.4, (Math.hypot(bx - ax, by - ay) || 1) / Math.max(60, rs.elasticRest || 1)));
    rs._lastA = { x: ax, y: ay }; rs._lastB = { x: bx, y: by };
    return performance.now() - t0;
  }

  // Fixed-dt accumulator. prevPts is the state before the last substep so
  // the renderer can blend across irregular iPad frame times.
  if (!rs._prevPts || rs._prevPts.length !== n) {
    rs._prevPts = pts.map(p => ({ x: p.x, y: p.y }));
  }
  rs._accum = (rs._accum || 0) + Math.min(0.05, Math.max(0, dt));
  let steps = 0;
  while (rs._accum >= FIXED_DT && steps < MAX_SUBSTEPS) {
    for (let i = 0; i < n; i++) { rs._prevPts[i].x = pts[i].x; rs._prevPts[i].y = pts[i].y; }
    stepOnce(rs, ax, ay, bx, by, pegs, clearance, FIXED_DT);
    rs._accum -= FIXED_DT;
    steps++;
  }
  if (rs._accum > FIXED_DT * 2) rs._accum = 0;
  rs._alpha = Math.max(0, Math.min(1, (rs._accum || 0) / FIXED_DT));

  // Sanitize + rein in runaway midpoints BEFORE measuring stretch
  const chordSafe = Math.hypot(bx - ax, by - ay) || 1;
  const maxDev = Math.max(chordSafe * 1.2, 180);
  for (let i = 1; i < n - 1; i++) {
    const p = pts[i];
    const t = i / (n - 1);
    const cx = ax + (bx - ax) * t;
    const cy = ay + (by - ay) * t;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      p.x = cx; p.y = cy; p.ox = cx; p.oy = cy;
      continue;
    }
    const dx = p.x - cx, dy = p.y - cy;
    const d = Math.hypot(dx, dy);
    if (d > maxDev) {
      const s = maxDev / d;
      p.x = cx + dx * s;
      p.y = cy + dy * s;
      p.ox = p.x; p.oy = p.y;
    }
  }

  const cur = pathLen(pts);
  const chord = Math.hypot(bx - ax, by - ay) || 1;
  const rest = Math.max(60, rs.elasticRest || chord * 1.3);
  let stretchVal = cur / rest;
  if (!Number.isFinite(stretchVal) || stretchVal <= 0) stretchVal = chord / rest;
  if (!Number.isFinite(stretchVal) || stretchVal <= 0) stretchVal = 1;
  if (rs._dragging) stretchVal = Math.max(stretchVal, chord / rest);
  rs.stretch = Math.max(0.75, Math.min(2.4, stretchVal));
  if (!rs._dragging) {
    rs.tension = Math.max(0, chord / rest - 0.98);
  }

  // Cap is authoritative: hard-pin first/last every frame (even if no substep ran)
  pts[0].x = ax; pts[0].y = ay; pts[0].ox = ax; pts[0].oy = ay;
  pts[n - 1].x = bx; pts[n - 1].y = by; pts[n - 1].ox = bx; pts[n - 1].oy = by;

  // One-shot: the wrapped rest can be far longer than the drape the pegs
  // actually allow. Fit once so constraints stop inflating collapsed segments.
  // A grabbed rope keeps the rest captured at the finger.
  if (!rs._dragging && !rs._playerTouched && !rs._fitDone) {
    const draped = pathLen(pts);
    if (draped > 50 && draped < rs.elasticRest * 0.82) {
      rs.elasticRest = Math.max(80, draped * 0.995);
      rs._fitDone = true;
      rs._stillTime = 0;
    }
  }

  // Sleep on actual point motion, not on (x-ox). A cancelled constraint
  // fight keeps a large phantom velocity while the picture barely moves,
  // which used to block sleep forever and rebuild the tube every frame.
  let maxD = 0;
  const prevF = rs._framePts;
  if (prevF && prevF.length === n) {
    for (let i = 1; i < n - 1; i++) {
      const d = Math.hypot(pts[i].x - prevF[i].x, pts[i].y - prevF[i].y);
      if (d > maxD) maxD = d;
    }
  }
  rs._framePts = pts.map(p => ({ x: p.x, y: p.y }));
  if (!rs._dragging) {
    rs._awakeTime = (rs._awakeTime || 0) + Math.max(0, dt);
    if (maxD < 0.1) rs._stillTime = (rs._stillTime || 0) + Math.max(0, dt);
    else if (maxD < 0.5) rs._stillTime = (rs._stillTime || 0) + Math.max(0, dt) * 0.7;
    else rs._stillTime = 0;
    // Residual peg orbits must not quiver forever. Freeze after a short settle.
    if (rs._awakeTime > 0.7) rs._stillTime = Math.max(rs._stillTime || 0, 0.1);
    rs._stillFrames = rs._stillTime;
    if (rs._stillTime >= 0.1) {
      rs._sleeping = true;
      rs._sBiasBaked = true;
      rs.wobble = 0;
      rs._accum = 0;
      rs._alpha = 1;
      rs._stillFrames = SLEEP_NEED;
      for (let i = 1; i < n - 1; i++) {
        pts[i].ox = pts[i].x;
        pts[i].oy = pts[i].y;
      }
      if (rs._prevPts && rs._prevPts.length === n) {
        for (let i = 0; i < n; i++) { rs._prevPts[i].x = pts[i].x; rs._prevPts[i].y = pts[i].y; }
      }
    }
  } else {
    rs._stillTime = 0;
    rs._stillFrames = 0;
    rs._awakeTime = 0;
  }

  return performance.now() - t0;
}

export function impulseWobble() {
  // The old call added a 2.5 Hz traveling wave. Release is the constraint
  // spring alone now, so this is intentionally a no-op.
}

/** Small one-shot axial nudge. High settle damping eats it in a single hump. */
export function springKick(rs, strength = 1) {
  if (!rs || !rs.points) return;
  wakeRope(rs);
  const pts = rs.points;
  const n = pts.length;
  const ax = pts[0].x, ay = pts[0].y, bx = pts[n - 1].x, by = pts[n - 1].y;
  const chord = Math.hypot(bx - ax, by - ay) || 1;
  const lx = (bx - ax) / chord, ly = (by - ay) / chord;
  const amp = Math.min(3.5, strength * 2.2);
  for (let i = 1; i < n - 1; i++) {
    const envelope = Math.sin((i / (n - 1)) * Math.PI);
    pts[i].ox -= lx * amp * envelope;
    pts[i].oy -= ly * amp * envelope;
  }
  rs.wobble = 0;
}

/** Capture elastic rest at grab so stretch builds from a real baseline. */
export function captureRest(rs, ax, ay, bx, by) {
  if (!rs.points) return;
  wakeRope(rs);
  const L = pathLen(rs.points);
  const chord = Math.hypot(bx - ax, by - ay) || 80;
  // Rest ≈ current chord with modest slack — stretch builds as you pull away
  const fromPath = Number.isFinite(L) ? L * 0.85 : chord * 1.2;
  rs.elasticRest = Math.max(80, Math.min(chord * 1.55, Math.max(fromPath, chord * 1.12)));
  rs.stretch = 1;
  rs.tension = 0;
}
