#!/usr/bin/env node
/**
 * GLB nach OBJ, verpackt als ZIP – das Format, das Mixamo zum Hochladen mag.
 *
 * Der kostenlose Weg zu einer eigenen Figur führt über zwei Werkzeuge: ein
 * Bild-zu-3D-Dienst liefert ein nacktes Mesh als GLB, Mixamo hängt Skelett und
 * Animationen dran. Mixamo nimmt aber nur FBX, OBJ oder ZIP entgegen – glTF
 * versteht es nicht. Dieses Skript schlägt die Brücke.
 *
 * Herausgeschrieben werden:
 *   <name>.obj   Ecken, Normalen, Texturkoordinaten, Flächen
 *   <name>.mtl   Materialverweis auf die Textur
 *   <name>.png   die Textur, aus der GLB herausgelöst
 *   <name>.zip   alle drei zusammen
 *
 * Wichtig für den Rigger: nur die sichtbare Geometrie, eine einzige
 * zusammenhängende Figur, Weltkoordinaten ausgerechnet. Mixamo setzt die
 * Marker an Kinn, Handgelenken, Ellbogen, Knien und Leiste – mehrere lose
 * Teile oder ein Mesh im lokalen Koordinatensystem bringen es durcheinander.
 *
 *   node tools/glb-nach-obj.mjs figur.glb ausgabe/
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

/** 4x4-Matrix mal Punkt (Spaltenvektor, glTF speichert spaltenweise). */
function punkt(m, x, y, z) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

/** Normalen brauchen die inverse Transponierte; bei gleichmäßiger Skalierung
 *  reicht der Dreh-Anteil, und darum geht es hier: die Länge wird ohnehin neu
 *  normiert. */
function richtung(m, x, y, z) {
  const v = [
    m[0] * x + m[4] * y + m[8] * z,
    m[1] * x + m[5] * y + m[9] * z,
    m[2] * x + m[6] * y + m[10] * z,
  ];
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** Weltmatrix eines Knotens: alle Eltern hoch multipliziert. */
function weltmatrix(knoten) {
  const kette = [];
  for (let k = knoten; k; k = k.getParentNode?.()) kette.unshift(k);
  let m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const k of kette) m = mal(m, k.getMatrix());
  return m;
}

function mal(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let i = 0; i < 4; i++) s += a[i * 4 + r] * b[c * 4 + i];
      o[c * 4 + r] = s;
    }
  }
  return o;
}

export async function nachObj(quelle, ordner) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(quelle);
  const wurzel = doc.getRoot();
  const name = path.basename(quelle).replace(/\.(glb|gltf)$/i, '');
  fs.mkdirSync(ordner, { recursive: true });

  const obj = [`# aus ${path.basename(quelle)}`, `mtllib ${name}.mtl`, `o ${name}`];
  const vs = [], vns = [], vts = [], fs_ = [];
  let vOff = 1, vnOff = 1, vtOff = 1;      // OBJ zählt ab 1
  let dreiecke = 0, teile = 0;

  for (const knoten of wurzel.listNodes()) {
    const mesh = knoten.getMesh();
    if (!mesh) continue;
    const m = weltmatrix(knoten);
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (!pos) continue;
      const nor = prim.getAttribute('NORMAL');
      const uv = prim.getAttribute('TEXCOORD_0');
      const idx = prim.getIndices();
      const n = pos.getCount();

      for (let i = 0; i < n; i++) {
        const p = pos.getElement(i, [0, 0, 0]);
        const w = punkt(m, p[0], p[1], p[2]);
        vs.push(`v ${w[0].toFixed(5)} ${w[1].toFixed(5)} ${w[2].toFixed(5)}`);
        if (nor) {
          const d = nor.getElement(i, [0, 0, 0]);
          const r = richtung(m, d[0], d[1], d[2]);
          vns.push(`vn ${r[0].toFixed(5)} ${r[1].toFixed(5)} ${r[2].toFixed(5)}`);
        }
        if (uv) {
          const t = uv.getElement(i, [0, 0]);
          // OBJ zählt die V-Achse andersherum als glTF
          vts.push(`vt ${t[0].toFixed(5)} ${(1 - t[1]).toFixed(5)}`);
        }
      }

      const anzahl = idx ? idx.getCount() : n;
      const eck = (k) => {
        const i = (idx ? idx.getScalar(k) : k) + vOff;
        const t = uv ? (idx ? idx.getScalar(k) : k) + vtOff : '';
        const d = nor ? (idx ? idx.getScalar(k) : k) + vnOff : '';
        return uv || nor ? `${i}/${t}/${d}` : `${i}`;
      };
      for (let k = 0; k + 2 < anzahl; k += 3) {
        fs_.push(`f ${eck(k)} ${eck(k + 1)} ${eck(k + 2)}`);
        dreiecke++;
      }
      vOff += n; if (nor) vnOff += n; if (uv) vtOff += n;
      teile++;
    }
  }

  // Textur herauslösen. Mehrere Materialien fasst Mixamo ohnehin zusammen,
  // deshalb reicht die erste Basisfarben-Textur.
  let texturDatei = null;
  const tex = wurzel.listTextures()[0];
  if (tex) {
    const bild = tex.getImage();
    const endung = tex.getMimeType() === 'image/jpeg' ? 'jpg' : 'png';
    texturDatei = `${name}.${endung}`;
    fs.writeFileSync(path.join(ordner, texturDatei), Buffer.from(bild));
  }

  obj.push(`usemtl material`, ...vs, ...vts, ...vns, ...fs_);
  fs.writeFileSync(path.join(ordner, `${name}.obj`), obj.join('\n') + '\n');
  fs.writeFileSync(path.join(ordner, `${name}.mtl`),
    ['newmtl material', 'Ka 1.000 1.000 1.000', 'Kd 1.000 1.000 1.000', 'illum 1',
     texturDatei ? `map_Kd ${texturDatei}` : ''].filter(Boolean).join('\n') + '\n');

  // ZIP bauen. `zip` liegt im System; ohne das Programm bleiben die Einzeldateien.
  const zipName = `${name}.zip`;
  let zip = null;
  try {
    const dabei = [`${name}.obj`, `${name}.mtl`, texturDatei].filter(Boolean);
    execFileSync('zip', ['-qj', zipName, ...dabei], { cwd: ordner });
    zip = path.join(ordner, zipName);
  } catch {
    console.log('  Hinweis: `zip` fehlt – die Einzeldateien liegen trotzdem bereit.');
  }

  return { obj: path.join(ordner, `${name}.obj`), zip, dreiecke, teile, textur: texturDatei };
}

const [quelle, ordner = 'obj-export'] = process.argv.slice(2);
if (!quelle) {
  console.error('Aufruf: node tools/glb-nach-obj.mjs <figur.glb> [ordner]');
  process.exit(1);
}
const r = await nachObj(quelle, ordner);
console.log(`${path.basename(quelle)} → ${r.dreiecke} Dreiecke aus ${r.teile} Teilen`
  + `   Textur ${r.textur || 'keine'}`);
console.log(`  ${r.zip || r.obj}`);
