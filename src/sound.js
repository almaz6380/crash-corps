import { LOW_END } from './device.js';

/**
 * Klang. Alles wird zur Laufzeit erzeugt (WebAudio-Oszillatoren und Rauschen),
 * es gibt keine Audiodateien. Das kostet keine Ladezeit, keinen Platz im
 * Offline-Speicher und lässt sich pro Waffe stimmen.
 *
 * Räumlich: Schüsse und Schritte der Bots laufen über `at(pos)` – Lautstärke
 * fällt mit der Entfernung, die Seite ergibt sich aus der Blickrichtung des
 * Spielers, und Entferntes wird dumpfer. Dafür meldet die Schleife jeden Frame
 * `listener(auge, gierwinkel)`.
 *
 * Der Ton startet erst nach einer Nutzergeste (Browserregel) – `resume()` hängt
 * am Klassen-Knopf.
 */

const KEY = 'crashcorps.ton';

/** Hörweite. Weiter entfernte Quellen werden gar nicht erst gebaut. */
const REICHWEITE = 46;

/** Klangfarbe je Waffe. Nur hier schrauben, wenn eine Waffe anders klingen soll. */
const SCHUSS = {
  shotgun: { dauer: 0.40, f0: 2600, f1: 130, korpus: [150, 44], knall: 0.85, laut: 1.00, hall: 0.55 },
  smg:     { dauer: 0.13, f0: 5200, f1: 700, korpus: [320, 120], knall: 0.45, laut: 0.50, hall: 0.20 },
  rifle:   { dauer: 0.30, f0: 8000, f1: 300, korpus: [220, 68], knall: 1.10, laut: 0.95, hall: 0.65 },
};

/** Spezialfähigkeit: Sturm und Hechtsprung rauschen, Fokus klingt. */
const SPEZIAL = { charge: 'wusch', dash: 'wusch', focus: 'ton' };

export class Sound {
  constructor() {
    this.ctx = null;
    this.an = this._laden();
    // Blickzustand des Spielers, für die Richtung der Weltklänge
    this.ohr = { x: 0, y: 0, z: 0, rx: 1, rz: 0 };
    this.stimmen = 0;              // laufende Klänge, gegen Übersteuern bei Dauerfeuer
  }

  _laden() {
    try { return localStorage.getItem(KEY) !== 'aus'; } catch { return true; }
  }

  /** Ton an/aus. Gibt den neuen Zustand zurück. */
  schalten(an = !this.an) {
    this.an = an;
    try { localStorage.setItem(KEY, an ? 'an' : 'aus'); } catch { /* privater Modus */ }
    if (this.ctx) this.master.gain.setTargetAtTime(an ? 0.9 : 0, this.ctx.currentTime, 0.02);
    return this.an;
  }

  /**
   * Baut den Audiokontext auf. Muss aus einer Nutzergeste heraus laufen, sonst
   * bleibt er in `suspended` und man hört nichts.
   */
  resume() {
    if (!this.ctx) this._aufbauen();
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  _aufbauen() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();

    // Begrenzer: bei Dauerfeuer summieren sich sonst die Spitzen zu Knacksen
    const komp = ctx.createDynamicsCompressor();
    komp.threshold.value = -12; komp.knee.value = 8; komp.ratio.value = 8;
    komp.attack.value = 0.003; komp.release.value = 0.18;

    this.master = ctx.createGain();
    this.master.gain.value = this.an ? 0.9 : 0;
    this.master.connect(komp).connect(ctx.destination);

    // Nachhall der Halle: gefaltetes, abklingendes Rauschen. Auf schwachen
    // Geräten kürzer, weil jede Faltung pro Abtastwert Rechenzeit kostet.
    this.hall = ctx.createConvolver();
    this.hall.buffer = this._hallfahne(LOW_END ? 0.26 : 0.5);
    this.hallGain = ctx.createGain();
    this.hallGain.gain.value = 0.5;
    this.hall.connect(this.hallGain).connect(this.master);

    this.rauschen = this._rauschband(2);
  }

  /** Zwei Sekunden weißes Rauschen als Vorrat für alle Rauschklänge. */
  _rauschband(sek) {
    const n = Math.floor(this.ctx.sampleRate * sek);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** Impulsantwort: Rauschen, das exponentiell ausklingt – reicht für einen Raumeindruck. */
  _hallfahne(sek) {
    const n = Math.floor(this.ctx.sampleRate * sek);
    const buf = this.ctx.createBuffer(2, n, this.ctx.sampleRate);
    for (let k = 0; k < 2; k++) {
      const d = buf.getChannelData(k);
      for (let i = 0; i < n; i++) {
        const t = i / n;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.6);
      }
    }
    return buf;
  }

  /** Position und Blickrichtung des Spielers – jeden Frame aus der Schleife. */
  listener(auge, gier) {
    this.ohr.x = auge.x; this.ohr.y = auge.y; this.ohr.z = auge.z;
    // Rechts-Vektor zur Blickrichtung; damit wird links/rechts entschieden
    this.ohr.rx = Math.cos(gier); this.ohr.rz = -Math.sin(gier);
  }

  /**
   * Ziel für einen Klang an einer Weltposition. Liefert den Eingang einer Kette
   * aus Tiefpass (Entfernung dämpft Höhen), Panorama und Lautstärke –
   * oder null, wenn die Quelle zu weit weg ist.
   */
  at(pos, laut = 1) {
    const ctx = this.ctx;
    if (!pos) {                                    // eigener Klang, ohne Ort
      const g = ctx.createGain(); g.gain.value = laut; g.connect(this.master);
      return { ein: g, aus: g, laut };
    }
    const dx = pos.x - this.ohr.x, dy = pos.y - this.ohr.y, dz = pos.z - this.ohr.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > REICHWEITE) return null;
    // Abfall wie bei einer Punktquelle, aber gedeckelt, damit Nahes nicht sticht
    const abfall = 1 / (1 + Math.pow(dist / 7, 1.7));
    const g = ctx.createGain();
    g.gain.value = laut * abfall;
    const pan = ctx.createStereoPanner();
    pan.pan.value = dist > 0.2
      ? Math.max(-0.92, Math.min(0.92, (dx * this.ohr.rx + dz * this.ohr.rz) / dist))
      : 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.max(1400, 18000 - dist * 330);   // Ferne klingt dumpf
    lp.connect(pan).connect(g).connect(this.master);
    return { ein: lp, aus: g, laut: laut * abfall };
  }

  /** Anteil eines Klangs in den Nachhall schicken. */
  _hallen(ziel, anteil) {
    if (!anteil || !this.hall) return;
    const s = this.ctx.createGain();
    s.gain.value = anteil * ziel.laut;
    ziel.aus.connect(s); s.connect(this.hall);
  }

  /** Gefilterter Rauschstoß. f0 → f1 ist der Filterverlauf über die Dauer. */
  _rausch(ziel, { dauer, f0, f1, typ = 'lowpass', q = 1, laut = 1, start = 0 }) {
    const ctx = this.ctx, t = ctx.currentTime + start;
    const src = ctx.createBufferSource();
    src.buffer = this.rauschen;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    // Zufälliger Einstieg, damit zwei Schüsse nie exakt gleich klingen
    const off = Math.random() * (this.rauschen.duration - dauer - 0.01);
    const f = ctx.createBiquadFilter();
    f.type = typ; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dauer);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(laut, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dauer);
    src.connect(f).connect(g).connect(ziel.ein);
    src.start(t, Math.max(0, off), dauer + 0.02);
    src.stop(t + dauer + 0.05);
    this._zaehlen(src);
  }

  /** Ton mit Tonhöhenverlauf f0 → f1. */
  _ton(ziel, { dauer, f0, f1 = f0, form = 'sine', laut = 1, start = 0 }) {
    const ctx = this.ctx, t = ctx.currentTime + start;
    const o = ctx.createOscillator();
    o.type = form;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dauer);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(laut, t + Math.min(0.012, dauer * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dauer);
    o.connect(g).connect(ziel.ein);
    o.start(t); o.stop(t + dauer + 0.03);
    this._zaehlen(o);
  }

  _zaehlen(node) {
    this.stimmen++;
    node.onended = () => { this.stimmen--; node.disconnect(); };
  }

  /** Läuft der Ton gerade? Jeder Klang fragt das zuerst. */
  _bereit() {
    // 40 gleichzeitige Stimmen reichen für fünf Bots im Dauerfeuer; darüber
    // würde es auf dem Handy ohnehin nur noch matschen.
    return this.an && this.ctx && this.ctx.state === 'running' && this.stimmen < 40;
  }

  // ---------------------------------------------------------------- Klänge

  /** Schuss. `pos` weglassen für die eigene Waffe. */
  schuss(waffe, pos) {
    if (!this._bereit()) return;
    const s = SCHUSS[waffe] || SCHUSS.smg;
    const ziel = this.at(pos, s.laut);
    if (!ziel) return;
    // Anriss: kurzer heller Knall vorneweg
    this._rausch(ziel, { dauer: 0.03, f0: 7000, f1: 3000, typ: 'highpass', laut: 0.5 * s.knall });
    // Körper: breiter Rauschstoß, dessen Filter nach unten fährt
    this._rausch(ziel, { dauer: s.dauer, f0: s.f0, f1: s.f1, laut: 0.9 });
    // Druck: tiefer Ton, der sackt
    this._ton(ziel, { dauer: s.dauer * 0.55, f0: s.korpus[0], f1: s.korpus[1], form: 'triangle', laut: 0.6 });
    this._hallen(ziel, s.hall);
  }

  /** Eigener Treffer am Gegner: kurzer heller Tick. */
  treffer() {
    if (!this._bereit()) return;
    const z = this.at(null, 0.5);
    this._ton(z, { dauer: 0.05, f0: 1750, f1: 1500, form: 'triangle', laut: 0.6 });
  }

  /** Einschlag im Körper eines Bots – dumpf, am Ort des Bots. */
  koerpertreffer(pos) {
    if (!this._bereit()) return;
    const z = this.at(pos, 0.55);
    if (!z) return;
    this._rausch(z, { dauer: 0.09, f0: 1100, f1: 260, laut: 0.7 });
    this._ton(z, { dauer: 0.11, f0: 190, f1: 90, laut: 0.4 });
  }

  /** Umfallende Figur. */
  sturz(pos) {
    if (!this._bereit()) return;
    const z = this.at(pos, 0.6);
    if (!z) return;
    this._rausch(z, { dauer: 0.28, f0: 700, f1: 90, laut: 0.7, start: 0.28 });
    this._ton(z, { dauer: 0.2, f0: 120, f1: 48, laut: 0.5, start: 0.28 });
  }

  /** Eigener Abschuss: kurzes Aufsteigen. */
  abschuss() {
    if (!this._bereit()) return;
    const z = this.at(null, 0.45);
    this._ton(z, { dauer: 0.07, f0: 700, form: 'triangle', laut: 0.5 });
    this._ton(z, { dauer: 0.07, f0: 1050, form: 'triangle', laut: 0.5, start: 0.07 });
    this._ton(z, { dauer: 0.12, f0: 1400, form: 'triangle', laut: 0.45, start: 0.14 });
  }

  /** Selbst getroffen. */
  schmerz() {
    if (!this._bereit()) return;
    const z = this.at(null, 0.7);
    this._rausch(z, { dauer: 0.12, f0: 900, f1: 200, laut: 0.5 });
    this._ton(z, { dauer: 0.26, f0: 210, f1: 85, laut: 0.45 });
  }

  /** Eigener Tod. */
  tod() {
    if (!this._bereit()) return;
    const z = this.at(null, 0.8);
    this._ton(z, { dauer: 0.8, f0: 320, f1: 55, form: 'sawtooth', laut: 0.35 });
    this._rausch(z, { dauer: 0.5, f0: 1200, f1: 120, laut: 0.4 });
  }

  /** Nachladen: Griff und Klacken. `ende` ist der zweite Teil, wenn es sitzt. */
  nachladen(ende = false) {
    if (!this._bereit()) return;
    const z = this.at(null, 0.42);
    if (ende) {
      this._rausch(z, { dauer: 0.05, f0: 2600, f1: 900, typ: 'bandpass', q: 2, laut: 0.55 });
      this._ton(z, { dauer: 0.07, f0: 170, f1: 80, laut: 0.35 });
    } else {
      this._rausch(z, { dauer: 0.03, f0: 3000, f1: 1600, typ: 'bandpass', q: 1.4, laut: 0.85 });
      this._rausch(z, { dauer: 0.06, f0: 1400, f1: 500, typ: 'bandpass', q: 1.2, laut: 0.8, start: 0.1 });
    }
  }

  /** Schritt. Ohne `pos` der eigene, sonst der eines Bots. */
  schritt(pos, rennen = false) {
    if (!this._bereit()) return;
    const z = this.at(pos, pos ? 0.6 : 0.5);
    if (!z) return;
    this._rausch(z, {
      dauer: rennen ? 0.09 : 0.07,
      f0: 1300 + Math.random() * 500, f1: 260,
      typ: 'bandpass', q: 0.9, laut: rennen ? 1.0 : 0.75,
    });
  }

  /** Aufkommen nach einem Sprung. `wucht` 0..1. */
  landung(wucht = 1) {
    if (!this._bereit()) return;
    const z = this.at(null, 0.4 + wucht * 0.4);
    this._rausch(z, { dauer: 0.14, f0: 900, f1: 130, laut: 0.7 });
    this._ton(z, { dauer: 0.16, f0: 140, f1: 55, laut: 0.5 });
  }

  /** Spezialfähigkeit ausgelöst. */
  spezial(art) {
    if (!this._bereit()) return;
    const z = this.at(null, 0.6);
    if (SPEZIAL[art] === 'ton') {
      this._ton(z, { dauer: 0.4, f0: 420, f1: 950, form: 'triangle', laut: 0.35 });
      this._ton(z, { dauer: 0.4, f0: 630, f1: 1420, form: 'sine', laut: 0.18 });
    } else {
      this._rausch(z, { dauer: 0.34, f0: 400, f1: 3200, typ: 'bandpass', q: 1.4, laut: 0.6 });
      this._ton(z, { dauer: 0.3, f0: 180, f1: 420, laut: 0.25 });
    }
  }

  /** Knopfdruck im Menü. */
  klick() {
    if (!this._bereit()) return;
    const z = this.at(null, 0.4);
    this._ton(z, { dauer: 0.04, f0: 900, f1: 700, form: 'triangle', laut: 0.5 });
    this._rausch(z, { dauer: 0.03, f0: 4000, f1: 1500, typ: 'bandpass', q: 2, laut: 0.25 });
  }
}
