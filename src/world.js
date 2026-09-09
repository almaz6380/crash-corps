import * as THREE from 'three';
import { celRamp, buildSky, buildRealSky } from './render.js';
import { REAL } from './style.js';
import { QUALITY } from './device.js';
import { realisticMaterial, uvSurface, setImage } from './surface.js';
import { spawnProp } from './assets.js';

const RAMP = celRamp(4);
const SIZE = 60;                 // Kantenlänge der Arena
export const STEP_UP = 0.55;     // maximale Stufenhöhe, die Figuren erklimmen
const PLATFORM_H = 2.3;          // Höhe der begehbaren Ebene (Containerdach)

/** Baumaterial im jeweiligen Stil: Toon-Rampe oder physikalisch mit Struktur. */
const build = (color, name, set = 'rust_coarse_01') => REAL
  ? realisticMaterial(new THREE.MeshStandardMaterial({ color, name }), { set, scale: 0.35 })
  : new THREE.MeshToonMaterial({ color, gradientMap: RAMP });

/** Props, die die Arena braucht – main.js lädt sie vor dem Aufbau. */
export const WORLD_PROPS = [
  'Structure_2', 'Structure_4', 'Container_Long', 'Container_Small', 'Crate',
  'SackTrench', 'SackTrench_Small', 'BrickWall_2', 'Barrier_Large', 'Barrier_Single',
  'CardboardBoxes_2', 'Pallet', 'ExplodingBarrel', 'GasTank', 'Pipes', 'Debris_Tires',
  'Debris_BrokenCar', 'Tank', 'TrafficCone', 'StreetLight', 'MetalFence', 'Tree_1', 'Tree_2',
];

/** Bemalter Arenaboden: Asphalt in der Mitte, Schotterwege, Gras außen. */
function arenaFloorTexture() {
  const S = 2048, c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  const px = (v) => ((v + SIZE / 2) / SIZE) * S;      // Weltkoordinate → Pixel
  const m = (v) => (v / SIZE) * S;                    // Länge → Pixel

  // Im realistischen Stil wird der Boden mit den echten Texturen gemalt, sonst
  // prozedural. So passt die Arenafläche zu den texturierten Props.
  const pattern = (img, meters) => {
    if (!img) return null;
    const pat = x.createPattern(img, 'repeat');
    const f = (meters / SIZE) * S / img.width;
    pat.setTransform(new DOMMatrix([f, 0, 0, f, 0, 0]));
    return pat;
  };
  const grassPat = pattern(setImage('leafy_grass'), 3.2);
  const asphaltPat = pattern(setImage('asphalt_03'), 3.6);
  const concretePat = pattern(setImage('concrete_floor_02'), 3.0);

  if (grassPat) { x.fillStyle = grassPat; x.fillRect(0, 0, S, S); }
  else {
    x.fillStyle = '#82a95a'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 9000; i++) {
      x.fillStyle = ['#7ba054', '#8fb264', '#6e9149', '#97b972'][i % 4];
      x.fillRect(Math.random() * S, Math.random() * S, 4 + Math.random() * 12, 3 + Math.random() * 5);
    }
  }

  // Schotterwege zwischen den drei Punkten und in die Ecken
  x.lineCap = 'round'; x.strokeStyle = concretePat || '#9c8b6d'; x.lineWidth = m(5.5);
  const path = (pts) => { x.beginPath(); x.moveTo(px(pts[0][0]), px(pts[0][1])); for (const p of pts.slice(1)) x.lineTo(px(p[0]), px(p[1])); x.stroke(); };
  path([[-20, 20], [-8, 8], [8, -8], [20, -20]]);
  path([[-24, -24], [-10, -6], [10, 6], [24, 24]]);
  path([[0, -26], [0, -10]]); path([[0, 26], [0, 10]]);
  x.globalAlpha = 0.5; x.strokeStyle = concretePat || '#8d7d61'; x.lineWidth = m(3.2);
  path([[-20, 20], [-8, 8], [8, -8], [20, -20]]);
  x.globalAlpha = 1;

  // Asphaltplatte in der Mitte
  x.fillStyle = asphaltPat || '#5f5f63';
  x.beginPath(); x.roundRect(px(-11), px(-11), m(22), m(22), m(1.6)); x.fill();
  x.strokeStyle = '#6b6b70'; x.lineWidth = m(0.5); x.stroke();
  x.strokeStyle = '#c8b45e'; x.lineWidth = m(0.28);       // Markierung
  x.setLineDash([m(1.4), m(1.1)]);
  x.beginPath(); x.moveTo(px(-11), px(0)); x.lineTo(px(11), px(0)); x.stroke();
  x.setLineDash([]);
  x.strokeStyle = '#c8b45e'; x.lineWidth = m(0.22);
  x.beginPath(); x.rect(px(-9.6), px(-9.6), m(19.2), m(19.2)); x.stroke();

  // Beton unter den beiden Seitenplattformen
  x.fillStyle = concretePat || '#6c6c70';
  for (const [cx, cz] of [[20, -20], [-20, 20]]) {
    x.beginPath(); x.roundRect(px(cx - 6), px(cz - 6), m(12), m(12), m(0.8)); x.fill();
  }

  // Öl- und Erdflecken
  for (let i = 0; i < 40; i++) {
    const ax = Math.random() * S, ay = Math.random() * S, r = m(1 + Math.random() * 3.5);
    const g = x.createRadialGradient(ax, ay, 0, ax, ay, r);
    const dark = Math.random() < 0.35;
    g.addColorStop(0, dark ? 'rgba(35,30,28,0.55)' : 'rgba(150,116,72,0.5)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.beginPath(); x.arc(ax, ay, r, 0, 7); x.fill();
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

/**
 * Baut die Arena. Zwei Ebenen: Boden und begehbare Containerdächer, verbunden
 * über Rampen. Gibt {group, colliders, spawns, bounds} zurück.
 * colliders sind achsenparallele Quader; die Props selbst sind reine Optik.
 */
export function buildWorld(scene, renderer) {
  const group = new THREE.Group();
  const colliders = [];
  const ramps = [];   // Wegpunkte für die Bot-Navigation zwischen den Ebenen

  // Außenboden bis zum Horizont
  const outer = document.createElement('canvas'); outer.width = outer.height = 512;
  const octx = outer.getContext('2d');
  octx.fillStyle = '#82a95a'; octx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2500; i++) {
    octx.fillStyle = ['#7ba054', '#8fb264', '#6e9149'][i % 3];
    octx.fillRect(Math.random() * 512, Math.random() * 512, 3 + Math.random() * 8, 2 + Math.random() * 4);
  }
  const otex = new THREE.CanvasTexture(outer);
  otex.wrapS = otex.wrapT = THREE.RepeatWrapping; otex.repeat.set(30, 30);
  otex.colorSpace = THREE.SRGBColorSpace; otex.anisotropy = 8;
  const groundMat = REAL
    ? uvSurface(new THREE.MeshStandardMaterial({ name: 'Dirt', roughness: 1 }), 'leafy_grass', { repeat: 60 })
    : new THREE.MeshToonMaterial({ map: otex, gradientMap: RAMP });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; group.add(ground);

  // Bemalter Arenaboden darüber
  const floorMat = REAL
    ? uvSurface(new THREE.MeshStandardMaterial({
        map: arenaFloorTexture(), name: 'Concrete', roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 }),
        'asphalt_03', { repeat: 26, keepMap: true })
    : new THREE.MeshToonMaterial({ map: arenaFloorTexture(), gradientMap: RAMP, polygonOffset: true, polygonOffsetFactor: -1 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.012; floor.receiveShadow = true; group.add(floor);

  // ---- Kollisionsquader ----
  const box3 = (minX, minY, minZ, maxX, maxY, maxZ) => {
    const box = new THREE.Box3(new THREE.Vector3(minX, minY, minZ), new THREE.Vector3(maxX, maxY, maxZ));
    const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), new THREE.MeshBasicMaterial({ visible: false }));
    proxy.position.copy(center); proxy.updateMatrixWorld(true);
    proxy.userData.box = box;
    group.add(proxy); colliders.push(proxy);
    return proxy;
  };
  const solidBox = (box) => box3(box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z);
  const addBox = (x, y, z, w, h, d) => box3(x - w / 2, y - h / 2, z - d / 2, x + w / 2, y + h / 2, z + d / 2);

  /** Prop setzen. solid: Kollisionsquader aus der Bounding-Box. */
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

  const metal = build(0x8b8f96, 'Metal');
  const metalDark = build(0x6f747b, 'Metal2');

  /**
   * Begehbare Platte. Der Kollisionsquader sitzt nur unter der Oberkante,
   * darunter kann man durchlaufen – dadurch entsteht ein offenes Erdgeschoss.
   */
  const deck = (x, z, w, d, h = PLATFORM_H) => {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w, 0.36, d), metal);
    slab.position.set(x, h - 0.18, z); slab.castShadow = slab.receiveShadow = true; group.add(slab);
    // Umlaufende Kante: nur Optik, damit man die Ebene von unten als Ebene erkennt
    for (const [ox, oz, ew, ed] of [[0, -d / 2, w, 0.16], [0, d / 2, w, 0.16], [-w / 2, 0, 0.16, d], [w / 2, 0, 0.16, d]]) {
      const rim = new THREE.Mesh(new THREE.BoxGeometry(ew, 0.22, ed), metalDark);
      rim.position.set(x + ox, h + 0.08, z + oz); rim.castShadow = true; group.add(rim);
    }
    // Kollisionsquader dünner als die sichtbare Platte, damit auch die größte
    // Klasse (1,9 m) unter den Dächern durchpasst
    box3(x - w / 2, h - 0.2, z - d / 2, x + w / 2, h, z + d / 2);
    return slab;
  };

  /**
   * Rampe. Sichtbar als geneigte Platte, begehbar über unsichtbare Stufen –
   * jede niedriger als STEP_UP, dadurch läuft man sie ohne Sprung hoch.
   * `dir` ist die Aufstiegsrichtung in 90°-Schritten (0 = nach +z).
   */
  const rampUp = (x, z, dir, { length = 5.2, width = 2.6, height = PLATFORM_H, steps = 6, base = 0 } = {}) => {
    const g = new THREE.Group();
    g.position.set(x, base, z); g.rotation.y = dir * Math.PI / 2;
    const slope = Math.atan2(height, length);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(width, 0.18, Math.hypot(length, height)), metalDark);
    plate.position.y = height / 2; plate.rotation.x = -slope;
    plate.castShadow = plate.receiveShadow = true; g.add(plate);
    for (const s of [-1, 1]) {                                  // Seitenwangen
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, Math.hypot(length, height)), metal);
      rail.position.set(s * (width / 2 - 0.06), height / 2 + 0.16, 0); rail.rotation.x = -slope;
      rail.castShadow = true; g.add(rail);
    }
    group.add(g);
    // Stufen als achsenparallele Quader in Weltkoordinaten
    const toWorld = (lx, lz) => {
      switch (((dir % 4) + 4) % 4) {
        case 0: return [x + lx, z + lz];
        case 1: return [x + lz, z - lx];
        case 2: return [x - lx, z - lz];
        default: return [x - lz, z + lx];
      }
    };
    for (let i = 0; i < steps; i++) {
      const h = base + (height * (i + 1)) / steps;
      const lz0 = -length / 2 + (length * i) / steps, lz1 = -length / 2 + (length * (i + 1)) / steps;
      const a = toWorld(-width / 2, lz0), b = toWorld(width / 2, lz1);
      box3(Math.min(a[0], b[0]), 0, Math.min(a[1], b[1]), Math.max(a[0], b[0]), h, Math.max(a[1], b[1]));
    }
    // Wegpunkte, damit Bots die Rampe finden statt gegen die Plattform zu laufen
    const foot = toWorld(0, -length / 2 - 1.2), head = toWorld(0, length / 2 + 0.8);
    ramps.push({
      bottom: new THREE.Vector3(foot[0], base, foot[1]),
      top: new THREE.Vector3(head[0], base + height, head[1]),
    });
  };

  // ---- Außengrenze ----
  const H = 5, T = 1;
  addBox(0, H / 2, -SIZE / 2, SIZE, H, T); addBox(0, H / 2, SIZE / 2, SIZE, H, T);
  addBox(-SIZE / 2, H / 2, 0, T, H, SIZE); addBox(SIZE / 2, H / 2, 0, T, H, SIZE);
  for (let i = 0; i < 17; i++) {
    const s = i * 3.5 - 28;
    place('MetalFence', s, -SIZE / 2, 0, { solid: false });
    place('MetalFence', s, SIZE / 2, 0, { solid: false });
    place('MetalFence', -SIZE / 2, s, Math.PI / 2, { solid: false });
    place('MetalFence', SIZE / 2, s, Math.PI / 2, { solid: false });
  }
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2 + (i % 2) * 0.12, r = 37 + (i % 3) * 4;
    place(i % 2 ? 'Tree_1' : 'Tree_2', Math.cos(a) * r, Math.sin(a) * r, a, { solid: false, scale: 0.9 + (i % 4) * 0.12 });
  }
  for (const [x, z] of [[-27, -27], [27, 27], [-27, 27], [27, -27]]) place('StreetLight', x, z, Math.atan2(-x, -z), { pad: 0.1 });

  // ---- Mitte: Containerhalle mit begehbarem Dach, Durchgang auf Bodenhöhe ----
  place('Container_Long', 0, -3.2, 0, { pad: 0.15 });
  place('Container_Long', 0, 3.2, 0, { pad: 0.15 });
  deck(0, 0, 5.2, 7.4);
  rampUp(0, 6.5, 2, { length: 5.6 });          // von Norden hoch
  rampUp(0, -6.5, 0, { length: 5.6 });         // von Süden hoch
  for (const s of [-1, 1]) {                   // Deckung auf dem Dach
    place('SackTrench_Small', s * 1.9, 0, Math.PI / 2, { y: PLATFORM_H, solid: false });
    box3(s * 1.9 - 0.5, PLATFORM_H, -1.3, s * 1.9 + 0.5, PLATFORM_H + 1, 1.3);
  }
  place('Pipes', -6.4, -1.6, 0, { y: 2.13, pad: 0.2 });
  place('GasTank', 6.4, 1.6, 0.4);

  // ---- Zwei Seitenplattformen auf den Kontrollpunkten ----
  for (const [cx, cz, dir] of [[20, -20, 1], [-20, 20, 3]]) {
    const sx = Math.sign(cx), sz = Math.sign(cz);
    place('Container_Long', cx, cz - 2.4, 0, { pad: 0.15 });
    place('Container_Long', cx, cz + 2.4, 0, { pad: 0.15 });
    deck(cx, cz, 5.2, 6.0);
    rampUp(cx - sx * 5.4, cz, dir, { length: 5.6, width: 2.4 });
    place('SackTrench_Small', cx, cz + sz * 2.2, sz > 0 ? 0 : Math.PI, { y: PLATFORM_H, solid: false });
    box3(cx - 1.3, PLATFORM_H, cz + sz * 2.2 - 0.5, cx + 1.3, PLATFORM_H + 1, cz + sz * 2.2 + 0.5);
    place('Crate', cx + sx * 4.2, cz - sz * 4.2, 0.3);
  }

  // ---- Landmarken in den beiden freien Ecken ----
  place('Structure_2', 21, 19, Math.PI, { pad: 0.4 });
  place('Structure_4', -21, -19, 0, { pad: 0.4 });

  // ---- Gassen und Deckung ----
  place('Container_Long', -12, -1.5, Math.PI / 2, { pad: 0.15 });
  place('Container_Long', 12, 1.5, Math.PI / 2, { pad: 0.15 });
  place('Container_Small', -7.5, -13, 0.2, { pad: 0.15 });
  place('Container_Small', 7.5, 13, 0.2, { pad: 0.15 });
  for (const [x, z, r] of [[-16, -9, 0], [16, 9, Math.PI], [-4, 17, Math.PI / 2], [4, -17, -Math.PI / 2]]) {
    place('SackTrench', x, z, r);
    place('Crate', x + Math.cos(r + 1) * 2.4, z + Math.sin(r + 1) * 2.4, r * 0.5);
  }
  for (const [x, z] of [[-22, -6], [22, 6], [-9, 22], [9, -22]]) {
    place('BrickWall_2', x, z, Math.abs(x) > Math.abs(z) ? Math.PI / 2 : 0);
    place('ExplodingBarrel', x + 1.6, z + 1.4, 0);
  }
  place('CardboardBoxes_2', -14, 14, -0.4); place('Crate', -12.6, 15.4, 0.2);
  place('CardboardBoxes_2', 14, -14, -0.4); place('Crate', 12.6, -15.4, 0.2);
  place('Barrier_Large', 0, 20, 0); place('Barrier_Large', 0, -20, 0);
  place('Barrier_Single', -24, 14, Math.PI / 2); place('Barrier_Single', 24, -14, Math.PI / 2);
  place('Debris_BrokenCar', 12, -25, 1.9);
  place('Tank', -12, 25, 0.4);
  place('Debris_Tires', 23, 23, 0.3); place('Debris_Tires', -23, -23, 1.1);
  place('Pallet', -18, 24, 0.3, { solid: false }); place('Pallet', 18, -24, 0.3, { solid: false });
  for (const [x, z] of [[6, -12], [-6, 12], [15, 0], [-15, 0]]) place('TrafficCone', x, z, 0, { solid: false });
  // Deckung entlang der Diagonalen zwischen Mitte und Seitenplattformen
  for (const [x, z, r] of [[-11, 11, 0.6], [11, -11, 0.6], [-14, 4, 1.4], [14, -4, 1.4]]) {
    place('SackTrench_Small', x, z, r);
    place('Debris_Tires', x + 2.6, z + 1.2, r);
  }
  place('Container_Small', -18, -12, 0.6, { pad: 0.15 });
  place('Container_Small', 18, 12, 0.6, { pad: 0.15 });
  place('Crate', -16.4, -9.4, 0.2); place('Crate', 16.4, 9.4, 0.2);

  // ---- Gedeckte Flankengänge an Ost- und Westkante, mit begehbarem Dach ----
  for (const side of [1, -1]) {
    const cx = side * 24;
    for (const z of [-6.6, -2.2, 2.2, 6.6]) {
      place('Container_Long', cx - 2.3, z, Math.PI / 2, { pad: 0.15 });
      place('Container_Long', cx + 2.3, z, Math.PI / 2, { pad: 0.15 });
    }
    deck(cx, 0, 4.6, 17.6);
    rampUp(cx, side > 0 ? -12.2 : 12.2, side > 0 ? 0 : 2, { length: 5.2, width: 2.4 });
    place('SackTrench_Small', cx, side * 6.5, side > 0 ? 0 : Math.PI, { y: PLATFORM_H, solid: false });
    box3(cx - 1.3, PLATFORM_H, side * 6.5 - 0.5, cx + 1.3, PLATFORM_H + 1, side * 6.5 + 0.5);
    place('ExplodingBarrel', cx - 1.4, -side * 7.6, 0);
  }

  // ---- Aussichtsturm: gestapelte Container, höchster Punkt der Arena.
  // Eine lange Rampe hinauf – wer oben steht, sieht über die halbe Arena,
  // braucht aber Zeit für den Auf- und Abstieg.
  for (const [tx, tz, dir] of [[-8, -22, 3], [8, 22, 1]]) {
    const sx = dir === 3 ? 1 : -1;
    for (const y of [0, 2.1]) {
      place('Container_Long', tx, tz - 1.15, 0, { y, pad: 0.12 });
      place('Container_Long', tx, tz + 1.15, 0, { y, pad: 0.12 });
    }
    deck(tx, tz, 4.8, 4.8, 4.4);
    rampUp(tx + sx * 7.15, tz, dir, { length: 9.5, width: 2.4, height: 4.4, steps: 11 });
    place('SackTrench_Small', tx, tz - Math.sign(tz) * 1.9, tz > 0 ? 0 : Math.PI, { y: 4.4, solid: false });
    box3(tx - 1.3, 4.4, tz - Math.sign(tz) * 1.9 - 0.5, tx + 1.3, 5.4, tz - Math.sign(tz) * 1.9 + 0.5);
  }

  // ---- Deckung im Erdgeschoss der Mittelhalle ----
  place('CardboardBoxes_2', -1.7, -2.6, 0.3); place('CardboardBoxes_2', 1.7, 2.6, -0.3);
  place('Pallet', 0, -1.4, 0.2, { solid: false }); place('Pallet', 0, 1.4, -0.2, { solid: false });


  // Licht: Sonne + Himmel
  const sunDir = new THREE.Vector3(25, 40, 15);
  const sun = new THREE.DirectionalLight(0xfff2d6, REAL ? 3.0 : 2.6);
  sun.position.copy(sunDir); sun.castShadow = true;
  const sm = REAL ? QUALITY.shadowSize * 2 : QUALITY.shadowSize;
  sun.shadow.mapSize.set(sm, sm);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, far: 120 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; sun.shadow.radius = REAL ? Math.max(1, QUALITY.shadowRadius - 1) : QUALITY.shadowRadius;
  sun.shadow.camera.updateProjectionMatrix();
  group.add(sun);
  if (REAL) {
    // Umgebungslicht kommt aus dem Himmel selbst, kein künstliches Fülllicht
    buildRealSky(scene, renderer, sunDir.clone().normalize());
    scene.fog = new THREE.FogExp2(0x9fbdd4, 0.0012);
  } else {
    const rim = new THREE.DirectionalLight(0xbcd8ff, 0.8); rim.position.set(-20, 14, -25);
    group.add(rim, new THREE.HemisphereLight(0xbfe6ff, 0x6b8f3a, 1.1));
    group.add(buildSky());
    scene.fog = new THREE.Fog(0xa9d3ea, 55, 170);
  }

  scene.add(group);
  const spawns = [
    new THREE.Vector3(-25, 0, -25), new THREE.Vector3(25, 0, 25),
    new THREE.Vector3(-26, 0, 10), new THREE.Vector3(26, 0, -10),
    new THREE.Vector3(10, 0, -26), new THREE.Vector3(-10, 0, 26),
  ];
  // Kontrollpunkte für Domination. Sie liegen auf den Plattformdächern – wer sie
  // will, muss über eine Rampe hoch. Gezeichnet werden sie in domination.js.
  const punkte = [
    { id: 'A', pos: new THREE.Vector3(-20, PLATFORM_H, 20) },
    { id: 'B', pos: new THREE.Vector3(0, PLATFORM_H, 0) },
    { id: 'C', pos: new THREE.Vector3(20, PLATFORM_H, -20) },
  ];
  return { group, colliders, ramps, spawns, punkte, bounds: SIZE / 2 - 1.5 };
}

/**
 * Höhe des Bodens unter einer Position. Berücksichtigt nur Flächen, die
 * höchstens `maxY` hoch liegen – dadurch zieht ein Dach über dem Kopf nicht nach oben.
 */
export function groundHeightAt(pos, radius, world, maxY) {
  let h = 0;
  for (const m of world.colliders) {
    const box = m.userData.box;
    if (box.max.y > maxY || box.max.y <= h) continue;
    const cx = Math.max(box.min.x, Math.min(pos.x, box.max.x));
    const cz = Math.max(box.min.z, Math.min(pos.z, box.max.z));
    const dx = pos.x - cx, dz = pos.z - cz;
    if (dx * dx + dz * dz <= radius * radius) h = box.max.y;
  }
  return h;
}

/**
 * Grobe Kollision: Kapsel (Kreis auf XZ) gegen AABB-Kollider. Schiebt pos raus.
 * Quader, deren Oberkante innerhalb der Schrittweite liegt, werden übergangen –
 * man steigt auf sie. Quader über dem Kopf blockieren nicht, man läuft darunter durch.
 */
export function resolveCollisions(pos, radius, world, { stepUp = STEP_UP, height = 1.8 } = {}) {
  const b = world.bounds;
  pos.x = Math.min(b, Math.max(-b, pos.x));
  pos.z = Math.min(b, Math.max(-b, pos.z));
  for (const m of world.colliders) {
    const box = m.userData.box;
    if (box.max.y <= pos.y + stepUp) continue;      // begehbar oder unter den Füßen
    if (box.min.y >= pos.y + height) continue;      // über dem Kopf
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
