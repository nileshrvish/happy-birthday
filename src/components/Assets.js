import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const shared = { time: { value: 0 } };

/** Loads the Blender-built asset library and offers cloning + GPU instancing. */
export class AssetLibrary {
  constructor(manager) {
    this.loader = new GLTFLoader(manager);
    this.assets = {};
  }

  async load(url) {
    const gltf = await this.loader.loadAsync(url);
    for (const child of [...gltf.scene.children]) {
      child.position.set(0, 0, 0);
      child.updateMatrixWorld(true);
      this.assets[child.name] = child;
    }
    // stylize materials a little
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material;
      m.envMapIntensity = 0.6;
      if (m.emissive && m.emissiveIntensity > 0 && m.emissive.getHex() !== 0) m.toneMapped = true;
      if (m.transparent) m.depthWrite = false;
    });
    return this;
  }

  get(name) {
    const a = this.assets[name];
    if (!a) throw new Error(`Missing asset: ${name}`);
    return a;
  }

  clone(name) {
    const c = this.get(name).clone(true);
    c.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return c;
  }

  /** Flattened list of {geometry, material} parts of an asset (in asset space). */
  parts(name) {
    const root = this.get(name);
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const out = [];
    root.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry.clone();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      out.push({ geometry: g, material: o.material });
    });
    return out;
  }

  /**
   * Instanced copies of an asset. `matrices` = THREE.Matrix4[].
   * opts.wind: sway amplitude (0 = static), opts.shadow
   */
  instanced(name, matrices, opts = {}) {
    const group = new THREE.Group();
    group.name = name + '_instances';
    if (!matrices.length) return group;
    for (const { geometry, material } of this.parts(name)) {
      let mat = material;
      if (opts.wind) mat = windMaterial(material, opts.wind, opts.windHeight ?? 1);
      const im = new THREE.InstancedMesh(geometry, mat, matrices.length);
      matrices.forEach((m, i) => im.setMatrixAt(i, m));
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = opts.shadow ?? true;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      group.add(im);
    }
    return group;
  }
}

const windCache = new Map();
/** Patches a material so vertices sway with height (trees, grass, flowers). */
export function windMaterial(base, amp, height) {
  const key = base.uuid + amp + '_' + height;
  if (windCache.has(key)) return windCache.get(key);
  const m = base.clone();
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec3 ip = vec3(0.0);
        #ifdef USE_INSTANCING
          ip = instanceMatrix[3].xyz;
        #endif
        float hh = max(transformed.y, 0.0) / ${height.toFixed(2)};
        float w = sin(uTime * 1.7 + ip.x * 0.35 + ip.z * 0.27) + 0.4 * sin(uTime * 3.1 + ip.x * 0.9);
        transformed.x += w * ${amp.toFixed(3)} * hh * hh;
        transformed.z += cos(uTime * 1.3 + ip.z * 0.31) * ${(amp * 0.6).toFixed(3)} * hh * hh;`
      );
  };
  m.customProgramCacheKey = () => key;
  windCache.set(key, m);
  return m;
}

export function composeMatrix(x, y, z, rotY = 0, s = 1, sy = s) {
  const m = new THREE.Matrix4();
  m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), new THREE.Vector3(s, sy, s));
  return m;
}

/** Soft radial glow sprite texture. */
let glowTex;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}
