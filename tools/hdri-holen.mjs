#!/usr/bin/env node
/**
 * Holt eine HDRI von Poly Haven (CC0) und legt sie unter `public/assets/hdri/`
 * ab – die Lichtquelle des realistischen Stils.
 *
 *   node tools/hdri-holen.mjs kloofendal_48d_partly_cloudy_puresky [--res=1k]
 *
 * Warum eine HDRI und nicht der gerechnete Himmel: der gerechnete liefert Werte
 * bis knapp über 1. Gemessen lag damit das ganze Bild zwischen 0,09 und 0,5 –
 * kein Glanz, keine tiefen Schatten, nichts, woraus eine Belichtung etwas machen
 * könnte. Eine HDRI bringt die echten Größenordnungen mit: Himmel um 1, Sonne
 * tausendfach darüber. Erst damit lohnt sich Tone-Mapping überhaupt.
 *
 * `--res=2k` gäbe einen schärferen Himmel, kostet aber 5,3 statt 1,4 MB.
 */

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith('--'));
const res = args.find((a) => a.startsWith('--res='))?.split('=')[1] || '1k';
const zielOrdner = 'public/assets/hdri';

if (!name) {
  console.error('Aufruf: node tools/hdri-holen.mjs <polyhaven-name> [--res=1k]');
  console.error('Namen finden: https://polyhaven.com/hdris');
  process.exit(1);
}

const mb = (n) => `${(n / 1048576).toFixed(2)} MB`;

const dateien = await (await fetch(`https://api.polyhaven.com/files/${name}`)).json();
const eintrag = dateien?.hdri?.[res]?.hdr;
if (!eintrag) {
  console.error(`Keine HDR-Datei in ${res} für "${name}".`);
  console.error(`Vorhanden: ${Object.keys(dateien?.hdri || {}).join(', ') || '–'}`);
  process.exit(2);
}

const info = await (await fetch(`https://api.polyhaven.com/info/${name}`)).json();
fs.mkdirSync(zielOrdner, { recursive: true });
const ziel = path.join(zielOrdner, 'himmel.hdr');

const antwort = await fetch(eintrag.url);
if (!antwort.ok) { console.error(`Download fehlgeschlagen: ${antwort.status}`); process.exit(3); }
fs.writeFileSync(ziel, Buffer.from(await antwort.arrayBuffer()));

// Herkunft danebenlegen – CC0 verlangt keine Nennung, aber wir wollen wissen,
// woher die Datei kommt, wenn sie jemand austauschen will.
fs.writeFileSync(path.join(zielOrdner, 'HERKUNFT.txt'),
  `${info.name || name}\n`
  + `Poly Haven, CC0 1.0 (gemeinfrei)\n`
  + `https://polyhaven.com/a/${name}\n`
  + `Auflösung ${res}, geladen am ${new Date().toISOString().slice(0, 10)}\n`
  + `Autoren: ${Object.keys(info.authors || {}).join(', ') || 'Poly Haven'}\n`);

console.log(`${ziel}  ${mb(fs.statSync(ziel).size)}   (${info.name || name}, ${res})`);
