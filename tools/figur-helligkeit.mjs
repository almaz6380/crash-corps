#!/usr/bin/env node
/**
 * Wie hell kommt jedes Teil einer Figur an?
 *
 * **Der Mittelwert einer Textur sagt das nicht.** Eine Outfit-Textur ist ein
 * Atlas: Hose, Stiefel, Wams und Gürtel liegen nebeneinander darin, und ihr
 * gemeinsamer Mittelwert gehört keinem von ihnen. Gemessen wird deshalb je
 * Mesh **der Ausschnitt, den es wirklich benutzt** – seine UV-Ecken auf die
 * Textur abgebildet, genau diese Texel gemittelt.
 *
 * Damit war zu sehen, woran die Figuren krankten: die Hose stand bei 23 von
 * 255, die Haut derselben Figur bei 124. Über die ganze Textur gemittelt wären
 * es 71 gewesen, und man hätte weiter an der Beleuchtung gedreht.
 *
 * **Schlüssel ist Mesh und Material, nicht der Meshname.** Beim Magier heißen
 * Ärmel und nackter Arm beide `Male_Peasant_Arms`, auf verschiedenen Texturen.
 * Eine Liste nach Namen überschreibt den einen mit dem anderen und versteckt
 * genau das Teil, um das es geht.
 *
 *   node tools/figur-helligkeit.mjs public/assets/characters/qua_barbar.glb
 *   node tools/figur-helligkeit.mjs alt.glb neu.glb      # Gegenprobe
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

/**
 * Die UV-Fläche eines Primitivs in eine Maske rastern.
 *
 * Gerastert wird über Schwerpunktkoordinaten, Dreieck für Dreieck. Danach wird
 * die Maske geweitet: UV-Inseln enden genau an der Naht, und ein Bildpunkt, der
 * beim Filtern von außerhalb dazugeholt wird, bliebe sonst dunkel und zöge
 * einen Rand um jedes Hosenbein.
 */
export function uvFlaeche(prim, breite, hoehe) {
  const uv = prim.getAttribute('TEXCOORD_0');
  const idx = prim.getIndices();
  const anzahl = idx ? idx.getCount() : uv.getCount();
  const ecke = (k) => {
    const i = idx ? idx.getScalar(k) : k;
    const a = [0, 0];
    uv.getElement(i, a);
    return [a[0] * breite, a[1] * hoehe];
  };

  const maske = new Uint8Array(breite * hoehe);
  for (let k = 0; k + 2 < anzahl; k += 3) {
    const [p0, p1, p2] = [ecke(k), ecke(k + 1), ecke(k + 2)];
    const x0 = Math.max(0, Math.floor(Math.min(p0[0], p1[0], p2[0])));
    const x1 = Math.min(breite - 1, Math.ceil(Math.max(p0[0], p1[0], p2[0])));
    const y0 = Math.max(0, Math.floor(Math.min(p0[1], p1[1], p2[1])));
    const y1 = Math.min(hoehe - 1, Math.ceil(Math.max(p0[1], p1[1], p2[1])));
    const fl = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]);
    if (Math.abs(fl) < 1e-9) continue;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5;
        const a = ((p1[0] - px) * (p2[1] - py) - (p2[0] - px) * (p1[1] - py)) / fl;
        const b = ((p2[0] - px) * (p0[1] - py) - (p0[0] - px) * (p2[1] - py)) / fl;
        const c = 1 - a - b;
        if (a >= -1e-6 && b >= -1e-6 && c >= -1e-6) maske[y * breite + x] = 1;
      }
    }
  }

  return maske;
}

/** Je Primitiv: Name, Material und die Leuchtdichte seines Texturausschnitts. */
export async function teile(datei) {
  const doc = await io.read(datei);
  const liste = [];
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const uv = prim.getAttribute('TEXCOORD_0');
      const mat = prim.getMaterial();
      const tex = mat?.getBaseColorTexture();
      if (!uv || !tex) continue;

      const img = sharp(Buffer.from(tex.getImage()));
      const { width, height } = await img.metadata();
      const buf = await img.removeAlpha().raw().toBuffer();
      // **Die Flaeche rastern, nicht die Ecken abtasten.** Ecken sind billig,
      // aber sie sind nicht die Flaeche: bei der Kapuze des Schurken liegen sie
      // sieben Stufen unter dem, was das Mesh wirklich zeigt. Zwei Werkzeuge,
      // die dieselbe Sache verschieden messen, sind eine Falle - `uvFlaeche`
      // ist deshalb dieselbe Funktion, die `figur-textur.mjs` fuer seine Maske
      // benutzt.
      const flaeche = uvFlaeche(prim, width, height);
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < flaeche.length; i++) {
        if (!flaeche[i]) continue;
        const k = i * 3;
        r += buf[k]; g += buf[k + 1]; b += buf[k + 2]; n++;
      }
      liste.push({
        mesh: mesh.getName(), material: mat.getName(), textur: tex.getName(),
        rgb: [r / n, g / n, b / n],
        lum: (0.2126 * r + 0.7152 * g + 0.0722 * b) / n,
      });
    }
  }
  return liste;
}

// Nur als Programm ausführen, nicht beim Import: `figur-textur.mjs` holt sich
// `uvFlaeche` von hier, und ein CLI, das dabei losläuft, hat dieses Repo schon
// einmal erwischt (`glb-info.mjs`).
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const dateien = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (!dateien.length) {
    console.error('Aufruf: node tools/figur-helligkeit.mjs <figur.glb> [<zweite.glb>]');
    console.error('  Mit zwei Dateien wird verglichen: was sich um mehr als eine Stufe bewegt, wird markiert.');
    process.exit(1);
  }

  const [a, b] = await Promise.all(dateien.slice(0, 2).map(teile));

  console.log(`\n\x1b[1m${dateien[0]}\x1b[0m` + (b ? `  gegen  \x1b[1m${dateien[1]}\x1b[0m` : ''));
  if (b && b.length !== a.length) console.log('  \x1b[31mVerschieden viele Primitive – die Figuren passen nicht zueinander.\x1b[0m');

  for (const [i, t] of a.entries()) {
    const name = `${t.mesh} / ${t.material}`.padEnd(46);
    const rgb = t.rgb.map((v) => Math.round(v)).join('/').padEnd(12);
    if (!b) { console.log('  ' + name + String(Math.round(t.lum)).padStart(4) + '   ' + rgb); continue; }
    const z = b[i];
    const mark = z && Math.abs(t.lum - z.lum) > 1 ? '   \x1b[33m<-- geändert\x1b[0m' : '';
    console.log('  ' + name + String(Math.round(t.lum)).padStart(4) + ' → ' + String(Math.round(z?.lum ?? 0)).padStart(4) + mark);
  }
  console.log();
}
