#!/usr/bin/env node
/**
 * Einen modularen Bausatz zu einer einzigen GLB zusammenpacken.
 *
 * Modulare Kits liefern jedes Bauteil als eigene Datei – Wand, Fenster, Dach,
 * Treppe –, und jede bringt dieselben Texturen mit. Einzeln nach GLB gewandelt
 * läge dieselbe 512er-Putztextur in einem Dutzend Dateien; das Offline-Paket
 * zahlt jede Kopie.
 *
 * Deshalb: alle Teile in ein Dokument, gleiche Texturen zusammenlegen
 * (`dedup`), einmal verkleinern, einmal ausliefern. Jedes Teil bekommt einen
 * Knoten mit seinem Dateinamen; im Spiel holt `spawnKitPart(kit, name)` eine
 * Kopie davon.
 *
 *   node tools/kit-packen.mjs --textur=512 ziel.glb teil1.gltf teil2.gltf …
 *   node tools/kit-packen.mjs --textur=512 --liste=dorf.txt ziel.glb quellordner/
 *
 * Mit `--liste` steht ein Name je Zeile (ohne Endung); leere Zeilen und Zeilen
 * mit `#` werden übersprungen. So bleibt die Auswahl nachvollziehbar.
 */

import fs from 'node:fs';
import path from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mergeDocuments, dedup, prune, unpartition, textureCompress } from '@gltf-transform/functions';

const mb = (n) => `${(n / 1048576).toFixed(2)} MB`;

/** Dreiecke aller Meshes zusammenzählen. */
function dreiecke(wurzel) {
  let n = 0;
  for (const m of wurzel.listMeshes()) {
    for (const p of m.listPrimitives()) {
      const idx = p.getIndices();
      n += (idx ? idx.getCount() : p.getAttribute('POSITION')?.getCount() || 0) / 3;
    }
  }
  return Math.round(n);
}

/**
 * Ein Bauteil übernehmen: Inhalt der Quelle in die Sammlung kopieren und alles,
 * was in ihrer Szene stand, unter einen Knoten mit dem Teilenamen hängen.
 *
 * `mergeDocuments` liefert die Zuordnung alt → neu; darüber finden wir genau
 * die Knoten dieser Quelle wieder, ohne raten zu müssen. Die mitkopierte Szene
 * selbst fliegt danach weg – behalten wird nur der eine Sammelknoten.
 */
function teilUebernehmen(sammlung, quelle, name, szene) {
  const karte = mergeDocuments(sammlung, quelle);
  const knoten = sammlung.createNode(name);
  for (const alt of quelle.getRoot().listScenes()) {
    const neu = karte.get(alt);
    if (!neu) continue;
    for (const kind of neu.listChildren()) knoten.addChild(kind);
    neu.dispose();
  }
  szene.addChild(knoten);
  return knoten.listChildren().length;
}

const args = process.argv.slice(2);
const opt = (n, d = '') => args.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const textur = +opt('textur', 0);
const listeDatei = opt('liste');
const rein = args.filter((a) => !a.startsWith('--'));
const [ziel, ...quellen] = rein;

if (!ziel || !quellen.length) {
  console.error('Aufruf: node tools/kit-packen.mjs [--textur=512] [--liste=auswahl.txt] <ziel.glb> <teil.gltf … | ordner>');
  process.exit(1);
}

// Dateien einsammeln: entweder direkt genannt, oder Ordner plus Auswahlliste.
let dateien = [];
if (listeDatei) {
  const namen = fs.readFileSync(listeDatei, 'utf8').split('\n')
    .map((z) => z.replace(/#.*/, '').trim()).filter(Boolean);
  const ordner = quellen[0];
  for (const n of namen) {
    const p = ['gltf', 'glb'].map((e) => path.join(ordner, `${n}.${e}`)).find((p) => fs.existsSync(p));
    if (!p) { console.error(`\x1b[33mFehlt im Bausatz: ${n}\x1b[0m`); process.exitCode = 2; continue; }
    dateien.push(p);
  }
} else {
  dateien = quellen;
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = new Document();
const szene = doc.createScene('kit');

let quellBytes = 0;
for (const datei of dateien) {
  const q = await io.read(datei);
  const name = path.basename(datei).replace(/\.(gltf|glb)$/i, '');
  const kinder = teilUebernehmen(doc, q, name, szene);
  quellBytes += fs.statSync(datei).size;
  if (!kinder) console.error(`\x1b[33m${name}: keine Geometrie übernommen\x1b[0m`);
}

// Nur die Farbtextur behalten. Normalen- und Rauheitskarten kosten je Material
// zwei weitere Bilder, und im Cel-Stil sieht man von ihnen nichts: dort zählt
// die Lichtstufen-Rampe, nicht die Oberfläche. Im realistischen Stil legt
// `surface.js` ohnehin eigene Strukturen auf die Props.
if (args.includes('--nur-farbe')) {
  for (const m of doc.getRoot().listMaterials()) {
    m.setNormalTexture(null);
    m.setOcclusionTexture(null);
    m.setMetallicRoughnessTexture(null);
    m.setEmissiveTexture(null);
  }
}

const schritte = [dedup(), prune({ keepAttributes: false, keepLeaves: true })];
if (textur) {
  const sharp = (await import('sharp')).default;
  schritte.push(textureCompress({
    encoder: sharp,
    targetFormat: opt('format', 'webp'),
    resize: [textur, textur],
    resizeFilter: 'lanczos3',
  }));
}
schritte.push(unpartition());
await doc.transform(...schritte);

fs.mkdirSync(path.dirname(path.resolve(ziel)), { recursive: true });
await io.write(ziel, doc);

const wurzel = doc.getRoot();
const teile = szene.listChildren().map((k) => k.getName());
const bilder = wurzel.listTextures().map((t) => {
  const g = t.getSize();
  return `${t.getName() || '?'} ${g ? `${g[0]}×${g[1]}` : '?'}`;
});
console.log(`${path.basename(ziel)}  ${mb(fs.statSync(ziel).size)}`
  + `   Teile ${teile.length}   Dreiecke ${dreiecke(wurzel)}`
  + `   Materialien ${wurzel.listMaterials().length}   Texturen ${wurzel.listTextures().length}`);
console.log(`  Quellen zusammen ${mb(quellBytes)} (ohne geteilte Texturen gerechnet)`);
if (bilder.length) console.log(`  ${bilder.join(', ')}`);
