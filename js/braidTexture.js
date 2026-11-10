/**
 * Three-strand twist. Colors are the reference rope's lit side and shadow side,
 * written as sRGB so a basic material shows those values on screen.
 * Canvas X runs along the rope, Y around it. One canvas height is one full turn.
 */
export function makeBraidCanvas(colorHex, darkHex, lightHex, size = 512) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;

  const parse = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const sh = parse(darkHex);
  const lit = parse(lightHex);
  // One long diagonal per canvas, sheared so the three crests read as a twist.
  const along = 1;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      // Three crests around the tube, repeating about once per rope width.
      const phase = v * 3 * Math.PI * 2 - u * along * Math.PI * 2;
      let t = Math.cos(phase) * 0.5 + 0.5;
      t = t * t * (3 - 2 * t);
      const sr = sh[0] * 0.82, sg = sh[1] * 0.82, sb = sh[2] * 0.82;
      let r = sr + (lit[0] - sr) * t;
      let g = sg + (lit[1] - sg) * t;
      let b = sb + (lit[2] - sb) * t;
      if (t > 0.9) {
        const h = (t - 0.9) / 0.1;
        r += (255 - r) * h * 0.28;
        g += (255 - g) * h * 0.28;
        b += (255 - b) * h * 0.28;
      }
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
  const along = 1.15;
  const strength = 2.4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const eps = 1 / size;
      const h = (uu, vv) => {
        const phase = vv * 3 * Math.PI * 2 - uu * along * Math.PI * 2;
        return Math.pow(Math.cos(phase) * 0.5 + 0.5, 0.42);
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
