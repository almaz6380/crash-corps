import * as THREE from 'three';
import { celRamp, buildSky } from './render.js';
import { spawnProp } from './assets.js';

const RAMP = celRamp(4);

/** Props, die die Arena braucht – main.js lädt sie vor dem Aufbau. */
export const WORLD_PROPS = [
  'Structure_1', 'Structure_2', 'Structure_4', 'Container_Long', 'Container_Small', 'Crate',
  'SackTrench', 'SackTrench_Small', 'BrickWall_2', 'Barrier_Large', 'Barrier_Single',
  'CardboardBoxes_2', 'Pallet', 'ExplodingBarrel', 'GasTank', 'Pipes', 'Debris_Tires',
  'Debris_BrokenCar', 'Tank', 'TrafficCone', 'StreetLight', 'MetalFence', 'Tree_1', 'Tree_2', 'Sign',
];

/**
 * Baut die Arena aus den Toon-Kit-Props. Gibt {group, colliders, spawns, bounds} zurück.
 * colliders sind unsichtbare Quader (für Bewegung und Sichtlinie); die Props
 * selbst sind reine Optik.
 */
export function buildWorld(scene) {
  const group = new THREE.Group();
  const colliders = [];
  const SIZE = 60;

  // Boden: prozedurale Canvas-Textur mit Grasbüscheln und Erdflecken
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#82a95a'; ctx.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 5000; i++) {
    ctx.fillStyle = ['#7ba054', '#8fb264', '#6e9149', '#97b972'][i % 4];
    ctx.fillRect(Math.random() * 1024, Math.random() * 1024, 3 + Math.random() * 9, 2 + Math.random() * 4);
  }
  for (let i = 0; i < 26; i++) {
    const px = Math.random() * 1024, py = Math.random() * 1024, r = 30 + Math.random() * 90;
    const g = ctx.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, 'rgba(150,116,72,0.6)'); g.addColorStop(1, 'rgba(150,116,72,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(14, 14);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(SIZE * 3, SIZE * 3), new THREE.MeshToonMaterial({ map: tex, gradientMap: RAMP }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  group.add(ground);

  // Unsichtbarer Kollisionsquader. Bewegung und Raycasts laufen dagegen,
  // die Box wird einmal berechnet und nicht pro Frame neu.
  const solidBox = (box) => {
    const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), new THREE.MeshBasicMaterial({ visible: false }));
    proxy.position.copy(center); proxy.updateMatrixWorld(true);
    proxy.userData.box = box.clone();
    group.add(proxy); colliders.push(proxy);
    return proxy;
  };
  const addBox = (x, y, z, w, h, d) => solidBox(new THREE.Box3(new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2), new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2)));

  /**
   * Prop setzen. solid: Kollisionsquader aus der Bounding-Box.
   * pad: Quader schrumpfen (m), damit man Kanten nicht schon weit vorher berührt.
   */
  const place = (name, x, z, ry = 0, { solid = true, scale = 1, y = 0, pad = 0 } = {}) => {
    const p = spawnProp(name, { ramp: RAMP });
    p.position.set(x, y, z); p.rotation.y = ry; p.scale.setScalar(scale);
    group.add(p); p.updateMatrixWorld(true);
    if (solid) {
      const box = new THREE.Box3().setFromObject(p);
      box.min.x += pad; box.min.z += pad; box.max.x -= pad; box.max.z -= pad;
      box.min.y = Math.min(box.min.y, 0);
      solidBox(box);
    }
    return p;
  };

  // ---- Außengrenze: Zaunring + unsichtbare Wände ----
  const H = 4, T = 1;
  addBox(0, H / 2, -SIZE / 2, SIZE, H, T); addBox(0, H / 2, SIZE / 2, SIZE, H, T);
  addBox(-SIZE / 2, H / 2, 0, T, H, SIZE); addBox(SIZE / 2, H / 2, 0, T, H, SIZE);
  for (let i = 0; i < 17; i++) {
    const s = i * 3.5 - 28;
    place('MetalFence', s, -SIZE / 2, 0, { solid: false });
    place('MetalFence', s, SIZE / 2, 0, { solid: false });
    place('MetalFence', -SIZE / 2, s, Math.PI / 2, { solid: false });
    place('MetalFence', SIZE / 2, s, Math.PI / 2, { solid: false });
  }
  // Bäume außerhalb des Zauns als Kulisse
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2 + (i % 2) * 0.1;
    const r = 36 + (i % 3) * 4;
    place(i % 2 ? 'Tree_1' : 'Tree_2', Math.cos(a) * r, Math.sin(a) * r, a, { solid: false, scale: 0.9 + (i % 4) * 0.12 });
  }
  for (const [x, z] of [[-27, -27], [27, 27], [-27, 27], [27, -27]]) place('StreetLight', x, z, Math.atan2(-x, -z), { pad: 0.1 });

  // ---- Deckung: symmetrisch für Fairness, Positionen wie im Prototyp ----
  place('Structure_1', 0, 0, 0, { pad: 0.3 });                                  // Mitte
  place('GasTank', 5.2, 3.4, 0.4); place('Pipes', -5.2, -3.2, 0, { y: 2.13, pad: 0.2 });

  place('Container_Small', 10, 8, 0.25); place('Crate', 12.2, 6.6, 0.5);        // Kisten-Ecken
  place('Container_Small', -10, -8, 0.25); place('Crate', -12.2, -6.6, 0.5);
  place('CardboardBoxes_2', -10, 8, -0.4); place('Crate', -9.4, 9.6, 0.2); place('ExplodingBarrel', -11.6, 7.2, 0);
  place('CardboardBoxes_2', 10, -8, -0.4); place('Crate', 9.4, -9.6, 0.2); place('ExplodingBarrel', 11.6, -7.2, 0);

  place('SackTrench', -1.7, 16, 0); place('SackTrench', 1.7, 16, 0);            // Sandsäcke
  place('SackTrench', -1.7, -16, Math.PI); place('SackTrench', 1.7, -16, Math.PI);
  place('SackTrench_Small', 18, -1.3, Math.PI / 2); place('SackTrench_Small', 18, 1.3, Math.PI / 2);
  place('SackTrench_Small', -18, -1.3, -Math.PI / 2); place('SackTrench_Small', -18, 1.3, -Math.PI / 2);

  place('Structure_2', 19, 16, Math.PI, { pad: 0.3 });                          // große Ruinen
  place('Structure_4', -19, -16, 0, { pad: 0.3 });

  place('Container_Long', -20, 18, 0.35); place('Pallet', -16.5, 20.5, 0.3, { solid: false }); place('Crate', -16.5, 20.5, 0.3);
  place('Container_Long', 20, -18, 0.35); place('Pallet', 16.5, -20.5, 0.3, { solid: false }); place('Crate', 16.5, -20.5, 0.3);

  place('BrickWall_2', 6, -22, 0); place('Barrier_Large', 9.2, -22, 0);          // niedrige Deckung an den Enden
  place('BrickWall_2', -6, 22, 0); place('Barrier_Large', -9.2, 22, 0);

  place('Debris_BrokenCar', 25, -6, 1.2);                                       // Kulisse mit Kollision
  place('Tank', -24, 7, 0.9);
  place('Debris_Tires', 24, 24, 0.3); place('Debris_Tires', -24, -24, 1.1);
  for (const [x, z] of [[4, -10], [-4, 10], [14, 2], [-14, -2]]) place('TrafficCone', x, z, 0, { solid: false });
  place('Barrier_Single', 0, 25, 0); place('Barrier_Single', 0, -25, 0);
  place('Sign', 7, 0.5, -0.8, { solid: false }); place('Sign', -7, -0.5, 2.3, { solid: false });

  // Kontrollpunkt-Marker (für Domination später) – jetzt nur Deko
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd166 });
  for (const [x, z] of [[0, 0], [20, -20], [-20, 20]]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.6, 24), ringMat);
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.02, z); group.add(ring);
  }

  // Licht: Sonne + Himmel
  const sun = new THREE.DirectionalLight(0xfff2d6, 2.6);
  sun.position.set(25, 40, 15); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, far: 120 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02; sun.shadow.radius = 3;
  sun.shadow.camera.updateProjectionMatrix();
  const rim = new THREE.DirectionalLight(0xbcd8ff, 0.8); rim.position.set(-20, 14, -25);
  group.add(sun, rim, new THREE.HemisphereLight(0xbfe6ff, 0x6b8f3a, 1.1));
  group.add(buildSky());
  scene.fog = new THREE.Fog(0xa9d3ea, 55, 170);

  scene.add(group);
  const spawns = [
    new THREE.Vector3(-24, 0, -24), new THREE.Vector3(24, 0, 24),
    new THREE.Vector3(-24, 0, 24), new THREE.Vector3(24, 0, -24),
    new THREE.Vector3(0, 0, -25), new THREE.Vector3(0, 0, 25),
  ];
  return { group, colliders, spawns, bounds: SIZE / 2 - 1.5 };
}

/** Grobe Kollision: Kapsel (Kreis auf XZ) gegen AABB-Kollider. Schiebt pos raus. */
const _box = new THREE.Box3();
export function resolveCollisions(pos, radius, world) {
  const b = world.bounds;
  pos.x = Math.min(b, Math.max(-b, pos.x));
  pos.z = Math.min(b, Math.max(-b, pos.z));
  for (const m of world.colliders) {
    const box = m.userData.box || _box.setFromObject(m);
    if (pos.y > box.max.y) continue;
    const cx = Math.max(box.min.x, Math.min(pos.x, box.max.x));
    const cz = Math.max(box.min.z, Math.min(pos.z, box.max.z));
    const dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 === 0) { pos.x = box.max.x + radius; continue; }
      const d = Math.sqrt(d2), push = (radius - d) / d;
      pos.x += dx * push; pos.z += dz * push;
    }
  }
}
