import * as THREE from 'three';
import layout from './layout.json';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export const islands = layout.islands.map((i) => ({ ...i, cx: i.c[0], cz: i.c[1] }));
export const islandById = Object.fromEntries(islands.map((i) => [i.id, i]));

/** island-local -> world */
export const toWorld = (islandId, dx, dz) => { const i = islandById[islandId]; return { x: i.cx + dx, z: i.cz + dz }; };

// water features carved into the terrain (world coords)
export const lakes = [
  { island: 'welcome', ...toWorld('welcome', 10, 2), r: 3.4 },
  { island: 'garden', ...toWorld('garden', 11, 9), r: 4.4 },
];
// stream from the Welcome pond to the island edge (waterfall)
const sA = toWorld('welcome', 13, 2), sB = toWorld('welcome', 21, 3);
export const streams = [{ ax: sA.x, az: sA.z, bx: sB.x, bz: sB.z, w: 1.5 }];

export function islandRadius(isl, ang) {
  return isl.r * (1 + 0.07 * Math.sin(3 * ang + isl.seed) + 0.045 * Math.sin(5 * ang + isl.seed * 2.3));
}

function segDist(px, pz, ax, az, bx, bz) {
  const abx = bx - ax, abz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / (abx * abx + abz * abz)));
  return { d: Math.hypot(px - (ax + abx * t), pz - (az + abz * t)), t };
}

/** Visual terrain height of an island at (x,z); null outside. */
export function islandHeight(isl, x, z, pad = 0) {
  const dx = x - isl.cx, dz = z - isl.cz;
  const d = Math.hypot(dx, dz);
  const R = islandRadius(isl, Math.atan2(dz, dx)) + pad;
  if (d > R) return null;
  const k = d / R;
  const fade = (1 - smooth(0.6, 0.9, k)) * smooth(0.12, 0.4, k);
  let h = isl.h;
  h += fade * 0.45 * (Math.sin(x * 0.21 + isl.seed) * Math.cos(z * 0.17 - isl.seed) + 0.5 * Math.sin(x * 0.47 + z * 0.39));
  h -= smooth(0.93, 1.0, k) * 0.35; // rounded rim
  for (const l of lakes) {
    if (l.island !== isl.id) continue;
    const ld = Math.hypot(x - l.x, z - l.z);
    h -= 0.9 * (1 - smooth(l.r - 0.6, l.r + 1.0, ld));
  }
  for (const s of streams) {
    const { d: sd } = segDist(x, z, s.ax, s.az, s.bx, s.bz);
    if (isl.id === 'welcome') h -= 0.6 * (1 - smooth(s.w * 0.4, s.w + 0.6, sd));
  }
  return h;
}

// ---------------------------------------------------------------- bridges
export const bridges = layout.bridges.map((b) => {
  const A = islandById[b.a], B = islandById[b.b];
  const dir = new THREE.Vector2(B.cx - A.cx, B.cz - A.cz).normalize();
  // anchor each end well inside the island's *actual* (irregular) walkable edge so there is never a gap
  const rA = islandRadius(A, Math.atan2(dir.y, dir.x)) - 2.5;
  const rB = islandRadius(B, Math.atan2(-dir.y, -dir.x)) - 2.5;
  const p0 = new THREE.Vector2(A.cx, A.cz).addScaledVector(dir, rA);
  const p1 = new THREE.Vector2(B.cx, B.cz).addScaledVector(dir, -rB);
  return { ...b, A, B, dir, perp: new THREE.Vector2(-dir.y, dir.x), p0, p1, L: p0.distanceTo(p1) };
});

export function bridgeDeck(b, t) {
  return b.A.h + (b.B.h - b.A.h) * t + b.arch * Math.sin(Math.PI * t);
}

function bridgeHeight(b, x, z) {
  const rx = x - b.p0.x, rz = z - b.p0.y;
  const t = (rx * b.dir.x + rz * b.dir.y) / b.L;
  const s = rx * b.perp.x + rz * b.perp.y;
  if (t < -0.02 || t > 1.02 || Math.abs(s) > b.width / 2 - 0.4) return null;
  return bridgeDeck(b, Math.min(1, Math.max(0, t)));
}

// ---------------------------------------------------------------- paths (auto from bridges + spawn)
export const paths = []; // segments {ax, az, bx, bz, island}
for (const isl of islands) {
  const hub = { x: isl.cx, z: isl.cz };
  const ends = [];
  for (const b of bridges) {
    if (b.a === isl.id) ends.push({ x: b.p0.x, z: b.p0.y });
    if (b.b === isl.id) ends.push({ x: b.p1.x, z: b.p1.y });
  }
  if (layout.spawn.island === isl.id) {
    const s = toWorld(isl.id, ...layout.spawn.at);
    ends.push({ x: s.x, z: s.z + 4 });
  }
  for (const e of ends) paths.push({ ax: hub.x, az: hub.z, bx: e.x, bz: e.z, island: isl.id });
}
export function pathDist(x, z) {
  let m = Infinity;
  for (const p of paths) m = Math.min(m, segDist(x, z, p.ax, p.az, p.bx, p.bz).d);
  return m;
}

// ---------------------------------------------------------------- walkable pads (raised floors) & obstacles
export const pads = []; // {x,z,r?|hx,hz,rot, y}
export const obstacles = []; // circles {x,z,r} and boxes {x,z,hx,hz,rot}

export function padHeight(x, z) {
  let best = null;
  for (const p of pads) {
    let inside;
    if (p.r) inside = Math.hypot(x - p.x, z - p.z) < p.r;
    else {
      const c = Math.cos(p.rot), s = Math.sin(p.rot);
      const lx = (x - p.x) * c - (z - p.z) * s, lz = (x - p.x) * s + (z - p.z) * c;
      inside = Math.abs(lx) < p.hx && Math.abs(lz) < p.hz;
    }
    if (inside && (best === null || p.y > best)) best = p.y;
  }
  return best;
}

/** Walkable ground height at (x,z) or null if not walkable (edge / water). */
export function groundAt(x, z) {
  let h = null;
  for (const isl of islands) {
    const dx = x - isl.cx, dz = z - isl.cz;
    if (Math.abs(dx) > isl.r * 1.2 || Math.abs(dz) > isl.r * 1.2) continue;
    const R = islandRadius(isl, Math.atan2(dz, dx));
    if (Math.hypot(dx, dz) > R - 1.0) continue;
    let blocked = false;
    for (const l of lakes) if (Math.hypot(x - l.x, z - l.z) < l.r + 0.2) blocked = true;
    for (const s of streams) if (isl.id === 'welcome' && segDist(x, z, s.ax, s.az, s.bx, s.bz).d < s.w * 0.75) blocked = true;
    if (blocked) continue;
    const ih = islandHeight(isl, x, z);
    if (ih !== null) h = h === null ? ih : Math.max(h, ih);
  }
  for (const b of bridges) {
    const bh = bridgeHeight(b, x, z);
    if (bh !== null) h = h === null ? bh : Math.max(h, bh);
  }
  if (h !== null) {
    const ph = padHeight(x, z);
    if (ph !== null) h = Math.max(h, ph);
  }
  return h;
}

/** Push a point out of obstacles. Returns adjusted {x,z}. */
export function resolveObstacles(x, z, radius = 0.35) {
  for (const o of obstacles) {
    if (o.r) {
      const dx = x - o.x, dz = z - o.z;
      const d = Math.hypot(dx, dz), min = o.r + radius;
      if (d < min && d > 1e-5) { x = o.x + (dx / d) * min; z = o.z + (dz / d) * min; }
    } else {
      const c = Math.cos(o.rot), s = Math.sin(o.rot);
      let lx = (x - o.x) * c - (z - o.z) * s, lz = (x - o.x) * s + (z - o.z) * c;
      const ex = o.hx + radius, ez = o.hz + radius;
      if (Math.abs(lx) < ex && Math.abs(lz) < ez) {
        if (ex - Math.abs(lx) < ez - Math.abs(lz)) lx = Math.sign(lx || 1) * ex; else lz = Math.sign(lz || 1) * ez;
        x = o.x + lx * c + lz * s;
        z = o.z - lx * s + lz * c;
      }
    }
  }
  return { x, z };
}

// ---------------------------------------------------------------- island top mesh
const grassA = new THREE.Color('#8fd46a'), grassB = new THREE.Color('#6cbf5e'), grassC = new THREE.Color('#b5e27a');
const dirt = new THREE.Color('#c9a878'), petalTint = new THREE.Color('#ffb3d6'), rim = new THREE.Color('#7fae55');

export function buildIslandTop(isl, rings = 26, segs = 72) {
  const pos = [], col = [], idx = [];
  const c = new THREE.Color();
  pos.push(isl.cx, islandHeight(isl, isl.cx, isl.cz), isl.cz);
  col.push(grassA.r, grassA.g, grassA.b);
  for (let r = 1; r <= rings; r++) {
    const k = r / rings;
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      const R = islandRadius(isl, a) * k;
      const x = isl.cx + Math.cos(a) * R, z = isl.cz + Math.sin(a) * R;
      const y = r === rings ? islandHeight(isl, x, z, 0.01) ?? isl.h - 0.35 : islandHeight(isl, x, z);
      pos.push(x, y, z);
      const n = 0.5 + 0.5 * Math.sin(x * 0.31 + z * 0.17) * Math.cos(z * 0.23 - x * 0.11);
      c.copy(grassB).lerp(grassA, n);
      if (Math.sin(x * 0.9) * Math.cos(z * 0.8) > 0.6) c.lerp(grassC, 0.4);
      const pd = pathDist(x, z);
      if (pd < 2.2) c.lerp(dirt, (1 - pd / 2.2) * 0.75);
      if (isl.id === 'garden' || isl.id === 'kingdom') if (Math.sin(x * 0.5 + 1) * Math.sin(z * 0.6) > 0.55) c.lerp(petalTint, 0.35);
      if (k > 0.94) c.lerp(rim, 0.5);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let s = 0; s < segs; s++) idx.push(0, 1 + ((s + 1) % segs), 1 + s);
  for (let r = 1; r < rings; r++) {
    const o0 = 1 + (r - 1) * segs, o1 = 1 + r * segs;
    for (let s = 0; s < segs; s++) {
      const s1 = (s + 1) % segs;
      idx.push(o0 + s, o0 + s1, o1 + s, o0 + s1, o1 + s1, o1 + s);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  m.receiveShadow = true;
  m.name = 'ground_' + isl.id;
  return m;
}

export { layout, segDist, smooth };
