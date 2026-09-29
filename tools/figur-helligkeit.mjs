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

import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

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
      const a = [0, 0];
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < uv.getCount(); i++) {
        uv.getElement(i, a);
        const x = Math.min(width - 1, Math.max(0, Math.round(a[0] * width)));
        const y = Math.min(height - 1, Math.max(0, Math.round(a[1] * height)));
        const k = (y * width + x) * 3;
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
