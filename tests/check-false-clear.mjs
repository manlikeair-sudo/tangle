/**
 * False-clear / cascade tests:
 * 1) Levels 1-12 idle 8s → zero clears
 * 2) Force-uncross → that rope clears
 * 3) Cascade: when clearing A frees B, B starts only after A's pop + ~0.4s
 * 4) Visual-overlap but chord-free → must NOT clear (visible polyline wins)
 */
import { chromium } from 'playwright';
import fs from 'fs';

const VW = 834, VH = 1194;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 2 });
page.on('pageerror', e => console.error('PAGEERR', e.message));
await page.goto('http://127.0.0.1:8765/index.html?v=spring10i', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__tangle);

const idleResults = [];
for (let lv = 0; lv < 12; lv++) {
  await page.evaluate((idx) => window.__tangle.loadLevel(idx), lv);
  await page.waitForTimeout(8000);
  const report = await page.evaluate(() => {
    const ropes = window.__tangle.ropes();
    return {
      clearArmed: window.__tangle.clearArmed(),
      clearing: ropes.filter(r => r.clearing).map(r => r.id),
      freeT: ropes.map(r => +(r.freeT || 0).toFixed(3)),
    };
  });
  const ok = report.clearing.length === 0 && report.clearArmed === false;
  idleResults.push({ level: lv + 1, ok, ...report });
  console.log('IDLE_L' + (lv + 1), ok ? 'OK' : 'FAIL', JSON.stringify(report));
}

// --- Force uncross clear ---
await page.evaluate(() => window.__tangle.loadLevel(2));
await page.waitForTimeout(800);
const force = await page.evaluate(() => {
  const T = window.__tangle;
  const rid = T.ropes()[0].id;
  T.placeCapAt(rid, 0, 90, 980);
  T.placeCapAt(rid, 1, 160, 1000);
  T.flushSnaps();
  T.armClearCheck();
  return { chord: T.isCrossedLogical(0), vis: T.isCrossedVisible(0) };
});
console.log('FORCE_UNCROSS', JSON.stringify(force));
await page.waitForTimeout(3500);
const forceAfter = await page.evaluate(() => {
  const ropes = window.__tangle.ropes();
  return {
    clearing: ropes.filter(r => r.clearing || r._popped).map(r => r.id),
    crossed0Vis: window.__tangle.isCrossedVisible(0),
    freeT0: ropes[0]?.freeT || 0,
  };
});
console.log('FORCE_AFTER', JSON.stringify(forceAfter));
// After settle, rope 0 must be visually free and cleared (or clearing/popped)
const forceOk = forceAfter.crossed0Vis === false && forceAfter.clearing.includes(0);

// --- Cascade stagger ---
// Explicitly clear rope 0, leave others free-by-chord but possibly still vis-crossing;
// after rope 0 is gone, whatever becomes visually free must wait for pop+gap.
await page.evaluate(() => window.__tangle.loadLevel(0));
await page.waitForTimeout(800);
const cascade = await page.evaluate(async () => {
  const T = window.__tangle;
  const events = [];
  const t0 = performance.now();
  // Force-clear rope 0 (player solved it)
  T.startClearById(0);
  T.armClearCheck(); // remaining may cascade after stagger
  return await new Promise((resolve) => {
    const iv = setInterval(() => {
      const now = performance.now();
      for (const r of T.ropes()) {
        if (r.clearing && r._clearStartedAt && !r._loggedStart) {
          r._loggedStart = true;
          events.push({ type: 'clearStart', id: r.id, t: (r._clearStartedAt - t0) / 1000, vis: T.isCrossedVisible(T.ropes().indexOf(r)) });
        }
        if (r._popped && !r._loggedPop) {
          r._loggedPop = true;
          events.push({ type: 'pop', id: r.id, t: (now - t0) / 1000 });
        }
      }
      if ((now - t0) > 4500) {
        clearInterval(iv);
        resolve({ events, nextAllowed: T.nextClearAllowedAt() });
      }
    }, 40);
  });
});
console.log('CASCADE', JSON.stringify(cascade));
const starts = cascade.events.filter(e => e.type === 'clearStart').sort((a, b) => a.t - b.t);
let cascadeOk = starts.length >= 1 && starts[0].id === 0;
let cascadeNote = `n=${starts.length}`;
if (starts.length >= 2) {
  const gap = starts[1].t - starts[0].t;
  cascadeOk = cascadeOk && gap >= 0.5;
  cascadeNote = `gap=${gap.toFixed(3)} n=${starts.length} ids=${starts.map(s=>s.id).join(',')}`;
} else if (starts.length === 1) {
  cascadeNote = 'only-first (no cascade peers free)';
}
console.log('CASCADE_CHECK', cascadeOk ? 'OK' : 'FAIL', cascadeNote);

// --- Visual overlap but chord-free must NOT clear ---
await page.evaluate(() => window.__tangle.loadLevel(0));
await page.waitForTimeout(500);
const visCase = await page.evaluate(() => {
  const T = window.__tangle;
  const ropes = T.ropes();
  // Bend rope 0 midpoints into an S that crosses rope 1's chord,
  // while keeping ends where the end-to-end chord does NOT cross rope 1.
  const a = ropes[0], b = ropes[1];
  if (!a.points || !b.points) return { ok: false, reason: 'no points' };
  const endsA = T.endPositions(a.id);
  const endsB = T.endPositions(b.id);
  // Place ends of A so chord misses B's chord (parallel-ish far)
  // Keep actual peg ends; instead warp midpoints of A to cross B's path
  const midB = b.points[Math.floor(b.points.length / 2)];
  const n = a.points.length;
  for (let i = 1; i < n - 1; i++) {
    const t = i / (n - 1);
    // Pull mid toward midB so polylines cross, ends fixed
    const pull = Math.sin(t * Math.PI);
    a.points[i].x = a.points[i].x * (1 - pull * 0.85) + midB.x * pull * 0.85;
    a.points[i].y = a.points[i].y * (1 - pull * 0.85) + midB.y * pull * 0.85;
    a.points[i].ox = a.points[i].x;
    a.points[i].oy = a.points[i].y;
  }
  a._sleeping = true;
  a.wobble = 0;
  a._stillFrames = 99;
  b._sleeping = true;
  const chordA = T.isCrossedLogical(0);
  const visA = T.isCrossedVisible(0);
  // Arm clear — if chord says free but vis says crossed, must NOT clear rope 0
  // First park so chord is free: move ends of A far without updating midpoints... 
  // Actually after warp, check:
  return {
    chordA,
    visA,
    // Expect: vis true (midpoints cross). Chord may or may not.
    expectBlock: visA === true,
  };
});
console.log('VIS_OVERLAP', JSON.stringify(visCase));

// If visually crossed, arm clear and wait — must not clear that rope
let visOk = false;
if (visCase.visA === true) {
  await page.evaluate(() => {
    const T = window.__tangle;
    // Nudge a different rope to satisfy "player action" arm, without uncrossing 0
    T.armClearCheck();
  });
  await page.waitForTimeout(2500);
  const after = await page.evaluate(() => {
    const r0 = window.__tangle.ropes()[0];
    return {
      clearing0: !!r0.clearing,
      vis0: window.__tangle.isCrossedVisible(0),
      freeT0: r0.freeT || 0,
    };
  });
  console.log('VIS_AFTER', JSON.stringify(after));
  visOk = after.vis0 === true && after.clearing0 === false;
} else {
  // Couldn't construct visual cross — try explicit synthetic polylines via monkeypatch
  const synth = await page.evaluate(() => {
    const T = window.__tangle;
    const a = T.ropes()[0], b = T.ropes()[1];
    // Straight ends that don't chord-cross: A horizontal top, B horizontal bottom
    // But force midpoints to cross with an X
    const ax0 = 200, ay0 = 500, ax1 = 600, ay1 = 500;
    const bx0 = 200, by0 = 700, bx1 = 600, by1 = 700;
    // Set ends via floor placement
    a._ends = [{ pegId: -1, x: ax0, y: ay0 }, { pegId: -1, x: ax1, y: ay1 }];
    b._ends = [{ pegId: -1, x: bx0, y: by0 }, { pegId: -1, x: bx1, y: by1 }];
    // X midpoints
    const n = a.points.length;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      a.points[i].x = ax0 + (ax1 - ax0) * t;
      a.points[i].y = ay0 + (ay1 - ay0) * t;
      // Dip center down across B
      a.points[i].y += Math.sin(t * Math.PI) * 250;
      a.points[i].ox = a.points[i].x; a.points[i].oy = a.points[i].y;
    }
    for (let i = 0; i < b.points.length; i++) {
      const t = i / (b.points.length - 1);
      b.points[i].x = bx0 + (bx1 - bx0) * t;
      b.points[i].y = by0 + (by1 - by0) * t;
      b.points[i].ox = b.points[i].x; b.points[i].oy = b.points[i].y;
    }
    a._sleeping = true; b._sleeping = true;
    a.wobble = 0; b.wobble = 0;
    return {
      chordA: T.isCrossedLogical(0),
      visA: T.isCrossedVisible(0),
      chordB: T.isCrossedLogical(1),
      visB: T.isCrossedVisible(1),
    };
  });
  console.log('VIS_SYNTH', JSON.stringify(synth));
  // Horizontal chords don't cross; dipped A should cross B visually
  const synthGood = synth.chordA === false && synth.visA === true;
  if (synthGood) {
    await page.evaluate(() => window.__tangle.armClearCheck());
    await page.waitForTimeout(2500);
    const after = await page.evaluate(() => ({
      clearing0: !!window.__tangle.ropes()[0].clearing,
      vis0: window.__tangle.isCrossedVisible(0),
    }));
    console.log('VIS_SYNTH_AFTER', JSON.stringify(after));
    visOk = after.vis0 === true && after.clearing0 === false;
  } else {
    visOk = false;
    console.log('VIS_SYNTH_BUILD_FAIL');
  }
}

await browser.close();

const idleOk = idleResults.every(r => r.ok);
const allOk = idleOk && forceOk && cascadeOk && visOk;
fs.writeFileSync('/tmp/false-clear-results.json', JSON.stringify({
  idleOk, forceOk, cascadeOk, cascadeNote, visOk, visCase, force, forceAfter, cascade, allOk,
}, null, 2));
console.log(allOk ? 'FALSE_CLEAR_OK' : 'FALSE_CLEAR_FAIL',
  'idleOk', idleOk, 'forceOk', forceOk, 'cascadeOk', cascadeOk, 'visOk', visOk);
process.exit(allOk ? 0 : 1);
