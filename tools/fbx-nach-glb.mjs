#!/usr/bin/env node
/**
 * Mixamo-Dateien einsammeln und zu einer GLB zusammenführen.
 *
 * Mixamo gibt jede Animation als eigene FBX heraus; das Spiel will alle Clips
 * in einer Datei. Dieses Skript wandelt jede FBX nach glTF und hängt die
 * Animationen an die erste Datei an – die muss deshalb die mit dem Körper sein
 * („With Skin"), alle weiteren dürfen ohne sein („Without Skin").
 *
 * Zwei Stolpersteine, die hier abgefangen werden:
 *
 *  - **Mixamo nennt jede Animation „mixamo.com".** Ohne Umbenennen hießen alle
 *    Clips gleich und `AnimationClip.findByName` fände immer denselben. Der
 *    Clip bekommt deshalb den Dateinamen, oder den Namen hinter einem `=`.
 *  - **Die Kanäle zeigen auf die Knochen ihrer eigenen Datei.** Beim
 *    Zusammenführen müssen sie auf die Knochen der ersten Datei umgehängt
 *    werden, sonst animieren sie unsichtbare Zweitskelette. Der Abgleich läuft
 *    über den Knochennamen – bei Mixamo ist das Skelett in allen Dateien
 *    identisch, also passt das.
 *
 *   node tools/fbx-nach-glb.mjs ziel.glb koerper.fbx laufen.fbx=Walk rennen.fbx=Run
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mergeDocuments, prune, dedup, unpartition } from '@gltf-transform/functions';

const require = createRequire(import.meta.url);

/** Pfad zur mitgelieferten FBX2glTF-Binärdatei für dieses Betriebssystem. */
function konverter() {
  const wurzel = path.dirname(require.resolve('fbx2gltf/package.json'));
  const datei = os.platform() === 'win32' ? 'FBX2glTF.exe' : 'FBX2glTF';
  const p = path.join(wurzel, 'bin', os.type(), datei);
  if (!fs.existsSync(p)) throw new Error(`FBX2glTF nicht gefunden: ${p}`);
  fs.chmodSync(p, 0o755);
  return p;
}

/**
 * FBX nach GLB wandeln. Ist die Eingabe schon eine GLB, bleibt sie, wie sie ist –
 * so lässt sich das Zusammenführen auch ohne Mixamo-Dateien prüfen.
 */
function nachGlb(datei, ziel) {
  if (/\.(glb|gltf)$/i.test(datei)) return datei;
  execFileSync(konverter(), ['--binary', '--input', datei, '--output', ziel], { stdio: 'pipe' });
  // FBX2glTF hängt je nach Version die Endung selbst an
  for (const k of [ziel, `${ziel}.glb`]) if (fs.existsSync(k)) return k;
  throw new Error(`Umwandlung ohne Ergebnis: ${datei}`);
}

/**
 * Alle Animationen aus `quelle` in `basis` übernehmen und ihre Kanäle auf die
 * Knochen der Basis umhängen.
 *
 * `mergeDocuments` kopiert die ganze Quelle hinein und liefert eine Zuordnung
 * von alten zu neuen Objekten. Darüber finden wir genau die Animationen, die
 * gerade dazugekommen sind – ohne raten zu müssen, welche das waren.
 */
function animationenUebernehmen(basis, quelle, name) {
  const knochen = new Map();
  for (const k of basis.getRoot().listNodes()) knochen.set(k.getName(), k);

  const karte = mergeDocuments(basis, quelle);
  const dazu = quelle.getRoot().listAnimations().map((a) => karte.get(a)).filter(Boolean);

  let umgehaengt = 0, verloren = 0;
  for (const [i, anim] of dazu.entries()) {
    anim.setName(dazu.length > 1 ? `${name}_${i + 1}` : name);
    for (const kanal of anim.listChannels()) {
      const ziel = kanal.getTargetNode();
      if (!ziel) continue;
      const echt = knochen.get(ziel.getName());
      if (echt && echt !== ziel) { kanal.setTargetNode(echt); umgehaengt++; }
      else if (!echt) verloren++;
    }
  }
  // Vom Mitkopierten soll nur die Animation bleiben, nicht ein zweiter Körper
  // mit eigenem Skelett. Szenen, Meshes und Häute weg – und danach die Knochen,
  // auf die kein Kanal mehr zeigt. `prune` allein reicht nicht: solange eine
  // Haut ihre Knochen kennt, gelten sie als benutzt.
  for (const szene of quelle.getRoot().listScenes()) karte.get(szene)?.dispose();
  for (const mesh of quelle.getRoot().listMeshes()) karte.get(mesh)?.dispose();
  for (const haut of quelle.getRoot().listSkins()) karte.get(haut)?.dispose();

  const nochGebraucht = new Set();
  for (const a of basis.getRoot().listAnimations()) {
    for (const k of a.listChannels()) { const z = k.getTargetNode(); if (z) nochGebraucht.add(z); }
  }
  let entfernt = 0;
  for (const k of quelle.getRoot().listNodes()) {
    const kopie = karte.get(k);
    if (kopie && !nochGebraucht.has(kopie)) { kopie.dispose(); entfernt++; }
  }
  return { clips: dazu.length, umgehaengt, verloren, entfernt };
}

const args = process.argv.slice(2);
const [ziel, ...eingaben] = args;
if (!ziel || !eingaben.length) {
  console.error('Aufruf: node tools/fbx-nach-glb.mjs <ziel.glb> <koerper.fbx[=Name]> [weitere.fbx[=Name] …]');
  console.error('Die erste Datei muss den Körper enthalten (Mixamo: „With Skin").');
  process.exit(1);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fbx-'));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
let basis = null;

try {
  for (const [i, eingabe] of eingaben.entries()) {
    const [datei, wunschname] = eingabe.split('=');
    const name = wunschname || path.basename(datei).replace(/\.(fbx|glb|gltf)$/i, '');
    const glb = nachGlb(path.resolve(datei), path.join(tmp, `t${i}.glb`));
    const doc = await io.read(glb);

    if (!basis) {
      basis = doc;
      const anims = basis.getRoot().listAnimations();
      for (const a of anims) a.setName(name);
      console.log(`${path.basename(datei).padEnd(28)} Körper + ${anims.length} Clip(s) als „${name}"`);
      continue;
    }
    const r = animationenUebernehmen(basis, doc, name);
    console.log(`${path.basename(datei).padEnd(28)} ${r.clips} Clip(s) als „${name}"`
      + `   Kanäle umgehängt ${r.umgehaengt}   Zweitknochen entfernt ${r.entfernt}`
      + (r.verloren ? `   \x1b[33mohne passenden Knochen: ${r.verloren}\x1b[0m` : ''));
  }

  // Jede eingelesene Datei bringt ihren eigenen Datenpuffer mit, eine GLB darf
  // aber nur einen haben. `unpartition` legt alles in einen zusammen.
  await basis.transform(dedup(), prune({ keepAttributes: false, keepLeaves: true }), unpartition());
  fs.mkdirSync(path.dirname(path.resolve(ziel)), { recursive: true });
  await io.write(ziel, basis);

  const namen = basis.getRoot().listAnimations().map((a) => a.getName());
  console.log(`\n${ziel}  ${(fs.statSync(ziel).size / 1048576).toFixed(2)} MB`);
  console.log(`Clips: ${namen.join(', ')}`);
  const doppelt = namen.filter((n, i) => namen.indexOf(n) !== i);
  if (doppelt.length) console.log(`\x1b[33mDoppelte Namen: ${[...new Set(doppelt)].join(', ')} – das Spiel fände nur den ersten.\x1b[0m`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
