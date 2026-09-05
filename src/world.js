import * as THREE from 'three';

const toon = (c) => new THREE.MeshToonMaterial({ color: c });

/** Baut die Arena. Gibt {group, colliders, spawns, bounds} zurück. */
export function buildWorld(scene) {
  const group = new THREE.Group();
  const colliders = [];
  const SIZE = 60;

  // Boden mit Canvas-Schachbrett-Textur (prozedural, kein Asset)
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#8fb85c'; ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#7fa64f';
  for (let i = 0; i < 400; i++) ctx.fillRect(Math.random() * 256, Math.random() * 256, 6, 3);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(12, 12);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), new THREE.MeshToonMaterial({ map: tex }));
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
  const sun = new THREE.DirectionalLight(0xfff2d6, 2.2);
  sun.position.set(25, 40, 15); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, far: 120 });
  group.add(sun, new THREE.HemisphereLight(0xbfe6ff, 0x6b8f3a, 0.9));
  scene.background = new THREE.Color(0x9fd7f7);
  scene.fog = new THREE.Fog(0x9fd7f7, 60, 140);

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
