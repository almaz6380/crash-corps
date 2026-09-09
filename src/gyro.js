/**
 * Zielen mit dem Gyroskop. Gedacht als Feinzielen zusätzlich zum Wischen,
 * nicht als Ersatz – so machen es die großen Handy-Shooter auch.
 *
 * Gemessen wird die Drehrate (`DeviceMotionEvent.rotationRate`), nicht die
 * absolute Lage. Die Drehrate wirkt wie eine Maus: sie addiert sich auf den
 * Blick und hat keinen festen Bezugspunkt, der wegdriften könnte. Die absolute
 * Lage würde dagegen am Kompass hängen und ständig nachgestellt werden müssen.
 *
 * Achsen: Das Gerätesystem ist x nach rechts, y zur Oberkante, z aus dem
 * Bildschirm heraus – unabhängig davon, wie das Gerät gerade gehalten wird.
 * Daraus die Blickachsen zu gewinnen, braucht zwei Bezüge:
 *
 * - **Gieren** ist die Drehung um die Hochachse der Welt. Wo die liegt, verrät
 *   die Schwerkraft aus `accelerationIncludingGravity`. Deshalb funktioniert es
 *   auch, wenn das Gerät schräg gehalten wird – und genau so hält man es.
 * - **Nicken** ist die Drehung um die waagerechte Bildschirmachse. Wo die im
 *   Gerätesystem liegt, hängt an `screen.orientation.angle`.
 *
 * Die Vorzeichen sind der wacklige Teil: sie lassen sich nur auf echter Hardware
 * abschließend prüfen. Deshalb sind beide Achsen umkehrbar (`invertX`, `invertY`).
 */

const KEY = 'crashcorps.gyro';
const RAD = Math.PI / 180;

/** Voreinstellung. `staerke` 1 heißt: eine Handdrehung dreht den Blick genauso weit. */
const WERKS = { an: false, staerke: 1.0, invertX: false, invertY: false };

/** Sehr kleine Raten sind Sensorrauschen und würden den Blick zittern lassen. */
const RUHE = 0.015;    // Bogenmaß je Sekunde

export class Gyro {
  constructor() {
    this.einst = this._laden();
    this.laeuft = false;
    this.dyaw = 0; this.dpitch = 0;   // aufgelaufene Blickänderung im Bogenmaß
    this.letzte = 0;                  // Zeitstempel des letzten Ereignisses
    this.ereignisse = 0;              // für die Prüfung: kommen überhaupt Daten?
    this._onMotion = (e) => this._motion(e);
  }

  _laden() {
    try { return { ...WERKS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
    catch { return { ...WERKS }; }
  }
  _speichern() {
    try { localStorage.setItem(KEY, JSON.stringify(this.einst)); } catch { /* privater Modus */ }
  }

  /** Gibt es die Schnittstelle überhaupt? Am Rechner meist nicht. */
  static moeglich() { return typeof DeviceMotionEvent !== 'undefined'; }

  /** iOS verlangt eine ausdrückliche Erlaubnis, und zwar aus einer Nutzergeste. */
  static brauchtErlaubnis() {
    return typeof DeviceMotionEvent !== 'undefined'
      && typeof DeviceMotionEvent.requestPermission === 'function';
  }

  /**
   * Einschalten. Muss aus einer Nutzergeste heraus laufen, sonst lehnt iOS ab.
   * @returns {Promise<boolean>} ob es jetzt läuft
   */
  async einschalten() {
    if (!Gyro.moeglich()) return false;
    if (Gyro.brauchtErlaubnis()) {
      try {
        if (await DeviceMotionEvent.requestPermission() !== 'granted') return false;
      } catch { return false; }
    }
    if (!this.laeuft) {
      addEventListener('devicemotion', this._onMotion);
      this.laeuft = true;
      this.letzte = 0;
    }
    this.einst.an = true; this._speichern();
    return true;
  }

  ausschalten() {
    if (this.laeuft) { removeEventListener('devicemotion', this._onMotion); this.laeuft = false; }
    this.dyaw = 0; this.dpitch = 0;
    this.einst.an = false; this._speichern();
  }

  /** Umschalten. Gibt den neuen Zustand zurück. */
  async schalten() {
    if (this.einst.an) { this.ausschalten(); return false; }
    return this.einschalten();
  }

  /** Empfindlichkeit setzen (0.2 … 3). */
  staerke(v) {
    this.einst.staerke = Math.max(0.2, Math.min(3, v));
    this._speichern();
  }
  umkehren(achse, an) {
    this.einst[achse === 'x' ? 'invertX' : 'invertY'] = !!an;
    this._speichern();
  }

  /** Aufgelaufene Blickänderung im Bogenmaß abholen und zurücksetzen. */
  take() {
    const v = [this.dyaw, this.dpitch];
    this.dyaw = 0; this.dpitch = 0;
    return v;
  }

  /** Aufgelaufenes verwerfen – etwa wenn das Spiel pausiert war. */
  leeren() { this.dyaw = 0; this.dpitch = 0; }

  _motion(e) {
    const r = e.rotationRate;
    if (!r) return;
    this.ereignisse++;

    // Zeit seit dem letzten Ereignis. Die Rate kommt in Grad je Sekunde, es muss
    // also über die tatsächliche Lücke aufsummiert werden – die Taktrate der
    // Sensoren schwankt je nach Gerät zwischen etwa 20 und 120 Hz.
    const jetzt = performance.now();
    const dt = this.letzte ? Math.min(0.1, (jetzt - this.letzte) / 1000) : 0;
    this.letzte = jetzt;
    if (!dt) return;

    // Drehrate im Gerätesystem: beta um x, gamma um y, alpha um z
    const wx = (r.beta || 0) * RAD, wy = (r.gamma || 0) * RAD, wz = (r.alpha || 0) * RAD;

    // Hochachse aus der Schwerkraft. Der Sensor meldet die Gegenkraft, der
    // Vektor zeigt also nach oben. Fehlt er, wird das Gerät als flach angenommen.
    const g = e.accelerationIncludingGravity;
    let ux = 0, uy = 0, uz = 1;
    if (g && (g.x || g.y || g.z)) {
      const l = Math.hypot(g.x || 0, g.y || 0, g.z || 0) || 1;
      ux = (g.x || 0) / l; uy = (g.y || 0) / l; uz = (g.z || 0) / l;
    }
    const gier = wx * ux + wy * uy + wz * uz;

    // Waagerechte Bildschirmachse im Gerätesystem, abhängig von der Bildschirmdrehung
    const a = (screen.orientation?.angle ?? window.orientation ?? 0) * RAD;
    const nick = wx * Math.cos(a) - wy * Math.sin(a);

    const s = this.einst.staerke;
    if (Math.abs(gier) > RUHE) {
      this.dyaw += gier * dt * s * (this.einst.invertX ? -1 : 1);
    }
    if (Math.abs(nick) > RUHE) {
      this.dpitch -= nick * dt * s * (this.einst.invertY ? -1 : 1);
    }
  }
}
