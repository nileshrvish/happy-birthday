import * as THREE from 'three';
import { audio } from '../components/Audio.js';
import { glowTexture } from '../components/Assets.js';
import { makePetal, PETAL_COLORS } from './Collectibles.js';
import { glowPoints } from '../environments/Effects.js';
import { intro, finale } from '../story/dialogue.js';
import { shayari } from '../story/shayari.js';
import { sleep } from '../ui/UI.js';
import { islandById } from '../environments/Terrain.js';

const ease = (t) => t * t * (3 - 2 * t);

export class Cinematics {
  constructor(game) {
    this.g = game;
    this.tasks = new Set();
  }

  /** run a per-frame animation for `dur` seconds: fn(k in 0..1, dt) */
  animate(dur, fn) {
    return new Promise((res) => {
      const task = { t: 0, dur, fn, res };
      this.tasks.add(task);
    });
  }

  update(dt) {
    for (const task of this.tasks) {
      task.t += dt;
      const k = Math.min(1, task.t / task.dur);
      task.fn(k, dt, task.t);
      if (k >= 1) { this.tasks.delete(task); task.res(); }
    }
  }

  // ------------------------------------------------------------ opening
  async opening() {
    const { cam, player, ui } = this.g;
    const p = player.pos;
    const from = new THREE.Vector3(p.x + 40, p.y + 34, p.z + 46);
    const mid = new THREE.Vector3(p.x - 8, p.y + 9, p.z + 14);
    const end = new THREE.Vector3(p.x, p.y + 2.6, p.z + 6.5);
    const look0 = new THREE.Vector3(0, 0, -110), look1 = p.clone().add(new THREE.Vector3(0, 1.4, 0));
    cam.setCinematic(from, look0, true);
    ui.fade(false, true, 1800);
    const lines = (async () => { for (const l of intro) await ui.captionLine(l, 2600); })();
    await this.animate(9, (k) => {
      const e = ease(k);
      const a = from.clone().lerp(mid, e), b = mid.clone().lerp(end, e);
      cam.cineGoalPos = a.lerp(b, e);
      cam.cineGoalLook = look0.clone().lerp(look1, ease(Math.min(1, k * 1.3)));
    });
    await lines;
    cam.clearCinematic();
  }

  // ------------------------------------------------------------ finale
  async finale() {
    const g = this.g;
    const { cam, player, ui, scene, world, assets } = g;
    g.input.enabled = false;
    g.input.releasePointer();
    player.enabled = false;
    ui.showHUD(false);
    audio.startFinale();
    const kc = islandById.kingdom;
    const center = new THREE.Vector3(kc.cx, world.finaleY, kc.cz);

    // walk Pooja to the center of the flower platform, facing the camera
    const start = player.pos.clone();
    player.override = 'cine';
    player.play('Walk');
    player.yaw = Math.atan2(center.x - start.x, center.z - start.z);
    cam.setCinematic(new THREE.Vector3(center.x + 4, center.y + 3.2, center.z + 9), center.clone().add(new THREE.Vector3(0, 1.4, 0)));
    await this.animate(2.2, (k) => {
      player.pos.lerpVectors(start, center, ease(k));
      player.pos.y = center.y;
    });
    player.play('Idle');
    player.yaw = 0;
    player.override = 'cine';

    // five petals orbit around her
    const petals = PETAL_COLORS.map((c) => makePetal(assets, c, 1.2));
    const pg = new THREE.Group();
    pg.position.copy(center);
    scene.add(pg);
    petals.forEach((p) => pg.add(p));
    const dust = [];
    for (let i = 0; i < 160; i++) {
      const a = Math.random() * Math.PI * 2, r = 0.8 + Math.random() * 3;
      dust.push(Math.cos(a) * r, Math.random() * 4, Math.sin(a) * r);
    }
    const dustPts = glowPoints(dust, { color: '#ffc4e8', size: 0.35, drift: 0.6, speed: 1.5, opacity: 0 });
    pg.add(dustPts);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ff9fd2', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.setScalar(5);
    pg.add(glow);
    world.lanterns.boost = 1;
    audio.magic(7);
    const camOrbit = (k, radius = 7, h = 2.6, a0 = -0.25) => {
      const a = a0 + k * 0.6;
      cam.cineGoalPos = new THREE.Vector3(center.x + Math.sin(a) * radius, center.y + h, center.z + Math.cos(a) * radius);
      cam.cineGoalLook = center.clone().add(new THREE.Vector3(0, 2.0, 0));
    };
    let spinA = 0;
    await this.animate(7, (k, dt) => {
      spinA += dt * (1.2 + k * 4);
      const r = 1.7 - k * 0.4, h = 0.6 + k * 1.4;
      petals.forEach((p, i) => {
        const a = spinA + (i / 5) * Math.PI * 2;
        p.position.set(Math.cos(a) * r, h + Math.sin(spinA * 2 + i) * 0.2, Math.sin(a) * r);
        p.rotation.set(spinA * 2 + i, a, spinA);
        p.scale.setScalar(1.2 * Math.min(1, k * 4));
      });
      dustPts.material.uniforms.opacity.value = Math.min(1, k * 2);
      glow.material.opacity = k * 0.5;
      glow.position.y = h;
      camOrbit(k * 0.6);
    });
    // converge
    const flowerPos = new THREE.Vector3(0, 3.05, 0.35);
    const starts = petals.map((p) => p.position.clone());
    await this.animate(1.8, (k, dt) => {
      spinA += dt * 8;
      petals.forEach((p, i) => {
        p.position.lerpVectors(starts[i], flowerPos, ease(k));
        p.rotation.x += dt * 10;
        p.scale.setScalar(1.2 * (1 - k * 0.7));
      });
      glow.position.lerp(flowerPos, 0.2);
      glow.material.opacity = 0.5 + k * 0.2;
      glow.scale.setScalar(5 + k * 4);
    });
    // flash + bloom
    ui.fade(true, false, 250);
    audio.bloom();
    world.burst.spawn(center.clone().add(flowerPos), { count: 160, color: '#ffc4e1', speed: 6, life: 2.4, size: 0.6 });
    world.burst.spawn(center.clone().add(flowerPos), { count: 80, color: '#ffe29a', speed: 4, life: 2.8, size: 0.45 });
    await sleep(260);
    petals.forEach((p) => pg.remove(p));
    const flower = this.buildFlower();
    flower.group.position.copy(flowerPos);
    pg.add(flower.group);
    this.flower = flower;
    ui.fade(false, false, 1400);
    player.playOnce('Collect', true);
    camOrbit(0.6, 4.6, 2.5);
    await this.animate(4, (k) => {
      flower.bloom(ease(k));
      glow.scale.setScalar(6 - k * 2.5);
      glow.material.opacity = 0.7 - k * 0.5;
    });
    this.flower = flower;
    this.flowerGroup = pg;
    this.spinFlower = true;

    // cinematic text sequence
    ui.finaleReset();
    ui.finaleShow('.f-lead', finale.lead);
    await sleep(5200);
    ui.finaleHide('.f-lead');
    await sleep(1900);
    cam.cineGoalPos = new THREE.Vector3(center.x + 1.2, center.y + 2.2, center.z + 5.2);
    ui.finaleShow('.f-name', finale.name);
    await sleep(2800);
    ui.finaleShow('.f-nick', finale.nickname);
    audio.chime();
    document.title = "Petal's Birthday Adventure 🌸";
    document.getElementById('game-title').textContent = "Petal's Birthday Adventure";
    world.burst.spawn(center.clone().add(flowerPos), { count: 120, color: '#ffb3d9', speed: 5, life: 2.5, size: 0.5 });
    await sleep(5200);
    ui.finaleHide('.f-name'); ui.finaleHide('.f-nick');
    await sleep(1900);
    ui.finaleShow('.f-shayari', shayari.final.map((l) => `<p>${l}</p>`).join(''));
    camOrbit(1.4, 5.5, 2.0);
    await sleep(8200);
    ui.finaleHide('.f-shayari');
    await sleep(1900);
    // happy birthday!
    const wait = audio.happyBirthday(0.2);
    await sleep(Math.max(0, wait * 1000));
    ui.finaleShow('.f-bday', finale.birthday);
    player.override = null;
    player.play('Idle', 0.6);
    player.override = 'cine'; // she stays calm and graceful, no dance
    cam.cineGoalPos = new THREE.Vector3(center.x - 3, center.y + 3.6, center.z + 9.5);
    for (let i = 0; i < 4; i++) {
      world.burst.spawn(center.clone().add(new THREE.Vector3((Math.random() - 0.5) * 8, 4 + Math.random() * 4, (Math.random() - 0.5) * 6)),
        { count: 90, color: ['#ff8fc7', '#ffd27a', '#b99bff', '#9fe0ff'][i], speed: 5, life: 2.6, size: 0.55 });
      await sleep(900);
    }
    await sleep(4800);
    ui.finaleHide('.f-bday');
    await sleep(1900);
    await ui.waitLetterButton();
    ui.finaleEnd();
  }

  /** Five petals that open into one pink flower. */
  buildFlower() {
    // outer faces the camera; inner turns the flower's up-axis toward it; spinner rotates the blossom
    const group = new THREE.Group();
    const inner = new THREE.Group();
    inner.rotation.x = Math.PI / 2;
    const spinner = new THREE.Group();
    inner.add(spinner);
    group.add(inner);
    const pivots = [];
    const ring = (n, offset, color, scale, glow) => {
      for (let i = 0; i < n; i++) {
        const pivot = new THREE.Group();
        pivot.rotation.y = (i / n) * Math.PI * 2 + offset;
        const p = makePetal(this.g.assets, color(i), scale, glow);
        p.userData.outer = scale > 1;
        pivot.add(p);
        spinner.add(pivot);
        pivots.push(p);
      }
    };
    ring(5, 0, (i) => PETAL_COLORS[i], 1.25, 0.35);
    ring(5, Math.PI / 5, () => '#ff9fd0', 0.8, 0.3);
    const center = this.g.assets.clone('flower_center');
    center.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.emissive = new THREE.Color('#ffc94d'); o.material.emissiveIntensity = 1.2; } });
    spinner.add(center);
    const stamen = glowPoints(Array.from({ length: 30 }, () => [(Math.random() - 0.5) * 0.3, 0.1 + Math.random() * 0.15, (Math.random() - 0.5) * 0.3]).flat(), { color: '#ffe38a', size: 0.12, drift: 0.04 });
    spinner.add(stamen);
    const bloom = (k) => {
      pivots.forEach((p) => {
        const outer = p.userData.outer;
        const closed = 1.45, open = outer ? 0.22 : 0.6;
        p.rotation.x = closed + (open - closed) * k;
        p.scale.setScalar((outer ? 1.25 : 0.8) * (0.3 + 0.7 * k));
      });
      center.scale.setScalar(1.6 * k);
      group.scale.setScalar(0.35 + 0.4 * k);
    };
    bloom(0);
    return { group, spinner, bloom };
  }

  faceCamera() {
    if (this.flower) this.flower.group.lookAt(this.g.camera.position);
  }

  idle(t) {
    if (this.flower) this.faceCamera();
    if (this.spinFlower && this.flower) {
      this.flower.spinner.rotation.y = t * 0.4;
      this.flower.group.position.y = 3.05 + Math.sin(t * 1.5) * 0.08;
    }
  }
}
