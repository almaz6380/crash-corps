#!/usr/bin/env node
/**
 * Holt einen Textursatz von Poly Haven (CC0) und legt ihn passend für
 * `src/surface.js` ab: `diff`, `nor`, `rough` unter `public/assets/textures/<ziel>/`.
 *
 *   node tools/textur-holen.mjs <polyhaven-name> <ziel> [--res=1k] [--groesse=1024]
 *   node tools/textur-holen.mjs medieval_blocks_02 dorf_stein --groesse=1024
 *
 * Poly Haven liefert 1k-JPGs mit rund 1 MB je Karte. Das Spiel lädt drei Karten
 * je Satz und ein halbes Dutzend Sätze – deshalb wird hier verkleinert und als
 * WebP neu komprimiert. Aus 3 MB werden so rund 300 KB, sichtbar ist davon auf
 * einer Hauswand nichts.
 *
 * Die Rauheitskarte bekommt die halbe Kantenlänge: sie trägt keine Struktur,
 * nur Verlauf, und niemand sieht eine unscharfe Rauheit.
 */

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (n, d) => args.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const rein = args.filter((a) => !a.startsWith('--'));
const [name, ziel] = rein;
const res = opt('res', '1k');
const groesse = +opt('groesse', 1024);

if (!name || !ziel) {
  console.error('Aufruf: node tools/textur-holen.mjs <polyhaven-name> <ziel-ordner> [--res=1k] [--groesse=1024]');
  process.exit(1);
}

const sharp = (await import('sharp')).default;
const kb = (n) => `${Math.round(n / 1024)} KB`;

const dateien = await (await fetch(`https://api.polyhaven.com/files/${name}`)).json();
if (!dateien || dateien.error) { console.error(`Unbekannt: ${name}`); process.exit(2); }

/** Poly Haven benennt die Karten je nach Satz unterschiedlich. */
const KARTEN = {
  diff: ['Diffuse', 'diff', 'albedo', 'Color', 'col'],
  nor: ['nor_gl', 'nor_dx', 'Normal', 'normal'],
  rough: ['Rough', 'rough', 'roughness', 'arm'],
};

function urlFuer(art) {
  for (const schluessel of KARTEN[art]) {
    const eintrag = dateien[schluessel]?.[res];
    const datei = eintrag?.jpg || eintrag?.png || Object.values(eintrag || {})[0];
    if (datei?.url) return datei.url;
  }
  return null;
}

const ordner = path.join('public/assets/textures', ziel);
fs.mkdirSync(ordner, { recursive: true });

let summe = 0;
for (const art of ['diff', 'nor', 'rough']) {
  const url = urlFuer(art);
  if (!url) { console.error(`\x1b[33m${name}: keine ${art}-Karte in ${res}\x1b[0m`); process.exitCode = 3; continue; }
  const roh = Buffer.from(await (await fetch(url)).arrayBuffer());
  const kante = art === 'rough' ? Math.max(256, groesse / 2) : groesse;
  const bild = await sharp(roh).resize(kante, kante, { kernel: 'lanczos3' })
    .jpeg({ quality: art === 'nor' ? 92 : 86, mozjpeg: true }).toBuffer();
  const pfad = path.join(ordner, `${art}.jpg`);
  fs.writeFileSync(pfad, bild);
  summe += bild.length;
  console.log(`  ${art.padEnd(5)} ${String(kante).padStart(4)}px  ${kb(bild.length).padStart(7)}  (roh ${kb(roh.length)})`);
}

const info = await (await fetch(`https://api.polyhaven.com/info/${name}`)).json();
fs.appendFileSync(path.join('public/assets/textures', 'HERKUNFT.txt'),
  `${ziel}: ${info.name || name} – https://polyhaven.com/a/${name} – CC0\n`);

console.log(`${ordner}  zusammen ${kb(summe)}`);
