import * as THREE from 'three';
import { celRamp, buildSky, buildRealSky, himmelAusHdri, OHNE_UMRISS } from './render.js';
import { REAL } from './style.js';
import { QUALITY } from './device.js';
import { realisticMaterial, uvSurface, setImage } from './surface.js';
import { spawnProp } from './assets.js';
import { Leben } from './leben.js';

const RAMP = celRamp(4);
/** Props, die aus Blattkärtchen bestehen – siehe `place()`. */
const LAUB = /Tree|Bush|Grass|Fern|Vine/;
const SIZE = 60;                 // Kantenlänge der Arena
export const STEP_UP = 0.55;     // maximale Stufenhöhe, die Figuren erklimmen
const PLATFORM_H = 2.4;          // Höhe der Galerien – zwei Treppenmodule à 1,2 m
const ZELLE = 2;                 // Rastermaß des Bausatzes: Wände sind 2 m breit
const WAND_H = 3.12;             // Höhe eines Wandstücks, also eines Stockwerks

/** Baumaterial im jeweiligen Stil: Toon-Rampe oder physikalisch mit Struktur. */
const build = (color, name, set = 'rust_coarse_01') => REAL
  ? realisticMaterial(new THREE.MeshStandardMaterial({ color, name }), { set, scale: 0.35 })
  : new THREE.MeshToonMaterial({ color, gradientMap: RAMP });

/**
 * Props, die die Arena braucht – main.js lädt sie vor dem Aufbau.
 *
 * Alles mit `dorf:` davor kommt aus einem Bausatz: eine GLB, in der jedes Teil
 * als benannter Knoten liegt (tools/kit-packen.mjs). Die Bäume stehen nur außen
 * am Horizont und bleiben aus dem alten Toon-Kit.
 */
export const WORLD_PROPS = [
  // Wände: Putz für Wohnhäuser, Bruchstein für Mauern und Scheunen
  'dorf:Wall_Plaster_Straight', 'dorf:Wall_Plaster_Window_Wide_Round',
  'dorf:Wall_Plaster_Door_Round', 'dorf:Wall_Plaster_WoodGrid',
  'dorf:Wall_UnevenBrick_Straight', 'dorf:Wall_UnevenBrick_Window_Wide_Round',
  'dorf:Wall_UnevenBrick_Door_Round', 'dorf:Wall_Arch',
  'dorf:Corner_Exterior_Brick', 'dorf:Corner_Exterior_Wood',
  // Böden, Dächer, Aufstiege
  'dorf:Floor_WoodDark', 'dorf:Floor_Brick', 'dorf:Floor_UnevenBrick',
  'dorf:Roof_RoundTiles_6x8', 'dorf:Roof_RoundTiles_6x6', 'dorf:Roof_RoundTiles_6x4',
  'dorf:Roof_RoundTiles_4x6', 'dorf:Roof_Tower_RoundTiles',
  'dorf:Stairs_Exterior_Straight', 'dorf:Stairs_Exterior_Platform',
  'dorf:Balcony_Simple_Straight', 'dorf:Balcony_Simple_Corner',
  // Ausstattung
  'dorf:Prop_Wagon', 'dorf:Prop_Crate', 'dorf:Prop_Chimney', 'dorf:Prop_Support',
  'dorf:Prop_WoodenFence_Single', 'dorf:Prop_WoodenFence_Extension1',
  'dorf:Prop_MetalFence_Simple', 'dorf:Prop_Vine1', 'dorf:Prop_Vine2', 'dorf:Prop_Vine5',
  'dorf:Prop_Brick1',
  // Natur aus dem „Stylized Nature MegaKit" (CC0), eigener Bausatz
  'natur:CommonTree_3', 'natur:Pine_4', 'natur:TwistedTree_2',
  'natur:Bush_Common', 'natur:Bush_Common_Flowers', 'natur:Grass_Common_Tall',
  'natur:Fern_1', 'natur:Rock_Medium_1', 'natur:Pebble_Round_4',
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

  // Erdwege zwischen den drei Punkten und zu den Toren
  x.lineCap = 'round'; x.strokeStyle = asphaltPat || '#8a7454'; x.lineWidth = m(5.5);
  const path = (pts) => { x.beginPath(); x.moveTo(px(pts[0][0]), px(pts[0][1])); for (const p of pts.slice(1)) x.lineTo(px(p[0]), px(p[1])); x.stroke(); };
  path([[-22, 18], [-10, 7], [10, -7], [22, -18]]);
  path([[-24, -22], [-10, -6], [10, 6], [24, 22]]);
  path([[0, -28], [0, -10]]); path([[0, 28], [0, 10]]);
  x.globalAlpha = 0.45; x.strokeStyle = '#6f5c40'; x.lineWidth = m(3.0);
  path([[-22, 18], [-10, 7], [10, -7], [22, -18]]);
  x.globalAlpha = 1;

  // Marktplatz: Kopfsteinpflaster. Die Steine werden gemalt statt gekachelt –
  // eine Textur in dieser Größe zu wiederholen sähe man der Fläche sofort an.
  const pflaster = () => {
    x.fillStyle = concretePat || '#8d8a84';
    x.beginPath(); x.roundRect(px(-11), px(-11), m(22), m(22), m(1.4)); x.fill();
    x.save();
    x.beginPath(); x.roundRect(px(-11), px(-11), m(22), m(22), m(1.4)); x.clip();
    // Fugen dunkel unterlegen, Steine darüber – andersherum (helle Fugen)
    // sieht die Fläche aus wie gefliest, nicht wie gepflastert.
    x.fillStyle = '#4a453d';
    x.fillRect(px(-11), px(-11), m(22), m(22));
    const stein = m(0.34);
    const n = Math.ceil(m(22) / stein) + 1;
    for (let zy = 0; zy < n; zy++) {
      for (let zx = 0; zx < n; zx++) {
        const ox = px(-11) + zx * stein + (zy % 2) * stein / 2;
        const oy = px(-11) + zy * stein;
        const grau = 104 + ((zx * 7 + zy * 13) % 6) * 8;
        x.fillStyle = `rgb(${grau + 8},${grau + 2},${grau - 8})`;
        x.beginPath();
        x.roundRect(ox + m(0.03), oy + m(0.03), stein - m(0.06), stein - m(0.06), m(0.06));
        x.fill();
      }
    }
    x.restore();
  };
  pflaster();

  // Getretene Erde unter den Galerien und vor den Toren
  x.fillStyle = asphaltPat || '#7e6a4c';
  for (const [cx, cz] of [[-20, 20], [20, -20], [0, 27], [0, -27]]) {
    x.beginPath(); x.roundRect(px(cx - 6), px(cz - 5), m(12), m(10), m(1.2)); x.fill();
  }

  // Pfützen, Schlamm und Strohflecken
  for (let i = 0; i < 46; i++) {
    const ax = Math.random() * S, ay = Math.random() * S, r = m(1 + Math.random() * 3.5);
    const g = x.createRadialGradient(ax, ay, 0, ax, ay, r);
    const nass = Math.random() < 0.3;
    g.addColorStop(0, nass ? 'rgba(52,48,40,0.5)' : 'rgba(150,126,78,0.45)');
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
    // 320 m Boden, Kachel rund 4 m: näher betrachtet sieht man Gras und Steine,
    // von oben eine Wiese statt einer Farbfläche.
    ? uvSurface(new THREE.MeshStandardMaterial({ name: 'Dirt', roughness: 1 }), 'dorf_wiese', { repeat: 80, makro: 0.8 })
    : new THREE.MeshToonMaterial({ map: otex, gradientMap: RAMP });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; group.add(ground);

  // Bemalter Arenaboden darüber
  const floorMat = REAL
    // Die gemalte Karte bleibt als Farbe – sie trägt Wege, Pfützen und
    // Schlammflecken, also Ortskenntnis. Darüber kommt echtes Pflaster: Relief,
    // Rauheit und zu zwei Dritteln auch seine Farbe.
    ? uvSurface(new THREE.MeshStandardMaterial({
        map: arenaFloorTexture(), name: 'Concrete', roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 }),
        'dorf_pflaster', { repeat: 30, keepMap: true, farbe: 0.65, normale: 1.1 })
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
    // Pflanzen bestehen aus Blattkärtchen, deren Form nur in der Alphastufe
    // steckt. Der Normalen-Durchgang kennt keinen Alphatest – die Kanten-
    // erkennung zöge dort Rahmen um die Rechtecke. Also außen vorbei.
    if (LAUB.test(name)) p.traverse(o => o.layers.set(OHNE_UMRISS));
    group.add(p); p.updateMatrixWorld(true);
    if (solid) {
      const box = new THREE.Box3().setFromObject(p);
      box.min.x += pad; box.min.z += pad; box.max.x -= pad; box.max.z -= pad;
      box.min.y = Math.min(box.min.y, 0);
      solidBox(box);
    }
    return p;
  };

  const holz = build(0x7a5a38, 'Wood', 'brown_planks_05');
  const holzDunkel = build(0x5b4128, 'Wood2', 'brown_planks_05');

  /**
   * Begehbare Galerie. Der Kollisionsquader sitzt nur unter der Oberkante,
   * darunter läuft man durch – so entsteht ein offener Gang unter dem Steg.
   */
  const deck = (x, z, w, d, h = PLATFORM_H) => {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, d), holz);
    slab.position.set(x, h - 0.15, z); slab.castShadow = slab.receiveShadow = true; group.add(slab);
    // Unterzug: von unten soll man Balken sehen, keine schwebende Platte
    for (const ox of [-w / 2 + 0.3, 0, w / 2 - 0.3]) {
      const balken = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, d), holzDunkel);
      balken.position.set(x + ox, h - 0.42, z); balken.castShadow = true; group.add(balken);
    }
    box3(x - w / 2, h - 0.2, z - d / 2, x + w / 2, h, z + d / 2);
    return slab;
  };

  /** Holzpfosten unter einer Galerie. */
  const pfosten = (x, z, h = PLATFORM_H) => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.22, h - 0.3, 0.22), holzDunkel);
    p.position.set(x, (h - 0.3) / 2, z); p.castShadow = true; group.add(p);
    box3(x - 0.14, 0, z - 0.14, x + 0.14, h - 0.3, z + 0.14);
  };

  /**
   * Geländer aus Bausatzteilen entlang einer Kante. `dir` ist die Richtung, in
   * die das Geländer zeigt (0 = +z), `laenge` in Metern.
   */
  const gelaender = (x, z, dir, laenge, y = PLATFORM_H) => {
    const n = Math.max(1, Math.round(laenge / ZELLE));
    for (let i = 0; i < n; i++) {
      const t = -laenge / 2 + ZELLE / 2 + i * ZELLE;
      const ry = dir * Math.PI / 2;
      const ox = Math.cos(ry) * t, oz = -Math.sin(ry) * t;
      place('dorf:Balcony_Simple_Straight', x + ox, z + oz, ry, { solid: false, y });
    }
  };

  /**
   * Unsichtbare Aufstiegshilfe: eine Reihe Quader, jeder niedriger als STEP_UP,
   * dadurch läuft man hinauf, ohne zu springen. Darüber liegt die sichtbare
   * Treppe aus dem Bausatz – die Geometrie einer Treppe selbst als Kollision zu
   * nehmen wäre zu fein, man bliebe an jeder Stufenkante hängen.
   *
   * `dir` ist die Aufstiegsrichtung in 90°-Schritten (0 = nach +z). Am Fuß und
   * am Kopf entsteht je ein Wegpunkt, damit die Bots den Aufstieg finden statt
   * gegen die Galerie zu laufen.
   */
  const rampUp = (x, z, dir, { length = 4.16, width = 2, height = PLATFORM_H, steps = 6, base = 0 } = {}) => {
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
      // Ab `base` nach oben, nicht ab dem Boden: eine Treppe, die auf einer
      // Galerie beginnt, wäre sonst ein Pfeiler bis zum Erdgeschoss und
      // versperrte den Durchgang darunter.
      box3(Math.min(a[0], b[0]), base, Math.min(a[1], b[1]), Math.max(a[0], b[0]), h, Math.max(a[1], b[1]));
    }
    const fuss = toWorld(0, -length / 2 - 1.2), kopf = toWorld(0, length / 2 + 0.8);
    ramps.push({
      bottom: new THREE.Vector3(fuss[0], base, fuss[1]),
      top: new THREE.Vector3(kopf[0], base + height, kopf[1]),
    });
  };

  /**
   * Treppe auf eine Galerie. Sichtbar zwei Treppenmodule übereinander, begehbar
   * über die unsichtbaren Stufen aus `rampUp` – die Bots brauchen außerdem die
   * Wegpunkte, die `rampUp` hinterlegt.
   *
   * Ein Modul steigt 1 m auf 2,08 m Tiefe; auf 1,2 m gestreckt ergeben zwei
   * Module genau die Galeriehöhe.
   */
  const treppe = (x, z, dir, { von = 0, bis = PLATFORM_H, kopf = null } = {}) => {
    const ry = dir * Math.PI / 2;
    const hoehe = bis - von;
    // Ein Treppenmodul steigt einen Meter auf 2,08 m Tiefe. Für größere Höhen
    // werden mehrere gestapelt und in der Höhe gestreckt; für kleine reicht
    // eins, entsprechend gestaucht.
    const stufen = Math.max(1, Math.round(hoehe / 1.2));
    const proStufe = hoehe / stufen;
    const tiefe = 2.08 * Math.max(0.6, proStufe / 1.2);
    for (let i = 0; i < stufen; i++) {
      const t = -(stufen * tiefe) / 2 + tiefe / 2 + i * tiefe;
      const ox = Math.cos(ry) * t, oz = -Math.sin(ry) * t;
      const st = place('dorf:Stairs_Exterior_Straight', x + ox, z + oz, ry + Math.PI,
        { solid: false, y: von + i * proStufe });
      st.scale.set(1, proStufe, tiefe / 2.08);
    }
    rampUp(x, z, dir, { length: stufen * tiefe, width: 2, height: hoehe, steps: Math.max(3, stufen * 3), base: von });
    // Manche Treppen enden nicht dort, wo man hinwill: die Aufgänge zu den
    // Dachterrassen steigen an der Galeriekante hoch, und erst der Schritt zur
    // Seite bringt einen aufs Dach. Ohne diesen Zielpunkt liefen die Bots oben
    // an der Treppenkante auf der Stelle.
    if (kopf) {
      const letzte = ramps[ramps.length - 1];
      letzte.top.set(kopf[0], bis, kopf[1]);
    }
  };

  /**
   * Haus aufs 2-m-Raster: Wände ringsum, Dach obendrauf, ein Quader als
   * Kollision. Innen ist es voll – Häuser sind Deckung, keine Kulisse zum
   * Betreten. Ein offenes Erdgeschoss würde die Bots nur verirren lassen.
   *
   * `nx`/`nz` sind Zellen à 2 m. Fenster und Türen werden über die Position
   * verteilt, damit nicht jede Wand gleich aussieht.
   */
  const haus = (x, z, nx, nz, { stein = false, dach = true, tuer = 0, durchgang = null, terrasse = false } = {}) => {
    const w = nx * ZELLE, d = nz * ZELLE;
    const art = stein ? 'UnevenBrick' : 'Plaster';
    const wand = `dorf:Wall_${art}_Straight`;
    const fenster = `dorf:Wall_${art}_Window_Wide_Round`;
    const tuerWand = `dorf:Wall_${art}_Door_Round`;

    let n = 0;
    /** Eine Wandreihe entlang einer Seite. `dir`: 0 = +z, 1 = +x, 2 = -z, 3 = -x. */
    const seite = (dir, anzahl, quer) => {
      for (let i = 0; i < anzahl; i++) {
        const t = -(anzahl * ZELLE) / 2 + ZELLE / 2 + i * ZELLE;
        const ry = dir * Math.PI / 2;
        // Die Position wird je Seite ausgerechnet statt gedreht: der Bausatz
        // stellt die Wand mit der Außenseite nach +z, also zeigt ry nach außen.
        const pos = [
          [x + t, z + quer], [x + quer, z - t], [x - t, z - quer], [x - quer, z + t],
        ][dir];
        // Durchgang: auf der genannten Seite bleibt die mittlere Zelle offen und
        // bekommt einen Torbogen statt einer Wand. Das ergibt eine Abkürzung
        // durch das Haus, statt immer außen herumzulaufen.
        const mitte = Math.floor(anzahl / 2);
        const istTor = durchgang !== null && (dir === durchgang || dir === (durchgang + 2) % 4) && i === mitte;
        const teil = istTor ? 'dorf:Wall_Arch' : (n === tuer ? tuerWand : (n % 3 === 1 ? fenster : wand));
        place(teil, pos[0], pos[1], ry, { solid: false });
        n++;
      }
    };
    seite(0, nx, d / 2);
    seite(1, nz, w / 2);
    seite(2, nx, d / 2);
    seite(3, nz, w / 2);

    // Ecken verdecken die Stoßkanten der Wandstücke
    for (const [ex, ez, ry] of [[-w / 2, -d / 2, 0], [w / 2, -d / 2, Math.PI / 2],
                                [w / 2, d / 2, Math.PI], [-w / 2, d / 2, -Math.PI / 2]]) {
      place(stein ? 'dorf:Corner_Exterior_Brick' : 'dorf:Corner_Exterior_Wood', x + ex, z + ez, ry, { solid: false });
    }

    if (terrasse) {
      // Begehbares Flachdach: Bretterboden, Geländer ringsum, ein Kollisions-
      // quader nur unter der Oberkante – so ist es eine Ebene, keine Kiste.
      const boden = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.26, d + 0.3), holz);
      boden.position.set(x, WAND_H + 0.13, z);
      boden.castShadow = boden.receiveShadow = true; group.add(boden);
      box3(x - w / 2 - 0.15, WAND_H, z - d / 2 - 0.15, x + w / 2 + 0.15, WAND_H + 0.26, z + d / 2 + 0.15);
      const oben = WAND_H + 0.26;
      gelaender(x, z - d / 2 - 0.1, 2, w, oben); gelaender(x, z + d / 2 + 0.1, 0, w, oben);
      gelaender(x - w / 2 - 0.1, z, 3, d, oben); gelaender(x + w / 2 + 0.1, z, 1, d, oben);
    } else if (dach) {
      // Die Dächer sind auf Grundflächen in Metern zugeschnitten und stehen
      // rund anderthalb Meter über. Ein zu großes Dach auf einem kleinen Haus
      // ragt meterweit in die Gasse und nimmt die Sicht – deshalb wird nach der
      // tatsächlichen Grundfläche gewählt und notfalls um 90° gedreht.
      const zuschnitt = { '6x8': [6, 8], '6x6': [6, 6], '6x4': [6, 4], '4x6': [4, 6] };
      let teil = null, ry = 0;
      for (const [name, [rw, rd]] of Object.entries(zuschnitt)) {
        if (rw === w && rd === d) { teil = name; ry = 0; break; }
        if (rd === w && rw === d) { teil = name; ry = Math.PI / 2; break; }
      }
      // Für Häuser ohne genauen Zuschnitt (4×4) das schmalste Dach nehmen.
      if (!teil) { teil = '4x6'; ry = w > d ? Math.PI / 2 : 0; }
      place(`dorf:Roof_RoundTiles_${teil}`, x, z, ry, { solid: false, y: WAND_H });
    }
    // Ein Quader für das ganze Haus statt einer pro Wand: weniger Kollider,
    // und niemand bleibt in einer Fuge zwischen zwei Wandstücken hängen.
    // Beim Torhaus zwei Quader links und rechts der Durchfahrt, dazu einer
    // darüber – sonst liefe man durch das Obergeschoss hindurch.
    const a = [x - w / 2 - 0.15, z - d / 2 - 0.15], b = [x + w / 2 + 0.15, z + d / 2 + 0.15];
    if (durchgang === null) {
      box3(a[0], 0, a[1], b[0], WAND_H, b[1]);
    } else {
      const laengs = durchgang % 2 === 0;        // Durchfahrt in z- oder x-Richtung
      const tor = ZELLE / 2 + 0.1;               // halbe Breite der Durchfahrt
      if (laengs) {
        box3(a[0], 0, a[1], x - tor, WAND_H, b[1]);
        box3(x + tor, 0, a[1], b[0], WAND_H, b[1]);
      } else {
        box3(a[0], 0, a[1], b[0], WAND_H, z - tor);
        box3(a[0], 0, z + tor, b[0], WAND_H, b[1]);
      }
      // Decke über der Durchfahrt: Kopfhöhe 3 m, darüber ist das Haus wieder dicht
      box3(a[0], 3, a[1], b[0], WAND_H, b[1]);
    }
    return { x, z, w, d };
  };

  // ---- Dorfmauer mit zwei Toren ----
  const H = 5, T = 1;
  addBox(0, H / 2, -SIZE / 2, SIZE, H, T); addBox(0, H / 2, SIZE / 2, SIZE, H, T);
  addBox(-SIZE / 2, H / 2, 0, T, H, SIZE); addBox(SIZE / 2, H / 2, 0, T, H, SIZE);
  for (let i = 0; i < 15; i++) {
    const s = i * 4 - 28;
    const tor = Math.abs(s) < 2.5;               // Lücke für die Torbögen
    for (const [mx, mz, ry] of [[s, -SIZE / 2, 0], [s, SIZE / 2, Math.PI],
                                [-SIZE / 2, s, Math.PI / 2], [SIZE / 2, s, -Math.PI / 2]]) {
      if (tor && Math.abs(mz) === SIZE / 2) continue;
      for (const dx of [-1, 1]) {
        place('dorf:Wall_UnevenBrick_Straight', mx + (ry % Math.PI ? 0 : dx), mz + (ry % Math.PI ? dx : 0), ry, { solid: false });
      }
    }
  }
  for (const [tz, ry] of [[-SIZE / 2, 0], [SIZE / 2, Math.PI]]) {
    place('dorf:Wall_Arch', 0, tz, ry, { solid: false });
  }
  // Waldrand: drei Arten, unregelmäßig gesetzt und gedreht. Gleichmäßig verteilte
  // Bäume derselben Art sehen aus wie eine Plantage – die Unregelmäßigkeit macht
  // den Unterschied, nicht die Anzahl.
  // Der Blattbaum trägt Herbstlaub – jeder dritte Baum in Rot wäre ein
  // Feuerwerk. Jeder fünfte reicht als Farbtupfer.
  const baeume = ['natur:CommonTree_3', 'natur:Pine_4', 'natur:CommonTree_3',
    'natur:TwistedTree_2', 'natur:Pine_4'];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2 + Math.sin(i * 2.7) * 0.16;
    const r = 38 + (i % 3) * 5 + Math.sin(i * 1.3) * 2.5;
    const art = baeume[i % baeume.length];
    const gr = art === 'natur:TwistedTree_2' ? 0.5 : 0.85 + (i % 4) * 0.1;
    place(art, Math.cos(a) * r, Math.sin(a) * r, i * 1.7, { solid: false, scale: gr });
  }

  // ---- Marktplatz in der Mitte: offen, mit Galerie darüber (Punkt B) ----
  // Zwei Häuser rahmen den Platz, dazwischen spannt sich ein Steg. Wer den
  // Punkt hält, steht oben und ist von drei Seiten sichtbar.
  // Die beiden Häuser am Platz tragen Dachterrassen. Sie liegen 3,4 m hoch und
  // sind nur über die Galerie erreichbar – wer die Mitte hält, hält auch den
  // höchsten Punkt der Karte.
  haus(-7, 0, 3, 4, { tuer: 6, terrasse: true });
  haus(7, 0, 3, 4, { tuer: 2, terrasse: true });
  deck(0, 0, 8, 7.4);
  for (const [px, pz] of [[-3.6, -3.4], [3.6, -3.4], [-3.6, 3.4], [3.6, 3.4]]) pfosten(px, pz);
  gelaender(0, -3.7, 2, 8); gelaender(0, 3.7, 0, 8);
  treppe(0, 6.4, 2); treppe(0, -6.4, 0);
  // Kurze Aufgänge von der Galerie auf die beiden Dachterrassen. Sie steigen
  // an der Galeriekante entlang, nicht auf das Haus zu – der Hauskörper ist bis
  // 3,12 m massiv, eine Treppe hinein wäre eine Treppe in die Wand.
  treppe(-3.2, -1, 0, { von: PLATFORM_H, bis: WAND_H + 0.26, kopf: [-6, 0] });
  treppe(3.2, 1, 2, { von: PLATFORM_H, bis: WAND_H + 0.26, kopf: [6, 0] });
  place('dorf:Prop_Crate', -2.4, 0, 0.3, { y: PLATFORM_H });
  place('dorf:Prop_Crate', 2.4, 0.6, -0.2, { y: PLATFORM_H });
  place('dorf:Prop_Wagon', -4.4, -8.6, 0.4);
  place('dorf:Prop_Wagon', 4.4, 8.6, Math.PI + 0.3);

  // Marktstände: vier Pfosten, ein Tisch, darüber ein schräges Segeldach.
  // Selbst gebaut, nicht aus dem Bausatz – dessen Vordächer sind Wandteile und
  // liegen auf dem Platz wie abgestürzte Hausdächer. Der Platz war offenes
  // Schussfeld; die Stände sind Deckung, ohne die Sicht ganz zu nehmen.
  const tuch = build(0xb8443a, 'Tuch', 'brown_planks_05');
  const stand = (x, z, ry) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z); g.rotation.y = ry; group.add(g);
    for (const sx2 of [-1, 1]) for (const sz2 of [-1, 1]) {
      const pf = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.05, 0.12), holzDunkel);
      pf.position.set(sx2 * 1.05, 1.02, sz2 * 0.6); pf.castShadow = true; g.add(pf);
    }
    const tisch = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.14, 1.4), holz);
    tisch.position.y = 0.95; tisch.castShadow = tisch.receiveShadow = true; g.add(tisch);
    const dach = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.09, 1.9), tuch);
    dach.position.y = 2.16; dach.rotation.x = 0.17; dach.castShadow = true; g.add(dach);
    // Kollision nur für den Tisch: unter das Dach soll man treten können.
    // Der Quader ist achsenparallel, die Stände stehen deshalb in Vielfachen
    // von 90° – sonst deckte der Quader mehr ab als der Stand.
    const c = Math.abs(Math.cos(ry)), si = Math.abs(Math.sin(ry));
    const bw = (2.3 * c + 1.4 * si) / 2, bd = (2.3 * si + 1.4 * c) / 2;
    box3(x - bw, 0, z - bd, x + bw, 1.02, z + bd);
    // Ware davor: zwei Kisten, hoch genug, um dahinter zu verschwinden
    place('dorf:Prop_Crate', x - Math.sin(ry) * 1.5, z - Math.cos(ry) * 1.5, ry + 0.3);
    place('dorf:Prop_Crate', x - Math.sin(ry) * 1.5 + Math.cos(ry), z - Math.cos(ry) * 1.5 - Math.sin(ry), ry - 0.2);
  };
  stand(-8.5, -6.5, 0); stand(8.5, 6.5, Math.PI); stand(-2.5, 9.5, Math.PI / 2);

  // Kistenstapel als schneller Aufstieg: jede Stufe unter STEP_UP, oben endet
  // er auf Galeriehöhe. Wer die Treppe meidet, kommt hier hoch.
  const kistenTreppe = (x, z, ry) => {
    // 40 cm je Kiste, nicht 52: STEP_UP liegt bei 55 cm, aber zwischen zwei
    // Bildern fällt die Figur ein Stück, und dann fehlen die letzten Zentimeter.
    // Die Stufe muss spürbar unter der Grenze bleiben, sonst klemmt der Stapel.
    const stufen = 6, schritt = 0.8, hoch = 0.4;
    for (let i = 0; i < stufen; i++) {
      const h = i * hoch;
      const ox = Math.cos(ry) * i * schritt, oz = -Math.sin(ry) * i * schritt;
      place('dorf:Prop_Crate', x + ox, z + oz, ry + i * 0.2, { y: h, solid: false });
      box3(x + ox - 0.55, 0, z + oz - 0.55, x + ox + 0.55, h + hoch, z + oz + 0.55);
    }
    // Die oberste Kiste muss die Galerie überragen, sonst steht man davor und
    // kommt die letzten zwanzig Zentimeter nicht hoch.
    const fuss = [x - Math.cos(ry) * 1.2, z + Math.sin(ry) * 1.2];
    const kopf = [x + Math.cos(ry) * (stufen * schritt), z - Math.sin(ry) * (stufen * schritt)];
    ramps.push({
      bottom: new THREE.Vector3(fuss[0], 0, fuss[1]),
      top: new THREE.Vector3(kopf[0], PLATFORM_H, kopf[1]),
    });
  };
  // Enden jeweils an der Kante der Marktgalerie (z = ∓3,7)
  kistenTreppe(-3, -7.2, -Math.PI / 2); kistenTreppe(3, 7.2, Math.PI / 2);

  // ---- Zwei Höfe mit Galerie (Punkte A und C) ----
  // Die Häuser stehen hinter der Galerie, zur Ecke hin. Die Treppe muss nach
  // innen zeigen: nach außen läge ihr Fuß jenseits der Spielfeldgrenze, und
  // Bots liefen endlos gegen die Mauer, weil ihr Wegpunkt unerreichbar ist.
  for (const [cx, cz] of [[-20, 20], [20, -20]]) {
    const sx = Math.sign(cx), sz = Math.sign(cz);
    const auf = sx > 0 ? 1 : 3;                  // Aufstiegsrichtung: zur Ecke hin
    // Bündig an die Spielfeldgrenze: bliebe ein halber Meter Luft, würden sich
    // Bots in der Ritze zwischen Hauswand und Mauer festfahren.
    haus(cx + sx * 6.5, cz, 2, 3, { stein: true });
    haus(cx, cz + sz * 6.5, 3, 2, { tuer: 1 });
    deck(cx, cz, 7, 6);
    for (const [px, pz] of [[-3, -2.6], [3, -2.6], [-3, 2.6], [3, 2.6]]) pfosten(cx + px, cz + pz);
    gelaender(cx, cz - 3, 2, 7); gelaender(cx, cz + 3, 0, 7);
    treppe(cx - sx * 5.6, cz, auf);
    place('dorf:Prop_Crate', cx + sx * 2.6, cz + sz * 1.8, 0.2, { y: PLATFORM_H });
    place('dorf:Prop_Crate', cx - sx * 3.6, cz - sz * 4.4, 0.4);
    place('dorf:Prop_Vine1', cx + sx * 4.4, cz + 2.2, sx > 0 ? Math.PI : 0, { solid: false, y: 0.4 });
  }

  // ---- Wohnhäuser, die die Gassen bilden ----
  haus(-18, -4, 3, 3, { durchgang: 1 });      // Torhaus: Abkürzung nach Osten
  haus(18, 4, 3, 3, { tuer: 4, durchgang: 1 });
  haus(-6, -18, 3, 2, { stein: true, tuer: 3 });
  haus(6, 18, 3, 2, { stein: true });
  haus(-22, -18, 2, 2);
  haus(22, 18, 2, 2, { tuer: 1 });
  haus(16, -8, 2, 3, { stein: true });
  haus(-16, 8, 2, 3, { stein: true, tuer: 2 });

  // Der Turm als Landmarke – von außen sieht man, wo Norden ist
  for (const [tx, tz] of [[-26.5, 3], [26.5, -3]]) {
    haus(tx, tz, 2, 2, { stein: true, dach: false });
    place('dorf:Roof_Tower_RoundTiles', tx, tz, 0, { solid: false, y: WAND_H });
  }

  // ---- Schornsteine, Zäune, Kisten ----
  const schlote = [];
  for (const [x, z] of [[-9.4, -2.4], [9.4, 2.4], [-18, -5.4], [18, 5.4], [-6, -18], [6, 18]]) {
    place('dorf:Prop_Chimney', x, z, 0, { solid: false, y: WAND_H - 0.4 });
    schlote.push(new THREE.Vector3(x, WAND_H + 2.7, z));
  }
  for (const [x, z, ry] of [[-12, 12, 0], [12, -12, 0], [-13.6, 10.2, Math.PI / 2], [13.6, -10.2, Math.PI / 2]]) {
    for (let i = -1; i <= 1; i++) {
      const ox = Math.cos(ry) * i * 2, oz = -Math.sin(ry) * i * 2;
      place(i ? 'dorf:Prop_WoodenFence_Extension1' : 'dorf:Prop_WoodenFence_Single', x + ox, z + oz, ry, { solid: false });
    }
    box3(x - (ry ? 0.3 : 3), 0, z - (ry ? 3 : 0.3), x + (ry ? 0.3 : 3), 0.85, z + (ry ? 3 : 0.3));
  }
  for (const [x, z, r] of [[-11, -9, 0.3], [11, 9, -0.4], [-3, 13, 0.8], [3, -13, 1.2],
                           [-23, 12, 0.2], [23, -12, 0.6], [9, -22, 0.9], [-9, 22, 0.1]]) {
    place('dorf:Prop_Crate', x, z, r);
    place('dorf:Prop_Crate', x + Math.cos(r) * 1.2, z + Math.sin(r) * 1.2, r + 0.6);
    place('dorf:Prop_Brick1', x + 1.8, z - 1.1, r, { solid: false });
  }
  // Grün im Dorf: Büsche an Hausecken, Gras in den Gassen, Kiesel am Weg.
  // Nichts davon ist solide – man soll hindurchlaufen, nicht daran hängen.
  // Paarweise gespiegelt: die Karte ist punktsymmetrisch, und was auf der einen
  // Seite Deckung oder Sichtschutz ist, muss es auf der anderen auch sein.
  // Der rote Busch (Herbstlaub) steht nur draußen am Rand.
  for (const [x, z, art, gr] of [
    [-15.5, -7.5, 'natur:Bush_Common_Flowers', 0.9], [15.5, 7.5, 'natur:Bush_Common_Flowers', 0.9],
    [-11, 3, 'natur:Bush_Common_Flowers', 0.8], [11, -3, 'natur:Bush_Common_Flowers', 0.8],
    [-24, -14, 'natur:Bush_Common', 1.0], [24, 14, 'natur:Bush_Common', 1.0],
    [-21, 8, 'natur:Fern_1', 0.8], [21, -8, 'natur:Fern_1', 0.8],
    [-5, 21, 'natur:Bush_Common_Flowers', 0.9], [5, -21, 'natur:Bush_Common_Flowers', 0.9],
  ]) place(art, x, z, x * 0.7, { solid: false, scale: gr });

  for (let i = 0; i < 16; i++) {
    const a = i * 2.39, r = 9 + (i % 7) * 2.6;                 // goldener Winkel, streut gleichmäßig
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(x) < 11 && Math.abs(z) < 11) continue;        // nicht auf dem Pflaster
    place('natur:Grass_Common_Tall', x, z, a, { solid: false, scale: 0.6 + (i % 3) * 0.2 });
  }
  for (const [x, z] of [[-13, -20], [13, 20], [-26, -8], [26, 8], [-8, 26], [8, -26]]) {
    place('natur:Pebble_Round_4', x, z, x, { solid: false, scale: 1.2 });
  }
  for (const [x, z] of [[-27, -24], [27, 24]]) {
    place('natur:Rock_Medium_1', x, z, x, { solid: false, scale: 0.7 });
    box3(x - 1, 0, z - 1, x + 1, 1.4, z + 1);
  }

  // Weinranken an mehr Wänden – zwölf gleich aussehende Häuser fallen sonst auf
  for (const [x, z, ry, art] of [
    [-15, -1.2, Math.PI / 2, 'dorf:Prop_Vine2'], [15, 1.2, -Math.PI / 2, 'dorf:Prop_Vine5'],
    [-4.2, 18, Math.PI, 'dorf:Prop_Vine5'], [4.2, -18, 0, 'dorf:Prop_Vine2'],
  ]) place(art, x, z, ry, { solid: false, y: WAND_H - 0.2 });

  // Gitterzäune trennen zwei Hinterhöfe ab, ohne die Sicht zu nehmen
  for (const [x, z, ry] of [[-14, -14, 0], [14, 14, 0]]) {
    for (let i = -1; i <= 1; i++) place('dorf:Prop_MetalFence_Simple', x + i * 2, z, ry, { solid: false });
    box3(x - 3, 0, z - 0.2, x + 3, 2.87, z + 0.2);
  }



  // Licht: Sonne + Himmel
  // Nachmittagssonne: tiefer und wärmer als Mittagslicht. Lange Schatten geben
  // den Gassen Tiefe, und die Ziegeldächer bekommen Farbe statt Grelle.
  // Im realen Stil bestimmt die HDRI, wo die Sonne steht – sonst stünde der
  // Schatten woanders als der helle Fleck am Himmel, und genau das verrät ein
  // gerechnetes Bild sofort.
  const hdri = REAL ? himmelAusHdri(scene, renderer) : null;
  const sunDir = hdri ? hdri.dir.clone().multiplyScalar(60) : new THREE.Vector3(26, 24, 16);
  const sun = new THREE.DirectionalLight(0xfff1d8, REAL ? 6.0 : 2.7);
  sun.position.copy(sunDir); sun.castShadow = true;
  const sm = REAL ? QUALITY.shadowSize * 2 : QUALITY.shadowSize;
  sun.shadow.mapSize.set(sm, sm);
  // Der Ausschnitt ist so eng wie möglich um das Spielfeld gelegt: je kleiner
  // die Fläche, desto mehr Bildpunkte je Meter. Bei 4096 auf 68 m sind das
  // 1,7 cm – damit bekommt ein Geländerpfosten einen eigenen Schatten.
  // Kaskaden (CSM) bräuchte es erst für größere Karten; hier würden sie nur
  // jedes Material im Spiel umschreiben.
  const rand = REAL ? 34 : 40;
  Object.assign(sun.shadow.camera, { left: -rand, right: rand, top: rand, bottom: -rand, far: 160 });
  sun.shadow.bias = -0.00015; sun.shadow.normalBias = 0.015;
  sun.shadow.radius = REAL ? 1 : QUALITY.shadowRadius;
  sun.shadow.camera.updateProjectionMatrix();
  group.add(sun);
  if (REAL) {
    // Umgebungslicht kommt aus dem Himmel selbst, kein künstliches Fülllicht.
    // Ohne HDRI (offline, erster Start) bleibt der gerechnete Himmel.
    if (!hdri) buildRealSky(scene, renderer, sunDir.clone().normalize());
    scene.fog = new THREE.FogExp2(0x9fbdd4, 0.0012);
  } else {
    const rim = new THREE.DirectionalLight(0xbcd8ff, 0.8); rim.position.set(-20, 14, -25);
    group.add(rim, new THREE.HemisphereLight(0xbfe6ff, 0x6b8f3a, 1.1));
    group.add(buildSky());
    scene.fog = new THREE.Fog(0xc3d6e0, 60, 180);
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
  const leben = new Leben(group, schlote, punkte);
  return { group, colliders, ramps, spawns, punkte, leben, bounds: SIZE / 2 - 1.5 };
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
