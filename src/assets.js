import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skinClone } from 'three/addons/utils/SkeletonUtils.js';
import { REAL } from './style.js';
import { realisticMaterial, uvSurface, SURFACE_FOR_PROP, SURFACE_FOR_MATERIAL } from './surface.js';
import { figurMaterial } from './figurlook.js';
import { embeddedBytes } from './embed.js';
import { ANISO } from './device.js';

/**
 * Asset-Pipeline für Figuren. Modelle liegen in public/assets/, werden einmal
 * geladen und pro Figur geklont (Skelett inklusive).
 *
 * Eigenes Modell einhängen: hier einen Eintrag anlegen und in classes.js
 * bei der Klasse `model: '<id>'` setzen. Siehe public/assets/README.md.
 */
export const CHARACTER_MODELS = {
  // Aus drei Quaternius-Paketen (alle CC0) zusammengesetzt, siehe
  // tools/figur-bauen.mjs: Kopf und Körper aus „Universal Base Characters",
  // Kleidung aus „Modular Character Outfits – Fantasy", Bewegungen aus der
  // „Universal Animation Library". Ein Skelett mit 65 Knochen, das alle drei
  // teilen – deshalb lassen sie sich überhaupt mischen.
  //
  // Die drei Einträge unterscheiden sich nur in Datei, Einfärbung und den
  // Kampf-Clips: der Barbar schlägt zu (Sword_Attack), der Waldläufer legt an
  // (Pistol_*), der Magier wirkt einen Zauber (Spell_Simple_*). Waffen bringen
  // die Modelle keine mit, die kommen prozedural aus gear.js an `hand_r`.
  qua_barbar: {
    url: 'assets/characters/qua_barbar.glb',
    yaw: 0,
    bones: {
      hips: 'pelvis', spine: 'spine_01', chest: 'spine_03', head: 'Head',
      rightArm: 'upperarm_r', rightForeArm: 'lowerarm_r', rightHand: 'hand_r',
      leftArm: 'upperarm_l', leftForeArm: 'lowerarm_l', leftHand: 'hand_l',
    },
    clips: { idle: 'Idle', walk: 'Walk', run: 'Run', death: 'Death', roll: 'Roll' },
    // Der Vergleich in `buildLayerClips` schneidet am Punkt ab und prüft dann
    // mit startsWith – hier stehen also die Stämme, `spine` trifft spine_01..03.
    upperBones: ['spine', 'neck', 'Head', 'clavicle', 'upperarm', 'lowerarm',
                 'hand', 'index', 'middle', 'pinky', 'ring', 'thumb'],
    layers: { aim: 'Aim', shoot: 'Shoot', hit: 'Hit' },
    cycle: { walk: 1.33, run: 0.93, walkSpeed: 0.65, runSpeed: 1.67 },   // gemessen: tools/gangtempo.mjs
    waffenform: 'axt',
    grip: { pos: [0, 0.06, 0.02], rot: [-1.5708, 0, 0], scale: 0.9 },
    // Prozedurale Waffen zeigen entlang +z; im Ego-Bild hängt die Waffe vor der
    // Kamera, die nach -z blickt – deshalb ist die Grunddrehung rund um π.
    viewmodel: { form: 'axt', laenge: 0.72, rot: [0.12, 2.75, 0.2], pos: [0, -0.04, 0.05] },
    tintMaterials: ['MI_Peasant'],      // Hose und Stiefel, nicht die nackte Haut
    tintMix: 0.3,
  },

  qua_schurke: {
    url: 'assets/characters/qua_schurke.glb',
    yaw: 0,
    bones: {
      hips: 'pelvis', spine: 'spine_01', chest: 'spine_03', head: 'Head',
      rightArm: 'upperarm_r', rightForeArm: 'lowerarm_r', rightHand: 'hand_r',
      leftArm: 'upperarm_l', leftForeArm: 'lowerarm_l', leftHand: 'hand_l',
    },
    clips: { idle: 'Idle', walk: 'Walk', run: 'Run', death: 'Death', roll: 'Roll' },
    upperBones: ['spine', 'neck', 'Head', 'clavicle', 'upperarm', 'lowerarm',
                 'hand', 'index', 'middle', 'pinky', 'ring', 'thumb'],
    layers: { aim: 'Aim', shoot: 'Shoot', hit: 'Hit' },
    cycle: { walk: 1.33, run: 0.93, walkSpeed: 0.59, runSpeed: 1.50 },   // gemessen: tools/gangtempo.mjs
    waffenform: 'armbrust',
    grip: { pos: [0, 0.06, 0.02], rot: [-1.5708, 0, 0], scale: 0.9 },
    viewmodel: { form: 'armbrust', laenge: 0.62, rot: [0.06, Math.PI, 0.03], pos: [0, 0.0, 0.04] },
    tintMaterials: ['MI_Ranger'],
    tintMix: 0.28,
  },

  qua_magier: {
    url: 'assets/characters/qua_magier.glb',
    yaw: 0,
    bones: {
      hips: 'pelvis', spine: 'spine_01', chest: 'spine_03', head: 'Head',
      rightArm: 'upperarm_r', rightForeArm: 'lowerarm_r', rightHand: 'hand_r',
      leftArm: 'upperarm_l', leftForeArm: 'lowerarm_l', leftHand: 'hand_l',
    },
    clips: { idle: 'Idle', walk: 'Walk', run: 'Run', death: 'Death', roll: 'Roll' },
    upperBones: ['spine', 'neck', 'Head', 'clavicle', 'upperarm', 'lowerarm',
                 'hand', 'index', 'middle', 'pinky', 'ring', 'thumb'],
    layers: { aim: 'Aim', shoot: 'Shoot', hit: 'Hit' },
    cycle: { walk: 1.33, run: 0.93, walkSpeed: 0.60, runSpeed: 1.54 },   // gemessen: tools/gangtempo.mjs
    waffenform: 'stab',
    grip: { pos: [0, 0.06, 0.02], rot: [-1.5708, 0, 0], scale: 0.9 },
    viewmodel: { form: 'stab', laenge: 0.8, rot: [0.1, 2.9, 0.08], pos: [0, -0.03, 0.05] },
    tintMaterials: ['MI_Peasant', 'MI_Ranger'],   // Kittel und Kapuze
    tintMix: 0.3,
  },

  // Quaternius „Ultimate Monsters" (CC0): ein echter Ork. Liegt als Alternative
  // bereit, im Spiel steckt derzeit der Barbar – zwei Zeichner in einer Arena
  // sah man der Figur an. Gleiches Knochenschema wie die men_*, aber ohne
  // `Wrist` – die Hand ist `Index1.R`, wie beim Toon-Kit. Keine Seitwärts- und
  // keine Zielclips: `Weapon` liegt als Hieb über dem Oberkörper, wenn er feuert.
  qua_ork: {
    url: 'assets/characters/qua_ork.glb',
    yaw: 0,
    bones: {
      hips: 'Hips', spine: 'Abdomen', chest: 'Torso', head: 'Head',
      rightArm: 'UpperArm.R', rightForeArm: 'LowerArm.R', rightHand: 'Index1.R',
      leftArm: 'UpperArm.L', leftForeArm: 'LowerArm.L', leftHand: 'Index1.L',
    },
    clips: { idle: 'Idle', walk: 'Walk', run: 'Run', death: 'Death' },
    upperBones: ['Abdomen', 'Torso', 'Neck', 'Head', 'Shoulder',
                 'UpperArm', 'LowerArm', 'Index', 'Middle', 'Pinky', 'Thumb'],
    layers: { shoot: 'Weapon', hit: 'HitReact' },   // kein `aim`: es gibt keine Zielpose
    cycle: { walk: 1.0, run: 0.57, walkSpeed: 0.65, runSpeed: 0.92 },    // gemessen: tools/gangtempo.mjs
    // Seine Keule ist an die Knochen gewichtet, nicht angehängt – in der dritten
    // Person ideal, fürs Ego-Bild unbrauchbar. Daher `form`: dort eine Axt aus gear.js.
    weapons: { shotgun: 'Orc_Weapon' },
    weaponHide: ['Orc_Weapon'],
    viewmodel: { laenge: 0.72, rot: [0.12, 2.75, 0.2], pos: [0, -0.04, 0.06] },
    tintMaterials: [],                              // die Figur bringt ihre Farbe mit
  },

  // KayKit Character Packs von Kay Lousberg (CC0): Fantasy-Figuren im selben
  // Comic-Maßstab wie das Spiel. Eine Farbatlas-Textur je Figur, ein Material,
  // rund 5700 Dreiecke. Waffen liegen als eigene Meshes an `handslot.r` bereit –
  // Axt, Armbrust, Zauberstab –, deshalb `weapons` statt prozeduraler Waffe.
  // Aus den mitgelieferten 76 Clips sind 14 übrig, siehe tools/glb-schlanken.mjs.
  kay_barbar: {
    url: 'assets/characters/kay_barbar.glb',
    yaw: 0,
    scaleBias: 1.0,
    bones: {
      hips: 'hips', spine: 'spine', chest: 'chest', head: 'head',
      rightArm: 'upperarm.r', rightForeArm: 'lowerarm.r', rightHand: 'wrist.r',
      leftArm: 'upperarm.l', leftForeArm: 'lowerarm.l', leftHand: 'wrist.l',
    },
    clips: {
      idle: 'Idle', walk: 'Walking_A', run: 'Running_A',
      runLeft: 'Running_Strafe_Left', runRight: 'Running_Strafe_Right', runBack: 'Walking_Backwards',
      death: 'Death_A', roll: 'Dodge_Forward',
    },
    // Knochennamen tragen die Seite als Endung (`.r`), der Vergleich schneidet
    // am Punkt ab – hier stehen also die Stämme.
    upperBones: ['spine', 'chest', 'neck', 'head', 'upperarm', 'lowerarm', 'wrist', 'hand', 'handslot'],
    layers: { aim: '2H_Melee_Idle', shoot: '2H_Ranged_Shoot', hit: 'Hit_A' },
    cycle: { walk: 1.07, run: 0.8, walkSpeed: 0.38, runSpeed: 0.91 },    // gemessen: tools/gangtempo.mjs
    weapons: { shotgun: '2H_Axe' },
    weaponHide: ['1H_Axe', '1H_Axe_Offhand', '2H_Axe', 'Barbarian_Round_Shield', 'Mug'],
    // Die Axt liegt im Modell mit dem Stiel entlang +y; -x kippt ihn nach vorn.
    viewmodel: { rot: [-1.05, 0.45, 0.3], laenge: 0.66, pos: [0, -0.04, 0.04] },
    tintMaterials: [],                              // die Figur bringt ihre Farbe mit
  },

  kay_schurke: {
    url: 'assets/characters/kay_schurke.glb',
    yaw: 0,
    bones: {
      hips: 'hips', spine: 'spine', chest: 'chest', head: 'head',
      rightArm: 'upperarm.r', rightForeArm: 'lowerarm.r', rightHand: 'wrist.r',
      leftArm: 'upperarm.l', leftForeArm: 'lowerarm.l', leftHand: 'wrist.l',
    },
    clips: {
      idle: 'Idle', walk: 'Walking_A', run: 'Running_A',
      runLeft: 'Running_Strafe_Left', runRight: 'Running_Strafe_Right', runBack: 'Walking_Backwards',
      death: 'Death_A', roll: 'Dodge_Forward',
    },
    upperBones: ['spine', 'chest', 'neck', 'head', 'upperarm', 'lowerarm', 'wrist', 'hand', 'handslot'],
    layers: { aim: '2H_Ranged_Aiming', shoot: '2H_Ranged_Shoot', hit: 'Hit_A' },
    cycle: { walk: 1.07, run: 0.8, walkSpeed: 0.42, runSpeed: 1.00 },    // gemessen: tools/gangtempo.mjs
    weapons: { smg: '2H_Crossbow' },
    weaponHide: ['1H_Crossbow', '2H_Crossbow', 'Knife', 'Knife_Offhand', 'Throwable'],
    // Die Armbrust zeigt schon entlang +z, muss also nur umgedreht werden.
    viewmodel: { rot: [0.08, Math.PI, 0.06], laenge: 0.6, pos: [0, 0.02, 0.02] },
    tintMaterials: [],
  },

  kay_magier: {
    url: 'assets/characters/kay_magier.glb',
    yaw: 0,
    bones: {
      hips: 'hips', spine: 'spine', chest: 'chest', head: 'head',
      rightArm: 'upperarm.r', rightForeArm: 'lowerarm.r', rightHand: 'wrist.r',
      leftArm: 'upperarm.l', leftForeArm: 'lowerarm.l', leftHand: 'wrist.l',
    },
    clips: {
      idle: 'Idle', walk: 'Walking_A', run: 'Running_A',
      runLeft: 'Running_Strafe_Left', runRight: 'Running_Strafe_Right', runBack: 'Walking_Backwards',
      death: 'Death_A', roll: 'Dodge_Forward',
    },
    upperBones: ['spine', 'chest', 'neck', 'head', 'upperarm', 'lowerarm', 'wrist', 'hand', 'handslot'],
    layers: { aim: 'Spellcast_Raise', shoot: 'Spellcast_Shoot', hit: 'Hit_A' },
    cycle: { walk: 1.07, run: 0.8, walkSpeed: 0.30, runSpeed: 0.73 },    // gemessen: tools/gangtempo.mjs
    weapons: { rifle: '2H_Staff' },
    weaponHide: ['1H_Wand', '2H_Staff', 'Spellbook', 'Spellbook_open'],
    // Der Stab liegt entlang +y, wird schräg nach vorn gekippt.
    viewmodel: { rot: [-0.85, 0.35, 0.15], laenge: 0.8, pos: [0, -0.1, 0.04] },
    // Der spitze Hut steckt in der Bounding-Box: ohne Ausgleich schrumpft der Körper.
    scaleBias: 1.12,
    tintMaterials: [],
  },

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
    cycle: { walk: 1.33, run: 0.8, walkSpeed: 0.66, runSpeed: 1.30 },    // gemessen: tools/gangtempo.mjs
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
    cycle: { walk: 1.33, run: 0.8, walkSpeed: 0.64, runSpeed: 1.24 },    // gemessen: tools/gangtempo.mjs
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
    cycle: { walk: 1.33, run: 0.8, walkSpeed: 0.68, runSpeed: 1.32 },    // gemessen: tools/gangtempo.mjs
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
};

const cache = new Map();

/** glTF laden – aus dem Netz oder, im Einzeldatei-Build, aus den Rohdaten. */
function loadGltf(loader, url) {
  const bytes = embeddedBytes(url);
  if (!bytes) return loader.loadAsync(url);
  return new Promise((res, rej) => loader.parse(bytes.buffer, '', res, rej));
}

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
    const gltf = await loadGltf(loader, def.url);
    texturenSchaerfen(gltf.scene);
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
  entry.scene.updateWorldMatrix(true, true);
  let m;
  if (src.isSkinnedMesh) {
    // Gewichtete Waffen (Quaternius-Monster) tragen kein eigenes Gelenk, sondern
    // hängen an den Handknochen. Ein Klon behielte die Skelett-Referenz der
    // Vorlage, die nie mitläuft – er stünde in der Bindepose an der falschen
    // Stelle. Fürs Ego-Bild reicht die starre Geometrie; ihre Ecken liegen im
    // Modellraum, also wird sie auf den Ursprung zurückgeschoben.
    const geo = src.geometry.clone();
    geo.computeBoundingBox();
    const mitte = geo.boundingBox.getCenter(new THREE.Vector3());
    geo.translate(-mitte.x, -mitte.y, -mitte.z);
    geo.deleteAttribute('skinIndex'); geo.deleteAttribute('skinWeight');
    m = new THREE.Mesh(geo, src.material);
  } else {
    m = src.clone(true);
  }
  m.visible = true;
  m.position.set(0, 0, 0); m.quaternion.identity();
  // Weltskalierung des Originals übernehmen, damit die Waffe in Metern stimmt
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
  // Der Maßstab kommt aus der Gesamthöhe des Modells. Ein spitzer Hut oder ein
  // erhobener Stab stecken mit drin und würden den Körper schrumpfen lassen –
  // `scaleBias` gleicht das aus.
  if (height) root.scale.setScalar((height / entry.height) * (def.scaleBias || 1));

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
      if (REAL) {
        // Figuren ohne Weltraum-Projektion, die würde beim Animieren wandern.
        // Und ohne die Cel-Hilfsmittel aus figurlook.js: Saum, gedämpftes
        // Fülllicht und Bodenverdunkelung sind Ersatz für Licht, das es im
        // realen Stil wirklich gibt – zusammen sähe die Figur aus, als klebte
        // ein Aufkleber auf dem Bild.
        realisticMaterial(c);
      } else {
        // Saum und Bodenverdunkelung: gibt der Figur Form und trennt sie vom
        // Hintergrund. Ohne das steht sie flach in einer Helligkeitsstufe.
        figurMaterial(c, entry.height);
      }
      if (tint && (!def.tintMaterials || def.tintMaterials.includes(m.name))) {
        // Modelle mit Textur werden überblendet, flache Toon-Modelle bekommen die Farbe direkt
        // Mit Textur wird nur hineingemischt, sonst überdeckt die Klassenfarbe die
      // Zeichnung. Wie stark, sagt `tintMix`.
      // Im realen Stil nur andeuten: eine komplett eingefärbte Figur ist ein
      // Comic-Mittel. Wer zu wem gehört, sagt ohnehin der Wimpel über dem Kopf.
      const mischung = (def.tintMix ?? 0.8) * (REAL ? 0.45 : 1);
      if (c.map) c.color.lerp(new THREE.Color(tint), mischung); else c.color.set(tint);
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

// ---------------------------------------------------------------------------
// Props (Arena-Ausstattung). Statische Modelle, werden einmal geladen und
// per clone() beliebig oft gesetzt – Geometrie wird dabei geteilt.
// ---------------------------------------------------------------------------
const propCache = new Map();

const kitLaden = new Map();      // Bausatzname → laufendes Laden

/**
 * Ein Bausatz ist eine GLB, in der jedes Teil als benannter Knoten liegt
 * (gebaut mit tools/kit-packen.mjs). Der Vorteil gegenüber einer Datei je Teil:
 * gleiche Texturen liegen nur einmal darin. Nach dem Laden landet jedes Teil
 * unter „<bausatz>:<teil>" im selben Zwischenspeicher wie die Einzel-Props –
 * `spawnProp` merkt keinen Unterschied.
 */
/**
 * Anisotrope Filterung für alles, was aus einer Datei kommt: Bausatzteile und
 * Figuren. Die Zahl steht in `device.js`, damit `world.js` und `surface.js`
 * dieselbe benutzen – vorher setzte jede Datei ihre eigene (8, 4, und der
 * Bausatz gar keine).
 */
function texturenSchaerfen(wurzel) {
  const fertig = new Set();
  wurzel.traverse((o) => {
    if (!o.isMesh) return;
    for (const mat of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!mat || fertig.has(mat)) continue;
      fertig.add(mat);
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) {
        const t = mat[k];
        if (t && t.anisotropy < ANISO) { t.anisotropy = ANISO; t.needsUpdate = true; }
      }
    }
  });
}

function ladeKit(loader, kit) {
  if (!kitLaden.has(kit)) {
    kitLaden.set(kit, loadGltf(loader, `assets/props/${kit}.glb`).then((gltf) => {
      texturenSchaerfen(gltf.scene);
      for (const teil of [...gltf.scene.children]) {
        teil.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        propCache.set(`${kit}:${teil.name}`, teil);
      }
    }));
  }
  return kitLaden.get(kit);
}

/**
 * Lädt Props aus public/assets/props/<name>.glb. Enthält ein Name einen
 * Doppelpunkt, ist er ein Teil aus einem Bausatz: „dorf:Wall_Plaster_Straight".
 */
export async function preloadProps(names, onProgress) {
  const loader = new GLTFLoader();
  const list = [...new Set(names)].filter(n => !propCache.has(n));
  const kits = [...new Set(list.filter(n => n.includes(':')).map(n => n.split(':')[0]))];
  let done = 0;
  const schritte = list.length + kits.length;
  await Promise.all([
    ...kits.map(async (kit) => {
      await ladeKit(loader, kit);
      onProgress?.(++done / schritte, kit);
    }),
    ...list.filter(n => !n.includes(':')).map(async (name) => {
      const gltf = await loadGltf(loader, `assets/props/${name}.glb`);
      const root = gltf.scene;
      texturenSchaerfen(root);
      root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      propCache.set(name, root);
      onProgress?.(++done / schritte, name);
    }),
  ]);
  const fehlend = list.filter(n => !propCache.has(n));
  if (fehlend.length) console.warn('Prop nicht im Bausatz:', fehlend.join(', '));
}

/**
 * Setzt eine Instanz eines geladenen Props. Materialien werden pro Name auf
 * Toon umgestellt (Cel-Rampe), damit die Arena zum Rest des Looks passt.
 */
export function spawnProp(name, { ramp } = {}) {
  const src = propCache.get(name);
  if (!src) throw new Error(`Prop "${name}" ist nicht geladen`);
  const m = src.clone(true);
  if (REAL) {
    // Physikalische Materialien behalten und ihnen eine echte Oberfläche geben.
    // Zwei Wege, je nachdem, was das Modell mitbringt:
    //  - Teile aus dem Dorfbausatz haben UV-Koordinaten und einen bekannten
    //    Materialnamen (MI_Plaster, MI_RoundTiles …): dort werden die Karten
    //    direkt zugewiesen, das sitzt genau.
    //  - alles andere bekommt die Struktur im Weltraum projiziert.
    // Pro Ausgangsmaterial einmal, das Ergebnis wird gemerkt.
    m.traverse(o => {
      if (!o.isMesh) return;
      const set = SURFACE_FOR_PROP[name] || null;
      const conv = (mat) => {
        const fuerMaterial = SURFACE_FOR_MATERIAL[mat.name];
        const key = mat.uuid + '|' + (fuerMaterial ? `m:${fuerMaterial.set}` : set);
        if (!realCache.has(key)) {
          const neu = mat.clone();
          realCache.set(key, fuerMaterial
            ? uvSurface(realisticMaterial(neu), fuerMaterial.set,
              { repeat: fuerMaterial.wiederholung, farbe: fuerMaterial.farbe })
            : realisticMaterial(neu, { set, scale: 0.4 }));
        }
        return realCache.get(key);
      };
      o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
    });
    return m;
  }
  if (ramp) {
    m.traverse(o => {
      if (!o.isMesh) return;
      const conv = (mat) => {
        const key = mat.uuid;
        if (!toonCache.has(key)) {
          // `alphaTest` muss mit: Laub besteht aus Kärtchen, deren Blattform
          // allein in der Alphastufe der Textur steckt (glTF `MASK`). Ohne den
          // Test wird aus einem Busch ein dunkler Klotz.
          const t = new THREE.MeshToonMaterial({
            color: mat.color, map: mat.map || null, gradientMap: ramp,
            transparent: mat.transparent, opacity: mat.opacity, side: mat.side,
            alphaTest: mat.alphaTest || 0,
          });
          toonCache.set(key, t);
        }
        return toonCache.get(key);
      };
      o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
    });
  }
  return m;
}
const toonCache = new Map();
const realCache = new Map();
