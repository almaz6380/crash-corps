import * as THREE from 'three';
import { instantiate, CHARACTER_MODELS } from './assets.js';
import { buildWeapon } from './gear.js';

export { buildViewmodel } from './gear.js';

/**
 * Baut eine Spielfigur aus dem geladenen Modell der Klasse.
 * Root steht mit den Füßen auf y=0 und schaut nach +z.
 *
 * Aufbau: root (Position/Blickrichtung) → frame (Umfallen/Hüpfen) → Modell.
 * Die Waffe hängt am Hand-Knochen und macht damit jede Skelett-Animation mit.
 */
export function buildCharacter(cls) {
  const g = new THREE.Group();
  const frame = new THREE.Group(); g.add(frame);

  const inst = instantiate(cls.model, { height: cls.body.height, tint: cls.color });
  inst.root.rotation.y = Math.PI;      // Modelle schauen nach -z, das Spiel nach +z
  frame.add(inst.root);

  // Waffe hängt in einem Halter am Hand-Knochen. Der Halter trägt die
  // Ausrichtung (Ruhelage aus grip.rot, im Anschlag von der Animation gesetzt),
  // die Waffe darin nur den Versatz – so zeigt ihr Lauf immer entlang +z des Halters.
  const weapon = buildWeapon(cls.weapon, cls.accent);
  const holder = new THREE.Object3D();
  if (inst.hand) {
    const grip = CHARACTER_MODELS[cls.model].grip;
    g.updateWorldMatrix(true, true);
    // Knochen-Skalierung herausrechnen, damit die Waffe in Metern stimmt
    const s = new THREE.Vector3();
    inst.hand.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), s);
    holder.scale.setScalar(1 / (s.x || 1));
    holder.rotation.fromArray(grip.rot);
    weapon.position.fromArray(grip.pos);
    weapon.scale.setScalar(grip.scale);
    holder.add(weapon);
    inst.hand.add(holder);
  } else {
    frame.add(weapon);
  }

  g.userData.rig = {
    frame, inst, weapon, holder,
    muzzle: weapon.userData.muzzle,
    holderRest: holder.quaternion.clone(),
    weaponRest: weapon.position.clone(),
  };
  return g;
}
