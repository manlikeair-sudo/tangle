/**
 * Rope integrity: pin distance + color match.
 * - Baseline every checked level including L12 settled
 * - Every-frame samples during scripted drag + clear/pop
 */
import { chromium } from 'playwright';
import fs from 'fs';

const LEVELS = [0, 2, 7, 11]; // 1,3,8,12
const VW = 820, VH = 1180;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function sampleIntegrity(page, phase) {
  return page.evaluate((phase) => {
    const T = window.__tangle;
    const ropes = T.ropes();
    const scene = T.scene;
    const lim = scene.ropeR * 0.25;
    const rows = [];
    for (let i = 0; i < ropes.length; i++) {
      const rs = ropes[i];
      const clearing = !!rs.clearing;
      const entry = scene.ropes[i];
      const info = scene.meshEndWorld(i);
      const cap0 = scene.caps[i * 2], cap1 = scene.caps[i * 2 + 1];
      const seals = entry?.endCaps;
      const meshVis = !!(entry && entry.mesh && entry.mesh.visible);
      const drag = T.getDragging?.();
      const dragCovers = (end) => drag && drag.ropeId === rs.id && drag.end === end
        && scene.dragCap && scene.dragCap.visible;
      // Rope finished retracting: mesh, both caps, and both seals leave together.
      if (!meshVis) {
        const capLeft = (!!cap0?.visible && !dragCovers(0)) || (!!cap1?.visible && !dragCovers(1));
        const sealLeft = !!(seals && (seals[0]?.visible || seals[1]?.visible));
        const goneOk = !capLeft && !sealLeft;
        rows.push({
          i, id: rs.id, phase, clearing, clearT: clearing ? +rs.clearT.toFixed(3) : 0,
          pinOk: goneOk, colorOk: true, capsVisOk: !capLeft, sealsOk: !sealLeft,
          ok: goneOk, note: goneOk ? 'hidden-together' : 'orphan-after-hide', lim: +lim.toFixed(4),
        });
        continue;
      }
      if (!info) {
        rows.push({ i, id: rs.id, phase, pinOk: false, colorOk: false, ok: false, reason: 'no mesh ends', clearing });
        continue;
      }
      const xz0 = Math.hypot(info.a.x - info.capA.x, info.a.z - info.capA.z);
      const xz1 = Math.hypot(info.b.x - info.capB.x, info.b.z - info.capB.z);
      const colorOk = info.colorHex === rs.color.hex
        && info.capColorA === rs.color.hex
        && info.capColorB === rs.color.hex;
      const capsVisOk = (!!cap0?.visible || dragCovers(0)) && (!!cap1?.visible || dragCovers(1));
      const sealsOk = !!(seals && seals[0] && seals[1] && seals[0].visible && seals[1].visible);
      const pinOk = xz0 <= lim && xz1 <= lim;
      rows.push({
        i, id: rs.id, phase, clearing, clearT: clearing ? +rs.clearT.toFixed(3) : 0,
        ropeColor: rs.color.hex, capA: info.capColorA, capB: info.capColorB,
        xz0: +xz0.toFixed(4), xz1: +xz1.toFixed(4), lim: +lim.toFixed(4),
        pinOk, colorOk, capsVisOk, sealsOk,
        ok: pinOk && colorOk && capsVisOk && sealsOk,
      });
    }
    return { phase, ropeR: scene.ropeR, rows };
  }, phase);
}

async function checkLevel(page, levelIdx) {
  await page.evaluate((idx) => window.__tangle.loadLevel(idx), levelIdx);
  await page.waitForTimeout(900);
  // Wait for sleep on most ropes
  await page.waitForTimeout(2200);

  const baseline = await sampleIntegrity(page, 'baseline');

  // Scripted drag
  const start = await page.evaluate(() => {
    const peg = window.__tangle.pegs().find(p => p.stack.length);
    if (!peg) return null;
    const scr = window.__tangle.scene.projectCapOnPeg(peg);
    const cap = peg.stack.at(-1);
    return { x: scr.x, y: scr.y, ropeId: cap.ropeId, end: cap.end };
  });

  const frameSamples = [];
  let midDrag = { rows: [] };
  if (start) {
    const tx = 160, ty = 820;
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    for (let i = 1; i <= 16; i++) {
      const t = i / 16;
      await page.mouse.move(start.x + (tx - start.x) * t, start.y + (ty - start.y) * t);
      await page.waitForTimeout(16);
      const s = await sampleIntegrity(page, 'drag-' + i);
      frameSamples.push(s);
      if (i === 8) midDrag = s;
    }
    await page.mouse.up();
    await page.waitForTimeout(400);
    await page.evaluate(() => window.__tangle.flushSnaps?.());
    await page.waitForTimeout(300);
    frameSamples.push(await sampleIntegrity(page, 'after-snap'));
  }

  const afterDrag = await sampleIntegrity(page, 'afterDrag');

  // Force a clear on this level if possible (park one rope far) and sample every frame of retract
  const clearSamples = [];
  const forced = await page.evaluate(() => {
    const T = window.__tangle;
    const rid = T.ropes().find(r => !r.clearing)?.id;
    if (rid == null) return null;
    T.placeCapAt(rid, 0, 80, 980);
    T.placeCapAt(rid, 1, 150, 1000);
    T.flushSnaps();
    T.armClearCheck();
    return { rid, crossed: T.isCrossedLogical(T.ropes().findIndex(r => r.id === rid)) };
  });
  if (forced && forced.crossed === false) {
    // Poll for up to 2.5s capturing integrity while clearing
    const streamed = await page.evaluate(() => new Promise((resolve) => {
      const T = window.__tangle;
      const scene = T.scene;
      const lim = scene.ropeR * 0.25;
      const rows = [];
      let n = 0;
      const step = () => {
        const ropes = T.ropes();
        for (let i = 0; i < ropes.length; i++) {
          const rs = ropes[i];
          if (!rs.clearing && n > 2) continue;
          const entry = scene.ropes[i];
          const info = scene.meshEndWorld(i);
          const meshVis = !!(entry && entry.mesh && entry.mesh.visible);
          const cap0 = scene.caps[i * 2], cap1 = scene.caps[i * 2 + 1];
          const seals = entry?.endCaps;
          const drag = T.getDragging?.();
          const dragCovers = (end) => drag && drag.ropeId === rs.id && drag.end === end && scene.dragCap && scene.dragCap.visible;
          let ok = false, pinOk = false, colorOk = false, capsVisOk = false, sealsOk = false;
          let xz0 = null, xz1 = null;
          if (!meshVis) {
            const capLeft = (!!cap0?.visible && !dragCovers(0)) || (!!cap1?.visible && !dragCovers(1));
            const sealLeft = !!(seals && (seals[0]?.visible || seals[1]?.visible));
            ok = !capLeft && !sealLeft;
            pinOk = ok; colorOk = true; capsVisOk = !capLeft; sealsOk = !sealLeft;
          } else if (info) {
            xz0 = Math.hypot(info.a.x - info.capA.x, info.a.z - info.capA.z);
            xz1 = Math.hypot(info.b.x - info.capB.x, info.b.z - info.capB.z);
            colorOk = info.colorHex === rs.color.hex && info.capColorA === rs.color.hex && info.capColorB === rs.color.hex;
            capsVisOk = (!!cap0?.visible || dragCovers(0)) && (!!cap1?.visible || dragCovers(1));
            sealsOk = !!(seals && seals[0] && seals[1] && seals[0].visible && seals[1].visible);
            pinOk = xz0 <= lim && xz1 <= lim;
            ok = pinOk && colorOk && capsVisOk && sealsOk;
          }
          rows.push({
            i, id: rs.id, phase: 'clear-frame-' + n, clearing: !!rs.clearing,
            clearT: rs.clearing ? +rs.clearT.toFixed(3) : 0,
            xz0: xz0 == null ? null : +xz0.toFixed(4),
            xz1: xz1 == null ? null : +xz1.toFixed(4),
            lim: +lim.toFixed(4), pinOk, colorOk, capsVisOk, sealsOk, ok,
          });
        }
        n++;
        if (n < 40) requestAnimationFrame(step);
        else resolve({ phase: 'clear-frames', ropeR: scene.ropeR, rows });
      };
      requestAnimationFrame(step);
    }));
    clearSamples.push(streamed);
  }

  return { level: levelIdx + 1, baseline, midDrag, afterDrag, frameSamples, clearSamples, forced };
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 2 });
page.on('pageerror', e => console.error('PAGEERR', e.message));
await page.goto('http://127.0.0.1:8765/index.html?v=spring10i', { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await page.evaluate(() => window.__tangle.audio.unlock());

const results = [];
let allOk = true;
for (const lv of LEVELS) {
  const r = await checkLevel(page, lv);
  results.push(r);
  const packs = [r.baseline, r.midDrag, r.afterDrag, ...(r.frameSamples || []), ...(r.clearSamples || [])];
  const fail = packs.flatMap(p => (p.rows || []).filter(row => row.ok === false || (row.pinOk === false || row.colorOk === false)));
  console.log('LEVEL', r.level,
    'baseFails', (r.baseline.rows || []).filter(x => x.ok === false).length,
    'clearSamples', (r.clearSamples || []).length,
    'fails', fail.length);
  if (fail.length) {
    allOk = false;
    console.log(JSON.stringify(fail.slice(0, 8), null, 2));
  }
}

// Settled L12 screenshot (reload clean, no drag)
await page.evaluate(() => window.__tangle.loadLevel(11));
await page.waitForTimeout(3500);
const settled = await sampleIntegrity(page, 'l12-settled-shot');
console.log('L12_SETTLED', JSON.stringify({
  fails: settled.rows.filter(r => !r.ok).length,
  seals: settled.rows.map(r => r.sealsOk),
  caps: settled.rows.map(r => r.capsVisOk),
}));
await page.screenshot({ path: '/opt/cursor/artifacts/level12_settled_ipad.png', type: 'png' });
await browser.close();

const out = { allOk, results, settled, checkedAt: new Date().toISOString() };
fs.writeFileSync('/tmp/rope-integrity.json', JSON.stringify(out, null, 2));
console.log(allOk ? 'INTEGRITY_OK' : 'INTEGRITY_FAIL');
process.exit(allOk ? 0 : 1);
