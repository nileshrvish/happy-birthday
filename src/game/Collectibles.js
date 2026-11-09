import * as THREE from 'three';
import { glowTexture } from '../components/Assets.js';
import { layout, toWorld, islandById, islandHeight } from '../environments/Terrain.js';
import { glowPoints, beacon } from '../environments/Effects.js';
import { interactLabels } from '../story/dialogue.js';

export const PETAL_COLORS = ['#ff9ccf', '#ffb0d8', '#ff86c2', '#ffc0df', '#ff74b8'];

/** Builds a glowing petal mesh from the Blender asset. */
export function makePetal(assets, color, scale = 1, glow = 1.1) {
  const g = new THREE.Group();
  for (const { geometry } of assets.parts('petal')) {
    const m = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: glow, roughness: 0.35, side: THREE.DoubleSide,
    }));
    g.add(m);
  }
  g.scale.setScalar(scale);
  return g;
}

export class Collectibles {
  constructor(scene, assets) {
    this.scene = scene;
    this.assets = assets;
    this.items = [];
    this.collected = new Set();
    for (const def of layout.petals) {
      const isl = islandById[def.island];
      const w = toWorld(def.island, ...def.at);
      const ground = islandHeight(isl, w.x, w.z) ?? isl.h;
      const pos = new THREE.Vector3(w.x, ground + def.y, w.z);
      const holder = new THREE.Group();
      holder.position.copy(pos);
      const petal = makePetal(assets, PETAL_COLORS[def.id - 1], 1.5);
      const spin = new THREE.Group();
      petal.rotation.x = Math.PI / 2; // stand upright, tip up
      petal.position.y = -0.4;
      spin.add(petal);
      holder.add(spin);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ff9fd0', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85 }));
      halo.scale.setScalar(2.2);
      holder.add(halo);
      const sp = [];
      for (let i = 0; i < 26; i++) sp.push((Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1.6);
      const sparkles = glowPoints(sp, { color: '#ffd6ec', size: 0.22, drift: 0.35, speed: 1.4 });
      holder.add(sparkles);
      const beam = beacon();
      beam.position.set(pos.x, ground, pos.z);
      scene.add(holder, beam);
      const hidden = def.kind === 'diary' || def.kind === 'phone' || def.kind === 'final';
      holder.visible = !hidden;
      const item = { def, pos, ground, holder, spin, halo, beam, hidden, revealed: !hidden, busy: false };
      // a glow marker for objects that hold a petal (diary / phone)
      if (hidden && def.kind !== 'final') {
        const mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: def.kind === 'diary' ? '#ffb3e6' : '#ffd27a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 }));
        mark.scale.setScalar(def.kind === 'diary' ? 1.8 : 3);
        mark.position.set(pos.x, ground + (def.kind === 'diary' ? 1.2 : 1.6), pos.z);
        scene.add(mark);
        item.marker = mark;
      }
      this.items.push(item);
    }
  }

  get count() { return this.collected.size; }

  nextObjectiveIndex() {
    for (let i = 0; i < this.items.length; i++) if (!this.collected.has(this.items[i].def.id)) return i;
    return -1;
  }

  /** Nearest interactable within range of the player. */
  nearest(playerPos) {
    let best = null, bd = Infinity;
    for (const it of this.items) {
      if (this.collected.has(it.def.id) || it.busy) continue;
      const r = it.def.kind === 'phone' ? 3.0 : it.def.kind === 'final' ? 3.2 : 2.6;
      const d = Math.hypot(playerPos.x - it.pos.x, playerPos.z - it.pos.z);
      if (d < r && Math.abs(playerPos.y - it.ground) < 2.5 && d < bd) { bd = d; best = it; }
    }
    if (!best) return null;
    const locked = best.def.kind === 'final' && this.count < 4;
    return { item: best, locked, label: locked ? interactLabels.locked : interactLabels[best.def.kind] };
  }

  revealFinal() {
    const it = this.items.find((i) => i.def.kind === 'final');
    if (it && !it.revealed) { it.revealed = true; it.holder.visible = true; it.holder.scale.setScalar(0.01); it.appear = 0; }
  }

  update(dt, t) {
    const nextIdx = this.nextObjectiveIndex();
    for (const [idx, it] of this.items.entries()) {
      const done = this.collected.has(it.def.id);
      it.beam.visible = !done && idx === nextIdx && (it.def.kind !== 'final' || this.count >= 4);
      if (it.marker) {
        it.marker.visible = !done && !it.revealed;
        it.marker.material.opacity = 0.55 + 0.3 * Math.sin(t * 3);
      }
      if (!it.holder.visible || it.flying) continue;
      if (it.appear !== undefined && it.appear < 1) { it.appear = Math.min(1, it.appear + dt * 0.8); it.holder.scale.setScalar(it.appear); }
      it.spin.rotation.y = t * 1.6;
      it.holder.position.y = it.pos.y + Math.sin(t * 2 + it.def.id) * 0.15;
      it.halo.material.opacity = 0.6 + 0.25 * Math.sin(t * 3 + it.def.id);
    }
  }
}
