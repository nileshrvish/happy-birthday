import * as THREE from 'three';
import { glowTexture, shared } from '../components/Assets.js';

/** Drifting cherry-blossom petals that follow the player. */
export class FallingPetals {
  constructor(petalGeo, count) {
    const mat = new THREE.MeshStandardMaterial({ color: '#ffb6da', emissive: '#ff8fc7', emissiveIntensity: 0.25, side: THREE.DoubleSide, roughness: 0.6 });
    this.mesh = new THREE.InstancedMesh(petalGeo, mat, count);
    this.mesh.frustumCulled = false;
    this.p = [];
    for (let i = 0; i < count; i++) {
      this.p.push({ x: (Math.random() - 0.5) * 50, y: Math.random() * 18, z: (Math.random() - 0.5) * 50, s: 0.16 + Math.random() * 0.14,
        r: Math.random() * 6, sp: 0.4 + Math.random() * 0.5, ph: Math.random() * 6 });
    }
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
  }
  update(dt, center, t) {
    const { p, m, q, e } = this;
    for (let i = 0; i < p.length; i++) {
      const a = p[i];
      a.y -= a.sp * dt;
      a.x += (Math.sin(t * 0.7 + a.ph) * 0.6 + 0.5) * dt;
      a.z += Math.cos(t * 0.5 + a.ph) * 0.4 * dt;
      if (a.y < -2) a.y = 18;
      let rx = ((a.x - center.x + 25) % 50 + 50) % 50 - 25;
      let rz = ((a.z - center.z + 25) % 50 + 50) % 50 - 25;
      e.set(t * 1.3 + a.ph, t * 0.9 + a.r, Math.sin(t + a.ph));
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(center.x + rx, center.y + a.y - 3, center.z + rz), q, new THREE.Vector3(a.s, a.s, a.s));
      this.mesh.setMatrixAt(i, m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Glowing points (fireflies / magic dust) animated fully on the GPU. */
export function glowPoints(positions, { color = '#fff3a0', size = 0.35, drift = 0.6, speed = 1, opacity = 1 } = {}) {
  const g = new THREE.BufferGeometry();
  const seeds = new Float32Array(positions.length / 3);
  for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random() * 100;
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { time: shared.time, map: { value: glowTexture() }, color: { value: new THREE.Color(color) }, size: { value: size }, drift: { value: drift }, speed: { value: speed }, opacity: { value: opacity } },
    vertexShader: `
      attribute float seed; uniform float time, size, drift, speed; varying float vA;
      void main(){
        vec3 p = position;
        float t = time * speed + seed;
        p += vec3(sin(t * 0.7) , sin(t * 0.9 + 1.3) * 0.6, cos(t * 0.6)) * drift;
        vA = 0.5 + 0.5 * sin(t * 2.3);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = size * 300.0 / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D map; uniform vec3 color; uniform float opacity; varying float vA;
      void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(color * (0.6 + vA), t.a * opacity * (0.35 + 0.65 * vA)); }`,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  return pts;
}

/** Simple butterflies flapping along wandering loops. */
export class Butterflies {
  constructor(centers) {
    this.group = new THREE.Group();
    this.list = [];
    const wingGeo = new THREE.CircleGeometry(0.18, 8);
    wingGeo.translate(0.17, 0, 0);
    const cols = ['#ffd1ec', '#c7b3ff', '#fff1a8', '#9fe0ff'];
    centers.forEach((c, i) => {
      const mat = new THREE.MeshStandardMaterial({ color: cols[i % cols.length], emissive: cols[i % cols.length], emissiveIntensity: 0.9, side: THREE.DoubleSide });
      const b = new THREE.Group();
      const l = new THREE.Mesh(wingGeo, mat), r = new THREE.Mesh(wingGeo, mat);
      r.scale.x = -1;
      const lp = new THREE.Group(), rp = new THREE.Group();
      lp.add(l); rp.add(r);
      l.rotation.x = r.rotation.x = -Math.PI / 2;
      b.add(lp, rp);
      this.group.add(b);
      this.list.push({ b, lp, rp, c, ph: Math.random() * 10, rad: 1.5 + Math.random() * 3, h: 1 + Math.random() * 1.5 });
    });
  }
  update(t) {
    for (const f of this.list) {
      const a = t * 0.45 + f.ph;
      const x = f.c.x + Math.cos(a) * f.rad + Math.sin(a * 2.3) * 0.6;
      const z = f.c.z + Math.sin(a * 1.2) * f.rad;
      const y = f.c.y + f.h + Math.sin(a * 3.1) * 0.4;
      const nx = f.c.x + Math.cos(a + 0.05) * f.rad + Math.sin((a + 0.05) * 2.3) * 0.6, nz = f.c.z + Math.sin((a + 0.05) * 1.2) * f.rad;
      f.b.position.set(x, y, z);
      f.b.rotation.y = Math.atan2(nx - x, nz - z) + Math.PI / 2;
      const flap = Math.sin(t * 18 + f.ph) * 0.9;
      f.lp.rotation.z = flap; f.rp.rotation.z = -flap;
    }
  }
}

/** Rising glowing sky lanterns (instanced). */
export class SkyLanterns {
  constructor(parts, center, count, radius) {
    this.group = new THREE.Group();
    this.items = [];
    this.meshes = parts.map(({ geometry, material }) => {
      const m = material.clone();
      m.emissiveIntensity = 3;
      const im = new THREE.InstancedMesh(geometry, m, count);
      im.frustumCulled = false;
      this.group.add(im);
      return im;
    });
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * radius;
      this.items.push({ x: center.x + Math.cos(a) * r, z: center.z + Math.sin(a) * r, y: center.y + Math.random() * 40, base: center.y + 2, sp: 0.5 + Math.random() * 0.6, ph: Math.random() * 6, s: 0.8 + Math.random() * 0.6 });
    }
    this.boost = 0;
    this.m = new THREE.Matrix4();
  }
  update(dt, t) {
    const v = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    this.items.forEach((it, i) => {
      it.y += it.sp * dt * (1 + this.boost * 2);
      if (it.y > it.base + 45) it.y = it.base;
      v.set(it.x + Math.sin(t * 0.3 + it.ph) * 1.2, it.y, it.z + Math.cos(t * 0.25 + it.ph));
      s.setScalar(it.s * Math.min(1, (it.y - it.base) / 3 + 0.05));
      this.m.compose(v, q, s);
      for (const im of this.meshes) im.setMatrixAt(i, this.m);
    });
    for (const im of this.meshes) im.instanceMatrix.needsUpdate = true;
  }
}

/** One-shot radial sparkle burst. */
export class Burst {
  constructor(scene) {
    this.scene = scene;
    this.active = [];
  }
  spawn(pos, { count = 80, color = '#ffc4e1', speed = 4, life = 1.6, size = 0.5 } = {}) {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(count * 3), v = [];
    for (let i = 0; i < count; i++) {
      p.set([pos.x, pos.y, pos.z], i * 3);
      const d = new THREE.Vector3().randomDirection().multiplyScalar(speed * (0.4 + Math.random() * 0.6));
      v.push(d);
    }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const m = new THREE.PointsMaterial({ size, map: glowTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    this.scene.add(pts);
    this.active.push({ pts, v, t: 0, life });
  }
  update(dt) {
    this.active = this.active.filter((b) => {
      b.t += dt;
      const a = b.pts.geometry.attributes.position;
      for (let i = 0; i < b.v.length; i++) {
        b.v[i].multiplyScalar(1 - dt * 1.5);
        b.v[i].y -= dt * 0.6;
        a.array[i * 3] += b.v[i].x * dt; a.array[i * 3 + 1] += b.v[i].y * dt; a.array[i * 3 + 2] += b.v[i].z * dt;
      }
      a.needsUpdate = true;
      b.pts.material.opacity = Math.max(0, 1 - b.t / b.life);
      if (b.t >= b.life) { this.scene.remove(b.pts); b.pts.geometry.dispose(); b.pts.material.dispose(); return false; }
      return true;
    });
  }
}

/** Soft vertical light pillar marking the next objective. */
export function beacon(color = '#ffb3d9') {
  const geo = new THREE.CylinderGeometry(0.5, 0.9, 40, 16, 1, true);
  geo.translate(0, 20, 0);
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { time: shared.time, color: { value: new THREE.Color(color) }, strength: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float time, strength; uniform vec3 color; varying vec2 vUv;
      void main(){ float a = (1.0 - vUv.y) * (0.25 + 0.1 * sin(time * 2.0 + vUv.y * 10.0)); gl_FragColor = vec4(color, a * strength); }`,
  });
  return new THREE.Mesh(geo, m);
}
