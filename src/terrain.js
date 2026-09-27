import * as THREE from 'three';

/**
 * Das Gelände: eine Stadt am Hang braucht erst einmal einen Hang.
 *
 * Bisher war die Welt eine Ebene – `groundHeightAt()` begann bei null, und
 * Höhe entstand nur durch Kollisionsquader. Hier kommt die Landschaft darunter:
 * drei Terrassen, verbunden über steile Böschungen, dazu ein Bachtal im Süden
 * und sanfte Wellen, damit nichts wie ein Tisch aussieht.
 *
 * **Fest gerechnet, nicht zufällig.** Bild, Kollision und Wegfindung fragen
 * dieselbe Funktion; ein Zufallsgelände müsste man herumreichen und könnte nie
 * nachschlagen, warum ein Bot an einer Stelle hängt.
 *
 * Abgetastet wird auf ein Raster von 2 m und dazwischen bilinear gemittelt.
 * Das hält Boden, Kollision und Navigationsgitter zwangsläufig gleich – jede
 * Stelle, an der jemand anders rechnet, wäre ein Loch im Boden.
 */

/** Kantenlänge der Welt in Metern. */
export const WELT = 240;
/** Abstand der Stützstellen des Höhenfelds. */
export const RASTER = 2;
/** Steiler als das ist Wand, nicht Weg. */
export const NEIGUNG_MAX = 0.72;           // rund 41°

const N = Math.round(WELT / RASTER) + 1;   // Stützstellen je Achse
const HALB = WELT / 2;

/**
 * Der Aufbau des Geländes, von der Mitte nach außen:
 *
 *   |z| < 30    Talstadt, flach – hier steht die gewachsene Altstadt
 *   30 … 45     Böschung, zu steil zum Hinauflaufen
 *   45 … 88     Mittlere Terrasse, je eine Stadthälfte
 *   88 … 100    zweite Böschung
 *   > 100       Hochterrasse mit der Burgruine
 *
 * **Gespiegelt an der Mitte.** Beide Mannschaften bekommen dieselbe Landschaft:
 * dieselbe Höhe, dieselben Wege, dieselbe Deckung. Ein Hang, der nur auf einer
 * Seite liegt, entscheidet sonst das Spiel, bevor jemand schießt.
 */
const STUFEN = [
  { ab: 32, hoehe: 8 },     // Talstadt → mittlere Terrasse
  { ab: 88, hoehe: 8 },     // mittlere Terrasse → Hochterrasse
];
const UEBERGANG = 14;

/** Weiche Stufe zwischen zwei Höhen, 0 → 1 über die Böschungsbreite. */
const stufe = (t) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };

/**
 * Hohlwege: in die Böschungen geschnittene Auffahrten. Ohne sie wäre jede
 * Terrasse eine Insel – die Böschung ist mit Absicht zu steil zum Hinauflaufen.
 * Angelegt werden sie paarweise und an der Mitte gespiegelt, damit beide
 * Mannschaften dieselben Wege haben.
 */
const HOHLWEGE = [];
for (const seite of [1, -1]) {
  // Untere Böschung: die Treppenstraße in der Achse der Stadt, dazu je ein
  // Karrenweg links und rechts. Drei Aufstiege je Seite – bei einem einzigen
  // stünde die ganze Mannschaft in derselben Engstelle.
  HOHLWEGE.push({ x: 0, z0: seite * 28, z1: seite * 50, breite: 9 });
  for (const x of [-34, 34]) {
    HOHLWEGE.push({ x, z0: seite * 26, z1: seite * 52, breite: 11 });
  }
  // Obere Böschung: zwei Wege hinauf zur Ruine, weit außen.
  for (const x of [-72, 72]) {
    HOHLWEGE.push({ x, z0: seite * 82, z1: seite * 106, breite: 11 });
  }
}

/**
 * Die Landschaft an einem Punkt – die einzige Stelle, an der sie beschrieben ist.
 */
function landschaft(x, z) {
  const a = Math.abs(z);
  // Die Terrassenkante verläuft nicht schnurgerade: eine langsame Welle in x
  // lässt den Hang gewachsen aussehen statt gefräst.
  const versatz = Math.sin(x * 0.017) * 6 + Math.sin(x * 0.041 + 1.3) * 2.5;
  let h = 0;
  for (const st of STUFEN) h += st.hoehe * stufe((a - st.ab - versatz) / UEBERGANG);
  // Sanfte Wellen, damit keine Fläche wirklich eben ist
  h += Math.sin(x * 0.035) * Math.cos(z * 0.028) * 0.6
     + Math.sin(x * 0.085 + 2.1) * Math.cos(z * 0.073) * 0.22;
  // Außerhalb steigt das Gelände weiter an: der Blick endet an Hügeln statt an
  // einer Kante, und niemand sieht unter die Karte.
  const raus = Math.max(Math.abs(x), a) - HALB * 0.9;
  if (raus > 0) h += Math.pow(raus * 0.1, 2) * 3;
  return h;
}

/**
 * Die Landschaft plus die eingeschnittenen Hohlwege. Der Weg zieht die Höhe in
 * seinem Querschnitt auf eine Rampe zwischen Fuß und Kopf der Böschung; zu den
 * Seiten und an den Enden läuft er weich in die Landschaft aus, sonst stünde
 * eine Stufe am Wegrand, an der niemand hochkommt.
 */
function roh(x, z) {
  let h = landschaft(x, z);
  for (const w of HOHLWEGE) {
    const quer = Math.abs(x - w.x) / (w.breite / 2);
    if (quer > 1.6) continue;
    // Hohlwege laufen in beide Richtungen: der Bereich liegt zwischen den
    // Enden, egal welches das kleinere ist.
    const lo = Math.min(w.z0, w.z1), hi = Math.max(w.z0, w.z1);
    if (z < lo - 6 || z > hi + 6) continue;
    const t = Math.min(1, Math.max(0, (z - w.z0) / (w.z1 - w.z0)));
    const ziel = landschaft(w.x, w.z0) * (1 - t) + landschaft(w.x, w.z1) * t;
    const qw = 1 - stufe((quer - 0.55) / 0.85);
    const lw = stufe((z - (lo - 6)) / 8) * stufe(((hi + 6) - z) / 8);
    h = h * (1 - qw * lw) + ziel * qw * lw;
  }
  return h;
}

const feld = new Float32Array(N * N);
for (let j = 0; j < N; j++) {
  for (let i = 0; i < N; i++) feld[j * N + i] = roh(-HALB + i * RASTER, -HALB + j * RASTER);
}

/**
 * Liegt ein Punkt in einem Hohlweg (oder dicht daneben)? Der Weltaufbau fragt
 * das, bevor er Bäume setzt – ein Wald quer über der einzigen Auffahrt wäre
 * genau die Art Fehler, die man erst im Spiel bemerkt.
 */
export function imHohlweg(x, z, rand = 3) {
  for (const w of HOHLWEGE) {
    if (Math.abs(x - w.x) > w.breite / 2 + rand) continue;
    const lo = Math.min(w.z0, w.z1), hi = Math.max(w.z0, w.z1);
    if (z >= lo - rand && z <= hi + rand) return true;
  }
  return false;
}

/** Geländehöhe an einem Punkt, bilinear zwischen den Stützstellen. */
export function hoeheBei(x, z) {
  const fx = (Math.min(HALB, Math.max(-HALB, x)) + HALB) / RASTER;
  const fz = (Math.min(HALB, Math.max(-HALB, z)) + HALB) / RASTER;
  const i = Math.min(N - 2, Math.floor(fx)), j = Math.min(N - 2, Math.floor(fz));
  const tx = fx - i, tz = fz - j;
  const h00 = feld[j * N + i], h10 = feld[j * N + i + 1];
  const h01 = feld[(j + 1) * N + i], h11 = feld[(j + 1) * N + i + 1];
  return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
}

/** Neigung an einem Punkt als Steigung (Höhe je Meter), aus den Nachbarn. */
export function neigungBei(x, z) {
  const d = RASTER;
  const dx = (hoeheBei(x + d, z) - hoeheBei(x - d, z)) / (2 * d);
  const dz = (hoeheBei(x, z + d) - hoeheBei(x, z - d)) / (2 * d);
  return Math.hypot(dx, dz);
}

/** Ist hier begehbarer Boden, oder ist es Böschung? */
export const begehbar = (x, z) => neigungBei(x, z) <= NEIGUNG_MAX;

/**
 * Geometrie des Bodens: ein Gitter, dessen Punkte auf die Geländehöhe gehoben
 * werden. Zwei Dreiecke je Rasterzelle – bei 2 m sind das 28 800 Dreiecke für
 * die ganze Welt, weniger als eine Figur.
 */
export function bodenGeometrie() {
  const g = new THREE.PlaneGeometry(WELT, WELT, N - 1, N - 1);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let k = 0; k < p.count; k++) p.setY(k, hoeheBei(p.getX(k), p.getZ(k)));
  g.computeVertexNormals();
  return g;
}

/**
 * Ebene Fläche ins Gelände stanzen – dafür, dass ein Haus nicht halb in der
 * Luft steht. Gibt die Höhe zurück, auf der gebaut wird: der Mittelwert der
 * vier Ecken, damit ein Gebäude am Hang nicht an der höchsten Ecke schwebt.
 */
export function bauhoehe(x, z, w = 0, d = 0) {
  const e = [
    hoeheBei(x - w / 2, z - d / 2), hoeheBei(x + w / 2, z - d / 2),
    hoeheBei(x - w / 2, z + d / 2), hoeheBei(x + w / 2, z + d / 2),
  ];
  return (e[0] + e[1] + e[2] + e[3]) / 4;
}
