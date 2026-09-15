#!/usr/bin/env node
/**
 * Was steckt in einer GLB-Datei?
 *
 * Ohne diese Ausgabe schreibt man den Eintrag in `CHARACTER_MODELS` blind – und
 * das Spiel schweigt dazu: ein falscher Knochenname gibt nur eine Warnung in der
 * Konsole, ein falscher Clip-Name gar nichts (`AnimationClip.findByName` liefert
 * null, `instantiate` überspringt ihn), und ein `tintMaterials`, das auf kein
 * Material passt, färbt eben nichts ein.
 *
 * Gelesen wird nur der JSON-Teil der Datei. Der enthält alles, was das Manifest
 * braucht: Knochen, Clips samt Dauer, Materialien, Maße, Blickrichtung. Kein
 * Three.js (dessen Loader will im Node fürs Laden von Bildern ein DOM), keine
 * zusätzliche Abhängigkeit.
 *
 *   node tools/glb-info.mjs public/assets/characters/men_punk.glb
 *   node tools/glb-info.mjs public/assets/characters/*.glb --kurz
 */

import fs from 'node:fs';
import path from 'node:path';

/** JSON-Teil einer GLB-Datei. Aufbau: 12 Byte Kopf, dann Blöcke aus Länge+Typ+Daten. */
export function glbJson(datei) {
  const b = fs.readFileSync(datei);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error(`${datei}: kein GLB (magic fehlt)`);
  const gesamt = b.readUInt32LE(8);
  let off = 12, json = null, binLen = 0;
  while (off + 8 <= Math.min(gesamt, b.length)) {
    const len = b.readUInt32LE(off), typ = b.readUInt32LE(off + 4);
    const daten = b.subarray(off + 8, off + 8 + len);
    if (typ === 0x4e4f534a) json = JSON.parse(daten.toString('utf8'));   // 'JSON'
    else if (typ === 0x004e4942) binLen = len;                          // 'BIN'
    off += 8 + len + ((4 - (len % 4)) % 4);
  }
  if (!json) throw new Error(`${datei}: kein JSON-Block`);
  return { json, binLen, dateiLen: b.length };
}

const KOMPONENTEN = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const ZAHL = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const bytes = (a) => (a ? a.count * (ZAHL[a.type] || 1) * (KOMPONENTEN[a.componentType] || 4) : 0);
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
const mb = (n) => `${(n / 1048576).toFixed(2)} MB`;

/**
 * Welche Regel aus `surface.js` trifft dieses Material im Stil `?stil=real`?
 * Die Namen sind dort eine Schnittstelle – ein „Cloth_Grey" glänzt wie Chrom.
 */
const LOOK = [
  [/metal|grey2|steel|tank|pipe/i, 'Metall (rau .42, metallisch .75)'],
  [/grey|silver|chrome/i, 'Grau/Chrom (rau .50, metallisch .55)'],
  [/red|blue|green|yellow|cyan|orange|enemy|main/i, 'Buntlack (rau .62, metallisch .35)'],
  [/wood|cardboard|tape|pallet/i, 'Holz (rau .94)'],
  [/sack|brick|concrete|stone|rust|dirt/i, 'Stein/Stoff (rau .98)'],
  [/skin/i, 'Haut (rau .72)'],
  [/black|dark/i, 'Dunkel (rau .68, metallisch .15)'],
];
const look = (name) => LOOK.find(([re]) => re.test(name))?.[1] || 'Standard (rau .80, metallisch .10)';

/** Knochen sind die Knoten, die in `skins[].joints` auftauchen. */
function knochen(j) {
  const ids = new Set();
  for (const s of j.skins || []) for (const n of s.joints || []) ids.add(n);
  return [...ids].map((i) => ({ i, name: j.nodes[i]?.name || `#${i}` }));
}

/** Namensvergleich wie in assets.js: Groß/Klein, Punkte, Doppelpunkte egal. */
const norm = (n) => n.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Rät die Manifest-Knochen aus den vorhandenen Namen. */
function knochenRaten(liste) {
  const treffer = (...muster) => {
    for (const m of muster) {
      const k = liste.find((b) => norm(b.name) === m) || liste.find((b) => norm(b.name).includes(m));
      if (k) return k.name;
    }
    return null;
  };
  return {
    hips: treffer('hips', 'pelvis', 'hip'),
    spine: treffer('abdomen', 'spine01', 'spine1', 'spine'),
    chest: treffer('chest', 'torso', 'spine02', 'spine2', 'upperchest'),
    head: treffer('head'),
    rightArm: treffer('upperarmr', 'rightarm', 'armr', 'shoulderr'),
    rightForeArm: treffer('lowerarmr', 'rightforearm', 'forearmr'),
    rightHand: treffer('wristr', 'righthand', 'handr'),
    leftArm: treffer('upperarml', 'leftarm', 'arml', 'shoulderl'),
    leftForeArm: treffer('lowerarml', 'leftforearm', 'forearml'),
    leftHand: treffer('wristl', 'lefthand', 'handl'),
  };
}

/** Dauer eines Clips: größter Zeitwert aller Eingangs-Accessoren. */
function clipDauer(j, anim) {
  let t = 0;
  for (const s of anim.samplers || []) {
    const a = j.accessors?.[s.input];
    if (a?.max?.[0] > t) t = a.max[0];
  }
  return t;
}

/** Maße und Blickrichtung aus den POSITION-Accessoren aller Meshes. */
function masse(j) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  let tris = 0, verts = 0;
  const attrBytes = {};
  for (const m of j.meshes || []) {
    for (const p of m.primitives || []) {
      const pos = j.accessors?.[p.attributes?.POSITION];
      if (pos?.min && pos?.max) {
        for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], pos.min[k]); hi[k] = Math.max(hi[k], pos.max[k]); }
      }
      verts += pos?.count || 0;
      const idx = j.accessors?.[p.indices];
      tris += idx ? idx.count / 3 : (pos?.count || 0) / 3;
      for (const [name, ai] of Object.entries(p.attributes || {})) {
        attrBytes[name] = (attrBytes[name] || 0) + bytes(j.accessors?.[ai]);
      }
      if (idx) attrBytes.INDEX = (attrBytes.INDEX || 0) + bytes(idx);
    }
  }
  return { lo, hi, tris: Math.round(tris), verts, attrBytes };
}

function bericht(datei, { kurz = false } = {}) {
  const { json: j, binLen, dateiLen } = glbJson(datei);
  const jochen = knochen(j);
  const anims = (j.animations || []).map((a) => ({ name: a.name || '(ohne Namen)', dauer: clipDauer(j, a) }));
  const mats = (j.materials || []).map((m) => m.name || '(ohne Namen)');
  const { lo, hi, tris, verts, attrBytes } = masse(j);
  const hoehe = hi[1] - lo[1];

  // Anteil der Animationsdaten am Binärteil
  let animBytes = 0;
  for (const a of j.animations || []) {
    for (const s of a.samplers || []) { animBytes += bytes(j.accessors?.[s.input]) + bytes(j.accessors?.[s.output]); }
  }

  console.log(`\n\x1b[1m${path.basename(datei)}\x1b[0m  ${mb(dateiLen)}`
    + `   Knochen ${jochen.length}   Clips ${anims.length}   Materialien ${mats.length}`
    + `   Bilder ${(j.images || []).length}`);
  console.log(`  Geometrie ${tris} Dreiecke / ${verts} Ecken`
    + `   Animationsdaten ${kb(animBytes)}   Binärteil ${mb(binLen)}`);
  console.log(`  Maße  Breite ${(hi[0] - lo[0]).toFixed(2)}  Höhe ${hoehe.toFixed(2)}  Tiefe ${(hi[2] - lo[2]).toFixed(2)}`
    + `   Füße bei y=${lo[1].toFixed(3)}`);
  if (kurz) return { datei, hoehe, anims, mats, jochen };

  console.log(`\n  \x1b[1mKnochen\x1b[0m (${jochen.length})`);
  console.log('   ' + jochen.map((b) => b.name).join(', '));

  console.log(`\n  \x1b[1mClips\x1b[0m (${anims.length}), Dauer in Sekunden`);
  for (const a of anims) console.log(`    ${a.name.padEnd(34)} ${a.dauer.toFixed(2)}`);

  console.log(`\n  \x1b[1mMaterialien\x1b[0m – Name entscheidet über tintMaterials und über ?stil=real`);
  for (const m of mats) console.log(`    ${m.padEnd(24)} ${look(m)}`);

  console.log(`\n  \x1b[1mSpeicher je Attribut\x1b[0m`);
  for (const [k, v] of Object.entries(attrBytes).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k.padEnd(12)} ${kb(v).padStart(8)}`);
  }

  // --- Vorlage fürs Manifest ---
  const g = knochenRaten(jochen);
  const fehlt = Object.entries(g).filter(([, v]) => !v).map(([k]) => k);
  const id = path.basename(datei, '.glb');
  const finde = (...m) => anims.find((a) => m.some((x) => norm(a.name) === x))?.name
    || anims.find((a) => m.some((x) => norm(a.name).includes(x)))?.name || null;
  const idle = finde('idle'), walk = finde('walk', 'walking'), run = finde('run', 'running');
  const eintrag = {
    url: `assets/characters/${id}.glb`,
    yaw: 0,
    bones: g,
    clips: {
      idle, walk, run,
      death: finde('death', 'die'), hit: finde('hit', 'hitreact', 'hitrecieve'),
      roll: finde('roll', 'dodge'),
    },
    cycle: {
      walk: +(anims.find((a) => a.name === walk)?.dauer || 1).toFixed(2),
      run: +(anims.find((a) => a.name === run)?.dauer || 1).toFixed(2),
      walkSpeed: 'TODO', runSpeed: 'TODO',
    },
    grip: 'TODO',
    tintMaterials: mats.slice(0, 1),
  };
  console.log(`\n  \x1b[1mVorlage für CHARACTER_MODELS\x1b[0m`);
  console.log('  ' + JSON.stringify(eintrag, null, 2).replace(/\n/g, '\n  '));
  if (fehlt.length) console.log(`  \x1b[33mNicht erraten: ${fehlt.join(', ')} – von Hand aus der Knochenliste nachtragen.\x1b[0m`);
  console.log(`  TODO: walkSpeed/runSpeed = Tempo in m/s, für das der Clip gebaut ist (im Spiel an den Füßen ablesen).`);
  console.log(`  TODO: grip = Versatz, Drehung, Größe der Waffe am Handknochen.`);
  return { datei, hoehe, anims, mats, jochen };
}

const args = process.argv.slice(2);
const kurz = args.includes('--kurz');
const dateien = args.filter((a) => !a.startsWith('--'));
if (!dateien.length) {
  console.error('Aufruf: node tools/glb-info.mjs <datei.glb> [weitere …] [--kurz]');
  process.exit(1);
}
for (const d of dateien) {
  try { bericht(d, { kurz }); }
  catch (e) { console.error(`\n${d}: ${e.message}`); }
}
console.log();
