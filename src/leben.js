import * as THREE from 'three';
import { TEAMS } from './domination.js';
import { OHNE_UMRISS } from './render.js';

/**
 * Alles, was sich in der Welt bewegt, ohne mitzuspielen: Rauch aus den
 * Schornsteinen, Banner an den Kontrollpunkten, Vögel über dem Dorf.
 *
 * Ein stehendes Dorf sieht aus wie ein Modell. Erst wenn etwas zieht, weht und
 * kreist, wirkt es bewohnt – und das kostet hier nichts: keine Datei, keine
 * Textur von der Platte, ein Material je Art. Der Rauch zeichnet sich selbst in
 * ein kleines Canvas, wie der Klang sich selbst erzeugt.
 */

const RAUCH = {
  proSchlot: 8,      // gleichzeitig sichtbare Wolken
  steigen: 0.55,     // Meter je Sekunde
  leben: 6,          // Sekunden bis zur Auflösung
  wind: [0.35, 0.12],// Drift in x und z
  start: 0.5, ende: 2.4,
};
const VOEGEL = { anzahl: 5, hoehe: 16, radius: 26, tempo: 0.06 };

/** Weiche runde Wolke, in ein Canvas gezeichnet – spart eine Bilddatei. */
function rauchTextur() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.55, 'rgba(232,232,228,0.42)');
  g.addColorStop(1, 'rgba(220,220,215,0)');
  x.fillStyle = g; x.beginPath(); x.arc(32, 32, 30, 0, 7); x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Vogel: zwei schmale Flügel in einem V. Als Sprite ginge es einfacher, aber
 * der Outline-Pass zieht um jedes Sprite einen Rahmen – am Himmel stünden dann
 * weiße Kästchen. Echte Geometrie bekommt einen Umriss, der zur Form passt.
 */
function vogel() {
  const mat = new THREE.MeshToonMaterial({ color: 0x3a3a42 });
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    const fluegel = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.16), mat);
    fluegel.position.x = s * 0.26;
    fluegel.rotation.z = s * 0.35;
    g.add(fluegel);
  }
  return g;
}

export class Leben {
  /**
   * @param {THREE.Object3D} gruppe   Weltgruppe, in die alles gehängt wird
   * @param {Array} schornsteine      Positionen der Schlote (Weltkoordinaten)
   * @param {Array} punkte            Kontrollpunkte aus world.punkte
   */
  constructor(gruppe, schornsteine, punkte) {
    this.t = 0;
    this.gruppe = gruppe;

    // ---- Rauch ----
    // Eine Textur für alle, das Material je Wolke geklont – siehe update().
    const mat = new THREE.SpriteMaterial({
      map: rauchTextur(), transparent: true, depthWrite: false, opacity: 0.8,
    });
    this.rauch = [];
    for (const s of schornsteine) {
      for (let i = 0; i < RAUCH.proSchlot; i++) {
        const sp = new THREE.Sprite(mat.clone());
        sp.position.copy(s);
        // Der Outline-Pass zöge um jedes Sprite ein Rechteck – am Himmel
        // stünden dann weiße Kästchen statt Rauch.
        sp.layers.set(OHNE_UMRISS);
        gruppe.add(sp);
        // Versetzt starten, sonst steigen alle Wolken im Gleichschritt
        this.rauch.push({ sp, quelle: s, alter: (i / RAUCH.proSchlot) * RAUCH.leben, drall: Math.random() * 6 });
      }
    }

    // ---- Banner an den Kontrollpunkten ----
    // Vier Segmente in der Breite reichen: das Tuch wellt über einen Sinus,
    // der je Frame die Ecken versetzt. Ein Shader wäre hier mit Kanonen auf
    // Spatzen geschossen, und der Cel-Pass müsste ihn mittragen.
    this.banner = [];
    for (const p of punkte) {
      const geo = new THREE.PlaneGeometry(1.1, 0.75, 4, 2);
      const m = new THREE.MeshBasicMaterial({ color: 0xbfc4c9, side: THREE.DoubleSide });
      const tuch = new THREE.Mesh(geo, m);
      const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.045, 2.6, 6),
        new THREE.MeshToonMaterial({ color: 0x6b4f33 }),
      );
      const halter = new THREE.Group();
      mast.position.y = 1.3;
      tuch.position.set(0.62, 2.1, 0);
      halter.position.copy(p.pos);
      halter.add(mast, tuch);
      halter.castShadow = true;
      gruppe.add(halter);
      this.banner.push({ punkt: p, tuch, geo, ruhe: geo.attributes.position.array.slice() });
    }

    // ---- Vögel ----
    this.voegel = [];
    for (let i = 0; i < VOEGEL.anzahl; i++) {
      const sp = vogel();
      gruppe.add(sp);
      this.voegel.push({
        sp,
        phase: (i / VOEGEL.anzahl) * Math.PI * 2,
        radius: VOEGEL.radius * (0.7 + Math.random() * 0.5),
        hoehe: VOEGEL.hoehe + Math.random() * 6,
      });
    }
  }

  /**
   * @param {number} dt    Sekunden seit dem letzten Bild
   * @param {object} [dom] Domination-Zustand, für die Bannerfarbe
   */
  update(dt, dom) {
    this.t += dt;

    for (const w of this.rauch) {
      w.alter += dt;
      if (w.alter > RAUCH.leben) w.alter -= RAUCH.leben;      // Wolke fängt von vorn an
      const anteil = w.alter / RAUCH.leben;
      w.sp.position.set(
        w.quelle.x + RAUCH.wind[0] * w.alter + Math.sin(w.drall + w.alter) * 0.25,
        w.quelle.y + RAUCH.steigen * w.alter,
        w.quelle.z + RAUCH.wind[1] * w.alter + Math.cos(w.drall + w.alter * 0.7) * 0.2,
      );
      w.sp.scale.setScalar(RAUCH.start + (RAUCH.ende - RAUCH.start) * anteil);
      // Aufblenden, dann verwehen. Jede Wolke hat ihr eigenes Material – Sprites
      // werden ohnehin einzeln gezeichnet, und anders ginge die Deckkraft nur
      // für alle gemeinsam.
      w.sp.material.opacity = Math.min(anteil * 6, 1) * (1 - anteil) * 0.75;
    }

    for (const b of this.banner) {
      // Wem der Punkt gehört, weiß nur der Modus: `world.punkte` sind reine
      // Ortsangaben, die Besitzer stehen an den Punkt-Objekten in domination.js.
      const stand = dom?.punkte?.find(p => p.id === b.punkt.id);
      const besitzer = stand?.besitzer ?? null;
      const farbe = besitzer == null ? 0xbfc4c9 : TEAMS[besitzer].farbe;
      b.tuch.material.color.setHex(farbe);
      const pos = b.geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = b.ruhe[i * 3], y = b.ruhe[i * 3 + 1];
        const weite = (x + 0.55) / 1.1;                       // 0 am Mast, 1 am Saum
        pos.setZ(i, Math.sin(this.t * 3.4 + x * 5 + y * 2) * 0.16 * weite);
      }
      pos.needsUpdate = true;
    }

    for (const v of this.voegel) {
      const a = v.phase + this.t * VOEGEL.tempo;
      v.sp.position.set(Math.cos(a) * v.radius, v.hoehe + Math.sin(a * 2.3) * 1.5, Math.sin(a) * v.radius);
      v.sp.rotation.y = -a;                                  // Nase voran
      // Flügelschlag: beide Flügel wippen gegenläufig um die Längsachse
      const schlag = Math.sin(this.t * 6 + v.phase) * 0.5;
      v.sp.children[0].rotation.z = -0.35 + schlag;
      v.sp.children[1].rotation.z = 0.35 - schlag;
    }
  }
}
