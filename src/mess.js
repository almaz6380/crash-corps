import * as THREE from 'three';

/**
 * Der Testflug: Leistung messen, wo sie anfällt – auf dem Gerät, auf dem
 * gespielt wird.
 *
 * Warum nicht einfach eine Bildratenanzeige? Weil eine Zahl allein nichts
 * sagt. Sie hängt davon ab, wo man gerade steht, und sie verrät nicht, **was**
 * teuer ist. Der Testflug fliegt deshalb immer dieselbe Strecke und misst sie
 * mehrfach, jedes Mal mit einer abgeschalteten Stufe. Der Abstand zwischen zwei
 * Läufen ist die Antwort: so viel kostet diese Stufe hier.
 *
 * Gemessen wird der Median **und** das 1-%-Tief: die schlechtesten Bilder sind
 * das, was sich als Ruckeln anfühlt, und ein guter Median kann sie verstecken.
 *
 * Die Bots laufen mit. Eine Messung ohne Figuren misst ein Spiel, das niemand
 * spielt – und der letzte Lauf schaltet sie ab, damit auch diese Zahl dasteht.
 */

/** Wegpunkte des Rundflugs: Ort und Blickziel, in Weltkoordinaten. */
const STRECKE = [
  { von: [0, 2.6, 20], zu: [0, 1.6, 0] },        // Marktplatz von Süden
  { von: [-34, 1.7, 15], zu: [40, 2, 15] },      // die Gasse entlang, viele Häuser im Bild
  { von: [0, 1.7, 28], zu: [0, 9, 54] },         // die Rampenstraße hinauf
  { von: [0, 9.6, 50], zu: [0, 1, 6] },          // von der Brüstung über die halbe Stadt
  { von: [-30, 10.8, 56], zu: [-30, 9, 66] },    // Innenhof auf der Terrasse
  { von: [0, 17.5, 102], zu: [0, 17, 112] },     // Ruine auf der Hochterrasse
];

/**
 * Die Läufe. `aus` nennt die Stufe, die in diesem Lauf abgeschaltet wird –
 * `null` ist der Ausgangswert, gegen den alle anderen gerechnet werden.
 */
export const LAEUFE = [
  { aus: null, name: 'Alles an' },
  { aus: 'bloom', name: 'ohne Streulicht' },
  { aus: 'ao', name: 'ohne Verdeckung' },
  { aus: 'normal', name: 'ohne Normalen-Durchgang' },
  { aus: 'schatten', name: 'ohne Schatten' },
  { aus: 'halb', name: 'halbe Auflösung' },
  { aus: 'figuren', name: 'ohne Figuren' },
];

/** Sekunden je Wegpunkt-Abschnitt und Aufwärmzeit je Lauf. */
const ABSCHNITT = 1.1;
const AUFWAERMEN = 0.6;

const _a = new THREE.Vector3(), _b = new THREE.Vector3();

/** Mittelwert einer sortierten Liste an einer Stelle zwischen 0 und 1. */
function quantil(sortiert, p) {
  if (!sortiert.length) return 0;
  const i = Math.min(sortiert.length - 1, Math.max(0, Math.round(p * (sortiert.length - 1))));
  return sortiert[i];
}

export class Testflug {
  /**
   * @param {object} u Umgebung aus `main.js`: alles, was der Flug anfassen darf.
   *   `u.kamera`, `u.stufe(name, an)` schaltet eine Stufe, `u.zaehler()` liefert
   *   Zeichenaufrufe und Dreiecke, `u.amLeben()` hält Spieler und Punktestand fest.
   */
  constructor(u) {
    this.u = u;
    this.aktiv = false;
    this.lauf = 0;
    this.zeit = 0;
    this.proben = [];        // Bildzeiten des laufenden Laufs
    this.simZeiten = [];
    this.bildZeiten = [];
    this.ergebnisse = [];
  }

  /** Dauer eines Laufs in Sekunden. */
  static get laufDauer() { return AUFWAERMEN + STRECKE.length * ABSCHNITT; }

  start() {
    this.aktiv = true;
    this.lauf = 0; this.zeit = 0;
    this.proben = []; this.simZeiten = []; this.bildZeiten = [];
    this.ergebnisse = [];
    this._stufeSetzen(0);
  }

  abbrechen() {
    if (!this.aktiv) return;
    this._alleStufenAn();
    this.aktiv = false;
  }

  /** Alle abgeschalteten Stufen wieder an – nach dem Flug und beim Abbruch. */
  _alleStufenAn() {
    for (const l of LAEUFE) if (l.aus) this.u.stufe(l.aus, true);
  }

  _stufeSetzen(i) {
    this._alleStufenAn();
    const l = LAEUFE[i];
    if (l.aus) this.u.stufe(l.aus, false);
  }

  /**
   * Ein Bild weiter. Wird in der Schleife **nach** der Simulation aufgerufen
   * und setzt die Kamera – so läuft das Spiel ganz normal weiter und nur der
   * Blick ist vorgegeben.
   *
   * @param {number} dt   echte Bildzeit in Sekunden (ungedeckelt)
   * @param {number} sim  wie lange die Simulation gebraucht hat, in ms
   * @param {number} bild wie lange das Zeichnen gebraucht hat, in ms
   * @returns {boolean} true, wenn der Flug in diesem Bild fertig geworden ist
   */
  tick(dt, sim, bild) {
    if (!this.aktiv) return false;
    this.u.amLeben();
    this.zeit += dt;

    // Kamera auf die Strecke setzen. Der Abschnitt läuft weich aus, damit kein
    // Ruck in die Messung gerät – ein Sprung ist ein teures Bild, das nichts
    // mit der Szene zu tun hat.
    const t = Math.max(0, this.zeit - AUFWAERMEN) / ABSCHNITT;
    const i = Math.min(STRECKE.length - 1, Math.floor(t));
    const f = Math.min(1, t - i);
    const weich = f * f * (3 - 2 * f);
    const j = Math.min(STRECKE.length - 1, i + 1);
    const p = STRECKE[i], q = STRECKE[j];
    _a.set(...p.von).lerp(_b.set(...q.von), weich);
    this.u.kamera.position.copy(_a);
    _a.set(...p.zu).lerp(_b.set(...q.zu), weich);
    this.u.kamera.lookAt(_a);

    // Die Aufwärmzeit zählt nicht mit: im ersten Moment werden Shader übersetzt
    // und Texturen hochgeladen, und das misst den Start, nicht das Spiel.
    if (this.zeit > AUFWAERMEN) {
      this.proben.push(dt); this.simZeiten.push(sim); this.bildZeiten.push(bild);
    }

    if (this.zeit < Testflug.laufDauer) return false;
    this._laufAbschliessen();
    if (this.lauf < LAEUFE.length - 1) {
      this.lauf++; this.zeit = 0;
      this.proben = []; this.simZeiten = []; this.bildZeiten = [];
      this._stufeSetzen(this.lauf);
      return false;
    }
    this._alleStufenAn();
    this.aktiv = false;
    return true;
  }

  _laufAbschliessen() {
    const sortiert = [...this.proben].sort((a, b) => a - b);
    const mittel = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
    const z = this.u.zaehler();
    this.ergebnisse.push({
      name: LAEUFE[this.lauf].name,
      bilder: this.proben.length,
      fps: 1 / Math.max(quantil(sortiert, 0.5), 1e-4),
      tief: 1 / Math.max(quantil(sortiert, 0.99), 1e-4),   // 1-%-Tief
      sim: mittel(this.simZeiten),
      bild: mittel(this.bildZeiten),
      aufrufe: z.aufrufe,
      dreiecke: z.dreiecke,
    });
  }

  /** Wie weit ist der Flug? 0 bis 1, für die Anzeige während der Messung. */
  get fortschritt() {
    return (this.lauf + Math.min(1, this.zeit / Testflug.laufDauer)) / LAEUFE.length;
  }

  /**
   * Das Ergebnis als Text. Genau so, wie es auf dem Bildschirm steht – der
   * Knopf „Zahlen kopieren“ legt diesen Text in die Zwischenablage, damit man
   * ihn verschicken kann, statt ihn abzutippen.
   */
  bericht() {
    const g = this.u.geraet();
    const kopf = [
      `Crash Corps · Testflug · Stand ${g.stand}`,
      `${g.gpu}`,
      `Bild ${g.breite}x${g.hoehe} · Bildpunkte x${g.pixelRatio} · Stil ${g.stil} · Stufe ${g.stufe} · ${g.figuren} Figuren`,
      '',
      'Die Bilder je Sekunde sind das Maß. Sim und Bild sind die CPU-Anteile –',
      'was die Grafikkarte danach noch tut, steht in keiner der beiden Zahlen.',
      '',
      'Lauf                           Bilder/s   1%-Tief   Sim ms   Bild ms   Aufrufe',
    ];
    const erste = this.ergebnisse[0];
    const zeilen = this.ergebnisse.map((e) => {
      const delta = erste && e !== erste ? ` (${e.fps >= erste.fps ? '+' : ''}${(e.fps - erste.fps).toFixed(1)})` : '';
      return `${(e.name + delta).padEnd(30)} ${e.fps.toFixed(1).padStart(8)} ${e.tief.toFixed(1).padStart(9)} `
        + `${e.sim.toFixed(1).padStart(8)} ${e.bild.toFixed(1).padStart(9)} ${String(e.aufrufe).padStart(9)}`;
    });
    return [...kopf, ...zeilen, '', `Dreiecke: ${erste?.dreiecke ?? 0}`].join('\n');
  }
}
