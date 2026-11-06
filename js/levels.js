/** Compact clustered pegs + moderate wrapping ropes. Solvable via scramble-from-solved. */

export const COLORS = [
  { name: 'lime',   hex: '#8BE33A', dark: '#4A9A12', light: '#C8FF7A' },
  { name: 'purple', hex: '#8A3CF0', dark: '#4E12A8', light: '#C49BFF' },
  { name: 'cyan',   hex: '#2EC8F0', dark: '#0A7AA8', light: '#9AE0FF' },
  { name: 'red',    hex: '#F0383A', dark: '#9A1010', light: '#FF8A8A' },
  { name: 'orange', hex: '#F7A823', dark: '#B86800', light: '#FFD08A' },
  { name: 'peach',  hex: '#F2B48E', dark: '#C87848', light: '#FFE0C8' },
  { name: 'green',  hex: '#1E9A4E', dark: '#0A5A28', light: '#6AD08A' },
  { name: 'blue',   hex: '#2457E0', dark: '#1428A0', light: '#8AA4FF' },
  { name: 'maroon', hex: '#8E2E2A', dark: '#5A1815', light: '#C87870' },
  { name: 'navy',   hex: '#2B2F55', dark: '#141828', light: '#6A70A0' },
];

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Hex-ish packed cluster filling ~60% of board width.
 * Center-to-center ≈ 2.2× peg diameter.
 */
function clusterLayout(n, seed = 1) {
  const rng = mulberry32(seed);
  // Screen spacing ≈ 0.175 W with boardW≈0.78W → norm spacing ≈ 0.224
  // (= ~3.2× peg diameter 0.055W)
  const spacing = 0.224;
  const pts = [];
  // axial hex rings
  pts.push({ x: 0.5, y: 0.5 });
  let ring = 1;
  while (pts.length < n) {
    for (let s = 0; s < 6 && pts.length < n; s++) {
      for (let i = 0; i < ring && pts.length < n; i++) {
        const ang = (s * Math.PI / 3) + (i / ring) * (Math.PI / 3) + rng() * 0.08;
        const r = ring * spacing * (0.95 + rng() * 0.08);
        pts.push({
          x: 0.5 + Math.cos(ang) * r * 1.08,
          y: 0.5 + Math.sin(ang) * r * 1.0,
        });
      }
    }
    ring++;
    if (ring > 8) break;
  }
  // settle
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
    for (const p of pts) {
      p.x = clamp(p.x, 0.14, 0.86);
      p.y = clamp(p.y, 0.16, 0.86);
    }
  }
  return pts.slice(0, n);
}

function pegDist(a, b) {
  return Math.hypot(a.nx - b.nx, a.ny - b.ny);
}

export function generateLevel(levelIndex) {
  const rng = mulberry32(2000 + levelIndex * 131);
  const ropeCount = levelIndex === 0 ? 6
    : levelIndex === 1 ? 7
    : Math.min(8 + Math.floor(levelIndex * 0.5), 11);
  const pegCount = Math.min(10 + Math.floor(ropeCount * 0.4), 14);
  const capacity = levelIndex < 2 ? 4 : 3;
  const seconds = Math.max(90, 200 - levelIndex * 10);

  const pegs = clusterLayout(pegCount, 70 + levelIndex * 17).map((p, i) => ({
    id: i, nx: p.x, ny: p.y, capacity, stack: [],
  }));

  const ropes = [];
  let colorIdx = (levelIndex * 3) % COLORS.length;
  const pegOrder = pegs.map((_, i) => i);
  for (let i = pegOrder.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pegOrder[i], pegOrder[j]] = [pegOrder[j], pegOrder[i]];
  }
  let pi = 0;
  for (let r = 0; r < ropeCount; r++) {
    let placed = false;
    for (let k = 0; k < pegs.length; k++) {
      const peg = pegs[pegOrder[(pi + k) % pegs.length]];
      if (peg.stack.length + 2 <= peg.capacity) {
        const color = COLORS[colorIdx % COLORS.length];
        colorIdx++;
        peg.stack.push({ ropeId: r, end: 0 });
        peg.stack.push({ ropeId: r, end: 1 });
        ropes.push({ id: r, color, clearing: false, clearT: 0 });
        placed = true;
        pi = (pi + k + 1) % pegs.length;
        break;
      }
    }
    if (!placed) break;
  }

  // Scramble: prefer 2–3.5 spacing hops so ropes weave through neighbors
  // (fat S-curves / wrap halfway around pegs) without spanning the board.
  const spacing = 0.224;
  const moves = 90 + ropeCount * 22 + levelIndex * 12;
  for (let m = 0; m < moves; m++) {
    const sources = pegs.filter(p => p.stack.length > 0);
    if (!sources.length) break;
    const src = sources[Math.floor(rng() * sources.length)];
    const ring = src.stack[src.stack.length - 1];
    const dests = pegs.filter(p => p.id !== src.id && p.stack.length < p.capacity);
    if (!dests.length) continue;
    // Ideal: 2–3.5 spacings (cross 1–2 neighbor pegs)
    dests.sort((a, b) => {
      const score = (p) => {
        const d = pegDist(p, src) / spacing;
        if (d >= 2.2 && d <= 3.8) return Math.abs(d - 3.0); // best — cross 1–2 pegs
        if (d >= 1.6 && d < 2.2) return 1.5 + Math.abs(d - 1.9);
        if (d > 3.8 && d <= 5.5) return 3 + (d - 3.8);
        return 9 + Math.abs(d - 3.0);
      };
      return score(a) - score(b);
    });
    const pool = Math.max(1, Math.min(5, dests.length));
    const pick = dests[Math.floor(rng() * pool)];
    src.stack.pop();
    pick.stack.push(ring);
  }

  // Ensure no rope starts solved (adjacent on same peg) — move to a NEARBY peg
  for (let guard = 0; guard < 100; guard++) {
    let fixed = false;
    const endsOf = {};
    for (const peg of pegs) {
      peg.stack.forEach((ring, si) => {
        if (!endsOf[ring.ropeId]) endsOf[ring.ropeId] = [];
        endsOf[ring.ropeId].push({ peg, si, ring });
      });
    }
    for (const rope of ropes) {
      const ends = endsOf[rope.id] || [];
      if (ends.length !== 2) continue;
      const [e0, e1] = ends;
      if (e0.peg.id === e1.peg.id && Math.abs(e0.si - e1.si) === 1) {
        const peg = e0.peg;
        while (peg.stack.length) {
          const top = peg.stack[peg.stack.length - 1];
          const dests = pegs.filter(p => p.id !== peg.id && p.stack.length < p.capacity);
          if (!dests.length) break;
          dests.sort((a, b) => {
            const sa = Math.abs(pegDist(a, peg) / spacing - 2.4);
            const sb = Math.abs(pegDist(b, peg) / spacing - 2.4);
            return sa - sb;
          });
          peg.stack.pop();
          dests[0].stack.push(top);
          if (top.ropeId === rope.id) break;
          if (peg.stack.length <= Math.min(e0.si, e1.si)) break;
        }
        fixed = true;
      }
    }
    if (!fixed) break;
  }

  // Prefer fewer empty pegs: pull a free ring onto empty pegs from crowded ones
  for (let pass = 0; pass < 24; pass++) {
    const empty = pegs.filter(p => p.stack.length === 0);
    const crowded = pegs.filter(p => p.stack.length >= 2);
    if (!empty.length || !crowded.length) break;
    const dest = empty[Math.floor(rng() * empty.length)];
    // Prefer a source whose top ring's other end is nearby → more wraps later
    crowded.sort((a, b) => pegDist(a, dest) - pegDist(b, dest));
    const src = crowded[0];
    const ring = src.stack.pop();
    dest.stack.push(ring);
  }

  return { index: levelIndex, pegs, ropes, capacity, seconds,
    difficulty: levelIndex < 2 ? 'EASY' : levelIndex < 5 ? 'MED' : 'HARD' };
}

export const LEVEL_COUNT = 8;
