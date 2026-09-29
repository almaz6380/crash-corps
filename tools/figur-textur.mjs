#!/usr/bin/env node
/**
 * Eine einzelne Textur in einer fertigen Figur gegen eine feinere tauschen.
 *
 * Warum nicht die Figur neu bauen? Die drei Spielfiguren sind aus drei Paketen
 * zusammengesetzt (`tools/figur-bauen.mjs`), mit über die Hautgewichte
 * zurechtgeschnittenem Körper, umgehängten Häuten und ausgedünnten Clips. Sie
 * neu zu backen riskiert Unterschiede an Stellen, um die es gar nicht geht –
 * und nötig ist es nicht: die UV-Koordinaten bleiben dieselben, nur das Bild
 * dahinter wird feiner.
 *
 * **Wann sich das lohnt, entscheidet die Texeldichte, nicht das Gefühl.**
 * Wie viele Texel je Meter ein Teil bekommt, steht in seiner UV-Spanne gegen
 * seine Maße; wie viele Bildpunkte je Meter der Bildschirm hat, steht in
 * Bildhöhe und Abstand. Liegt die Textur darüber, ändert eine feinere nichts.
 * Gemessen an den drei Figuren: von sieben Texturen brauchten genau zwei eine
 * höhere Auflösung – die Hose und die Ärmel. Die schlechtesten Dichten hatte
 * nackte Haut, und dort steht kein Detail drin, das mehr Auflösung zeigen
 * könnte.
 *
 * **Die Sicherheitsprüfung ist der Kern.** Bevor etwas getauscht wird, werden
 * beide Bilder auf 256 gebracht und verglichen. Ist die Quelle nicht dieselbe
 * Textur – anderes Paket, anderer Zuschnitt, verwechselter Dateiname –, sieht
 * man das hinterher an der Figur und weiß nicht, woher es kommt. Also vorher,
 * und im Zweifel Abbruch.
 *
 *   node tools/figur-textur.mjs public/assets/characters/qua_barbar.glb \
 *     --bild=T_Peasant_BaseColor=/pfad/T_Peasant_BaseColor.png --textur=1024
 *
 * **Der zweite Modus tauscht nichts, sondern hellt auf.** Manche Kleidung ist
 * so dunkel gezeichnet, dass im Bild nichts von ihr ankommt: die Hose der drei
 * Spielfiguren steht in der Textur bei 23 von 255 und rendert mit 2. Dagegen
 * hilft keine Auflösung und keine Beleuchtung, sondern nur ein helleres Bild.
 *
 * Aufgehellt wird **genau der Bereich, den ein Mesh benutzt**, nicht die ganze
 * Textur: der Kittel auf derselben Textur ist mit 76 in Ordnung und soll es
 * bleiben. Den Bereich liefert das Mesh selbst – seine UV-Dreiecke werden in
 * eine Maske gerastert und um ein paar Bildpunkte geweitet, damit die Naht
 * nicht stehen bleibt.
 *
 * Gesagt wird **das Ziel, nicht die Kurve**: `--aufhellen=<Mesh>:<Leuchtdichte>`
 * sucht den Gamma-Wert, mit dem der Bereich genau dort ankommt. Eine Kurve von
 * Hand zu raten hieße, an einer Zahl zu drehen, deren Wirkung man nicht kennt.
 *
 *   node tools/figur-textur.mjs public/assets/characters/qua_barbar.glb \
 *     --aufhellen=Male_Peasant_Legs:60
 */

import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';


const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

/**
 * Sind das dieselben Bilder? Beide auf 256 bringen und die mittlere Abweichung
 * je Bildpunkt messen. Verkleinern und neu kodieren verschiebt Werte um ein
 * paar Stufen; ein anderes Motiv liegt um Größenordnungen daneben.
 */
async function gleichesMotiv(sharp, a, b) {
  const klein = (x) => sharp(x).resize(256, 256, { fit: 'fill' }).removeAlpha().greyscale().raw().toBuffer();
  const [x, y] = await Promise.all([klein(a), klein(b)]);
  let summe = 0, groesste = 0;
  for (let i = 0; i < x.length; i++) {
    const d = Math.abs(x[i] - y[i]);
    summe += d;
    if (d > groesste) groesste = d;
  }
  return { mittel: summe / x.length, groesste };
}

/**
 * Die UV-Fläche eines Primitivs in eine Maske rastern.
 *
 * Gerastert wird über Schwerpunktkoordinaten, Dreieck für Dreieck. Danach wird
 * die Maske geweitet: UV-Inseln enden genau an der Naht, und ein Bildpunkt, der
 * beim Filtern von außerhalb dazugeholt wird, bliebe sonst dunkel und zöge
 * einen Rand um jedes Hosenbein.
 */
function uvFlaeche(prim, breite, hoehe) {
  const uv = prim.getAttribute('TEXCOORD_0');
  const idx = prim.getIndices();
  const anzahl = idx ? idx.getCount() : uv.getCount();
  const ecke = (k) => {
    const i = idx ? idx.getScalar(k) : k;
    const a = [0, 0];
    uv.getElement(i, a);
    return [a[0] * breite, a[1] * hoehe];
  };

  const maske = new Uint8Array(breite * hoehe);
  for (let k = 0; k + 2 < anzahl; k += 3) {
    const [p0, p1, p2] = [ecke(k), ecke(k + 1), ecke(k + 2)];
    const x0 = Math.max(0, Math.floor(Math.min(p0[0], p1[0], p2[0])));
    const x1 = Math.min(breite - 1, Math.ceil(Math.max(p0[0], p1[0], p2[0])));
    const y0 = Math.max(0, Math.floor(Math.min(p0[1], p1[1], p2[1])));
    const y1 = Math.min(hoehe - 1, Math.ceil(Math.max(p0[1], p1[1], p2[1])));
    const fl = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]);
    if (Math.abs(fl) < 1e-9) continue;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5;
        const a = ((p1[0] - px) * (p2[1] - py) - (p2[0] - px) * (p1[1] - py)) / fl;
        const b = ((p2[0] - px) * (p0[1] - py) - (p0[0] - px) * (p2[1] - py)) / fl;
        const c = 1 - a - b;
        if (a >= -1e-6 && b >= -1e-6 && c >= -1e-6) maske[y * breite + x] = 1;
      }
    }
  }

  return maske;
}

/**
 * Die Maske um ein paar Bildpunkte weiten – aber nicht in fremdes Gebiet.
 *
 * Geweitet werden muss, weil UV-Inseln genau an der Naht enden: ein Bildpunkt,
 * den der Filter von außerhalb dazuholt, bliebe sonst dunkel und zöge einen
 * Rand um jedes Hosenbein. Auf einem dichten Atlas liegt hinter dieser Naht
 * aber schon das nächste Teil. Deshalb ist `gesperrt` die Fläche aller anderen
 * Teile auf derselben Textur: dorthin wächst nichts. Ohne diese Sperre stiegen
 * beim Schurken Gürtel, Stiefel und Wams um ein bis zwei Stufen mit – wenig,
 * aber es waren Teile, um die es nicht ging.
 */
function weiten(maske, gesperrt, breite, hoehe, schritte) {
  for (let s = 0; s < schritte; s++) {
    const vorher = maske.slice();
    for (let y = 0; y < hoehe; y++) {
      for (let x = 0; x < breite; x++) {
        const i = y * breite + x;
        if (vorher[i] || gesperrt[i]) continue;
        const nachbar = (vorher[y * breite + Math.max(0, x - 1)] || vorher[y * breite + Math.min(breite - 1, x + 1)]
          || vorher[Math.max(0, y - 1) * breite + x] || vorher[Math.min(hoehe - 1, y + 1) * breite + x]);
        if (nachbar) maske[i] = 1;
      }
    }
  }
  return maske;
}

/** Leuchtdichte der maskierten Bildpunkte. */
function leuchtdichte(buf, maske) {
  let s = 0, n = 0;
  for (let i = 0; i < maske.length; i++) {
    if (!maske[i]) continue;
    const k = i * 3;
    s += 0.2126 * buf[k] + 0.7152 * buf[k + 1] + 0.0722 * buf[k + 2];
    n++;
  }
  return n ? s / n : 0;
}

/**
 * Den Gamma-Wert suchen, mit dem der maskierte Bereich bei `ziel` landet.
 *
 * Nicht ausgerechnet, sondern eingegabelt: die Kurve wirkt je Bildpunkt, und
 * der Mittelwert der verbogenen Werte ist nicht der verbogene Mittelwert.
 * Dreißig Halbierungen reichen für drei Nachkommastellen.
 */
function gammaFuer(buf, maske, ziel) {
  const messen = (g) => {
    let s = 0, n = 0;
    for (let i = 0; i < maske.length; i++) {
      if (!maske[i]) continue;
      const k = i * 3;
      const f = (v) => 255 * Math.pow(v / 255, g);
      s += 0.2126 * f(buf[k]) + 0.7152 * f(buf[k + 1]) + 0.0722 * f(buf[k + 2]);
      n++;
    }
    return n ? s / n : 0;
  };
  let lo = 0.05, hi = 1;
  if (messen(hi) >= ziel) return { gamma: 1, erreicht: messen(1) };
  for (let i = 0; i < 30; i++) {
    const m = (lo + hi) / 2;
    if (messen(m) < ziel) hi = m; else lo = m;
  }
  const g = (lo + hi) / 2;
  return { gamma: g, erreicht: messen(g) };
}

const args = process.argv.slice(2);
const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const quelle = args.find((a) => !a.startsWith('--'));
const ziel = opt('ziel') || quelle;
const kante = +(opt('textur') || 1024);
// `--bild=Name=Pfad`, mehrfach erlaubt
const auftraege = args.filter((a) => a.startsWith('--bild='))
  .map((a) => a.slice('--bild='.length))
  .map((s) => {
    const i = s.indexOf('=');
    return { name: s.slice(0, i), datei: s.slice(i + 1) };
  });

// `--aufhellen=Mesh:Leuchtdichte`, mehrfach erlaubt
const hellen = args.filter((a) => a.startsWith('--aufhellen='))
  .map((a) => a.slice('--aufhellen='.length))
  .map((t) => {
    const i = t.lastIndexOf(':');
    return { mesh: t.slice(0, i), ziel: +t.slice(i + 1) };
  });
const weitenSchritte = +(opt('weiten') ?? 4);

if (!quelle || (!auftraege.length && !hellen.length)) {
  console.error('Aufruf: node tools/figur-textur.mjs <figur.glb> --bild=<Texturname>=<quelle.png> [--textur=1024] [--ziel=<datei.glb>]');
  console.error('       node tools/figur-textur.mjs <figur.glb> --aufhellen=<Mesh>:<Leuchtdichte> [--weiten=4] [--ziel=<datei.glb>]');
  console.error('  Welche Texturen und Meshes eine Figur hat, zeigt `node tools/glb-info.mjs <figur.glb>`.');
  process.exit(1);
}

const sharp = (await import('sharp')).default;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(quelle);
const texturen = doc.getRoot().listTextures();

console.log(`\n\x1b[1m${quelle}\x1b[0m  ${kb(fs.statSync(quelle).size)}`);
let getauscht = 0;

for (const { name, datei } of auftraege) {
  const tex = texturen.find((t) => t.getName() === name);
  if (!tex) {
    console.error(`  \x1b[31m${name}: nicht in dieser Figur.\x1b[0m Vorhanden: ${texturen.map((t) => t.getName()).join(', ')}`);
    process.exit(1);
  }
  if (!fs.existsSync(datei)) {
    console.error(`  \x1b[31m${name}: Quelle fehlt – ${datei}\x1b[0m`);
    process.exit(1);
  }

  const alt = Buffer.from(tex.getImage());
  const altMass = tex.getSize();
  const neuMass = (await sharp(datei).metadata()).width;

  // Hochskalieren erfindet keine Details. Lieber nichts tun als so tun.
  if (neuMass < kante) {
    console.error(`  \x1b[31m${name}: die Quelle ist nur ${neuMass} Bildpunkte breit, verlangt sind ${kante}.\x1b[0m`);
    console.error('  Hochskalieren bringt keine Details – Abbruch.');
    process.exit(1);
  }

  const p = await gleichesMotiv(sharp, alt, datei);
  const passt = p.mittel < 6;
  console.log(`  ${name.padEnd(24)} ${altMass?.join('x')} → ${kante}x${kante}`
    + `   Abgleich: mittlere Abweichung ${p.mittel.toFixed(2)} von 255, größte ${p.groesste}`);
  if (!passt) {
    console.error(`  \x1b[31mDas ist nicht dieselbe Textur – Abbruch, damit keine fremde Zeichnung auf die Figur kommt.\x1b[0m`);
    process.exit(1);
  }

  const neu = await sharp(datei).resize(kante, kante, { fit: 'fill' }).webp({ quality: 90 }).toBuffer();
  tex.setImage(neu).setMimeType('image/webp');
  console.log(`  ${''.padEnd(24)} ${kb(alt.byteLength)} → ${kb(neu.byteLength)}`);
  getauscht++;
}

// Aufhellen: je genannter Mesh seinen UV-Bereich in der eigenen Textur anheben.
for (const { mesh, ziel: zielWert } of hellen) {
  // Alle Treffer sammeln, nicht den ersten nehmen. Namen sind in diesen
  // Modellen nicht eindeutig: beim Magier heißen Ärmel und nackter Arm beide
  // `Male_Peasant_Arms`, und sie liegen auf verschiedenen Texturen. Wer sich
  // still den ersten greift, hellt irgendwann eine Hand auf.
  const treffer = [];
  for (const m of doc.getRoot().listMeshes()) {
    if (m.getName() !== mesh) continue;
    for (const pr of m.listPrimitives()) {
      const t = pr.getMaterial()?.getBaseColorTexture();
      if (pr.getAttribute('TEXCOORD_0') && t) treffer.push({ prim: pr, tex: t, mat: pr.getMaterial() });
    }
  }
  if (!treffer.length) {
    const namen = doc.getRoot().listMeshes().map((m) => m.getName()).join(', ');
    console.error(`  \x1b[31m${mesh}: kein Mesh dieses Namens mit Textur.\x1b[0m Vorhanden: ${namen}`);
    process.exit(1);
  }
  if (treffer.length > 1) {
    console.error(`  \x1b[31m${mesh}: ${treffer.length} Meshes tragen diesen Namen.\x1b[0m`);
    for (const t of treffer) console.error(`    Material ${t.mat.getName()}, Textur ${t.tex.getName()}`);
    console.error('  Welches gemeint ist, kann das Werkzeug nicht wissen – Abbruch.');
    process.exit(1);
  }
  const { prim, tex } = treffer[0];

  const bild = sharp(Buffer.from(tex.getImage()));
  const { width, height } = await bild.metadata();
  const buf = await bild.removeAlpha().raw().toBuffer();
  // Sperrgebiet: alles, was andere Teile auf derselben Textur belegen.
  const gesperrt = new Uint8Array(width * height);
  for (const m of doc.getRoot().listMeshes()) {
    for (const pr of m.listPrimitives()) {
      if (pr === prim) continue;
      if (pr.getMaterial()?.getBaseColorTexture() !== tex) continue;
      if (!pr.getAttribute('TEXCOORD_0')) continue;
      const f = uvFlaeche(pr, width, height);
      for (let i = 0; i < f.length; i++) if (f[i]) gesperrt[i] = 1;
    }
  }
  const maske = weiten(uvFlaeche(prim, width, height), gesperrt, width, height, weitenSchritte);
  const flaeche = maske.reduce((a, b) => a + b, 0);
  const vorher = leuchtdichte(buf, maske);
  const { gamma, erreicht } = gammaFuer(buf, maske, zielWert);

  if (gamma >= 1) {
    console.log(`  ${mesh.padEnd(24)} liegt schon bei ${vorher.toFixed(0)} – nichts zu tun.`);
    continue;
  }

  // Die Kurve wirkt nur innerhalb der Maske. Außerhalb bleibt jeder Bildpunkt,
  // wie er war – auf derselben Textur liegen Teile, die in Ordnung sind.
  const kurve = new Uint8Array(256);
  for (let v = 0; v < 256; v++) kurve[v] = Math.round(255 * Math.pow(v / 255, gamma));
  for (let i = 0; i < maske.length; i++) {
    if (!maske[i]) continue;
    const k = i * 3;
    buf[k] = kurve[buf[k]]; buf[k + 1] = kurve[buf[k + 1]]; buf[k + 2] = kurve[buf[k + 2]];
  }

  const alt = tex.getImage().byteLength;
  const neu = await sharp(buf, { raw: { width, height, channels: 3 } }).webp({ quality: 90 }).toBuffer();
  tex.setImage(neu).setMimeType('image/webp');
  console.log(`  ${mesh.padEnd(24)} ${tex.getName()}  ${width}x${height}`
    + `   Fläche ${(100 * flaeche / maske.length).toFixed(1)} % der Textur`);
  console.log(`  ${''.padEnd(24)} Leuchtdichte ${vorher.toFixed(0)} → ${erreicht.toFixed(0)} (Ziel ${zielWert})`
    + `   Gamma ${gamma.toFixed(3)}   ${kb(alt)} → ${kb(neu.byteLength)}`);
  getauscht++;
}

// **Kein `prune`, kein `dedup`.** Getauscht wird ein Bild, sonst nichts – und
// je weniger das Werkzeug anfasst, desto leichter ist hinterher zu sehen, dass
// es nichts anderes angefasst hat. (`prune` hätte hier zwei tote Accessoren
// mitgenommen, die schon in der Vorlage lagen. Harmlos, aber es gehört nicht
// zur Aufgabe, und bei der nächsten Figur wäre es vielleicht nicht harmlos.)
await io.write(ziel, doc);
console.log(`\n${ziel}  ${kb(fs.statSync(ziel).size)}   ${getauscht} Textur(en) getauscht\n`);
