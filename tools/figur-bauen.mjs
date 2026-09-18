#!/usr/bin/env node
/**
 * Eine Spielfigur aus modularen Teilen zusammenbauen.
 *
 * Die Quaternius-Pakete teilen sich ein Skelett (65 Knochen, „Universal Rig"),
 * liefern aber getrennt aus, was eine Figur ausmacht: Körper und Kopf in den
 * „Universal Base Characters", Kleidung in „Modular Character Outfits", und die
 * Bewegungen noch einmal woanders, in der „Universal Animation Library". Das
 * Spiel will eine einzige GLB je Figur.
 *
 * Drei Dinge passieren hier:
 *
 *  - **Aus der Animationsbibliothek wird das Gerüst.** Sie bringt Skelett und
 *    Clips mit; ihre Anzeigepuppe fliegt raus und unsere Teile kommen hinein.
 *    So muss keine Animation umgerechnet werden.
 *  - **Die Hautbindung der Teile wird umgehängt.** Jedes Teil bringt sein
 *    eigenes Skelett mit; die Knochen heißen überall gleich, also zeigen wir
 *    die Haut auf die Knochen des Gerüsts und werfen die Zweitskelette weg.
 *  - **Vom Basiskörper bleibt nur, was die Kleidung nicht bedeckt.** Die Outfits
 *    sind für eine andere Körperform geschnitten, deshalb schaut der nackte
 *    Körper sonst durch. Der Schnitt läuft über die Hautgewichte: ein Dreieck
 *    bleibt, wenn alle drei Ecken überwiegend an einem der genannten Knochen
 *    hängen. Eine Höhengrenze wäre unsauber – der Hals steht je nach Pose
 *    anders. Für eine bekleidete Figur bleibt nur der Kopf (Vorgabe), für einen
 *    nackten Oberkörper `--behalten=Head,neck,spine,clavicle,upperarm,lowerarm,hand`.
 *
 *   node tools/figur-bauen.mjs ziel.glb --anim=UAL.glb --basis=Basis.gltf \
 *     --clips=Idle_Loop:Idle,Jog_Fwd_Loop:Run --textur=512 teil1.gltf teil2.gltf
 */

import fs from 'node:fs';
import path from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mergeDocuments, dedup, prune, unpartition, textureCompress, weld, simplify, resample } from '@gltf-transform/functions';

const mb = (n) => `${(n / 1048576).toFixed(2)} MB`;

/** Knochen eines Dokuments nach Namen, aus der ersten Haut. */
function knochenKarte(doc) {
  const karte = new Map();
  for (const haut of doc.getRoot().listSkins()) {
    for (const k of haut.listJoints()) if (!karte.has(k.getName())) karte.set(k.getName(), k);
  }
  return karte;
}

/**
 * Dreiecke aussieben und die Eckdaten neu packen.
 *
 * `behalten(i)` entscheidet je Ecke. Ein Dreieck bleibt, wenn alle drei Ecken
 * durchkommen. Danach werden nur die benutzten Ecken übernommen – sonst bliebe
 * der ganze Körper als unsichtbare Datenlast in der Datei stehen.
 */
function primitivSieben(doc, prim, behalten) {
  const idx = prim.getIndices();
  const anzahl = idx ? idx.getCount() : prim.getAttribute('POSITION').getCount();
  const alt = (k) => (idx ? idx.getScalar(k) : k);

  const dreiecke = [];
  for (let k = 0; k + 2 < anzahl; k += 3) {
    const e = [alt(k), alt(k + 1), alt(k + 2)];
    if (e.every(behalten)) dreiecke.push(e);
  }
  if (!dreiecke.length) return 0;

  const neuIndex = new Map();
  const reihenfolge = [];
  const neueIndizes = [];
  for (const e of dreiecke) {
    for (const v of e) {
      if (!neuIndex.has(v)) { neuIndex.set(v, reihenfolge.length); reihenfolge.push(v); }
      neueIndizes.push(neuIndex.get(v));
    }
  }

  for (const name of prim.listSemantics()) {
    const a = prim.getAttribute(name);
    const breite = a.getElementSize();
    const werte = new Float32Array(reihenfolge.length * breite);
    const puffer = new Array(breite);
    reihenfolge.forEach((v, i) => {
      a.getElement(v, puffer);
      werte.set(puffer, i * breite);
    });
    const neu = doc.createAccessor(a.getName())
      .setType(a.getType())
      .setBuffer(a.getBuffer())
      .setArray(name.startsWith('JOINTS') ? new Uint16Array(werte) : werte);
    if (name.startsWith('JOINTS') || name.startsWith('WEIGHTS')) neu.setNormalized(a.getNormalized());
    prim.setAttribute(name, neu);
  }
  prim.setIndices(doc.createAccessor().setType('SCALAR')
    .setBuffer(prim.getAttribute('POSITION').getBuffer())
    .setArray(new Uint32Array(neueIndizes)));
  return dreiecke.length;
}

/** Wie stark eine Ecke an den gesuchten Knochen hängt: Summe ihrer Gewichte. */
function knochenAnteil(prim, i, kopfIndizes) {
  const j = prim.getAttribute('JOINTS_0');
  const w = prim.getAttribute('WEIGHTS_0');
  if (!j || !w) return 0;
  const je = j.getElement(i, [0, 0, 0, 0]);
  const we = w.getElement(i, [0, 0, 0, 0]);
  let summe = 0;
  for (let k = 0; k < je.length; k++) if (kopfIndizes.has(je[k])) summe += we[k];
  return summe;
}

/**
 * Ein Teil in das Gerüst übernehmen: Geometrie herüberholen, Haut auf die
 * Knochen des Gerüsts umhängen, mitgekommenes Zweitskelett entsorgen.
 */
function teilUebernehmen(gerüst, quelle, szene, knochen) {
  const karte = mergeDocuments(gerüst, quelle);
  const eigene = [];
  let fehlende = 0;

  for (const haut of quelle.getRoot().listSkins()) {
    const neu = karte.get(haut);
    if (!neu) continue;
    const alteGelenke = neu.listJoints();
    for (const g of alteGelenke) neu.removeJoint(g);
    for (const g of alteGelenke) {
      const echt = knochen.get(g.getName());
      if (echt) neu.addJoint(echt); else { neu.addJoint(g); fehlende++; }
    }
    const wurzel = knochen.get('root');
    if (wurzel) neu.setSkeleton(wurzel);
  }

  for (const knoten of quelle.getRoot().listNodes()) {
    const neu = karte.get(knoten);
    if (neu?.getMesh()) { szene.addChild(neu); eigene.push(neu); }
  }

  // Alles, was nicht Geometrie trägt, wieder wegwerfen: Szenen, Skelettkopien.
  for (const s of quelle.getRoot().listScenes()) karte.get(s)?.dispose();
  const behalten = new Set(eigene);
  for (const knoten of quelle.getRoot().listNodes()) {
    const neu = karte.get(knoten);
    if (neu && !behalten.has(neu) && !neu.getMesh()) neu.dispose();
  }
  return { meshes: eigene.length, fehlende };
}

const args = process.argv.slice(2);
const opt = (n, d = '') => args.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=') ?? d;
const rein = args.filter((a) => !a.startsWith('--'));
const [ziel, ...teile] = rein;
const animDatei = opt('anim');
const basisDatei = opt('basis');
const textur = +opt('textur', 0);
// Knochenstämme, nicht volle Namen: „hand" trifft auch hand_l und hand_r,
// „index" alle Fingerglieder. Sonst müsste man 30 Namen aufzählen.
const behalteKnochen = opt('behalten', 'Head,neck').split(',').filter(Boolean);
const schwelle = +opt('schwelle', 0.5);
/** Trifft ein Knochenname einen der gesuchten Stämme? */
const trifft = (name) => behalteKnochen.some((s) => name === s || name.startsWith(s));

if (!ziel || !animDatei) {
  console.error('Aufruf: node tools/figur-bauen.mjs <ziel.glb> --anim=<bibliothek.glb> [--basis=<basis.gltf>]');
  console.error('        [--behalten=Head,neck] [--clips=Quelle:Ziel,…] [--textur=512] [--nur-farbe]');
  console.error('        [--dreiecke=9000] [--schwelle=0.5] <teil.gltf …>');
  process.exit(1);
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const gerüst = await io.read(animDatei);
const wurzel = gerüst.getRoot();
const szene = wurzel.listScenes()[0];
const knochen = knochenKarte(gerüst);
console.log(`Gerüst ${path.basename(animDatei)}: ${knochen.size} Knochen, ${wurzel.listAnimations().length} Clips`);

// Die Anzeigepuppe der Bibliothek fliegt raus – ihre Knochen bleiben.
for (const k of wurzel.listNodes()) if (k.getMesh()) k.dispose();
for (const m of wurzel.listMeshes()) m.dispose();
for (const h of wurzel.listSkins()) h.dispose();

// Basiskörper: nur die Dreiecke behalten, die an den genannten Knochen hängen.
if (basisDatei) {
  const basisDoc = await io.read(basisDatei);
  const haut = basisDoc.getRoot().listSkins()[0];
  const indizes = new Set();
  haut?.listJoints().forEach((g, i) => { if (trifft(g.getName())) indizes.add(i); });
  if (!indizes.size) {
    console.log(`\x1b[33mKein Knochen passt auf „${behalteKnochen.join(', ')}" – der Basiskörper bliebe leer.\x1b[0m`);
    process.exit(2);
  }

  for (const knoten of basisDoc.getRoot().listNodes()) {
    const mesh = knoten.getMesh();
    if (!mesh) continue;
    // Augen und Brauen sitzen ohnehin nur am Kopf – nur der Körper wird beschnitten.
    const istKoerper = mesh.listPrimitives().some((p) => p.getAttribute('POSITION').getCount() > 3000);
    if (!istKoerper) continue;
    for (const prim of mesh.listPrimitives()) {
      const vorher = (prim.getIndices()?.getCount() || prim.getAttribute('POSITION').getCount()) / 3;
      const behalten = (i) => knochenAnteil(prim, i, indizes) > schwelle;
      const nachher = primitivSieben(basisDoc, prim, behalten);
      console.log(`  Schnitt ${knoten.getName()}: ${Math.round(vorher)} → ${nachher} Dreiecke`
        + `   (${indizes.size} von ${haut.listJoints().length} Knochen)`);
      if (!nachher) console.log('\x1b[33m  nichts übrig – Schwelle oder Knochennamen prüfen\x1b[0m');
    }
  }
  const r = teilUebernehmen(gerüst, basisDoc, szene, knochen);
  console.log(`  Basis übernommen: ${r.meshes} Meshes${r.fehlende ? `, ${r.fehlende} Knochen ohne Entsprechung` : ''}`);
}

for (const datei of teile) {
  const doc = await io.read(datei);
  const r = teilUebernehmen(gerüst, doc, szene, knochen);
  console.log(`  ${path.basename(datei).padEnd(28)} ${r.meshes} Meshes`
    + (r.fehlende ? `   \x1b[33m${r.fehlende} Knochen ohne Entsprechung\x1b[0m` : ''));
}

// Clips aussieben und umbenennen. Was nicht genannt ist, fliegt raus – Kanäle
// und Sampler einzeln, sonst bleiben ihre Kurvendaten in der Datei liegen.
const clipListe = opt('clips');
if (clipListe) {
  const wunsch = new Map(clipListe.split(',').map((e) => e.split(':')));
  let weg = 0, gefunden = 0;
  for (const a of wurzel.listAnimations()) {
    const neu = wunsch.get(a.getName());
    if (neu) { a.setName(neu); gefunden++; continue; }
    for (const c of a.listChannels()) c.dispose();
    for (const s of a.listSamplers()) s.dispose();
    a.dispose();
    weg++;
  }
  const fehlt = [...wunsch.keys()].filter((k) => !wurzel.listAnimations().some((a) => a.getName() === wunsch.get(k)));
  console.log(`Clips: ${gefunden} behalten, ${weg} verworfen`
    + (fehlt.length ? `   \x1b[33mnicht gefunden: ${fehlt.join(', ')}\x1b[0m` : ''));
}

// Nur die Farbtextur behalten. Im Cel-Stil sieht man von Normalen- und
// Rauheitskarten nichts, sie kosten aber je Material zwei weitere Bilder.
if (args.includes('--nur-farbe')) {
  for (const m of wurzel.listMaterials()) {
    m.setNormalTexture(null);
    m.setOcclusionTexture(null);
    m.setMetallicRoughnessTexture(null);
    m.setEmissiveTexture(null);
  }
}

// `resample` wirft Schlüsselbilder weg, die sich aus ihren Nachbarn ergeben.
// Die Bibliothek speichert jede Bewegung mit 30 Bildern je Sekunde für alle 65
// Knochen, auch wenn ein Finger die ganze Zeit stillsteht – das ist der größte
// Posten in der Datei, größer als die Geometrie.
const schritte = [dedup(), resample(), prune({ keepAttributes: false, keepLeaves: true })];

// Dreiecke reduzieren. Figuren aus Paketen für große Engines kommen mit dem
// Zehnfachen dessen, was ein Browserspiel auf dem Handy verträgt – und die
// Arena zeichnet jedes Bild zweimal (Normalen-Pass, dann Farbe). `weld()` muss
// davor laufen, sonst zerreißt das Vereinfachen die Oberfläche an doppelten
// Ecken. Unter etwa 6000 franst die Verformung an Schultern und Fingern aus.
const zielDreiecke = +opt('dreiecke', 0);
if (zielDreiecke) {
  let jetzt = 0;
  for (const m of wurzel.listMeshes()) {
    for (const p of m.listPrimitives()) {
      const i = p.getIndices();
      jetzt += (i ? i.getCount() : p.getAttribute('POSITION')?.getCount() || 0) / 3;
    }
  }
  if (jetzt > zielDreiecke) {
    const { MeshoptSimplifier } = await import('meshoptimizer');
    await MeshoptSimplifier.ready;
    schritte.push(weld());
    schritte.push(simplify({
      simplifier: MeshoptSimplifier,
      ratio: zielDreiecke / jetzt,
      error: +opt('fehler', 0.02),
      lockBorder: true,
    }));
  }
}

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
await gerüst.transform(...schritte);

fs.mkdirSync(path.dirname(path.resolve(ziel)), { recursive: true });
await io.write(ziel, gerüst);

let dreiecke = 0;
for (const m of wurzel.listMeshes()) {
  for (const p of m.listPrimitives()) {
    const idx = p.getIndices();
    dreiecke += (idx ? idx.getCount() : p.getAttribute('POSITION')?.getCount() || 0) / 3;
  }
}
console.log(`\n${path.basename(ziel)}  ${mb(fs.statSync(ziel).size)}`
  + `   Dreiecke ${Math.round(dreiecke)}   Meshes ${wurzel.listMeshes().length}`
  + `   Clips ${wurzel.listAnimations().length}   Texturen ${wurzel.listTextures().length}`);
console.log(`Clips: ${wurzel.listAnimations().map((a) => a.getName()).join(', ')}`);
