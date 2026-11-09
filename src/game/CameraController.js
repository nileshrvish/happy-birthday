import * as THREE from 'three';

/** Smooth third-person orbit camera with ground avoidance and cinematic override. */
export class CameraController {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.yaw = 0;
    this.pitch = 0.32;
    this.dist = 6.5;
    this.distScale = 1;
    this.target = new THREE.Vector3();
    this.smoothTarget = new THREE.Vector3();
    this.cine = null; // {pos, look}
    this.cinePos = new THREE.Vector3();
    this.cineLook = new THREE.Vector3();
    this.blend = 0; // 0 = follow, 1 = cinematic
  }

  snap(target) {
    this.target.copy(target);
    this.smoothTarget.copy(target);
    this._place(1);
  }

  setCinematic(pos, look, instant = false) {
    this.cine = true;
    if (instant) { this.cinePos.copy(pos); this.cineLook.copy(look); this.blend = 1; }
    this.cineGoalPos = pos.clone();
    this.cineGoalLook = look.clone();
  }

  clearCinematic() { this.cine = null; }

  update(dt, inp, focus, moving, facingYaw) {
    if (inp) {
      this.yaw -= inp.look.x * 0.0038;
      this.pitch = THREE.MathUtils.clamp(this.pitch + inp.look.y * 0.0032, -0.15, 1.25);
      this.dist = THREE.MathUtils.clamp(this.dist + inp.zoom * 0.6, 3, 11);
      // gentle auto-follow behind the character when the player isn't steering the camera
      if (moving && performance.now() - inp.lastLookTime > 1800) {
        let d = facingYaw + Math.PI - this.yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        if (Math.abs(d) < 2.4) this.yaw += d * (1 - Math.exp(-0.9 * dt));
      }
    }
    this.target.copy(focus);
    this.smoothTarget.lerp(this.target, 1 - Math.exp(-9 * dt));
    if (this.cine) {
      this.blend = Math.min(1, this.blend + dt * 0.6);
      this.cinePos.lerp(this.cineGoalPos, 1 - Math.exp(-2.2 * dt));
      this.cineLook.lerp(this.cineGoalLook, 1 - Math.exp(-2.2 * dt));
    } else this.blend = Math.max(0, this.blend - dt * 0.8);
    this._place(dt);
  }

  _place() {
    const cp = Math.cos(this.pitch);
    const follow = new THREE.Vector3(
      this.smoothTarget.x + Math.sin(this.yaw) * cp * this.dist * this.distScale,
      this.smoothTarget.y + Math.sin(this.pitch) * this.dist * this.distScale,
      this.smoothTarget.z + Math.cos(this.yaw) * cp * this.dist * this.distScale,
    );
    const g = this.world.groundAt(follow.x, follow.z);
    if (g !== null && follow.y < g + 0.5) follow.y = g + 0.5;
    const look = this.smoothTarget.clone();
    if (this.blend > 0) {
      const b = this.blend * this.blend * (3 - 2 * this.blend);
      follow.lerp(this.cinePos, b);
      look.lerp(this.cineLook, b);
    }
    this.camera.position.copy(follow);
    this.camera.lookAt(look);
  }
}
