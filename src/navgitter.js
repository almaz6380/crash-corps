import * as THREE from 'three';
import { hoeheBei, neigungBei, NEIGUNG_MAX } from './terrain.js';
import { inBereich, STEP_UP } from './world.js';

/**
 * Wegfindung über ein Gitter.
 *
 * Bisher liefen die Bots geradeaus auf ihr Ziel zu und rutschten an Wänden
 * entlang. Auf 60 m ging das durch: irgendwann war man um das Haus herum. Auf
 * 240 m mit Gassen, Höfen und Terrassen bleibt ein Bot an jeder zweiten
 * Hausecke hängen, und wer einmal in einer Sackgasse steht, kommt nie wieder
 * heraus – Geradeaus zeigt dann für immer in dieselbe Wand.
 *
 * Das Gitter hat 2-m-Zellen über die ganze Welt (121 × 121) und kennt je Zelle
 * nur zwei Dinge: die Bodenhöhe und ob man dort stehen kann. Das reicht, weil
 * die **Ebenen** (Galerien, Dachterrassen) weiterhin über die Wegpunkte aus
 * `world.ramps` angelaufen werden – ein Gitter je Ebene zu führen wäre die
 * zehnfache Arbeit für die zehn Stellen, an denen es Ebenen gibt.
 *
 * Gesucht wird mit A*, geglättet wird über Sichtlinien: der Weg aus dem Gitter
 * ist eine Treppe aus 2-m-Schritten, und ein Bot, der die einzeln abliefe,
 * liefe sichtbar im Zickzack.
 */

/** Kantenlänge einer Zelle. Feiner lohnt nicht – eine Figur ist 1 m breit. */
export const ZELLE = 2;

/** Wie hoch eine Figur ist. Was tiefer hängt, blockiert. */
const KOPF = 1.8;

/** Wie breit eine Figur ist – derselbe Radius, mit dem `resolveCollisions` schiebt. */
const RADIUS = 0.55;

/**
 * Wie viel Höhe zwischen zwei Nachbarzellen liegen darf.
 *
 * **Nicht `STEP_UP`.** Die Schrittweite gilt fürs Hinaufsteigen auf eine Kante
 * – auf einem durchgehenden Hang läuft die Figur einfach bergauf, dort
 * begrenzt allein die Neigung. Mit der Schrittweite als Grenze wären die
 * Hohlwege gesperrt: 0,32 Steigung über 2 m sind 0,64 m, und damit wäre jede
 * Auffahrt der Karte eine Wand. Gemessen hat das Gitter so nur 7,7 % seiner
 * Wege gefunden.
 */
const STUFE = NEIGUNG_MAX * ZELLE * 1.05;

/** Achter-Nachbarschaft, Diagonalen zuletzt. */
const NACHBARN = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

export class Navgitter {
  /**
   * @param {object} world  fertige Welt aus `buildWorld` – die Quader müssen
   *                        stehen, sonst ist das halbe Gitter frei, das keines ist.
   * @param {number} weite  Kantenlänge der Welt in Metern
   */
  constructor(world, weite) {
    this.n = Math.round(weite / ZELLE) + 1;
    this.halb = weite / 2;
    const n = this.n;
    this.hoehe = new Float32Array(n * n);
    this.frei = new Uint8Array(n * n);
    const eigene = [];                      // eigene Liste: `inBereich` teilt sonst
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = -this.halb + i * ZELLE, z = -this.halb + j * ZELLE;
        const h = hoeheBei(x, z);
        this.hoehe[j * n + i] = h;
        if (neigungBei(x, z) > NEIGUNG_MAX) continue;       // Böschung ist Wand
        // Dieselbe Regel wie `resolveCollisions`: was über die Schrittweite
        // ragt und unter Kopfhöhe beginnt, steht im Weg. Ein Steg auf 2,4 m
        // blockiert nicht – darunter läuft man durch.
        let blockiert = false;
        for (const m of inBereich(world, x - RADIUS, z - RADIUS, x + RADIUS, z + RADIUS, eigene)) {
          const b = m.userData.box;
          if (b.max.y <= h + STEP_UP || b.min.y >= h + KOPF) continue;
          // `inBereich` liefert **Kandidaten** aus 8-m-Zellen, keine Treffer.
          // Ohne diese Prüfung sperrt ein einziges Haus seine ganze Rasterzelle,
          // und in einer dichten Stadt bleibt vom Gitter fast nichts übrig –
          // gemessen war so das ganze Tal unbegehbar.
          const cx = Math.max(b.min.x, Math.min(x, b.max.x));
          const cz = Math.max(b.min.z, Math.min(z, b.max.z));
          const dx = x - cx, dz = z - cz;
          if (dx * dx + dz * dz > RADIUS * RADIUS) continue;
          blockiert = true; break;
        }
        if (!blockiert) this.frei[j * n + i] = 1;
      }
    }
    // Arbeitsspeicher für A*, einmal angelegt statt je Suche
    this.g = new Float32Array(n * n);
    this.f = new Float32Array(n * n);
    this.her = new Int32Array(n * n);
    this.stand = new Int32Array(n * n);     // Durchlaufmarke statt „geschlossen"-Menge
    this.zu = new Int32Array(n * n);        // schon abgearbeitet
    this.lauf = 0;
    // Die Halde muss mehr fassen als es Zellen gibt: eine Zelle wird jedes Mal
    // neu eingefügt, wenn ein günstigerer Weg zu ihr auftaucht (statt sie in
    // der Halde zu suchen und herabzustufen). Zu klein bemessen schreibt das
    // typisierte Feld stillschweigend ins Leere, und die Suche findet Wege
    // nicht mehr, die es gibt – gemessen: 136 von 400.
    this.halde = new Int32Array(n * n * 4);
    this.anzahl = 0;
  }

  /** Zellindex einer Weltkoordinate, oder -1 außerhalb. */
  index(x, z) {
    const i = Math.round((x + this.halb) / ZELLE), j = Math.round((z + this.halb) / ZELLE);
    if (i < 0 || j < 0 || i >= this.n || j >= this.n) return -1;
    return j * this.n + i;
  }

  weltX(k) { return -this.halb + (k % this.n) * ZELLE; }
  weltZ(k) { return -this.halb + Math.floor(k / this.n) * ZELLE; }

  begehbar(x, z) {
    const k = this.index(x, z);
    return k >= 0 && this.frei[k] === 1;
  }

  /**
   * Nächste begehbare Zelle zu einem Punkt. Ziele liegen oft auf einer Galerie
   * oder in einer Hauswand – ohne diese Suche fände A* dort nie ein Feld und
   * der Bot bliebe stehen.
   */
  naechsteFreie(x, z, umkreis = 6) {
    const k = this.index(x, z);
    if (k >= 0 && this.frei[k]) return k;
    let best = -1, bestD = Infinity;
    const r = Math.ceil(umkreis / ZELLE);
    const i0 = Math.round((x + this.halb) / ZELLE), j0 = Math.round((z + this.halb) / ZELLE);
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        const i = i0 + di, j = j0 + dj;
        if (i < 0 || j < 0 || i >= this.n || j >= this.n) continue;
        const kk = j * this.n + i;
        if (!this.frei[kk]) continue;
        const d = di * di + dj * dj;
        if (d < bestD) { bestD = d; best = kk; }
      }
    }
    return best;
  }

  /** Darf man von Zelle a nach Zelle b treten? Stufenhöhe und Ecken zählen. */
  schritt(a, b, di, dj) {
    if (!this.frei[b]) return false;
    if (Math.abs(this.hoehe[b] - this.hoehe[a]) > STUFE) return false;
    if (di && dj) {
      // Keine Diagonale durch eine Hausecke: beide geraden Nachbarn müssen frei
      // sein. Sonst schneidet der geglättete Weg die Ecke, und der Bot drückt
      // von außen gegen die Wand, statt herumzugehen.
      const i = a % this.n, j = Math.floor(a / this.n);
      const n1 = j * this.n + (i + di), n2 = (j + dj) * this.n + i;
      if (!this.frei[n1] || !this.frei[n2]) return false;
    }
    return true;
  }

  /**
   * Freie Sichtlinie über das Gitter (für die Glättung). Abgetastet in halben
   * Zellen – gröber übersähe eine Hausecke, feiner kostet nur Zeit.
   */
  sicht(x0, z0, x1, z1) {
    const dx = x1 - x0, dz = z1 - z0;
    const schritte = Math.ceil(Math.hypot(dx, dz) / (ZELLE / 2));
    let letzte = this.index(x0, z0);
    for (let i = 1; i <= schritte; i++) {
      const t = i / schritte;
      const k = this.index(x0 + dx * t, z0 + dz * t);
      if (k < 0 || !this.frei[k]) return false;
      if (k !== letzte && Math.abs(this.hoehe[k] - this.hoehe[letzte]) > STUFE) return false;
      letzte = k;
    }
    return true;
  }

  /**
   * Weg von A nach B als Liste von Punkten, oder `null`, wenn keiner existiert.
   * `maxZellen` begrenzt die Suche – ein Bot, der gegen die halbe Karte sucht,
   * kostet mehr als er nützt, und Geradeaus ist dann immer noch besser als ein
   * Bild Aussetzer.
   */
  weg(von, nach, maxZellen = 9000) {
    const start = this.naechsteFreie(von.x, von.z);
    const ziel = this.naechsteFreie(nach.x, nach.z);
    if (start < 0 || ziel < 0) return null;
    if (start === ziel) return [new THREE.Vector3(nach.x, nach.y, nach.z)];

    const { n, g, f, her, stand, zu } = this;
    this.lauf++;
    const lauf = this.lauf;
    const zx = this.weltX(ziel), zz = this.weltZ(ziel);
    // Leicht übergewichtete Schätzung: A* läuft damit zielstrebiger und findet
    // gelegentlich einen ein paar Meter längeren Weg. Das ist der richtige
    // Tausch – ein Bot, der eine Zehntelsekunde stockt, fällt auf, ein Umweg
    // von drei Metern nicht.
    const schaetzung = (k) => Math.hypot(this.weltX(k) - zx, this.weltZ(k) - zz) * 1.15;

    this.anzahl = 0;
    g[start] = 0; f[start] = schaetzung(start); her[start] = -1; stand[start] = lauf;
    this.einfuegen(start);
    let besucht = 0;

    while (this.anzahl > 0) {
      const k = this.entnehmen();
      // Dieselbe Zelle steht mehrfach in der Halde – einmal je gefundener
      // Verbesserung. Ohne diese Marke zählte jede Wiederholung als besuchte
      // Zelle, und die Suche gab auf, lange bevor sie die Karte gesehen hatte:
      // gemessen fanden 168 von 400 Wegen kein Ziel, das es gab.
      if (zu[k] === lauf) continue;
      zu[k] = lauf;
      if (k === ziel) return this.glaetten(k, nach);
      if (++besucht > maxZellen) break;
      const i = k % n, j = Math.floor(k / n);
      for (const [di, dj, kosten] of NACHBARN) {
        const i2 = i + di, j2 = j + dj;
        if (i2 < 0 || j2 < 0 || i2 >= n || j2 >= n) continue;
        const k2 = j2 * n + i2;
        if (!this.schritt(k, k2, di, dj)) continue;
        // Steigungen kosten extra: sonst nimmt ein Bot den Hang statt des Wegs
        const neu = g[k] + kosten * ZELLE
          + Math.abs(this.hoehe[k2] - this.hoehe[k]) * 1.5;
        if (stand[k2] === lauf && neu >= g[k2]) continue;
        stand[k2] = lauf; g[k2] = neu; her[k2] = k; f[k2] = neu + schaetzung(k2);
        this.einfuegen(k2);
      }
    }
    return null;
  }

  /** Weg zurückverfolgen und über Sichtlinien zusammenfassen. */
  glaetten(ende, ziel) {
    const roh = [];
    for (let k = ende; k >= 0; k = this.her[k]) roh.push(k);
    roh.reverse();
    const punkte = [];
    let i = 0;
    while (i < roh.length - 1) {
      // Den weitesten Punkt suchen, den man von hier aus noch sieht
      let j = roh.length - 1;
      while (j > i + 1 && !this.sicht(this.weltX(roh[i]), this.weltZ(roh[i]), this.weltX(roh[j]), this.weltZ(roh[j]))) j--;
      punkte.push(new THREE.Vector3(this.weltX(roh[j]), this.hoehe[roh[j]], this.weltZ(roh[j])));
      i = j;
    }
    // Der letzte Schritt geht auf das echte Ziel, nicht auf die Zellmitte
    punkte[punkte.length - 1] = new THREE.Vector3(ziel.x, ziel.y, ziel.z);
    return punkte;
  }

  // ---- Binärhalde, auf typisierten Feldern ----
  einfuegen(k) {
    const { halde, f } = this;
    if (this.anzahl >= halde.length) return;      // voll: lieber kein Weg als Unsinn
    let i = this.anzahl++;
    halde[i] = k;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (f[halde[p]] <= f[halde[i]]) break;
      const t = halde[p]; halde[p] = halde[i]; halde[i] = t; i = p;
    }
  }

  entnehmen() {
    const { halde, f } = this;
    const oben = halde[0];
    const letzte = halde[--this.anzahl];
    if (this.anzahl > 0) {
      halde[0] = letzte;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < this.anzahl && f[halde[l]] < f[halde[m]]) m = l;
        if (r < this.anzahl && f[halde[r]] < f[halde[m]]) m = r;
        if (m === i) break;
        const t = halde[m]; halde[m] = halde[i]; halde[i] = t; i = m;
      }
    }
    return oben;
  }

  /** Anteil begehbarer Zellen – die Kennzahl, an der man einen Baufehler sieht. */
  anteilFrei() {
    let f = 0;
    for (let k = 0; k < this.frei.length; k++) f += this.frei[k];
    return f / this.frei.length;
  }
}
