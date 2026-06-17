/* ═══════════════════════════════════════════════════════════════
   INPUT — front-end. Keyboard + floating virtual joystick. Produces
   a {x, z} move vector each frame and fires a pause callback.
   ═══════════════════════════════════════════════════════════════ */

const JOY_R = 50; // max knob travel in px

export const input = {
  isTouch: matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window),
  _keys: {},
  _touch: { active: false, id: null, baseX: 0, baseY: 0, dx: 0, dz: 0 },
  _move: { x: 0, z: 0 },
  _joy: null, _knob: null,

  init({ onPause, canMove }) {
    this._joy = document.getElementById('joystick');
    this._knob = document.getElementById('joystick-knob');
    this._canvas = document.querySelector('canvas');

    window.addEventListener('keydown', e => {
      this._keys[e.code] = true;
      if (e.code === 'Escape' || e.code === 'KeyP') onPause();
    });
    window.addEventListener('keyup', e => { this._keys[e.code] = false; });

    window.addEventListener('touchstart', e => {
      if (!canMove()) return;
      for (const t of e.changedTouches) {
        // Only the canvas drives the joystick — touching a UI control (pause
        // button, camera slider, cards) targets that element and is ignored,
        // so adjusting the camera never walks the player.
        if (t.target !== this._canvas) continue;
        if (this._touch.id === null) { this._joyStart(t.clientX, t.clientY, t.identifier); break; }
      }
    }, { passive: true });
    window.addEventListener('touchmove', e => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._touch.id) { this._joyMove(t.clientX, t.clientY); break; }
      }
    }, { passive: true });
    window.addEventListener('touchend', e => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._touch.id) { this.reset(); break; }
      }
    }, { passive: true });
    window.addEventListener('touchcancel', () => this.reset(), { passive: true });

    document.getElementById('pause-btn').addEventListener('click', onPause);
    // Tapping the pause overlay resumes (no keyboard needed on mobile).
    document.getElementById('pause-screen').addEventListener('click', onPause);
  },

  // Fill and return the current move vector (keyboard + joystick combined).
  sample() {
    const k = this._keys;
    let x = 0, z = 0;
    if (k['KeyW'] || k['ArrowUp']) z -= 1;
    if (k['KeyS'] || k['ArrowDown']) z += 1;
    if (k['KeyA'] || k['ArrowLeft']) x -= 1;
    if (k['KeyD'] || k['ArrowRight']) x += 1;
    if (this._touch.active) { x += this._touch.dx; z += this._touch.dz; }
    this._move.x = x; this._move.z = z;
    return this._move;
  },

  reset() {
    this._touch.active = false; this._touch.id = null;
    this._touch.dx = 0; this._touch.dz = 0;
    if (this._joy) this._joy.style.display = 'none';
  },

  _joyStart(x, y, id) {
    const t = this._touch;
    t.active = true; t.id = id; t.baseX = x; t.baseY = y; t.dx = 0; t.dz = 0;
    this._joy.style.left = x + 'px';
    this._joy.style.top = y + 'px';
    this._joy.style.display = 'block';
    this._knob.style.transform = 'translate(-50%, -50%)';
  },
  _joyMove(x, y) {
    const t = this._touch;
    const dx = x - t.baseX, dy = y - t.baseY;
    const len = Math.hypot(dx, dy) || 1;
    const clamped = Math.min(len, JOY_R);
    const nx = dx / len, ny = dy / len;
    t.dx = nx * (clamped / JOY_R);
    t.dz = ny * (clamped / JOY_R);
    this._knob.style.transform =
      `translate(calc(-50% + ${nx * clamped}px), calc(-50% + ${ny * clamped}px))`;
  },
};
