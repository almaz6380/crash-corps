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

if (!quelle || !auftraege.length) {
  console.error('Aufruf: node tools/figur-textur.mjs <figur.glb> --bild=<Texturname>=<quelle.png> [--textur=1024] [--ziel=<datei.glb>]');
  console.error('  Welche Texturen eine Figur hat, zeigt `node tools/glb-info.mjs <figur.glb>`.');
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

// **Kein `prune`, kein `dedup`.** Getauscht wird ein Bild, sonst nichts – und
// je weniger das Werkzeug anfasst, desto leichter ist hinterher zu sehen, dass
// es nichts anderes angefasst hat. (`prune` hätte hier zwei tote Accessoren
// mitgenommen, die schon in der Vorlage lagen. Harmlos, aber es gehört nicht
// zur Aufgabe, und bei der nächsten Figur wäre es vielleicht nicht harmlos.)
await io.write(ziel, doc);
console.log(`\n${ziel}  ${kb(fs.statSync(ziel).size)}   ${getauscht} Textur(en) getauscht\n`);
