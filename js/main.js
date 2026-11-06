import { AudioBus } from './audio.js';
import { generateLevel, LEVEL_COUNT } from './levels.js';
import { makeRopeState, initPoints, simulateRope, impulseWobble, springKick, wrapPolyline } from './rope.js';
import { Scene3D } from './scene3d.js';
import { Particles } from './particles2d.js';
import { ropeIsCrossed } from './crossing.js';

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
let pegDips = []; // { pegId, t, dur, amp }
let hapticOn = true;
let lastTs = 0;
let winShown = false;
let audioGestureBound = false;

let PEG_R = 28, CAP_R = 34, ROPE_W = 28, SNAP_DIST = 56;
// Magnet sticky zone ≈ 1.5 peg radii (screen space)
let MAGNET_ZONE = 50;
const FREE_DELAY = 0.5;
const RETRACT_DUR = 0.2;
const SNAP_DUR = 0.07; // 70 ms ease-in into peg
const FLYBACK_DUR = 0.18;
const LIFT_DUR = 0.08; // magnetic pop lift
const FINGER_OFFSET_Y = -36; // keep cap above finger

function updateScale() {
  PEG_R = W * 0.055 * 0.5;
  ROPE_W = W * 0.060;
  CAP_R = W * 0.067 * 0.5;
  SNAP_DIST = PEG_R * 2.2;
  MAGNET_ZONE = PEG_R * 1.5 * 2; // diameter-ish radius in screen px ≈ 1.5 peg radii from center
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
  // Compact board so packed peg cluster reads ~0.60 W on screen
  const isLandscape = W > H;
  // Board sized so packed cluster (~0.86 of board) ≈ 0.60 W on screen
  boardW = isLandscape ? Math.min(W * 0.74, H * 1.05) : Math.min(W * 0.74, H * 0.60);
  boardH = boardW * 0.82;
  if (isLandscape) boardH = Math.min(boardH, H * 0.75);
  else boardH = Math.min(boardH, H * 0.56);
  boardOX = (W - boardW) / 2;
  const hudReserve = Math.max(isLandscape ? 70 : 110, (isLandscape ? H * 0.095 : H * 0.12));
  // Slightly below middle of free area under HUD
  boardOY = hudReserve + Math.max(0, (H - hudReserve - boardH) * 0.55);
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
  for (const rs of ropeStates) {
    rs.freeT = 0;
    rs.retracting = false;
  }
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
  pegDips = [];
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
      peg.stack.forEach((cap, si) => {
        if (cap.ropeId === rs.id) found[cap.end] = { pegId: peg.id, stackIndex: si };
      });
    }
    rs._ends = found;
  }
}

function easeInCubic(t) { return t * t * t; }
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeOutQuad(t) { return 1 - (1 - t) * (1 - t); }
function easeOutBack(t) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function endPositions(ropeId) {
  const rs = ropeStates.find(r => r.id === ropeId);
  if (!rs || !rs._ends) return null;
  const out = [];
  for (let e = 0; e < 2; e++) {
    if (dragging && dragging.ropeId === ropeId && dragging.end === e) {
      out.push({ x: dragging.x, y: dragging.y, pegId: -1, stackIndex: -1, lifted: true });
      continue;
    }
    const anim = snapAnims.find(a => a.ropeId === ropeId && a.end === e);
    if (anim) {
      const u = Math.min(1, anim.t / anim.dur);
      let t;
      if (anim.kind === 'snap') t = easeInCubic(u); // accelerate into peg
      else if (anim.kind === 'flyback') t = easeOutCubic(u);
      else t = easeOutQuad(u);
      out.push({
        x: anim.from.x + (anim.to.x - anim.from.x) * t,
        y: anim.from.y + (anim.to.y - anim.from.y) * t,
        pegId: anim.pegId, stackIndex: -1, snapping: true, squash: anim.squash,
        liftY: anim.liftY ? anim.liftY * (1 - t) : 0,
      });
      continue;
    }
    const info = rs._ends[e];
    if (!info || info.pegId < 0) { out.push({ x: 0, y: 0 }); continue; }
    const peg = pegs[info.pegId];
    out.push({
      x: peg.x, y: peg.y,
      pegId: peg.id, stackIndex: info.stackIndex,
    });
  }
  return out;
}

function topCapAt(peg) {
  if (!peg.stack.length) return null;
  return peg.stack[peg.stack.length - 1];
}

function pegAtScreen(x, y) {
  let best = null, bestD = SNAP_DIST;
  for (const peg of pegs) {
    const scr = scene.projectCapOnPeg(peg);
    const d = Math.hypot(scr.x - x, scr.y - y);
    if (d < bestD) { bestD = d; best = peg; }
  }
  return best;
}

function emptyPegNear(x, y, maxDist) {
  let best = null, bestD = maxDist;
  for (const peg of pegs) {
    if (peg.stack.length >= peg.capacity) continue;
    const d = Math.hypot(peg.x - x, peg.y - y);
    if (d < bestD) { bestD = d; best = peg; }
  }
  return best;
}

/** Pointer pick: nearest grabbable cap by projected screen distance, radius ≈ 1.3× on-screen. */
function findGrabbable(clientX, clientY) {
  const capR = scene.capScreenRadius();
  const hitR = capR * 1.3;
  let best = null, bestD = hitR;
  for (const peg of pegs) {
    // Any cap can be grabbed unless another cap covers it (capacity 1 → stack top only)
    const top = topCapAt(peg);
    if (!top) continue;
    const rs = ropeStates.find(r => r.id === top.ropeId);
    if (!rs || rs.clearing) continue;
    const scr = scene.projectCapOnPeg(peg);
    const d = Math.hypot(scr.x - clientX, scr.y - clientY);
    if (d < bestD) {
      bestD = d;
      best = { peg, cap: top, ropeId: top.ropeId, end: top.end, screen: scr };
    }
  }
  return best;
}

function haptic(ms = 8) {
  if (!hapticOn) return;
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch (_) {}
}

function pointerPos(e) {
  if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  if (e.changedTouches && e.changedTouches.length) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
  return { x: e.clientX, y: e.clientY };
}

/** Bind iOS unlock on first pointerup/touchend anywhere (not only start button). */
function bindAudioGesture() {
  if (audioGestureBound) return;
  audioGestureBound = true;
  const unlockOnce = (e) => {
    audio.unlock();
  };
  // Prefer pointerup / touchend as specified
  window.addEventListener('pointerup', unlockOnce, { passive: true });
  window.addEventListener('touchend', unlockOnce, { passive: true });
  // Also pointerdown as early as possible for Chrome
  window.addEventListener('pointerdown', unlockOnce, { passive: true });
}
bindAudioGesture();

function onDown(e) {
  e.preventDefault();
  audio.unlock();
  if (!running || winShown) return;
  if (e.pointerId != null && canvas.setPointerCapture) {
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  }
  const { x, y } = pointerPos(e);
  const g = findGrabbable(x, y);
  if (!g) return;
  g.peg.stack.pop();
  syncRopeEndsFromStacks();
  // Target under finger with upward offset so finger doesn't hide cap
  const targetX = x;
  const targetY = y + FINGER_OFFSET_Y;
  dragging = {
    ropeId: g.ropeId, end: g.end,
    x: g.peg.x, y: g.peg.y,
    // Visual lag targets
    tx: targetX, ty: targetY,
    fromPeg: g.peg.id,
    originX: g.peg.x, originY: g.peg.y,
    liftT: 0,
    stickyPeg: null,
    pointerId: e.pointerId,
  };
  const rs = ropeStates.find(r => r.id === g.ropeId);
  if (rs) {
    rs.z = Math.max(...ropeStates.map(r => r.z || 0)) + 1;
    rs._dragging = true;
    rs.freeT = 0;
  }
  audio.pop(); // soft magnetic pop on lift
  audio.pickup();
  haptic(6);
}

function onMove(e) {
  e.preventDefault();
  if (!dragging) return;
  if (e.pointerId != null && dragging.pointerId != null && e.pointerId !== dragging.pointerId) return;
  const { x, y } = pointerPos(e);
  dragging.tx = x;
  dragging.ty = y + FINGER_OFFSET_Y;
}

function onUp(e) {
  e.preventDefault();
  audio.unlock(); // critical: unlock path on first touchend/pointerup in game
  if (!dragging) return;
  if (e.pointerId != null && dragging.pointerId != null && e.pointerId !== dragging.pointerId) return;

  // Prefer sticky peg if magnet zone engaged, else nearest empty
  let peg = dragging.stickyPeg;
  if (!peg) peg = emptyPegNear(dragging.x, dragging.y, SNAP_DIST * 1.4);
  let valid = !!(peg && peg.stack.length < peg.capacity);
  if (!valid) {
    peg = pegs[dragging.fromPeg];
    if (!peg || peg.stack.length >= peg.capacity) {
      peg = pegs.find(p => p.stack.length < p.capacity) || pegs[0];
    }
  }
  const target = { x: peg.x, y: peg.y };
  const rs = ropeStates.find(r => r.id === dragging.ropeId);
  if (rs) rs._dragging = false;

  snapAnims.push({
    ropeId: dragging.ropeId, end: dragging.end,
    from: { x: dragging.x, y: dragging.y },
    to: { x: target.x, y: target.y },
    t: 0,
    dur: valid ? SNAP_DUR : FLYBACK_DUR,
    pegId: peg.id, squash: 1,
    pendingCap: { ropeId: dragging.ropeId, end: dragging.end },
    kind: valid ? 'snap' : 'flyback',
    liftY: valid ? 0 : 0.3,
    punched: false,
  });
  dragging = null;
}

// Pointer events (preferred) + touch fallback
canvas.style.touchAction = 'none';
canvas.addEventListener('pointerdown', onDown);
canvas.addEventListener('pointermove', onMove);
window.addEventListener('pointerup', onUp);
window.addEventListener('pointercancel', onUp);
// Also touchend on window so unlock always fires even if pointer events miss
window.addEventListener('touchend', (e) => { audio.unlock(); }, { passive: true });

function finishSnap(anim) {
  const peg = pegs[anim.pegId];
  peg.stack.push(anim.pendingCap);
  syncRopeEndsFromStacks();
  const rs = ropeStates.find(r => r.id === anim.ropeId);
  if (rs) {
    // Body oscillations only — cap is pinned on peg
    springKick(rs, anim.kind === 'snap' ? 1.1 : 0.75);
    impulseWobble(rs, anim.kind === 'snap' ? 0.9 : 0.6);
  }
  if (anim.kind === 'snap') {
    audio.snap();
    haptic(12);
    // Tiny peg dip
    pegDips.push({ pegId: peg.id, t: 0, dur: 0.12, amp: 0.04 });
  } else {
    audio.snap();
    haptic(8);
  }
  evaluateFrees();
}

function getPolyline(rs) {
  if (rs._wrapPath && rs._wrapPath.length >= 2) return rs._wrapPath;
  if (rs.points) return rs.points.map(p => ({ x: p.x, y: p.y }));
  return null;
}

function getEndPegs(rs) {
  const ends = endPositions(rs.id);
  if (!ends) return [];
  const out = [];
  for (const e of ends) {
    if (e.pegId >= 0 && pegs[e.pegId]) out.push(pegs[e.pegId]);
    else out.push({ x: e.x, y: e.y });
  }
  return out;
}

function evaluateFrees() {
  const ignoreR = PEG_R * 1.6;
  const draggedId = dragging ? dragging.ropeId : null;
  for (let i = 0; i < ropeStates.length; i++) {
    const rs = ropeStates[i];
    if (rs.clearing) continue;
    if (draggedId != null && rs.id === draggedId) { rs.freeT = 0; continue; }
    // Skip if an end is mid-snap
    if (snapAnims.some(a => a.ropeId === rs.id)) { rs.freeT = 0; continue; }
    const crossed = ropeIsCrossed(i, ropeStates, getPolyline, getEndPegs, ignoreR, draggedId);
    if (!crossed) {
      // free
    } else {
      rs.freeT = 0;
    }
  }
}

function startClear(rs) {
  rs.clearing = true;
  rs.clearT = 0;
  rs.retracting = true;
  // Remove both caps from pegs
  for (const peg of pegs) {
    peg.stack = peg.stack.filter(c => c.ropeId !== rs.id);
  }
  syncRopeEndsFromStacks();
  const ends = endPositions(rs.id);
  const cx = ends ? (ends[0].x + ends[1].x) * 0.5 : W / 2;
  const cy = ends ? (ends[0].y + ends[1].y) * 0.5 : H / 2;
  // Sparkles fire at end of retract — scheduled in tick
  rs._popAt = { x: cx, y: cy };
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
  if (ropeStates.every(r => r.clearing && r.clearT >= RETRACT_DUR + 0.05)) {
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

  // Drag: lag behind finger (spring catch-up) + magnet sticky assist
  if (dragging) {
    dragging.liftT = Math.min(1, dragging.liftT + dt / LIFT_DUR);
    // Soft follow — rope/cap lag then catch up
    const follow = 0.38; // lower = more spring lag
    dragging.x += (dragging.tx - dragging.x) * follow;
    dragging.y += (dragging.ty - dragging.y) * follow;

    // Magnetic sticky zone: pull toward empty peg within ~1.5 peg radii
    const near = emptyPegNear(dragging.x, dragging.y, MAGNET_ZONE);
    dragging.stickyPeg = near;
    if (near) {
      const pull = 0.22; // sticky assist strength
      dragging.x += (near.x - dragging.x) * pull;
      dragging.y += (near.y - dragging.y) * pull;
      // Also bias the finger target slightly so release feels locked
      dragging.tx += (near.x - dragging.tx) * 0.08;
      dragging.ty += (near.y - dragging.ty) * 0.08;
    }
  }

  // Snap animations
  for (const anim of snapAnims) {
    anim.t += dt;
    const u = Math.min(1, anim.t / anim.dur);
    if (anim.kind === 'snap') {
      // 1-frame scale punch at landing
      if (u >= 1 && !anim.punched) {
        anim.squash = 0.85;
        anim.punched = true;
      } else if (anim.punched) {
        anim.squash = Math.min(1, anim.squash + dt * 8);
      } else {
        anim.squash = 1;
      }
    } else {
      anim.squash = 1;
    }
  }
  const finished = snapAnims.filter(a => a.t >= a.dur && (a.kind !== 'snap' || a.squash >= 0.99 || a.t >= a.dur + 0.06));
  // Keep snap briefly for squash punch
  snapAnims = snapAnims.filter(a => {
    if (a.t < a.dur) return true;
    if (a.kind === 'snap' && a.t < a.dur + 0.06) return true;
    return false;
  });
  for (const a of finished) {
    if (!a._done) { a._done = true; finishSnap(a); }
  }

  // Peg dips
  for (const d of pegDips) d.t += dt;
  pegDips = pegDips.filter(d => d.t < d.dur);
  for (const peg of pegs) {
    const d = pegDips.find(x => x.pegId === peg.id);
    if (d) {
      const u = d.t / d.dur;
      const dip = Math.sin(u * Math.PI) * d.amp;
      scene.setPegDip(peg.id, dip);
    } else {
      scene.setPegDip(peg.id, 0);
    }
  }

  // Free-rope timer + clear
  const ignoreR = PEG_R * 1.6;
  const draggedId = dragging ? dragging.ropeId : null;
  for (let i = 0; i < ropeStates.length; i++) {
    const rs = ropeStates[i];
    if (rs.clearing) {
      rs.clearT += dt;
      if (rs.retracting && rs.clearT >= RETRACT_DUR && !rs._popped) {
        rs._popped = true;
        const pos = rs._popAt || { x: W / 2, y: H / 2 };
        particles.burst(pos.x, pos.y, rs.color, 28);
        audio.clear();
        haptic([10, 30, 10]);
      }
      continue;
    }
    if (draggedId != null && rs.id === draggedId) { rs.freeT = 0; continue; }
    if (snapAnims.some(a => a.ropeId === rs.id)) { rs.freeT = 0; continue; }
    const crossed = ropeIsCrossed(i, ropeStates, getPolyline, getEndPegs, ignoreR, draggedId);
    if (!crossed) {
      rs.freeT = (rs.freeT || 0) + dt;
      if (rs.freeT >= FREE_DELAY) startClear(rs);
    } else {
      rs.freeT = 0;
    }
  }

  for (const rs of ropeStates) {
    if (rs.clearing && rs.clearT > RETRACT_DUR + 0.15) continue;
    const ends = endPositions(rs.id);
    if (!ends) continue;
    if (!rs.points) {
      initPoints(rs, ends[0].x, ends[0].y, ends[1].x, ends[1].y, pegs, PEG_R + ROPE_W * 0.7 + 6);
    }
    simulateRope(rs, ends[0].x, ends[0].y, ends[1].x, ends[1].y, pegs, PEG_R, ROPE_W * 0.5, dt);
  }

  particles.update(dt);
  checkWin();

  scene.syncPegs(pegs);
  const wrapClear = PEG_R + ROPE_W * 0.85 + 8;
  for (const rs of ropeStates) {
    if (rs.clearing && rs.retracting && rs.clearT > 0.05) continue;
    const ends = endPositions(rs.id);
    if (!ends) continue;
    rs._wrapPath = wrapPolyline(ends[0].x, ends[0].y, ends[1].x, ends[1].y, pegs, wrapClear);
  }
  const dragInfo = dragging ? { ropeId: dragging.ropeId, end: dragging.end } : null;
  scene.syncRopes(ropeStates, endPositions, dragInfo);

  if (dragging) {
    const rs = ropeStates.find(r => r.id === dragging.ropeId);
    const near = dragging.stickyPeg;
    if (near) scene.setHighlight(near, rs?.color.hex);
    else scene.setHighlight(null);
    // Lift ease + slight perspective scale; clear moving drop shadow
    const liftEase = easeOutCubic(dragging.liftT);
    const baseLift = scene.pegH + scene.capH;
    const lift = baseLift + 0.15 + liftEase * 0.55;
    const persp = 1.0 + liftEase * 0.1;
    scene.setDragCap(
      { x: dragging.x, y: dragging.y },
      rs?.color || { hex: '#888', dark: '#444', light: '#ccc' },
      { lift, scale: persp }
    );
  } else {
    // Show snap-animating cap as dragCap for smooth lift→snap
    const flying = snapAnims[0];
    if (flying) {
      const rs = ropeStates.find(r => r.id === flying.ropeId);
      const u = Math.min(1, flying.t / flying.dur);
      const t = flying.kind === 'snap' ? easeInCubic(u) : easeOutCubic(u);
      const x = flying.from.x + (flying.to.x - flying.from.x) * t;
      const y = flying.from.y + (flying.to.y - flying.from.y) * t;
      const baseLift = scene.pegH + scene.capH;
      // Arc: high mid-flight for flyback, dive into peg for snap
      let lift;
      if (flying.kind === 'snap') {
        lift = baseLift + 0.55 * (1 - t) + 0.05;
      } else {
        lift = baseLift + Math.sin(t * Math.PI) * 0.7;
      }
      scene.setDragCap(
        { x, y },
        rs?.color || { hex: '#888', dark: '#444', light: '#ccc' },
        { lift, scale: flying.squash < 1 ? 1 : 1.05 }
      );
      // Hide the static cap for this end while flying
    } else {
      scene.setHighlight(null);
      scene.setDragCap(null);
    }
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

function dragCapToPeg(fromPegId, toPegId) {
  const peg = pegs[fromPegId];
  if (!peg || !peg.stack.length) return false;
  const cap = peg.stack.pop();
  const dest = pegs[toPegId];
  if (!dest || dest.stack.length >= dest.capacity) {
    peg.stack.push(cap); return false;
  }
  dest.stack.push(cap);
  syncRopeEndsFromStacks();
  const rs = ropeStates.find(r => r.id === cap.ropeId);
  if (rs) {
    rs.z = Math.max(...ropeStates.map(r => r.z || 0)) + 1;
    springKick(rs, 1.0);
    impulseWobble(rs, 0.8);
  }
  audio.snap();
  evaluateFrees();
  return true;
}

window.__tangle = {
  loadLevel, pegs: () => pegs, ropes: () => ropeStates,
  dragCapToPeg, dragRingToPeg: dragCapToPeg, flushSnaps: () => {
    const pending = snapAnims.splice(0);
    for (const a of pending) finishSnap(a);
  },
  audio, coins: () => coins, timeLeft: () => timeLeft,
  checkClears: evaluateFrees, syncRopeEndsFromStacks, scene,
  measure: () => scene.measureScreenFractions(pegs),
  LEVEL_COUNT,
};
