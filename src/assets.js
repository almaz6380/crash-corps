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
  // Quaternius "Ultimate Modular Men" (CC0): menschliche Proportionen, eigene
  // Clips für Waffe halten, zielen, schießen, Treffer, Tod. Ohne Waffen-Meshes,
  // die Waffe kommt aus gear.js und hängt am Handgelenk.
  men_spacesuit: {
    url: 'assets/characters/men_spacesuit.glb',
    yaw: 0,
    bones: {
      hips: 'Hips', spine: 'Abdomen', chest: 'Chest', head: 'Head',
      rightArm: 'UpperArm.R', rightForeArm: 'LowerArm.R', rightHand: 'Wrist.R',
      leftArm: 'UpperArm.L', leftForeArm: 'LowerArm.L', leftHand: 'Wrist.L',
    },
    clips: {
      idle: 'Idle_Gun', walk: 'Walk', run: 'Run',
      runLeft: 'Run_Left', runRight: 'Run_Right', runBack: 'Run_Back',
      death: 'Death', roll: 'Roll',
    },
    // Oberkörper-Ebene: diese Clips laufen nur auf den Knochen ab Rumpf aufwärts,
    // die Beine behalten die Gangart. Zielen liegt dauerhaft drüber, Schuss und
    // Treffer als Einmal-Clips.
    upperBones: ['Torso', 'Chest', 'Neck', 'Head', 'Shoulder', 'UpperArm', 'LowerArm', 'Wrist',
                 'Index', 'Middle', 'Ring', 'Pinky', 'Thumb'],
    layers: { aim: 'Idle_Gun_Pointing', shoot: 'Gun_Shoot', hit: 'HitRecieve' },
    cycle: { walk: 1.33, run: 0.8, walkSpeed: 1.9, runSpeed: 5.5 },   // Clip-Dauer und Tempo, für das der Zyklus gebaut ist
    grip: { pos: [0, 0.06, 0.02], rot: [-1.5708, 0, 0], scale: 0.62 },
    tintMaterials: ['SciFi_Main'],
  },
  // Quaternius "Ultimate Modular Men" (CC0): menschliche Proportionen, eigene
  // Clips für Waffe halten, zielen, schießen, Treffer, Tod. Ohne Waffen-Meshes,
  // die Waffe kommt aus gear.js und hängt am Handgelenk.
  men_punk: {
    url: 'assets/characters/men_punk.glb',
    yaw: 0,
    bones: {
      hips: 'Hips', spine: 'Abdomen', chest: 'Chest', head: 'Head',
      rightArm: 'UpperArm.R', rightForeArm: 'LowerArm.R', rightHand: 'Wrist.R',
      leftArm: 'UpperArm.L', leftForeArm: 'LowerArm.L', leftHand: 'Wrist.L',
    },
    clips: {
      idle: 'Idle_Gun', walk: 'Walk', run: 'Run',
      runLeft: 'Run_Left', runRight: 'Run_Right', runBack: 'Run_Back',
      death: 'Death', roll: 'Roll',
    },
    // Oberkörper-Ebene: diese Clips laufen nur auf den Knochen ab Rumpf aufwärts,
    // die Beine behalten die Gangart. Zielen liegt dauerhaft drüber, Schuss und
    // Treffer als Einmal-Clips.
    upperBones: ['Torso', 'Chest', 'Neck', 'Head', 'Shoulder', 'UpperArm', 'LowerArm', 'Wrist',
                 'Index', 'Middle', 'Ring', 'Pinky', 'Thumb'],
    layers: { aim: 'Idle_Gun_Pointing', shoot: 'Gun_Shoot', hit: 'HitRecieve' },
    cycle: { walk: 1.33, run: 0.8, walkSpeed: 1.9, runSpeed: 5.5 },   // Clip-Dauer und Tempo, für das der Zyklus gebaut ist
    grip: { pos: [0, 0.06, 0.02], rot: [-1.5708, 0, 0], scale: 0.62 },
    tintMaterials: ['White'],
  },
  // Quaternius "Ultimate Modular Men" (CC0): menschliche Proportionen, eigene
  // Clips für Waffe halten, zielen, schießen, Treffer, Tod. Ohne Waffen-Meshes,
  // die Waffe kommt aus gear.js und hängt am Handgelenk.
  men_swat: {
    url: 'assets/characters/men_swat.glb',
    yaw: 0,
    bones: {
      hips: 'Hips', spine: 'Abdomen', chest: 'Chest', head: 'Head',
      rightArm: 'UpperArm.R', rightForeArm: 'LowerArm.R', rightHand: 'Wrist.R',
      leftArm: 'UpperArm.L', leftForeArm: 'LowerArm.L', leftHand: 'Wrist.L',
    },
    clips: {
      idle: 'Idle_Gun', walk: 'Walk', run: 'Run',
      runLeft: 'Run_Left', runRight: 'Run_Right', runBack: 'Run_Back',
      death: 'Death', roll: 'Roll',
    },
    // Oberkörper-Ebene: diese Clips laufen nur auf den Knochen ab Rumpf aufwärts,
    // die Beine behalten die Gangart. Zielen liegt dauerhaft drüber, Schuss und
    // Treffer als Einmal-Clips.
    upperBones: ['Torso', 'Chest', 'Neck', 'Head', 'Shoulder', 'UpperArm', 'LowerArm', 'Wrist',
                 'Index', 'Middle', 'Ring', 'Pinky', 'Thumb'],
    layers: { aim: 'Idle_Gun_Pointing', shoot: 'Gun_Shoot', hit: 'HitRecieve' },
    cycle: { walk: 1.33, run: 0.8, walkSpeed: 1.9, runSpeed: 5.5 },   // Clip-Dauer und Tempo, für das der Zyklus gebaut ist
    grip: { pos: [0, 0.06, 0.02], rot: [-1.5708, 0, 0], scale: 0.62 },
    tintMaterials: ['Swat'],
  },
  // Quaternius "Toon Shooter Game Kit" (CC0). Waffen hängen bereits am Modell,
  // Clips für Zielen, Schießen, Treffer und Tod sind dabei.
  toon_soldier: {
    url: 'assets/characters/toon_soldier.glb',
    yaw: 0,                                   // schaut bereits nach +z
    bones: {
      hips: 'Hips', spine: 'Abdomen', chest: 'Torso', head: 'Head',
      rightArm: 'UpperArm.R', rightForeArm: 'LowerArm.R', rightHand: 'Index1.R',
      leftArm: 'UpperArm.L', leftForeArm: 'LowerArm.L', leftHand: 'Index1.L',
    },
    clips: {
      idle: 'Idle', walk: 'Walk', run: 'Run',
      aimIdle: 'Idle_Shoot', aimWalk: 'Walk_Shoot', aimRun: 'Run_Shoot',
      death: 'Death', hit: 'HitReact',
    },
    // Mitgelieferte Waffen-Meshes: Name pro Waffen-Id aus weapons.js; alle anderen werden ausgeblendet
    weapons: { shotgun: 'Shotgun', smg: 'SMG', rifle: 'Sniper_2' },
    weaponHide: ['AK', 'GrenadeLauncher', 'Knife_1', 'Knife_2', 'Pistol', 'Revolver', 'Revolver_Small',
                 'RocketLauncher', 'ShortCannon', 'Shotgun', 'Shovel', 'SMG', 'Sniper', 'Sniper_2'],
    tintMaterials: ['Character_Main'],        // nur die Kleidung bekommt die Klassenfarbe
  },
  toon_enemy: {
    url: 'assets/characters/toon_enemy.glb',
    yaw: 0,
    bones: {
      hips: 'Hips', spine: 'Abdomen', chest: 'Torso', head: 'Head',
      rightArm: 'UpperArm.R', rightForeArm: 'LowerArm.R', rightHand: 'Index1.R',
      leftArm: 'UpperArm.L', leftForeArm: 'LowerArm.L', leftHand: 'Index1.L',
    },
    clips: {
      idle: 'Idle', walk: 'Walk', run: 'Run',
      aimIdle: 'Idle_Shoot', aimWalk: 'Walk_Shoot', aimRun: 'Run_Shoot',
      death: 'Death', hit: 'HitReact',
    },
    weapons: { shotgun: 'Shotgun', smg: 'SMG', rifle: 'Sniper_2' },
    weaponHide: ['AK', 'GrenadeLauncher', 'Knife_1', 'Knife_2', 'Pistol', 'Revolver', 'Revolver_Small',
                 'RocketLauncher', 'ShortCannon', 'Shotgun', 'Shovel', 'SMG', 'Sniper', 'Sniper_2'],
    tintMaterials: ['Enemy_Red'],
  },
  toon_hazmat: {
    url: 'assets/characters/toon_hazmat.glb',
    yaw: 0,
    bones: {
      hips: 'Hips', spine: 'Abdomen', chest: 'Torso', head: 'Head',
      rightArm: 'UpperArm.R', rightForeArm: 'LowerArm.R', rightHand: 'Index1.R',
      leftArm: 'UpperArm.L', leftForeArm: 'LowerArm.L', leftHand: 'Index1.L',
    },
    clips: {
      idle: 'Idle', walk: 'Walk', run: 'Run',
      aimIdle: 'Idle_Shoot', aimWalk: 'Walk_Shoot', aimRun: 'Run_Shoot',
      death: 'Death', hit: 'HitReact',
    },
    weapons: { shotgun: 'Shotgun', smg: 'SMG', rifle: 'Sniper_2' },
    weaponHide: ['AK', 'GrenadeLauncher', 'Knife_1', 'Knife_2', 'Pistol', 'Revolver', 'Revolver_Small',
                 'RocketLauncher', 'ShortCannon', 'Shotgun', 'Shovel', 'SMG', 'Sniper', 'Sniper_2'],
    tintMaterials: ['Hazmat_Main'],
  },
};

const cache = new Map();

/**
 * Baut aus Vollkörper-Clips Oberkörper-Clips: es bleiben nur die Tracks der in
 * def.upperBones genannten Knochen. So kann der Anschlag über jede Gangart
 * gelegt werden, ohne dass die Beine stehen bleiben.
 */
function buildLayerClips(def, clips) {
  if (!def.layers || !def.upperBones) return {};
  const isUpper = (trackName) => {
    const node = trackName.split('.')[0];
    return def.upperBones.some(b => node.startsWith(b));
  };
  const out = {};
  for (const [key, clipName] of Object.entries(def.layers)) {
    const src = THREE.AnimationClip.findByName(clips, clipName);
    if (!src) continue;
    const tracks = src.tracks.filter(t => isUpper(t.name)).map(t => t.clone());
    if (tracks.length) out[key] = new THREE.AnimationClip(`${clipName}__upper`, src.duration, tracks);
  }
  return out;
}

/**
 * Lädt Modelle. Ohne Liste alle aus CHARACTER_MODELS, sonst nur die genannten –
 * main.js übergibt die Modelle der Klassen, damit nichts Unbenutztes geladen wird.
 */
export async function preloadCharacters(onProgress, ids = Object.keys(CHARACTER_MODELS)) {
  const loader = new GLTFLoader();
  ids = [...new Set(ids)].filter(id => CHARACTER_MODELS[id]);
  let done = 0;
  for (const id of ids) {
    const def = CHARACTER_MODELS[id];
    const gltf = await loader.loadAsync(def.url);
    // Grundhöhe messen, damit sich Figuren später auf die Klassengröße skalieren lassen
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const layers = buildLayerClips(def, gltf.animations);
    cache.set(id, { def, scene: gltf.scene, clips: gltf.animations, layers, height: box.max.y - box.min.y });
    onProgress?.(++done / ids.length, id);
  }
}

export function isLoaded(id) { return cache.has(id); }

/**
 * Klont das mitgelieferte Waffen-Mesh eines Modells (für die Ego-Waffe).
 * Liefert null, wenn das Modell keine eigenen Waffen hat.
 */
export function cloneWeaponMesh(id, weapon) {
  const entry = cache.get(id);
  const name = entry?.def.weapons?.[weapon];
  if (!name) return null;
  const norm = (n) => n.toLowerCase().replace(/[^a-z0-9]/g, '');
  // Waffen mit mehreren Materialien kommen aus dem Loader als Group mit Kind-Meshes
  let src = null;
  entry.scene.traverse(o => { if (!src && !o.isBone && norm(o.name) === norm(name)) src = o; });
  if (!src) return null;
  const m = src.clone(true);
  m.visible = true;
  m.position.set(0, 0, 0); m.quaternion.identity();
  // Weltskalierung des Originals übernehmen, damit die Waffe in Metern stimmt
  entry.scene.updateWorldMatrix(true, true);
  const ws = new THREE.Vector3(); src.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), ws);
  m.scale.copy(ws);
  m.traverse(o => {
    if (!o.isMesh) return;
    o.material = Array.isArray(o.material) ? o.material.map(mm => mm.clone()) : o.material.clone();
  });
  return m;
}

/**
 * Baut eine spielbereite Instanz.
 * @returns {{root:THREE.Object3D, mixer:THREE.AnimationMixer, actions:Object,
 *            bones:Object, materials:THREE.Material[], hand:THREE.Object3D, def:Object}}
 */
export function instantiate(id, { height, tint, weapon } = {}) {
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
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const cloned = mats.map(m => {
      const c = m.clone();
      if (tint && (!def.tintMaterials || def.tintMaterials.includes(m.name))) {
        // Modelle mit Textur werden überblendet, flache Toon-Modelle bekommen die Farbe direkt
        if (c.map) c.color.lerp(new THREE.Color(tint), 0.8); else c.color.set(tint);
      }
      materials.push(c); return c;
    });
    o.material = Array.isArray(o.material) ? cloned : cloned[0];
  });

  // Knochen auflösen. Exporter und Loader schreiben Namen unterschiedlich
  // (three entfernt z. B. die Doppelpunkte aus "mixamorig:Hips"), deshalb wird
  // über eine normalisierte Form gesucht statt über exakte Gleichheit.
  const norm = (n) => n.toLowerCase().replace(/[^a-z0-9]/g, '');
  const byName = new Map();
  root.traverse(o => {
    if (!o.name) return;
    const k = norm(o.name);
    if (o.isBone || !byName.has(k)) byName.set(k, o);   // Knochen gewinnt gegen gleichnamiges Mesh
  });
  const bones = {};
  const missing = [];
  for (const [key, name] of Object.entries(def.bones)) {
    const b = byName.get(norm(name));
    if (b) { bones[key] = b; b.userData.rest = b.quaternion.clone(); }
    else missing.push(name);
  }
  if (missing.length) console.warn(`Modell "${id}": Knochen nicht gefunden: ${missing.join(', ')}`);

  // Mitgelieferte Waffen: nur die der Klasse zeigen
  let builtinWeapon = null;
  if (def.weapons) {
    for (const n of def.weaponHide || []) { const o = byName.get(norm(n)); if (o) o.visible = false; }
    const want = def.weapons[weapon];
    builtinWeapon = want ? byName.get(norm(want)) : null;
    if (builtinWeapon) builtinWeapon.visible = true;
  }

  const mixer = new THREE.AnimationMixer(root);
  const actions = {};
  for (const [key, clipName] of Object.entries(def.clips)) {
    const clip = THREE.AnimationClip.findByName(entry.clips, clipName);
    if (!clip) continue;
    const a = mixer.clipAction(clip);
    if (key === 'death' || key === 'hit' || key === 'roll') { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = key === 'death'; }
    else { a.play(); a.setEffectiveWeight(0); }
    actions[key] = a;
  }
  if (actions.idle) actions.idle.setEffectiveWeight(1);
  const layers = {};
  for (const [key, clip] of Object.entries(entry.layers || {})) {
    const a = mixer.clipAction(clip);
    if (key === 'aim') { a.play(); a.setEffectiveWeight(0); }
    else { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = false; }
    layers[key] = a;
  }
  if (root.userData) root.userData.yaw = def.yaw || 0;

  return { root, mixer, actions, layers, bones, materials, hand: bones.rightHand, builtinWeapon, def };
}
