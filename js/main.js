import { AudioBus } from './audio.js';
import { generateLevel, LEVEL_COUNT } from './levels.js';
import { makeRopeState, initPoints, simulateRope, impulseWobble, wrapPolyline } from './rope.js';
import { Scene3D } from './scene3d.js';
import { Particles } from './particles2d.js';

const canvas = document.getElementById('game');
const fxCanvas = document.getElementById('fx');
const fx = fxCanvas.getContext('2d');
const audio = new AudioBus();
const particles = new Particles();
const scene = new Scene3D(canvas);

let W = 0, H = 0, dpr = 1;
let boardW = 0, boardH = 0, boardOX = 0, boardOY = 0;
let levelIdx = 0;
let level = null;
let ropeStates = [];
let pegs = [];
let coins = 0;
let timeLeft = 180;
let running = false;
let dragging = null;
let snapAnims = [];
let hapticOn = true;
let lastTs = 0;
let winShown = false;

let PEG_R = 28, RING_R = 22, ROPE_W = 26, SNAP_DIST = 56, STACK_LIFT = 6;

function updateScale() {
  // Hit/physics sizes from screen-width fractions (match visuals)
  PEG_R = W * 0.055 * 0.5;
  ROPE_W = W * 0.045;
  RING_R = W * 0.07 * 0.5;
  SNAP_DIST = RING_R * 2.6;
  STACK_LIFT = Math.max(4, W * 0.008);
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  fxCanvas.width = Math.floor(W * dpr);
  fxCanvas.height = Math.floor(H * dpr);
  fxCanvas.style.width = W + 'px';
  fxCanvas.style.height = H + 'px';
  fx.setTransform(dpr, 0, 0, dpr, 0, 0);
  scene.resize(W, H, dpr);
  updateScale();
  layoutPegs();
}
window.addEventListener('resize', resize);

function layoutPegs() {
  if (!level) return;
  // Board ≈ 0.78 W so hex spacing 0.224 → ~0.175 W centers; cluster ~0.6 W
  boardW = Math.min(W * 0.78, H * 0.58);
  boardH = boardW * (0.7 / 0.6); // taller than wide to allow ~0.7W cluster height
  boardH = Math.min(boardH, H * 0.62);
  boardOX = (W - boardW) / 2;
  const hudReserve = Math.max(130, H * 0.14);
  // Center cluster slightly below middle
  boardOY = hudReserve + Math.max(0, (H - hudReserve - boardH) * 0.42);
  for (const p of pegs) {
    p.x = boardOX + p.nx * boardW;
    p.y = boardOY + p.ny * boardH;
  }
  scene.setBoardLayout(boardOX, boardOY, boardW, boardH);
}

function loadLevel(idx) {
  levelIdx = idx;
  level = generateLevel(idx);
  pegs = level.pegs.map(p => ({
    ...p,
    stack: p.stack.map(s => ({ ...s })),
    x: 0, y: 0,
  }));
  layoutPegs();
  ropeStates = level.ropes.map(r => makeRopeState(r));
  syncRopeEndsFromStacks();
  const clear = PEG_R + ROPE_W * 0.7 + 6;
  for (const rs of ropeStates) {
    const ends = endPositions(rs.id);
    if (ends) initPoints(rs, ends[0].x, ends[0].y, ends[1].x, ends[1].y, pegs, clear);
  }
  for (let s = 0; s < 24; s++) {
    for (const rs of ropeStates) {
      const ends = endPositions(rs.id);
      if (!ends || !rs.points) continue;
      simulateRope(rs, ends[0].x, ends[0].y, ends[1].x, ends[1].y, pegs, PEG_R, ROPE_W * 0.5, 1 / 60);
    }
  }
  timeLeft = level.seconds;
  running = true;
  winShown = false;
  dragging = null;
  snapAnims = [];
  document.getElementById('hud-level').textContent = String(idx + 1);
  document.getElementById('win-overlay').classList.add('hidden');
  document.getElementById('fail-overlay').classList.add('hidden');
  const diff = document.getElementById('pill-diff');
  const dIcon = document.getElementById('diff-icon');
  const dText = document.getElementById('diff-text');
  if (level.difficulty === 'EASY') {
    dIcon.textContent = '😺'; dText.textContent = 'EASY';
    diff.style.background = 'linear-gradient(180deg,#6EE7B7,#059669 55%,#047857)';
  } else if (level.difficulty === 'MED') {
    dIcon.textContent = '😼'; dText.textContent = 'MED';
    diff.style.background = 'linear-gradient(180deg,#FCD34D,#D97706 55%,#B45309)';
  } else {
    dIcon.textContent = '😈'; dText.textContent = 'HARD';
    diff.style.background = 'linear-gradient(180deg,#C084FC,#7C3AED 55%,#6D28D9)';
  }
  updateTimerHud();
  scene.syncPegs(pegs);
}

function syncRopeEndsFromStacks() {
  for (const rs of ropeStates) {
    const found = [null, null];
    for (const peg of pegs) {
      peg.stack.forEach((ring, si) => {
        if (ring.ropeId === rs.id) found[ring.end] = { pegId: peg.id, stackIndex: si };
      });
    }
    rs._ends = found;
  }
}

function endPositions(ropeId) {
  const rs = ropeStates.find(r => r.id === ropeId);
  if (!rs || !rs._ends) return null;
  const out = [];
  for (let e = 0; e < 2; e++) {
    if (dragging && dragging.ropeId === ropeId && dragging.end === e) {
      out.push({ x: dragging.x, y: dragging.y, pegId: -1, stackIndex: -1 });
      continue;
    }
    const anim = snapAnims.find(a => a.ropeId === ropeId && a.end === e);
    if (anim) {
      const u = Math.min(1, anim.t / anim.dur);
      const t = anim.elastic ? easeOutBack(u) : easeOutSnap(u);
      out.push({
        x: anim.from.x + (anim.to.x - anim.from.x) * t,
        y: anim.from.y + (anim.to.y - anim.from.y) * t,
        pegId: anim.pegId, stackIndex: -1, snapping: true, squash: anim.squash,
      });
      continue;
    }
    const info = rs._ends[e];
    if (!info || info.pegId < 0) { out.push({ x: 0, y: 0 }); continue; }
    const peg = pegs[info.pegId];
    out.push({
      x: peg.x, y: peg.y - info.stackIndex * STACK_LIFT,
      pegId: peg.id, stackIndex: info.stackIndex,
    });
  }
  return out;
}

function easeOutBack(t) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
function easeOutSnap(t) { return 1 - Math.pow(1 - t, 4); }
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

function ringWorldPos(peg, stackIndex) {
  return { x: peg.x, y: peg.y - stackIndex * STACK_LIFT };
}
function topRingAt(peg) {
  if (!peg.stack.length) return null;
  return peg.stack[peg.stack.length - 1];
}
function pegAt(x, y) {
  let best = null, bestD = SNAP_DIST;
  for (const peg of pegs) {
    const d = Math.hypot(peg.x - x, peg.y - y);
    if (d < bestD) { bestD = d; best = peg; }
  }
  return best;
}
function findGrabbable(x, y) {
  let best = null, bestD = RING_R + Math.max(32, RING_R * 1.2);
  for (const peg of pegs) {
    const top = topRingAt(peg);
    if (!top) continue;
    const rs = ropeStates.find(r => r.id === top.ropeId);
    if (!rs || rs.clearing) continue;
    const pos = ringWorldPos(peg, peg.stack.length - 1);
    const d = Math.hypot(pos.x - x, pos.y - y);
    if (d < bestD) {
      bestD = d;
      best = { peg, ring: top, pos, ropeId: top.ropeId, end: top.end };
    }
  }
  return best;
}
function haptic(ms = 8) {
  if (!hapticOn) return;
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch (_) {}
}
function pointerPos(e) {
  const t = e.touches ? e.touches[0] : e;
  return { x: t.clientX, y: t.clientY };
}

function onDown(e) {
  e.preventDefault();
  audio.unlock();
  if (!running || winShown) return;
  const { x, y } = pointerPos(e);
  const g = findGrabbable(x, y);
  if (!g) return;
  g.peg.stack.pop();
  syncRopeEndsFromStacks();
  dragging = {
    ropeId: g.ropeId, end: g.end,
    x: g.pos.x, y: g.pos.y,
    fromPeg: g.peg.id,
    originX: g.pos.x, originY: g.pos.y,
  };
  const rs = ropeStates.find(r => r.id === g.ropeId);
  if (rs) rs.z = Math.max(...ropeStates.map(r => r.z)) + 1;
  audio.pickup();
  haptic(6);
}
function onMove(e) {
  e.preventDefault();
  if (!dragging) return;
  const { x, y } = pointerPos(e);
  dragging.x += (x - dragging.x) * 0.92;
  dragging.y += (y - dragging.y) * 0.92;
}
function onUp(e) {
  e.preventDefault();
  if (!dragging) return;
  let peg = pegAt(dragging.x, dragging.y);
  let valid = !!(peg && peg.stack.length < peg.capacity);
  if (!valid) {
    peg = pegs[dragging.fromPeg];
    if (!peg || peg.stack.length >= peg.capacity) {
      peg = pegs.find(p => p.stack.length < p.capacity) || pegs[0];
    }
  }
  const target = ringWorldPos(peg, peg.stack.length);
  snapAnims.push({
    ropeId: dragging.ropeId, end: dragging.end,
    from: { x: dragging.x, y: dragging.y },
    to: { x: target.x, y: target.y },
    t: 0, dur: valid ? 0.11 : 0.22,
    pegId: peg.id, squash: 1,
    pendingRing: { ropeId: dragging.ropeId, end: dragging.end },
    elastic: !valid,
  });
  dragging = null;
}

canvas.addEventListener('mousedown', onDown);
canvas.addEventListener('mousemove', onMove);
window.addEventListener('mouseup', onUp);
canvas.addEventListener('touchstart', onDown, { passive: false });
canvas.addEventListener('touchmove', onMove, { passive: false });
canvas.addEventListener('touchend', onUp, { passive: false });
canvas.addEventListener('touchcancel', onUp, { passive: false });

function finishSnap(anim) {
  const peg = pegs[anim.pegId];
  peg.stack.push(anim.pendingRing);
  syncRopeEndsFromStacks();
  const rs = ropeStates.find(r => r.id === anim.ropeId);
  if (rs) impulseWobble(rs, 1);
  audio.snap();
  haptic(12);
  checkClears();
}
function flushSnaps() {
  if (!snapAnims.length) return false;
  const pending = snapAnims.splice(0);
  for (const a of pending) finishSnap(a);
  return true;
}

function checkClears() {
  for (const rs of ropeStates) {
    if (rs.clearing) continue;
    const ends = rs._ends;
    if (!ends || !ends[0] || !ends[1]) continue;
    if (ends[0].pegId < 0 || ends[1].pegId < 0) continue;
    if (ends[0].pegId !== ends[1].pegId) continue;
    const peg = pegs[ends[0].pegId];
    const i0 = ends[0].stackIndex, i1 = ends[1].stackIndex;
    if (Math.abs(i0 - i1) !== 1) continue;
    startClear(rs, peg, Math.min(i0, i1));
  }
}
function startClear(rs, peg, lowIndex) {
  rs.clearing = true;
  rs.clearT = 0;
  peg.stack.splice(lowIndex, 2);
  syncRopeEndsFromStacks();
  const pos = ringWorldPos(peg, lowIndex);
  particles.burst(pos.x, pos.y, rs.color, 24);
  audio.clear();
  haptic([10, 30, 10]);
  coins += 10;
  document.getElementById('coin-val').textContent = formatCoins(coins);
}
function formatCoins(n) {
  if (n >= 10000) return (n / 1000).toFixed(2).replace(/\.?0+$/, '') + 'K';
  if (n >= 1000) return (n / 1000).toFixed(2) + 'K';
  return String(n);
}
function updateTimerHud() {
  const s = Math.max(0, Math.ceil(timeLeft));
  const m = Math.floor(s / 60), r = s % 60;
  document.getElementById('hud-timer').textContent =
    `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}
function checkWin() {
  if (ropeStates.every(r => r.clearing && r.clearT >= 0.5)) {
    if (!winShown) {
      winShown = true;
      running = false;
      const bonus = Math.max(20, Math.floor(timeLeft) * 2);
      coins += bonus;
      document.getElementById('coin-val').textContent = formatCoins(coins);
      document.getElementById('win-level').textContent = String(levelIdx + 1);
      document.getElementById('win-coins').textContent = String(bonus);
      document.getElementById('win-overlay').classList.remove('hidden');
      audio.win();
    }
  }
}

function tick(ts) {
  const dt = Math.min(0.033, (ts - lastTs) / 1000 || 0.016);
  lastTs = ts;

  if (running) {
    timeLeft -= dt;
    if (timeLeft <= 0) {
      timeLeft = 0; running = false;
      document.getElementById('fail-overlay').classList.remove('hidden');
      audio.fail();
    }
    updateTimerHud();
  }

  for (const anim of snapAnims) {
    anim.t += dt;
    const u = Math.min(1, anim.t / anim.dur);
    if (u > 0.85) anim.squash = 0.82 + (u - 0.85) / 0.15 * 0.18;
    else anim.squash = 1;
  }
  const finished = snapAnims.filter(a => a.t >= a.dur);
  snapAnims = snapAnims.filter(a => a.t < a.dur);
  for (const a of finished) finishSnap(a);

  for (const rs of ropeStates) {
    if (rs.clearing) rs.clearT += dt;
  }

  for (const rs of ropeStates) {
    if (rs.clearing && rs.clearT > 0.55) continue;
    const ends = endPositions(rs.id);
    if (!ends) continue;
    if (!rs.points) {
      initPoints(rs, ends[0].x, ends[0].y, ends[1].x, ends[1].y, pegs, PEG_R + ROPE_W * 0.7 + 6);
    }
    simulateRope(rs, ends[0].x, ends[0].y, ends[1].x, ends[1].y, pegs, PEG_R, ROPE_W * 0.5, dt);
  }

  particles.update(dt);
  checkWin();

  // 3D scene sync
  scene.syncPegs(pegs);
  // Fresh rubber-band wrap paths for clean TubeGeometry
  const wrapClear = PEG_R + ROPE_W * 0.85 + 8;
  for (const rs of ropeStates) {
    if (rs.clearing) continue;
    const ends = endPositions(rs.id);
    if (!ends) continue;
    rs._wrapPath = wrapPolyline(ends[0].x, ends[0].y, ends[1].x, ends[1].y, pegs, wrapClear);
  }
  scene.syncRopes(ropeStates, endPositions);

  if (dragging) {
    const rs = ropeStates.find(r => r.id === dragging.ropeId);
    const near = pegAt(dragging.x, dragging.y);
    if (near && near.stack.length < near.capacity) {
      scene.setHighlight(near, rs?.color.hex);
    } else {
      scene.setHighlight(null);
    }
    scene.setDragRing({ x: dragging.x, y: dragging.y }, rs?.color || { hex: '#888', dark: '#444', light: '#ccc' });
  } else {
    scene.setHighlight(null);
    scene.setDragRing(null);
  }

  scene.render();
  particles.draw(fx);
  requestAnimationFrame(tick);
}

document.getElementById('btn-settings').onclick = () => {
  audio.unlock();
  document.getElementById('settings-panel').classList.remove('hidden');
};
document.getElementById('btn-close-settings').onclick = () => {
  document.getElementById('settings-panel').classList.add('hidden');
};
document.getElementById('toggle-sound').onchange = (e) => {
  audio.unlock();
  audio.setMuted(!e.target.checked);
};
document.getElementById('toggle-haptic').onchange = (e) => { hapticOn = e.target.checked; };
document.getElementById('btn-restart').onclick = () => {
  document.getElementById('settings-panel').classList.add('hidden');
  loadLevel(levelIdx);
};
document.getElementById('btn-next').onclick = () => {
  loadLevel(Math.min(levelIdx + 1, LEVEL_COUNT - 1));
};
document.getElementById('btn-retry').onclick = () => loadLevel(levelIdx);

resize();
loadLevel(0);
requestAnimationFrame(tick);

function dragRingToPeg(fromPegId, toPegId) {
  const peg = pegs[fromPegId];
  if (!peg || !peg.stack.length) return false;
  const ring = peg.stack.pop();
  const dest = pegs[toPegId];
  if (!dest || dest.stack.length >= dest.capacity) {
    peg.stack.push(ring); return false;
  }
  dest.stack.push(ring);
  syncRopeEndsFromStacks();
  const rs = ropeStates.find(r => r.id === ring.ropeId);
  if (rs) {
    rs.z = Math.max(...ropeStates.map(r => r.z)) + 1;
    impulseWobble(rs, 1);
  }
  audio.snap();
  checkClears();
  return true;
}

window.__tangle = {
  loadLevel, pegs: () => pegs, ropes: () => ropeStates,
  dragRingToPeg, flushSnaps, audio, coins: () => coins, timeLeft: () => timeLeft,
  checkClears, syncRopeEndsFromStacks, scene,
  measure: () => scene.measureScreenFractions(pegs),
};
