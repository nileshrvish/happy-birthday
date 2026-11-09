import * as THREE from 'three';
import { composeMatrix, glowTexture } from '../components/Assets.js';
import {
  islands, islandById, bridges, bridgeDeck, paths, pathDist, lakes, streams, islandHeight, islandRadius,
  buildIslandTop, obstacles, pads, groundAt, resolveObstacles, layout, toWorld,
} from '../environments/Terrain.js';
import { createSky, moods } from '../environments/Sky.js';
import { makeWater, makeWaterfall } from '../environments/Water.js';
import { FallingPetals, glowPoints, Butterflies, SkyLanterns, Burst } from '../environments/Effects.js';

const rad = THREE.MathUtils.degToRad;
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// collision shapes in asset-local game coords: ['c', x, z, r] or ['b', x, z, hx, hz]
const COLLIDERS = {
  tree_cherry: [['c', 0.1, 0, 0.55]], tree_cherry_small: [['c', 0, 0, 0.4]], tree_cherry_hero: [['c', 0.3, 0, 1.6]], tree_green: [['c', 0, 0, 0.45]],
  rock_a: [['c', 0, 0, 0.85]], rock_b: [['c', 0, 0, 1.1]], rock_flat: [['c', 0, 0, 1.15]], rock_tall: [['c', 0, 0, 0.7], ['c', 0.6, -0.3, 0.5]],
  torii: [['c', -1.6, 0, 0.3], ['c', 1.6, 0, 0.3]], lantern_stone: [['c', 0, 0, 0.42]], lantern_wood: [['c', 0, 0, 0.25]], lamp_post: [['c', 0, 0, 0.2]],
  bench: [['b', 0, 0, 0.9, 0.3]], chair: [['b', 0, 0, 0.28, 0.28]], flower_pot: [['c', 0, 0, 0.38]], signboard: [['c', -0.85, 0, 0.15], ['c', 0.85, 0, 0.15]],
  phone_booth: [['b', 0, 0, 0.72, 0.72]], diary: [['c', 0, 0, 0.42]], memory_stone: [['c', 0, 0, 0.6]], cake: [['c', 0, 0, 0.75]], gift: [['b', 0, 0, 0.32, 0.32]],
  house_a: [['b', 0, 0, 2.3, 2.1]], house_b: [['b', 0, 0, 2.3, 2.1]], house_c: [['b', 0, 0, 2.3, 2.1]], chhatri: [['b', 0, 0, 1.6, 1.6]],
  bush_green: [['c', 0, 0, 0.6]], bush_pink: [['c', 0, 0, 0.6]], bush_white: [['c', 0, 0, 0.6]],
};
const WIND = { tree_cherry: [0.22, 6], tree_cherry_small: [0.18, 4], tree_cherry_hero: [0.35, 14], tree_green: [0.2, 5], bush_green: [0.05, 1.2], bush_pink: [0.05, 1.2], bush_white: [0.05, 1.2] };
const SIGN_TEXT = { welcome: 'Welcome, Pooja' };

export class World {
  constructor(scene, assets, quality) {
    this.scene = scene;
    this.assets = assets;
    this.q = quality; // { density, shadows }
    this.matrices = {}; // assetName -> Matrix4[]
    this.waterfalls = [];
    this.groundAt = groundAt;
    this.resolve = resolveObstacles;
    this.root = new THREE.Group();
    scene.add(this.root);
  }

  place(name, m) { (this.matrices[name] ||= []).push(m); }

  addColliders(name, x, y, z, rot, s) {
    const c = Math.cos(rot), sn = Math.sin(rot);
    for (const sh of COLLIDERS[name] || []) {
      const lx = sh[1] * s, lz = sh[2] * s;
      const wx = x + lx * c + lz * sn, wz = z - lx * sn + lz * c;
      if (sh[0] === 'c') obstacles.push({ x: wx, z: wz, r: sh[3] * s });
      else obstacles.push({ x: wx, z: wz, hx: sh[3] * s, hz: sh[4] * s, rot });
    }
    const tw = (lx, lz) => ({ x: x + lx * c + lz * sn, z: z - lx * sn + lz * c });
    if (name === 'pavilion') {
      for (const [px, pz] of [[-2.9, -2.9], [2.9, -2.9], [-2.9, 2.9], [2.9, 2.9], [-2.9, 0], [2.9, 0], [0, -2.9], [0, 2.9]]) obstacles.push({ ...tw(px, pz), r: 0.25 });
      obstacles.push({ ...tw(-2.9, 0), hx: 0.1, hz: 2.9, rot }, { ...tw(2.9, 0), hx: 0.1, hz: 2.9, rot }, { ...tw(0, -2.9), hx: 2.9, hz: 0.1, rot });
      pads.push({ ...tw(0, 0), hx: 3.7, hz: 3.7, rot, y: y + 0.72 }, { ...tw(0, 4.1), hx: 1.3, hz: 0.45, rot, y: y + 0.38 });
    }
    if (name === 'gazebo') {
      const P = [];
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; P.push([Math.cos(a) * 3.3, -Math.sin(a) * 3.3]); }
      P.forEach((p) => obstacles.push({ ...tw(p[0], p[1]), r: 0.22 }));
      for (const i of [1, 3, 5]) {
        const a = P[i], b = P[(i + 1) % 6];
        const ex = b[0] - a[0], ez = b[1] - a[1];
        obstacles.push({ ...tw((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), hx: 1.6, hz: 0.1, rot: Math.atan2(-ez, ex) + rot });
      }
      pads.push({ ...tw(0, 0), r: 3.95, y: y + 0.48 });
    }
  }

  build() {
    this.buildSkyAndLights();
    this.buildIslands();
    this.buildBridges();
    this.buildProps();
    this.buildPaths();
    this.buildVegetation();
    this.buildWater();
    this.buildFinalePlatform();
    // flush instancing
    for (const [name, mats] of Object.entries(this.matrices)) {
      const w = WIND[name] || (['grass'].includes(name) ? [0.09, 0.45] : name.startsWith('flower') || name === 'lavender' ? [0.05, 0.4] : null);
      const big = /tree|house|pavilion|gazebo|torii|chhatri|rock|booth|lantern|lamp/.test(name);
      this.root.add(this.assets.instanced(name, mats, { wind: w?.[0], windHeight: w?.[1], shadow: big }));
    }
    this.buildEffects();
  }

  // ------------------------------------------------------------ sky / lights
  buildSkyAndLights() {
    const sky = createSky();
    this.sky = sky;
    this.scene.add(sky.mesh);
    this.scene.fog = new THREE.Fog('#f4b4c8', 45, 230);
    this.hemi = new THREE.HemisphereLight('#ffe0ef', '#6c5b8a', 1.1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#ffd6aa', 2.4);
    this.sun.castShadow = this.q.shadows;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -28; sc.right = sc.top = 28; sc.near = 1; sc.far = 140;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);
    this.sunDir = new THREE.Vector3(-0.55, 0.62, -0.55).normalize();
    sky.uniforms.sunDir.value.set(0.35, 0.12, -1).normalize();
    this._mood = {};
    for (const k of ['top', 'mid', 'hor', 'fog', 'sun', 'hemiS', 'hemiG']) this._mood[k] = new THREE.Color();
    this._tmp = new THREE.Color();
  }

  applyMood(x, z) {
    const ws = islands.map((i) => 1 / Math.pow(Math.max(0, Math.hypot(x - i.cx, z - i.cz) - i.r) + 4, 3));
    const sum = ws.reduce((a, b) => a + b, 0);
    const M = this._mood;
    for (const k in M) M[k].setRGB(0, 0, 0);
    let sunI = 0, hemiI = 0, stars = 0;
    islands.forEach((isl, idx) => {
      const w = ws[idx] / sum, md = moods[isl.id];
      for (const k in M) M[k].add(this._tmp.set(md[k]).multiplyScalar(w));
      sunI += md.sunI * w; hemiI += md.hemiI * w; stars += md.stars * w;
    });
    const u = this.sky.uniforms;
    u.top.value.copy(M.top); u.mid.value.copy(M.mid); u.hor.value.copy(M.hor); u.stars.value = stars;
    u.sunCol.value.copy(M.sun);
    this.scene.fog.color.copy(M.fog);
    this.sun.color.copy(M.sun); this.sun.intensity = sunI * (this.boostLight || 1);
    this.hemi.color.copy(M.hemiS); this.hemi.groundColor.copy(M.hemiG); this.hemi.intensity = hemiI;
    this.night = stars;
    return stars;
  }

  // ------------------------------------------------------------ terrain
  buildIslands() {
    const r = rng(99);
    for (const isl of islands) {
      this.root.add(buildIslandTop(isl, isl.r > 15 ? 28 : 16, isl.r > 15 ? 80 : 48));
      const base = this.assets.clone('island_base');
      base.scale.set(isl.r * 1.02, isl.r * 0.95, isl.r * 1.02);
      base.position.set(isl.cx, isl.h - 0.3, isl.cz);
      base.rotation.y = isl.seed;
      base.traverse((o) => (o.castShadow = false));
      this.root.add(base);
      // floating rock debris
      for (let k = 0; k < Math.round(isl.r / 3); k++) {
        const a = r() * Math.PI * 2, d = isl.r * (1.15 + r() * 0.5);
        this.place('rock_a', composeMatrix(isl.cx + Math.cos(a) * d, isl.h - 3 - r() * 10, isl.cz + Math.sin(a) * d, r() * 6, 0.6 + r() * 1.4));
      }
    }
  }

  buildBridges() {
    for (const b of bridges) {
      const piece = b.type === 'stone' ? 'bridge_stone' : 'bridge_plank';
      const yaw = Math.atan2(b.dir.x, b.dir.y);
      const n = Math.ceil(b.L / 0.5);
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const x = b.p0.x + b.dir.x * b.L * t, z = b.p0.y + b.dir.y * b.L * t;
        const y = bridgeDeck(b, t);
        // plank lies along local X; local Z follows the bridge so the plank spans its width
        const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(b.width, 1, 1.25));
        this.place(piece, m);
      }
      // posts + rails
      const postStep = b.type === 'grand' ? 2.5 : 2.0;
      const np = Math.ceil(b.L / postStep);
      for (const side of [-1, 1]) {
        let prev = null;
        for (let k = 0; k <= np; k++) {
          const t = k / np;
          const x = b.p0.x + b.dir.x * b.L * t + b.perp.x * side * (b.width / 2 - 0.1);
          const z = b.p0.y + b.dir.y * b.L * t + b.perp.y * side * (b.width / 2 - 0.1);
          const y = bridgeDeck(b, t);
          this.place('bridge_post', composeMatrix(x, y, z, 0, 1));
          if (b.type === 'grand' && k % 2 === 0 && k > 0 && k < np) this.place('lantern_wood', composeMatrix(x, y, z, yaw, 0.55));
          const cur = new THREE.Vector3(x, y + 0.85, z);
          if (prev) {
            for (const hh of [0, -0.4]) {
              const mid = prev.clone().add(cur).multiplyScalar(0.5); mid.y += hh;
              const d = cur.clone().sub(prev);
              const len = d.length();
              const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), d.normalize());
              this.place('bridge_rail', new THREE.Matrix4().compose(mid, q, new THREE.Vector3(len, 1, 1)));
            }
          }
          prev = cur;
        }
      }
      // bunting on grand bridges
      if (b.type === 'grand') {
        const nf = Math.floor(b.L / 0.9);
        for (let k = 1; k < nf; k++) {
          const t = k / nf;
          const sag = Math.sin(((t * b.L) % 5) / 5 * Math.PI) * 0.5;
          for (const side of [-1, 1]) {
            const x = b.p0.x + b.dir.x * b.L * t + b.perp.x * side * (b.width / 2 - 0.1);
            const z = b.p0.y + b.dir.y * b.L * t + b.perp.y * side * (b.width / 2 - 0.1);
            this.place('bunting_flag', composeMatrix(x, bridgeDeck(b, t) + 1.15 - sag * 0.4, z, Math.atan2(b.dir.x, b.dir.y) + Math.PI / 2, 0.8));
          }
        }
      }
    }
  }

  // ------------------------------------------------------------ props
  buildProps() {
    this.propsByIsland = {};
    for (const [islandId, list] of Object.entries(layout.props)) {
      const isl = islandById[islandId];
      for (const [name, dx, dz, rotDeg, s] of list) {
        const x = isl.cx + dx, z = isl.cz + dz;
        const y = islandHeight(isl, x, z) ?? isl.h;
        const rot = rad(rotDeg);
        this.place(name, composeMatrix(x, y, z, rot, s));
        this.addColliders(name, x, y, z, rot, s);
        if (name === 'signboard' && SIGN_TEXT[islandId]) this.addSignText(SIGN_TEXT[islandId], x, y, z, rot);
        (this.propsByIsland[islandId] ||= []).push({ name, x, y, z, rot, s });
      }
    }
  }

  addSignText(text, x, y, z, rot) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 200;
    const g = c.getContext('2d');
    g.fillStyle = '#f7e2c4'; g.fillRect(0, 0, 512, 200);
    g.strokeStyle = '#8b5e3c'; g.lineWidth = 10; g.strokeRect(8, 8, 496, 184);
    g.fillStyle = '#7a3a4a';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    let size = 76; // shrink until the text fits inside the frame
    do { g.font = `bold ${size}px Georgia, 'Times New Roman', serif`; size -= 2; } while (g.measureText(text).width > 440 && size > 20);
    g.fillText(text, 256, 104);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.95, 0.76), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.35 }));
    const o = new THREE.Object3D();
    o.position.set(x, y, z); o.rotation.y = rot;
    p.position.set(0, 2.0, 0.065);
    o.add(p);
    this.root.add(o);
  }

  buildPaths() {
    const r = rng(5);
    for (const p of paths) {
      const isl = islandById[p.island];
      const L = Math.hypot(p.bx - p.ax, p.bz - p.az);
      const n = Math.floor(L / 0.8);
      const nx = -(p.bz - p.az) / L, nz = (p.bx - p.ax) / L;
      for (let k = 2; k <= n; k++) {
        const t = k / n;
        for (let j = 0; j < 2; j++) {
          const off = (j === 0 ? -0.55 : 0.55) + (r() - 0.5) * 0.4;
          const x = p.ax + (p.bx - p.ax) * t + nx * off, z = p.az + (p.bz - p.az) * t + nz * off;
          const y = islandHeight(isl, x, z);
          if (y === null) continue;
          this.place('stone_tile_' + Math.floor(r() * 3), composeMatrix(x, y - 0.05, z, r() * 6, 1.1 + r() * 0.5, 0.6));
        }
      }
    }
  }

  // ------------------------------------------------------------ vegetation scatter
  free(x, z, margin) {
    if (pathDist(x, z) < 1.6) return false;
    for (const l of lakes) if (Math.hypot(x - l.x, z - l.z) < l.r + 0.9) return false;
    for (const s of streams) { if (Math.abs((x - s.ax) * (s.bz - s.az) - (z - s.az) * (s.bx - s.ax)) / Math.hypot(s.bx - s.ax, s.bz - s.az) < 1.6 && x > s.ax - 1) return false; }
    for (const o of obstacles) {
      const r = o.r || Math.max(o.hx, o.hz) * 1.2;
      if (Math.hypot(x - o.x, z - o.z) < r + margin) return false;
    }
    for (const p of pads) if (Math.hypot(x - p.x, z - p.z) < (p.r || Math.max(p.hx, p.hz) * 1.3) + 0.3) return false;
    for (const pt of layout.petals) { const w = toWorld(pt.island, ...pt.at); if (Math.hypot(x - w.x, z - w.z) < 1.8) return false; }
    if (this.finaleCenter && Math.hypot(x - this.finaleCenter.x, z - this.finaleCenter.z) < 5.6) return false;
    return true;
  }

  randomPoint(isl, r, kMax = 0.9) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * islandRadius(isl, a) * kMax;
    return { x: isl.cx + Math.cos(a) * d, z: isl.cz + Math.sin(a) * d };
  }

  buildVegetation() {
    const dens = this.q.density;
    const palette = {
      welcome: ['flower_pink', 'flower_white', 'flower_yellow', 'flower_pink'],
      mau: ['flower_yellow', 'flower_pink', 'flower_yellow', 'flower_white'],
      garden: ['flower_pink', 'flower_white', 'flower_blue', 'lavender'],
      distA: ['flower_white', 'flower_blue', 'lavender'], distB: ['flower_white', 'flower_blue', 'lavender'],
      kingdom: ['flower_pink', 'flower_yellow', 'lavender', 'flower_pink', 'flower_white'],
    };
    const kc = islandById.kingdom;
    this.finaleCenter = { x: kc.cx, z: kc.cz };
    for (const isl of islands) {
      const r = rng(isl.seed * 77);
      const area = Math.PI * isl.r * isl.r;
      const nGrass = Math.round(area * 0.32 * dens);
      for (let i = 0; i < nGrass; i++) {
        const p = this.randomPoint(isl, r, 0.93);
        if (!this.free(p.x, p.z, 0.2)) continue;
        this.place('grass', composeMatrix(p.x, islandHeight(isl, p.x, p.z) - 0.03, p.z, r() * 6, 0.8 + r() * 0.9));
      }
      const nBeds = Math.round(area / 45 * (0.5 + dens * 0.5));
      for (let b = 0; b < nBeds; b++) {
        const c = this.randomPoint(isl, r, 0.85);
        const kind = palette[isl.id][Math.floor(r() * palette[isl.id].length)];
        const cnt = Math.round((5 + r() * 9) * (0.5 + dens * 0.5));
        for (let i = 0; i < cnt; i++) {
          const x = c.x + (r() - 0.5) * 3.2, z = c.z + (r() - 0.5) * 3.2;
          const y = islandHeight(isl, x, z);
          if (y === null || !this.free(x, z, 0.25)) continue;
          this.place(kind, composeMatrix(x, y - 0.02, z, r() * 6, 0.9 + r() * 0.6));
        }
      }
      // extra bushes near the rim
      for (let i = 0; i < Math.round(isl.r / 3); i++) {
        const p = this.randomPoint(isl, r, 0.88);
        if (Math.hypot(p.x - isl.cx, p.z - isl.cz) < isl.r * 0.55 || !this.free(p.x, p.z, 0.8)) continue;
        this.place(r() < 0.6 ? 'bush_pink' : r() < 0.5 ? 'bush_white' : 'bush_green', composeMatrix(p.x, islandHeight(isl, p.x, p.z), p.z, r() * 6, 0.7 + r() * 0.5));
      }
    }
    // dense flower ring around the finale platform
    const r = rng(4242);
    for (let i = 0; i < 260 * dens + 60; i++) {
      const a = r() * Math.PI * 2, d = 5.8 + r() * 2.2;
      const x = kc.cx + Math.cos(a) * d, z = kc.cz + Math.sin(a) * d;
      if (pathDist(x, z) < 1.4) continue;
      const kinds = ['flower_pink', 'flower_pink', 'flower_white', 'flower_yellow', 'lavender'];
      this.place(kinds[Math.floor(r() * kinds.length)], composeMatrix(x, islandHeight(kc, x, z), z, r() * 6, 1 + r() * 0.5));
    }
  }

  buildFinalePlatform() {
    const kc = islandById.kingdom;
    const y = islandHeight(kc, kc.cx, kc.cz);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(5.3, 5.5, 0.3, 48), new THREE.MeshStandardMaterial({ color: '#d9d2e6', roughness: 0.9 }));
    ring.position.set(kc.cx, y + 0.02, kc.cz);
    ring.receiveShadow = true;
    const inner = new THREE.Mesh(new THREE.CircleGeometry(4.8, 48), new THREE.MeshStandardMaterial({ color: '#ffd6ea', roughness: 0.8, emissive: '#ff8fc7', emissiveIntensity: 0.12 }));
    inner.rotation.x = -Math.PI / 2;
    inner.position.set(kc.cx, y + 0.18, kc.cz);
    inner.receiveShadow = true;
    // flower mandala pattern
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const g = c.getContext('2d');
    g.fillStyle = '#ffd6ea'; g.fillRect(0, 0, 512, 512);
    g.translate(256, 256);
    for (let ringI = 0; ringI < 3; ringI++) {
      const n = 5 * (ringI + 1), rr = 60 + ringI * 70;
      for (let i = 0; i < n; i++) {
        g.save(); g.rotate((i / n) * Math.PI * 2);
        g.fillStyle = ['#ff8fc7', '#ffb3d9', '#f7c6ff'][ringI];
        g.beginPath(); g.ellipse(0, -rr, 18 + ringI * 4, 40, 0, 0, Math.PI * 2); g.fill(); g.restore();
      }
    }
    g.fillStyle = '#ffd447'; g.beginPath(); g.arc(0, 0, 30, 0, Math.PI * 2); g.fill();
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    inner.material.map = tex;
    this.root.add(ring, inner);
    pads.push({ x: kc.cx, z: kc.cz, r: 5.4, y: y + 0.18 });
    this.finaleY = y + 0.18;
  }

  // ------------------------------------------------------------ water
  buildWater() {
    for (const l of lakes) {
      const isl = islandById[l.island];
      const m = new THREE.Mesh(new THREE.CircleGeometry(l.r + 0.9, 40), makeWater({ deep: '#3d7fd0', shallow: '#9fe8ff', opacity: 0.85 }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(l.x, isl.h - 0.38, l.z);
      this.root.add(m);
      const r = rng(l.r * 10);
      for (let i = 0; i < (l.island === 'garden' ? 9 : 5); i++) {
        const a = r() * Math.PI * 2, d = r() * (l.r - 0.6);
        this.place('lily_pad', composeMatrix(l.x + Math.cos(a) * d, isl.h - 0.36, l.z + Math.sin(a) * d, r() * 6, 0.8 + r() * 0.6));
      }
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + r();
        this.place('water_rock', composeMatrix(l.x + Math.cos(a) * (l.r + 0.7), isl.h - 0.45, l.z + Math.sin(a) * (l.r + 0.7), r() * 6, 0.9 + r() * 0.6));
      }
    }
    // stream + edge waterfall on Welcome Island
    const w = islandById.welcome;
    for (const s of streams) {
      const L = Math.hypot(s.bx - s.ax, s.bz - s.az);
      const g = new THREE.PlaneGeometry(L, s.w * 1.3);
      const m = new THREE.Mesh(g, makeWater({ deep: '#4a90de', shallow: '#bff2ff', opacity: 0.85, flow: [-1.2, 0] }));
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = -Math.atan2(s.bz - s.az, s.bx - s.ax);
      m.position.set((s.ax + s.bx) / 2, w.h - 0.3, (s.az + s.bz) / 2);
      this.root.add(m);
      const ang = Math.atan2(s.bz - w.cz, s.bx - w.cx);
      const R = islandRadius(w, ang) - 0.2;
      const ex = w.cx + Math.cos(ang) * R, ez = w.cz + Math.sin(ang) * R;
      const fall = makeWaterfall(1.9, 38);
      fall.position.set(ex, w.h - 0.3, ez);
      fall.rotation.y = Math.atan2(Math.cos(ang), Math.sin(ang));
      this.root.add(fall);
      this.waterfalls.push(new THREE.Vector3(ex, w.h, ez));
      const mist = [];
      for (let i = 0; i < 40; i++) mist.push(ex + (Math.random() - 0.5) * 2, w.h - 0.5 - Math.random() * 6, ez + (Math.random() - 0.5) * 2);
      this.root.add(glowPoints(mist, { color: '#dff6ff', size: 0.9, drift: 0.5, opacity: 0.35 }));
    }
    // garden waterfall from the tall rock into the lake
    const gIsl = islandById.garden;
    const gl = lakes.find((l) => l.island === 'garden');
    const top = toWorld('garden', 14.6, 11.8);
    const fall = makeWaterfall(1.5, 4.1);
    fall.position.set(top.x, gIsl.h + 3.7, top.z);
    fall.rotation.y = Math.atan2(gl.x - top.x, gl.z - top.z);
    this.root.add(fall);
    this.waterfalls.push(new THREE.Vector3(top.x, gIsl.h, top.z));
    const foam = [];
    for (let i = 0; i < 30; i++) foam.push(top.x + (gl.x - top.x) * 0.25 + (Math.random() - 0.5) * 1.6, gIsl.h - 0.2 + Math.random() * 0.6, top.z + (gl.z - top.z) * 0.25 + (Math.random() - 0.5) * 1.6);
    this.root.add(glowPoints(foam, { color: '#ffffff', size: 0.7, drift: 0.25, opacity: 0.5 }));
    // ocean far below + clouds
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), makeWater({ deep: '#2b3f8c', shallow: '#6fa7e6', scale: 0.12, opacity: 1 }));
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.set(20, -70, -115);
    this.root.add(ocean);
    const r = rng(31);
    this.clouds = [];
    const cloudM = [];
    for (let i = 0; i < 46; i++) {
      const x = -90 + r() * 220, z = 60 - r() * 360, y = -12 - r() * 40;
      if (islands.some((isl) => Math.hypot(x - isl.cx, z - isl.cz) < isl.r + 6) && y > -25) continue;
      cloudM.push(composeMatrix(x, y, z, r() * 6, 2.5 + r() * 4, 1.6 + r() * 2));
    }
    const clouds = this.assets.instanced('cloud', cloudM, { shadow: false });
    clouds.traverse((o) => { if (o.material) { o.material = o.material.clone(); o.material.emissive = new THREE.Color('#ffe6f2'); o.material.emissiveIntensity = 0.35; o.material.transparent = true; o.material.opacity = 0.92; } });
    this.cloudGroup = clouds;
    this.root.add(clouds);
  }

  // ------------------------------------------------------------ effects
  buildEffects() {
    const petalParts = this.assets.parts('petal');
    this.fallingPetals = new FallingPetals(petalParts[0].geometry, Math.round(110 + 160 * this.q.density));
    this.scene.add(this.fallingPetals.mesh);
    const ff = [];
    const add = (id, n, spread = 0.9, h = 3) => {
      const isl = islandById[id];
      const r = rng(isl.seed * 3);
      for (let i = 0; i < n; i++) { const p = this.randomPoint(isl, r, spread); ff.push(p.x, isl.h + 0.6 + r() * h, p.z); }
    };
    add('garden', 70); add('kingdom', 140, 0.95, 5); add('distA', 40); add('distB', 40); add('mau', 30);
    for (const b of bridges.filter((b) => b.type === 'grand')) for (let i = 0; i < 50; i++) {
      const t = Math.random();
      ff.push(b.p0.x + b.dir.x * b.L * t + (Math.random() - 0.5) * 12, bridgeDeck(b, t) + Math.random() * 5 - 1, b.p0.y + b.dir.y * b.L * t + (Math.random() - 0.5) * 12);
    }
    this.fireflies = glowPoints(ff, { color: '#fff0a0', size: 0.32, drift: 0.8, speed: 0.7 });
    this.scene.add(this.fireflies);
    const dust = [];
    for (const id of ['garden', 'kingdom', 'welcome']) {
      const isl = islandById[id]; const r = rng(isl.seed * 9);
      for (let i = 0; i < 60; i++) { const p = this.randomPoint(isl, r, 0.95); dust.push(p.x, isl.h + 1 + r() * 7, p.z); }
    }
    this.scene.add(glowPoints(dust, { color: '#ffb3e0', size: 0.25, drift: 1.4, speed: 0.4 }));
    const bcs = [];
    for (const [id, n] of [['garden', 8], ['welcome', 4], ['kingdom', 6], ['mau', 2]]) {
      const isl = islandById[id]; const r = rng(isl.seed * 5);
      for (let i = 0; i < n; i++) { const p = this.randomPoint(isl, r, 0.7); bcs.push(new THREE.Vector3(p.x, isl.h, p.z)); }
    }
    this.butterflies = new Butterflies(bcs);
    this.scene.add(this.butterflies.group);
    const kc = islandById.kingdom;
    this.lanterns = new SkyLanterns(this.assets.parts('sky_lantern'), new THREE.Vector3(kc.cx, kc.h, kc.cz), Math.round(24 + 30 * this.q.density), 26);
    this.scene.add(this.lanterns.group);
    this.burst = new Burst(this.scene);
  }

  areaAt(x, z) {
    for (const isl of islands) if (Math.hypot(x - isl.cx, z - isl.cz) < islandRadius(isl, Math.atan2(z - isl.cz, x - isl.cx)) - 1.5) return isl;
    return null;
  }

  update(dt, t, focus) {
    this.sky.uniforms.time.value = t;
    this.sky.mesh.position.copy(focus);
    const night = this.applyMood(focus.x, focus.z);
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 60);
    this.sun.target.position.copy(focus);
    this.fallingPetals.update(dt, focus, t);
    this.fireflies.material.uniforms.opacity.value = 0.35 + night * 0.65;
    this.butterflies.update(t);
    this.lanterns.update(dt, t);
    this.burst.update(dt);
    if (this.cloudGroup) this.cloudGroup.position.x = Math.sin(t * 0.02) * 8;
    let wf = 0;
    for (const p of this.waterfalls) wf = Math.max(wf, 1 - Math.min(1, focus.distanceTo(p) / 22));
    return { night, waterfall: wf };
  }
}
