/**
 * Three.js renderer: orthographic-ish tilted view, TubeGeometry ropes,
 * Cylinder pegs, Torus rings, soft shadows.
 */
import * as THREE from '../vendor/three.module.js';
import { makeBraidCanvas } from './braidTexture.js';

const TUBE_SEGMENTS = 64;
const RADIAL = 12;

export class Scene3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.W = 1; this.H = 1;
    this.boardW = 1; this.boardH = 1;
    this.ox = 0; this.oy = 0;
    this.worldSpan = 10;

    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: false, powerPreference: 'high-performance',
      logarithmicDepthBuffer: true,
    });
    this.renderer.setClearColor(0xC5D0DA, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;

    this.scene = new THREE.Scene();
    {
      const bgC = document.createElement('canvas');
      bgC.width = 512; bgC.height = 512;
      const bx = bgC.getContext('2d');
      const bg = bx.createRadialGradient(256, 270, 25, 256, 270, 270);
      bg.addColorStop(0, '#F6F9FC');
      bg.addColorStop(0.35, '#E8EEF4');
      bg.addColorStop(0.7, '#C8D2DC');
      bg.addColorStop(1, '#BAC5CF');
      bx.fillStyle = bg;
      bx.fillRect(0, 0, 512, 512);
      const bgTex = new THREE.CanvasTexture(bgC);
      bgTex.colorSpace = THREE.SRGBColorSpace;
      this.scene.background = bgTex;
    }

    // Orthographic camera tilted ~23° off vertical (peg sides visible)
    this._camTilt = (18 * Math.PI) / 180;
    this._camDist = 28;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 120);

    // Floor radial spot
    const floorCanvas = document.createElement('canvas');
    floorCanvas.width = 512; floorCanvas.height = 512;
    const fctx = floorCanvas.getContext('2d');
    const fg = fctx.createRadialGradient(256, 256, 10, 256, 256, 220);
    fg.addColorStop(0, '#FFFFFF');
    fg.addColorStop(0.2, '#F6F9FC');
    fg.addColorStop(0.5, '#D8E2EA');
    fg.addColorStop(1, '#BAC5CF');
    fctx.fillStyle = fg;
    fctx.fillRect(0, 0, 512, 512);
    const floorTex = new THREE.CanvasTexture(floorCanvas);
    floorTex.colorSpace = THREE.SRGBColorSpace;
    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(48, 48),
      new THREE.MeshBasicMaterial({ map: floorTex })
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);

    // Soft shadow catcher (ShadowMaterial) slightly above floor
    this.shadowFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(48, 48),
      new THREE.ShadowMaterial({ opacity: 0.14 })
    );
    this.shadowFloor.rotation.x = -Math.PI / 2;
    this.shadowFloor.position.y = 0.01;
    this.shadowFloor.receiveShadow = true;
    this.scene.add(this.shadowFloor);

    this.hemi = new THREE.HemisphereLight(0xfffaf5, 0x7a8794, 0.55);
    this.scene.add(this.hemi);
    // Directional from lower-right → shadows toward upper-left
    this.sun = new THREE.DirectionalLight(0xffffff, 1.7);
    this.sun.position.set(7, 16, -6); // upper-right → darker rope undersides
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 50;
    this.sun.shadow.camera.left = -10;
    this.sun.shadow.camera.right = 10;
    this.sun.shadow.camera.top = 10;
    this.sun.shadow.camera.bottom = -10;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.025;
    this.sun.shadow.radius = 6;
    this.sun.shadow.camera.far = 42;
    this.scene.add(this.sun);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.2));

    // Absolute screen-fraction scale (VIEW_W = visible world width)
    // Targets: pegD=0.055W, ropeD=0.045W, ringOD=0.07W, pegH_vis≈0.07W
    this.VIEW_W = 10;
    this._applyTargetProportions();

    this.pegs = [];
    this.rings = [];
    this.ropes = [];
    this.texCache = new Map();
    this._vPool = [];

    this.highlight = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 1.0, 40),
      new THREE.MeshBasicMaterial({ color: 0x5BA0FF, transparent: true, opacity: 0.42, side: THREE.DoubleSide })
    );
    this.highlight.rotation.x = -Math.PI / 2;
    this.highlight.position.y = 0.03;
    this.highlight.visible = false;
    this.scene.add(this.highlight);

    this.dragRing = null;
  }

  _applyTargetProportions() {
    const V = this.VIEW_W;
    // Peg diameter 0.055 W, rope 0.045 W, ring OD ~0.078 W (visible band)
    this.pegR = (0.055 * V) / 2;
    this.ropeR = (0.045 * V) / 2;
    // OD within ±20% of 0.07W; hole snug on peg; tube as thick as geometry allows
    const ringOD = 0.082 * V;
    const hole = 2 * this.pegR * 1.02;
    this.ringTube = (ringOD - hole) / 4;
    this.ringMajor = (ringOD + hole) / 4;
    // Clear rope layers + ~0.07W visible height at 15° tilt
    const stackClear = this.ropeR + 4 * (2 * this.ropeR) + 0.08;
    this.pegH = Math.max(0.205 * V, stackClear);
  }

  resize(cssW, cssH, dpr) {
    this.W = cssW; this.H = cssH;
    this.renderer.setPixelRatio(Math.min(dpr || 1, 2));
    this.renderer.setSize(cssW, cssH, false);
    const aspect = cssW / Math.max(1, cssH);
    // Orthographic sized by visible WIDTH = VIEW_W (stable screen fractions)
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
    // Board width as fraction of CSS width → same fraction of VIEW_W
    const frac = boardW / Math.max(1, this.W);
    this.worldSpan = this.VIEW_W * frac;
  }

  toWorld(px, py) {
    const nx = (px - this.ox) / this.boardW - 0.5;
    const nz = (py - this.oy) / this.boardH - 0.5;
    const zScale = 1.55;
    return { x: nx * this.worldSpan, z: nz * this.worldSpan * zScale };
  }

  _placeCamera() {
    const d = this._camDist;
    const t = this._camTilt;
    this.camera.position.set(0, d * Math.cos(t), d * Math.sin(t));
    this.camera.lookAt(0, 0.15, 0);
    this.camera.up.set(0, 1, 0);
  }

  _pegMat() {
    if (this._pegMatCached) return this._pegMatCached;
    // Vertical AO gradient texture on sides
    const sideC = document.createElement('canvas');
    sideC.width = 64; sideC.height = 128;
    const sctx = sideC.getContext('2d');
    const sg = sctx.createLinearGradient(0, 0, 0, 128);
    sg.addColorStop(0, '#E8F6FC');
    sg.addColorStop(0.3, '#B8DDF0');
    sg.addColorStop(0.7, '#8EC8E4');
    sg.addColorStop(1, '#6AADD4');
    sctx.fillStyle = sg;
    sctx.fillRect(0, 0, 64, 128);
    const sideTex = new THREE.CanvasTexture(sideC);
    sideTex.colorSpace = THREE.SRGBColorSpace;
    this._pegMatCached = new THREE.MeshPhysicalMaterial({
      map: sideTex,
      color: 0xffffff,
      roughness: 0.3,
      metalness: 0.0,
      clearcoat: 0.7,
      clearcoatRoughness: 0.18,
      emissive: new THREE.Color(0x8EC8E0),
      emissiveIntensity: 0.08,
    });
    return this._pegMatCached;
  }

  _pegTopMat() {
    if (this._pegTopMatCached) return this._pegTopMatCached;
    this._pegTopMatCached = new THREE.MeshPhysicalMaterial({
      color: 0xE6F4FB,
      roughness: 0.25,
      metalness: 0.0,
      clearcoat: 0.85,
      clearcoatRoughness: 0.12,
      emissive: new THREE.Color(0xE6F4FB),
      emissiveIntensity: 0.1,
    });
    return this._pegTopMatCached;
  }

  _ropeMat(color) {
    const key = color.hex;
    if (this.texCache.has(key)) return this.texCache.get(key);
    const canvas = makeBraidCanvas(color.hex, color.dark, color.light, 256);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    // uv.x along length, uv.y around — set per-frame from curve length
    tex.repeat.set(4, 1);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const base = new THREE.Color(color.hex);
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      color: 0xffffff, // let texture carry candy color
      roughness: 0.48,
      metalness: 0,
      emissive: 0x000000,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.texCache.set(key, mat);
    return mat;
  }

  _ringMat(color) {
    const key = 'ring|' + color.hex;
    if (this.texCache.has(key)) return this.texCache.get(key);
    const base = new THREE.Color(color.hex);
    const mat = new THREE.MeshPhysicalMaterial({
      color: base,
      roughness: 0.22,
      metalness: 0.08,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
      emissive: base.clone().multiplyScalar(0.08),
      emissiveIntensity: 1.0,
      sheen: 0.3,
      sheenColor: base.clone().lerp(new THREE.Color(0xffffff), 0.4),
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
        new THREE.CylinderGeometry(this.pegR, this.pegR * 1.04, this.pegH, 48),
        this._pegMat()
      );
      body.castShadow = true;
      body.receiveShadow = true;
      body.position.y = this.pegH * 0.5;
      // Bright top disc + rim
      const top = new THREE.Mesh(
        new THREE.CylinderGeometry(this.pegR * 1.01, this.pegR * 1.01, this.pegH * 0.05, 48),
        this._pegTopMat()
      );
      top.position.y = this.pegH - this.pegH * 0.03;
      top.castShadow = true;
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(this.pegR * 0.99, this.pegR * 0.045, 10, 48),
        this._pegTopMat()
      );
      rim.rotation.x = Math.PI / 2;
      rim.position.y = this.pegH * 0.02;
      body.renderOrder = 5;
      top.renderOrder = 6;
      rim.renderOrder = 6;
      group.add(body, top, rim);
      this.scene.add(group);
      this.pegs.push(group);
    }
    for (let i = 0; i < pegList.length; i++) {
      const w = this.toWorld(pegList[i].x, pegList[i].y);
      const m = this.pegs[i];
      m.position.set(w.x, 0, w.z);
      m.visible = true;
    }
  }

  /** Clean control points for TubeGeometry — no zigzags / doubling-back. */
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

    // Drop sharp reversals / spikes (self-overlap)
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
        // reject near-180° folds and very acute kinks
        if (dot < -0.25) continue;
        next.push(b);
      }
      next.push(pts[pts.length - 1]);
      pts = next;
    }

    // Arc-length resample to modest control count (keeps CatmullRom stable)
    const targetN = Math.max(6, Math.min(14, pts.length));
    pts = resample2D(pts, targetN);

    // Chaikin corner-cutting → flowing curves
    for (let i = 0; i < 4; i++) pts = chaikin(pts);

    // Lift to 3D with gentle mid-span sag
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const tt = i / (pts.length - 1);
      const y = baseY * scale + Math.sin(tt * Math.PI) * 0.05;
      out.push(new THREE.Vector3(pts[i].x, y, pts[i].z));
    }
    out[0].y = baseY * scale;
    out[out.length - 1].y = baseY * scale;
    return out;
  }

  syncRopes(ropeStates, endPositionsFn) {
    while (this.ropes.length > ropeStates.length) {
      const r = this.ropes.pop();
      this.scene.remove(r.mesh);
      r.geom.dispose();
    }
    while (this.rings.length > ropeStates.length * 2) {
      const m = this.rings.pop();
      this.scene.remove(m);
      m.geometry.dispose();
    }

    for (let i = 0; i < ropeStates.length; i++) {
      const rs = ropeStates[i];
      if (!this.ropes[i]) {
        const mat = this._ropeMat(rs.color).clone();
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(0, 0.2, 0),
          new THREE.Vector3(1, 0.2, 0),
        ]);
        const geom = new THREE.TubeGeometry(curve, TUBE_SEGMENTS, this.ropeR, RADIAL, false);
        const mesh = new THREE.Mesh(geom, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.scene.add(mesh);
        this.ropes[i] = { mesh, geom, mat, id: rs.id };
      }
      for (let e = 0; e < 2; e++) {
        const ri = i * 2 + e;
        if (!this.rings[ri]) {
          const geo = new THREE.TorusGeometry(this.ringMajor, this.ringTube, 14, 28);
          const mesh = new THREE.Mesh(geo, this._ringMat(rs.color).clone());
          mesh.userData.colorHex = rs.color.hex;
          mesh.rotation.x = Math.PI / 2;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          this.scene.add(mesh);
          this.rings[ri] = mesh;
        } else if (this.rings[ri].userData.colorHex !== rs.color.hex) {
          this.rings[ri].material = this._ringMat(rs.color).clone();
          this.rings[ri].userData.colorHex = rs.color.hex;
        }
      }
    }

    // Build 2D polylines first for crossing detection
    const built = [];
    for (let i = 0; i < ropeStates.length; i++) {
      const rs = ropeStates[i];
      const ends = endPositionsFn(rs.id);
      if (!ends || rs.clearing && rs.clearT > 0.55) {
        built.push(null);
        continue;
      }
      const layer = Math.min(3, (rs.z || i) % 4);
      const baseY = this.ropeR + layer * (2.4 * this.ropeR);
      const srcPts = (rs._wrapPath && rs._wrapPath.length >= 2) ? rs._wrapPath : rs.points;
      if (!srcPts || srcPts.length < 2) { built.push(null); continue; }
      const worldPts = this._smoothWorldPts(srcPts, ends, baseY, 1);
      built.push({ rs, ends, layer, baseY, worldPts });
    }

    // Detect crossings: for each pair, find XZ segment intersections; lift higher layer
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
            // Smooth lift over ~1.2 rope diameters along the higher rope
            const liftAmt = 2 * this.ropeR * 1.6;
            const influence = this.ropeR * 4.0;
            for (let k = 0; k < A.length; k++) {
              const d = Math.hypot(A[k].x - hit.x, A[k].z - hit.z);
              if (d < influence) {
                const w = 0.5 * (1 + Math.cos(Math.PI * d / influence));
                lifts[hi][k] = Math.max(lifts[hi][k], liftAmt * w);
              }
            }
          }
        }
      }
    }

    for (let i = 0; i < ropeStates.length; i++) {
      const rs = ropeStates[i];
      const entry = this.ropes[i];
      if (rs.clearing && rs.clearT > 0.55) {
        entry.mesh.visible = false;
        this.rings[i * 2].visible = false;
        this.rings[i * 2 + 1].visible = false;
        continue;
      }
      entry.mesh.visible = true;
      const b = built[i];
      if (!b || b.worldPts.length < 2) continue;

      let scale = 1;
      if (rs.clearing) {
        const tt = Math.min(1, rs.clearT / 0.5);
        scale = 1 - tt * 0.7;
        entry.mesh.material.opacity = 1 - tt;
        entry.mesh.material.transparent = true;
      } else {
        entry.mesh.material.transparent = false;
        entry.mesh.material.opacity = 1;
      }

      // Apply crossing lifts
      const pts = b.worldPts.map((p, k) => {
        const y = (b.baseY + (lifts[i] ? lifts[i][k] : 0)) * scale;
        return new THREE.Vector3(p.x, y, p.z);
      });

      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
      const radius = this.ropeR * scale;
      const segs = Math.min(96, Math.max(TUBE_SEGMENTS, Math.round(curve.getLength() / (this.ropeR * 0.35))));
      const newGeom = new THREE.TubeGeometry(curve, segs, radius, RADIAL, false);
      entry.mesh.geometry.dispose();
      entry.mesh.geometry = newGeom;
      entry.geom = newGeom;
      entry.mesh.renderOrder = b.layer;
      entry.mesh.material.polygonOffset = true;
      entry.mesh.material.polygonOffsetFactor = -1 - b.layer;
      entry.mesh.material.polygonOffsetUnits = -1 - b.layer;

      // UV: groove every ~0.6 rope diameters along length; 1 wrap around
      try {
        const len = curve.getLength();
        const period = 0.6 * (2 * this.ropeR); // 0.6 diameters
        const uRepeat = Math.max(2, len / period);
        if (entry.mesh.material.map) {
          entry.mesh.material.map.repeat.set(uRepeat, 1);
          entry.mesh.material.map.needsUpdate = true;
        }
      } catch (_) {}

      for (let e = 0; e < 2; e++) {
        const mesh = this.rings[i * 2 + e];
        const ep = b.ends[e];
        mesh.visible = true;
        mesh.renderOrder = 10; // above ropes, with pegs
        if (rs.clearing && rs.clearT > 0.15) {
          mesh.material.transparent = true;
          mesh.material.opacity = Math.max(0, 1 - rs.clearT / 0.45);
        } else {
          mesh.material.transparent = false;
          mesh.material.opacity = 1;
        }
        const w = this.toWorld(ep.x, ep.y);
        const lift = (ep.stackIndex >= 0 ? ep.stackIndex : 0) * (this.ringTube * 1.6);
        // Flat torus at peg base — colored band visible around peg
        mesh.position.set(w.x, this.ringTube * 1.25 + lift + 0.02, w.z);
        mesh.material.depthWrite = true;
        mesh.renderOrder = 8;
        mesh.scale.set(1.12, 1.15, 1.12); // visible colored band around peg
        if (ep.squash && ep.squash !== 1) {
          mesh.scale.y = ep.squash;
        }
      }
    }
  }

  setHighlight(pegOrNull, colorHex) {
    if (!pegOrNull) { this.highlight.visible = false; return; }
    const w = this.toWorld(pegOrNull.x, pegOrNull.y);
    this.highlight.visible = true;
    this.highlight.position.set(w.x, 0.035, w.z);
    if (colorHex) this.highlight.material.color.set(colorHex);
    const s = (this.pegR + 0.28) / 0.65;
    this.highlight.scale.set(s, s, s);
  }

  setDragRing(posOrNull, color) {
    if (!posOrNull) {
      if (this.dragRing) this.dragRing.visible = false;
      return;
    }
    if (!this.dragRing) {
      this.dragRing = new THREE.Mesh(
        new THREE.TorusGeometry(this.ringMajor, this.ringTube, 14, 28),
        this._ringMat(color).clone()
      );
      this.dragRing.rotation.x = Math.PI / 2;
      this.dragRing.castShadow = true;
      this.scene.add(this.dragRing);
    }
    this.dragRing.material = this._ringMat(color).clone();
    this.dragRing.visible = true;
    const w = this.toWorld(posOrNull.x, posOrNull.y);
    this.dragRing.position.set(w.x, this.ringTube + 0.4, w.z);
    this.dragRing.scale.set(1.06, 1.06, 1.06);
  }

  /** World → CSS pixel (for measurement / picking) */
  projectWorld(x, y, z) {
    const v = new THREE.Vector3(x, y, z);
    v.project(this.camera);
    return {
      x: (v.x * 0.5 + 0.5) * this.W,
      y: (-v.y * 0.5 + 0.5) * this.H,
    };
  }

  measureScreenFractions(pegList) {
    const W = this.W;
    if (!pegList.length || !this.pegs.length) return null;
    // Peg diameter from left/right of first peg at mid height
    const p0 = pegList[0];
    const w0 = this.toWorld(p0.x, p0.y);
    const left = this.projectWorld(w0.x - this.pegR, this.pegH * 0.5, w0.z);
    const right = this.projectWorld(w0.x + this.pegR, this.pegH * 0.5, w0.z);
    const pegD = Math.abs(right.x - left.x) / W;
    const top = this.projectWorld(w0.x, this.pegH, w0.z);
    const bot = this.projectWorld(w0.x, 0, w0.z);
    const pegHvis = Math.abs(bot.y - top.y) / W;
    // Spacing: average nearest-neighbor in screen XZ→pixels
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
    // Cluster bbox
    let minX=1e9,maxX=-1e9,minY=1e9,maxY=-1e9;
    for (const s of scr) {
      minX=Math.min(minX,s.x); maxX=Math.max(maxX,s.x);
      minY=Math.min(minY,s.y); maxY=Math.max(maxY,s.y);
    }
    const clusterW = (maxX - minX) / W;
    const clusterH = (maxY - minY) / W; // in units of W (not H)
    const ropeD = (2 * this.ropeR) / this.VIEW_W; // exact by construction under ortho width
    const ringOD = (2 * (this.ringMajor + this.ringTube)) / this.VIEW_W;
    return {
      pegD, pegHvis, spacing, clusterW, clusterH, ropeD, ringOD,
      targets: { pegD:0.055, pegHvis:0.07, spacing:[0.16,0.19], clusterW:0.6, clusterH:0.7, ropeD:0.045, ringOD:0.07 },
      pegH_world: this.pegH, ropeR: this.ropeR, pegR: this.pegR,
    };
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
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
    out.push({
      x: a.x * 0.75 + b.x * 0.25,
      z: a.z * 0.75 + b.z * 0.25,
    });
    out.push({
      x: a.x * 0.25 + b.x * 0.75,
      z: a.z * 0.25 + b.z * 0.75,
    });
  }
  out.push(pts[pts.length - 1]);
  return out;
}
