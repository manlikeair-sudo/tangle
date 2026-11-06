/** 2D segment intersection helpers for rope clear detection. */

export function segIntersect(a0, a1, b0, b1) {
  const ax = a1.x - a0.x, ay = a1.y - a0.y;
  const bx = b1.x - b0.x, by = b1.y - b0.y;
  const den = ax * by - ay * bx;
  if (Math.abs(den) < 1e-9) return null;
  const dx = b0.x - a0.x, dy = b0.y - a0.y;
  const t = (dx * by - dy * bx) / den;
  const u = (dx * ay - dy * ax) / den;
  if (t < 0.02 || t > 0.98 || u < 0.02 || u > 0.98) return null;
  return { x: a0.x + t * ax, y: a0.y + t * ay, t, u };
}

function nearPeg(p, pegs, r) {
  for (const peg of pegs) {
    if (Math.hypot(p.x - peg.x, p.y - peg.y) < r) return true;
  }
  return false;
}

/** True if polylines A and B cross (ignoring segments near either rope's end pegs). */
export function polylinesCross(ptsA, ptsB, pegsA, pegsB, ignoreR) {
  if (!ptsA || !ptsB || ptsA.length < 2 || ptsB.length < 2) return false;
  for (let i = 0; i < ptsA.length - 1; i++) {
    const a0 = ptsA[i], a1 = ptsA[i + 1];
    if (nearPeg(a0, pegsA, ignoreR) && nearPeg(a1, pegsA, ignoreR)) continue;
    for (let j = 0; j < ptsB.length - 1; j++) {
      const b0 = ptsB[j], b1 = ptsB[j + 1];
      if (nearPeg(b0, pegsB, ignoreR) && nearPeg(b1, pegsB, ignoreR)) continue;
      if (segIntersect(a0, a1, b0, b1)) return true;
    }
  }
  return false;
}

/** Does rope i cross any other active rope? */
export function ropeIsCrossed(ropeIndex, ropeStates, getPolyline, getEndPegs, ignoreR, skipDraggedId) {
  const rs = ropeStates[ropeIndex];
  if (!rs || rs.clearing) return false;
  const ptsA = getPolyline(rs);
  const pegsA = getEndPegs(rs);
  if (!ptsA || ptsA.length < 2) return false;
  for (let j = 0; j < ropeStates.length; j++) {
    if (j === ropeIndex) continue;
    const other = ropeStates[j];
    if (!other || other.clearing) continue;
    if (skipDraggedId != null && other.id === skipDraggedId) continue;
    const ptsB = getPolyline(other);
    const pegsB = getEndPegs(other);
    if (polylinesCross(ptsA, ptsB, pegsA, pegsB, ignoreR)) return true;
  }
  return false;
}
