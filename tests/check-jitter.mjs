/**
 * iPad-timing jitter test.
 *
 * Drives the sim with a deterministic mix of 8.3 / 16.7 / 33ms frames (plus
 * jitter) so a frame can take 0, 1, or 2 fixed 120Hz substeps. Measures the
 * rendered tube vertices and the braid phase, not sleeping physics points.
 *
 * Baseline on main (level 12), before this fix — irregular dt, rendered mesh:
 *   rest:        maxVert 132.9px  twist 180°  dRepeat 2.09  seg-count pops 24/220
 *                3 ropes never slept (ids 0, 4, 9), phys max 15.5px
 *   hold still:  maxVert 141.1px  twist 180°  dRepeat 2.97  pops 128/150
 *                maxVert while that rope's points were still: 83px
 *   hold ±0.5px: maxVert 118.8px  twist 180°  dRepeat 3.06  pops 135/150
 *                maxVert at zero physics-point motion: 96px
 * The old test reported maxDisp=0 because it only compared sleeping physics
 * points on steady rAF and ignored the rendered tube.
 */
import { chromium } from 'playwright';

const VW = 834, VH = 1194;
const BASE = 'http://127.0.0.1:8765/index.html?v=spring11a';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeDtSequence(n, seed) {
  const rng = mulberry32(seed);
  const palette = [8.3, 16.7, 33.3, 8.33, 16.67, 7.2, 9.1, 12.4, 15.2, 18.6, 22.0, 27.5, 33.0, 4.2, 11.0, 14.8];
  const out = [];
  for (let i = 0; i < n; i++) {
    const base = palette[Math.floor(rng() * palette.length)];
    out.push(Math.max(0.4, +(base + (rng() - 0.5) * 1.4).toFixed(3)));
  }
  return out;
}

const dts = makeDtSequence(48, 11);
const has0 = dts.some(d => d < 8.2);
const has1 = dts.some(d => d >= 8.3 && d < 12.5);
const has2 = dts.some(d => d >= 14 && d <= 20);
if (!has0 || !has1 || !has2) {
  console.error('DT_MIX_FAIL', { has0, has1, has2 });
  process.exit(1);
}

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(() => {
  window.__simNow = 0;
  window.__rafQ = [];
  try {
    Object.defineProperty(performance, 'now', { configurable: true, writable: true, value: () => window.__simNow });
  } catch (_) { performance.now = () => window.__simNow; }
  window.requestAnimationFrame = (fn) => { window.__rafQ.push(fn); return 1; };
  window.cancelAnimationFrame = () => {};
  window.__pump = (dt) => {
    window.__simNow += dt;
    const q = window.__rafQ.splice(0);
    for (const fn of q) fn(window.__simNow);
  };
});
await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForFunction(() => window.__tangle && window.__pump);
page.setDefaultTimeout(180000);

const summary = await page.evaluate(async (dts) => {
  const T = window.__tangle;
  const STRIDE = 37;
  const pxPerWu = window.innerWidth / (T.scene.VIEW_W || 10);
  window.__pump(16.7);
  T.loadLevel(11);
  window.__pump(16.7);

  function capture() {
    return T.ropes().map((rs, i) => {
      const entry = T.scene.ropes[i];
      const phys = [];
      if (rs.points) for (let k = 1; k < rs.points.length - 1; k++) phys.push(rs.points[k].x, rs.points[k].y);
      let pos = null, repeat = 0, segs = 0;
      const mesh = entry && entry.mesh;
      if (mesh && mesh.geometry) {
        const pa = mesh.geometry.getAttribute('position');
        if (pa) {
          pos = Float32Array.from(pa.array);
          segs = Math.round(pa.count / STRIDE) - 1;
        }
        if (mesh.material && mesh.material.map) repeat = mesh.material.map.repeat.x;
      }
      let sag = 0;
      if (rs.points && rs.points.length > 4) {
        const p = rs.points;
        const n = p.length;
        const m = p[n >> 1];
        const ax = p[0].x, ay = p[0].y, bx = p[n - 1].x, by = p[n - 1].y;
        const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1;
        const t = ((m.x - ax) * dx + (m.y - ay) * dy) / L;
        const cross = (m.x - ax) * dy - (m.y - ay) * dx;
        const side = cross >= 0 ? 1 : -1;
        sag = Math.hypot(m.x - (ax + dx * t), m.y - (ay + dy * t)) * side;
      }
      return { phys, pos, segs, repeat, sleeping: !!rs._sleeping, sag };
    });
  }

  function maxPair(a, b) {
    let phys = 0, vert = 0, twist = 0, dRep = 0, countChange = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      const A = a[i], B = b[i];
      const np = Math.min(A.phys.length, B.phys.length) / 2;
      for (let k = 0; k < np; k++) {
        phys = Math.max(phys, Math.hypot(A.phys[k * 2] - B.phys[k * 2], A.phys[k * 2 + 1] - B.phys[k * 2 + 1]));
      }
      dRep = Math.max(dRep, Math.abs((A.repeat || 0) - (B.repeat || 0)));
      if (A.pos && B.pos && A.pos.length === B.pos.length && A.segs === B.segs) {
        for (let k = 0; k < A.pos.length; k += 12) {
          vert = Math.max(vert, Math.hypot(A.pos[k] - B.pos[k], A.pos[k + 1] - B.pos[k + 1], A.pos[k + 2] - B.pos[k + 2]));
        }
        const ring = Math.max(0, Math.floor((A.segs + 1) * 0.5));
        const base = ring * STRIDE * 3;
        if (base + 2 < A.pos.length) {
          let acx = 0, acy = 0, acz = 0, bcx = 0, bcy = 0, bcz = 0;
          for (let j = 0; j < STRIDE; j++) {
            const o = (ring * STRIDE + j) * 3;
            acx += A.pos[o]; acy += A.pos[o + 1]; acz += A.pos[o + 2];
            bcx += B.pos[o]; bcy += B.pos[o + 1]; bcz += B.pos[o + 2];
          }
          const inv = 1 / STRIDE;
          const adx = A.pos[base] - acx * inv, ady = A.pos[base + 1] - acy * inv, adz = A.pos[base + 2] - acz * inv;
          const bdx = B.pos[base] - bcx * inv, bdy = B.pos[base + 1] - bcy * inv, bdz = B.pos[base + 2] - bcz * inv;
          const al = Math.hypot(adx, ady, adz) || 1, bl = Math.hypot(bdx, bdy, bdz) || 1;
          const dot = Math.max(-1, Math.min(1, (adx * bdx + ady * bdy + adz * bdz) / (al * bl)));
          twist = Math.max(twist, Math.acos(dot) * 180 / Math.PI);
        }
      } else if (A.pos && B.pos) {
        countChange++;
        vert = Math.max(vert, 1);
      }
    }
    return { phys, vert: vert * pxPerWu, twist, dRep, countChange };
  }

  function stat(frames) {
    const pick = (k) => frames.map(f => f[k]);
    const max = (k) => Math.max(0, ...pick(k));
    const avg = (k) => pick(k).reduce((s, v) => s + v, 0) / (frames.length || 1);
    return {
      frames: frames.length,
      phys: { max: max('phys'), avg: avg('phys') },
      vert: { max: max('vert'), avg: avg('vert') },
      twist: { max: max('twist'), avg: avg('twist') },
      dRep: { max: max('dRep'), avg: avg('dRep') },
      countChanges: frames.reduce((s, f) => s + f.countChange, 0),
    };
  }

  function pumpFrames(list, opts = {}) {
    const frames = [];
    let prev = capture();
    let noiseI = 3;
    let sim = 0;
    for (const dt of list) {
      if (opts.hold) {
        const nEv = Math.max(1, Math.round(dt / (1000 / 240)));
        for (let e = 0; e < nEv; e++) {
          let x = opts.hold.x, y = opts.hold.y;
          if (opts.noise) {
            const h = Math.sin(noiseI * 12.9898) * 43758.5453;
            const h2 = Math.sin(noiseI * 78.233) * 43758.5453;
            noiseI++;
            x += ((h - Math.floor(h)) * 2 - 1) * 0.5;
            y += ((h2 - Math.floor(h2)) * 2 - 1) * 0.5;
          }
          opts.hold.target.dispatchEvent(new PointerEvent('pointermove', {
            clientX: x, clientY: y, pointerId: 1, bubbles: true,
            pointerType: 'touch', isPrimary: true, buttons: 1,
          }));
        }
      }
      window.__pump(dt);
      sim += dt;
      const cur = capture();
      const m = maxPair(prev, cur);
      m.dt = dt;
      m.sim = sim;
      m.sag = cur[opts.ropeIndex || 0] ? cur[opts.ropeIndex || 0].sag : 0;
      frames.push(m);
      prev = cur;
    }
    const block = stat(frames);
    block.sleeping = prev.map(r => r.sleeping);
    block.segs = [...new Set(prev.map(r => r.segs))];
    return { block, frames, prev };
  }

  const steady = (n) => Array.from({ length: n }, () => 16.667);
  pumpFrames(steady(80));
  const rest = pumpFrames(dts).block;

  const canvas = document.getElementById('game');
  const peg = T.pegs().find(p => p.stack && p.stack.length);
  const scr = T.scene.projectCapOnPeg(peg);
  const ropeIndex = T.ropes().findIndex(r => r.id === peg.stack.at(-1).ropeId);
  canvas.dispatchEvent(new PointerEvent('pointerdown', {
    clientX: scr.x, clientY: scr.y, pointerId: 1, bubbles: true,
    pointerType: 'touch', isPrimary: true, buttons: 1,
  }));
  window.__pump(16.7);
  const hold = { x: scr.x + 100, y: scr.y + 70, target: canvas };
  for (let i = 1; i <= 18; i++) {
    const t = i / 18;
    canvas.dispatchEvent(new PointerEvent('pointermove', {
      clientX: scr.x + (hold.x - scr.x) * t,
      clientY: scr.y + (hold.y - scr.y) * t,
      pointerId: 1, bubbles: true, pointerType: 'touch', isPrimary: true, buttons: 1,
    }));
    window.__pump(16.7);
  }
  pumpFrames(steady(45), { hold });
  const holdStill = pumpFrames(dts, { hold, noise: false }).block;
  const holdNoise = pumpFrames(dts, { hold, noise: true }).block;

  // 120Hz drag: pointer moves every frame. Interpolation should keep the
  // tube moving on frames that take zero physics substeps.
  const smooth = [];
  let prevS = capture();
  for (let i = 1; i <= 24; i++) {
    canvas.dispatchEvent(new PointerEvent('pointermove', {
      clientX: hold.x + i * 5,
      clientY: hold.y + i * 2,
      pointerId: 1, bubbles: true, pointerType: 'touch', isPrimary: true, buttons: 1,
    }));
    window.__pump(8.3);
    const cur = capture();
    smooth.push(maxPair(prevS, cur).vert);
    prevS = cur;
  }
  const smMean = smooth.reduce((s, v) => s + v, 0) / smooth.length;
  const smMin = Math.min(...smooth);

  const rel = pumpFrames(dts, { ropeIndex });
  // overshoot of the dragged rope's sag after the finger lets go
  let overs = 0, prevV = 0, settleMs = null;
  for (let i = 1; i < rel.frames.length; i++) {
    const v = rel.frames[i].sag - rel.frames[i - 1].sag;
    if (prevV * v < 0 && Math.abs(v) > 1.2 && Math.abs(prevV) > 1.2) overs++;
    if (Math.abs(v) > 0.4) prevV = v;
    if (settleMs == null && rel.frames[i].sim > 200) {
      const tail = rel.frames.slice(i);
      if (tail.length > 4 && tail.every(f => f.vert < 0.05 && f.phys < 0.05)) settleMs = rel.frames[i].sim;
    }
  }
  const tailFrames = rel.frames.filter(f => f.sim >= 550);
  const tail = stat(tailFrames.length ? tailFrames : rel.frames.slice(-6));
  tail.sleeping = rel.block.sleeping;

  return {
    pxPerWu,
    rest, holdStill, holdNoise, tail,
    release: rel.block,
    overs,
    settleMs,
    smooth: { mean: smMean, min: smMin, ratio: smMin / Math.max(1e-6, smMean), samples: smooth.map(v => +v.toFixed(2)) },
    clearing: T.ropes().filter(r => r.clearing).map(r => r.id),
  };
}, dts);

await browser.close();
const round = (v) => {
  if (Array.isArray(v)) return v.map(round);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) o[k] = round(v[k]);
    return o;
  }
  return typeof v === 'number' ? Math.round(v * 1000) / 1000 : v;
};
const out = round(summary);
console.log('AFTER', JSON.stringify(out, null, 2));
if (errors.length) console.log('PAGEERR', errors);

function stillOk(block) {
  return block
    && block.vert.max < 0.05
    && block.twist.max < 0.05
    && block.dRep.max < 0.001
    && block.phys.max < 0.05
    && block.countChanges === 0
    && block.sleeping.every(Boolean);
}
const restOk = stillOk(out.rest);
const holdOk = stillOk(out.holdStill) && stillOk(out.holdNoise);
const tailOk = stillOk(out.tail);
const releaseOk = out.overs <= 1 && (out.settleMs == null || out.settleMs <= 550) && tailOk && out.release.countChanges === 0;
const smoothOk = out.smooth.min > 0.15 && out.smooth.ratio > 0.25;
const noClear = out.clearing.length === 0;
const pass = restOk && holdOk && releaseOk && smoothOk && noClear && errors.length === 0;
console.log(pass ? 'JITTER_OK' : 'JITTER_FAIL', {
  restOk, holdOk, releaseOk, smoothOk, noClear,
  restVert: out.rest.vert.max,
  holdNoiseVert: out.holdNoise.vert.max,
  holdStillVert: out.holdStill.vert.max,
  tailVert: out.tail.vert.max,
  overs: out.overs,
  settleMs: out.settleMs,
  smoothMin: out.smooth.min,
  smoothRatio: out.smooth.ratio,
});
process.exit(pass ? 0 : 1);
