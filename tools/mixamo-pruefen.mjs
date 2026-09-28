#!/usr/bin/env node
/**
 * Prüft die Regeln des Mixamo-Imports gegen das echte Mixamo-Skelett.
 *
 * Der Import kann drei Dinge still falsch machen, und keines davon meldet sich
 * im Spiel: ein Clip, den `assets.js` nicht findet, ein Knochen, den es nicht
 * findet – und ein `upperBones`-Präfix, das zu viel trifft. Das letzte ist das
 * heimtückischste: `Arm` trifft auch `Armature`, und dann liegt die ganze Figur
 * in der Anschlagsebene und bleibt beim Zielen stehen.
 *
 * Hier stehen deshalb das Knochenschema und die Dateinamen, wie Mixamo sie
 * wirklich ausgibt, als fester Prüfstein daneben. Läuft ohne Downloads.
 *
 *   node tools/mixamo-pruefen.mjs
 */

import { rolle, oberkoerper } from './mixamo-figur.mjs';
import { knochenRaten } from './glb-info.mjs';

/** Das Mixamo-Skelett als Hierarchie – Präfix `mixamorig:` bereits gestrichen. */
function mixamoSkelett() {
  const namen = [];
  const kinder = new Map();
  const add = (name, eltern) => {
    const i = namen.push(name) - 1;
    if (eltern != null) kinder.set(eltern, [...(kinder.get(eltern) || []), i]);
    return i;
  };
  const wurzel = add('Armature', null);          // der Knoten, über den `Arm` stolpert
  const hips = add('Hips', wurzel);
  const sp = add('Spine', hips);
  const sp2 = add('Spine2', add('Spine1', sp));
  const head = add('Head', add('Neck', sp2));
  add('HeadTop_End', head);
  for (const s of ['Left', 'Right']) {
    const hand = add(`${s}Hand`, add(`${s}ForeArm`, add(`${s}Arm`, add(`${s}Shoulder`, sp2))));
    for (const f of ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']) {
      let p = hand;
      for (let k = 1; k <= 4; k++) p = add(`${s}Hand${f}${k}`, p);
    }
    const toe = add(`${s}ToeBase`, add(`${s}Foot`, add(`${s}Leg`, add(`${s}UpLeg`, hips))));
    add(`${s}Toe_End`, toe);
  }
  return { nodes: namen.map((name, i) => ({ name, children: kinder.get(i) })) };
}

let fehler = 0;
const ok = (b, was) => { console.log(`  ${b ? '\x1b[32mok    \x1b[0m' : '\x1b[31mFEHLER\x1b[0m'} ${was}`); if (!b) fehler++; };

const json = mixamoSkelett();
const namen = json.nodes.map((n) => n.name);

console.log('\n\x1b[1mKnochen erkennen\x1b[0m');
const k = knochenRaten(namen.map((name) => ({ name })));
for (const [schluessel, soll] of Object.entries({
  hips: 'Hips', spine: 'Spine', chest: 'Spine2', head: 'Head',
  rightArm: 'RightArm', rightForeArm: 'RightForeArm', rightHand: 'RightHand',
  leftArm: 'LeftArm', leftForeArm: 'LeftForeArm', leftHand: 'LeftHand',
})) ok(k[schluessel] === soll, `${schluessel} → ${soll}${k[schluessel] === soll ? '' : ` (ist: ${k[schluessel]})`}`);

console.log('\n\x1b[1mOberkörper-Ebene\x1b[0m');
const ob = oberkoerper(json, k.spine);
console.log(`  ${JSON.stringify(ob)}`);
const trifft = (n) => ob.some((b) => n.startsWith(b));   // genau die Regel aus assets.js
ok(namen.filter((n) => /Leg|Foot|Toe/.test(n)).every((n) => !trifft(n)), 'kein Beinknochen getroffen');
ok(!trifft('Hips'), 'Hüfte bleibt draußen – sonst friert die Wurzel ein');
ok(!trifft('Armature'), 'Armature bleibt draußen');
ok(['Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'HeadTop_End', 'LeftShoulder', 'LeftArm',
    'LeftForeArm', 'LeftHand', 'LeftHandThumb1', 'RightHandPinky4'].every(trifft),
   'Rumpf, Kopf, Arme und alle Finger sind drin');
ok(ob.every((b) => /^[A-Za-z_.]+$/.test(b) && b.length >= 3), 'keine abgeschnittenen Namen');

console.log('\n\x1b[1mDateiname → Clip\x1b[0m');
for (const [datei, soll] of Object.entries({
  'Standing Idle.fbx': 'Idle', 'Breathing Idle.fbx': 'Idle',
  'Walking.fbx': 'Walk', 'Fast Run.fbx': 'Run', 'Sprinting.fbx': 'Run',
  'Standing React Death Backward.fbx': 'Death', 'Standing Dodge Forward.fbx': 'Roll',
  'Rifle Aiming Idle.fbx': 'Aim', 'Firing Rifle.fbx': 'Shoot',
  'Sword And Shield Slash.fbx': 'Shoot', 'Hit Reaction.fbx': 'Hit',
})) ok(rolle(datei) === soll, `${datei.padEnd(34)} → ${soll}${rolle(datei) === soll ? '' : ` (ist: ${rolle(datei)})`}`);

console.log(fehler ? `\n\x1b[31m${fehler} Fehler\x1b[0m\n` : '\n\x1b[32mAlles ok\x1b[0m\n');
process.exit(fehler ? 1 : 0);
