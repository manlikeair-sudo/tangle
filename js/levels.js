/**
 * Solvable levels: place untangled ropes, scramble by legal moves.
 * Capacity 1 (one magnetic cap per peg). Extra empty pegs for moves.
 * Clear rule is "no crossings" (checked at runtime) — start must have 0 free ropes.
 */
import { polylinesCross } from './crossing.js';

export const COLORS = [
  { name: 'red', hex: '#E8302A', dark: '#961F1B', light: '#E9403B' },
  { name: 'blue', hex: '#1E5BFF', dark: '#133BA5', light: '#3068FF' },
  { name: 'cyan', hex: '#18C8F0', dark: '#0F829C', light: '#2ACCF1' },
  { name: 'lime', hex: '#8EE01C', dark: '#5C9112', light: '#97E22E' },
  { name: 'green', hex: '#1FA24A', dark: '#146930', light: '#30A958' },
  { name: 'orange', hex: '#FF9A12', dark: '#A5640B', light: '#FFA224' },
  { name: 'purple', hex: '#7A2CF0', dark: '#4F1C9C', light: '#843CF1' },
  { name: 'salmon', hex: '#F4A98A', dark: '#9E6D59', light: '#F4AF93' },
  { name: 'brown', hex: '#6B2A1E', dark: '#451B13', light: '#763B30' },
  { name: 'teal', hex: '#0E9C8C', dark: '#09655B', light: '#21A395' },
  { name: 'navy', hex: '#1B2050', dark: '#111434', light: '#2D315E' },
  { name: 'yellow', hex: '#FFC21A', dark: '#A57E10', light: '#FFC62C' },
];

export const LEVEL_COUNT = 12;

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clusterLayout(n, seed = 1) {
  const rng = mulberry32(seed);
  // Compact hex packing — target cluster ~0.55–0.62 of board after normalize
  const spacing = 0.112; // tighter cluster like reference
  const pts = [];
  pts.push({ x: 0, y: 0 });
  let ring = 1;
  while (pts.length < n) {
    for (let s = 0; s < 6 && pts.length < n; s++) {
      for (let i = 0; i < ring && pts.length < n; i++) {
        const ang = (s * Math.PI / 3) + (i / ring) * (Math.PI / 3) + rng() * 0.04;
        const r = ring * spacing * (0.97 + rng() * 0.04);
        pts.push({
          x: Math.cos(ang) * r * 1.0,
          y: Math.sin(ang) * r * 0.95,
        });
      }
    }
    ring++;
    if (ring > 8) break;
  }
  for (let iter = 0; iter < 50; iter++) {
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      let dx = pts[j].x - pts[i].x, dy = pts[j].y - pts[i].y;
      let d = Math.hypot(dx, dy) || 0.001;
      if (d < spacing * 0.92) {
        const push = (spacing * 0.92 - d) * 0.5;
        dx /= d; dy /= d;
        pts[i].x -= dx * push; pts[i].y -= dy * push;
        pts[j].x += dx * push; pts[j].y += dy * push;
      }
    }
  }
  // Normalize into centered [0.18..0.82] box so cluster fills ~0.64 of board
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const spanX = Math.max(0.001, maxX - minX);
  const spanY = Math.max(0.001, maxY - minY);
  const span = Math.max(spanX, spanY);
  const target = 0.88; // fill board so screen cluster ≈ 0.60 W
  for (const p of pts) {
    p.x = 0.5 + ((p.x - (minX + maxX) * 0.5) / span) * target;
    p.y = 0.5 + ((p.y - (minY + maxY) * 0.5) / span) * target;
    p.x = clamp(p.x, 0.14, 0.86);
    p.y = clamp(p.y, 0.14, 0.86);
  }
  return pts.slice(0, n);
}

function pegDist(a, b) {
  return Math.hypot(a.nx - b.nx, a.ny - b.ny);
}

/** Straight polyline between two pegs in normalized space (for crossing check during gen). */
function normLine(pa, pb) {
  return [{ x: pa.nx, y: pa.ny }, { x: pb.nx, y: pb.ny }];
}

function endsOf(pegs, ropeId) {
  const out = [];
  for (const peg of pegs) {
    peg.stack.forEach((cap, si) => {
      if (cap.ropeId === ropeId) out.push({ peg, si });
    });
  }
  return out;
}

function countCrossings(pegs, ropes) {
  let n = 0;
  const lines = ropes.map(r => {
    const e = endsOf(pegs, r.id);
    if (e.length < 2) return null;
    return {
      pts: normLine(e[0].peg, e[1].peg),
      pegs: [e[0].peg, e[1].peg],
    };
  });
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]) continue;
    for (let j = i + 1; j < lines.length; j++) {
      if (!lines[j]) continue;
      if (polylinesCross(lines[i].pts, lines[j].pts, lines[i].pegs, lines[j].pegs, 0.08)) n++;
    }
  }
  return n;
}

function anyFreeRope(pegs, ropes) {
  const lines = ropes.map(r => {
    const e = endsOf(pegs, r.id);
    if (e.length < 2) return null;
    return { id: r.id, pts: normLine(e[0].peg, e[1].peg), pegs: [e[0].peg, e[1].peg] };
  });
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]) continue;
    let crossed = false;
    for (let j = 0; j < lines.length; j++) {
      if (i === j || !lines[j]) continue;
      if (polylinesCross(lines[i].pts, lines[j].pts, lines[i].pegs, lines[j].pegs, 0.08)) {
        crossed = true; break;
      }
    }
    if (!crossed) return true;
  }
  return false;
}

/** Hand-placed stand-in for the reference's level 201. Shown on first load. */
function showcaseLevel() {
  const C = {
    peach: { name: 'peach', hex: '#E8B59A', dark: '#8C5A48', light: '#F3D2C2' },
    cyan: { name: 'cyan', hex: '#3EC8F6', dark: '#1478A0', light: '#8EE4FF' },
    red: { name: 'red', hex: '#E23B34', dark: '#8E1E1A', light: '#FF7A72' },
    blue: { name: 'blue', hex: '#2E6BFF', dark: '#163A9A', light: '#7AA4FF' },
    maroon: { name: 'maroon', hex: '#8E322C', dark: '#4E1614', light: '#C45A52' },
    green: { name: 'green', hex: '#2E9B48', dark: '#145C28', light: '#6ED48A' },
    gold: { name: 'gold', hex: '#F0C23A', dark: '#8A6A10', light: '#FFE08A' },
    lime: { name: 'lime', hex: '#7ED321', dark: '#3E7A10', light: '#C6F27A' },
    navy: { name: 'navy', hex: '#24315C', dark: '#101628', light: '#5A6A9A' },
    orange: { name: 'orange', hex: '#F0922A', dark: '#8A4E10', light: '#FFC47A' },
    purple: { name: 'purple', hex: '#6E46E8', dark: '#3A2088', light: '#B49AFF' },
    brown: { name: 'brown', hex: '#6B3A2E', dark: '#3A1C16', light: '#A86A58' },
  };
  // Positions traced from the reference start frame, in board 0..1.
  const raw = [
    [0.495, 0.095], [0.772, 0.336], [0.508, 0.351], [0.246, 0.358],
    [0.398, 0.486], [0.636, 0.493], [0.743, 0.644], [0.286, 0.648],
    [0.492, 0.651], [0.508, 0.908], [0.620, 0.180], [0.300, 0.200],
    [0.860, 0.400], [0.140, 0.470], [0.560, 0.780], [0.700, 0.820],
    [0.280, 0.840], [0.420, 0.180], [0.580, 0.550], [0.400, 0.720],
    [0.740, 0.520], [0.160, 0.700], [0.600, 0.360], [0.340, 0.360],
    [0.860, 0.680], [0.140, 0.280],
  ];
  const pegs = raw.map((p, i) => ({
    id: i, nx: p[0], ny: p[1], capacity: 1, stack: [],
  }));
  const ropes = [
    { id: 0, color: C.peach, ends: [13, 0], bend: 1 },
    { id: 1, color: C.cyan, ends: [11, 12], bend: -1 },
    { id: 2, color: C.red, ends: [10, 15], bend: 1 },
    { id: 3, color: C.blue, ends: [1, 6], bend: 1 },
    { id: 4, color: C.maroon, ends: [25, 7], bend: -1 },
    { id: 5, color: C.green, ends: [4, 9], bend: 1 },
    { id: 6, color: C.gold, ends: [17, 5], bend: -1 },
    { id: 7, color: C.lime, ends: [16, 24], bend: 1 },
    { id: 8, color: C.purple, ends: [21, 14], bend: 1 },
    { id: 9, color: C.navy, ends: [3, 2], bend: -1 },
    { id: 10, color: C.orange, ends: [23, 20], bend: 1 },
    { id: 11, color: C.brown, ends: [19, 8], bend: -1 },
  ];
  for (const r of ropes) {
    pegs[r.ends[0]].stack.push({ ropeId: r.id, end: 0 });
    pegs[r.ends[1]].stack.push({ ropeId: r.id, end: 1 });
  }
  return {
    pegs,
    ropes: ropes.map(r => ({ id: r.id, color: r.color, bend: r.bend, clearing: false, clearT: 0, freeT: 0 })),
    difficulty: 'HARD',
    seconds: 180,
    displayLevel: 201,
    showcase: true,
  };
}

export function generateLevel(levelIndex) {
  if (levelIndex === 0) return showcaseLevel();
  const rng = mulberry32(3000 + levelIndex * 97);
  // 10+ levels, up to ~10 ropes on HARD
  // 12 levels: 3 → ~10 ropes; always leave empty pegs for moves
  const ropeTable = [3, 4, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10];
  const ropeCount = ropeTable[Math.min(levelIndex, ropeTable.length - 1)];
  // 1–3 empty pegs inside the cluster (enough for moves, not sparse edges)
  const emptyPegs = levelIndex < 3 ? 3 : levelIndex < 7 ? 2 : 2;
  const pegCount = ropeCount * 2 + emptyPegs;
  const capacity = 1; // one magnetic cap per peg top
  const seconds = Math.max(90, 210 - levelIndex * 8);

  const pegs = clusterLayout(pegCount, 40 + levelIndex * 19).map((p, i) => ({
    id: i, nx: p.x, ny: p.y, capacity, stack: [],
  }));

  // Place ropes untangled: pair nearest available pegs without creating crossings
  const ropes = [];
  let colorIdx = (levelIndex * 2) % COLORS.length;
  const used = new Set();
  for (let r = 0; r < ropeCount; r++) {
    let best = null, bestD = 1e9;
    for (let i = 0; i < pegs.length; i++) {
      if (used.has(i)) continue;
      for (let j = i + 1; j < pegs.length; j++) {
        if (used.has(j)) continue;
        const d = pegDist(pegs[i], pegs[j]);
        if (d < 0.12 || d > 0.55) continue;
        // Tentative: would this cross existing?
        const pts = normLine(pegs[i], pegs[j]);
        let crosses = false;
        for (const existing of ropes) {
          const e = endsOf(pegs, existing.id);
          if (e.length < 2) continue;
          if (polylinesCross(pts, normLine(e[0].peg, e[1].peg), [pegs[i], pegs[j]], [e[0].peg, e[1].peg], 0.08)) {
            crosses = true; break;
          }
        }
        if (crosses) continue;
        if (d < bestD) { bestD = d; best = [i, j]; }
      }
    }
    if (!best) {
      // fallback: any two free pegs
      const free = pegs.map((_, i) => i).filter(i => !used.has(i));
      if (free.length < 2) break;
      best = [free[0], free[1]];
    }
    const color = COLORS[colorIdx % COLORS.length];
    colorIdx++;
    pegs[best[0]].stack.push({ ropeId: r, end: 0 });
    pegs[best[1]].stack.push({ ropeId: r, end: 1 });
    used.add(best[0]); used.add(best[1]);
    ropes.push({ id: r, color, clearing: false, clearT: 0, freeT: 0 });
  }

  // Scramble: move caps onto empty pegs to create crossings
  const moves = 30 + ropeCount * 12 + levelIndex * 8;
  for (let m = 0; m < moves; m++) {
    const occupied = pegs.filter(p => p.stack.length > 0);
    const empty = pegs.filter(p => p.stack.length === 0);
    if (!occupied.length || !empty.length) break;
    const src = occupied[Math.floor(rng() * occupied.length)];
    // Prefer empty pegs that are 1.5–3.5 spacings away (creates tangle)
    empty.sort((a, b) => {
      const score = (p) => {
        const d = pegDist(p, src) / 0.145;
        if (d >= 1.5 && d <= 3.5) return Math.abs(d - 2.4);
        return 5 + Math.abs(d - 2.4);
      };
      return score(a) - score(b);
    });
    const dest = empty[Math.floor(rng() * Math.min(3, empty.length))];
    dest.stack.push(src.stack.pop());
  }

  // Ensure at least 2 empty pegs: if scramble filled everything, undo last moves onto a reserved empty
  let empties = pegs.filter(p => p.stack.length === 0);
  // Reserve empties by not using more than pegCount - emptyPegs occupied slots
  const maxOccupied = pegs.length - Math.max(2, emptyPegs);
  while (pegs.filter(p => p.stack.length > 0).length > maxOccupied) {
    // Find a peg that has a cap whose other end's peg can absorb? Just move a random cap
    // onto... we need an empty. If none, we over-placed — merge by moving one stack's cap
    // onto a peg that already has capacity? capacity is 1, so create empty by temporarily
    // holding — actually capacity 1 means occupied == number of caps == ropeCount*2.
    // So pegCount MUST be > ropeCount*2. Guaranteed by construction above.
    break;
  }
  empties = pegs.filter(p => p.stack.length === 0);
  if (empties.length < 2) {
    // Emergency: add virtual empty by expanding? shouldn't happen
    console.warn('level gen: fewer than 2 empties', empties.length);
  }

  // Ensure 0 free ropes at start: keep legal-scrambling until tangled
  for (let guard = 0; guard < 80 && anyFreeRope(pegs, ropes); guard++) {
    const occupied = pegs.filter(p => p.stack.length > 0);
    const empty = pegs.filter(p => p.stack.length === 0);
    if (!occupied.length || !empty.length) break;
    // Prefer moves that increase crossings: try a few candidates
    let bestSrc = null, bestDest = null, bestCross = countCrossings(pegs, ropes);
    for (let tryN = 0; tryN < 12; tryN++) {
      const src = occupied[Math.floor(rng() * occupied.length)];
      if (!src.stack.length) continue;
      const dest = empty[Math.floor(rng() * empty.length)];
      const cap = src.stack.pop();
      dest.stack.push(cap);
      const c = countCrossings(pegs, ropes);
      const free = anyFreeRope(pegs, ropes);
      if (!free && c >= bestCross) {
        bestCross = c; bestSrc = null; bestDest = null; // keep
        break;
      }
      if (c > bestCross) { bestCross = c; bestSrc = src; bestDest = dest; }
      // revert
      dest.stack.pop();
      src.stack.push(cap);
      if (bestSrc === src) { bestSrc = null; }
    }
    if (bestSrc && bestDest) {
      // already applied if we broke early; else apply best
      if (bestSrc.stack.length) bestDest.stack.push(bestSrc.stack.pop());
    } else if (anyFreeRope(pegs, ropes)) {
      // random move as fallback
      const src = occupied[Math.floor(rng() * occupied.length)];
      const dest = empty[Math.floor(rng() * empty.length)];
      if (src.stack.length) dest.stack.push(src.stack.pop());
    }
  }
  // Last resort: if still free, add a long crossing by swapping two distant ends
  if (anyFreeRope(pegs, ropes)) {
    const occupied = pegs.filter(p => p.stack.length > 0);
    const empty = pegs.filter(p => p.stack.length === 0);
    for (let k = 0; k < 20 && anyFreeRope(pegs, ropes) && empty.length; k++) {
      occupied.sort((a, b) => pegDist(a, empty[0]) - pegDist(b, empty[0]));
      const src = occupied[occupied.length - 1];
      const dest = empty[0];
      if (src.stack.length) dest.stack.push(src.stack.pop());
      empty.splice(0, 1);
      if (!src.stack.length) empty.push(src);
    }
  }

  const difficulty = levelIndex < 3 ? 'EASY' : levelIndex < 7 ? 'MED' : 'HARD';
  return {
    index: levelIndex, pegs, ropes, capacity, seconds, difficulty,
    crossings: countCrossings(pegs, ropes),
  };
}
