#!/usr/bin/env node
/**
 * GLB-Dateien für dieses Spiel zurechtschneiden.
 *
 * Fertige Figurenpakete bringen alles mit, was irgendein Spiel je brauchen
 * könnte: sitzen, liegen, jubeln, mit zwei Waffen fechten. Ein Arena-Shooter
 * benutzt davon ein Dutzend Clips. Der Rest kostet trotzdem Platz – nicht nur
 * als Kurvendaten, sondern vor allem als Buchhaltung im JSON-Teil: 76 Clips mal
 * 41 Knochen mal zwei Kanäle sind über sechstausend Einträge, die vorgehalten,
 * geladen und geparst werden wollen.
 *
 * Das Skript wirft alles weg, was nicht auf der Liste steht, räumt danach die
 * verwaisten Daten weg und packt die Datei neu. Es läuft beim Vorbereiten der
 * Assets, nie im Spiel – die Abhängigkeiten stehen deshalb unter devDependencies.
 *
 *   node tools/glb-schlanken.mjs quelle.glb ziel.glb Idle Walking_A Running_A …
 *   node tools/glb-schlanken.mjs --liste=men quelle.glb ziel.glb
 *   node tools/glb-schlanken.mjs --liste=men --quantisieren quelle.glb ziel.glb
 *
 * Mit `--liste` greifen die unten hinterlegten Zusammenstellungen; sie müssen zu
 * dem passen, was der Eintrag in `src/assets.js` unter `clips` und `layers`
 * nennt. Fehlt ein Clip später im Spiel, meldet sich niemand: `instantiate`
 * überspringt ihn stillschweigend.
 */

import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, weld, quantize } from '@gltf-transform/functions';

/** Feste Zusammenstellungen je Figurenfamilie. Namen wie in der Quelldatei. */
export const LISTEN = {
  // Quaternius „Ultimate Modular Men" – die Clips, die assets.js nennt
  men: ['Idle_Gun', 'Walk', 'Run', 'Run_Left', 'Run_Right', 'Run_Back',
        'Death', 'Roll', 'Idle_Gun_Pointing', 'Gun_Shoot', 'HitRecieve'],
  // Quaternius „Ultimate Monsters" – Monster ohne Ziel- und Seitwärts-Clips.
  // `Weapon` ist der Hieb, der beim Schuss über den Oberkörper gelegt wird.
  monster: ['Idle', 'Walk', 'Run', 'Death', 'HitReact', 'Weapon'],
  // KayKit Adventurers / Skeletons
  kay: ['Idle', 'Walking_A', 'Running_A', 'Running_Strafe_Left', 'Running_Strafe_Right',
        'Walking_Backwards', 'Death_A', 'Hit_A', 'Dodge_Forward',
        '2H_Melee_Idle', '2H_Ranged_Aiming', '2H_Ranged_Shoot',
        'Spellcast_Raise', 'Spellcast_Shoot'],
};

const mb = (n) => `${(n / 1048576).toFixed(2)} MB`;

async function schlanken(quelle, ziel, behalten, { quantisieren = false } = {}) {
  // Ohne die Erweiterungen schreibt der Ausgang stillschweigend eine kaputte
  // Datei: die Daten wären quantisiert, die Kennzeichnung dafür fehlte.
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(quelle);
  const wurzel = doc.getRoot();

  const vorher = fs.statSync(quelle).size;
  const alle = wurzel.listAnimations();
  const soll = new Set(behalten);
  const da = new Set(alle.map((a) => a.getName()));
  const fehlend = [...soll].filter((n) => !da.has(n));

  let weg = 0;
  for (const a of alle) {
    if (soll.has(a.getName())) continue;
    // Kanäle und Sampler einzeln wegwerfen. Nur die Animation zu verwerfen
    // lässt die Sampler stehen, und damit bleiben ihre Kurvendaten am Leben –
    // die Datei wird dann kaum kleiner.
    for (const c of a.listChannels()) c.dispose();
    for (const s of a.listSamplers()) s.dispose();
    a.dispose();
    weg++;
  }

  const schritte = [
    dedup(),                                        // gleiche Meshes und Accessoren zusammenlegen
    prune({ keepAttributes: false, keepLeaves: true }),   // Knochen bleiben, auch ungenutzte
  ];
  // Optional: Ecken zusammenfassen und Zahlen kleiner speichern. Three liest
  // KHR_mesh_quantization von sich aus, am Loader in assets.js ändert sich
  // nichts. Trotzdem nicht der Standard – es verändert die Geometrie.
  if (quantisieren) {
    schritte.push(weld());
    schritte.push(quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }));
  }
  await doc.transform(...schritte);

  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  await io.write(ziel, doc);
  const nachher = fs.statSync(ziel).size;

  console.log(`${path.basename(quelle).padEnd(24)} ${mb(vorher).padStart(8)} → ${mb(nachher).padStart(8)}`
    + `   ${(100 - (nachher / vorher) * 100).toFixed(0)} % kleiner`
    + `   Clips ${alle.length} → ${alle.length - weg}`);
  if (fehlend.length) {
    console.log(`  \x1b[33mNicht gefunden: ${fehlend.join(', ')}\x1b[0m`);
    console.log(`  \x1b[33mVorhanden wäre: ${[...da].slice(0, 12).join(', ')} …\x1b[0m`);
  }
  return { vorher, nachher, fehlend };
}

const args = process.argv.slice(2);
const liste = args.find((a) => a.startsWith('--liste='))?.split('=')[1];
const rein = args.filter((a) => !a.startsWith('--'));
const [quelle, ziel, ...clips] = rein;
const behalten = liste ? LISTEN[liste] : clips;

if (!quelle || !ziel || !behalten?.length) {
  console.error('Aufruf: node tools/glb-schlanken.mjs [--liste=men|kay] <quelle.glb> <ziel.glb> [Clip …]');
  console.error(`Listen: ${Object.keys(LISTEN).join(', ')}`);
  process.exit(1);
}
if (liste && !LISTEN[liste]) { console.error(`Unbekannte Liste: ${liste}`); process.exit(1); }

const { fehlend } = await schlanken(quelle, ziel, behalten,
  { quantisieren: args.includes('--quantisieren') });
process.exit(fehlend.length ? 2 : 0);
