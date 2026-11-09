import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { audio } from '../components/Audio.js';

const WALK = 2.6, RUN = 6.2, JUMP_V = 7.0, GRAVITY = 20, RADIUS = 0.35, STEP = 0.8;

/** Third-person controller for the supplied Pooja model (rigged in Blender, see blender/scripts/rig_character.py). */
export class CharacterController {
  constructor(scene, world, manager) {
    this.scene = scene;
    this.world = world;
    this.loader = new GLTFLoader(manager);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.grounded = true;
    this.yaw = 0;
    this.enabled = false;
    this.override = null; // 'Collect' | 'Celebrate' one-shots / holds
    this.stepAcc = 0;
    this.lastSafe = new THREE.Vector3();
  }

  async load(url) {
    const gltf = await this.loader.loadAsync(url);
    this.root = new THREE.Group();
    this.model = gltf.scene;
    this.model.scale.setScalar(0.92);
    this.model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = false;
        o.frustumCulled = false;
        const m = o.material;
        m.roughness = 0.78; m.metalness = 0;
        m.emissive = new THREE.Color('#ffffff'); m.emissiveMap = m.map; m.emissiveIntensity = 0.22;
      }
    });
    this.root.add(this.model);
    // soft blob shadow for low quality / extra grounding
    const blob = new THREE.Mesh(new THREE.CircleGeometry(0.45, 24), new THREE.MeshBasicMaterial({ color: '#3a1f4a', transparent: true, opacity: 0.28, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.03;
    this.blob = blob;
    this.scene.add(this.root, blob);
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const clip of gltf.animations) {
      const a = this.mixer.clipAction(clip);
      this.actions[clip.name] = a;
    }
    for (const n of ['Jump', 'Collect']) {
      if (this.actions[n]) { this.actions[n].setLoop(THREE.LoopOnce); this.actions[n].clampWhenFinished = true; }
    }
    this.current = null;
    this.play('Idle', 0);
    return this;
  }

  play(name, fade = 0.25) {
    const next = this.actions[name];
    if (!next || this.current === next) return next;
    next.reset().setEffectiveWeight(1).fadeIn(fade).play();
    if (this.current) this.current.fadeOut(fade);
    this.current = next;
    this.currentName = name;
    return next;
  }

  playOnce(name, hold = false) {
    return new Promise((res) => {
      const a = this.play(name, 0.2);
      if (!a) return res();
      this.override = name;
      const dur = a.getClip().duration / a.getEffectiveTimeScale();
      setTimeout(() => { if (!hold) this.override = null; res(); }, dur * 1000);
    });
  }

  teleport(x, y, z, yaw = this.yaw) {
    this.pos.set(x, y, z);
    this.yaw = yaw;
    this.vel.set(0, 0, 0);
    this.vy = 0;
    this.lastSafe.copy(this.pos);
    this.root.position.copy(this.pos);
    this.root.rotation.y = yaw;
  }

  faceTowards(x, z) { this.yaw = Math.atan2(x - this.pos.x, z - this.pos.z); }

  canStand(x, z, fromY) {
    const g = this.world.groundAt(x, z);
    if (g === null) return null;
    if (g - fromY > STEP && this.grounded) return null;
    return g;
  }

  update(dt, inp, camYaw) {
    const move = this.enabled ? inp.move : { x: 0, y: 0 };
    const mag = Math.min(1, Math.hypot(move.x, move.y));
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    const dx = fx * move.y + rx * move.x, dz = fz * move.y + rz * move.x;
    const speed = (inp.walk ? WALK : RUN) * (mag > 0.05 ? 1 : 0);
    const dl = Math.hypot(dx, dz) || 1;
    const tx = (dx / dl) * speed, tz = (dz / dl) * speed;
    const k = 1 - Math.exp(-(this.grounded ? 12 : 3) * dt);
    this.vel.x += (tx - this.vel.x) * k;
    this.vel.z += (tz - this.vel.z) * k;

    // horizontal move with sliding + obstacles
    let nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    const res = this.world.resolve(nx, nz, RADIUS);
    nx = res.x; nz = res.z;
    let g = this.canStand(nx, nz, this.pos.y);
    if (g === null) {
      const gx = this.canStand(nx, this.pos.z, this.pos.y);
      const gz = this.canStand(this.pos.x, nz, this.pos.y);
      if (gx !== null) { nz = this.pos.z; g = gx; this.vel.z = 0; }
      else if (gz !== null) { nx = this.pos.x; g = gz; this.vel.x = 0; }
      else { nx = this.pos.x; nz = this.pos.z; this.vel.x = this.vel.z = 0; g = this.world.groundAt(nx, nz); }
    }
    this.pos.x = nx; this.pos.z = nz;
    if (g === null) { this.teleport(this.lastSafe.x, this.lastSafe.y, this.lastSafe.z); g = this.pos.y; }

    // vertical
    this.vy -= GRAVITY * dt;
    this.pos.y += this.vy * dt;
    if (this.pos.y <= g) {
      if (!this.grounded && this.vy < -3) audio.footstep(1.3);
      this.pos.y = g; this.vy = 0; this.grounded = true;
    } else if (this.grounded && this.pos.y - g < 0.45 && this.vy <= 0) {
      this.pos.y = g; this.vy = 0;
    } else {
      this.grounded = false;
    }
    if (this.grounded) this.lastSafe.copy(this.pos);

    // facing
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs > 0.3 && this.enabled) this.yaw = Math.atan2(this.vel.x, this.vel.z);
    let dy = this.yaw - this.root.rotation.y;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.root.rotation.y += dy * (1 - Math.exp(-12 * dt));
    this.root.position.x = this.pos.x;
    this.root.position.z = this.pos.z;
    this.root.position.y += (this.pos.y - this.root.position.y) * (1 - Math.exp(-25 * dt));
    this.blob.position.set(this.pos.x, (this.world.groundAt(this.pos.x, this.pos.z) ?? this.pos.y) + 0.03, this.pos.z);

    // animation state
    if (!this.override) {
      if (hs > 4.0) { this.play('Run', 0.2); this.actions.Run.timeScale = hs / 5.6; }
      else if (hs > 0.35) { this.play('Walk', 0.2); this.actions.Walk.timeScale = Math.max(0.6, hs / 2.3); }
      else this.play('Idle', 0.3);
    }
    // footsteps
    if (this.grounded && hs > 0.35) {
      this.stepAcc += hs * dt;
      const stride = hs > 4 ? 1.05 : 0.7;
      if (this.stepAcc > stride) { this.stepAcc = 0; audio.footstep(hs > 4 ? 1 : 0.7); }
    }
    this.mixer.update(dt);
    this.speed = hs;
  }
}
