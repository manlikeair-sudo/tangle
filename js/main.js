import { AudioBus } from './audio.js';
import { generateLevel, LEVEL_COUNT } from './levels.js';
import { makeRopeState, initPoints, simulateRope, impulseWobble, springKick, wrapPolyline, captureRest } from './rope.js';
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
// Optional gentle peg assist when releasing very near an empty peg
let PEG_ASSIST_R = 50;
const FREE_DELAY = 0.5;
const RETRACT_DUR = 0.2;
const SNAP_DUR = 0.07; // 70 ms ease-in snap to floor/peg
const LIFT_DUR = 0.08; // magnetic pop lift
const FOLLOW_BASE = 0.97; // ref: nearly 1:1 finger tracking
const MAX_STRETCH = 1.85; // hard rubber stop vs elastic rest
const TENSION_SOFT = 0.15; // start gentle tug (keep 1:1 below this)
const TENSION_HARD = 0.75; // heavy rubber resistance
const CAP_SEP_MUL = 2.15; // min center distance between caps ≈ 2.15× CAP_R
const EDGE_PAD = 18; // keep caps inside visible play area

function updateScale() {
  PEG_R = W * 0.055 * 0.5;
  ROPE_W = W * 0.060;
  CAP_R = W * 0.067 * 0.5;
  SNAP_DIST = PEG_R * 2.2;
  PEG_ASSIST_R = PEG_R * 1.35; // gentle optional snap only when this close to empty peg
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
    const prev = rs._ends || [null, null];
    const found = [null, null];
    for (const peg of pegs) {
      peg.stack.forEach((cap, si) => {
        if (cap.ropeId === rs.id) found[cap.end] = { pegId: peg.id, stackIndex: si };
      });
    }
    for (let e = 0; e < 2; e++) {
      if (found[e]) continue;
      const p = prev[e];
      if (p && p.pegId < 0 && p.x != null) {
        found[e] = { pegId: -1, x: p.x, y: p.y };
      } else if (p && p.pegId >= 0 && pegs[p.pegId]) {
        // Just detached from this peg — park at peg coords as floor until placed
        found[e] = { pegId: -1, x: pegs[p.pegId].x, y: pegs[p.pegId].y };
      } else if (p && p.x != null) {
        found[e] = { pegId: -1, x: p.x, y: p.y };
      } else {
        found[e] = { pegId: -1, x: boardOX + boardW * 0.5, y: boardOY + boardH * 0.5 };
      }
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
      const liftEase = easeOutCubic(Math.min(1, dragging.liftT || 0));
      const liftY = scene.pegH + scene.capH + 0.15 + liftEase * 0.55;
      out.push({
        x: dragging.x, y: dragging.y, pegId: -1, stackIndex: -1,
        lifted: true, onFloor: false, liftY,
      });
      continue;
    }
    const anim = snapAnims.find(a => a.ropeId === ropeId && a.end === e);
    if (anim) {
      const u = Math.min(1, anim.t / anim.dur);
      const t = anim.kind === 'snap' ? easeInCubic(u) : easeOutQuad(u);
      out.push({
        x: anim.from.x + (anim.to.x - anim.from.x) * t,
        y: anim.from.y + (anim.to.y - anim.from.y) * t,
        pegId: anim.pegId, stackIndex: -1, snapping: true, squash: anim.squash,
        onFloor: anim.onFloor !== false && !(anim.pegId >= 0),
        liftY: anim.liftY ? anim.liftY * (1 - t) : 0,
      });
      continue;
    }
    const info = rs._ends[e];
    if (!info) { out.push({ x: 0, y: 0, onFloor: true }); continue; }
    if (info.pegId >= 0 && pegs[info.pegId]) {
      const peg = pegs[info.pegId];
      out.push({
        x: peg.x, y: peg.y,
        pegId: peg.id, stackIndex: info.stackIndex,
        onFloor: false,
      });
    } else {
      out.push({
        x: info.x, y: info.y,
        pegId: -1, stackIndex: -1,
        onFloor: true,
      });
    }
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

/** Pointer pick: nearest grabbable cap (peg-top or free-floor) by projected screen distance. */
function findGrabbable(clientX, clientY) {
  const capR = scene.capScreenRadius();
  const hitR = capR * 1.35;
  let best = null, bestD = hitR;
  const floorY = scene.floorCapY();
  const pegY = scene.pegH + scene.capH * 0.5;

  // Free-floor caps
  for (const rs of ropeStates) {
    if (rs.clearing || !rs._ends) continue;
    for (let e = 0; e < 2; e++) {
      const info = rs._ends[e];
      if (!info || info.pegId >= 0) continue;
      if (snapAnims.some(a => a.ropeId === rs.id && a.end === e)) continue;
      const scr = scene.projectBoardAt(info.x, info.y, floorY);
      const d = Math.hypot(scr.x - clientX, scr.y - clientY);
      if (d < bestD) {
        bestD = d;
        best = {
          peg: null, cap: { ropeId: rs.id, end: e },
          ropeId: rs.id, end: e, screen: scr,
          fromFloor: true, originX: info.x, originY: info.y,
        };
      }
    }
  }

  // Peg-top caps (capacity 1 → stack top)
  for (const peg of pegs) {
    const top = topCapAt(peg);
    if (!top) continue;
    const rs = ropeStates.find(r => r.id === top.ropeId);
    if (!rs || rs.clearing) continue;
    const scr = scene.projectCapOnPeg(peg);
    const d = Math.hypot(scr.x - clientX, scr.y - clientY);
    if (d < bestD) {
      bestD = d;
      best = {
        peg, cap: top, ropeId: top.ropeId, end: top.end, screen: scr,
        fromFloor: false, originX: peg.x, originY: peg.y,
      };
    }
  }
  return best;
}

function playAreaBounds() {
  const hudReserve = Math.max(W > H ? 70 : 110, (W > H ? H * 0.095 : H * 0.12));
  return {
    minX: EDGE_PAD + CAP_R,
    maxX: W - EDGE_PAD - CAP_R,
    minY: hudReserve + EDGE_PAD + CAP_R,
    maxY: H - EDGE_PAD - CAP_R,
  };
}

function clampToPlayArea(x, y) {
  const b = playAreaBounds();
  return {
    x: Math.max(b.minX, Math.min(b.maxX, x)),
    y: Math.max(b.minY, Math.min(b.maxY, y)),
  };
}

/** Other settled cap centers (exclude one rope end). */
function otherCapCenters(excludeRopeId, excludeEnd) {
  const out = [];
  for (const rs of ropeStates) {
    if (rs.clearing || !rs._ends) continue;
    for (let e = 0; e < 2; e++) {
      if (rs.id === excludeRopeId && e === excludeEnd) continue;
      if (dragging && dragging.ropeId === rs.id && dragging.end === e) continue;
      if (snapAnims.some(a => a.ropeId === rs.id && a.end === e)) continue;
      const ends = endPositions(rs.id);
      if (!ends) continue;
      out.push({ x: ends[e].x, y: ends[e].y });
    }
  }
  return out;
}

function resolveCapOverlap(x, y, excludeRopeId, excludeEnd) {
  const minD = CAP_R * CAP_SEP_MUL;
  let px = x, py = y;
  for (let iter = 0; iter < 10; iter++) {
    let moved = false;
    for (const o of otherCapCenters(excludeRopeId, excludeEnd)) {
      let dx = px - o.x, dy = py - o.y;
      let d = Math.hypot(dx, dy);
      if (d < 1e-4) { dx = 1; dy = 0; d = 1; }
      if (d < minD) {
        const push = (minD - d) + 0.5;
        px += (dx / d) * push;
        py += (dy / d) * push;
        moved = true;
      }
    }
    const c = clampToPlayArea(px, py);
    px = c.x; py = c.y;
    if (!moved) break;
  }
  return { x: px, y: py };
}

/** Raycast pointer → board plane at current drag lift (1:1 tracking). */
function pointerToBoard(clientX, clientY, lifted) {
  const liftEase = lifted ? 1 : 0;
  const planeY = lifted
    ? (scene.pegH + scene.capH + 0.15 + 0.55)
    : scene.floorCapY();
  return scene.screenToBoard(clientX, clientY, planeY);
}

function restLengthForRope(rs) {
  if (rs && rs._restLen) return rs._restLen;
  const ends = endPositions(rs.id);
  if (!ends) return 200;
  const d = Math.hypot(ends[0].x - ends[1].x, ends[0].y - ends[1].y);
  return Math.max(80, d * 1.55);
}

function applySpringFeel(x, y, otherX, otherY, restLen, fingerX, fingerY) {
  // x,y already near finger. Apply gentle nonlinear tug + hard clamp.
  const rest = Math.max(60, restLen || 120);
  const dx = x - otherX, dy = y - otherY;
  const d = Math.hypot(dx, dy) || 1e-4;
  const ratio = d / rest;
  const tension = Math.max(0, ratio - 1.0);

  let px = x, py = y;
  // Soft zone: almost no tug (accurate tracking). Hard zone: growing rubber pull.
  if (tension > TENSION_SOFT) {
    const t = Math.min(1, (tension - TENSION_SOFT) / Math.max(0.05, TENSION_HARD - TENSION_SOFT));
    const tug = t * t * 0.22; // max ~22% pull-back — feel spring, keep finger accuracy
    const pullD = Math.max(0, d - rest);
    if (pullD > 0) {
      const s = (d - pullD * tug) / d;
      px = otherX + dx * s;
      py = otherY + dy * s;
    }
  }

  const maxD = Math.max(rest * MAX_STRETCH, 140);
  const dx2 = px - otherX, dy2 = py - otherY;
  const d2 = Math.hypot(dx2, dy2) || 1e-4;
  if (d2 > maxD) {
    const excess = d2 - maxD;
    const allowed = maxD + excess * 0.15;
    const s = allowed / d2;
    px = otherX + dx2 * s;
    py = otherY + dy2 * s;
  }

  const finalD = Math.hypot(px - otherX, py - otherY);
  const finalRatio = finalD / rest;
  let follow = FOLLOW_BASE;
  if (tension > TENSION_SOFT) {
    const t = Math.min(1, (tension - TENSION_SOFT) / (TENSION_HARD + 0.35));
    follow = FOLLOW_BASE * (1 - t * 0.28) + 0.62 * t; // soft rubber but still tracks
  }
  return {
    x: px, y: py,
    stretched: Math.max(0.7, finalRatio),
    tension: Math.max(0, finalRatio - 1),
    follow,
  };
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

  if (g.peg) {
    g.peg.stack.pop();
    syncRopeEndsFromStacks();
  } else {
    // Detach free-floor end
    const rs0 = ropeStates.find(r => r.id === g.ropeId);
    if (rs0 && rs0._ends) rs0._ends[g.end] = { pegId: -1, x: g.originX, y: g.originY };
  }

  const board = pointerToBoard(x, y, true);
  dragging = {
    ropeId: g.ropeId, end: g.end,
    x: g.originX, y: g.originY,
    tx: board.x, ty: board.y,
    fromPeg: g.peg ? g.peg.id : -1,
    originX: g.originX, originY: g.originY,
    liftT: 0,
    stickyPeg: null,
    pointerId: e.pointerId,
    clientX: x, clientY: y,
  };
  const rs = ropeStates.find(r => r.id === g.ropeId);
  if (rs) {
    rs.z = Math.max(...ropeStates.map(r => r.z || 0)) + 1;
    rs._dragging = true;
    rs.freeT = 0;
    // Capture rest length at grab for stretch limit
    const ends = endPositions(rs.id);
    if (ends) {
      const other = ends[1 - g.end];
      captureRest(rs, g.originX, g.originY, other.x, other.y);
      rs._restLen = rs.elasticRest;
      springKick(rs, 0.45); // small pop-up spring on lift
    }
  }
  audio.pop();
  audio.pickup();
  haptic(6);
}

function onMove(e) {
  e.preventDefault();
  if (!dragging) return;
  if (e.pointerId != null && dragging.pointerId != null && e.pointerId !== dragging.pointerId) return;
  const { x, y } = pointerPos(e);
  dragging.clientX = x;
  dragging.clientY = y;
  const board = pointerToBoard(x, y, true);
  dragging.tx = board.x;
  dragging.ty = board.y;
}

function onUp(e) {
  e.preventDefault();
  audio.unlock();
  if (!dragging) return;
  if (e.pointerId != null && dragging.pointerId != null && e.pointerId !== dragging.pointerId) return;

  const rs = ropeStates.find(r => r.id === dragging.ropeId);
  if (rs) rs._dragging = false;

  // Free placement: snap to release spot on the floor (optional gentle peg assist)
  let tx = dragging.x, ty = dragging.y;
  let peg = emptyPegNear(tx, ty, PEG_ASSIST_R);
  let onFloor = true;
  let pegId = -1;
  if (peg && peg.stack.length < peg.capacity) {
    // Gentle optional pull onto empty peg when released very near it
    tx = peg.x; ty = peg.y;
    onFloor = false;
    pegId = peg.id;
  } else {
    peg = null;
    const clamped = clampToPlayArea(tx, ty);
    const resolved = resolveCapOverlap(clamped.x, clamped.y, dragging.ropeId, dragging.end);
    tx = resolved.x; ty = resolved.y;
  }

  const releaseTension = rs ? (rs.tension || 0) : 0;
  if (rs) {
    // Ref settle: ~2 soft overshoots in ~0.55–0.7s, not wild
    springKick(rs, 0.75 + Math.min(0.7, releaseTension * 0.75));
    impulseWobble(rs, 0.95 + Math.min(0.7, releaseTension * 0.7));
    audio.boing(Math.min(1.0, 0.25 + releaseTension * 0.8));
  }

  snapAnims.push({
    ropeId: dragging.ropeId, end: dragging.end,
    from: { x: dragging.x, y: dragging.y },
    to: { x: tx, y: ty },
    t: 0,
    dur: SNAP_DUR,
    pegId,
    squash: 1,
    pendingCap: { ropeId: dragging.ropeId, end: dragging.end },
    kind: 'snap',
    onFloor,
    floorX: tx, floorY: ty,
    liftY: 0,
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
  const rs = ropeStates.find(r => r.id === anim.ropeId);
  if (anim.pegId >= 0 && pegs[anim.pegId]) {
    const peg = pegs[anim.pegId];
    // Ensure not already stacked
    peg.stack = peg.stack.filter(c => !(c.ropeId === anim.pendingCap.ropeId && c.end === anim.pendingCap.end));
    peg.stack.push(anim.pendingCap);
    syncRopeEndsFromStacks();
    pegDips.push({ pegId: peg.id, t: 0, dur: 0.12, amp: 0.04 });
  } else {
    // Free floor placement
    if (rs) {
      if (!rs._ends) rs._ends = [null, null];
      rs._ends[anim.end] = { pegId: -1, x: anim.floorX, y: anim.floorY };
    }
  }
  if (rs) {
    // Soft secondary settle pulse after landing squash
    springKick(rs, 0.35);
  }
  audio.snap();
  haptic(14);
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

  // Drag: 1:1 until tension, then rubbery spring resistance you can feel
  if (dragging) {
    dragging.liftT = Math.min(1, dragging.liftT + dt / LIFT_DUR);
    const rsDrag = ropeStates.find(r => r.id === dragging.ropeId);
    const endsNow = endPositions(dragging.ropeId);
    let follow = FOLLOW_BASE;
    if (endsNow && rsDrag) {
      const other = endsNow[1 - dragging.end];
      const rest = rsDrag.elasticRest || rsDrag._restLen || restLengthForRope(rsDrag);
      // Follow finger, then spring-feel tug (keeps tracking until hard tension)
      dragging.x += (dragging.tx - dragging.x) * FOLLOW_BASE;
      dragging.y += (dragging.ty - dragging.y) * FOLLOW_BASE;
      const lim = applySpringFeel(dragging.x, dragging.y, other.x, other.y, rest, dragging.tx, dragging.ty);
      follow = lim.follow;
      // Rubbery ease toward spring-resolved pose (stronger lag only when taut)
      const blend = 0.30 + (1 - follow / FOLLOW_BASE) * 0.45; // snappier mid-drag
      dragging.x += (lim.x - dragging.x) * blend;
      dragging.y += (lim.y - dragging.y) * blend;
      rsDrag.stretch = lim.stretched;
      rsDrag.tension = lim.tension;

      // Quiet stretch creak + haptic ticks at tension thresholds
      if (lim.tension > 0.12) {
        audio.stretch(lim.tension);
        const band = Math.floor(lim.tension * 6);
        if (band !== dragging._hapBand) {
          dragging._hapBand = band;
          haptic(band >= 4 ? 14 : 7);
        }
      }
    } else {
      dragging.x += (dragging.tx - dragging.x) * follow;
      dragging.y += (dragging.ty - dragging.y) * follow;
    }

    const c = clampToPlayArea(dragging.x, dragging.y);
    dragging.x = c.x; dragging.y = c.y;
    dragging.stickyPeg = emptyPegNear(dragging.x, dragging.y, PEG_ASSIST_R);
  }

  // Snap animations
  for (const anim of snapAnims) {
    anim.t += dt;
    const u = Math.min(1, anim.t / anim.dur);
    if (anim.kind === 'snap') {
      // 1-frame scale punch at landing
      if (u >= 1 && !anim.punched) {
        anim.squash = 0.72; // stronger landing squash
        anim.punched = true;
        anim._bounceT = 0;
      } else if (anim.punched) {
        anim._bounceT = (anim._bounceT || 0) + dt;
        // Squash then slight stretch overshoot
        const bt = anim._bounceT;
        if (bt < 0.06) anim.squash = 0.72 + bt / 0.06 * 0.38;
        else if (bt < 0.14) anim.squash = 1.1 - (bt - 0.06) / 0.08 * 0.1;
        else anim.squash = Math.min(1, anim.squash + dt * 6);
      } else {
        anim.squash = 1;
      }
    } else {
      anim.squash = 1;
    }
  }
  const finished = snapAnims.filter(a => a.t >= a.dur && (a.kind !== 'snap' || a.squash >= 0.99 || a.t >= a.dur + 0.16));
  // Keep snap briefly for squash punch
  snapAnims = snapAnims.filter(a => {
    if (a.t < a.dur) return true;
    if (a.kind === 'snap' && a.t < a.dur + 0.16) return true;
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

  let physMs = 0;
  for (const rs of ropeStates) {
    if (rs.clearing && rs.clearT > RETRACT_DUR + 0.15) continue;
    const ends = endPositions(rs.id);
    if (!ends) continue;
    if (!rs.points) {
      initPoints(rs, ends[0].x, ends[0].y, ends[1].x, ends[1].y, pegs, PEG_R + ROPE_W * 0.7 + 6);
    }
    physMs += simulateRope(rs, ends[0].x, ends[0].y, ends[1].x, ends[1].y, pegs, PEG_R, ROPE_W * 0.5, dt) || 0;
  }
  // Rolling fps / phys profile (for __tangle.perf)
  const now = performance.now();
  if (!window.__perf) window.__perf = { frames: 0, phys: 0, last: now, fps: 60, physMs: 0 };
  window.__perf.frames++;
  window.__perf.phys += physMs;
  if (now - window.__perf.last >= 500) {
    const elapsed = (now - window.__perf.last) / 1000;
    window.__perf.fps = window.__perf.frames / elapsed;
    window.__perf.physMs = window.__perf.phys / window.__perf.frames;
    window.__perf.frames = 0;
    window.__perf.phys = 0;
    window.__perf.last = now;
  }

  particles.update(dt);
  checkWin();

  scene.syncPegs(pegs);
  // Drive mesh from verlet spring points (real stretch/sag). Geometric wrap only as rare fallback.
  for (const rs of ropeStates) {
    if (rs.clearing && rs.retracting && rs.clearT > 0.05) continue;
    if (rs.points && rs.points.length >= 2) {
      rs._wrapPath = null; // force scene to use simulated points
    } else {
      const ends = endPositions(rs.id);
      if (!ends) continue;
      rs._wrapPath = wrapPolyline(ends[0].x, ends[0].y, ends[1].x, ends[1].y, pegs, PEG_R + ROPE_W * 0.85 + 8);
    }
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
      const t = easeInCubic(u);
      const x = flying.from.x + (flying.to.x - flying.from.x) * t;
      const y = flying.from.y + (flying.to.y - flying.from.y) * t;
      const high = scene.pegH + scene.capH + 0.55;
      const low = flying.onFloor === false
        ? (scene.pegH + scene.capH * 0.5)
        : scene.floorCapY();
      // Dive from lift height into floor/peg — satisfying 착 붙는
      const lift = high * (1 - t) + low * t;
      scene.setDragCap(
        { x, y },
        rs?.color || { hex: '#888', dark: '#444', light: '#ccc' },
        { lift, scale: flying.squash < 1 ? flying.squash : 1.05 }
      );
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

/** Demo/test: place a cap (from peg or floor) onto board CSS coords with snap. */
function placeCapAt(ropeId, end, x, y) {
  const rs = ropeStates.find(r => r.id === ropeId);
  if (!rs) return false;
  // Remove from peg if present
  for (const peg of pegs) {
    peg.stack = peg.stack.filter(c => !(c.ropeId === ropeId && c.end === end));
  }
  const ends = endPositions(ropeId);
  const from = ends ? { x: ends[end].x, y: ends[end].y } : { x, y };
  const resolved = resolveCapOverlap(
    clampToPlayArea(x, y).x,
    clampToPlayArea(x, y).y,
    ropeId, end
  );
  snapAnims.push({
    ropeId, end,
    from, to: resolved,
    t: 0, dur: SNAP_DUR, pegId: -1, squash: 1,
    pendingCap: { ropeId, end },
    kind: 'snap', onFloor: true,
    floorX: resolved.x, floorY: resolved.y,
    punched: false,
  });
  return true;
}

window.__tangle = {
  loadLevel, pegs: () => pegs, ropes: () => ropeStates,
  dragCapToPeg, dragRingToPeg: dragCapToPeg, placeCapAt,
  flushSnaps: () => {
    const pending = snapAnims.splice(0);
    for (const a of pending) finishSnap(a);
  },
  audio, coins: () => coins, timeLeft: () => timeLeft,
  checkClears: evaluateFrees, syncRopeEndsFromStacks, scene,
  measure: () => scene.measureScreenFractions(pegs),
  perf: () => window.__perf ? { fps: window.__perf.fps, physMs: window.__perf.physMs } : null,
  LEVEL_COUNT,
  getDragging: () => dragging,
  endPositions,
  pointerToBoard: (cx, cy) => pointerToBoard(cx, cy, true),
};
