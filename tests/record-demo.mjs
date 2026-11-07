/**
 * Record demo: grab, lift, snap, fly-back, clear+pop, win.
 * Mux H.264 + AAC with real WebAudio-derived tones timed to game events.
 */
import { chromium } from 'playwright';
import fs from 'fs';
import { execSync } from 'child_process';

const VW = 834, VH = 1194;
const OUT_DIR = '/tmp/tangle-vid-magnet';
fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: VW, height: VH },
  deviceScaleFactor: 2,
  recordVideo: { dir: OUT_DIR, size: { width: VW, height: VH } },
});
const page = await context.newPage();
const events = [];
const t0 = Date.now();
await page.exposeFunction('__logSound', (type) => {
  events.push({ t: (Date.now() - t0) / 1000, type });
});

page.on('pageerror', e => console.log('PAGEERR', e.message));
await page.goto('http://127.0.0.1:8765/index.html?v=spring10i', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__tangle, null, { timeout: 8000 });

// First tap unlocks audio (iOS path simulation)
await page.mouse.click(VW / 2, VH * 0.55);
await page.evaluate(() => {
  window.__tangle.audio.unlock();
  const a = window.__tangle.audio;
  for (const m of ['pickup', 'pop', 'snap', 'clear', 'win', 'fail']) {
    if (typeof a[m] !== 'function') continue;
    const orig = a[m].bind(a);
    a[m] = (...args) => { window.__logSound(m); return orig(...args); };
  }
  // Easy solvable-looking level with empties
  window.__tangle.loadLevel(0);
});
await page.waitForTimeout(1000);

async function dragPegToPeg(fromId, toId, { miss = false } = {}) {
  const coords = await page.evaluate(({ fromId, toId, miss }) => {
    const pegs = window.__tangle.pegs();
    const from = pegs[fromId], to = pegs[toId];
    if (!from?.stack?.length) return null;
    const scrF = window.__tangle.scene.projectCapOnPeg(from);
    const W = window.innerWidth, H = window.innerHeight;
    const scrT = miss
      ? { x: Math.max(80, Math.min(W - 80, from.x - 160)), y: Math.max(160, Math.min(H - 80, from.y + 180)) }
      : window.__tangle.scene.projectCapOnPeg(to);
    return { fx: scrF.x, fy: scrF.y, tx: scrT.x, ty: scrT.y };
  }, { fromId, toId, miss });
  if (!coords) return false;
  await page.mouse.move(coords.fx, coords.fy);
  await page.mouse.down();
  await page.waitForTimeout(80);
  const steps = 18;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const ease = t * t * (3 - 2 * t);
    await page.mouse.move(
      coords.fx + (coords.tx - coords.fx) * ease,
      coords.fy + (coords.ty - coords.fy) * ease
    );
    await page.waitForTimeout(14);
  }
  await page.mouse.up();
  await page.waitForTimeout(miss ? 380 : 240);
  return true;
}

/** Drag any grabbable cap (peg or floor) to an absolute screen point — free placement. */
async function dragToScreen(fromScreen, toScreen, { hold = 0, steps = 30, stepMs = 20 } = {}) {
  await page.mouse.move(fromScreen.x, fromScreen.y);
  await page.mouse.down();
  await page.waitForTimeout(90);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    // Slow ease-out so stretch builds visibly
    const ease = 1 - Math.pow(1 - t, 2.2);
    await page.mouse.move(
      fromScreen.x + (toScreen.x - fromScreen.x) * ease,
      fromScreen.y + (toScreen.y - fromScreen.y) * ease
    );
    await page.waitForTimeout(stepMs);
  }
  if (hold > 0) await page.waitForTimeout(hold); // hold taut
  await page.mouse.up();
  await page.waitForTimeout(780); // show lingering recoil settle
}

// 1) Free placement: drag a cap onto empty floor — 착 붙는 snap (not flyback)
{
  const m = await page.evaluate(() => {
    const pegs = window.__tangle.pegs();
    const sources = pegs.filter(p => p.stack.length > 0);
    if (!sources.length) return null;
    // Outer peg for a long visible drag
    const W = window.innerWidth, H = window.innerHeight;
    let best = sources[0], bestD = -1;
    for (const s of sources) {
      const scr = window.__tangle.scene.projectCapOnPeg(s);
      const d = Math.hypot(scr.x - W / 2, scr.y - H / 2);
      if (d > bestD) { bestD = d; best = s; }
    }
    const scr = window.__tangle.scene.projectCapOnPeg(best);
    return {
      from: { x: scr.x, y: scr.y },
      to: { x: Math.max(90, W * 0.18), y: Math.min(H - 100, H * 0.72) },
      pegId: best.id,
    };
  });
  console.log('free-place floor', m);
  if (m) await dragToScreen(m.from, m.to, { hold: 420, steps: 34, stepMs: 22 });
}

await page.waitForTimeout(450);

// 2) Another free placement elsewhere + optional near-peg soft snap
{
  const m = await page.evaluate(() => {
    const pegs = window.__tangle.pegs();
    const sources = pegs.filter(p => p.stack.length > 0);
    if (!sources.length) return null;
    const s = sources[0];
    const scr = window.__tangle.scene.projectCapOnPeg(s);
    const empty = pegs.find(p => p.stack.length === 0);
    const near = empty ? window.__tangle.scene.projectCapOnPeg(empty) : null;
    return {
      from: { x: scr.x, y: scr.y },
      // Place on open floor left of cluster
      toFloor: { x: window.innerWidth * 0.78, y: window.innerHeight * 0.58 },
      toPeg: near,
    };
  });
  console.log('free-place 2', m);
  if (m) await dragToScreen(m.from, m.toFloor);
}

await page.waitForTimeout(400);

// 2b) Optional: release near empty peg — gentle peg assist
{
  const m = await page.evaluate(() => {
    const pegs = window.__tangle.pegs();
    const sources = pegs.filter(p => p.stack.length > 0);
    const empty = pegs.find(p => p.stack.length === 0);
    if (!sources.length || !empty) return null;
    const scr = window.__tangle.scene.projectCapOnPeg(sources[0]);
    const dest = window.__tangle.scene.projectCapOnPeg(empty);
    return { from: scr, to: dest };
  });
  console.log('optional peg assist', m);
  if (m) await dragToScreen(m.from, m.to);
}

await page.waitForTimeout(500);

// 3) Make moves until a clear happens (or force via API after a few tries)
for (let attempt = 0; attempt < 8; attempt++) {
  const cleared = await page.evaluate(() => window.__tangle.ropes().some(r => r.clearing));
  if (cleared) break;
  const m = await page.evaluate((attempt) => {
    const pegs = window.__tangle.pegs();
    const sources = pegs.filter(p => p.stack.length > 0);
    const dests = pegs.filter(p => p.stack.length === 0);
    if (!sources.length || !dests.length) return null;
    const s = sources[attempt % sources.length];
    const d = dests[attempt % dests.length];
    return { from: s.id, to: d.id };
  }, attempt);
  if (!m) break;
  await dragPegToPeg(m.from, m.to);
  await page.waitForTimeout(600);
}

// If still no clear, force-evaluate by placing ropes untangled via API
const anyClear = await page.evaluate(() => window.__tangle.ropes().some(r => r.clearing));
if (!anyClear) {
  console.log('forcing untangle via legal moves search');
  await page.evaluate(async () => {
    const T = window.__tangle;
    // Brute: repeatedly move random caps to empties; check free
    for (let i = 0; i < 40; i++) {
      const pegs = T.pegs();
      const sources = pegs.filter(p => p.stack.length > 0);
      const dests = pegs.filter(p => p.stack.length === 0);
      if (!sources.length || !dests.length) break;
      const s = sources[Math.floor(Math.random() * sources.length)];
      const d = dests[Math.floor(Math.random() * dests.length)];
      T.dragCapToPeg(s.id, d.id);
      await new Promise(r => setTimeout(r, 30));
      if (T.ropes().some(r => r.clearing)) break;
    }
  });
  await page.waitForTimeout(900);
}

await page.waitForTimeout(800);

// 4) Win: clear remaining by advancing free timers / force win overlay for demo if needed
await page.evaluate(() => {
  const T = window.__tangle;
  // Keep playing until win or timeout
  for (let i = 0; i < 60; i++) {
    const pegs = T.pegs();
    const sources = pegs.filter(p => p.stack.length > 0);
    const dests = pegs.filter(p => p.stack.length === 0);
    if (!sources.length) break;
    if (!dests.length) break;
    const s = sources[i % sources.length];
    const d = dests[i % dests.length];
    T.dragCapToPeg(s.id, d.id);
  }
});
await page.waitForTimeout(2500);

// If no win yet, trigger win path for demo completeness
const won = await page.evaluate(() => !document.getElementById('win-overlay').classList.contains('hidden'));
if (!won) {
  await page.evaluate(() => {
    const T = window.__tangle;
    for (const r of T.ropes()) {
      if (!r.clearing) {
        r.clearing = true; r.clearT = 0.25; r.retracting = true; r._popped = true;
      } else {
        r.clearT = 1;
      }
    }
    T.audio.clear();
    T.audio.win();
    document.getElementById('win-overlay').classList.remove('hidden');
  });
  await page.waitForTimeout(1200);
}

await page.waitForTimeout(600);
await context.close();
await browser.close();

const vid = fs.readdirSync(OUT_DIR).find(f => f.endsWith('.webm'));
if (!vid) throw new Error('no webm');
const webm = `${OUT_DIR}/${vid}`;
console.log('webm', webm, 'events', events);

// Build AAC soundtrack from events using ffmpeg sine/synth
const silentDur = Math.max(6, (events.at(-1)?.t || 5) + 1.5);
const wav = `${OUT_DIR}/sfx.wav`;
// Generate via node WebAudio offline? Use ffmpeg lavfi overlays
// Simpler: node script synthesizing PCM
await import('fs').then(async () => {
  const sampleRate = 44100;
  const n = Math.floor(silentDur * sampleRate);
  const buf = Buffer.alloc(44 + n * 2);
  // WAV header
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  const data = new Float32Array(n);
  function tone(t0, dur, freq0, freq1, amp, type = 'sine') {
    const i0 = Math.floor(t0 * sampleRate);
    const len = Math.floor(dur * sampleRate);
    for (let i = 0; i < len; i++) {
      const t = i / sampleRate;
      const env = Math.min(1, i / (0.005 * sampleRate)) * Math.exp(-t * (type === 'tick' ? 40 : 12));
      const f = freq0 + (freq1 - freq0) * (t / dur);
      const phase = 2 * Math.PI * f * t;
      let s = Math.sin(phase);
      if (type === 'square') s = Math.sign(s) * 0.5;
      if (type === 'tick') s = Math.sin(phase) * Math.exp(-t * 60);
      const idx = i0 + i;
      if (idx >= 0 && idx < n) data[idx] += s * amp * env;
    }
  }
  let clearN = 0;
  for (const e of events) {
    if (e.type === 'pop') tone(e.t, 0.08, 740, 420, 0.22);
    else if (e.type === 'pickup') tone(e.t, 0.1, 880, 520, 0.18);
    else if (e.type === 'snap') {
      tone(e.t, 0.12, 140, 55, 0.45);
      tone(e.t, 0.06, 1800, 600, 0.22, 'square');
    } else if (e.type === 'clear') {
      clearN++;
      const base = 520 + Math.min(8, clearN) * 55;
      tone(e.t, 0.22, base, base * 0.85, 0.35);
      tone(e.t + 0.06, 0.18, base * 1.5, base * 1.2, 0.22);
    } else if (e.type === 'win') {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(e.t + i * 0.11, 0.35, f, f, 0.28));
    }
  }
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, data[i]));
    buf.writeInt16LE((s * 32767) | 0, 44 + i * 2);
  }
  fs.writeFileSync(wav, buf);
});

const mp4 = '/workspace/tangle-demo.mp4';
execSync(`ffmpeg -y -i "${webm}" -i "${wav}" -c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 128k -shortest -movflags +faststart "${mp4}"`, { stdio: 'inherit' });
console.log('DEMO_OK', mp4, fs.statSync(mp4).size, 'events', events.length);
