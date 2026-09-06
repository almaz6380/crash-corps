import * as THREE from 'three';
import { instantiate, CHARACTER_MODELS } from './assets.js';
import { buildWeapon } from './gear.js';

export { buildViewmodel } from './gear.js';

/**
 * Baut eine Spielfigur aus dem geladenen Modell der Klasse.
 * Root steht mit den Füßen auf y=0 und schaut nach +z.
 *
 * Aufbau: root (Position/Blickrichtung) → frame (Umfallen/Hüpfen) → Modell.
 * Bringt das Modell eigene Waffen mit, wird die passende eingeblendet; sonst
 * hängt eine prozedurale Waffe in einem Halter am Hand-Knochen.
 */
export function buildCharacter(cls) {
  const g = new THREE.Group();
  const frame = new THREE.Group(); g.add(frame);

  const def = CHARACTER_MODELS[cls.model];
  const inst = instantiate(cls.model, { height: cls.body.height, tint: cls.color, weapon: cls.weapon });
  inst.root.rotation.y = def.yaw || 0;
  frame.add(inst.root);

  let weapon, holder = null, holderRest = null, weaponRest = null;
  if (inst.builtinWeapon) {
    weapon = inst.builtinWeapon;
  } else {
    weapon = buildWeapon(cls.weapon, cls.accent);
    holder = new THREE.Object3D();
    if (inst.hand && def.grip) {
      g.updateWorldMatrix(true, true);
      // Knochen-Skalierung herausrechnen, damit die Waffe in Metern stimmt
      const s = new THREE.Vector3();
      inst.hand.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), s);
      holder.scale.setScalar(1 / (s.x || 1));
      holder.rotation.fromArray(def.grip.rot);
      weapon.position.fromArray(def.grip.pos);
      weapon.scale.setScalar(def.grip.scale);
      holder.add(weapon);
      inst.hand.add(holder);
    } else {
      frame.add(weapon);
    }
    holderRest = holder.quaternion.clone();
    weaponRest = weapon.position.clone();
  }

  // Mündungspunkt: bei mitgelieferten Waffen das in Blickrichtung vorderste Ende
  let muzzle = weapon.userData.muzzle;
  if (!muzzle) {
    g.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(weapon);
    if (!box.isEmpty()) {
      const tip = new THREE.Vector3(box.getCenter(new THREE.Vector3()).x, box.getCenter(new THREE.Vector3()).y, box.max.z);
      muzzle = new THREE.Object3D();
      weapon.add(muzzle);
      muzzle.position.copy(weapon.worldToLocal(tip));
    }
  }

  g.userData.rig = { frame, inst, weapon, holder, muzzle, holderRest, weaponRest };
  return g;
}
