import * as THREE from 'three';
import { REAL } from './style.js';

/**
 * Domination: drei Kontrollpunkte, zwei Mannschaften, Punkte je Sekunde für
 * jeden gehaltenen Kontrollpunkt. Wer zuerst das Ziel erreicht, gewinnt.
 *
 * Ein Kontrollpunkt hat einen Wert zwischen -1 und +1. -1 gehört ganz der
 * eigenen Mannschaft, +1 ganz der gegnerischen, dazwischen gehört er niemandem.
 * Wer drauf steht, zieht den Wert zu sich. Stehen beide drauf, passiert nichts –
 * der Punkt ist umkämpft. Ein gegnerischer Punkt muss also erst neutralisiert
 * und dann erobert werden, das dauert doppelt so lange wie ein freier.
 */

/** Mannschaften. 0 ist immer die des Spielers. */
export const TEAMS = [
  { id: 0, name: 'Rot', farbe: 0xe0522a, css: '#e0522a' },
  { id: 1, name: 'Blau', farbe: 0x2f7fd4, css: '#2f7fd4' },
];

/** Alle Regelwerte des Modus. Nur hier ändern. */
export const REGELN = {
  ziel: 250,          // Punkte zum Sieg
  proSekunde: 2,      // Punkte je gehaltenem Kontrollpunkt und Sekunde
  tempo: 0.2,         // Eroberung allein: Wertänderung je Sekunde
  hilfe: 0.5,         // jede weitere Figur bringt nur die Hälfte
  radius: 3.2,        // waagerechter Fangbereich
  hoehe: 2.2,         // erlaubter Höhenunterschied – von unten geht nicht
  maxHelfer: 3,       // mehr Leute beschleunigen, aber nur bis hierhin
};

/**
 * Wie schnell sich der Wert bewegt und wohin.
 * Das Vorzeichen folgt der Skala: Mannschaft 0 zieht nach -1, Mannschaft 1 nach +1.
 * Mehrere Figuren helfen, aber mit abnehmendem Ertrag – sonst kippt ein Punkt
 * im Rudel in einer Sekunde.
 */
export function tempoVon(drin) {
  const netto = Math.min(drin[1], REGELN.maxHelfer) - Math.min(drin[0], REGELN.maxHelfer);
  if (netto === 0) return 0;
  const n = Math.abs(netto);
  return Math.sign(netto) * (1 + (n - 1) * REGELN.hilfe) * REGELN.tempo;
}

const NEUTRAL = 0xffd166;
/** Grunddeckkraft der Säule. Im realistischen Stil trägt der Dunst schon Tiefe. */
const GRUND = REAL ? 0.09 : 0.13;

/** Farbe eines Punktes nach Besitzer. */
const farbeVon = (besitzer) => besitzer == null ? NEUTRAL : TEAMS[besitzer].farbe;

/** Beschriftung A/B/C als Schild über dem Punkt. */
function schild(text) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#fff7e6'; x.strokeStyle = '#2b2118'; x.lineWidth = 10;
  x.beginPath(); x.roundRect(12, 12, 104, 104, 22); x.fill(); x.stroke();
  x.fillStyle = '#2b2118'; x.font = 'bold 74px "Trebuchet MS", sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(1.15, 1.15, 1);
  return s;
}

/** Ein Kontrollpunkt mit seiner Darstellung. */
class Punkt {
  constructor(def, group) {
    this.id = def.id;
    this.pos = def.pos;
    this.wert = 0;              // -1 = Rot, +1 = Blau
    this.besitzer = null;
    this.umkaempft = false;
    this.drin = [0, 0];         // Figuren je Mannschaft im Bereich

    this.gruppe = new THREE.Group();
    this.gruppe.position.copy(def.pos);
    // Ring am Boden: zeigt den Besitzer
    this.ringMat = new THREE.MeshBasicMaterial({ color: NEUTRAL, transparent: true, opacity: 0.95 });
    const ring = new THREE.Mesh(new THREE.RingGeometry(REGELN.radius - 0.4, REGELN.radius, 32), this.ringMat);
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03;
    // Säule: von weitem sichtbar, wächst mit dem Eroberungsfortschritt.
    // Bewusst blass und niedrig – sie steht mitten in den Schusslinien und darf
    // die Sicht auf Gegner dahinter nicht nehmen.
    this.saeuleMat = new THREE.MeshBasicMaterial({ color: NEUTRAL, transparent: true, opacity: GRUND, depthWrite: false });
    this.saeule = new THREE.Mesh(new THREE.CylinderGeometry(REGELN.radius - 0.7, REGELN.radius - 0.7, 1, 20, 1, true), this.saeuleMat);
    this.saeule.position.y = 0.5;
    this.schild = schild(def.id);
    this.schild.position.y = 4.6;
    this.gruppe.add(ring, this.saeule, this.schild);
    group.add(this.gruppe);
  }

  /** Fortschritt der laufenden Eroberung, 0..1 – für die Anzeige. */
  get fortschritt() { return 1 - Math.abs(this.wert); }

  aussehen(dt) {
    const ziel = new THREE.Color(farbeVon(this.besitzer));
    // Bei laufender Eroberung zur Farbe der Angreifer blenden
    if (this.besitzer == null && (this.drin[0] || this.drin[1])) {
      const angreifer = this.drin[0] > this.drin[1] ? 0 : this.drin[1] > this.drin[0] ? 1 : null;
      if (angreifer != null) ziel.lerp(new THREE.Color(TEAMS[angreifer].farbe), 0.55);
    }
    this.ringMat.color.lerp(ziel, Math.min(1, dt * 6));
    this.saeuleMat.color.copy(this.ringMat.color);
    // Höhe der Säule: voll bei Besitz, niedrig wenn der Punkt neutral ist
    const h = 0.5 + 3.5 * Math.abs(this.wert);
    this.saeule.scale.y += (h - this.saeule.scale.y) * Math.min(1, dt * 5);
    this.saeule.position.y = this.saeule.scale.y / 2;
    // Umkämpfte Punkte pulsieren, damit man sie im Blick behält
    const puls = this.umkaempft ? 0.07 + 0.05 * Math.sin(performance.now() / 90) : 0;
    this.saeuleMat.opacity = GRUND + puls;
  }
}

export class Domination {
  /**
   * @param {object} world  Arena mit `punkte`
   * @param {object} sound  darf fehlen
   */
  constructor(world, sound) {
    this.sound = sound;
    this.punkte = world.punkte.map(d => new Punkt(d, world.group));
    this.stand = [0, 0];
    this.sieger = null;
  }

  /** Marker wieder aus der Szene nehmen. */
  dispose() {
    for (const p of this.punkte) {
      p.gruppe.parent?.remove(p.gruppe);
      p.ringMat.dispose(); p.saeuleMat.dispose();
      p.schild.material.map.dispose(); p.schild.material.dispose();
    }
  }

  /** Der Kontrollpunkt, auf dem die Figur steht – oder null. */
  punktUnter(fig) {
    return this.punkte.find(p => Domination.drauf(fig, p)) ?? null;
  }

  /** Steht die Figur auf dem Punkt? Von unten zählt nicht. */
  static drauf(fig, punkt) {
    const dx = fig.pos.x - punkt.pos.x, dz = fig.pos.z - punkt.pos.z;
    return dx * dx + dz * dz <= REGELN.radius * REGELN.radius
      && Math.abs(fig.pos.y - punkt.pos.y) <= REGELN.hoehe;
  }

  /**
   * @param {number} dt
   * @param {Array} kaempfer  alle Figuren mit `team`, `pos`, `dead`
   */
  update(dt, kaempfer) {
    if (this.sieger != null) return;
    for (const p of this.punkte) {
      p.drin[0] = 0; p.drin[1] = 0;
      for (const f of kaempfer) if (!f.dead && Domination.drauf(f, p)) p.drin[f.team]++;

      const vorher = p.besitzer;
      p.umkaempft = p.drin[0] > 0 && p.drin[1] > 0;
      const tempo = tempoVon(p.drin);
      if (tempo !== 0) p.wert = Math.max(-1, Math.min(1, p.wert + tempo * dt));
      p.besitzer = p.wert <= -0.999 ? 0 : p.wert >= 0.999 ? 1 : null;
      if (p.besitzer !== vorher && p.besitzer != null) {
        this.onErobert?.(p, p.besitzer);
        this.sound?.punktGenommen(p.besitzer === 0);
      }
      p.aussehen(dt);
    }
    // Punktestand: je gehaltenem Kontrollpunkt und Sekunde
    for (const t of [0, 1]) {
      const gehalten = this.punkte.filter(p => p.besitzer === t).length;
      this.stand[t] += gehalten * REGELN.proSekunde * dt;
      if (this.stand[t] >= REGELN.ziel && this.sieger == null) {
        this.stand[t] = REGELN.ziel;
        this.sieger = t;
        this.onEnde?.(t);
      }
    }
  }

  /**
   * Wohin soll ein Bot dieser Mannschaft, wenn gerade kein Gegner in Sicht ist?
   * Erst ein Punkt, der noch nicht uns gehört, davon der nächste. Gehört alles
   * uns, wird der am wenigsten sichere verteidigt.
   */
  zielFuer(bot) {
    let best = null, bestKosten = Infinity;
    for (const p of this.punkte) {
      const eigen = p.besitzer === bot.team;
      // Fremde und neutrale Punkte zuerst, eigene nur als Rückfallziel
      const gewicht = eigen ? 60 : p.besitzer == null ? 0 : -12;
      const kosten = bot.pos.distanceTo(p.pos) + gewicht;
      if (kosten < bestKosten) { bestKosten = kosten; best = p; }
    }
    return best?.pos ?? null;
  }
}
