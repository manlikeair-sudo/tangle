import { chromium } from 'playwright';
import fs from 'fs';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 780, height: 1100 },
  deviceScaleFactor: 2,
});

await page.goto('http://127.0.0.1:8765/', { waitUntil: 'networkidle' });
await page.waitForTimeout(600);

// unlock audio with a click
await page.click('#game', { position: { x: 10, y: 10 } });
await page.waitForTimeout(200);

await page.screenshot({ path: '/workspace/tangle-shot-initial.png', type: 'png' });

// Inspect level state
const info = await page.evaluate(() => {
  const pegs = window.__tangle.pegs();
  const ropes = window.__tangle.ropes();
  return {
    pegCount: pegs.length,
    ropeCount: ropes.length,
    stacks: pegs.map(p => ({ id: p.id, n: p.stack.length, stack: p.stack, x: p.x, y: p.y })),
    ropes: ropes.map(r => ({ id: r.id, color: r.color.name, ends: r._ends })),
  };
});
console.log(JSON.stringify(info, null, 2));

// Load a simple level 0 and try to clear a rope by putting both ends on same peg
// Find a rope whose ends are on different pegs, move one onto the other
const plan = await page.evaluate(() => {
  const pegs = window.__tangle.pegs();
  const ropes = window.__tangle.ropes();
  for (const r of ropes) {
    if (!r._ends || !r._ends[0] || !r._ends[1]) continue;
    const a = r._ends[0], b = r._ends[1];
    if (a.pegId === b.pegId) continue;
    // which end is on top of its peg?
    const pegA = pegs[a.pegId], pegB = pegs[b.pegId];
    const topA = pegA.stack[pegA.stack.length - 1];
    const topB = pegB.stack[pegB.stack.length - 1];
    if (topA && topA.ropeId === r.id) {
      return { from: a.pegId, to: b.pegId, ropeId: r.id, end: a.end };
    }
    if (topB && topB.ropeId === r.id) {
      return { from: b.pegId, to: a.pegId, ropeId: r.id, end: b.end };
    }
  }
  return null;
});
console.log('plan', plan);

if (plan) {
  // drag visually via pointer events for nicer demo recording later
  const coords = await page.evaluate((plan) => {
    const pegs = window.__tangle.pegs();
    const from = pegs[plan.from], to = pegs[plan.to];
    return {
      fx: from.x, fy: from.y - (from.stack.length - 1) * 5,
      tx: to.x, ty: to.y - to.stack.length * 5,
    };
  }, plan);

  await page.mouse.move(coords.fx, coords.fy);
  await page.mouse.down();
  // animate drag
  const steps = 20;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = coords.fx + (coords.tx - coords.fx) * t;
    const y = coords.fy + (coords.ty - coords.fy) * t - Math.sin(t * Math.PI) * 40;
    await page.mouse.move(x, y);
    await page.waitForTimeout(25);
  }
  await page.mouse.up();
  await page.waitForTimeout(700);
}

await page.screenshot({ path: '/workspace/tangle-shot-after.png', type: 'png' });

// Try to clear by API moves: put both ends adjacent
const clearResult = await page.evaluate(() => {
  const pegs = window.__tangle.pegs();
  const ropes = window.__tangle.ropes();
  // find any rope with ends on different pegs; move top end onto the other if top
  let moved = 0;
  for (let attempt = 0; attempt < 30; attempt++) {
    let did = false;
    for (const r of ropes) {
      if (r.clearing) continue;
      const a = r._ends?.[0], b = r._ends?.[1];
      if (!a || !b) continue;
      if (a.pegId === b.pegId && Math.abs(a.stackIndex - b.stackIndex) === 1) continue;
      // try move a onto b's peg if a is top
      const pegA = pegs[a.pegId];
      const top = pegA.stack[pegA.stack.length - 1];
      if (top && top.ropeId === r.id && top.end === a.end) {
        const dest = pegs[b.pegId];
        if (dest.stack.length < dest.capacity) {
          window.__tangle.dragRingToPeg(a.pegId, b.pegId);
          moved++; did = true; break;
        }
      }
      const pegB = pegs[b.pegId];
      const topB = pegB.stack[pegB.stack.length - 1];
      if (topB && topB.ropeId === r.id && topB.end === b.end) {
        const dest = pegs[a.pegId];
        if (dest.stack.length < dest.capacity) {
          window.__tangle.dragRingToPeg(b.pegId, a.pegId);
          moved++; did = true; break;
        }
      }
    }
    if (!did) break;
  }
  return { moved, ropes: ropes.map(r => ({ id: r.id, clearing: r.clearing, ends: r._ends })) };
});
console.log('clearResult', JSON.stringify(clearResult, null, 2));
await page.waitForTimeout(900);
await page.screenshot({ path: '/workspace/tangle-shot-clear.png', type: 'png' });

await browser.close();
console.log('done');
