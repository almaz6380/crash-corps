import { TOUCH } from './device.js';

/**
 * Eingabe-Schicht. Bündelt Tastatur, Maus und Touch zu einem Zustand, den der
 * Spieler jeden Frame abfragt – dadurch kennt player.js keine Eingabegeräte.
 *
 * Dauerzustände: moveX/moveY, fire, sprint, jump.
 * Flanken (einmal je Druck): reload, special, menu – über take…() abzuholen.
 */
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = {};
    this.stickX = 0; this.stickY = 0;      // Touch-Stick
    this.lookX = 0; this.lookY = 0;        // aufgelaufene Blickänderung
    this.fireHeld = false; this.jumpHeld = false; this.sprintHeld = false;
    this._reload = false; this._special = false; this._menu = false;
    this.touch = TOUCH ? new TouchControls(this) : null;
    this._bind();
  }

  _bind() {
    this._onKeyDown = (e) => {
      this.keys[e.code] = true;
      if (e.code === 'KeyR') this._reload = true;
      if (e.code === 'KeyQ') this._special = true;
      if (e.code === 'Escape') this._menu = true;
    };
    this._onKeyUp = (e) => { this.keys[e.code] = false; };
    this._onMouseMove = (e) => {
      if (document.pointerLockElement !== this.canvas) return;
      this.lookX += e.movementX; this.lookY += e.movementY;
    };
    this._onDown = (e) => { if (e.button === 0) this.fireHeld = true; };
    this._onUp = (e) => { if (e.button === 0) this.fireHeld = false; };
    addEventListener('keydown', this._onKeyDown);
    addEventListener('keyup', this._onKeyUp);
    addEventListener('mousemove', this._onMouseMove);
    if (!TOUCH) { addEventListener('mousedown', this._onDown); addEventListener('mouseup', this._onUp); }
  }

  dispose() {
    removeEventListener('keydown', this._onKeyDown);
    removeEventListener('keyup', this._onKeyUp);
    removeEventListener('mousemove', this._onMouseMove);
    removeEventListener('mousedown', this._onDown);
    removeEventListener('mouseup', this._onUp);
    this.touch?.dispose();
  }

  /** Bewegung: Touch-Stick hat Vorrang, sonst WASD. y positiv = vorwärts. */
  get moveX() { return this.stickX || (this.keys.KeyD ? 1 : 0) - (this.keys.KeyA ? 1 : 0); }
  get moveY() { return this.stickY || (this.keys.KeyW ? 1 : 0) - (this.keys.KeyS ? 1 : 0); }
  get fire() { return this.fireHeld; }
  get jump() { return this.jumpHeld || !!this.keys.Space; }
  /** Sprint: Umschalttaste oder Stick ganz ausgelenkt. */
  get sprint() { return this.sprintHeld || !!this.keys.ShiftLeft || Math.hypot(this.stickX, this.stickY) > 0.85; }

  /** Blickänderung seit dem letzten Abruf, in Pixeln. */
  takeLook() { const v = [this.lookX, this.lookY]; this.lookX = 0; this.lookY = 0; return v; }
  takeReload() { const v = this._reload; this._reload = false; return v; }
  takeSpecial() { const v = this._special; this._special = false; return v; }
  takeMenu() { const v = this._menu; this._menu = false; return v; }

  /** Touch-Bedienung ein-/ausblenden (nur während des Matches sichtbar). */
  showTouch(on) { this.touch?.show(on); }
}

/**
 * Bildschirm-Bedienung: links ein Stick, der dort erscheint, wo der Daumen
 * aufsetzt; rechts eine Fläche zum Umsehen; dazu vier Schaltflächen.
 * Mehrere Finger gleichzeitig über Pointer-Events, jeder Finger mit eigener Id.
 */
class TouchControls {
  constructor(input) {
    this.input = input;
    this.stickId = null; this.lookId = null;
    this.origin = { x: 0, y: 0 };

    const el = document.createElement('div');
    el.id = 'touch';
    el.hidden = true;
    el.innerHTML = `
      <div id="t-move"><div id="t-stick" hidden><div id="t-knob"></div></div></div>
      <div id="t-look"></div>
      <div id="t-buttons">
        <button id="t-special" type="button">Q</button>
        <button id="t-reload" type="button">R</button>
        <button id="t-jump" type="button">⤒</button>
        <button id="t-fire" type="button">FEUER</button>
      </div>`;
    document.body.append(el);
    this.el = el;
    this.stick = el.querySelector('#t-stick');
    this.knob = el.querySelector('#t-knob');

    const move = el.querySelector('#t-move');
    const look = el.querySelector('#t-look');
    const RADIUS = 62;

    this._onDown = (e) => {
      const inMove = move.contains(e.target) || e.target === move;
      if (inMove && this.stickId === null) {
        this.stickId = e.pointerId;
        this.origin = { x: e.clientX, y: e.clientY };
        this.stick.hidden = false;
        this.stick.style.left = `${e.clientX}px`;
        this.stick.style.top = `${e.clientY}px`;
        this.knob.style.transform = 'translate(-50%,-50%)';
      } else if ((look.contains(e.target) || e.target === look) && this.lookId === null) {
        this.lookId = e.pointerId;
        this.lastLook = { x: e.clientX, y: e.clientY };
      } else return;
      e.preventDefault();
    };
    this._onMove = (e) => {
      if (e.pointerId === this.stickId) {
        const dx = e.clientX - this.origin.x, dy = e.clientY - this.origin.y;
        const len = Math.hypot(dx, dy) || 1;
        const k = Math.min(1, len / RADIUS);
        this.input.stickX = (dx / len) * k;
        this.input.stickY = -(dy / len) * k;          // Bildschirm-Y ist unten positiv
        this.knob.style.transform =
          `translate(calc(-50% + ${(dx / len) * k * RADIUS}px), calc(-50% + ${(dy / len) * k * RADIUS}px))`;
        e.preventDefault();
      } else if (e.pointerId === this.lookId) {
        this.input.lookX += e.clientX - this.lastLook.x;
        this.input.lookY += e.clientY - this.lastLook.y;
        this.lastLook = { x: e.clientX, y: e.clientY };
        e.preventDefault();
      }
    };
    this._onUp = (e) => {
      if (e.pointerId === this.stickId) {
        this.stickId = null; this.input.stickX = 0; this.input.stickY = 0;
        this.stick.hidden = true;
      } else if (e.pointerId === this.lookId) this.lookId = null;
    };
    addEventListener('pointerdown', this._onDown, { passive: false });
    addEventListener('pointermove', this._onMove, { passive: false });
    addEventListener('pointerup', this._onUp);
    addEventListener('pointercancel', this._onUp);

    const hold = (id, set) => {
      const b = el.querySelector(id);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); set(true); b.classList.add('on'); });
      for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
        b.addEventListener(ev, () => { set(false); b.classList.remove('on'); });
      }
    };
    hold('#t-fire', (v) => { this.input.fireHeld = v; });
    hold('#t-jump', (v) => { this.input.jumpHeld = v; });
    const tap = (id, fn) => el.querySelector(id).addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation(); fn();
    });
    tap('#t-reload', () => { this.input._reload = true; });
    tap('#t-special', () => { this.input._special = true; });
  }

  show(on) { this.el.hidden = !on; if (!on) { this.input.stickX = this.input.stickY = 0; this.stick.hidden = true; } }

  dispose() {
    removeEventListener('pointerdown', this._onDown);
    removeEventListener('pointermove', this._onMove);
    removeEventListener('pointerup', this._onUp);
    removeEventListener('pointercancel', this._onUp);
    this.el.remove();
  }
}
