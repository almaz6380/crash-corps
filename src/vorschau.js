import * as THREE from 'three';
import { buildCharacter } from './characters.js';

/**
 * Bilder der Spielfiguren für die Klassenwahl.
 *
 * Das Spiel läuft aus der Ich-Perspektive: von der eigenen Figur sieht man nur
 * die Waffe in der Hand. Ohne Vorschau weiß niemand, wen er gerade wählt – die
 * Karten im Menü waren bis dahin reiner Text.
 *
 * Gerendert wird **einmal beim Laden**, in einen eigenen kleinen Renderer, der
 * danach sofort weggeworfen wird. Das Ergebnis ist ein gewöhnliches Bild pro
 * Klasse. Eine dauerhaft mitlaufende Vorschau wäre ein zweiter Kontext und ein
 * zweiter Zeichendurchgang je Bild – auf dem Handy zahlt das niemand gern, und
 * eine Figur, die sich im Menü dreht, ist es nicht wert.
 */

const BREITE = 300, HOEHE = 380;

/**
 * Standbild einer Klasse erzeugen.
 * @param {object} cls Eintrag aus CLASSES
 * @param {THREE.WebGLRenderer} r gemeinsamer Renderer
 * @returns {string} Data-URL eines PNG
 */
function einBild(cls, r) {
  const scene = new THREE.Scene();

  // Licht wie in der Arena, nur ohne Schatten: weiches Grundlicht plus eine
  // Sonne von schräg vorn, damit die Silhouette Kanten bekommt.
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a94a6, 2.1));
  const sonne = new THREE.DirectionalLight(0xfff3e0, 1.9);
  sonne.position.set(2.5, 4, 3.5);
  scene.add(sonne);

  const fig = buildCharacter(cls);
  scene.add(fig);
  const rig = fig.userData.rig;
  // Ein Stück in den Steh-Clip hinein: die Bindepose ist eine T-Haltung.
  rig.inst.mixer.update(0.6);

  // Kamera so setzen, dass die Figur das Bild füllt – unabhängig davon, wie
  // groß das Modell gebaut ist. Die Höhe der Klasse ist der Maßstab.
  const h = cls.body.height;
  const cam = new THREE.PerspectiveCamera(34, BREITE / HOEHE, 0.1, 40);
  cam.position.set(h * 0.95, h * 0.72, h * 2.05);
  cam.lookAt(0, h * 0.48, 0);

  const ziel = new THREE.WebGLRenderTarget(BREITE * 2, HOEHE * 2, {
    colorSpace: THREE.SRGBColorSpace,
    samples: 4,
  });
  r.setRenderTarget(ziel);
  r.setClearColor(0x000000, 0);          // durchsichtig: die Karte scheint durch
  r.clear();
  r.render(scene, cam);
  r.setRenderTarget(null);

  // Zurücklesen und in ein Bild packen
  const px = new Uint8Array(ziel.width * ziel.height * 4);
  r.readRenderTargetPixels(ziel, 0, 0, ziel.width, ziel.height, px);
  const cv = document.createElement('canvas');
  cv.width = ziel.width; cv.height = ziel.height;
  const ctx = cv.getContext('2d');
  const bild = ctx.createImageData(ziel.width, ziel.height);
  // WebGL liest von unten nach oben, Canvas erwartet von oben nach unten
  const zeile = ziel.width * 4;
  for (let y = 0; y < ziel.height; y++) {
    const von = (ziel.height - 1 - y) * zeile;
    bild.data.set(px.subarray(von, von + zeile), y * zeile);
  }
  ctx.putImageData(bild, 0, 0);

  ziel.dispose();
  scene.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) m.dispose();
  });
  return cv.toDataURL('image/png');
}

/**
 * Ein Bild je Klasse. Muss laufen, nachdem `preloadCharacters` fertig ist.
 * @param {object[]} klassen
 * @returns {Record<string, string>} Klassen-Id → Data-URL
 */
export function klassenBilder(klassen) {
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  r.setPixelRatio(1);
  r.setSize(BREITE, HOEHE, false);
  r.outputColorSpace = THREE.SRGBColorSpace;
  const out = {};
  try {
    for (const c of klassen) {
      try { out[c.id] = einBild(c, r); }
      catch (e) { console.warn(`Vorschau für "${c.id}" fehlgeschlagen:`, e.message); }
    }
  } finally {
    // Der Kontext wird nicht mehr gebraucht. Handys erlauben nur eine Handvoll.
    r.dispose();
    r.forceContextLoss?.();
  }
  return out;
}
