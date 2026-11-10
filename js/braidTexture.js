/**
 * Two-strand candy-cane braid, like the reference ropes.
 * |cos| gives two equal glossy strands per twist. 1 UV = 1 full twist.
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

  const grooveR = Math.round(cr * 0.62), grooveG = Math.round(cg * 0.62), grooveB = Math.round(cb * 0.62);
  const crestR = Math.min(255, Math.round(cr * 1.12));
  const crestG = Math.min(255, Math.round(cg * 1.12));
  const crestB = Math.min(255, Math.round(cb * 1.12));
  const twists = 0.42;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const ang = (v - twists * u) * Math.PI * 2;
      // Soft wide two-strand twist.
      let t = Math.abs(Math.cos(ang));
      t = 0.35 + 0.65 * Math.pow(Math.max(0, Math.min(1, t)), 0.8);
      let r, g, b;
      if (t < 0.22) {
        const k = t / 0.22;
        const k2 = k * k * (3 - 2 * k);
        r = grooveR + (cr - grooveR) * k2;
        g = grooveG + (cg - grooveG) * k2;
        b = grooveB + (cb - grooveB) * k2;
      } else {
        const k = (t - 0.22) / 0.78;
        const k2 = k * k * (3 - 2 * k);
        r = cr + (crestR - cr) * k2;
        g = cg + (crestG - cg) * k2;
        b = cb + (crestB - cb) * k2;
      }
      // Dark rim toward the silhouette of the tube.
      const wrap = 0.45 + 0.55 * Math.pow(Math.sin(v * Math.PI), 0.55);
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
      const eps = 1 / size;
      const h = (uu, vv) => {
        const a = (vv - twists * uu) * Math.PI * 2;
        return Math.pow(Math.abs(Math.cos(a)), 0.32);
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
