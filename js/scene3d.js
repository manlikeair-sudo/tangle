/**
 * Three.js: orthographic tilt, braid tubes, light-blue pegs, flat magnetic caps on peg tops.
 * No logarithmicDepthBuffer (iOS). Crossing lifts via real Y offsets.
 */
import * as THREE from '../vendor/three.module.js';
import { makeBraidCanvas, makeBraidNormalCanvas } from './braidTexture.js';
import { displayPoints } from './rope.js';

const TUBE_SEGMENTS = 96;
const TUBE_SEGS_FIXED = 220;
const RADIAL = 36;

/**
 * Tube with Bishop/parallel-transport frames (no Frenet twist flip → no flattening at bends).
 */
function buildParallelTransportTube(curve, tubularSegments, radius, radialSegments, hintNormal) {
  const frames = computeParallelTransportFrames(curve, tubularSegments, hintNormal);
  const radial = radialSegments;
  const tubular = tubularSegments;
  const verts = [];
  const normals = [];
  const colors = [];
  const uvs = [];
  const indices = [];
  const P = new THREE.Vector3();
  const N = new THREE.Vector3();
  const B = new THREE.Vector3();
    // Tight 3-ply: crests every 0.4 rope-widths along the rope, displaced in the surface.
    // One crest every ~1.1 rope widths, so the three plies read as diagonals.
    const plyPitch = Math.max(radius * 2 * 1.1, 1e-4);
    const amp = 0;
    const tilt = 0.35;
    const sAt = new Array(tubular + 1);
    sAt[0] = 0;
    for (let i = 1; i <= tubular; i++) {
      sAt[i] = sAt[i - 1] + frames.points[i].distanceTo(frames.points[i - 1]);
    }
    for (let i = 0; i <= tubular; i++) {
    P.copy(frames.points[i]);
    N.copy(frames.normals[i]);
    B.copy(frames.binormals[i]);
    const T = frames.tangents[i];
    for (let j = 0; j <= radial; j++) {
      const v = j / radial;
      const ang = v * Math.PI * 2;
      const sin = Math.sin(ang);
      const cos = -Math.cos(ang);
      const rx = cos * N.x + sin * B.x;
      const ry = cos * N.y + sin * B.y;
      const rz = cos * N.z + sin * B.z;
      const phase = 3 * ang - (sAt[i] / plyPitch) * Math.PI * 2;
      const bump = Math.cos(phase);
      const r = radius * (1 + amp * bump);
      const dBump = -Math.sin(phase);
      const drdAng = radius * amp * dBump * 3 * tilt;
      const drdS = radius * amp * dBump * (-2 * Math.PI / plyPitch) * tilt;
      const ax = Math.sin(ang) * N.x + Math.cos(ang) * B.x;
      const ay = Math.sin(ang) * N.y + Math.cos(ang) * B.y;
      const az = Math.sin(ang) * N.z + Math.cos(ang) * B.z;
      let nx = rx * r - drdAng * ax - drdS * T.x;
      let ny = ry * r - drdAng * ay - drdS * T.y;
      let nz = rz * r - drdAng * az - drdS * T.z;
      const len = Math.hypot(nx, ny, nz) || 1;
      normals.push(nx / len, ny / len, nz / len);
      // Soft top-light so the cylinder reads as round. The ply itself stays in the texture.
      const up = ny / len * 0.5 + 0.5;
      const shade = 0.84 + 0.16 * up;
      colors.push(shade, shade, shade);
      verts.push(P.x + r * rx, P.y + r * ry, P.z + r * rz);
      uvs.push(i / tubular, v);
    }
  }
  for (let i = 0; i < tubular; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = (i + 1) * (radial + 1) + j;
      const c = (i + 1) * (radial + 1) + (j + 1);
      const d = i * (radial + 1) + (j + 1);
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setIndex(indices);
  geom.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  // stash for integrity/debug
  geom.parameters = { path: curve, tubularSegments, radius, radialSegments, closed: false };
  geom.userData = { hintN: frames.normals[0].clone() };
  return geom;
}

function computeParallelTransportFrames(curve, segments, hintNormal) {
  const points = [];
  const tangents = [];
  const normals = [];
  const binormals = [];
  const T = new THREE.Vector3();
  const N = new THREE.Vector3();
  const B = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    points.push(curve.getPointAt(u));
    const tan = curve.getTangentAt(u);
    if (tan.lengthSq() < 1e-10) tan.set(1, 0, 0);
    else tan.normalize();
    tangents.push(tan);
  }
  // Carry the previous frame's normal so the braid doesn't flip when the
  // tangent crosses an axis. A fresh axis pick every rebuild was a full twist pop.
  const t0 = tangents[0];
  let seeded = false;
  if (hintNormal && Number.isFinite(hintNormal.x)) {
    N.set(hintNormal.x, hintNormal.y, hintNormal.z);
    N.addScaledVector(t0, -N.dot(t0));
    if (N.lengthSq() > 1e-8) { N.normalize(); seeded = true; }
  }
  if (!seeded) {
    const absx = Math.abs(t0.x), absy = Math.abs(t0.y), absz = Math.abs(t0.z);
    if (absy <= absx && absy <= absz) N.set(0, 1, 0);
    else if (absx <= absz) N.set(1, 0, 0);
    else N.set(0, 0, 1);
  }
  B.crossVectors(t0, N).normalize();
  N.crossVectors(B, t0).normalize();
  normals.push(N.clone());
  binormals.push(B.clone());
  // Parallel transport
  for (let i = 1; i <= segments; i++) {
    const tPrev = tangents[i - 1];
    const tCur = tangents[i];
    // Rotation aligning tPrev → tCur
    const axis = new THREE.Vector3().crossVectors(tPrev, tCur);
    const axisLen = axis.length();
    let nCur = normals[i - 1].clone();
    let bCur = binormals[i - 1].clone();
    if (axisLen > 1e-8) {
      const angle = Math.acos(Math.max(-1, Math.min(1, tPrev.dot(tCur))));
      axis.multiplyScalar(1 / axisLen);
      nCur.applyAxisAngle(axis, angle);
      bCur.applyAxisAngle(axis, angle);
    }
    // Re-orthonormalize against tCur
    bCur.crossVectors(tCur, nCur).normalize();
    nCur.crossVectors(bCur, tCur).normalize();
    normals.push(nCur);
    binormals.push(bCur);
  }
  return { points, tangents, normals, binormals };
}



export class Scene3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.W = 1; this.H = 1;
    this.boardW = 1; this.boardH = 1;
    this.ox = 0; this.oy = 0;
    this.worldSpan = 10;

    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: false, powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0xB9C3CF, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.scene = new THREE.Scene();
    {
      const bgC = document.createElement('canvas');
      bgC.width = 512; bgC.height = 512;
      const bx = bgC.getContext('2d');
      // White glow only behind cluster; blue-grey floor elsewhere (#DDE3EA mid, #B9C3CF edges)
      const bg = bx.createRadialGradient(256, 248, 8, 256, 250, 280);
      bg.addColorStop(0, '#FFFFFF');
      bg.addColorStop(0.08, '#F4F8FC');
      bg.addColorStop(0.22, '#D5DEE8');
      bg.addColorStop(0.5, '#B7C2CE');
      bg.addColorStop(1, '#A9AEB7');
      bx.fillStyle = bg;
      bx.fillRect(0, 0, 512, 512);
      const bgTex = new THREE.CanvasTexture(bgC);
      bgTex.colorSpace = THREE.SRGBColorSpace;
      this.scene.background = bgTex;
    }

    this._camTilt = (15 * Math.PI) / 180;
    this._camDist = 28;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 120);

    // Floor sized to the view so the vignette is visible (not washed white)
    const floorCanvas = document.createElement('canvas');
    floorCanvas.width = 512; floorCanvas.height = 512;
    const fctx = floorCanvas.getContext('2d');
    const fg = fctx.createRadialGradient(256, 248, 6, 256, 256, 270);
    fg.addColorStop(0, '#FFFFFF');
    fg.addColorStop(0.05, '#F5FAFF');
    fg.addColorStop(0.12, '#E7EEF6');
    fg.addColorStop(0.22, '#D0DAE4');
    fg.addColorStop(0.4, '#B7C2CC');
    fg.addColorStop(0.7, '#A9B3BD');
    fg.addColorStop(1, '#A4ADB6');
    fctx.fillStyle = fg;
    fctx.fillRect(0, 0, 512, 512);
    const floorTex = new THREE.CanvasTexture(floorCanvas);
    floorTex.colorSpace = THREE.SRGBColorSpace;
    // ~1.8× VIEW_W so edges of the board read #B9C3CF
    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 22),
      new THREE.MeshBasicMaterial({ map: floorTex })
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);

    this.shadowFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 22),
      new THREE.ShadowMaterial({ opacity: 0.22 })
    );
    this.shadowFloor.rotation.x = -Math.PI / 2;
    this.shadowFloor.position.y = 0.008;
    this.shadowFloor.receiveShadow = true;
    this.scene.add(this.shadowFloor);

    // Ropes are unlit. These lights are for the caps and pegs, which need a
    // real upper-left key or the rims and cylinders stay flat.
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x8aa0b4, 0.28);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 0.42);
    this.sun.position.set(0.4, 24, 7);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 50;
    this.sun.shadow.camera.left = -8;
    this.sun.shadow.camera.right = 8;
    this.sun.shadow.camera.top = 8;
    this.sun.shadow.camera.bottom = -8;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 10;
    this.scene.add(this.sun);
    // Screen-left and above. Screen-left is -X; the top of the frame is -Z.
    this.key = new THREE.DirectionalLight(0xfffaf4, 1.35);
    this.key.position.set(-14, 18, -6);
    this.scene.add(this.key);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.16));

    this.VIEW_W = 10;
    this._applyTargetProportions();

    this.pegs = [];
    this.caps = [];
    this.ropes = [];
    this.texCache = new Map();

    this.highlight = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.85, 40),
      new THREE.MeshBasicMaterial({ color: 0x5BA0FF, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
    );
    this.highlight.rotation.x = -Math.PI / 2;
    this.highlight.position.y = 0.03;
    this.highlight.visible = false;
    this.scene.add(this.highlight);

    this.dragCap = null;
    this.dragShadow = null;
    this._pegDip = new Map(); // pegId -> dip amount
  }

  _applyTargetProportions() {
    const V = this.VIEW_W;
    // Peg diameter ~0.055W; rope diameter 0.9× peg ≈ 0.05W
    // Peg posts are the tall landmarks; ropes are a little thinner than a peg.
    // Short stubs. Ropes are about twice as thick as a peg, like the reference.
    // Peg diameter matches the reference stubs. Rope width is about 0.9× that.
    // Screen target on an 894-wide frame: peg top ~31px, rope ~31px (measured, then scaled).
    // Tuned so an 894px-wide frame measures: peg top ~32px, rope ~42px (reference inscribed widths).
    // 41px rope diameter on an 894-wide frame (VIEW_W = 10).
    // Reference rope/cap ends read about 28% thicker than the 44px pass.
    // Peg footprint stays put; only the drawn rope and cap grow.
    this.ropeOuter = 56 / (2 * (894 / 10));
    this.ropeR = this.ropeOuter / 1.02;
    this.pegR = 33 / (2 * (894 / 10));
    this.capR = this.ropeOuter * 1.08;
    this.capH = 0.22 * (2 * this.ropeR);
    const pegRopeR = 44 / (2 * (894 / 10)) / 1.02;
    this.pegH = pegRopeR * 6.2;
  }

  resize(cssW, cssH, dpr) {
    this.W = cssW; this.H = cssH;
    this.renderer.setPixelRatio(Math.min(dpr || 1, 2));
    this.renderer.setSize(cssW, cssH, false);
    const aspect = cssW / Math.max(1, cssH);
    const halfW = this.VIEW_W / 2;
    const halfH = halfW / aspect;
    this.camera.left = -halfW;
    this.camera.right = halfW;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();
    this._placeCamera();
  }

  setBoardLayout(ox, oy, boardW, boardH, identityFloor = false) {
    this.ox = ox; this.oy = oy; this.boardW = boardW; this.boardH = boardH;
    const frac = boardW / Math.max(1, this.W);
    this.worldSpan = this.VIEW_W * frac;
    // Identity floor: a board pixel projects back to that screen pixel at y=0.
    const aspect = this.H / Math.max(1, this.W);
    this.zScale = identityFloor ? aspect / Math.cos(this._camTilt) : 0.95;
  }

  toWorld(px, py) {
    const nx = (px - this.ox) / this.boardW - 0.5;
    const nz = (py - this.oy) / this.boardH - 0.5;
    const zScale = this.zScale || 0.95;
    return { x: nx * this.worldSpan, z: nz * this.worldSpan * zScale };
  }

  /** Inverse of toWorld — board/CSS coords from world XZ. */
  fromWorld(wx, wz) {
    const zScale = this.zScale || 0.95;
    const nx = wx / Math.max(1e-6, this.worldSpan);
    const nz = wz / Math.max(1e-6, this.worldSpan * zScale);
    return {
      x: this.ox + (nx + 0.5) * this.boardW,
      y: this.oy + (nz + 0.5) * this.boardH,
    };
  }

  /**
   * Raycast CSS-pixel pointer through the ortho camera onto a world Y plane,
   * return board/CSS coords. Accounts for tilt + aspect (1:1 finger tracking).
   */
  screenToWorld(sx, sy, planeY = 0) {
    this.camera.updateMatrixWorld(true);
    const ndcX = (sx / Math.max(1, this.W)) * 2 - 1;
    const ndcY = -(sy / Math.max(1, this.H)) * 2 + 1;
    const near = new THREE.Vector3(ndcX, ndcY, -1).unproject(this.camera);
    const far = new THREE.Vector3(ndcX, ndcY, 1).unproject(this.camera);
    const dir = far.clone().sub(near);
    if (Math.abs(dir.y) < 1e-8) return new THREE.Vector3(near.x, planeY, near.z);
    const t = (planeY - near.y) / dir.y;
    return new THREE.Vector3(near.x + dir.x * t, planeY, near.z + dir.z * t);
  }

  screenToBoard(sx, sy, planeY = 0) {
    const w = this.screenToWorld(sx, sy, planeY);
    return this.fromWorld(w.x, w.z);
  }

  /** Project a board-space point at a given world Y (cap center). */
  projectBoardAt(px, py, worldY) {
    const w = this.toWorld(px, py);
    return this.projectWorld(w.x, worldY, w.z);
  }

  floorCapY() {
    return this.ropeR * 1.9;
  }

  /** End grommet, raised onto the tube top but shifted so it stays on the end in screen space. */
  capOnEnd(attach) {
    const dy = this.ropeOuter * 0.92;
    const shift = dy * Math.tan(this._camTilt);
    return { x: attach.x, y: attach.y + dy, z: attach.z + shift };
  }

  _placeCamera() {
    const d = this._camDist;
    const t = this._camTilt;
    this.camera.position.set(0, d * Math.cos(t), d * Math.sin(t));
    this.camera.lookAt(0, 0, 0);
    this.camera.up.set(0, 1, 0);
  }

  _pegMat() {
    if (this._pegMatCached) return this._pegMatCached;
    // Painted shade. A lit standard cylinder was washing out to one cyan-grey
    // under the fill light, and the UV streak sat on the wrong side.
    this._pegMatCached = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true });
    return this._pegMatCached;
  }

  /** Left side and a vertical streak bright, right side and the foot dark. */
  _shadePegBody(geom) {
    const pos = geom.attributes.position;
    const nrm = geom.attributes.normal;
    const h = geom.parameters.height || 1;
    const lit = new THREE.Color(0xE7F5FC);
    const mid = new THREE.Color(0x7EB4CC);
    const sh = new THREE.Color(0x3A5C70);
    const cols = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const nx = nrm.getX(i);
      const nz = nrm.getZ(i);
      const y = pos.getY(i);
      const foot = (y / (h * 0.5) + 1) * 0.5; // 0 at the foot, 1 at the top
      const side = (-nx) * 0.5 + 0.5; // 1 on screen-left
      // Highlight just left of center, darker at both silhouettes, darker still on the right.
      const band = Math.exp(-((side - 0.64) ** 2) / (2 * 0.11 * 0.11));
      const c = sh.clone().lerp(mid, Math.min(1, side * 0.85 + 0.15));
      c.lerp(lit, band * Math.max(0, nz));
      const k = 0.34 + 0.66 * foot * foot;
      cols[i * 3] = Math.min(1, c.r * k);
      cols[i * 3 + 1] = Math.min(1, c.g * k);
      cols[i * 3 + 2] = Math.min(1, c.b * k);
    }
    geom.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  }

  _pegTopMat() {
    if (this._pegTopMatCached) return this._pegTopMatCached;
    const topC = document.createElement('canvas');
    topC.width = 128; topC.height = 128;
    const tctx = topC.getContext('2d');
    // Flat cap, lighter on screen-left. A radial hotspot read as a ball.
    const rg = tctx.createLinearGradient(0, 0, 128, 0);
    rg.addColorStop(0, '#F4FBFF');
    rg.addColorStop(0.45, '#D5EEF8');
    rg.addColorStop(1, '#9FCDDF');
    tctx.fillStyle = rg;
    tctx.fillRect(0, 0, 128, 128);
    const topTex = new THREE.CanvasTexture(topC);
    topTex.colorSpace = THREE.SRGBColorSpace;
    this._pegTopMatCached = new THREE.MeshBasicMaterial({
      map: topTex, color: 0xffffff,
    });
    return this._pegTopMatCached;
  }


  _pegAOMat() {
    if (this._pegAOCached) return this._pegAOCached;
    this._pegAOCached = new THREE.MeshBasicMaterial({
      color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false,
    });
    return this._pegAOCached;
  }

  _ropeMat(color) {
    const key = color.hex;
    if (this.texCache.has(key)) return this.texCache.get(key);
    // Solid rope colour. The 3-ply shape is in the displaced vertices, so the
    // highlight and the groove come from the light, not from a painted stripe.
    const canvas = makeBraidCanvas(color.hex, color.hex, color.light, 512);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.repeat.set(6, 1);
    // Unlit so the sampled colour is the texture, not a lighting crush.
    // Vertex colour only adds the soft cylindrical shade (0.90–1.0).
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      color: 0xffffff,
      vertexColors: true,
    });
    this.texCache.set(key, mat);
    return mat;
  }

  _vertexMat() {
    if (this._vertexMatCached) return this._vertexMatCached;
    this._vertexMatCached = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true });
    return this._vertexMatCached;
  }

  _capHoleMat() {
    if (this._capHoleCached) return this._capHoleCached;
    const c = document.createElement('canvas');
    c.width = 8; c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, 64);
    // Top of the wall, just under the lip, is the darkest. The floor stays dark.
    grd.addColorStop(0, '#1c2128');
    grd.addColorStop(0.35, '#101318');
    grd.addColorStop(1, '#07080a');
    g.fillStyle = grd;
    g.fillRect(0, 0, 8, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this._capHoleCached = new THREE.MeshBasicMaterial({
      map: tex, color: 0xffffff, side: THREE.BackSide,
    });
    return this._capHoleCached;
  }

  /**
   * TorusGeometry lies in XY. After rotation.x = +90°, local -Y is screen-up
   * and local -X is screen-left, which is where the reference rim catches light.
   * The inner half of the bead is the dark wall of the hole.
   */
  _paintRim(geom, color) {
    const major = geom.parameters.radius;
    const minor = geom.parameters.tube;
    const pos = geom.attributes.position;
    const base = new THREE.Color(color.hex);
    const lit = new THREE.Color(color.light);
    const dark = new THREE.Color(color.dark);
    const white = new THREE.Color(0xfffaf6);
    const cols = new Float32Array(pos.count * 3);
    const ulAng = Math.atan2(-1, -1);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const radial = Math.hypot(x, y);
      let ang = Math.atan2(y, x) - ulAng;
      ang = Math.atan2(Math.sin(ang), Math.cos(ang));
      const z = pos.getZ(i);
      const facingUp = Math.max(0, Math.min(1, -z / minor));
      const highlight = Math.exp(-(ang * ang) / (2 * 0.62 * 0.62));
      const inner = Math.max(0, Math.min(1, (major - radial) / minor));
      const c = base.clone().lerp(lit, 0.4);
      c.lerp(dark, inner * 0.95);
      c.lerp(white, Math.min(1, highlight * (0.35 + 0.65 * facingUp) * (1 - inner * 0.35)));
      const shade = Math.exp(-((ang - Math.PI) ** 2) / (2 * 0.7 * 0.7));
      c.lerp(dark, shade * 0.7);
      cols[i * 3] = c.r;
      cols[i * 3 + 1] = c.g;
      cols[i * 3 + 2] = c.b;
    }
    geom.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  }

  syncPegs(pegList) {
    while (this.pegs.length > pegList.length) {
      const g = this.pegs.pop();
      this.scene.remove(g);
      g.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    }
    while (this.pegs.length < pegList.length) {
      const group = new THREE.Group();
      const bodyGeom = new THREE.CylinderGeometry(this.pegR * 0.96, this.pegR * 1.02, this.pegH, 40);
      this._shadePegBody(bodyGeom);
      const body = new THREE.Mesh(bodyGeom, this._pegMat());
      body.castShadow = true;
      body.receiveShadow = true;
      body.position.y = this.pegH * 0.5;
      const top = new THREE.Mesh(
        new THREE.CylinderGeometry(this.pegR * 0.9, this.pegR * 0.96, this.pegH * 0.018, 32),
        this._pegTopMat()
      );
      top.position.y = this.pegH - this.pegH * 0.008;
      top.castShadow = true;
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(this.pegR * 0.97, this.pegR * 0.04, 10, 48),
        this._pegTopMat()
      );
      rim.rotation.x = Math.PI / 2;
      rim.position.y = this.pegH * 0.012;
      // Soft AO ring at base
      const baseRing = new THREE.Mesh(
        new THREE.TorusGeometry(this.pegR * 1.05, this.pegR * 0.16, 10, 28),
        new THREE.MeshBasicMaterial({ color: 0x3E5C6E })
      );
      baseRing.rotation.x = Math.PI / 2;
      baseRing.position.y = this.pegH * 0.04;
      const ao = new THREE.Mesh(
        new THREE.CircleGeometry(this.pegR * 1.35, 32),
        this._pegAOMat()
      );
      ao.rotation.x = -Math.PI / 2;
      ao.position.y = 0.015;
      ao.renderOrder = 1;
      body.renderOrder = 8;
      top.renderOrder = 28;
      rim.renderOrder = 28;
      group.add(ao, baseRing, body, top, rim);
      group.userData.body = body;
      this.scene.add(group);
      this.pegs.push(group);
    }
    for (let i = 0; i < pegList.length; i++) {
      const m = this.pegs[i];
      const dip = this._pegDip.get(pegList[i].id) || 0;
      if (pegList[i].pixelLock) {
        const w = this.screenToWorld(pegList[i].x, pegList[i].y, this.pegH);
        m.position.set(w.x, -dip, w.z);
      } else {
        const w = this.toWorld(pegList[i].x, pegList[i].y);
        m.position.set(w.x, -dip, w.z);
      }
      m.visible = true;
    }
  }

  setPegDip(pegId, amount) {
    if (amount <= 0) this._pegDip.delete(pegId);
    else this._pegDip.set(pegId, amount);
  }

  _makeCapMesh(color) {
    const group = new THREE.Group();
    const R = this.capR;
    // Dark opening is 45% of the outer diameter. The bead between that
    // opening and the silhouette is the thick rim.
    const holeR = R * 0.56;
    const minor = (R - holeR) * 0.5;
    const major = holeR + minor;
    const vmat = this._vertexMat();

    const shoulderGeom = new THREE.SphereGeometry(R, 36, 16, 0, Math.PI * 2, 0.58, 1.05);
    const base = new THREE.Color(color.hex);
    const lit = new THREE.Color(color.light);
    const dark = new THREE.Color(color.dark);
    const sp = shoulderGeom.attributes.position;
    const sn = shoulderGeom.attributes.normal;
    const sc = new Float32Array(sn.count * 3);
    const white = new THREE.Color(0xfffaf6);
    const ulAng = Math.atan2(-1, -1);
    for (let i = 0; i < sn.count; i++) {
      const x = sp.getX(i), y = sp.getY(i), z = sp.getZ(i);
      const xz = Math.hypot(x, z) / R;
      let ang = Math.atan2(z, x) - ulAng;
      ang = Math.atan2(Math.sin(ang), Math.cos(ang));
      const ul = Math.exp(-(ang * ang) / (2 * 0.48 * 0.48));
      const lr = Math.exp(-((ang - Math.PI) ** 2) / (2 * 0.62 * 0.62));
      // A band just outside the hole is the glossy bevel. Inside that band
      // is the dark wall; the silhouette gets a dark outline.
      const ring = Math.exp(-((xz - 0.70) ** 2) / (2 * 0.07 * 0.07));
      const inner = Math.max(0, Math.min(1, (0.60 - xz) / 0.07));
      const outer = Math.max(0, Math.min(1, (xz - 0.90) / 0.07));
      const c = base.clone().lerp(lit, 0.35 + ring * 0.4);
      c.lerp(white, ul * ring * 0.98);
      c.lerp(dark, lr * ring * 0.72 + inner * 0.88 + outer * 0.7);
      sc[i * 3] = c.r; sc[i * 3 + 1] = c.g; sc[i * 3 + 2] = c.b;
    }
    shoulderGeom.setAttribute('color', new THREE.BufferAttribute(sc, 3));
    const shoulder = new THREE.Mesh(shoulderGeom, vmat);
    shoulder.scale.set(1, 0.66, 1);

    const rimGeom = new THREE.TorusGeometry(major, minor * 0.92, 18, 56);
    this._paintRim(rimGeom, color);
    const rim = new THREE.Mesh(rimGeom, vmat);
    rim.rotation.x = Math.PI / 2;
    const mouthY = Math.cos(0.58) * 0.66 * R;
    rim.position.y = mouthY;

    const outline = new THREE.Mesh(
      new THREE.TorusGeometry(R * 1.01, R * 0.032, 8, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color.dark) })
    );
    outline.rotation.x = Math.PI / 2;
    outline.position.y = R * 0.02;

    // Shallow well: a wide dark floor with only a short inner wall, so the
    // opening stays a round recess instead of a deep crescent.
    const wellH = R * 0.22;
    const well = new THREE.Mesh(
      new THREE.CylinderGeometry(holeR * 0.98, holeR * 0.86, wellH, 32, 1, true),
      this._capHoleMat()
    );
    well.position.y = mouthY - wellH * 0.55;

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(holeR * 0.86, 28),
      new THREE.MeshBasicMaterial({ color: 0x0c0e12 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = well.position.y - wellH * 0.5 + R * 0.01;

    shoulder.renderOrder = 14;
    outline.renderOrder = 15;
    well.renderOrder = 16;
    floor.renderOrder = 16;
    rim.renderOrder = 17;
    group.add(shoulder, outline, well, floor, rim);
    group.userData.colorHex = color.hex;
    group.userData.body = rim;
    return group;
  }


  /** Solid flat plugs that close open TubeGeometry mouths (no hollow cut ends). */
  _ensureTubeEndCaps(entry, color) {
    const flatMat = () => new THREE.MeshStandardMaterial({
      color: new THREE.Color(color.hex),
      roughness: 0.48,
      metalness: 0.0,
      emissive: new THREE.Color(color.hex).multiplyScalar(0.07),
      side: THREE.DoubleSide,
    });
    if (!entry.endCaps) {
      const mk = () => {
        const m = new THREE.Mesh(new THREE.CircleGeometry(1, 28), flatMat());
        m.castShadow = false;
        m.renderOrder = 10;
        this.scene.add(m);
        return m;
      };
      entry.endCaps = [mk(), mk()];
    } else if (color && entry.endCaps[0].userData.colorHex !== color.hex) {
      for (const m of entry.endCaps) {
        m.material.dispose?.();
        m.material = flatMat();
        m.userData.colorHex = color.hex;
      }
    }
    for (const m of entry.endCaps) m.userData.colorHex = color.hex;
    return entry.endCaps;
  }

  /** Screen-pixel centerline, raycast onto the rope plane so it projects back onto those pixels. */
  _traceWorldPts(raw) {
    const planeY = this.ropeR;
    const dense = [];
    const src = raw.filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y));
    if (src.length < 2) return [];
    for (let i = 0; i < src.length - 1; i++) {
      const a = src[i], b = src[i + 1];
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      const n = Math.max(1, Math.round(d / 6));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        dense.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
    }
    dense.push(src[src.length - 1]);
    return dense.map(p => this.screenToWorld(p.x, p.y, planeY));
  }

  /** Clean control points for TubeGeometry. */
  _smoothWorldPts(raw, ends, baseY, scale, keepShape) {
    if (keepShape) return this._traceWorldPts(raw, ends);
    const minDist = 0.05;
    const cleaned = [];
    let lwx = null, lwz = null;
    for (let k = 0; k < raw.length; k++) {
      const w = this.toWorld(raw[k].x, raw[k].y);
      if (lwx !== null && Math.hypot(w.x - lwx, w.z - lwz) < minDist) continue;
      cleaned.push({ x: w.x, z: w.z });
      lwx = w.x; lwz = w.z;
    }
    const e0 = this.toWorld(ends[0].x, ends[0].y);
    const e1 = this.toWorld(ends[1].x, ends[1].y);
    if (!cleaned.length) {
      cleaned.push({ x: e0.x, z: e0.z }, { x: e1.x, z: e1.z });
    } else {
      cleaned[0] = { x: e0.x, z: e0.z };
      cleaned[cleaned.length - 1] = { x: e1.x, z: e1.z };
    }

    let pts = cleaned;
    for (let pass = 0; pass < 3; pass++) {
      if (pts.length < 3) break;
      const next = [pts[0]];
      for (let i = 1; i < pts.length - 1; i++) {
        const a = next[next.length - 1], b = pts[i], c = pts[i + 1];
        const abx = b.x - a.x, abz = b.z - a.z;
        const bcx = c.x - b.x, bcz = c.z - b.z;
        const abl = Math.hypot(abx, abz) || 1e-6;
        const bcl = Math.hypot(bcx, bcz) || 1e-6;
        const dot = (abx * bcx + abz * bcz) / (abl * bcl);
        if (dot < -0.55) continue; // keep wrap-arc points
        next.push(b);
      }
      next.push(pts[pts.length - 1]);
      pts = next;
    }

    // Fixed count, then a heavy smooth so verlet kinks become wide floor arcs.
    pts = resample2D(pts, 20);
    for (let pass = 0; pass < 3; pass++) {
      const next = pts.map(p => ({ x: p.x, z: p.z }));
      for (let i = 1; i < pts.length - 1; i++) {
        next[i].x = pts[i].x * 0.42 + (pts[i - 1].x + pts[i + 1].x) * 0.29;
        next[i].z = pts[i].z * 0.42 + (pts[i - 1].z + pts[i + 1].z) * 0.29;
      }
      next[0] = pts[0];
      next[next.length - 1] = pts[pts.length - 1];
      pts = next;
    }
    pts = resample2D(pts, 24);
    for (let i = 0; i < 2; i++) pts = chaikin(pts);
    // Re-pin ends after chaikin/resample (those filters can drift endpoints)
    pts[0] = { x: e0.x, z: e0.z };
    pts[pts.length - 1] = { x: e1.x, z: e1.z };

    // Rope leaves the cap sideways and hits the floor within ~1 rope diameter.
    // Attach near resting height (under the magnet disc) — no tall pipe rise.
    // Centerline must clear floor by ≥ ropeR so the full round tube is visible
    // (floorY≈ropeR*1.02 buried the lower half → flat "ribbon" look from above)
    // Ropes lie on the floor. Ends rise only enough to meet a flat ring.
    const floorY = this.ropeR * 1.02;
    const attachYPeg = Math.max(floorY, this.pegH * 0.55);
    const attachYFloor = this.ropeR * 0.72;
    // Dragged/lifted caps sit high — rope must meet the underside of that cap (not floor)
    const attachOf = (ep) => {
      if (ep && ep.lifted) {
        const lift = (ep.liftY != null) ? ep.liftY : (this.pegH + this.capH + 0.35);
        return Math.max(attachYPeg, lift - this.capH * 0.35);
      }
      return ep && ep.onFloor ? attachYFloor : attachYPeg;
    };
    const a0 = attachOf(ends[0]);
    const a1 = attachOf(ends[1]);
    const dropDist = this.ropeR * 1.6;
    // Insert explicit side-exit points so the tube exits horizontally under the cap
    if (pts.length >= 2) {
      const d0 = Math.hypot(pts[1].x - pts[0].x, pts[1].z - pts[0].z) || 1;
      const ux0 = (pts[1].x - pts[0].x) / d0, uz0 = (pts[1].z - pts[0].z) / d0;
      const d1 = Math.hypot(pts[pts.length - 1].x - pts[pts.length - 2].x, pts[pts.length - 1].z - pts[pts.length - 2].z) || 1;
      const ux1 = (pts[pts.length - 1].x - pts[pts.length - 2].x) / d1;
      const uz1 = (pts[pts.length - 1].z - pts[pts.length - 2].z) / d1;
      const exit = this.ropeR * 1.05;
      pts = [
        pts[0],
        { x: pts[0].x + ux0 * exit, z: pts[0].z + uz0 * exit },
        ...pts.slice(1, -1),
        { x: pts[pts.length - 1].x - ux1 * exit, z: pts[pts.length - 1].z - uz1 * exit },
        pts[pts.length - 1],
      ];
    }
    const lens = [0];
    for (let i = 1; i < pts.length; i++) {
      lens.push(lens[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    }
    const total = lens[lens.length - 1] || 1;
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const distA = lens[i];
      const distB = total - lens[i];
      const u = i / Math.max(1, pts.length - 1);
      // Blend end attach heights along the span; mid-span settles to floorY
      const endAttach = a0 * (1 - u) + a1 * u;
      const near = Math.min(distA, distB);
      const rise = near < dropDist ? 1 - near / dropDist : 0;
      const riseSmooth = rise * rise * (3 - 2 * rise);
      const dragLift = Math.max(0, scale - 1) * Math.sin(u * Math.PI) * this.ropeR * 1.0;
      const y = floorY + (endAttach - floorY) * riseSmooth + dragLift;
      out.push(new THREE.Vector3(pts[i].x, Math.max(floorY, y), pts[i].z));
    }
    out[0].y = a0;
    out[out.length - 1].y = a1;
    return out;
  }

  syncRopes(ropeStates, endPositionsFn, dragInfo) {
    this._dragRopeIndex = dragInfo ? ropeStates.findIndex(r => r.id === dragInfo.ropeId) : -1;
    this._dragEnd = dragInfo ? dragInfo.end : -1;
    while (this.ropes.length > ropeStates.length) {
      const r = this.ropes.pop();
      this.scene.remove(r.mesh);
      r.geom.dispose();
    }
    // Cap pool: 2 per rope
    while (this.caps.length > ropeStates.length * 2) {
      const m = this.caps.pop();
      this.scene.remove(m);
      m.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    }

    for (let i = 0; i < ropeStates.length; i++) {
      const rs = ropeStates[i];
      if (!this.ropes[i]) {
        const mat = this._ropeMat(rs.color).clone();
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(0, 0.2, 0),
          new THREE.Vector3(1, 0.2, 0),
        ]);
        const geom = buildParallelTransportTube(curve, TUBE_SEGMENTS, this.ropeR, RADIAL);
        const mesh = new THREE.Mesh(geom, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.scene.add(mesh);
        this.ropes[i] = { mesh, geom, mat, id: rs.id, colorHex: rs.color.hex };
      } else if (this.ropes[i].colorHex !== rs.color.hex || this.ropes[i].id !== rs.id) {
        // Rope slot reused / color changed — refresh material + caps
        const mat = this._ropeMat(rs.color).clone();
        this.ropes[i].mesh.material = mat;
        this.ropes[i].mat = mat;
        this.ropes[i].id = rs.id;
        this.ropes[i].colorHex = rs.color.hex;
      }
      for (let e = 0; e < 2; e++) {
        const ci = i * 2 + e;
        if (!this.caps[ci]) {
          const mesh = this._makeCapMesh(rs.color);
          this.scene.add(mesh);
          this.caps[ci] = mesh;
        } else if (this.caps[ci].userData.colorHex !== rs.color.hex) {
          this.scene.remove(this.caps[ci]);
          const mesh = this._makeCapMesh(rs.color);
          this.scene.add(mesh);
          this.caps[ci] = mesh;
        }
      }
    }

    const built = [];
    for (let i = 0; i < ropeStates.length; i++) {
      const rs = ropeStates[i];
      const ends = endPositionsFn(rs.id);
      if (!ends || (rs.clearing && rs.clearT > 0.55)) {
        built.push(null);
        continue;
      }
      const layer = rs.z != null ? rs.z : i;
      // Rest on floor; stacking only via crossing lifts (~1 rope thickness)
      const baseY = this.ropeR * 1.28;
      const guided = rs._guide && !rs._dragging && !rs._playerTouched && !rs.clearing;
      const shown = guided ? rs._guide : displayPoints(rs);
      const srcPts = (shown && shown.length >= 2) ? shown : rs._wrapPath;
      if (!srcPts || srcPts.length < 2) { built.push(null); continue; }
      const stretch = rs.stretch || 1;
      const worldPts = this._smoothWorldPts(srcPts, ends, baseY, stretch, !!rs._traced && guided);
      built.push({ rs, ends, layer, baseY, worldPts, stretch });
    }

    // Crossing lifts — real geometry, no polygonOffset
    const lifts = built.map(b => b ? new Float32Array(b.worldPts.length) : null);
    for (let a = 0; a < built.length; a++) {
      if (!built[a]) continue;
      for (let b = a + 1; b < built.length; b++) {
        if (!built[b]) continue;
        const hi = built[a].layer >= built[b].layer ? a : b;
        const lo = hi === a ? b : a;
        const A = built[hi].worldPts, B = built[lo].worldPts;
        for (let i = 0; i < A.length - 1; i++) {
          for (let j = 0; j < B.length - 1; j++) {
            const hit = segIntersectXZ(A[i], A[i + 1], B[j], B[j + 1]);
            if (!hit) continue;
            // Upper rope clears the lower one by about one rope thickness.
            const liftAmt = this.ropeR * 2.05;
            const influence = this.ropeR * 2.6;
            for (let k = 1; k < A.length - 1; k++) { // never lift endpoints off magnet caps
              const d = Math.hypot(A[k].x - hit.x, A[k].z - hit.z);
              if (d < influence) {
                const t = d / influence;
                const w = (1 - t) * (1 - t) * (1 + 2 * t);
                lifts[hi][k] = Math.max(lifts[hi][k], liftAmt * w);
              }
            }
          }
        }
      }
    }

    // Ropes climb the shoulder of a nearby peg so the crossing has a visible rise.
    for (let i = 0; i < built.length; i++) {
      if (!built[i] || !lifts[i]) continue;
      const pts = built[i].worldPts;
      for (const peg of this.pegs) {
        for (let k = 1; k < pts.length - 1; k++) {
          const d = Math.hypot(pts[k].x - peg.position.x, pts[k].z - peg.position.z);
          const reach = this.ropeOuter + this.pegR * 1.4;
          if (d < reach && d > this.pegR * 0.35) {
            const t = 1 - (d - this.pegR * 0.35) / (reach - this.pegR * 0.35);
            lifts[i][k] = Math.max(lifts[i][k], this.ropeR * 0.9 * t * t);
          }
        }
      }
    }

    // Hard-pin: tube ends always meet caps (crossing lift must not float open mouths)
    for (const L of lifts) {
      if (!L || L.length < 2) continue;
      L[0] = 0;
      L[L.length - 1] = 0;
    }

    for (let i = 0; i < ropeStates.length; i++) {
      const rs = ropeStates[i];
      const entry = this.ropes[i];
      // Retract complete → hide everything together
      if (rs.clearing && rs.clearT > 0.55) {
        entry.mesh.visible = false;
        this.caps[i * 2].visible = false;
        this.caps[i * 2 + 1].visible = false;
        if (entry.endCaps) for (const s of entry.endCaps) s.visible = false;
        continue;
      }
      entry.mesh.visible = true;
      const b = built[i];
      if (!b || b.worldPts.length < 2) continue;

      // Retract: shrink evenly toward midpoint (round tube, caps travel with ends)
      const RETRACT_VIS = 0.32;
      let scale = 1;
      let retractPull = 0;
      if (rs.clearing && rs.retracting) {
        retractPull = Math.min(1, rs.clearT / RETRACT_VIS);
        scale = retractPull < 0.72 ? 1.0 : (1.0 - (retractPull - 0.72) / 0.28 * 0.85);
        entry.mesh.material.opacity = retractPull < 0.65 ? 1 : (1 - (retractPull - 0.65) / 0.35);
        entry.mesh.material.transparent = entry.mesh.material.opacity < 0.99;
      } else {
        entry.mesh.material.transparent = false;
        entry.mesh.material.opacity = 1;
      }

      const nWP = b.worldPts.length;
      const mid = new THREE.Vector3();
      for (const p of b.worldPts) mid.add(p);
      mid.multiplyScalar(1 / nWP);
      const pts = b.worldPts.map((p, k) => {
        let y = (p.y + (lifts[i] ? lifts[i][k] : 0));
        if (retractPull > 0) {
          const t = k / (nWP - 1);
          const endW = Math.min(t, 1 - t) * 2;
          const pull = retractPull * (1 - endW * 0.15);
          return new THREE.Vector3(
            p.x + (mid.x - p.x) * pull,
            y + (mid.y - y) * pull * 0.85,
            p.z + (mid.z - p.z) * pull
          );
        }
        return new THREE.Vector3(p.x, y, p.z);
      });
      // Laplacian-smooth Y so crossing lifts don't kink the tube into sawteeth
      if (pts.length > 4 && !(rs.clearing && rs.retracting)) {
        const ys = pts.map(p => p.y);
        for (let k = 1; k < pts.length - 1; k++) {
          pts[k].y = ys[k] * 0.7 + (ys[k - 1] + ys[k + 1]) * 0.15;
        }
      }

      // Sleeping + stable ends → keep last mesh (no fillet/sparsify flicker)
      if (rs._sleeping && entry._sleepGeomOk && entry.geom) {
        const ends = b.ends;
        const key = `${ends[0].x|0}_${ends[0].y|0}_${ends[1].x|0}_${ends[1].y|0}`;
        if (entry._sleepKey === key) {
          entry.mesh.visible = true;
          // Caps + mouth plugs while sleeping (geom frozen, but seals must stay closed)
          const sealsSleep = this._ensureTubeEndCaps(entry, rs.color);
          for (let e = 0; e < 2; e++) {
            let mesh = this.caps[i * 2 + e];
            const ep = b.ends[e];
            if (!mesh || mesh.userData.colorHex !== rs.color.hex) {
              if (mesh) this.scene.remove(mesh);
              mesh = this._makeCapMesh(rs.color);
              this.scene.add(mesh);
              this.caps[i * 2 + e] = mesh;
            }
            const isDragged = dragInfo && dragInfo.ropeId === rs.id && dragInfo.end === e;
            const attach = entry._end0 && entry._end1
              ? (e === 0 ? entry._end0 : entry._end1)
              : b.worldPts[e === 0 ? 0 : b.worldPts.length - 1];
            const inner = entry._end0 && entry._end1
              ? (e === 0
                  ? (entry._end1.clone().lerp(entry._end0, 0.92))
                  : (entry._end0.clone().lerp(entry._end1, 0.92)))
              : b.worldPts[Math.min(1, b.worldPts.length - 1)];
            if (isDragged) {
              this._dragRopeIndex = i;
              this._dragEnd = e;
              const topY = (ep && ep.onFloor) ? this.floorCapY() : this.pegH;
              mesh.visible = false;
              mesh.position.set(attach.x, topY, attach.z);
              sealsSleep[e].visible = false;
              continue;
            }
            mesh.visible = true;
            mesh.renderOrder = 16;
            if (ep && ep.lifted) mesh.position.set(attach.x, this.pegH, attach.z);
            else {
              const c = this.capOnEnd(attach);
              mesh.position.set(c.x, c.y, c.z);
            }
            mesh.scale.set(1, 1, 1);
            // Plug open mouth under the magnet
            const dir = new THREE.Vector3().subVectors(inner, attach);
            if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1); else dir.normalize();
            const rad = (entry.geom && entry.geom.parameters && entry.geom.parameters.radius) || this.ropeR;
            sealsSleep[e].position.copy(attach).addScaledVector(dir, rad * 0.02);
            sealsSleep[e].scale.setScalar(rad * 1.02);
            sealsSleep[e].lookAt(attach.clone().add(dir));
            sealsSleep[e].visible = true;
            sealsSleep[e].material.transparent = false;
            sealsSleep[e].material.opacity = 1;
          }
          continue;
        }
      }

      let span = 0;
      for (let k = 1; k < pts.length; k++) span += pts[k].distanceTo(pts[k - 1]);
      // Keep every control point. Dropping points that fell under a distance
      // threshold changed the curve from frame to frame and shimmered the braid.
      const cleanPts = [];
      for (let k = 0; k < pts.length; k++) {
        const p = pts[k];
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) continue;
        if (cleanPts.length && cleanPts[cleanPts.length - 1].distanceTo(p) < 1e-5) continue;
        cleanPts.push(p);
      }
      if (cleanPts.length < 2) {
        cleanPts.length = 0;
        cleanPts.push(pts[0].clone(), pts[pts.length - 1].clone().add(new THREE.Vector3(0.01, 0, 0)));
      }
      if (span < this.ropeR * 0.5 || cleanPts.length < 2) {
        entry.mesh.visible = false;
      } else {
        let filleted = cleanPts.map(p => p.clone());
        // During retract the visible end IS the pulled point, so the cap and
        // the stored rope end stay on that mouth. Otherwise the cap owns the end.
        const cap0 = (retractPull > 0 ? pts[0] : b.worldPts[0]).clone();
        const cap1 = (retractPull > 0 ? pts[pts.length - 1] : b.worldPts[b.worldPts.length - 1]).clone();
        const insetEnd = (end, inward) => {
          const d = new THREE.Vector3().subVectors(inward, end);
          if (d.lengthSq() < 1e-8) return end.clone();
          d.normalize();
          return end.clone().addScaledVector(d, this.ropeOuter * 0.12);
        };
        const inner0 = filleted[Math.min(1, filleted.length - 1)];
        const inner1 = filleted[Math.max(0, filleted.length - 2)];
        filleted[0] = insetEnd(cap0, inner0);
        filleted[filleted.length - 1] = insetEnd(cap1, inner1);
        entry._attach0 = cap0.clone();
        entry._attach1 = cap1.clone();
        if (filleted[0].distanceTo(filleted[filleted.length - 1]) < this.ropeR * 0.15) {
          filleted[filleted.length - 1] = cap1.clone().add(new THREE.Vector3(0.05, 0, 0.02));
        }
        filleted = enforceMinBendWorld(filleted, this.ropeR * 1.7);
        filleted[0] = insetEnd(cap0, filleted[Math.min(1, filleted.length - 1)]);
        filleted[filleted.length - 1] = insetEnd(cap1, filleted[Math.max(0, filleted.length - 2)]);
        if (filleted.length >= 3) {
          filleted[1].y = filleted[0].y;
          filleted[filleted.length - 2].y = filleted[filleted.length - 1].y;
        }
        const curve = new THREE.CatmullRomCurve3(filleted, false, 'centripetal', 0.5);
        const stretch = Math.max(0.75, Math.min(2.2, b.stretch || rs.stretch || 1));
        const thickTarget = (stretch > 1.08)
          ? Math.max(0.78, Math.min(1.0, 1 / Math.sqrt(Math.min(stretch, 1.6))))
          : 1.0;
        if (entry._thick == null) entry._thick = thickTarget;
        else if (Math.abs(thickTarget - entry._thick) >= 0.006) {
          entry._thick += (thickTarget - entry._thick) * (rs._dragging ? 0.25 : 1);
        }
        const radius = this.ropeR * Math.max(0.35, scale) * entry._thick;
        let newGeom;
        try {
          newGeom = buildParallelTransportTube(curve, TUBE_SEGS_FIXED, radius, RADIAL, entry._hintN);
        } catch (err) {
          try {
            newGeom = new THREE.TubeGeometry(curve, TUBE_SEGS_FIXED, radius, RADIAL, false);
          } catch (err2) {
            entry.mesh.visible = false;
            continue;
          }
        }
        if (newGeom.userData && newGeom.userData.hintN) entry._hintN = newGeom.userData.hintN;
        if (!newGeom.getAttribute('color')) {
          const n = newGeom.getAttribute('position').count;
          const col = new Float32Array(n * 3);
          col.fill(1);
          newGeom.setAttribute('color', new THREE.BufferAttribute(col, 3));
        }
        const oldGeom = entry.mesh.geometry;
        entry.mesh.geometry = newGeom;
        oldGeom.dispose();
        entry.geom = newGeom;
        entry.mesh.renderOrder = b.layer;
        entry._end0 = cap0.clone();
        entry._end1 = cap1.clone();
        entry.colorHex = rs.color.hex;
        if (rs._sleeping) {
          const ends = b.ends;
          entry._sleepKey = `${ends[0].x|0}_${ends[0].y|0}_${ends[1].x|0}_${ends[1].y|0}`;
          entry._sleepGeomOk = true;
        } else {
          entry._sleepGeomOk = false;
        }
        const seals = this._ensureTubeEndCaps(entry, rs.color);
        const sealR = radius * 1.02;
        for (let ei = 0; ei < 2; ei++) {
          const p = ei === 0 ? filleted[0] : filleted[filleted.length - 1];
          const q = ei === 0 ? filleted[Math.min(1, filleted.length - 1)] : filleted[Math.max(0, filleted.length - 2)];
          const dir = new THREE.Vector3().subVectors(q, p);
          if (dir.lengthSq() > 1e-8) dir.normalize();
          else dir.set(0, 0, 1);
          seals[ei].position.copy(p).addScaledVector(dir, radius * 0.02);
          seals[ei].scale.setScalar(sealR);
          seals[ei].lookAt(p.clone().add(dir));
          seals[ei].visible = !(rs.clearing && rs.clearT > 0.55);
          if (entry.mesh.material.opacity < 1) {
            seals[ei].material.transparent = true;
            seals[ei].material.opacity = entry.mesh.material.opacity;
          } else {
            seals[ei].material.transparent = false;
            seals[ei].material.opacity = 1;
          }
        }
        try {
          const len = curve.getLength();
          const period = 0.58 * (2 * this.ropeOuter);
          const uRepeat = Math.max(2, len / period);
          if (entry._uRepeat == null) entry._uRepeat = uRepeat;
          else {
            const rel = Math.abs(uRepeat - entry._uRepeat) / Math.max(1e-6, entry._uRepeat);
            // Sub-percent length noise used to slide every stripe. Hold the
            // repeat until the rope has actually stretched.
            if (rel >= 0.015) {
              const blend = rs._dragging ? 0.4 : 1;
              entry._uRepeat += (uRepeat - entry._uRepeat) * blend;
            }
          }
          const mat = entry.mesh.material;
          for (const slot of ['map', 'normalMap']) {
            if (mat[slot]) {
              mat[slot].repeat.set(entry._uRepeat, 1);
              mat[slot].needsUpdate = true;
            }
          }
        } catch (_) {}
      }

      for (let e = 0; e < 2; e++) {
        let mesh = this.caps[i * 2 + e];
        const ep = b.ends[e];
        // Cap color must always match this rope
        if (!mesh || mesh.userData.colorHex !== rs.color.hex) {
          if (mesh) this.scene.remove(mesh);
          mesh = this._makeCapMesh(rs.color);
          this.scene.add(mesh);
          this.caps[i * 2 + e] = mesh;
        }
        const isDragged = dragInfo && dragInfo.ropeId === rs.id && dragInfo.end === e;
        if (isDragged) {
          this._dragRopeIndex = i;
          this._dragEnd = e;
          // Keep hidden peg-cap synced under dragCap so pin checks stay valid
          const attach = b.worldPts[e === 0 ? 0 : b.worldPts.length - 1];
          mesh.visible = false;
          const topY = (b.ends[e] && b.ends[e].onFloor) ? this.floorCapY() : this.pegH;
          mesh.position.set(attach.x, topY, attach.z);
          continue;
        }
        if (rs.clearing && (!entry.mesh.visible || rs.clearT > 0.55)) {
          mesh.visible = false;
          if (entry.endCaps) for (const s of entry.endCaps) s.visible = false;
          continue;
        }
        mesh.visible = true;
        mesh.renderOrder = 16;
        const attach = (pts && pts.length >= 2)
          ? pts[e === 0 ? 0 : pts.length - 1]
          : b.worldPts[e === 0 ? 0 : b.worldPts.length - 1];
        let sy = 1, sxz = 1;
        if (ep && ep.squash && ep.squash !== 1 && !(rs.clearing && rs.retracting)) {
          sy = ep.squash;
          sxz = 1 + (1 - sy) * 0.4;
        }
        if (rs.clearing && rs.retracting) {
          const fade = Math.max(0.2, 1 - Math.max(0, rs.clearT - 0.18) / 0.4);
          mesh.position.set(attach.x, attach.y, attach.z);
          mesh.scale.set(sxz * fade, sy * fade, sxz * fade);
          if (mesh.material) {
            mesh.material.transparent = fade < 0.99;
            mesh.material.opacity = fade;
          }
        } else {
          if (ep && ep.lifted) mesh.position.set(attach.x, this.pegH, attach.z);
          else {
            const c = this.capOnEnd(attach);
            mesh.position.set(c.x, c.y, c.z);
          }
          mesh.scale.set(sxz, sy, sxz);
          if (mesh.material) {
            mesh.material.transparent = false;
            mesh.material.opacity = 1;
          }
        }
      }
    }
  }

  setHighlight(pegOrNull, colorHex) {
    if (!pegOrNull) { this.highlight.visible = false; return; }
    const w = this.toWorld(pegOrNull.x, pegOrNull.y);
    this.highlight.visible = true;
    this.highlight.position.set(w.x, this.pegH + 0.02, w.z);
    if (colorHex) this.highlight.material.color.set(colorHex);
    const s = (this.capR + 0.12) / 0.7;
    this.highlight.scale.set(s, s, s);
  }

  setDragCap(posOrNull, color, opts = {}) {
    if (!posOrNull) {
      if (this.dragCap) this.dragCap.visible = false;
      if (this.dragShadow) this.dragShadow.visible = false;
      return;
    }
    if (!this.dragCap) {
      this.dragCap = this._makeCapMesh(color);
      this.scene.add(this.dragCap);
      // Soft drop shadow disc
      this.dragShadow = new THREE.Mesh(
        new THREE.CircleGeometry(this.capR * 1.15, 32),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false })
      );
      this.dragShadow.rotation.x = -Math.PI / 2;
      this.dragShadow.renderOrder = 1;
      this.scene.add(this.dragShadow);
    }
    // Rebuild if color changed
    if (this.dragCap.userData.colorHex !== color.hex) {
      this.scene.remove(this.dragCap);
      this.dragCap = this._makeCapMesh(color);
      this.scene.add(this.dragCap);
    }
    this.dragCap.visible = true;
    this.dragShadow.visible = true;
    const w = this.toWorld(posOrNull.x, posOrNull.y);
    const lift = opts.lift != null ? opts.lift : this.pegH + this.capH + 0.55;
    const persp = opts.scale != null ? opts.scale : 1.08;
    this.dragCap.position.set(w.x, lift, w.z);
    this.dragCap.scale.set(persp, persp, persp);
    this.dragCap.renderOrder = 20;
    // Shadow offset bottom-right on floor
    const shOff = 0.18;
    this.dragShadow.position.set(w.x + shOff, 0.02, w.z + shOff);
    const shScale = 1.0 + (lift - this.pegH) * 0.15;
    this.dragShadow.scale.set(shScale, shScale, shScale);
    this.dragShadow.material.opacity = Math.max(0.12, 0.32 - (lift - this.pegH) * 0.04);
  }


  /** World-space positions of tube mesh endpoints (for automated pin checks). */
  meshEndWorld(ropeIndex) {
    const entry = this.ropes[ropeIndex];
    if (!entry || !entry.geom) return null;
    const c0 = this.caps[ropeIndex * 2];
    const c1 = this.caps[ropeIndex * 2 + 1];
    if (!c0 || !c1) return null;
    // During drag the peg-cap is hidden; dragCap is the visible authoritative cap
    const capPos = (cap, endIdx) => {
      if ((!cap.visible || cap.visible === false) && this.dragCap && this.dragCap.visible
          && this._dragRopeIndex === ropeIndex && this._dragEnd === endIdx) {
        return this.dragCap.position.clone();
      }
      return cap.position.clone();
    };
    const capCol = (cap, endIdx) => {
      if ((!cap.visible) && this.dragCap && this.dragCap.visible
          && this._dragRopeIndex === ropeIndex && this._dragEnd === endIdx) {
        return this.dragCap.userData.colorHex;
      }
      return cap.userData.colorHex;
    };
    if (entry._end0 && entry._end1) {
      return { a: entry._end0.clone(), b: entry._end1.clone(),
        capA: capPos(c0, 0), capB: capPos(c1, 1),
        colorHex: entry.colorHex, capColorA: capCol(c0, 0), capColorB: capCol(c1, 1) };
    }
    return {
      a: c0.position.clone(), b: c1.position.clone(),
      capA: c0.position.clone(), capB: c1.position.clone(),
      colorHex: entry.colorHex, capColorA: c0.userData.colorHex, capColorB: c1.userData.colorHex,
    };
  }

  projectWorld(x, y, z) {
    const v = new THREE.Vector3(x, y, z);
    v.project(this.camera);
    return {
      x: (v.x * 0.5 + 0.5) * this.W,
      y: (-v.y * 0.5 + 0.5) * this.H,
    };
  }

  /** Screen position of a cap sitting on a peg (for picking). */
  projectCapOnPeg(peg) {
    if (!peg) return { x: 0, y: 0 };
    if (peg.pixelLock) {
      const w = this.screenToWorld(peg.x, peg.y, this.pegH);
      return this.projectWorld(w.x, this.pegH, w.z);
    }
    const w = this.toWorld(peg.x, peg.y);
    return this.projectWorld(w.x, this.pegH + this.capH * 0.5, w.z);
  }

  /** Mean screen error of authored pixels after raycast onto the rope plane. */
  centerlineError(screenPts) {
    if (!screenPts || screenPts.length < 2) return 0;
    const y = this.ropeR;
    let sum = 0;
    for (const p of screenPts) {
      const w = this.screenToWorld(p.x, p.y, y);
      const s = this.projectWorld(w.x, y, w.z);
      sum += Math.hypot(s.x - p.x, s.y - p.y);
    }
    return sum / screenPts.length;
  }

  /** On-screen radius of a cap in CSS pixels. */
  capScreenRadius() {
    const w = this.toWorld(this.ox + this.boardW * 0.5, this.oy + this.boardH * 0.5);
    const a = this.projectWorld(w.x - this.capR, this.pegH, w.z);
    const b = this.projectWorld(w.x + this.capR, this.pegH, w.z);
    return Math.abs(b.x - a.x) * 0.5;
  }

  measureScreenFractions(pegList) {
    const W = this.W;
    if (!pegList.length || !this.pegs.length) return null;
    const p0 = pegList[0];
    const w0 = this.toWorld(p0.x, p0.y);
    const left = this.projectWorld(w0.x - this.pegR, this.pegH * 0.5, w0.z);
    const right = this.projectWorld(w0.x + this.pegR, this.pegH * 0.5, w0.z);
    const pegD = Math.abs(right.x - left.x) / W;
    const top = this.projectWorld(w0.x, this.pegH, w0.z);
    const bot = this.projectWorld(w0.x, 0, w0.z);
    const pegHvis = Math.abs(bot.y - top.y) / W;
    let sum = 0, n = 0;
    const scr = pegList.map(p => {
      const w = this.toWorld(p.x, p.y);
      return this.projectWorld(w.x, 0, w.z);
    });
    for (let i = 0; i < scr.length; i++) {
      let best = 1e9;
      for (let j = 0; j < scr.length; j++) if (i !== j) {
        const d = Math.hypot(scr[i].x - scr[j].x, scr[i].y - scr[j].y);
        if (d < best) best = d;
      }
      sum += best; n++;
    }
    const spacing = (sum / n) / W;
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (const s of scr) {
      minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
      minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y);
    }
    const clusterW = (maxX - minX) / W;
    const clusterH = (maxY - minY) / W;
    const ropeD = (2 * this.ropeR) / this.VIEW_W;
    const capD = (2 * this.capR) / this.VIEW_W;
    return {
      pegD, pegHvis, spacing, clusterW, clusterH, ropeD, capD,
      targets: { pegD: 0.055, pegHvis: 0.05, spacing: [0.16, 0.19], clusterW: 0.6, clusterH: 0.7, ropeD: 0.060, capD: 0.069 },
      pegH_world: this.pegH, ropeR: this.ropeR, pegR: this.pegR, capR: this.capR,
    };
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}



/** Push XZ control points outward until local circumradius ≥ minR (keeps Y). */




/** Soften polyline corners so circumradius ≥ minR (world XZ). */
function enforceMinBendWorld(pts, minR) {
  if (!pts || pts.length < 3) return pts;
  const out = pts.map(p => p.clone());
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 1; i < out.length - 1; i++) {
      const a = out[i - 1], b = out[i], c = out[i + 1];
      const d1 = a.distanceTo(b) || 1e-6;
      const d2 = b.distanceTo(c) || 1e-6;
      const d3 = a.distanceTo(c) || 1e-6;
      const area2 = Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x));
      if (area2 < 1e-8) continue;
      const R = (d1 * d2 * d3) / (2 * area2);
      if (R >= minR) continue;
      const mx = (a.x + c.x) * 0.5, mz = (a.z + c.z) * 0.5;
      const t = Math.min(0.75, (minR - R) / minR);
      b.x += (mx - b.x) * t;
      b.z += (mz - b.z) * t;
      // keep Y as blend
      b.y = b.y * (1 - t * 0.5) + ((a.y + c.y) * 0.5) * (t * 0.5);
    }
  }
  return out;
}

/** Replace sharp corners with circular fillets of radius minR (XZ; keeps Y). */
function sparsifyPts(pts, minDist) {
  if (!pts || pts.length < 3) return pts;
  const out = [pts[0].clone()];
  for (let i = 1; i < pts.length - 1; i++) {
    if (out[out.length - 1].distanceTo(pts[i]) >= minDist) out.push(pts[i].clone());
  }
  out.push(pts[pts.length - 1].clone());
  return out;
}

function filletSharpCorners(pts, minR) {
  if (!pts || pts.length < 3) return pts;
  const out = [pts[0].clone()];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1];
    const b = pts[i];
    const c = pts[i + 1];
    const abx = b.x - a.x, abz = b.z - a.z;
    const bcx = c.x - b.x, bcz = c.z - b.z;
    const ab = Math.hypot(abx, abz);
    const bc = Math.hypot(bcx, bcz);
    if (ab < 1e-5 || bc < 1e-5) { out.push(b.clone()); continue; }
    const ux0 = abx / ab, uz0 = abz / ab;
    const ux1 = bcx / bc, uz1 = bcz / bc;
    const cross = abx * bcz - abz * bcx;
    const dot = Math.max(-1, Math.min(1, ux0 * ux1 + uz0 * uz1));
    const turn = Math.acos(dot);
    if (turn < 0.2) { out.push(b.clone()); continue; }
    // Largest fillet that fits on both legs, capped at minR
    const maxInset = Math.min(ab, bc) * 0.45;
    const tanHalf = Math.tan(turn * 0.5);
    if (tanHalf < 1e-4) { out.push(b.clone()); continue; }
    const R = Math.min(minR, maxInset / tanHalf);
    if (R < minR * 0.35) {
      // Too tight for a full arc — still soften by cutting the corner (kills self-overlap folds)
      const cut = Math.min(ab, bc) * 0.35;
      out.push(new THREE.Vector3(b.x - ux0 * cut, b.y, b.z - uz0 * cut));
      out.push(new THREE.Vector3(b.x + ux1 * cut, b.y, b.z + uz1 * cut));
      continue;
    }
    const inset = R * tanHalf;
    const y = b.y;
    const p0 = new THREE.Vector3(b.x - ux0 * inset, y, b.z - uz0 * inset);
    const p1 = new THREE.Vector3(b.x + ux1 * inset, y, b.z + uz1 * inset);
    const sign = cross >= 0 ? 1 : -1;
    const nx = -uz0 * sign, nz = ux0 * sign;
    const cx = p0.x + nx * R;
    const cz = p0.z + nz * R;
    let a0 = Math.atan2(p0.z - cz, p0.x - cx);
    let a1 = Math.atan2(p1.z - cz, p1.x - cx);
    let dAng = a1 - a0;
    if (sign > 0 && dAng < 0) dAng += Math.PI * 2;
    if (sign < 0 && dAng > 0) dAng -= Math.PI * 2;
    if (Math.abs(dAng) > Math.PI * 1.05 || Math.abs(dAng) < 0.05) { out.push(b.clone()); continue; }
    const nArc = Math.max(5, Math.ceil(Math.abs(dAng) / 0.2));
    out.push(p0);
    for (let k = 1; k < nArc; k++) {
      const ang = a0 + dAng * (k / nArc);
      out.push(new THREE.Vector3(cx + Math.cos(ang) * R, y, cz + Math.sin(ang) * R));
    }
    out.push(p1);
  }
  out.push(pts[pts.length - 1].clone());
  const cleaned = [out[0]];
  for (let i = 1; i < out.length; i++) {
    if (cleaned[cleaned.length - 1].distanceTo(out[i]) > 1e-4) cleaned.push(out[i]);
  }
  return cleaned;
}

function segIntersectXZ(a0, a1, b0, b1) {
  const ax = a1.x - a0.x, az = a1.z - a0.z;
  const bx = b1.x - b0.x, bz = b1.z - b0.z;
  const den = ax * bz - az * bx;
  if (Math.abs(den) < 1e-8) return null;
  const dx = b0.x - a0.x, dz = b0.z - a0.z;
  const t = (dx * bz - dz * bx) / den;
  const u = (dx * az - dz * ax) / den;
  if (t < 0.05 || t > 0.95 || u < 0.05 || u > 0.95) return null;
  return { x: a0.x + t * ax, z: a0.z + t * az };
}

function resample2D(pts, n) {
  if (pts.length <= 2) return pts.slice();
  const lens = [0];
  for (let i = 1; i < pts.length; i++) {
    lens.push(lens[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  }
  const total = lens[lens.length - 1] || 1;
  const out = [];
  for (let i = 0; i < n; i++) {
    const target = (i / (n - 1)) * total;
    let j = 1;
    while (j < lens.length - 1 && lens[j] < target) j++;
    const seg = lens[j] - lens[j - 1] || 1;
    const t = (target - lens[j - 1]) / seg;
    out.push({
      x: pts[j - 1].x + (pts[j].x - pts[j - 1].x) * t,
      z: pts[j - 1].z + (pts[j].z - pts[j - 1].z) * t,
    });
  }
  return out;
}

function chaikin(pts) {
  if (pts.length < 3) return pts.slice();
  const out = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    out.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 });
    out.push({ x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 });
  }
  out.push(pts[pts.length - 1]);
  return out;
}
