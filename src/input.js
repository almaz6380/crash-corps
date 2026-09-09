import { TOUCH } from './device.js';
import { Gyro } from './gyro.js';

/**
 * Eingabe-Schicht. Bündelt Tastatur, Maus und Touch zu einem Zustand, den der
 * Spieler jeden Frame abfragt – dadurch kennt player.js keine Eingabegeräte.
 *
 * Blick kommt aus zwei Quellen: Maus/Wischen in Pixeln (`takeLook`) und
 * Gyroskop im Bogenmaß (`takeGyro`). Getrennt, weil das eine noch mit der
 * Empfindlichkeit multipliziert wird und das andere schon ein Winkel ist.
 *
 * Dauerzustände: moveX/moveY, fire, sprint, jump.
 * Flanken (einmal je Druck): reload, special, menu, mute – über take…() abzuholen.
 */
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = {};
    this.stickX = 0; this.stickY = 0;      // Touch-Stick
    this.lookX = 0; this.lookY = 0;        // aufgelaufene Blickänderung
    this.fireHeld = false; this.jumpHeld = false; this.sprintHeld = false;
    this._reload = false; this._special = false; this._menu = false; this._mute = false;
    // Gyro vor der Touch-Bedienung: deren Anpassen-Bildschirm greift beim Aufbau
    // schon auf die Gyro-Einstellungen zu.
    this.gyro = new Gyro();
    this.touch = TOUCH ? new TouchControls(this) : null;
    // War es zuletzt an, gleich wieder anschalten. Auf iOS scheitert das ohne
    // Nutzergeste stillschweigend – dort hilft der Knopf im Menü.
    if (this.gyro.einst.an) this.gyro.einschalten().catch(() => {});
    this._bind();
  }

  _bind() {
    this._onKeyDown = (e) => {
      this.keys[e.code] = true;
      if (e.code === 'KeyR') this._reload = true;
      if (e.code === 'KeyQ') this._special = true;
      if (e.code === 'Escape') this._menu = true;
      if (e.code === 'KeyM') this._mute = true;
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
    this.gyro.ausschalten();
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
  /** Blickänderung aus dem Gyroskop, in Bogenmaß. */
  takeGyro() { return this.gyro.take(); }
  takeReload() { const v = this._reload; this._reload = false; return v; }
  takeSpecial() { const v = this._special; this._special = false; return v; }
  takeMenu() { const v = this._menu; this._menu = false; return v; }
  takeMute() { const v = this._mute; this._mute = false; return v; }

  /** Touch-Bedienung ein-/ausblenden (nur während des Matches sichtbar). */
  showTouch(on) { this.touch?.show(on); }
}

const LAYOUT_KEY = 'crashcorps.touchLayout';

/** Anordnung ab Werk. x/y sind Anteile der Bildschirmgröße (Mittelpunkt). */
const DEFAULT_LAYOUT = {
  fire:    { x: 0.905, y: 0.775, size: 108 },
  jump:    { x: 0.775, y: 0.815, size: 68 },
  reload:  { x: 0.935, y: 0.545, size: 68 },
  special: { x: 0.805, y: 0.545, size: 68 },
  stick:   { x: 0.16, y: 0.72, size: 148 },
};

function loadLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}');
    const out = {};
    for (const [k, v] of Object.entries(DEFAULT_LAYOUT)) out[k] = { ...v, ...(saved[k] || {}) };
    return out;
  } catch { return structuredClone(DEFAULT_LAYOUT); }
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
        <button id="t-special" type="button" data-key="special">Q</button>
        <button id="t-reload" type="button" data-key="reload">R</button>
        <button id="t-jump" type="button" data-key="jump">⤒</button>
        <button id="t-fire" type="button" data-key="fire">FEUER</button>
      </div>
      <div id="t-edit" hidden>
        <div id="t-edit-bar">
          <span id="t-edit-name">Knopf antippen</span>
          <input id="t-edit-size" type="range" min="44" max="180" step="2" disabled />
          <button id="t-edit-reset" type="button">Zurücksetzen</button>
          <button id="t-edit-done" type="button">Fertig</button>
          <div id="t-gyro">
            <b>Gyroskop</b>
            <label>Stärke <input id="gyro-staerke" type="range" min="0.2" max="3" step="0.1"></label>
            <label><input id="gyro-x" type="checkbox"> X</label>
            <label><input id="gyro-y" type="checkbox"> Y</label>
          </div>
        </div>
        <p id="t-edit-hint">Knopf ziehen zum Verschieben · antippen und Regler für die Größe</p>
      </div>`;
    document.body.append(el);
    this.el = el;
    this.stick = el.querySelector('#t-stick');
    this.knob = el.querySelector('#t-knob');
    this.layout = loadLayout();
    this.editing = false; this.selected = null;
    this.buttons = [...el.querySelectorAll('#t-buttons button')];
    this.applyLayout();
    this._bindEditor(el);

    const move = el.querySelector('#t-move');
    const look = el.querySelector('#t-look');
    const radius = () => this.layout.stick.size * 0.42;

    this._onDown = (e) => {
      if (this.editing) return;                       // im Bearbeitungsmodus keine Spieleingabe
      const inMove = move.contains(e.target) || e.target === move;
      if (inMove && this.stickId === null) {
        this.stickId = e.pointerId;
        this.origin = { x: e.clientX, y: e.clientY };
        this.stick.hidden = false;
        this.stick.style.width = this.stick.style.height = `${this.layout.stick.size}px`;
        this.stick.style.margin = `${-this.layout.stick.size / 2}px 0 0 ${-this.layout.stick.size / 2}px`;
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
      if (this.editing) return;
      if (e.pointerId === this.stickId) {
        const dx = e.clientX - this.origin.x, dy = e.clientY - this.origin.y;
        const len = Math.hypot(dx, dy) || 1;
        const k = Math.min(1, len / radius());
        this.input.stickX = (dx / len) * k;
        this.input.stickY = -(dy / len) * k;          // Bildschirm-Y ist unten positiv
        this.knob.style.transform =
          `translate(calc(-50% + ${(dx / len) * k * radius()}px), calc(-50% + ${(dy / len) * k * radius()}px))`;
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
      b.addEventListener('pointerdown', (e) => {
        if (this.editing) return;
        e.preventDefault(); e.stopPropagation(); set(true); b.classList.add('on');
      });
      for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
        b.addEventListener(ev, () => { set(false); b.classList.remove('on'); });
      }
    };
    hold('#t-fire', (v) => { this.input.fireHeld = v; });
    hold('#t-jump', (v) => { this.input.jumpHeld = v; });
    const tap = (id, fn) => el.querySelector(id).addEventListener('pointerdown', (e) => {
      if (this.editing) return;
      e.preventDefault(); e.stopPropagation(); fn();
    });
    tap('#t-reload', () => { this.input._reload = true; });
    tap('#t-special', () => { this.input._special = true; });
  }

  /** Anordnung auf die Schaltflächen schreiben. */
  applyLayout() {
    for (const b of this.buttons) {
      const l = this.layout[b.dataset.key];
      b.style.left = `${l.x * 100}%`;
      b.style.top = `${l.y * 100}%`;
      b.style.width = b.style.height = `${l.size}px`;
      b.style.fontSize = `${Math.max(11, Math.round(l.size * (b.dataset.key === 'fire' ? 0.16 : 0.32)))}px`;
    }
    const gs = this.el.querySelector('#t-ghost');
    if (gs) {
      gs.style.left = `${this.layout.stick.x * 100}%`;
      gs.style.top = `${this.layout.stick.y * 100}%`;
      gs.style.width = gs.style.height = `${this.layout.stick.size}px`;
    }
  }

  saveLayout() { try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(this.layout)); } catch { /* Speicher gesperrt */ } }

  /** Bearbeitungsmodus: Schaltflächen ziehen und in der Größe ändern. */
  edit(on) {
    this.editing = on;
    this.el.hidden = false;
    this.el.classList.toggle('editing', on);
    this.el.querySelector('#t-edit').hidden = !on;
    if (on) this.select(null); else { this.saveLayout(); this.el.hidden = true; }
  }

  select(key) {
    this.selected = key;
    for (const b of this.buttons) b.classList.toggle('sel', b.dataset.key === key);
    this.el.querySelector('#t-ghost')?.classList.toggle('sel', key === 'stick');
    const name = { fire: 'Feuer', jump: 'Springen', reload: 'Nachladen', special: 'Spezial', stick: 'Stick' }[key];
    this.el.querySelector('#t-edit-name').textContent = name || 'Knopf antippen';
    const slider = this.el.querySelector('#t-edit-size');
    slider.disabled = !key;
    if (key) slider.value = this.layout[key].size;
  }

  _bindEditor(el) {
    // Geisterbild des Sticks, damit auch seine Größe einstellbar ist
    const ghost = document.createElement('div');
    ghost.id = 't-ghost'; ghost.dataset.key = 'stick';
    el.append(ghost);
    this.applyLayout();

    let drag = null;
    const targets = () => [...this.buttons, ghost];
    el.addEventListener('pointerdown', (e) => {
      if (!this.editing) return;
      const t = targets().find((b) => b === e.target || b.contains(e.target));
      if (!t) return;
      e.preventDefault(); e.stopPropagation();
      this.select(t.dataset.key);
      const r = t.getBoundingClientRect();
      drag = { key: t.dataset.key, id: e.pointerId, dx: e.clientX - (r.left + r.width / 2), dy: e.clientY - (r.top + r.height / 2) };
    }, true);
    addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const l = this.layout[drag.key];
      const pad = l.size / 2;
      l.x = Math.min(1, Math.max(0, (e.clientX - drag.dx) / innerWidth));
      l.y = Math.min(1, Math.max(0, (e.clientY - drag.dy) / innerHeight));
      // in den sichtbaren Bereich zwingen
      l.x = Math.min(1 - pad / innerWidth, Math.max(pad / innerWidth, l.x));
      l.y = Math.min(1 - pad / innerHeight, Math.max(pad / innerHeight, l.y));
      this.applyLayout();
    });
    addEventListener('pointerup', () => { if (drag) { drag = null; this.saveLayout(); } });

    el.querySelector('#t-edit-size').addEventListener('input', (e) => {
      if (!this.selected) return;
      this.layout[this.selected].size = +e.target.value;
      this.applyLayout(); this.saveLayout();
    });
    el.querySelector('#t-edit-reset').addEventListener('click', () => {
      this.layout = structuredClone(DEFAULT_LAYOUT);
      this.applyLayout(); this.saveLayout(); this.select(this.selected);
    });
    el.querySelector('#t-edit-done').addEventListener('click', () => this.onDone?.());
    // Gyro-Einstellungen sitzen hier, weil das Menü im Querformat randvoll ist
    const g = this.input.gyro;
    const st = el.querySelector('#gyro-staerke'), ix = el.querySelector('#gyro-x'), iy = el.querySelector('#gyro-y');
    st.value = g.einst.staerke; ix.checked = g.einst.invertX; iy.checked = g.einst.invertY;
    st.addEventListener('input', (e) => g.staerke(+e.target.value));
    ix.addEventListener('change', (e) => g.umkehren('x', e.target.checked));
    iy.addEventListener('change', (e) => g.umkehren('y', e.target.checked));
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
