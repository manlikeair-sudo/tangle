/**
 * Three.js: orthographic tilt, braid tubes, light-blue pegs, flat magnetic caps on peg tops.
 * No logarithmicDepthBuffer (iOS). Crossing lifts via real Y offsets.
 */
import * as THREE from '../vendor/three.module.js';
import { makeBraidCanvas, makeBraidNormalCanvas } from './braidTexture.js';

const TUBE_SEGMENTS = 96;
const RADIAL = 36;

/**
 * Tube with Bishop/parallel-transport frames (no Frenet twist flip → no flattening at bends).
 */
function buildParallelTransportTube(curve, tubularSegments, radius, radialSegments) {
  const frames = computeParallelTransportFrames(curve, tubularSegments);
  const radial = radialSegments;
  const tubular = tubularSegments;
  const verts = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  const P = new THREE.Vector3();
  const N = new THREE.Vector3();
  const B = new THREE.Vector3();
  for (let i = 0; i <= tubular; i++) {
    P.copy(frames.points[i]);
    N.copy(frames.normals[i]);
    B.copy(frames.binormals[i]);
    for (let j = 0; j <= radial; j++) {
      const v = j / radial;
      const ang = v * Math.PI * 2;
      const sin = Math.sin(ang);
      const cos = -Math.cos(ang);
      // normal = cos*N + sin*B
      const nx = cos * N.x + sin * B.x;
      const ny = cos * N.y + sin * B.y;
      const nz = cos * N.z + sin * B.z;
      normals.push(nx, ny, nz);
      verts.push(P.x + radius * nx, P.y + radius * ny, P.z + radius * nz);
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
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  // stash for integrity/debug
  geom.parameters = { path: curve, tubularSegments, radius, radialSegments, closed: false };
  return geom;
}

function computeParallelTransportFrames(curve, segments) {
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
  // Initial normal: pick axis least aligned with T0
  const t0 = tangents[0];
  const absx = Math.abs(t0.x), absy = Math.abs(t0.y), absz = Math.abs(t0.z);
  if (absy <= absx && absy <= absz) N.set(0, 1, 0);
  else if (absx <= absz) N.set(1, 0, 0);
  else N.set(0, 0, 1);
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
      const bg = bx.createRadialGradient(256, 270, 20, 256, 270, 230);
      bg.addColorStop(0, '#FFFFFF');
      bg.addColorStop(0.10, '#F7FAFC');
      bg.addColorStop(0.28, '#DDE3EA');
      bg.addColorStop(0.55, '#C5CDD8');
      bg.addColorStop(0.78, '#B9C3CF');
      bg.addColorStop(1, '#A8B2BE');
      bx.fillStyle = bg;
      bx.fillRect(0, 0, 512, 512);
      const bgTex = new THREE.CanvasTexture(bgC);
      bgTex.colorSpace = THREE.SRGBColorSpace;
      this.scene.background = bgTex;
    }

    this._camTilt = (16 * Math.PI) / 180;
    this._camDist = 28;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 120);

    // Floor sized to the view so the vignette is visible (not washed white)
    const floorCanvas = document.createElement('canvas');
    floorCanvas.width = 512; floorCanvas.height = 512;
    const fctx = floorCanvas.getContext('2d');
    const fg = fctx.createRadialGradient(256, 256, 18, 256, 256, 250);
    fg.addColorStop(0, '#FFFFFF');
    fg.addColorStop(0.12, '#F5F8FB');
    fg.addColorStop(0.32, '#DDE3EA');
    fg.addColorStop(0.58, '#C5CDD8');
    fg.addColorStop(0.82, '#B9C3CF');
    fg.addColorStop(1, '#A8B2BE');
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
      new THREE.ShadowMaterial({ opacity: 0.30 })
    );
    this.shadowFloor.rotation.x = -Math.PI / 2;
    this.shadowFloor.position.y = 0.008;
    this.shadowFloor.receiveShadow = true;
    this.scene.add(this.shadowFloor);

    // Brighter hemi/ambient so MeshStandard braid stays saturated (no grey wash)
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x8a9aa8, 0.38);
    this.scene.add(this.hemi);
    // High soft key → tight darker contact shadows under ropes
    this.sun = new THREE.DirectionalLight(0xffffff, 1.15);
    this.sun.position.set(3.5, 22, -2.5); // more side angle for tube form
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 45;
    this.sun.shadow.camera.left = -8;
    this.sun.shadow.camera.right = 8;
    this.sun.shadow.camera.top = 8;
    this.sun.shadow.camera.bottom = -8;
    this.sun.shadow.bias = -0.00025;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 1.15;
    this.scene.add(this.sun);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.18));
    const fill = new THREE.DirectionalLight(0xe8f4ff, 0.32);
    fill.position.set(-5, 12, 5);
    this.scene.add(fill);
    // Low-angle rim so tube limbs read round from top-down
    const rim = new THREE.DirectionalLight(0xffffff, 0.45);
    rim.position.set(8, 4, 3);
    this.scene.add(rim);

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
    this.pegR = (0.055 * V) / 2;
    // Rope diameter ≈ 1.05× peg diameter → chunky
    this.ropeR = this.pegR * 1.10;
    // Cap slightly wider than peg — thick saturated disc
    this.capR = this.pegR * 1.25;
    this.capH = this.pegR * 0.42;
    // Visible peg height ≈ 1.2× peg diameter
    // World height tuned so screen pegHvis ≈ 1.2× pegD under ~16° ortho tilt
    this.pegH = this.pegR * 2 * 0.38 * 3.6; // screen pegHvis ≈ 0.38× pegD — short glossy like reference
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

  setBoardLayout(ox, oy, boardW, boardH) {
    this.ox = ox; this.oy = oy; this.boardW = boardW; this.boardH = boardH;
    const frac = boardW / Math.max(1, this.W);
    this.worldSpan = this.VIEW_W * frac;
  }

  toWorld(px, py) {
    const nx = (px - this.ox) / this.boardW - 0.5;
    const nz = (py - this.oy) / this.boardH - 0.5;
    const zScale = 0.95; // tighter cluster like reference
    return { x: nx * this.worldSpan, z: nz * this.worldSpan * zScale };
  }

  /** Inverse of toWorld — board/CSS coords from world XZ. */
  fromWorld(wx, wz) {
    const zScale = 0.95;
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
  screenToBoard(sx, sy, planeY = 0) {
    const ndcX = (sx / Math.max(1, this.W)) * 2 - 1;
    const ndcY = -(sy / Math.max(1, this.H)) * 2 + 1;
    const near = new THREE.Vector3(ndcX, ndcY, -1).unproject(this.camera);
    const far = new THREE.Vector3(ndcX, ndcY, 1).unproject(this.camera);
    const dir = far.sub(near);
    if (Math.abs(dir.y) < 1e-8) {
      return this.fromWorld(near.x, near.z);
    }
    const t = (planeY - near.y) / dir.y;
    const hx = near.x + dir.x * t;
    const hz = near.z + dir.z * t;
    return this.fromWorld(hx, hz);
  }

  /** Project a board-space point at a given world Y (cap center). */
  projectBoardAt(px, py, worldY) {
    const w = this.toWorld(px, py);
    return this.projectWorld(w.x, worldY, w.z);
  }

  floorCapY() {
    // Cap disc sits just above the floor rope height
    return Math.max(this.ropeR * 0.35, this.capH * 0.55);
  }

  _placeCamera() {
    const d = this._camDist;
    const t = this._camTilt;
    this.camera.position.set(0, d * Math.cos(t), d * Math.sin(t));
    this.camera.lookAt(0, 0.2, 0);
    this.camera.up.set(0, 1, 0);
  }

  _pegMat() {
    if (this._pegMatCached) return this._pegMatCached;
    const sideC = document.createElement('canvas');
    sideC.width = 128; sideC.height = 128;
    const sctx = sideC.getContext('2d');
    const sg = sctx.createLinearGradient(0, 0, 0, 128);
    sg.addColorStop(0, '#D4F0FA');
    sg.addColorStop(0.35, '#B0E4F6');
    sg.addColorStop(0.7, '#96D8F2');
    sg.addColorStop(1, '#82CBEC');
    sctx.fillStyle = sg;
    sctx.fillRect(0, 0, 128, 128);
    // Strong specular streak (glossy cylinder look under NoToneMapping)
    const hg = sctx.createLinearGradient(0, 0, 128, 0);
    hg.addColorStop(0.0, 'rgba(255,255,255,0.0)');
    hg.addColorStop(0.18, 'rgba(255,255,255,0.15)');
    hg.addColorStop(0.32, 'rgba(255,255,255,0.72)');
    hg.addColorStop(0.40, 'rgba(255,255,255,0.35)');
    hg.addColorStop(0.55, 'rgba(255,255,255,0.05)');
    hg.addColorStop(0.85, 'rgba(30,80,110,0.10)');
    hg.addColorStop(1.0, 'rgba(20,60,90,0.18)');
    sctx.fillStyle = hg;
    sctx.fillRect(0, 0, 128, 128);
    const sideTex = new THREE.CanvasTexture(sideC);
    sideTex.colorSpace = THREE.SRGBColorSpace;
    this._pegMatCached = new THREE.MeshStandardMaterial({
      map: sideTex, color: 0xffffff,
      roughness: 0.22, metalness: 0.08,
      emissive: new THREE.Color(0x7EC8E8), emissiveIntensity: 0.12,
    });
    return this._pegMatCached;
  }

  _pegTopMat() {
    if (this._pegTopMatCached) return this._pegTopMatCached;
    const topC = document.createElement('canvas');
    topC.width = 128; topC.height = 128;
    const tctx = topC.getContext('2d');
    const rg = tctx.createRadialGradient(48, 44, 4, 64, 64, 64);
    rg.addColorStop(0, '#FFFFFF');
    rg.addColorStop(0.25, '#F2FBFE');
    rg.addColorStop(0.55, '#D8F0FA');
    rg.addColorStop(0.85, '#B5E3F5');
    rg.addColorStop(1, '#9DD6EE');
    tctx.fillStyle = rg;
    tctx.fillRect(0, 0, 128, 128);
    const topTex = new THREE.CanvasTexture(topC);
    topTex.colorSpace = THREE.SRGBColorSpace;
    this._pegTopMatCached = new THREE.MeshStandardMaterial({
      map: topTex, color: 0xffffff,
      roughness: 0.15, metalness: 0.08,
      emissive: new THREE.Color(0xD0EAF5), emissiveIntensity: 0.18,
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
    const aniso = Math.min(16, this.renderer.capabilities.getMaxAnisotropy?.() || 8);
    const canvas = makeBraidCanvas(color.hex, color.dark, color.light, 512);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 1);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = aniso;
    tex.needsUpdate = true;
    if (!this._braidNormal) {
      const nc = makeBraidNormalCanvas(512);
      this._braidNormal = new THREE.CanvasTexture(nc);
      this._braidNormal.wrapS = THREE.RepeatWrapping;
      this._braidNormal.wrapT = THREE.RepeatWrapping;
      this._braidNormal.generateMipmaps = false;
      this._braidNormal.minFilter = THREE.LinearFilter;
      this._braidNormal.magFilter = THREE.LinearFilter;
      this._braidNormal.anisotropy = aniso;
      this._braidNormal.needsUpdate = true;
    }
    const nrm = this._braidNormal.clone();
    nrm.wrapS = THREE.RepeatWrapping;
    nrm.wrapT = THREE.RepeatWrapping;
    nrm.generateMipmaps = false;
    nrm.minFilter = THREE.LinearFilter;
    nrm.magFilter = THREE.LinearFilter;
    nrm.anisotropy = aniso;
    nrm.repeat.set(4, 1);
    const baseCol = new THREE.Color(color.hex);
    // Helix3 material: roughness 0.55, normalScale 1.15 — round tube shading
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      normalMap: nrm,
      normalScale: new THREE.Vector2(0.62, 0.62),
      color: 0xffffff,
      roughness: 0.40,
      metalness: 0.0,
      emissive: baseCol.clone().multiplyScalar(0.08),
      emissiveIntensity: 1,
    });
    this.texCache.set(key, mat);
    return mat;
  }

  _capMat(color) {
    const key = 'cap|' + color.hex;
    if (this.texCache.has(key)) return this.texCache.get(key);
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const ctx = c.getContext('2d');
    const cx = 64, cy = 64;
    ctx.beginPath(); ctx.arc(cx, cy, 62, 0, Math.PI * 2);
    ctx.fillStyle = color.hex; ctx.fill();
    const rim = ctx.createRadialGradient(cx, cy, 40, cx, cy, 62);
    rim.addColorStop(0, 'rgba(0,0,0,0)');
    rim.addColorStop(0.75, 'rgba(0,0,0,0.04)');
    rim.addColorStop(1, 'rgba(0,0,0,0.2)');
    ctx.fillStyle = rim; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, 30, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, 23, 0, Math.PI * 2);
    const dark = ctx.createRadialGradient(cx - 3, cy - 4, 1, cx, cy, 23);
    dark.addColorStop(0, color.dark);
    dark.addColorStop(0.65, color.dark);
    dark.addColorStop(1, '#120808');
    ctx.fillStyle = dark; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, 23, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2.5; ctx.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const base = new THREE.Color(color.hex);
    const mat = new THREE.MeshStandardMaterial({
      map: tex, color: 0xffffff,
      roughness: 0.45, metalness: 0.0,
      emissive: base.clone().multiplyScalar(0.1), emissiveIntensity: 1,
    });
    this.texCache.set(key, mat);
    return mat;
  }

  syncPegs(pegList) {
    while (this.pegs.length > pegList.length) {
      const g = this.pegs.pop();
      this.scene.remove(g);
      g.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    }
    while (this.pegs.length < pegList.length) {
      const group = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(this.pegR * 0.98, this.pegR * 1.06, this.pegH, 48),
        this._pegMat()
      );
      body.castShadow = true;
      body.receiveShadow = true;
      body.position.y = this.pegH * 0.5;
      const top = new THREE.Mesh(
        new THREE.CylinderGeometry(this.pegR * 1.01, this.pegR * 1.01, this.pegH * 0.05, 48),
        this._pegTopMat()
      );
      top.position.y = this.pegH - this.pegH * 0.02;
      top.castShadow = true;
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(this.pegR * 0.97, this.pegR * 0.04, 10, 48),
        this._pegTopMat()
      );
      rim.rotation.x = Math.PI / 2;
      rim.position.y = this.pegH * 0.012;
      // Soft AO ring at base
      const ao = new THREE.Mesh(
        new THREE.CircleGeometry(this.pegR * 1.35, 32),
        this._pegAOMat()
      );
      ao.rotation.x = -Math.PI / 2;
      ao.position.y = 0.015;
      ao.renderOrder = 1;
      body.renderOrder = 5;
      top.renderOrder = 6;
      rim.renderOrder = 6;
      group.add(ao, body, top, rim);
      group.userData.body = body;
      this.scene.add(group);
      this.pegs.push(group);
    }
    for (let i = 0; i < pegList.length; i++) {
      const w = this.toWorld(pegList[i].x, pegList[i].y);
      const m = this.pegs[i];
      const dip = this._pegDip.get(pegList[i].id) || 0;
      m.position.set(w.x, -dip, w.z);
      m.visible = true;
    }
  }

  setPegDip(pegId, amount) {
    if (amount <= 0) this._pegDip.delete(pegId);
    else this._pegDip.set(pegId, amount);
  }

  _makeCapMesh(color) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(this.capR, this.capR * 1.02, this.capH, 40),
      this._capMat(color)
    );
    body.castShadow = true;
    body.receiveShadow = true;
    body.position.y = this.capH * 0.5;
    // Glossy top ring (annulus look via texture) + slight bevel rim
    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(this.capR * 0.99, this.capR * 0.99, this.capH * 0.1, 40),
      this._capMat(color)
    );
    top.position.y = this.capH * 0.95;
    top.castShadow = true;
    const bevel = new THREE.Mesh(
      new THREE.TorusGeometry(this.capR * 0.92, this.capR * 0.06, 8, 40),
      this._capMat(color)
    );
    bevel.rotation.x = Math.PI / 2;
    bevel.position.y = this.capH * 0.92;
    group.add(body, top, bevel);
    group.userData.colorHex = color.hex;
    group.userData.body = body;
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

  /** Clean control points for TubeGeometry. */
  _smoothWorldPts(raw, ends, baseY, scale) {
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

    // Dense control points so tight bends stay round (avoid sawtooth tubes)
    const targetN = Math.max(12, Math.min(28, Math.max(pts.length, 16)));
    pts = resample2D(pts, targetN);
    for (let i = 0; i < 4; i++) pts = chaikin(pts);
    // Re-pin ends after chaikin/resample (those filters can drift endpoints)
    pts[0] = { x: e0.x, z: e0.z };
    pts[pts.length - 1] = { x: e1.x, z: e1.z };

    // Rope leaves the cap sideways and hits the floor within ~1 rope diameter.
    // Attach near resting height (under the magnet disc) — no tall pipe rise.
    // Centerline must clear floor by ≥ ropeR so the full round tube is visible
    // (floorY≈ropeR*1.02 buried the lower half → flat "ribbon" look from above)
    const floorY = this.ropeR * 1.28; // keep full round tube above floor (no flat-stick)
    const attachYPeg = Math.max(this.ropeR * 1.5, this.pegH * 0.88);
    const attachYFloor = Math.max(this.floorCapY() * 0.85, this.ropeR * 1.35);
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
    const dropDist = this.ropeR * 3.6; // ~1.8 rope diameters — natural cap→floor drape
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
      const layer = Math.min(3, (rs.z || i) % 4);
      // Rest on floor; stacking only via crossing lifts (~1 rope thickness)
      const baseY = this.ropeR * 1.28;
      const srcPts = (rs.points && rs.points.length >= 2) ? rs.points : rs._wrapPath;
      if (!srcPts || srcPts.length < 2) { built.push(null); continue; }
      const stretch = rs.stretch || 1;
      const worldPts = this._smoothWorldPts(srcPts, ends, baseY, stretch);
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
            const stack = (built[hi].layer - built[lo].layer) + 1;
            // Soft stacked contact — upper rope rests on lower with gentle height
            const liftAmt = 2 * this.ropeR * Math.max(1, stack) * 1.05;
            const influence = this.ropeR * 5.0;
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
        for (let pass = 0; pass < 2; pass++) {
          const ys = pts.map(p => p.y);
          for (let k = 1; k < pts.length - 1; k++) {
            pts[k].y = ys[k] * 0.5 + (ys[k - 1] + ys[k + 1]) * 0.25;
          }
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
            mesh.renderOrder = 12;
            const topY = ep.onFloor ? this.floorCapY() : this.pegH;
            mesh.position.set(attach.x, topY, attach.z);
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
      const cleanPts = [];
      for (let k = 0; k < pts.length; k++) {
        const p = pts[k];
        const isEnd = k === 0 || k === pts.length - 1;
        if (isEnd || !cleanPts.length || cleanPts[cleanPts.length - 1].distanceTo(p) > this.ropeR * 0.07) {
          // Always keep true endpoints (never drop last into previous)
          if (isEnd && cleanPts.length && k === pts.length - 1) {
            if (cleanPts[cleanPts.length - 1].distanceTo(p) < 1e-6) cleanPts.pop();
          }
          cleanPts.push(p);
        }
      }
      if (cleanPts.length < 2) {
        cleanPts.length = 0;
        cleanPts.push(pts[0].clone(), pts[pts.length - 1].clone().add(new THREE.Vector3(0.01, 0, 0)));
      }
      if (span < this.ropeR * 0.5 || cleanPts.length < 2) {
        entry.mesh.visible = false;
      } else {
        // Sparsify → fillet (adaptive radius) → dense tube.
        let sparse = sparsifyPts(cleanPts, this.ropeR * 2.2);
        sparse = sparse.filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
        if (sparse.length < 2) {
          entry.mesh.visible = false;
          continue;
        }
        // Keep endpoints through sparsify
        sparse[0] = cleanPts[0].clone();
        sparse[sparse.length - 1] = cleanPts[cleanPts.length - 1].clone();
        // Larger min bend radius → no kinked self-overlapping folds
        let filleted = filletSharpCorners(sparse, this.ropeR * 2.35);
        filleted = filletSharpCorners(sparsifyPts(filleted, this.ropeR * 1.6), this.ropeR * 2.1);
        filleted = filletSharpCorners(filleted, this.ropeR * 1.9);
        filleted = (filleted || []).filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
        if (filleted.length < 2) filleted = sparse.slice();
        // HARD-PIN mesh ends to cap attach points (authoritative). Caps never float off.
        // Endpoints are cap-owned — never add crossing lift here
        const cap0 = b.worldPts[0].clone();
        const cap1 = b.worldPts[b.worldPts.length - 1].clone();
        // Pin near caps but inset slightly so open tube face sits under the solid disc (not in dark recess)
        const insetEnd = (end, inward) => {
          const d = new THREE.Vector3().subVectors(inward, end);
          if (d.lengthSq() < 1e-8) return end.clone();
          d.normalize();
          // Tiny inset; solid seal plugs close the mouth so rim never reads as a hollow cut
          return end.clone().addScaledVector(d, Math.min(this.ropeR * 0.22, this.capR * 0.18));
        };
        const inner0 = filleted[Math.min(1, filleted.length - 1)];
        const inner1 = filleted[Math.max(0, filleted.length - 2)];
        filleted[0] = insetEnd(cap0, inner0);
        filleted[filleted.length - 1] = insetEnd(cap1, inner1);
        // Integrity still compares to cap xz via _end0/_end1 — store true attach for pin checks
        entry._attach0 = cap0.clone();
        entry._attach1 = cap1.clone();
        if (filleted[0].distanceTo(filleted[filleted.length - 1]) < this.ropeR * 0.15) {
          filleted[filleted.length - 1] = cap1.clone().add(new THREE.Vector3(0.05, 0, 0.02));
        }
        // World-space min bend ≥ tube radius — prevents TubeGeometry self-overlap folds
        filleted = enforceMinBendWorld(filleted, this.ropeR * 1.55);
        filleted[0] = insetEnd(cap0, filleted[Math.min(1, filleted.length - 1)]);
        filleted[filleted.length - 1] = insetEnd(cap1, filleted[Math.max(0, filleted.length - 2)]);
        // Horizontal exit under disc — open face vertical, not tipped into camera (no sunburst)
        if (filleted.length >= 3) {
          filleted[1].y = filleted[0].y;
          filleted[filleted.length - 2].y = filleted[filleted.length - 1].y;
        }
        const curve = new THREE.CatmullRomCurve3(filleted, false, 'centripetal', 0.5);
        const stretch = Math.max(0.75, Math.min(2.2, b.stretch || rs.stretch || 1));
        // Uniform rest thickness (no local inflate). Thin only when actually stretched.
        const thick = (stretch > 1.08)
          ? Math.max(0.78, Math.min(1.0, 1 / Math.sqrt(Math.min(stretch, 1.6))))
          : 1.0;
        const radius = this.ropeR * Math.max(0.35, scale) * thick;
        let segs = Math.min(180, Math.max(112, Math.round(curve.getLength() / (this.ropeR * 0.14))));
        let newGeom;
        try {
          newGeom = buildParallelTransportTube(curve, segs, radius, RADIAL);
        } catch (err) {
          try {
            newGeom = new THREE.TubeGeometry(curve, segs, radius, RADIAL, false);
          } catch (err2) {
            entry.mesh.visible = false;
            continue;
          }
        }
        entry.mesh.geometry.dispose();
        entry.mesh.geometry = newGeom;
        entry.geom = newGeom;
        entry.mesh.renderOrder = b.layer;
        // Pin-check uses attach (cap centers); mesh ends are slightly inset under the disc
        entry._end0 = (entry._attach0 || filleted[0]).clone();
        entry._end1 = (entry._attach1 || filleted[filleted.length - 1]).clone();
        entry.colorHex = rs.color.hex;
        if (rs._sleeping) {
          const ends = b.ends;
          entry._sleepKey = `${ends[0].x|0}_${ends[0].y|0}_${ends[1].x|0}_${ends[1].y|0}`;
          entry._sleepGeomOk = true;
        } else {
          entry._sleepGeomOk = false;
        }
        // Seals fully under magnet caps — never visible on top (no braid sunburst)
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
          seals[ei].visible = !(rs.clearing && rs.clearT > 0.5);
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
          // free1 period — denser repeats looked like stacked rings
          const period = 1.8 * (2 * this.ropeR);
          const uRepeat = Math.max(2, len / period);
          const mat = entry.mesh.material;
          for (const slot of ['map', 'normalMap']) {
            if (mat[slot]) {
              mat[slot].repeat.set(uRepeat, 1);
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
        if (rs.clearing && rs.clearT > 0.55) {
          mesh.visible = false;
          continue;
        }
        mesh.visible = true;
        mesh.renderOrder = 12;
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
          const topY = ep.onFloor ? this.floorCapY() : this.pegH;
          mesh.position.set(attach.x, topY, attach.z);
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
    const w = this.toWorld(peg.x, peg.y);
    return this.projectWorld(w.x, this.pegH + this.capH * 0.5, w.z);
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
