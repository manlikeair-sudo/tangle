/**
 * Helix3-style crisp 3-strand diagonal helix (reference-like).
 * max(3 cos @ 120°) remapped [0.5,1]→[0,1] so grooves actually appear.
 * Groove ~42%, crest ~128%. No spatial blur — filtering off in scene.
 * Period: 1 UV = 1 twist → 3 strand bumps; uRepeat = len/(1.8·D) → ~0.6D.
 */
export function makeBraidCanvas(colorHex, darkHex, lightHex, size = 512) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;

  const cr = parseInt(colorHex.slice(1, 3), 16);
  const cg = parseInt(colorHex.slice(3, 5), 16);
  const cb = parseInt(colorHex.slice(5, 7), 16);

  const grooveR = Math.round(cr * 0.42), grooveG = Math.round(cg * 0.42), grooveB = Math.round(cb * 0.42);
  const crestR = Math.min(255, Math.round(cr * 1.28));
  const crestG = Math.min(255, Math.round(cg * 1.28));
  const crestB = Math.min(255, Math.round(cb * 1.28));
  const twists = 1.0;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const ang = (v - twists * u) * Math.PI * 2;
      const s0 = Math.cos(ang);
      const s1 = Math.cos(ang + (Math.PI * 2) / 3);
      const s2 = Math.cos(ang + (Math.PI * 4) / 3);
      const peak = Math.max(s0, s1, s2); // 0.5 .. 1.0
      // Remap to 0..1 so valleys hit groove and peaks hit crest
      let t = (peak - 0.5) * 2; // 0 .. 1
      // Sharper valleys, soft rounded strand crests
      t = Math.pow(Math.max(0, Math.min(1, t)), 0.7);
      let r, g, b;
      if (t < 0.38) {
        const k = t / 0.38;
        const k2 = k * k * (3 - 2 * k);
        r = grooveR + (cr - grooveR) * k2;
        g = grooveG + (cg - grooveG) * k2;
        b = grooveB + (cb - grooveB) * k2;
      } else {
        const k = (t - 0.38) / 0.62;
        const k2 = k * k * (3 - 2 * k);
        r = cr + (crestR - cr) * k2;
        g = cg + (crestG - cg) * k2;
        b = cb + (crestB - cb) * k2;
      }
      // Mild cylindrical wrap for round-tube limb darkening
      const wrap = 0.78 + 0.22 * Math.cos((v - 0.5) * Math.PI);
      r *= wrap; g *= wrap; b *= wrap;

      const i = (y * size + x) * 4;
      d[i] = Math.min(255, Math.max(0, r));
      d[i + 1] = Math.min(255, Math.max(0, g));
      d[i + 2] = Math.min(255, Math.max(0, b));
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function makeBraidNormalCanvas(size = 512) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const twists = 1.0;
  const strength = 1.6;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const ang = (v - twists * u) * Math.PI * 2;
      // height ≈ remapped max of 3 cosines; finite-diff for normal
      const eps = 1 / size;
      const h = (uu, vv) => {
        const a = (vv - twists * uu) * Math.PI * 2;
        const peak = Math.max(Math.cos(a), Math.cos(a + 2.094395), Math.cos(a + 4.188790));
        return Math.pow(Math.max(0, Math.min(1, (peak - 0.5) * 2)), 0.7);
      };
      const dhdu = (h(u + eps, v) - h(u - eps, v)) / (2 * eps);
      const dhdv = (h(u, v + eps) - h(u, v - eps)) / (2 * eps);
      let nx = -dhdu * strength;
      let ny = -dhdv * strength;
      let nz = 1.0;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      const i = (y * size + x) * 4;
      d[i] = Math.round((nx * 0.5 + 0.5) * 255);
      d[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      d[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
