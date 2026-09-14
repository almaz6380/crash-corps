/**
 * Zielen mit dem Gyroskop. Gedacht als Feinzielen zusätzlich zum Wischen,
 * nicht als Ersatz – so machen es die großen Handy-Shooter auch.
 *
 * Gemessen wird die Drehrate (`DeviceMotionEvent.rotationRate`), nicht die
 * absolute Lage. Die Drehrate wirkt wie eine Maus: sie addiert sich auf den
 * Blick und hat keinen festen Bezugspunkt, der wegdriften könnte.
 *
 * **Die Achsen werden kalibriert, nicht hergeleitet.** Drei Versuche, die
 * Blickachsen aus Spezifikation, Schwerkraft und Bildschirmdrehung abzuleiten,
 * sind auf echter Hardware gescheitert – die Sensoren melden je nach Gerät in
 * anderen Achsen und mit anderen Vorzeichen, als die Spezifikation behauptet.
 * Deshalb macht der Spieler beim Einschalten zwei Bewegungen: einmal das Gerät
 * nach links drehen, einmal nach oben kippen. Die dabei aufsummierte Drehung
 * ergibt je einen Vektor im Gerätesystem, und diese zwei Vektoren *sind* die
 * Gier- und Nickachse. Was bei der Kalibrierung "links" war, ist danach links –
 * egal, was das Gerät über x, y und z denkt.
 *
 * Die Nickachse wird auf die Gierachse orthogonalisiert, damit eine unsaubere
 * Kalibrierbewegung nicht dauerhaft in die andere Achse leckt.
 */

const KEY = 'crashcorps.gyro';
const RAD = Math.PI / 180;

/** Voreinstellung. `staerke` 1 heißt: eine Handdrehung dreht den Blick genauso weit. */
const WERKS = { an: false, staerke: 1.0, invertX: false, invertY: false, achsen: null };

/** So viel Drehung muss eine Kalibrierbewegung mindestens haben, in Bogenmaß. */
const MINDEST = 15 * Math.PI / 180;

/** Sehr kleine Raten sind Sensorrauschen und würden den Blick zittern lassen. */
const RUHE = 0.015;    // Bogenmaß je Sekunde

export class Gyro {
  constructor() {
    this.einst = this._laden();
    this.laeuft = false;
    this.dyaw = 0; this.dpitch = 0;   // aufgelaufene Blickänderung im Bogenmaß
    this.letzte = 0;                  // Zeitstempel des letzten Ereignisses
    this.ereignisse = 0;              // für die Prüfung: kommen überhaupt Daten?
    this.mess = { gier: 0, nick: 0 };  // letzte Raten in Grad/s, für die Anzeige
    this.kalib = null;                 // laufende Kalibrierung: aufsummierte Drehung
    this._onMotion = (e) => this._motion(e);
  }

  _laden() {
    try { return { ...WERKS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
    catch { return { ...WERKS }; }
  }
  _speichern() {
    try { localStorage.setItem(KEY, JSON.stringify(this.einst)); } catch { /* privater Modus */ }
  }

  /** Sind Achsen bekannt? Ohne Kalibrierung zielt der Gyro nicht. */
  get kalibriert() { return !!this.einst.achsen; }

  /**
   * Kalibrierschritt beginnen: ab jetzt wird die Drehung aufsummiert.
   * Der Sensor muss dafür laufen – `einschalten()` vorher aufrufen.
   */
  kalibStart() { this.kalib = [0, 0, 0]; this.kalibSpitze = [0, 0, 0]; this.kalibMax = 0; }

  /**
   * Kalibrierschritt abschließen. Gibt die normierte Drehachse zurück, oder null,
   * wenn die Bewegung zu klein war, um daraus eine Richtung zu lesen.
   */
  kalibEnde() {
    if (!this.kalib) return null;
    // Nicht die Nettodrehung nehmen, sondern den größten Ausschlag: wer dreht
    // und vor dem Tippen zurückdreht, hätte sonst netto fast nichts – und die
    // Richtung käme aus dem Wackeln dazwischen statt aus der Bewegung.
    const k = this.kalibSpitze, l = this.kalibMax;
    this.kalib = null;
    if (l < MINDEST) return null;
    return [k[0] / l, k[1] / l, k[2] / l];
  }

  /**
   * Achsen aus den beiden Kalibrierbewegungen setzen.
   * `links` ist die Drehachse der Bewegung "nach links drehen", `oben` die von
   * "nach oben kippen". Beide im Gerätesystem, normiert.
   * @returns {boolean} false, wenn die beiden Bewegungen zu ähnlich waren
   */
  kalibSetzen(links, oben) {
    if (!links || !oben) return false;
    // Nickachse auf die Gierachse orthogonalisieren
    const d = links[0] * oben[0] + links[1] * oben[1] + links[2] * oben[2];
    if (Math.abs(d) > 0.8) return false;     // fast dieselbe Bewegung – so nicht
    const n = [oben[0] - d * links[0], oben[1] - d * links[1], oben[2] - d * links[2]];
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    this.einst.achsen = { gier: links, nick: [n[0] / l, n[1] / l, n[2] / l] };
    this._speichern();
    return true;
  }

  /** Kalibrierung verwerfen – der Gyro ist dann aus, bis neu kalibriert wird. */
  kalibLoeschen() {
    this.einst.achsen = null;
    this.ausschalten();
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

    // Drehrate im Gerätesystem, in Bogenmaß je Sekunde. Welche Achse was ist,
    // spielt keine Rolle mehr – die Kalibrierung hat es gemessen.
    const w = [(r.beta || 0) * RAD, (r.gamma || 0) * RAD, (r.alpha || 0) * RAD];

    if (this.kalib) {
      const k = this.kalib;
      k[0] += w[0] * dt; k[1] += w[1] * dt; k[2] += w[2] * dt;
      const l = Math.hypot(k[0], k[1], k[2]);
      if (l > this.kalibMax) { this.kalibMax = l; this.kalibSpitze = [k[0], k[1], k[2]]; }
      return;
    }
    const a = this.einst.achsen;
    if (!a) return;

    const gier = w[0] * a.gier[0] + w[1] * a.gier[1] + w[2] * a.gier[2];
    const nick = w[0] * a.nick[0] + w[1] * a.nick[1] + w[2] * a.nick[2];
    this.mess.gier = +(gier / RAD).toFixed(1);
    this.mess.nick = +(nick / RAD).toFixed(1);

    // Positiv heißt per Kalibrierung: nach links gedreht bzw. nach oben gekippt.
    // yaw steigt = Blick nach links, pitch steigt = Blick nach oben.
    const s = this.einst.staerke;
    if (Math.abs(gier) > RUHE) this.dyaw += gier * dt * s * (this.einst.invertX ? -1 : 1);
    if (Math.abs(nick) > RUHE) this.dpitch += nick * dt * s * (this.einst.invertY ? -1 : 1);
  }
}
