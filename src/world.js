import * as THREE from 'three';
import { celRamp, buildSky } from './render.js';

const RAMP = celRamp(4);
const toon = (c) => new THREE.MeshToonMaterial({ color: c, gradientMap: RAMP });

/** Baut die Arena. Gibt {group, colliders, spawns, bounds} zurück. */
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
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), new THREE.MeshToonMaterial({ map: tex, gradientMap: RAMP }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  group.add(ground);

  // Außenmauern
  const wallMat = toon(0xd9c8a9);
  const addBox = (x, y, z, w, h, d, m = wallMat) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh); colliders.push(mesh); return mesh;
  };
  const H = 4, T = 1;
  addBox(0, H / 2, -SIZE / 2, SIZE, H, T); addBox(0, H / 2, SIZE / 2, SIZE, H, T);
  addBox(-SIZE / 2, H / 2, 0, T, H, SIZE); addBox(SIZE / 2, H / 2, 0, T, H, SIZE);

  // Deckung: Kisten, Sandsäcke, Ruinen – symmetrisch für Fairness
  const crate = toon(0xc98a4b), sand = toon(0xe3c78a), ruin = toon(0x9a8f86);
  const layout = [
    [0, 0, 6, 3, 6, ruin],        // Mitte
    [10, 8, 3, 2, 3, crate], [-10, -8, 3, 2, 3, crate],
    [-10, 8, 3, 2, 3, crate], [10, -8, 3, 2, 3, crate],
    [0, 16, 8, 1.2, 1.5, sand], [0, -16, 8, 1.2, 1.5, sand],
    [18, 0, 1.5, 1.2, 8, sand], [-18, 0, 1.5, 1.2, 8, sand],
    [20, 18, 4, 5, 4, ruin], [-20, -18, 4, 5, 4, ruin],
    [-20, 18, 2, 2, 2, crate], [20, -18, 2, 2, 2, crate],
    [6, -22, 5, 2.5, 2, ruin], [-6, 22, 5, 2.5, 2, ruin],
  ];
  for (const [x, z, w, h, d, m] of layout) addBox(x, h / 2, z, w, h, d, m);

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
export function resolveCollisions(pos, radius, world) {
  const b = world.bounds;
  pos.x = Math.min(b, Math.max(-b, pos.x));
  pos.z = Math.min(b, Math.max(-b, pos.z));
  const box = new THREE.Box3();
  for (const m of world.colliders) {
    box.setFromObject(m);
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
