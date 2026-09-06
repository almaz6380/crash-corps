import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skinClone } from 'three/addons/utils/SkeletonUtils.js';

/**
 * Asset-Pipeline für Figuren. Modelle liegen in public/assets/, werden einmal
 * geladen und pro Figur geklont (Skelett inklusive).
 *
 * Eigenes Modell einhängen: hier einen Eintrag anlegen und in classes.js
 * bei der Klasse `model: '<id>'` setzen. Siehe public/assets/README.md.
 */
export const CHARACTER_MODELS = {
  soldier: {
    url: 'assets/characters/soldier.glb',
    // Knochen, auf die die prozedurale Ebene (Zielen, Rückstoß) zugreift
    bones: {
      hips: 'mixamorig:Hips', spine: 'mixamorig:Spine1', chest: 'mixamorig:Spine2',
      head: 'mixamorig:Head', rightArm: 'mixamorig:RightArm', leftArm: 'mixamorig:LeftArm',
      rightForeArm: 'mixamorig:RightForeArm', leftForeArm: 'mixamorig:LeftForeArm',
      rightHand: 'mixamorig:RightHand', leftHand: 'mixamorig:LeftHand',
    },
    clips: { idle: 'Idle', walk: 'Walk', run: 'Run' },
    // Waffe im Koordinatensystem des rechten Handknochens (Größe in Metern)
    grip: { pos: [0, 0.02, 0.06], rot: [-1.75, -0.2, 0.15], scale: 0.72 },
    // Anschlag: wohin Hände und Ellbogen zeigen, relativ zur Brust.
    // [vorwärts, hoch, seitlich] in Metern – das Anzielen rechnet die
    // Knochenwinkel daraus aus, statt sie fest zu verdrahten.
    aimTune: {
      hand: [0.42, 0.0, 0.1], elbow: [0.1, -0.3, 0.24],
      offHand: [0.6, 0.02, -0.08], offElbow: [0.05, -0.32, -0.2],
    },
  },
};

const cache = new Map();

/** Lädt alle in CHARACTER_MODELS genannten Dateien. */
export async function preloadCharacters(onProgress) {
  const loader = new GLTFLoader();
  const ids = Object.keys(CHARACTER_MODELS);
  let done = 0;
  for (const id of ids) {
    const def = CHARACTER_MODELS[id];
    const gltf = await loader.loadAsync(def.url);
    // Grundhöhe messen, damit sich Figuren später auf die Klassengröße skalieren lassen
    const box = new THREE.Box3().setFromObject(gltf.scene);
    cache.set(id, { def, scene: gltf.scene, clips: gltf.animations, height: box.max.y - box.min.y });
    onProgress?.(++done / ids.length, id);
  }
}

export function isLoaded(id) { return cache.has(id); }

/**
 * Baut eine spielbereite Instanz.
 * @returns {{root:THREE.Object3D, mixer:THREE.AnimationMixer, actions:Object,
 *            bones:Object, materials:THREE.Material[], hand:THREE.Object3D, def:Object}}
 */
export function instantiate(id, { height, tint } = {}) {
  const entry = cache.get(id);
  if (!entry) throw new Error(`Modell "${id}" ist nicht geladen`);
  const { def } = entry;

  const root = skinClone(entry.scene);
  if (height) root.scale.setScalar(height / entry.height);

  // Materialien pro Figur klonen: Einfärbung und Treffer-Blitz dürfen nicht
  // auf alle Instanzen durchschlagen.
  const materials = [];
  root.traverse(o => {
    if (!o.isMesh && !o.isSkinnedMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    o.frustumCulled = false;                       // Skinning sprengt die Bounding-Box
    o.material = o.material.clone();
    if (tint) o.material.color.lerp(new THREE.Color(tint), 0.8);   // Klassenfarbe muss im Gefecht lesbar sein
    materials.push(o.material);
  });

  // Knochen auflösen. Exporter und Loader schreiben Namen unterschiedlich
  // (three entfernt z. B. die Doppelpunkte aus "mixamorig:Hips"), deshalb wird
  // über eine normalisierte Form gesucht statt über exakte Gleichheit.
  const norm = (n) => n.toLowerCase().replace(/[^a-z0-9]/g, '');
  const byName = new Map();
  root.traverse(o => { if (o.name) byName.set(norm(o.name), o); });
  const bones = {};
  const missing = [];
  for (const [key, name] of Object.entries(def.bones)) {
    const b = byName.get(norm(name));
    if (b) { bones[key] = b; b.userData.rest = b.quaternion.clone(); }
    else missing.push(name);
  }
  if (missing.length) console.warn(`Modell "${id}": Knochen nicht gefunden: ${missing.join(', ')}`);

  const mixer = new THREE.AnimationMixer(root);
  const actions = {};
  for (const [key, clipName] of Object.entries(def.clips)) {
    const clip = THREE.AnimationClip.findByName(entry.clips, clipName);
    if (clip) { actions[key] = mixer.clipAction(clip); actions[key].play(); actions[key].setEffectiveWeight(0); }
  }
  if (actions.idle) actions.idle.setEffectiveWeight(1);

  return { root, mixer, actions, bones, materials, hand: bones.rightHand, def };
}
