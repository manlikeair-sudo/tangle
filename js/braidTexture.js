/**
 * Fine same-hue ply. Canvas X runs along the rope, Y around it.
 * Seven strands per tile, written as sRGB for an unlit material.
 * Grooves stay in the rope's own hue — never a black or white band.
 * The median multiplier is ~0.93 so the body stays on the authored hex.
 */
export function makeBraidCanvas(colorHex, darkHex, lightHex, size = 512) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;

  const parse = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const base = parse(colorHex);
  const lit = parse(lightHex || colorHex);
  // Seven plies around the rope. Crest and groove sit either side of ~0.93
  // so the body median stays on the authored hex, and the groove stays saturated.
  const strands = 7;
  const along = 1.7;
  const crest = [
    Math.min(255, base[0] * 0.90 + lit[0] * 0.18),
    Math.min(255, base[1] * 0.90 + lit[1] * 0.18),
    Math.min(255, base[2] * 0.90 + lit[2] * 0.18),
  ];
  const groove = [base[0] * 0.78, base[1] * 0.78, base[2] * 0.78];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const phase = v * strands * Math.PI * 2 - u * along * Math.PI * 2;
      let t = Math.cos(phase) * 0.5 + 0.5;
      // Rounded ridge: equal crest and groove, not a wide flat band.
      t = t * t * (3 - 2 * t);
      const r = groove[0] + (crest[0] - groove[0]) * t;
      const g = groove[1] + (crest[1] - groove[1]) * t;
      const b = groove[2] + (crest[2] - groove[2]) * t;
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
  const along = 1;
  const strength = 1.35;
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
