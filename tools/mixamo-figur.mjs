#!/usr/bin/env node
/**
 * Eine Mixamo-Figur einbauen – vom Download-Ordner bis zum Manifest-Eintrag.
 *
 * Mixamo gibt je Bewegung eine eigene FBX heraus. Bis eine davon im Spiel
 * läuft, liegen sechs Schritte dazwischen, und jeder einzelne scheitert still:
 * ein falscher Clipname findet nichts, ein falscher Knochenname gibt nur eine
 * Warnung, eine falsche Blickrichtung lässt die Figur rückwärts rennen, ein
 * falsches `walkSpeed` lässt sie über den Boden rutschen. Dieses Skript macht
 * alle sechs auf einmal und **misst**, was sich messen lässt:
 *
 *   1. jede FBX nach glTF wandeln (`tools/fbx-nach-glb.mjs`)
 *   2. aus dem Dateinamen den Clipnamen bestimmen, den `assets.js` erwartet
 *   3. alle Clips in die Datei mit dem Körper hängen
 *   4. `mixamorig:` von den Knochennamen streichen
 *   5. Texturen verkleinern
 *   6. Blickrichtung und Gangtempo messen (`tools/gangtempo.mjs`) und daraus
 *      den fertigen Eintrag für `CHARACTER_MODELS` ausgeben
 *
 *   node tools/mixamo-figur.mjs ~/Downloads/ritter --id=mix_ritter --waffe=axt --hoehe=1.95
 *
 * Was das Skript **nicht** kann: die Dateien holen. Mixamo verlangt eine
 * Adobe-Anmeldung. Die Anleitung dazu steht in public/assets/MIXAMO.md.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, unpartition, textureCompress } from '@gltf-transform/functions';
import { nachGlb, animationenUebernehmen } from './fbx-nach-glb.mjs';
import { glbTeile, gangtempo, blickrichtung, modellHoehe } from './gangtempo.mjs';
import { glbJson, knochenRaten } from './glb-info.mjs';

/**
 * Dateiname → Clipname, den `src/assets.js` erwartet.
 *
 * Die Reihenfolge ist Absicht: „Rifle Aiming Idle" enthält *beides*, und
 * „Standing React Death" enthält „React". Wer zuerst passt, gewinnt – also
 * stehen die engeren Begriffe oben.
 */
const ROLLEN = [
  ['Death', /death|dying|\bdie\b|tod|sterb/i],
  ['Roll',  /roll|dodge|dive|rolle|hecht|ausweich/i],
  ['Aim',   /aim|zielen|anschlag/i],
  ['Shoot', /shoot|fir(e|ing)|attack|slash|stab|cast|schuss|schlag|angriff|zauber/i],
  ['Hit',   /hit|react|impact|treffer/i],
  ['Run',   /run|sprint|jog|rennen/i],
  ['Walk',  /walk|gehen|schreiten/i],
  ['Idle',  /idle|stehen|breathing|atmen/i],
];

/** Welcher Clipname gehört zu dieser Datei? `null`, wenn keine Regel greift. */
export function rolle(datei) {
  const n = path.basename(datei).replace(/\.(fbx|glb|gltf)$/i, '');
  for (const [name, re] of ROLLEN) if (re.test(n)) return name;
  return null;
}

/** Hat dieses Dokument einen Körper – also eine Haut mit Mesh? */
function hatKoerper(doc) {
  return doc.getRoot().listSkins().length > 0 && doc.getRoot().listMeshes().length > 0;
}

/**
 * `mixamorig:Hips` → `Hips`.
 *
 * Nötig ist das nicht fürs Auffinden – `instantiate()` in `assets.js` sucht
 * über eine normalisierte Form. Aber `upperBones` vergleicht mit `startsWith`
 * gegen die **Spurnamen**, und three streicht dort Doppelpunkte heraus
 * (`mixamorig:LeftArm` wird zu `mixamorigLeftArm`). Ein Manifest, das dann
 * `mixamorig…` als Präfix führen müsste, ist eine Falle für den Nächsten.
 */
export function knochenEntpraefixen(doc) {
  let n = 0;
  const belegt = new Set(doc.getRoot().listNodes().map((k) => k.getName()));
  for (const k of doc.getRoot().listNodes()) {
    const alt = k.getName();
    const neu = alt.replace(/^mixamorig\d*:?/i, '');
    if (!neu || neu === alt) continue;
    if (belegt.has(neu)) continue;            // Namen nicht zusammenfallen lassen
    belegt.delete(alt); belegt.add(neu);
    k.setName(neu); n++;
  }
  return n;
}

/**
 * `upperBones` aus dem Skelett ableiten – nicht aus einer Namensliste.
 *
 * `buildLayerClips` in `assets.js` behält eine Spur, wenn ihr Knotenname mit
 * einem dieser Einträge **beginnt**. Das ist scharf geladen: ein Präfix `Arm`
 * trifft auch `Armature`, und damit läge die ganze Figur in der Anschlagsebene
 * und bliebe beim Zielen stehen. Ein Präfix `Left` träfe `LeftUpLeg`, und die
 * Beine blieben stehen, sobald jemand die Waffe hebt.
 *
 * Deshalb wird gemessen statt geraten: Oberkörper ist der Wirbelknochen mit
 * allem, was unter ihm hängt – Hals, Kopf, Schultern, Arme, Finger. Alles
 * andere ist unten. Danach werden Präfixe gesucht, die **nur** oben treffen,
 * und davon die kürzesten genommen.
 *
 * @param {object} json JSON-Teil der GLB
 * @param {string} spine Name des Wirbelknochens (aus `knochenRaten`)
 * @returns {string[]} Präfixe für `upperBones`
 */
export function oberkoerper(json, spine) {
  const nodes = json.nodes || [];
  const idx = nodes.findIndex((n) => n.name === spine);
  if (idx < 0) return [];

  const oben = new Set();
  const sammeln = (i) => {
    if (nodes[i].name) oben.add(nodes[i].name);
    for (const c of nodes[i].children || []) sammeln(c);
  };
  sammeln(idx);
  const unten = nodes.map((n) => n.name).filter((n) => n && !oben.has(n));

  // Kandidaten: der Name selbst und jede Kürzung um Ziffern und Trennzeichen
  // am Ende. Aus `Spine1` wird so auch `Spine`, aus `spine_01` auch `spine`.
  const kandidaten = new Set();
  const KUERZEN = [
    // Seite: `hand_l` → `hand`. Das einzelne l/r nur **mit** Trennzeichen,
    // sonst wird aus `LeftShoulder` ein `LeftShoulde`.
    /[._-](l|r)$/i,
    /[._-]?(left|right)$/i,
    /[._-]?(leaf|end|tip)$/i,     // Endknochen: index_04_leaf → index_04
    /[0-9]+$/,                    // Nummer: spine_01 → spine_
    /[._-]+$/,                    // Trennzeichen: spine_ → spine
  ];
  for (const n of oben) {
    let k = n;
    kandidaten.add(k);
    while (k.length > 3) {
      const kurz = KUERZEN.reduce((v, re) => v.replace(re, ''), k);
      if (kurz === k || kurz.length < 3) break;
      k = kurz; kandidaten.add(k);
    }
  }

  // Ein Präfix ist nur brauchbar, wenn es keinen Knochen unterhalb trifft.
  const sauber = [...kandidaten].filter((k) => !unten.some((n) => n.startsWith(k)));

  // Greedy: immer das Präfix nehmen, das am meisten Offenes abdeckt; bei
  // Gleichstand das kürzere – das bleibt beim Lesen verständlich.
  const offen = new Set(oben);
  const gewaehlt = [];
  while (offen.size) {
    let best = null, bestN = 0;
    for (const k of sauber) {
      let n = 0;
      for (const o of offen) if (o.startsWith(k)) n++;
      if (n > bestN || (n === bestN && n > 0 && best && k.length < best.length)) { best = k; bestN = n; }
    }
    if (!best) break;
    gewaehlt.push(best);
    for (const o of [...offen]) if (o.startsWith(best)) offen.delete(o);
  }
  return gewaehlt.sort();
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name, fallback = null) => {
    const a = args.find((x) => x.startsWith(`--${name}=`));
    return a ? a.split('=').slice(1).join('=') : fallback;
  };
  const ordner = args.find((a) => !a.startsWith('--'));
  if (!ordner) {
    console.error('Aufruf: node tools/mixamo-figur.mjs <ordner> --id=mix_ritter [--waffe=axt] [--hoehe=1.95] [--textur=1024]');
    console.error('  <ordner> enthält die Mixamo-Downloads. Eine Datei muss den Körper haben („With Skin").');
    console.error('  Anleitung: public/assets/MIXAMO.md');
    return 1;
  }
  const id = opt('id') || path.basename(ordner).toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const waffe = opt('waffe', 'axt');
  const zielHoehe = +(opt('hoehe', '1.85'));
  const texturMass = +(opt('textur', '1024'));
  const zielDatei = opt('ziel') || `public/assets/characters/${id}.glb`;

  const dateien = fs.readdirSync(ordner)
    .filter((f) => /\.(fbx|glb|gltf)$/i.test(f))
    .sort()
    .map((f) => path.join(ordner, f));
  if (!dateien.length) {
    console.error(`Keine FBX- oder GLB-Dateien in ${ordner}.`);
    return 1;
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mixamo-'));
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

  try {
    /* ---------- 1 + 2: wandeln und Rollen verteilen ---------- */
    console.log(`\n\x1b[1m${dateien.length} Datei(en) aus ${ordner}\x1b[0m`);
    const teile = [];
    for (const [i, datei] of dateien.entries()) {
      const glb = nachGlb(path.resolve(datei), path.join(tmp, `t${i}.glb`));
      const doc = await io.read(glb);
      const name = rolle(datei) || path.basename(datei).replace(/\.(fbx|glb|gltf)$/i, '');
      const koerper = hatKoerper(doc);
      teile.push({ datei, doc, name, koerper });
      console.log(`  ${path.basename(datei).padEnd(38)} → \x1b[1m${name.padEnd(7)}\x1b[0m`
        + (koerper ? ' (mit Körper)' : ''));
      if (!rolle(datei)) {
        console.log(`    \x1b[33mkeine Regel getroffen – Datei umbenennen (z. B. „walk.fbx"), sonst kennt assets.js den Clip nicht\x1b[0m`);
      }
    }

    const doppelt = teile.map((t) => t.name).filter((n, i, a) => a.indexOf(n) !== i);
    if (doppelt.length) {
      console.log(`\n\x1b[33mZwei Dateien wollen denselben Clipnamen: ${[...new Set(doppelt)].join(', ')}.`
        + ` Das Spiel fände nur den ersten – eine davon umbenennen.\x1b[0m`);
    }

    /* ---------- 3: zusammenführen ---------- */
    const basisTeil = teile.find((t) => t.koerper && t.name === 'Idle') || teile.find((t) => t.koerper);
    if (!basisTeil) {
      console.error('\n\x1b[31mKeine Datei bringt einen Körper mit.\x1b[0m Bei Mixamo muss genau eine');
      console.error('Bewegung mit „Skin: With Skin" heruntergeladen werden, der Rest ohne.');
      return 1;
    }
    const basis = basisTeil.doc;
    for (const a of basis.getRoot().listAnimations()) a.setName(basisTeil.name);
    console.log(`\n  Körper aus ${path.basename(basisTeil.datei)}`);

    for (const t of teile) {
      if (t === basisTeil) continue;
      const r = animationenUebernehmen(basis, t.doc, t.name);
      console.log(`  ${t.name.padEnd(7)} übernommen: ${r.clips} Clip(s), Kanäle umgehängt ${r.umgehaengt}`
        + (r.verloren ? `, \x1b[33mohne passenden Knochen ${r.verloren}\x1b[0m` : ''));
    }

    /* ---------- 4 + 5: Knochennamen und Texturen ---------- */
    const entpraefixt = knochenEntpraefixen(basis);
    if (entpraefixt) console.log(`\n  „mixamorig:" von ${entpraefixt} Knochennamen gestrichen`);

    const schritte = [dedup(), prune({ keepAttributes: false, keepLeaves: true }), unpartition()];
    if (texturMass) {
      try {
        const sharp = (await import('sharp')).default;
        schritte.splice(2, 0, textureCompress({ encoder: sharp, resize: [texturMass, texturMass], resizeFilter: 'lanczos3' }));
      } catch {
        console.log(`  \x1b[33msharp fehlt – Texturen bleiben, wie sie sind (npm i -D sharp)\x1b[0m`);
      }
    }
    await basis.transform(...schritte);

    fs.mkdirSync(path.dirname(path.resolve(zielDatei)), { recursive: true });
    await io.write(zielDatei, basis);
    console.log(`\n\x1b[1m${zielDatei}\x1b[0m  ${(fs.statSync(zielDatei).size / 1048576).toFixed(2)} MB`);

    /* ---------- 6: messen und Eintrag ausgeben ---------- */
    const { json, bin } = glbTeile(zielDatei);
    const hoehe = modellHoehe(json);
    const massstab = hoehe ? zielHoehe / hoehe : 1;
    const richtung = blickrichtung(json);
    const knochenNamen = (json.nodes || []).map((n) => n.name).filter(Boolean);
    const bones = knochenRaten(knochenNamen.map((name) => ({ name })));
    const fehlt = Object.entries(bones).filter(([, v]) => !v).map(([k]) => k);
    const vorhanden = new Set((json.animations || []).map((a) => a.name));
    const tempo = (clip) => {
      const e = gangtempo(json, bin, clip);
      return e ? +(e.tempo * massstab).toFixed(2) : null;
    };
    const walk = tempo('Walk'), run = tempo('Run');
    const dauer = (clip) => {
      const a = (json.animations || []).find((x) => x.name === clip);
      if (!a) return null;
      let t = 0;
      for (const s of a.samplers || []) { const m = json.accessors?.[s.input]?.max?.[0]; if (m > t) t = m; }
      return +t.toFixed(2);
    };

    console.log(`\n  Modellhöhe ${hoehe.toFixed(2)} m → im Spiel ${zielHoehe.toFixed(2)} m (Maßstab ${massstab.toFixed(3)})`);
    console.log(richtung
      ? `  Blick ${(richtung.blick * 180 / Math.PI).toFixed(1)}° → yaw ${richtung.yaw.toFixed(3)}`
      : '  \x1b[33mBlickrichtung nicht messbar – yaw bleibt 0. Rennt die Figur rückwärts: yaw: Math.PI\x1b[0m');
    console.log(`  Gangtempo im Spielmaßstab: Walk ${walk ?? '–'} m/s, Run ${run ?? '–'} m/s`);
    if (run && run < 3) {
      console.log(`  \x1b[33mDer Lauf-Clip ist für ${run} m/s gebaut, die Klassen laufen 5–8 m/s.`);
      console.log(`  Bei Mixamo „Fast Run" oder „Sprint" nehmen, sonst rudern die Beine hinterher.\x1b[0m`);
    }

    const eintrag = {
      url: zielDatei.replace(/^public\//, ''),
      yaw: richtung ? +richtung.yaw.toFixed(3) : 0,
      bones,
      clips: Object.fromEntries(
        [['idle', 'Idle'], ['walk', 'Walk'], ['run', 'Run'], ['death', 'Death'], ['roll', 'Roll']]
          .filter(([, v]) => vorhanden.has(v))),
      upperBones: oberkoerper(json, bones.spine),
      layers: Object.fromEntries(
        [['aim', 'Aim'], ['shoot', 'Shoot'], ['hit', 'Hit']].filter(([, v]) => vorhanden.has(v))),
      cycle: { walk: dauer('Walk'), run: dauer('Run'), walkSpeed: walk, runSpeed: run },
      waffenform: waffe,
      grip: { pos: [0, 0.06, 0.02], rot: [-1.5708, 0, 0], scale: 0.9 },
      viewmodel: { form: waffe, laenge: 0.72, rot: [0.12, 2.75, 0.2], pos: [0, -0.04, 0.05] },
      tintMaterials: (json.materials || []).map((m) => m.name).filter(Boolean),
      tintMix: 0.35,
    };

    console.log(`\n\x1b[1mEintrag für CHARACTER_MODELS in src/assets.js\x1b[0m`);
    console.log(`  ${id}: ` + JSON.stringify(eintrag, null, 2).replace(/\n/g, '\n  ') + ',');
    if (fehlt.length) {
      console.log(`\n  \x1b[33mNicht erraten: ${fehlt.join(', ')} – aus der Knochenliste nachtragen:\x1b[0m`);
      console.log(`  ${knochenNamen.join(', ')}`);
    }
    console.log(`\n  Noch von Hand: \x1b[1mgrip\x1b[0m und \x1b[1mviewmodel\x1b[0m – wie die Waffe in der Hand liegt.`);
    console.log(`  Danach in src/classes.js bei einer Klasse \x1b[1mmodel: '${id}'\x1b[0m setzen und \x1b[1mnpm run build\x1b[0m.\n`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// Der Prüflauf in tools/ lädt `rolle` und `oberkoerper` als Modul – dann darf
// hier nichts losgehen.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit((await main()) || 0);
}
