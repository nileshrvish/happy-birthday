// Unified keyboard / mouse / touch input.
export const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.move = { x: 0, y: 0 };
    this.look = { x: 0, y: 0 };
    this.zoom = 0;
    this.jump = false;
    this.interact = false;
    this.walk = false;
    this.enabled = false;
    this.lastLookTime = 0;
    this.joy = { id: null, x: 0, y: 0 };
    this.lookTouch = null;
    this._bindKeyboard();
    this._bindMouse();
    if (isTouch) this._bindTouch();
  }

  _bindKeyboard() {
    addEventListener('keydown', (e) => {
      if (e.repeat) { if (e.code === 'Space') e.preventDefault(); return; }
      this.keys.add(e.code);
      if (e.code === 'Space') { this.jump = true; e.preventDefault(); }
      if (e.code === 'KeyE' || e.code === 'Enter') this.interact = true;
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  _bindMouse() {
    const c = this.canvas;
    let dragging = false;
    c.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      dragging = true;
      if (document.pointerLockElement !== c && c.requestPointerLock) {
        try { const p = c.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (_) { /* ignore */ }
      }
    });
    addEventListener('mouseup', () => (dragging = false));
    addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (document.pointerLockElement === c || dragging) {
        this.look.x += e.movementX;
        this.look.y += e.movementY;
        this.lastLookTime = performance.now();
      }
    });
    c.addEventListener('wheel', (e) => { this.zoom += Math.sign(e.deltaY); }, { passive: true });
  }

  releasePointer() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  _bindTouch() {
    const joy = document.getElementById('joy');
    const knob = document.getElementById('joy-knob');
    const R = 50;
    const setKnob = (x, y) => (knob.style.transform = `translate(${x * R}px, ${y * R}px)`);
    const joyMove = (t) => {
      const r = joy.getBoundingClientRect();
      let x = (t.clientX - (r.left + r.width / 2)) / R;
      let y = (t.clientY - (r.top + r.height / 2)) / R;
      const l = Math.hypot(x, y);
      if (l > 1) { x /= l; y /= l; }
      this.joy.x = x; this.joy.y = y;
      setKnob(x, y);
    };
    joy.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      this.joy.id = t.identifier;
      joyMove(t);
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joy.id) { this.joy.id = null; this.joy.x = this.joy.y = 0; setKnob(0, 0); }
        if (this.lookTouch && t.identifier === this.lookTouch.id) this.lookTouch = null;
      }
    };
    addEventListener('touchend', end);
    addEventListener('touchcancel', end);
    addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joy.id) joyMove(t);
        else if (this.lookTouch && t.identifier === this.lookTouch.id) {
          this.look.x += (t.clientX - this.lookTouch.x) * 1.6;
          this.look.y += (t.clientY - this.lookTouch.y) * 1.6;
          this.lookTouch.x = t.clientX; this.lookTouch.y = t.clientY;
          this.lastLookTime = performance.now();
        }
      }
    }, { passive: true });
    this.canvas.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) if (!this.lookTouch) this.lookTouch = { id: t.identifier, x: t.clientX, y: t.clientY };
    }, { passive: true });
    const tap = (id, fn) => document.getElementById(id).addEventListener('touchstart', (e) => { e.preventDefault(); fn(); }, { passive: false });
    tap('btn-jump', () => (this.jump = true));
    tap('btn-act', () => (this.interact = true));
  }

  /** Called once per frame; returns a snapshot and clears edge-triggered events. */
  poll() {
    const k = this.keys;
    let x = 0, y = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    let mag = Math.hypot(x, y);
    if (mag > 1) { x /= mag; y /= mag; }
    let walk = k.has('ShiftLeft') || k.has('ShiftRight');
    if (this.joy.id !== null) {
      x = this.joy.x; y = -this.joy.y;
      mag = Math.hypot(x, y);
      walk = mag < 0.65;
      if (mag < 0.12) { x = y = 0; }
    }
    const out = {
      move: { x, y }, walk,
      look: { ...this.look }, zoom: this.zoom,
      jump: this.jump && this.enabled, interact: this.interact && this.enabled,
      lastLookTime: this.lastLookTime,
    };
    this.look.x = this.look.y = 0;
    this.zoom = 0;
    this.jump = this.interact = false;
    if (!this.enabled) { out.move.x = out.move.y = 0; }
    return out;
  }
}
