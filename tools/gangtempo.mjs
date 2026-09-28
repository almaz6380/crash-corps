#!/usr/bin/env node
/**
 * Für welches Tempo ist ein Laufclip gebaut?
 *
 * Die Figur wird vom Spiel bewegt, nicht vom Clip – `cycle.walkSpeed` und
 * `cycle.runSpeed` in `src/assets.js` sagen, bei welcher Geschwindigkeit die
 * Füße dabei stillstehen. Stimmt die Zahl nicht, rutscht die Figur über den
 * Boden wie auf Eis. Bisher stand dort „TODO" und die Zahl wurde im Spiel
 * erraten; hier wird sie ausgerechnet.
 *
 * Das Maß ist der **Schritt**: wie weit der Fuß im Lauf eines Zyklus gegen den
 * Körper nach vorn und nach hinten wandert. Genau diese Strecke legt der Körper
 * zurück, während der Fuß auf dem Boden steht – ein Zyklus lang. Also
 *
 *     Tempo = Schrittweite / Clipdauer
 *
 * Gerechnet wird auf dem Skelett, nicht am Bild: die Kanäle des Clips werden
 * abgetastet, daraus die Knochenkette vorwärts gerechnet und der Fuß gegen die
 * Hüfte gemessen. Das geht ohne Three.js und ohne Browser.
 *
 *   node tools/gangtempo.mjs public/assets/characters/qua_barbar.glb Walk Run
 *   node tools/gangtempo.mjs public/assets/characters/qua_barbar.glb   (alle Clips)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** JSON- **und** Binärteil einer GLB. `glb-info.mjs` liest nur das JSON. */
export function glbTeile(datei) {
  const b = fs.readFileSync(datei);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error(`${datei}: kein GLB`);
  const gesamt = b.readUInt32LE(8);
  let off = 12, json = null, bin = null;
  while (off + 8 <= Math.min(gesamt, b.length)) {
    const len = b.readUInt32LE(off), typ = b.readUInt32LE(off + 4);
    const daten = b.subarray(off + 8, off + 8 + len);
    if (typ === 0x4e4f534a) json = JSON.parse(daten.toString('utf8'));
    else if (typ === 0x004e4942) bin = daten;
    off += 8 + len + ((4 - (len % 4)) % 4);
  }
  if (!json) throw new Error(`${datei}: kein JSON-Block`);
  return { json, bin };
}

const KOMP = { 5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2],
               5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4] };
const ZAHL = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

/** Einen Accessor als Array von Tupeln lesen. Sparse-Accessoren kommen hier nicht vor. */
export function accessor(json, bin, i) {
  const a = json.accessors[i];
  const [Typ, gr] = KOMP[a.componentType];
  const n = ZAHL[a.type];
  const bv = json.bufferViews[a.bufferView];
  const start = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const schritt = bv.byteStride || n * gr;
  const out = [];
  for (let k = 0; k < a.count; k++) {
    const o = start + k * schritt;
    // `bin` ist ein Ausschnitt eines größeren Puffers: byteOffset mitrechnen,
    // sonst liest der typisierte Zugriff am Dateianfang statt am Blockanfang.
    const t = new Typ(bin.buffer, bin.byteOffset + o, n);
    out.push(n === 1 ? t[0] : Array.from(t));
  }
  return out;
}

/* ---------- kleine Matrix- und Quaternionenhilfen (Spalten-Reihenfolge) ---------- */

function mul(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}

function ausTrs(t, q, s) {
  const [x, y, z, w] = q, [sx, sy, sz] = s;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    t[0], t[1], t[2], 1,
  ];
}

/** Kürzeste lineare Mischung zweier Quaternionen, danach normiert. */
function qMisch(a, b, f) {
  let [x, y, z, w] = b;
  if (a[0] * x + a[1] * y + a[2] * z + a[3] * w < 0) { x = -x; y = -y; z = -z; w = -w; }
  const o = [a[0] + (x - a[0]) * f, a[1] + (y - a[1]) * f, a[2] + (z - a[2]) * f, a[3] + (w - a[3]) * f];
  const l = Math.hypot(...o) || 1;
  return o.map((v) => v / l);
}

/* ---------- Abtasten ---------- */

/**
 * Ein Sampler an der Stelle `t`. `stufen` ist STEP, alles andere wird linear
 * gemischt; CUBICSPLINE liefert drei Werte je Zeitpunkt – davon ist der mittlere
 * der Stützwert, und den zu nehmen ist genau genug für eine Schrittweite.
 */
function abtasten(zeiten, werte, t, art, breit) {
  const n = zeiten.length;
  if (n === 0) return null;
  const hol = (i) => (breit ? werte[i * 3 + 1] : werte[i]);
  if (t <= zeiten[0]) return hol(0);
  if (t >= zeiten[n - 1]) return hol(n - 1);
  let i = 0;
  while (i < n - 2 && zeiten[i + 1] < t) i++;
  const f = (t - zeiten[i]) / Math.max(1e-9, zeiten[i + 1] - zeiten[i]);
  const a = hol(i), b = hol(i + 1);
  if (art === 'STEP') return a;
  if (typeof a === 'number') return a + (b - a) * f;
  if (a.length === 4) return qMisch(a, b, f);
  return a.map((v, k) => v + (b[k] - v) * f);
}

/** Alle Kanäle eines Clips einlesen: Knoten → { translation, rotation, scale }. */
function kanaele(json, bin, anim) {
  const je = new Map();
  for (const ch of anim.channels || []) {
    const ziel = ch.target?.node;
    if (ziel == null) continue;
    const s = anim.samplers[ch.sampler];
    const eintrag = je.get(ziel) || {};
    eintrag[ch.target.path] = {
      zeiten: accessor(json, bin, s.input),
      werte: accessor(json, bin, s.output),
      art: s.interpolation || 'LINEAR',
      breit: (s.interpolation || 'LINEAR') === 'CUBICSPLINE',
    };
    je.set(ziel, eintrag);
  }
  return je;
}

/** Weltmatrizen aller Knoten zum Zeitpunkt `t`. */
function pose(json, kan, t) {
  const nodes = json.nodes || [];
  const welt = new Map();
  const kinder = new Set();
  for (const n of nodes) for (const c of n.children || []) kinder.add(c);
  const lokal = (i) => {
    const n = nodes[i], k = kan.get(i);
    let tr = n.translation || [0, 0, 0];
    let ro = n.rotation || [0, 0, 0, 1];
    let sc = n.scale || [1, 1, 1];
    if (k?.translation) tr = abtasten(k.translation.zeiten, k.translation.werte, t, k.translation.art, k.translation.breit) || tr;
    if (k?.rotation) ro = abtasten(k.rotation.zeiten, k.rotation.werte, t, k.rotation.art, k.rotation.breit) || ro;
    if (k?.scale) sc = abtasten(k.scale.zeiten, k.scale.werte, t, k.scale.art, k.scale.breit) || sc;
    return ausTrs(tr, ro, sc);
  };
  const geh = (i, m) => {
    const w = mul(m, lokal(i));
    welt.set(i, w);
    for (const c of nodes[i].children || []) geh(c, w);
  };
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  nodes.forEach((_, i) => { if (!kinder.has(i)) geh(i, I); });
  return welt;
}

const norm = (n) => (n || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const istLinks = (n) => /(^|[^a-z])l([^a-z]|$)|left|_l$|\.l$/i.test(n);

/**
 * Hüft-, Fuß- und Zehenknochen eines beliebigen Humanoiden finden.
 * Zehen sind optional – ohne sie wird am Fuß gemessen, das ist ein paar
 * Zentimeter kürzer, aber dieselbe Bewegung.
 */
export function beinKnochen(json) {
  const nodes = json.nodes || [];
  const finde = (test) => nodes.findIndex((n) => n.name && test(n.name));
  const hueften = finde((n) => /hips?$|pelvis/i.test(n) || norm(n).endsWith('hips'));
  const fuesse = [];
  nodes.forEach((n, i) => {
    if (!n.name) return;
    if (/foot|ankle/i.test(n.name) && !/ik|control|roll|heel/i.test(n.name)) fuesse.push(i);
  });
  const fuss = fuesse.find((i) => istLinks(nodes[i].name)) ?? fuesse[0];
  let zeh = null;
  if (fuss != null) {
    for (const c of nodes[fuss].children || []) {
      if (/toe|ball/i.test(nodes[c].name || '')) { zeh = c; break; }
    }
  }
  return { hueften: hueften >= 0 ? hueften : null, fuss: fuss ?? null, zeh };
}

/**
 * Blickrichtung des Modells in der Bindepose: von der Ferse zu den Zehen.
 * Das Spiel erwartet Figuren, die nach **+z** schauen; `yaw` ist die Drehung,
 * die dorthin führt. Ohne Zehenknochen lässt sich das nicht messen – dann
 * kommt `null` zurück, und Raten wäre schlimmer als Nachsehen.
 * @returns {{blick:number, yaw:number}|null}
 */
export function blickrichtung(json) {
  const { fuss, zeh } = beinKnochen(json);
  if (fuss == null || zeh == null) return null;
  const w = pose(json, new Map(), 0);
  const a = w.get(fuss), b = w.get(zeh);
  if (!a || !b) return null;
  const dx = b[12] - a[12], dz = b[14] - a[14];
  if (Math.hypot(dx, dz) < 1e-4) return null;
  const blick = Math.atan2(dx, dz);
  return { blick, yaw: -blick };
}

/**
 * Für welches Tempo ist der Clip gebaut?
 *
 * @param {object} json  JSON-Teil der GLB
 * @param {Buffer} bin   Binärteil
 * @param {string} name  Clipname
 * @param {number} proben Abtastpunkte über den Clip
 * @returns {{tempo:number, schritt:number, dauer:number, knochen:string}|null}
 */
export function gangtempo(json, bin, name, proben = 60) {
  const anim = (json.animations || []).find((a) => a.name === name);
  if (!anim) return null;
  const { hueften, fuss, zeh } = beinKnochen(json);
  const mess = zeh ?? fuss;
  if (mess == null || hueften == null) return null;

  const kan = kanaele(json, bin, anim);
  let dauer = 0;
  for (const s of anim.samplers || []) {
    const t = json.accessors[s.input]?.max?.[0];
    if (t > dauer) dauer = t;
  }
  if (!(dauer > 0)) return null;

  const richtung = blickrichtung(json);
  const vx = richtung ? Math.sin(richtung.blick) : 0;
  const vz = richtung ? Math.cos(richtung.blick) : 1;

  let min = Infinity, max = -Infinity;
  for (let i = 0; i < proben; i++) {
    const w = pose(json, kan, (i / proben) * dauer);
    const f = w.get(mess), h = w.get(hueften);
    if (!f || !h) return null;
    // Fuß gegen die Hüfte, projiziert auf die Blickrichtung: so fällt heraus,
    // ob der Clip an Ort und Stelle läuft oder mit Wurzelbewegung exportiert
    // wurde. Beide Sorten ergeben dieselbe Schrittweite.
    const d = (f[12] - h[12]) * vx + (f[14] - h[14]) * vz;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  const schritt = max - min;
  return { tempo: schritt / dauer, schritt, dauer, knochen: json.nodes[mess].name };
}

/**
 * Höhe des Modells aus den POSITION-Accessoren. Das Spiel skaliert jede Figur
 * auf die Klassengröße (`height / entry.height`) – und mit der Figur skaliert
 * auch ihre Schrittweite. Ein Modell, das dreimal so groß gebaut ist, läuft im
 * Spiel mit einem Drittel des gemessenen Tempos.
 */
export function modellHoehe(json) {
  // Mit den Knotenmatrizen gerechnet, nicht nur aus den Accessoren: three misst
  // die Höhe im Spiel über eine Box3 der fertigen Szene, und ein Exporteur, der
  // die Figur am Wurzelknoten skaliert, macht aus beidem sonst verschiedene
  // Zahlen – und damit aus dem Maßstab und jedem Gangtempo eine falsche.
  const welt = pose(json, new Map(), 0);
  let lo = Infinity, hi = -Infinity;
  (json.nodes || []).forEach((n, i) => {
    if (n.mesh == null) return;
    const m = welt.get(i);
    if (!m) return;
    for (const pr of json.meshes[n.mesh].primitives || []) {
      const a = json.accessors?.[pr.attributes?.POSITION];
      if (!a?.min || !a?.max) continue;
      for (let e = 0; e < 8; e++) {
        const x = (e & 1 ? a.max : a.min)[0], y = (e & 2 ? a.max : a.min)[1], z = (e & 4 ? a.max : a.min)[2];
        const wy = m[1] * x + m[5] * y + m[9] * z + m[13];
        if (wy < lo) lo = wy;
        if (wy > hi) hi = wy;
      }
    }
  });
  return hi > lo ? hi - lo : 0;
}

/** Alle Clips einer Datei durchmessen, für die Ausgabe. */
export function alleTempi(datei, namen = null, zielHoehe = 0) {
  const { json, bin } = glbTeile(datei);
  const clips = (json.animations || []).map((a) => a.name).filter(Boolean);
  const ziel = namen?.length ? namen : clips;
  const h = modellHoehe(json);
  const faktor = zielHoehe && h ? zielHoehe / h : 1;
  return ziel.map((n) => {
    const e = gangtempo(json, bin, n);
    return { name: n, faktor, ...(e || {}), tempo: e ? e.tempo * faktor : 0 };
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const zielHoehe = +(argv.find((a) => a.startsWith('--hoehe='))?.split('=')[1] || 0);
  const [datei, ...clips] = argv.filter((a) => !a.startsWith('--'));
  if (!datei) {
    console.error('Aufruf: node tools/gangtempo.mjs <datei.glb> [Clip …] [--hoehe=1.85]');
    console.error('  --hoehe: Größe der Klasse, auf die das Spiel die Figur skaliert.');
    process.exit(1);
  }
  const { json } = glbTeile(datei);
  const r = blickrichtung(json);
  console.log(`\n\x1b[1m${path.basename(datei)}\x1b[0m`);
  console.log(r
    ? `  Blick ${(r.blick * 180 / Math.PI).toFixed(1)}°  →  yaw: ${r.yaw.toFixed(3)}`
    : '  Blickrichtung nicht messbar (kein Zehenknochen) – yaw bleibt 0');
  const h = modellHoehe(json);
  console.log(`  Modellhöhe ${h.toFixed(2)} m`
    + (zielHoehe ? `  →  im Spiel ${zielHoehe.toFixed(2)} m, Maßstab ${(zielHoehe / h).toFixed(3)}` : ''));
  console.log(`\n  Clip                       Dauer   Schritt   Tempo m/s`);
  for (const e of alleTempi(datei, clips, zielHoehe)) {
    if (!e.tempo) { console.log(`  ${e.name.padEnd(26)}     – nicht messbar`); continue; }
    console.log(`  ${e.name.padEnd(26)} ${e.dauer.toFixed(2)}s ${e.schritt.toFixed(2).padStart(9)} ${e.tempo.toFixed(2).padStart(11)}`);
  }
  console.log();
}
