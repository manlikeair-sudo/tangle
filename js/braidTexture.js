/**
 * TubeGeometry UVs: uv.x along path → S; uv.y around → T.
 * From near-top-down a twist reads as bands along the tube; keep high contrast
 * grooves + cylindrical shading so tubes read round.
 */
export function makeBraidCanvas(colorHex, darkHex, lightHex, size = 256) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = colorHex;
  ctx.fillRect(0, 0, size, size);

  // Strong cylinder shading (around = Y)
  const g = ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0.00, 'rgba(0,0,0,0.62)');
  g.addColorStop(0.20, 'rgba(0,0,0,0.28)');
  g.addColorStop(0.40, 'rgba(255,255,255,0.10)');
  g.addColorStop(0.50, 'rgba(255,255,255,0.65)');
  g.addColorStop(0.60, 'rgba(255,255,255,0.10)');
  g.addColorStop(0.80, 'rgba(0,0,0,0.24)');
  g.addColorStop(1.00, 'rgba(0,0,0,0.58)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  // Dense 45° twist grooves (period = tile; UV repeat sets 0.6 dia spacing)
  for (let i = -2; i <= 3; i++) {
    const x0 = i * size;
    ctx.strokeStyle = darkHex;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = size * 0.18;
    ctx.beginPath();
    ctx.moveTo(x0, 0);
    ctx.lineTo(x0 + size, size);
    ctx.stroke();
    ctx.strokeStyle = lightHex;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = size * 0.055;
    ctx.beginPath();
    ctx.moveTo(x0 + size * 0.16, 0);
    ctx.lineTo(x0 + size * 1.16, size);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return c;
}
