import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { AssetLibrary, shared } from '../components/Assets.js';
import { audio } from '../components/Audio.js';
import { Input, isTouch } from '../components/Input.js';
import { World } from './World.js';
import { CharacterController } from './CharacterController.js';
import { CameraController } from './CameraController.js';
import { Collectibles } from './Collectibles.js';
import { Cinematics } from './Cinematics.js';
import { layout, toWorld, groundAt, islandById } from '../environments/Terrain.js';
import { objectives } from '../story/dialogue.js';
import { sleep } from '../ui/UI.js';

const BASE = import.meta.env.BASE_URL;

export class Game {
  constructor(canvas, ui) {
    this.canvas = canvas;
    this.ui = ui;
    this.state = 'loading';
    let saved = null;
    try { saved = localStorage.getItem('pba-quality-v2'); } catch (_) { /* private mode */ }
    this.hq = saved ? saved === 'high' : true; // HQ by default on every device
    this.quality = { density: this.hq ? 1 : 0.55, shadows: true };
  }

  async load() {
    const manager = new THREE.LoadingManager();
    manager.onProgress = (_, loaded, total) => this.ui.setLoading(loaded / Math.max(total, 1));

    const r = (this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: !isTouch, powerPreference: 'high-performance' }));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.92;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 1200);

    this.assets = await new AssetLibrary(manager).load(`${BASE}assets/models/environment_assets.glb`);
    this.world = new World(this.scene, this.assets, this.quality);
    this.world.build();
    this.player = new CharacterController(this.scene, this.world, manager);
    await this.player.load(`${BASE}assets/models/pooja.glb`);
    const sp = toWorld(layout.spawn.island, ...layout.spawn.at);
    this.player.teleport(sp.x, groundAt(sp.x, sp.z), sp.z, Math.PI);
    this.cam = new CameraController(this.camera, this.world);
    this.cam.yaw = 0;
    this.cam.snap(this.player.pos.clone().add(new THREE.Vector3(0, 1.5, 0)));
    this.collectibles = new Collectibles(this.scene, this.assets);
    this.cine = new Cinematics(this);
    this.input = new Input(this.canvas);

    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.35, 0.5, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.applyQuality();
    addEventListener('resize', () => this.resize());
    this.resize();
    // warm up shaders
    r.compile(this.scene, this.camera);
    this.bindButtons();
    this.clock = new THREE.Clock();
    this.time = 0;
    this.state = 'title';
    this.titleAngle = 0;
    r.setAnimationLoop(() => this.frame());
  }

  applyQuality() {
    const dpr = Math.min(devicePixelRatio, this.hq ? (isTouch ? 1.75 : 2) : 1.25);
    this.renderer.setPixelRatio(dpr);
    this.world.sun.castShadow = this.hq || !isTouch;
    this.world.sun.shadow.mapSize.set(this.hq ? 2048 : 1024, this.hq ? 2048 : 1024);
    if (this.world.sun.shadow.map) { this.world.sun.shadow.map.dispose(); this.world.sun.shadow.map = null; }
    this.useBloom = this.hq;
    document.getElementById('btn-quality').textContent = this.hq ? 'HQ' : 'LQ';
    this.resize();
  }

  bindButtons() {
    const mute = document.getElementById('btn-mute');
    mute.onclick = () => { audio.setMuted(!audio.muted); mute.textContent = audio.muted ? '🔇' : '🔊'; };
    document.getElementById('btn-quality').onclick = () => {
      this.hq = !this.hq;
      try { localStorage.setItem('pba-quality-v2', this.hq ? 'high' : 'low'); } catch (_) { /* ignore */ }
      this.applyQuality();
    };
    const d0 = document.documentElement;
    if (!(d0.requestFullscreen || d0.webkitRequestFullscreen)) document.getElementById('btn-full').classList.add('hidden'); // iPhone Safari
    document.getElementById('btn-full').onclick = () => {
      const d = document.documentElement;
      if (!document.fullscreenElement) (d.requestFullscreen || d.webkitRequestFullscreen)?.call(d);
      else document.exitFullscreen?.();
    };
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    const aspect = w / h;
    this.camera.aspect = aspect;
    // portrait phones see much less horizontally: widen the view and pull the camera back a little
    this.camera.fov = aspect < 0.8 ? 68 : aspect < 1.2 ? 60 : 55;
    this.camera.updateProjectionMatrix();
    if (this.cam) this.cam.distScale = aspect < 0.8 ? 1.25 : 1;
  }

  async start() {
    await audio.init();
    this.state = 'intro';
    await this.ui.fade(true, true, 600);
    await this.cine.opening();
    this.state = 'play';
    this.input.enabled = true;
    this.player.enabled = true;
    this.ui.showHUD(true);
    this.ui.setPetals(0);
    this.updateObjective();
    this.ui.showControlsHelp();
  }

  updateObjective() {
    const i = this.collectibles.nextObjectiveIndex();
    this.ui.setObjective(i >= 0 ? objectives[i] : '');
  }

  async interact(near) {
    const { item } = near;
    const c = this.collectibles;
    item.busy = true;
    this.state = 'collecting';
    this.input.enabled = false;
    this.input.releasePointer();
    this.player.enabled = false;
    this.ui.setPrompt(null);
    this.player.faceTowards(item.pos.x, item.pos.z);
    if (item.def.kind === 'diary' || item.def.kind === 'phone') {
      if (item.def.kind === 'phone') { audio.ring(); await sleep(2300); }
      else audio.chime();
      item.revealed = true;
      item.holder.visible = true;
      item.holder.scale.setScalar(0.01);
      this.world.burst.spawn(item.pos, { count: 70 });
      await this.cine.animate(1.2, (k) => item.holder.scale.setScalar(Math.max(0.01, k)));
    }
    // petal flies into her hands
    this.player.playOnce('Collect');
    await sleep(450);
    item.flying = true;
    const from = item.holder.position.clone();
    await this.cine.animate(0.8, (k) => {
      const to = this.player.pos.clone().add(new THREE.Vector3(Math.sin(this.player.yaw) * 0.5, 1.3, Math.cos(this.player.yaw) * 0.5));
      item.holder.position.lerpVectors(from, to, k * k);
      item.holder.scale.setScalar(1 - k * 0.8);
    });
    item.holder.visible = false;
    item.beam.visible = false;
    c.collected.add(item.def.id);
    audio.collect();
    this.world.burst.spawn(this.player.pos.clone().add(new THREE.Vector3(0, 1.3, 0)), { count: 90 });
    this.ui.setPetals(c.count, item.def.id - 1);
    await sleep(900);
    await this.ui.showStory(item.def.id);
    if (c.count >= 4) c.revealFinal();
    if (c.count === 5) {
      this.state = 'finale';
      await this.cine.finale();
      this.state = 'letter';
      await this.ui.showLetter({
        onExplore: () => this.resumeAfterFinale(),
        onReplay: () => location.reload(),
      });
      return;
    }
    this.updateObjective();
    this.state = 'play';
    this.input.enabled = true;
    this.player.enabled = true;
  }

  resumeAfterFinale() {
    this.cam.clearCinematic();
    this.player.override = null;
    this.state = 'play';
    this.input.enabled = true;
    this.player.enabled = true;
    this.ui.showHUD(true);
    this.ui.setObjective('All five petals found — Happy Birthday! ✿');
  }

  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.time += dt;
    shared.time.value = this.time;
    const inp = this.input.poll();
    const p = this.player;
    const focus = p.pos.clone().add(new THREE.Vector3(0, 1.5, 0));

    if (this.state === 'title' || this.state === 'loading') {
      this.titleAngle += dt * 0.08;
      const a = this.titleAngle;
      this.cam.setCinematic(new THREE.Vector3(p.pos.x + Math.sin(a) * 30, p.pos.y + 14, p.pos.z + Math.cos(a) * 30), new THREE.Vector3(p.pos.x, p.pos.y + 1, p.pos.z - 10), true);
      this.cam.update(dt, null, focus, false, 0);
    } else {
      p.update(dt, inp, this.cam.yaw);
      this.cam.update(dt, this.state === 'play' ? inp : null, p.pos.clone().add(new THREE.Vector3(0, 1.5, 0)), p.speed > 0.5, p.yaw);
    }
    if (this.state === 'title') p.update(dt, { move: { x: 0, y: 0 } }, 0);
    this.cine.update(dt);
    this.cine.idle(this.time);
    this.collectibles.update(dt, this.time);
    const env = this.world.update(dt, this.time, p.pos);
    if (audio.ctx) { audio.setWater(env.waterfall); audio.setNight(env.night); }

    if (this.state === 'play') {
      const near = this.collectibles.nearest(p.pos);
      this.ui.setPrompt(near);
      if (near && !near.locked && inp.interact) this.interact(near);
    }

    if (this.useBloom) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }
}
