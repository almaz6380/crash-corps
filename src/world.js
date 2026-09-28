import * as THREE from 'three';
import { celRamp, buildSky, buildRealSky, himmelAusHdri, OHNE_UMRISS } from './render.js';
import { REAL } from './style.js';
import { QUALITY } from './device.js';
import { realisticMaterial, uvSurface, setImage } from './surface.js';
import { spawnProp } from './assets.js';
import { Leben } from './leben.js';
import { WELT, hoeheBei, neigungBei, bodenGeometrie, bauhoehe, imHohlweg, NEIGUNG_MAX } from './terrain.js';

const RAMP = celRamp(4);
/**
 * Alles in diesem Modul rechnet in Höhen **über Gelände**. Die Hilfsfunktionen
 * (`place`, `haus`, `deck`, `treppe` …) schlagen die Geländehöhe selbst drauf.
 * Ein Bauteil mit `y: 2.4` liegt also 2,4 m über dem Boden an seiner Stelle,
 * nicht 2,4 m über dem Meeresspiegel – sonst müsste jede Zeile des Stadtplans
 * die Landschaft kennen.
 */
/** Props, die aus Blattkärtchen bestehen – siehe `place()`. */
const LAUB = /Tree|Bush|Grass|Fern|Vine/;
const SIZE = WELT;               // Kantenlänge der Welt (terrain.js)
// Die gepflasterte Talstadt: dreimal so lang wie breit, weil das Tal zwischen
// den beiden Böschungen liegt und nur in x Platz hat.
const TAL_X = 150, TAL_Z = 54;
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
/**
 * Der gemalte Boden der Talstadt. Er trägt Wege, Pfützen und Pflaster – also
 * Ortskenntnis: wer die Karte kennt, erkennt an der Straße, wo er steht.
 *
 * Rechteckig, nicht quadratisch: das Tal ist dreimal so lang wie breit, und
 * eine quadratische Leinwand darüber zu spannen zöge jeden Stein in die Länge.
 */
function talBoden(w, d) {
  const S = 2048, c = document.createElement('canvas');
  c.width = S; c.height = Math.round((S * d) / w);
  const x = c.getContext('2d');
  const px = (v) => ((v + w / 2) / w) * S;            // Weltkoordinate x → Pixel
  const pz = (v) => ((v + d / 2) / d) * c.height;     // Weltkoordinate z → Pixel
  const m = (v) => (v / w) * S;                       // Länge → Pixel

  // Im realistischen Stil wird der Boden mit den echten Texturen gemalt, sonst
  // prozedural. So passt die Talfläche zu den texturierten Props.
  const pattern = (img, meters) => {
    if (!img) return null;
    const pat = x.createPattern(img, 'repeat');
    const f = (meters / w) * S / img.width;
    pat.setTransform(new DOMMatrix([f, 0, 0, f, 0, 0]));
    return pat;
  };
  const grassPat = pattern(setImage('leafy_grass'), 3.2);
  const asphaltPat = pattern(setImage('asphalt_03'), 3.6);
  const concretePat = pattern(setImage('concrete_floor_02'), 3.0);

  if (grassPat) { x.fillStyle = grassPat; x.fillRect(0, 0, S, c.height); }
  else {
    x.fillStyle = '#82a95a'; x.fillRect(0, 0, S, c.height);
    for (let i = 0; i < 9000; i++) {
      x.fillStyle = ['#7ba054', '#8fb264', '#6e9149', '#97b972'][i % 4];
      x.fillRect(Math.random() * S, Math.random() * c.height, 4 + Math.random() * 12, 3 + Math.random() * 5);
    }
  }

  // Marktstraße von Tor zu Tor, die beiden Gassen und die Zufahrten zu den
  // Aufstiegen. Das ist derselbe Plan, nach dem die Häuser stehen.
  x.lineCap = 'round'; x.strokeStyle = asphaltPat || '#8a7454';
  const weg = (pts, breite) => {
    x.lineWidth = m(breite);
    x.beginPath(); x.moveTo(px(pts[0][0]), pz(pts[0][1]));
    for (const q of pts.slice(1)) x.lineTo(px(q[0]), pz(q[1]));
    x.stroke();
  };
  weg([[-w / 2, 0], [-14, 0], [14, 0], [w / 2, 0]], 7);
  for (const s of [1, -1]) {
    weg([[-w / 2 + 4, s * 15], [w / 2 - 4, s * 15]], 6);
    weg([[0, s * 8], [0, s * (d / 2)]], 6);
    for (const gx of [-34, 34]) weg([[gx, s * 15], [gx, s * (d / 2)]], 7);
    for (const hx of [-44, 44]) weg([[hx, 0], [hx, s * 8]], 5);
  }
  x.globalAlpha = 0.4; x.strokeStyle = '#6f5c40';
  weg([[-w / 2, 0], [w / 2, 0]], 3.4);
  x.globalAlpha = 1;

  // Marktplatz: Kopfsteinpflaster. Die Steine werden gemalt statt gekachelt –
  // eine Textur in dieser Größe zu wiederholen sähe man der Fläche sofort an.
  const pflaster = (cx, cz, pw, pd) => {
    const rund = m(1.4);
    x.fillStyle = concretePat || '#8d8a84';
    x.beginPath(); x.roundRect(px(cx - pw / 2), pz(cz - pd / 2), m(pw), m(pd), rund); x.fill();
    x.save();
    x.beginPath(); x.roundRect(px(cx - pw / 2), pz(cz - pd / 2), m(pw), m(pd), rund); x.clip();
    // Fugen dunkel unterlegen, Steine darüber – andersherum (helle Fugen)
    // sieht die Fläche aus wie gefliest, nicht wie gepflastert.
    x.fillStyle = '#4a453d';
    x.fillRect(px(cx - pw / 2), pz(cz - pd / 2), m(pw), m(pd));
    const stein = m(0.34);
    const nx = Math.ceil(m(pw) / stein) + 1, nz = Math.ceil(m(pd) / stein) + 1;
    for (let zy = 0; zy < nz; zy++) {
      for (let zx = 0; zx < nx; zx++) {
        const ox = px(cx - pw / 2) + zx * stein + (zy % 2) * stein / 2;
        const oy = pz(cz - pd / 2) + zy * stein;
        const grau = 104 + ((zx * 7 + zy * 13) % 6) * 8;
        x.fillStyle = `rgb(${grau + 8},${grau + 2},${grau - 8})`;
        x.beginPath();
        x.roundRect(ox + m(0.03), oy + m(0.03), stein - m(0.06), stein - m(0.06), m(0.06));
        x.fill();
      }
    }
    x.restore();
  };
  pflaster(0, 0, 26, 26);
  for (const hx of [-44, 44]) pflaster(hx, 0, 14, 12);

  // Getretene Erde vor den Toren und an den Aufstiegen
  x.fillStyle = asphaltPat || '#7e6a4c';
  for (const [cx, cz] of [[-w / 2 + 5, 0], [w / 2 - 5, 0],
    [0, 22], [0, -22], [-34, 22], [34, 22], [-34, -22], [34, -22]]) {
    x.beginPath(); x.roundRect(px(cx - 6), pz(cz - 5), m(12), m(10), m(1.2)); x.fill();
  }

  // Pfützen, Schlamm und Strohflecken
  for (let i = 0; i < 90; i++) {
    const ax = Math.random() * S, ay = Math.random() * c.height, r = m(1 + Math.random() * 3.5);
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
 * Der Boden einer Terrasse. Kein Marktplan, sondern das, was oben wirklich
 * liegt: Wiese, getretene Wege zwischen den Höfen und Pflaster um sie herum.
 *
 * Gemalt wird **je Seite**, mit gespiegeltem z – dieselbe Leinwand auf beiden
 * Terrassen zu benutzen hieße, die Wege der einen Seite an der anderen
 * verkehrt herum aufzumalen.
 */
function terrassenBoden(w, d, s) {
  const S = 2048, c = document.createElement('canvas');
  c.width = S; c.height = Math.round((S * d) / w);
  const x = c.getContext('2d');
  const px = (v) => ((v + w / 2) / w) * S;
  const pz = (v) => ((s * v + d / 2) / d) * c.height;
  const m = (v) => (v / w) * S;

  const pattern = (img, meters) => {
    if (!img) return null;
    const pat = x.createPattern(img, 'repeat');
    const f = (meters / w) * S / img.width;
    pat.setTransform(new DOMMatrix([f, 0, 0, f, 0, 0]));
    return pat;
  };
  const grassPat = pattern(setImage('leafy_grass'), 3.2);
  const erdePat = pattern(setImage('asphalt_03'), 3.6);
  const steinPat = pattern(setImage('concrete_floor_02'), 3.0);
  if (grassPat) { x.fillStyle = grassPat; x.fillRect(0, 0, S, c.height); }
  else {
    x.fillStyle = '#82a95a'; x.fillRect(0, 0, S, c.height);
    for (let i = 0; i < 6000; i++) {
      x.fillStyle = ['#7ba054', '#8fb264', '#6e9149', '#97b972'][i % 4];
      x.fillRect(Math.random() * S, Math.random() * c.height, 4 + Math.random() * 12, 3 + Math.random() * 5);
    }
  }
  x.lineCap = 'round'; x.strokeStyle = erdePat || '#8a7454';
  const weg = (pts, breite) => {
    x.lineWidth = m(breite);
    x.beginPath(); x.moveTo(px(pts[0][0]), pz(pts[0][1]));
    for (const q of pts.slice(1)) x.lineTo(px(q[0]), pz(q[1]));
    x.stroke();
  };
  // Die Gasse längs, die Zufahrten von den drei Aufstiegen, die Wege zu den Höfen
  weg([[-w / 2, 3], [w / 2, 3]], 6);
  for (const ax of [0, -34, 34]) weg([[ax, -15], [ax, 3]], 6);
  for (const hx of [-30, 30]) weg([[hx, -6], [hx, 3]], 5);
  const platz = (cx, cz, pw, pd) => {
    x.fillStyle = steinPat || '#8d8a84';
    x.beginPath(); x.roundRect(px(cx - pw / 2), pz(cz + s * pd / 2), m(pw), m(pd), m(1.2)); x.fill();
  };
  for (const hx of [-30, 30]) platz(hx, -6, 18, 16);
  for (let i = 0; i < 60; i++) {
    const ax = Math.random() * S, ay = Math.random() * c.height, r = m(1 + Math.random() * 3);
    const g = x.createRadialGradient(ax, ay, 0, ax, ay, r);
    g.addColorStop(0, Math.random() < 0.3 ? 'rgba(52,48,40,0.45)' : 'rgba(150,126,78,0.4)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.beginPath(); x.arc(ax, ay, r, 0, 7); x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

/**
 * Maske für die Ränder eines Wegstreifens: in der Mitte deckend, zu allen
 * Seiten durchsichtig. Ohne sie endet ein gepflasterter Weg mitten in der
 * Wiese an einer geraden Kante, und man sieht die Platte statt der Straße.
 */
function kantenMaske() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const quer = g.createLinearGradient(0, 0, 64, 0);
  for (const [t, f] of [[0, '#000'], [0.22, '#fff'], [0.78, '#fff'], [1, '#000']]) quer.addColorStop(t, f);
  g.fillStyle = quer; g.fillRect(0, 0, 64, 64);
  const laengs = g.createLinearGradient(0, 0, 0, 64);
  for (const [t, f] of [[0, '#000'], [0.12, '#fff'], [0.88, '#fff'], [1, '#000']]) laengs.addColorStop(t, f);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = laengs; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/**
 * Baut die Arena. Zwei Ebenen: Boden und begehbare Containerdächer, verbunden
 * über Rampen. Gibt {group, colliders, spawns, zonen} zurück.
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
  // Das Gelände selbst: ein Gitter, dessen Punkte auf Höhe gezogen sind.
  // Es ist zugleich das, was `groundHeightAt()` unter den Füßen findet – Bild und
  // Kollision fragen dieselbe Funktion, sonst läuft man neben dem sichtbaren
  // Boden.
  const ground = new THREE.Mesh(bodenGeometrie(), groundMat);
  ground.receiveShadow = true; group.add(ground);

  // Bemalter Arenaboden darüber
  const gemalt = talBoden(TAL_X, TAL_Z);
  const floorMat = REAL
    // Die gemalte Karte bleibt als Farbe – sie trägt Wege, Pfützen und
    // Schlammflecken, also Ortskenntnis. Darüber kommt echtes Pflaster: Relief,
    // Rauheit und zu zwei Dritteln auch seine Farbe.
    ? uvSurface(new THREE.MeshStandardMaterial({
        map: gemalt, name: 'Concrete', roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 }),
        'dorf_pflaster', { repeat: 56, keepMap: true, farbe: 0.65, normale: 1.1 })
    : new THREE.MeshToonMaterial({ map: gemalt, gradientMap: RAMP, polygonOffset: true, polygonOffsetFactor: -1 });
  /**
   * Eine bemalte Fläche, die dem Gelände folgt. Eine ebene Platte stünde am
   * Hang halb in der Luft; zwei Zentimeter über dem Boden, damit sich die
   * beiden Flächen nicht ins Gehege kommen.
   */
  const flaeche = (cx, cz, w, d, mat) => {
    const g = new THREE.PlaneGeometry(w, d, Math.round(w / 2), Math.round(d / 2));
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) pos.setY(k, hoeheBei(pos.getX(k) + cx, pos.getZ(k) + cz) + 0.02);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, mat);
    mesh.position.set(cx, 0, cz);
    mesh.receiveShadow = true; group.add(mesh);
    return mesh;
  };
  flaeche(0, 0, TAL_X, TAL_Z, floorMat);
  // Die Terrassen bekommen dieselbe Behandlung, nur ohne gemalten Plan: dort
  // gibt es keine Marktstraße, nur festgetretenen Boden zwischen den Häusern.
  for (const s of [1, -1]) {
    const tex = terrassenBoden(146, 32, s);
    flaeche(0, s * 66, 146, 32, REAL
      ? uvSurface(new THREE.MeshStandardMaterial({
          map: tex, name: 'Concrete', roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 }),
          'dorf_pflaster', { repeat: 54, keepMap: true, farbe: 0.6, normale: 1.1 })
      : new THREE.MeshToonMaterial({ map: tex, gradientMap: RAMP, polygonOffset: true, polygonOffsetFactor: -1 }));
  }
  // Die Aufstiege bekommen einen eigenen Belag, mit weichen Rändern statt einer
  // geraden Kante im Gras.
  const maske = kantenMaske();
  const wegMat = (name, set, farbe) => {
    const mat = REAL
      ? uvSurface(new THREE.MeshStandardMaterial({ name: 'Concrete', roughness: 1 }), set, { repeat: 8, farbe: 1, normale: 1.1, makro: 0.6 })
      : new THREE.MeshToonMaterial({ color: farbe, gradientMap: RAMP });
    mat.alphaMap = maske; mat.transparent = true; mat.depthWrite = false;
    mat.polygonOffset = true; mat.polygonOffsetFactor = -2;
    mat.name = name;
    return mat;
  };
  const pflasterWeg = wegMat('WegStein', 'dorf_pflaster', 0xa09786);
  const erdWeg = wegMat('WegErde', 'dorf_wiese', 0x8d7a56);
  for (const s of [1, -1]) {
    flaeche(0, s * 39, 9, 26, pflasterWeg);
    for (const wx of [-34, 34]) flaeche(wx, s * 39, 11, 28, erdWeg);
    for (const wx of [-72, 72]) flaeche(wx, s * 94, 11, 26, erdWeg);
  }

  // ---- Kollisionsquader ----
  const box3 = (minX, minY, minZ, maxX, maxY, maxZ) => {
    const box = new THREE.Box3(new THREE.Vector3(minX, minY, minZ), new THREE.Vector3(maxX, maxY, maxZ));
    const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), new THREE.MeshBasicMaterial({ visible: false }));
    proxy.position.copy(center); proxy.updateMatrixWorld(true);
    proxy.userData.box = box;
    // **Nicht** in die Szene: die 760 unsichtbaren Quader würden je Bild
    // durchlaufen und ihre Matrizen neu gerechnet, ohne je gezeichnet zu
    // werden. Ihre Weltmatrix steht oben fest, und sie bewegen sich nie –
    // für `intersectObjects` reicht das.
    colliders.push(proxy);
    return proxy;
  };
  const solidBox = (box) => box3(box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z);
  const addBox = (x, y, z, w, h, d) => box3(x - w / 2, y - h / 2, z - d / 2, x + w / 2, y + h / 2, z + d / 2);

  /**
   * Bauteile werden **gesammelt, nicht einzeln gesetzt**.
   *
   * Eine Stadt dieser Größe hat einige tausend Wandstücke. Als eigene Objekte
   * wäre jedes ein Zeichenaufruf; gesammelt wird daraus je Bauteil und Bezirk
   * **eine** `InstancedMesh`. Aus Tausenden werden Dutzende.
   *
   * Je Bauteil hält `vorlagen` genau eine Kopie – sie liefert Geometrie,
   * Material und die Maße für den Kollisionsquader, kommt aber nie in die Szene.
   */
  const vorlagen = new Map();
  const sammlung = new Map();
  // Kantenlänge einer Sichtbarkeitskachel. Kleiner heißt besseres Aussortieren
  // und mehr Zeichenaufrufe; bei 60 m waren es 16 Kacheln und rund 600
  // Instanzobjekte, bei 80 m neun Kacheln.
  const BEZIRK = 80;

  const vorlage = (name) => {
    if (!vorlagen.has(name)) {
      const v = spawnProp(name, { ramp: RAMP });
      v.updateMatrixWorld(true);
      // Maße im Ruhezustand: daraus wird später jeder Kollisionsquader gerechnet
      v.userData.mass = new THREE.Box3().setFromObject(v);
      vorlagen.set(name, v);
    }
    return vorlagen.get(name);
  };

  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3();

  /**
   * Prop setzen. `solid`: Kollisionsquader aus den Maßen der Vorlage.
   * `y` zählt über Gelände; `basis` überschreibt das, wo mehrere Teile auf
   * **einer** Höhe stehen müssen – ein Haus am Hang zerfällt sonst in Stufen.
   */
  const place = (name, x, z, ry = 0, { solid = true, scale = 1, y = 0, pad = 0, basis = null, skala = null } = {}) => {
    const v = vorlage(name);
    const boden = basis ?? hoeheBei(x, z);
    const s = skala ? new THREE.Vector3(...skala) : new THREE.Vector3(scale, scale, scale);
    _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry);
    const matrix = new THREE.Matrix4().compose(_v.set(x, boden + y, z), _q, s);
    const bezirk = `${Math.floor(x / BEZIRK)}_${Math.floor(z / BEZIRK)}`;
    const schluessel = `${name}|${bezirk}`;
    if (!sammlung.has(schluessel)) sammlung.set(schluessel, { name, eintraege: [] });
    sammlung.get(schluessel).eintraege.push(matrix);
    if (solid) {
      const box = v.userData.mass.clone().applyMatrix4(matrix);
      box.min.x += pad; box.min.z += pad; box.max.x -= pad; box.max.z -= pad;
      // Bis zum Boden unter dem Teil, nicht bis zur Höhe null: auf einer
      // Terrasse auf 17 m wäre eine Kiste sonst ein 17 m hoher Turm.
      box.min.y = Math.min(box.min.y, boden);
      solidBox(box);
    }
    return matrix;
  };

  /**
   * Aus der Sammlung werden Instanzen. Je Bauteil, Bezirk und Teil-Mesh eine
   * `InstancedMesh`: die Sichtbarkeitsprüfung wirft dann ganze Bezirke weg,
   * statt eine Kiste um die halbe Stadt zu spannen.
   */
  const bauFertig = () => {
    const mm = new THREE.Matrix4();
    for (const { name, eintraege } of sammlung.values()) {
      const v = vorlage(name);
      v.traverse((o) => {
        if (!o.isMesh) return;
        const inst = new THREE.InstancedMesh(o.geometry, o.material, eintraege.length);
        for (let i = 0; i < eintraege.length; i++) {
          inst.setMatrixAt(i, mm.multiplyMatrices(eintraege[i], o.matrixWorld));
        }
        inst.instanceMatrix.needsUpdate = true;
        inst.castShadow = true; inst.receiveShadow = true;
        // Name mitgeben: ohne ihn ist jede Leistungsmessung eine Liste
        // namenloser Objekte, und man rät, welches Bauteil die Dreiecke frisst.
        inst.name = name;
        // Pflanzen bestehen aus Blattkärtchen, deren Form nur in der Alphastufe
        // steckt. Der Normalen-Durchgang kennt keinen Alphatest – die Kanten-
        // erkennung zöge dort Rahmen um die Rechtecke. Also außen vorbei.
        if (LAUB.test(name)) inst.layers.set(OHNE_UMRISS);
        inst.frustumCulled = true;
        group.add(inst);
      });
    }
  };

  const holz = build(0x7a5a38, 'Wood', 'brown_planks_05');
  // Sockel und Stützmauern am Hang: derselbe Bruchstein wie die Häuser
  const steinMat = build(0x9a9287, 'RockTrim', 'dorf_stein');
  const holzDunkel = build(0x5b4128, 'Wood2', 'brown_planks_05');

  /**
   * Begehbare Galerie. Der Kollisionsquader sitzt nur unter der Oberkante,
   * darunter läuft man durch – so entsteht ein offener Gang unter dem Steg.
   */
  const deck = (x, z, w, d, h = PLATFORM_H, basis = null) => {
    const b = basis ?? bauhoehe(x, z, w, d);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, d), holz);
    slab.position.set(x, b + h - 0.15, z); slab.castShadow = slab.receiveShadow = true; group.add(slab);
    // Unterzug: von unten soll man Balken sehen, keine schwebende Platte
    for (const ox of [-w / 2 + 0.3, 0, w / 2 - 0.3]) {
      const balken = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, d), holzDunkel);
      balken.position.set(x + ox, b + h - 0.42, z); balken.castShadow = true; group.add(balken);
    }
    box3(x - w / 2, b + h - 0.2, z - d / 2, x + w / 2, b + h, z + d / 2);
    return slab;
  };

  /** Holzpfosten unter einer Galerie. */
  const pfosten = (x, z, h = PLATFORM_H, basis = null) => {
    const b = basis ?? hoeheBei(x, z);
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.22, h - 0.3, 0.22), holzDunkel);
    p.position.set(x, b + (h - 0.3) / 2, z); p.castShadow = true; group.add(p);
    box3(x - 0.14, b, z - 0.14, x + 0.14, b + h - 0.3, z + 0.14);
  };

  /**
   * Geländer aus Bausatzteilen entlang einer Kante. `dir` ist die Richtung, in
   * die das Geländer zeigt (0 = +z), `laenge` in Metern.
   */
  const gelaender = (x, z, dir, laenge, y = PLATFORM_H, basis = null) => {
    const n = Math.max(1, Math.round(laenge / ZELLE));
    const b = basis ?? hoeheBei(x, z);
    for (let i = 0; i < n; i++) {
      const t = -laenge / 2 + ZELLE / 2 + i * ZELLE;
      const ry = dir * Math.PI / 2;
      const ox = Math.cos(ry) * t, oz = -Math.sin(ry) * t;
      place('dorf:Balcony_Simple_Straight', x + ox, z + oz, ry, { solid: false, y, basis: b });
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
  const rampUp = (x, z, dir, { length = 4.16, width = 2, height = PLATFORM_H, steps = 6, base = 0, basis = null } = {}) => {
    const b0 = (basis ?? hoeheBei(x, z)) + base;      // Höhe, auf der die Treppe anfängt
    const toWorld = (lx, lz) => {
      switch (((dir % 4) + 4) % 4) {
        case 0: return [x + lx, z + lz];
        case 1: return [x + lz, z - lx];
        case 2: return [x - lx, z - lz];
        default: return [x - lz, z + lx];
      }
    };
    for (let i = 0; i < steps; i++) {
      const h = b0 + (height * (i + 1)) / steps;
      const lz0 = -length / 2 + (length * i) / steps, lz1 = -length / 2 + (length * (i + 1)) / steps;
      const a = toWorld(-width / 2, lz0), b = toWorld(width / 2, lz1);
      // Ab `base` nach oben, nicht ab dem Boden: eine Treppe, die auf einer
      // Galerie beginnt, wäre sonst ein Pfeiler bis zum Erdgeschoss und
      // versperrte den Durchgang darunter.
      box3(Math.min(a[0], b[0]), b0, Math.min(a[1], b[1]), Math.max(a[0], b[0]), h, Math.max(a[1], b[1]));
    }
    const fuss = toWorld(0, -length / 2 - 1.2), kopf = toWorld(0, length / 2 + 0.8);
    ramps.push({
      bottom: new THREE.Vector3(fuss[0], b0, fuss[1]),
      top: new THREE.Vector3(kopf[0], b0 + height, kopf[1]),
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
  const treppe = (x, z, dir, { von = 0, bis = PLATFORM_H, kopf = null, basis = null } = {}) => {
    const ry = dir * Math.PI / 2;
    const b = basis ?? hoeheBei(x, z);
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
      place('dorf:Stairs_Exterior_Straight', x + ox, z + oz, ry + Math.PI,
        { solid: false, y: von + i * proStufe, basis: b, skala: [1, proStufe, tiefe / 2.08] });
    }
    rampUp(x, z, dir, { length: stufen * tiefe, width: 2, height: hoehe, steps: Math.max(3, stufen * 3), base: von, basis: b });
    // Manche Treppen enden nicht dort, wo man hinwill: die Aufgänge zu den
    // Dachterrassen steigen an der Galeriekante hoch, und erst der Schritt zur
    // Seite bringt einen aufs Dach. Ohne diesen Zielpunkt liefen die Bots oben
    // an der Treppenkante auf der Stelle.
    if (kopf) {
      const letzte = ramps[ramps.length - 1];
      letzte.top.set(kopf[0], b + bis, kopf[1]);
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
    // Ein Haus steht auf **einer** Höhe, dem Mittel seiner vier Ecken. Würde
    // jede Wand ihre eigene Geländehöhe nehmen, zerfiele das Haus am Hang in
    // Stufen. Talwärts füllt ein Sockel die Lücke.
    const h0 = bauhoehe(x, z, w, d);
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
        place(teil, pos[0], pos[1], ry, { solid: false, basis: h0 });
        n++;
      }
    };
    seite(0, nx, d / 2);
    seite(1, nz, w / 2);
    seite(2, nx, d / 2);
    seite(3, nz, w / 2);

    // Ecken verdecken die Stoßkanten der Wandstücke – aber nur im Tal, wo man
    // dicht an den Häusern entlangläuft. Gemessen kostet allein die steinerne
    // Eckleiste 3100 Dreiecke je Stück; über die ganze Stadt waren das 472 000,
    // ein Viertel der Karte, für eine Fuge, die man aus zwanzig Metern nicht
    // sieht.
    if (Math.abs(z) < 30) {
      for (const [ex, ez, ry] of [[-w / 2, -d / 2, 0], [w / 2, -d / 2, Math.PI / 2],
                                  [w / 2, d / 2, Math.PI], [-w / 2, d / 2, -Math.PI / 2]]) {
        place(stein ? 'dorf:Corner_Exterior_Brick' : 'dorf:Corner_Exterior_Wood', x + ex, z + ez, ry, { solid: false, basis: h0 });
      }
    }

    if (terrasse) {
      // Begehbares Flachdach: Bretterboden, Geländer ringsum, ein Kollisions-
      // quader nur unter der Oberkante – so ist es eine Ebene, keine Kiste.
      const boden = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.26, d + 0.3), holz);
      boden.position.set(x, h0 + WAND_H + 0.13, z);
      boden.castShadow = boden.receiveShadow = true; group.add(boden);
      box3(x - w / 2 - 0.15, h0 + WAND_H, z - d / 2 - 0.15, x + w / 2 + 0.15, h0 + WAND_H + 0.26, z + d / 2 + 0.15);
      const oben = WAND_H + 0.26;
      gelaender(x, z - d / 2 - 0.1, 2, w, oben, h0); gelaender(x, z + d / 2 + 0.1, 0, w, oben, h0);
      gelaender(x - w / 2 - 0.1, z, 3, d, oben, h0); gelaender(x + w / 2 + 0.1, z, 1, d, oben, h0);
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
      place(`dorf:Roof_RoundTiles_${teil}`, x, z, ry, { solid: false, y: WAND_H, basis: h0 });
    }
    // Ein Quader für das ganze Haus statt einer pro Wand: weniger Kollider,
    // und niemand bleibt in einer Fuge zwischen zwei Wandstücken hängen.
    // Beim Torhaus zwei Quader links und rechts der Durchfahrt, dazu einer
    // darüber – sonst liefe man durch das Obergeschoss hindurch.
    const a = [x - w / 2 - 0.15, z - d / 2 - 0.15], b = [x + w / 2 + 0.15, z + d / 2 + 0.15];
    // Sockel: talwärts steht das Haus sonst auf Stelzen. Der Quader reicht von
    // der tiefsten Ecke bis zur Bauhöhe und ist zugleich Kollision.
    const tiefste = Math.min(
      hoeheBei(a[0], a[1]), hoeheBei(b[0], a[1]), hoeheBei(a[0], b[1]), hoeheBei(b[0], b[1]),
    );
    if (h0 - tiefste > 0.25) {
      const sockel = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.3, h0 - tiefste + 0.3, d + 0.3), steinMat);
      sockel.position.set(x, (h0 + tiefste - 0.3) / 2 + 0.15, z);
      sockel.castShadow = sockel.receiveShadow = true; group.add(sockel);
    }
    const unten = Math.min(tiefste, h0);
    if (durchgang === null) {
      box3(a[0], unten, a[1], b[0], h0 + WAND_H, b[1]);
    } else {
      const laengs = durchgang % 2 === 0;        // Durchfahrt in z- oder x-Richtung
      const tor = ZELLE / 2 + 0.1;               // halbe Breite der Durchfahrt
      if (laengs) {
        box3(a[0], unten, a[1], x - tor, h0 + WAND_H, b[1]);
        box3(x + tor, unten, a[1], b[0], h0 + WAND_H, b[1]);
      } else {
        box3(a[0], unten, a[1], b[0], h0 + WAND_H, z - tor);
        box3(a[0], unten, z + tor, b[0], h0 + WAND_H, b[1]);
      }
      // Decke über der Durchfahrt: Kopfhöhe 3 m, darüber ist das Haus wieder dicht
      box3(a[0], h0 + 3, a[1], b[0], h0 + WAND_H, b[1]);
    }
    return { x, z, w, d, hoehe: h0 };
  };

  // ==== Die Stadt am Hang ====
  //
  // Drei Lagen, an der Mitte gespiegelt: im Tal Markt und Gassen, darüber je
  // Mannschaft eine Terrasse mit zwei Höfen, ganz oben die Ruine. Hinauf geht
  // es nur über die Hohlwege, die `terrain.js` in die Böschungen schneidet –
  // überall sonst ist der Hang steiler als die Neigungsgrenze und damit Wand.
  //
  // Gebaut wird aus **Mustern**, nicht Stück für Stück: `gasse()`, `hof()`,
  // `brüstung()`, `rampenstrasse()`, `ruine()`. Eine Stadt dieser Größe
  // einzeln zu setzen wäre weder zu lesen noch fair zu halten – und fair heißt
  // hier: jede Anlage wird zweimal gebaut, einmal je Seite.

  /** Beide Seiten bauen. `s` ist +1 (Blau, Norden) oder -1 (Rot, Süden). */
  const seiten = (fn) => { fn(1); fn(-1); };
  /** Drehung spiegeln – die gespiegelte Wand zeigt in die andere Richtung. */
  const mry = (s, ry) => (s > 0 ? ry : -ry);
  /** Richtung in 90°-Schritten spiegeln: +z wird -z, +x bleibt +x. */
  const mdir = (s, d) => (s > 0 ? d : (d % 2 === 0 ? (d + 2) % 4 : d));
  /**
   * Wo die Böschung oben ausläuft: das erste z, an dem der Boden hoch **und**
   * flach ist. Die Kante wandert mit x – die Terrassen sind keine Kästen –,
   * und eine Brüstung auf festem z stünde streckenweise im Hang.
   */
  const kante = (x, s, hMin, zVon, zBis) => {
    for (let z = zVon; z <= zBis; z++) {
      if (hoeheBei(x, s * z) > hMin && neigungBei(x, s * z) < 0.25) return z;
    }
    return zBis;
  };

  const schlote = [];
  const terrassenPunkte = [];
  /** Schornstein aufs Dach eines eben gesetzten Hauses. */
  const schlot = (h, ox = 0, oz = 0) => {
    place('dorf:Prop_Chimney', h.x + ox, h.z + oz, 0, { solid: false, y: WAND_H - 0.4, basis: h.hoehe });
    schlote.push(new THREE.Vector3(h.x + ox, h.hoehe + WAND_H + 2.7, h.z + oz));
  };

  const HAUSBREITEN = [3, 2, 4, 2, 3, 3, 2];

  /**
   * Gasse: zwei Häuserzeilen mit einem Weg dazwischen. Breite, Tiefe, Material
   * und Türseite wechseln – eine Zeile gleicher Häuser sieht aus wie eine
   * Siedlung, nicht wie eine gewachsene Stadt. Die Tür zeigt immer zur Gasse.
   */
  const gasse = (s, zMitte, x0, x1, breite, { stein = false, luecken = [], rauch = 5 } = {}) => {
    let x = x0, i = 0;
    while (x < x1 - 4) {
      const nx = HAUSBREITEN[i % HAUSBREITEN.length];
      const w = nx * ZELLE;
      const cx = x + w / 2;
      for (const r of [-1, 1]) {
        const nz = 2 + ((i + (r > 0 ? 1 : 0)) % 2);
        const d = nz * ZELLE;
        if (luecken.some(([lx, lb]) => Math.abs(cx - lx) < lb)) continue;
        // Die Gassenseite hängt von der Spiegelung ab: liegt das Haus in der
        // Welt nördlich des Wegs, ist die Tür in der Südwand und umgekehrt.
        const tuer = r * s > 0 ? nx + nz + Math.floor(nx / 2) : Math.floor(nx / 2);
        const h = haus(cx, s * (zMitte + r * (breite / 2 + d / 2)), nx, nz, {
          stein: stein ? i % 4 !== 1 : i % 3 === 2,
          tuer,
          durchgang: i % 6 === 4 ? 0 : null,
        });
        if (i % rauch === 1 && r > 0) schlot(h, w / 4, 0);
      }
      x = cx + w / 2 + 2.5 + (i % 3) * 1.5;
      i++;
    }
  };

  /**
   * Innenhof: drei Häuser um eine Galerie auf Pfosten, ein Aufgang, Geländer.
   * Das ist die Grundform jedes Kontrollpunkts – wer ihn hält, steht oben und
   * wird von drei Seiten gesehen. Die Treppe zeigt nach innen: läge ihr Fuß
   * jenseits der Grenze, wäre der Wegpunkt für die Bots unerreichbar.
   */
  const hof = (s, cx, cz) => {
    const zz = s * cz;
    const b = bauhoehe(cx, zz, 7, 6);
    haus(cx + 6.5, zz, 2, 3, { stein: true });
    const hinten = haus(cx, zz + s * 6.5, 3, 2, { tuer: 1 });
    // Die vierte Seite bleibt offen. Mit Häusern ringsum und der Treppe als
    // einzigem Ausgang war der Hof im Navigationsgitter eine eigene Insel:
    // Treppenstufen sind dort Wand, und ein Bot, der hineinlief, kam nie
    // wieder heraus. Ein Zaun gibt dieselbe Deckung, ohne den Hof zu schließen.
    for (let i = -1; i <= 1; i++) {
      place(i ? 'dorf:Prop_WoodenFence_Extension1' : 'dorf:Prop_WoodenFence_Single',
        cx - 6.5, zz + i * 2, mry(s, Math.PI / 2), { solid: false, basis: b });
    }
    box3(cx - 6.8, b, zz - 3, cx - 6.2, b + 0.85, zz + 3);
    schlot(hinten, 1.6, 0);
    deck(cx, zz, 7, 6, PLATFORM_H, b);
    for (const [px, pz] of [[-3, -2.6], [3, -2.6], [-3, 2.6], [3, 2.6]]) pfosten(cx + px, zz + pz, PLATFORM_H, b);
    gelaender(cx, zz - 3, 2, 7, PLATFORM_H, b); gelaender(cx, zz + 3, 0, 7, PLATFORM_H, b);
    // Die Treppe beginnt auf dem **Boden**, nicht auf der Bauhöhe des Decks.
    // Liegt das Gelände am Treppenfuß tiefer, steht die unterste Stufe sonst
    // in der Luft – gemessen anderthalb Meter über dem Gras, und niemand kam
    // hinauf.
    const fuss = hoeheBei(cx, zz - s * 5.6);
    treppe(cx, zz - s * 5.6, mdir(s, 0), { basis: fuss, bis: b + PLATFORM_H - fuss });
    place('dorf:Prop_Crate', cx + 2.6, zz + s * 1.8, 0.2, { y: PLATFORM_H, basis: b });
    place('dorf:Prop_Crate', cx - 3.6, zz - s * 4.4, 0.4, { basis: b });
    place('dorf:Prop_Vine1', cx + 4.4, zz + s * 2.2, mry(s, Math.PI), { solid: false, y: 0.4, basis: b });
    return new THREE.Vector3(cx, b + PLATFORM_H, zz);
  };

  /**
   * Brüstung an der Terrassenkante. Ohne sie fiele man beim Zurückweichen die
   * Böschung hinunter, und die Kante wäre für beide Seiten nur eine Klippe.
   * So ist sie Deckung: von oben sieht man ins Tal, von unten nur Mauer.
   * Wo ein Hohlweg heraufkommt, bleibt sie offen – sonst wäre der Weg umsonst.
   */
  const bruestung = (s, x0, x1, hMin, zVon, zBis, tore) => {
    for (let x = x0; x <= x1; x += 2) {
      if (tore.some((t) => Math.abs(x - t) < 7)) continue;
      const z = kante(x, s, hMin, zVon, zBis) - 1;
      const zw = s * z, b = hoeheBei(x, zw);
      place('dorf:Wall_UnevenBrick_Straight', x, zw, mry(s, s > 0 ? Math.PI : 0), {
        solid: false, basis: b, skala: [1, 0.42, 1],
      });
      box3(x - 1, b - 2, zw - 0.45, x + 1, b + 1.31, zw + 0.45);
    }
  };

  /**
   * Die Rampenstraße durch den mittleren Hohlweg: Stützmauern links und rechts,
   * dazwischen der gepflasterte Belag (weiter oben gesetzt).
   *
   * Hier lagen erst Treppenstufen. Sie gingen nicht: der Einschnitt im Gelände
   * **muss** eine flache Rampe sein, sonst käme niemand hinauf – und
   * Treppenmodule auf einer Rampe verschwinden entweder im Boden oder schweben
   * darüber. Eine gepflasterte Steigung ist ehrlicher als eine Treppe, auf der
   * man nicht geht.
   */
  const rampenstrasse = (s, x, z0, z1, breite) => {
    const n = Math.round(Math.abs(z1 - z0) / 2);
    const dz = (z1 - z0) / n;
    for (let i = 0; i <= n; i++) {
      const zm = z0 + dz * i;
      for (const k of [-1, 1]) {
        const px = x + k * (breite / 2);
        const b = hoeheBei(px, s * zm);
        // Die Außenseite der Wand zeigt bei ry = 0 nach +z; die linke Wange muss
        // also nach +x schauen, die rechte nach -x. Beide gleich zu drehen
        // hieße, eine davon verkehrt herum in den Hang zu stellen.
        place('dorf:Wall_UnevenBrick_Straight', px, s * zm, k > 0 ? -Math.PI / 2 : Math.PI / 2, {
          solid: false, basis: b, skala: [1, 0.5, 1],
        });
        box3(px - 0.4, b - 2, s * zm - 1, px + 0.4, b + 1.5, s * zm + 1);
      }
    }
  };

  /** Karrenweg: kein Ausbau, nur Steine und Radspuren an den Rändern. */
  const karrenweg = (s, x, z0, z1, breite) => {
    const n = Math.round(Math.abs(z1 - z0) / 6);
    const dz = (z1 - z0) / n;
    for (let i = 0; i <= n; i++) {
      const zm = s * (z0 + dz * i);
      for (const k of [-1, 1]) {
        const px = x + k * (breite / 2 + 0.6);
        place(i % 2 ? 'natur:Rock_Medium_1' : 'natur:Pebble_Round_4', px, zm, px + zm, { solid: false, scale: i % 2 ? 0.6 : 1.4 });
        box3(px - 0.9, hoeheBei(px, zm) - 0.5, zm - 0.9, px + 0.9, hoeheBei(px, zm) + 1.1, zm + 0.9);
      }
    }
  };

  /**
   * Burgruine auf der Hochterrasse: Bruchstücke einer Ringmauer, ein Turmstumpf
   * und eine Plattform mit Blick über die halbe Karte. Weit weg vom Markt und
   * ohne Kontrollpunkt – das ist der Weg für die, die flankieren wollen, und
   * dafür läuft man die doppelte Strecke.
   */
  const ruine = (s, cz) => {
    const zz = s * cz;
    // Ringmauer mit Lücken. Eine geschlossene Mauer wäre ein Kasten; die
    // Lücken sind Schießscharten und Fluchtwege zugleich.
    for (let a = 0; a < 20; a++) {
      if (a % 5 === 2 || a % 7 === 3) continue;
      const w = (a / 20) * Math.PI * 2;
      const px = Math.cos(w) * 13, pz = zz + Math.sin(w) * 13;
      const b = hoeheBei(px, pz);
      const hoch = a % 4 === 1 ? 1 : 2;
      for (let k = 0; k < hoch; k++) {
        place('dorf:Wall_UnevenBrick_Straight', px, pz, -w + Math.PI / 2, { solid: false, basis: b, y: k * WAND_H });
      }
      box3(px - 1.1, b - 1, pz - 1.1, px + 1.1, b + hoch * WAND_H, pz + 1.1);
    }
    const turm = haus(9, zz, 2, 2, { stein: true, dach: false });
    place('dorf:Roof_Tower_RoundTiles', turm.x, turm.z, 0, { solid: false, y: WAND_H, basis: turm.hoehe });
    const b = bauhoehe(0, zz, 8, 6);
    deck(0, zz, 8, 6, PLATFORM_H, b);
    for (const [px, pz] of [[-3.4, -2.6], [3.4, -2.6], [-3.4, 2.6], [3.4, 2.6]]) pfosten(px, zz + pz, PLATFORM_H, b);
    gelaender(0, zz - 3, 2, 8, PLATFORM_H, b); gelaender(0, zz + 3, 0, 8, PLATFORM_H, b);
    // Der Aufgang steigt **in x**, nicht in z: auf der Hochterrasse ist nach
    // innen nur wenige Meter Platz, und eine Treppe in z stünde mit dem Fuß
    // schon wieder in der Böschung. Dort greift die Neigungsgrenze, und
    // gemessen kam niemand die ersten Stufen hinauf.
    const fuss = hoeheBei(-8, zz);
    treppe(-8, zz, 1, { basis: fuss, bis: b + PLATFORM_H - fuss });
    for (const [px, pz, r] of [[-7, -6, 0.3], [6, 5, 1.1], [9, -4, 0.7]]) {
      place('dorf:Prop_Crate', px, zz + s * pz, r);
    }
  };
  // ---- Stadtmauer an den offenen Enden des Tals ----
  // Nach Norden und Süden schließt die Böschung das Tal; nach Osten und Westen
  // steht nichts im Weg, und dort steht die Mauer – je ein Tor in der Achse
  // der Marktstraße.
  const stadtmauer = (mx) => {
    const ry = mx > 0 ? -Math.PI / 2 : Math.PI / 2;
    for (let z = -28; z <= 28; z += 2) {
      const b = hoeheBei(mx, z);
      if (Math.abs(z) <= 2) {
        place('dorf:Wall_Arch', mx, z, ry, { solid: false, basis: b });
        place('dorf:Wall_UnevenBrick_Straight', mx, z, ry, { solid: false, basis: b, y: WAND_H });
        box3(mx - 0.7, b + 3.1, z - 1, mx + 0.7, b + 2 * WAND_H, z + 1);
        continue;
      }
      for (let k = 0; k < 2; k++) {
        place('dorf:Wall_UnevenBrick_Straight', mx, z, ry, { solid: false, basis: b, y: k * WAND_H });
      }
      box3(mx - 0.7, b - 1.5, z - 1, mx + 0.7, b + 2 * WAND_H, z + 1);
    }
    for (const tz of [-30, 30]) {
      const t = haus(mx, tz, 2, 2, { stein: true, dach: false });
      place('dorf:Roof_Tower_RoundTiles', t.x, t.z, 0, { solid: false, y: WAND_H, basis: t.hoehe });
    }
  };
  stadtmauer(-72); stadtmauer(72);

  // ---- Marktplatz in der Mitte (Kontrollpunkt M) ----
  // Zwei Häuser rahmen den Platz, dazwischen spannt sich ein Steg. Wer den
  // Punkt hält, steht oben und ist von drei Seiten sichtbar. Die beiden Häuser
  // tragen Dachterrassen, erreichbar nur über die Galerie.
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
    const b = hoeheBei(x, z);
    const g = new THREE.Group();
    g.position.set(x, b, z); g.rotation.y = ry; group.add(g);
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
    box3(x - bw, b, z - bd, x + bw, b + 1.02, z + bd);
    // Ware davor: zwei Kisten, hoch genug, um dahinter zu verschwinden
    place('dorf:Prop_Crate', x - Math.sin(ry) * 1.5, z - Math.cos(ry) * 1.5, ry + 0.3);
    place('dorf:Prop_Crate', x - Math.sin(ry) * 1.5 + Math.cos(ry), z - Math.cos(ry) * 1.5 - Math.sin(ry), ry - 0.2);
  };
  stand(-8.5, -6.5, 0); stand(8.5, 6.5, Math.PI); stand(-2.5, 9.5, Math.PI / 2);
  stand(2.5, -9.5, -Math.PI / 2);

  // Kistenstapel als schneller Aufstieg: jede Stufe unter STEP_UP, oben endet
  // er auf Galeriehöhe. Wer die Treppe meidet, kommt hier hoch.
  const kistenTreppe = (x, z, ry) => {
    // 40 cm je Kiste, nicht 52: STEP_UP liegt bei 55 cm, aber zwischen zwei
    // Bildern fällt die Figur ein Stück, und dann fehlen die letzten Zentimeter.
    // Die Stufe muss spürbar unter der Grenze bleiben, sonst klemmt der Stapel.
    const stufen = 6, schritt = 0.8, hoch = 0.4;
    const b = hoeheBei(x, z);
    for (let i = 0; i < stufen; i++) {
      const h = i * hoch;
      const ox = Math.cos(ry) * i * schritt, oz = -Math.sin(ry) * i * schritt;
      place('dorf:Prop_Crate', x + ox, z + oz, ry + i * 0.2, { y: h, solid: false, basis: b });
      box3(x + ox - 0.55, b, z + oz - 0.55, x + ox + 0.55, b + h + hoch, z + oz + 0.55);
    }
    // Die oberste Kiste muss die Galerie überragen, sonst steht man davor und
    // kommt die letzten zwanzig Zentimeter nicht hoch.
    const fuss = [x - Math.cos(ry) * 1.2, z + Math.sin(ry) * 1.2];
    const kopf = [x + Math.cos(ry) * (stufen * schritt), z - Math.sin(ry) * (stufen * schritt)];
    ramps.push({
      bottom: new THREE.Vector3(fuss[0], b, fuss[1]),
      top: new THREE.Vector3(kopf[0], b + PLATFORM_H, kopf[1]),
    });
  };
  // Enden jeweils an der Kante der Marktgalerie (z = ∓3,7)
  kistenTreppe(-3, -7.2, -Math.PI / 2); kistenTreppe(3, 7.2, Math.PI / 2);

  // ---- Talstadt: Gassen links und rechts des Markts ----
  seiten((s) => {
    gasse(s, 15, -66, 66, 8, { luecken: [[0, 14], [-44, 13], [44, 13]] });
  });
  // Handwerkerhof an jedem Ende der Marktstraße – Deckung auf dem langen Weg
  // zum Tor und ein erhöhter Stand neben dem Markt. Diese beiden stehen **auf**
  // der Spiegelachse und werden deshalb nur einmal gebaut: gespiegelt lägen
  // zwei Höfe sechs Meter auseinander, ihre Galerien überlappten, und die
  // Treppe des einen endete im Deck des anderen.
  hof(1, -44, 0);
  hof(1, 44, 0);

  // ---- Die Aufstiege ----
  seiten((s) => {
    rampenstrasse(s, 0, 28, 50, 9);
    karrenweg(s, -34, 26, 52, 11);
    karrenweg(s, 34, 26, 52, 11);
    karrenweg(s, -72, 82, 106, 11);
    karrenweg(s, 72, 82, 106, 11);
    // Torhäuser am Fuß der Aufstiege: von hier aus sieht man, wer herunterkommt.
    for (const tx of [-34, 34]) {
      haus(tx + 8, s * 24, 2, 2, { stein: true });
      haus(tx - 8, s * 24, 2, 2, { stein: true, tuer: 1 });
    }
  });

  // ---- Oberstadt auf den Terrassen ----
  seiten((s) => {
    bruestung(s, -70, 70, 6.5, 34, 58, [0, -34, 34]);
    // Die beiden Höfe sind die Kontrollpunkte der Terrasse.
    terrassenPunkte.push([s < 0 ? 'A' : 'D', hof(s, -30, 60)], [s < 0 ? 'B' : 'E', hof(s, 30, 60)]);
    gasse(s, 69, -66, 66, 8, { stein: true, luecken: [[0, 13], [-30, 15], [30, 15]], rauch: 4 });
    // Ein Riegel quer zur Terrasse, damit man nicht von Hof zu Hof geradeaus
    // durchsieht: Wer den einen Punkt hält, soll den anderen nicht mitverteidigen.
    haus(0, s * 58, 3, 3, { stein: true, durchgang: 1 });
    haus(0, s * 66, 2, 2, { tuer: 2 });
    // Brüstung der oberen Böschung, damit die Terrasse auch oben eine Kante hat
    bruestung(s, -86, 86, 14.5, 84, 108, [-72, 72]);
  });

  // ---- Hochterrasse: die Ruine ----
  seiten((s) => ruine(s, 110));

  // ---- Grün: Waldränder, Büsche in den Gassen, Gras auf den Hängen ----
  const baeume = ['natur:CommonTree_3', 'natur:Pine_4', 'natur:CommonTree_3',
    'natur:TwistedTree_2', 'natur:Pine_4'];
  // Der Wald steht dort, wo nicht gebaut wird: außen an den Flanken und auf den
  // Böschungen zwischen den Hohlwegen. Er ist Kulisse und Wegweiser zugleich –
  // wo Bäume stehen, kommt man nicht hoch.
  let bi = 0;
  for (let x = -112; x <= 112; x += 18) {
    for (const [z0, z1] of [[-118, -100], [-96, -84], [-44, -30], [30, 44], [84, 96], [100, 118]]) {
      for (let z = z0; z <= z1; z += 11) {
        const px = x + Math.sin(bi * 2.7) * 2.5, pz = z + Math.cos(bi * 1.9) * 2.5;
        bi++;
        if (imHohlweg(px, pz, 4)) continue;                       // nie über einer Auffahrt
        if (Math.hypot(px, Math.abs(pz) - 110) < 24) continue;    // nicht in die Ruine
        if (neigungBei(px, pz) > 0.9) continue;         // an der nackten Wand wächst nichts
        const art = baeume[bi % baeume.length];
        place(art, px, pz, bi * 1.7, { solid: false, scale: art === 'natur:TwistedTree_2' ? 0.5 : 0.85 + (bi % 4) * 0.1 });
      }
    }
  }
  // Waldriegel an den Flanken: jenseits davon ist nichts mehr zu holen.
  for (let z = -114; z <= 114; z += 13) {
    for (const x of [-104, -96, 96, 104]) {
      const px = x + Math.sin(bi * 1.3) * 3, pz = z + Math.cos(bi * 2.1) * 3;
      bi++;
      place(baeume[bi % baeume.length], px, pz, bi * 2.1, { solid: false, scale: 0.9 + (bi % 3) * 0.15 });
    }
  }

  // Büsche und Gras: nichts davon ist solide – man soll hindurchlaufen, nicht
  // daran hängen. Gespiegelt gesetzt, wie alles andere.
  seiten((s) => {
    for (const [x, z, art, gr] of [
      [-15.5, 7.5, 'natur:Bush_Common_Flowers', 0.9],
      [-11, 3, 'natur:Bush_Common_Flowers', 0.8],
      [-24, 14, 'natur:Bush_Common', 1.0],
      [21, 8, 'natur:Fern_1', 0.8],
      [5, 21, 'natur:Bush_Common_Flowers', 0.9],
      [-40, 26, 'natur:Bush_Common', 1.1],
      [40, 26, 'natur:Bush_Common', 1.1],
      [-26, 56, 'natur:Bush_Common_Flowers', 0.9],
      [26, 56, 'natur:Bush_Common_Flowers', 0.9],
      [-58, 62, 'natur:Fern_1', 0.9],
      [58, 62, 'natur:Fern_1', 0.9],
      [0, 104, 'natur:Bush_Common', 1.2],
    ]) place(art, x, s * z, x * 0.7, { solid: false, scale: gr });
    for (let i = 0; i < 40; i++) {
      const a = i * 2.39, r = 12 + (i % 9) * 6;
      const x = Math.cos(a) * r, z = Math.abs(Math.sin(a) * r) + 4;
      place('natur:Grass_Common_Tall', x, s * z, a, { solid: false, scale: 0.6 + (i % 3) * 0.2 });
    }
    for (const [x, z] of [[-13, 20], [-26, 8], [8, 26], [-50, 14], [50, 14], [-20, 66], [20, 66]]) {
      place('natur:Pebble_Round_4', x, s * z, x, { solid: false, scale: 1.2 });
    }
  });

  // Weinranken an einzelnen Wänden – zwölf gleich aussehende Häuser fallen auf
  seiten((s) => {
    for (const [x, z, ry, art] of [
      [-15, 1.2, Math.PI / 2, 'dorf:Prop_Vine2'],
      [4.2, 18, 0, 'dorf:Prop_Vine5'],
      [-45, 10, Math.PI / 2, 'dorf:Prop_Vine5'],
      [28, 66, 0, 'dorf:Prop_Vine2'],
    ]) place(art, x, s * z, mry(s, ry), { solid: false, y: WAND_H - 0.2 });
  });

  // Zäune trennen Hinterhöfe ab, ohne die Sicht zu nehmen
  seiten((s) => {
    for (const [x, z, ry] of [[-12, 12, 0], [13.6, 10.2, Math.PI / 2], [-52, 12, 0], [52, 12, 0]]) {
      const b = hoeheBei(x, s * z);
      for (let i = -1; i <= 1; i++) {
        const ox = Math.cos(ry) * i * 2, oz = -Math.sin(ry) * i * 2;
        place(i ? 'dorf:Prop_WoodenFence_Extension1' : 'dorf:Prop_WoodenFence_Single', x + ox, s * z + oz, mry(s, ry), { solid: false, basis: b });
      }
      box3(x - (ry ? 0.3 : 3), b, s * z - (ry ? 3 : 0.3), x + (ry ? 0.3 : 3), b + 0.85, s * z + (ry ? 3 : 0.3));
    }
    for (const [x, z, r] of [[-11, 9, 0.3], [3, -13, 1.2], [-23, 12, 0.2], [9, -22, 0.9],
                             [-38, 8, 0.5], [38, 8, 1.4], [-30, 68, 0.2], [30, 68, 1.0]]) {
      const b = hoeheBei(x, s * z);
      place('dorf:Prop_Crate', x, s * z, r, { basis: b });
      place('dorf:Prop_Crate', x + Math.cos(r) * 1.2, s * z + Math.sin(r) * 1.2, r + 0.6, { basis: b });
      place('dorf:Prop_Brick1', x + 1.8, s * z - 1.1, r, { solid: false, basis: b });
    }
  });


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
  group.add(sun, sun.target);

  /**
   * Der Schattenausschnitt wandert mit dem Spieler.
   *
   * Über 240 m gespannt wäre eine 4096er Karte 6 cm je Bildpunkt – Matsch, wo
   * heute ein Geländerpfosten seinen eigenen Schatten hat. Eng und mitwandernd
   * bleibt die Auflösung, und was weit weg ist, hat keinen Schlagschatten; das
   * sieht bei dieser Entfernung niemand.
   *
   * Eingerastet wird auf **Texelvielfache in den Achsen des Lichts**, nicht auf
   * ganze Meter: verschiebt sich der Ausschnitt um Bruchteile eines Texels,
   * wandern die Schattenkanten bei jedem Schritt sichtbar hin und her.
   */
  const lichtDir = sunDir.clone().normalize();
  const lichtRechts = new THREE.Vector3(0, 1, 0).cross(lichtDir).normalize();
  const lichtHoch = new THREE.Vector3().crossVectors(lichtDir, lichtRechts).normalize();
  const texel = (2 * rand) / sm;
  const _mitte = new THREE.Vector3();
  const lichtFolgen = (pos) => {
    const a = Math.round(pos.dot(lichtRechts) / texel) * texel;
    const b = Math.round(pos.dot(lichtHoch) / texel) * texel;
    _mitte.copy(lichtRechts).multiplyScalar(a)
      .addScaledVector(lichtHoch, b)
      .addScaledVector(lichtDir, pos.dot(lichtDir));
    sun.target.position.copy(_mitte);
    sun.position.copy(_mitte).addScaledVector(lichtDir, 60);
  };
  if (REAL) {
    // Umgebungslicht kommt aus dem Himmel selbst, kein künstliches Fülllicht.
    // Ohne HDRI (offline, erster Start) bleibt der gerechnete Himmel.
    if (!hdri) buildRealSky(scene, renderer, sunDir.clone().normalize());
    // Dunst über die neue Entfernung: bei 0,0012 endete der Boden bei 300 m als
    // harte Kante im Nichts. Jetzt verliert sich das Gelände im Blau, bevor die
    // Kamera es abschneidet – und die fernen Bezirke liefern nichts mehr, was
    // man erkennen könnte.
    scene.fog = new THREE.FogExp2(0x9fbdd4, 0.0035);
  } else {
    const rim = new THREE.DirectionalLight(0xbcd8ff, 0.8); rim.position.set(-20, 14, -25);
    group.add(rim, new THREE.HemisphereLight(0xbfe6ff, 0x6b8f3a, 1.1));
    group.add(buildSky());
    scene.fog = new THREE.Fog(0xc3d6e0, 90, 330);
  }

  scene.add(group);
  // Startplätze liegen auf dem Gelände, nicht auf Höhe null – sonst startet man
  // acht Meter unter der Stadt und fällt erst einmal nach oben.
  // Startplätze: je sechs auf jeder Seite, drei oben auf der eigenen Terrasse
  // und zwei unten an den Enden der Marktstraße. Wer stirbt, soll nicht eine
  // Minute laufen – deshalb liegen sie bei den eigenen Punkten, nicht in einer
  // gemeinsamen Ecke.
  const spawns = [];
  for (const s of [1, -1]) {
    for (const [sx, sz] of [[-52, 62], [52, 62], [-12, 66], [12, 66], [-58, 15], [58, 15]]) {
      spawns.push(new THREE.Vector3(sx, hoeheBei(sx, s * sz), s * sz));
    }
  }
  // Kontrollpunkte für Domination. Sie liegen auf den Plattformdächern – wer sie
  // will, muss über eine Rampe hoch. Gezeichnet werden sie in domination.js.
  // Fünf Kontrollpunkte: der Markt in der Mitte, dazu je Mannschaft die beiden
  // Höfe auf der eigenen Terrasse. Ungerade Zahl, damit ein Gleichstand keine
  // Dauerlösung ist – und gespiegelt, damit keine Seite den besseren Punkt hat.
  const punkte = [
    ...terrassenPunkte.filter(([id]) => id < 'C').map(([id, pos]) => ({ id, pos })),
    { id: 'C', pos: new THREE.Vector3(0, bauhoehe(0, 0, 8, 7.4) + PLATFORM_H, 0) },
    ...terrassenPunkte.filter(([id]) => id > 'C').map(([id, pos]) => ({ id, pos })),
  ];
  bauFertig();
  const leben = new Leben(group, schlote, punkte);
  // Kollisionsquader ins Raster einsortieren – erst hier, wenn alle stehen.
  const raster = rasterBauen(colliders);

  /**
   * Spielfeldgrenzen je Modus. Die Stadt ist 240 m groß; im Deathmatch mit
   * sechs Figuren wäre das eine Wanderung, kein Gefecht. Deshalb bekommt jeder
   * Modus seinen Ausschnitt, und `grenze` sagt, welcher gerade gilt.
   */
  const zonen = {
    ganz: { x: SIZE / 2 - 1.5, z: SIZE / 2 - 1.5 },
    // Deathmatch: das Tal bis zu den beiden Handwerkerhöfen, rund 96 × 52 m
    deathmatch: {
      x: 48, z: 26,
      spawns: [[-34, -16], [34, 16], [-34, 16], [34, -16], [0, -20], [0, 20], [-20, 0], [20, 0]]
        .map(([sx, sz]) => new THREE.Vector3(sx, hoeheBei(sx, sz), sz)),
    },
  };

  return {
    group, colliders, raster, ramps, spawns, punkte, leben, lichtFolgen,
    // Die Sparleiter darf die Schattenkarte verkleinern; dafür braucht sie das
    // Licht, und die Welt ist die einzige Stelle, die es hat.
    sonne: sun,
    zonen, grenze: zonen.ganz,
  };
}

/**
 * ---- Kollisionsraster ----
 *
 * `groundHeightAt()` und `resolveCollisions()` liefen über **alle** Quader, je
 * Figur und Bild. Auf 60 m waren das 200; auf 240 m mit ausgebauter Stadt sind
 * es einige Tausend, mal dreizehn Figuren, mal sechzig Bilder. Das allein
 * frisst die Bildrate, lange bevor etwas davon zu sehen ist.
 *
 * Deshalb liegen die Quader in Zellen von 8 m. Eine Abfrage sieht nur die
 * Zellen, die ihr Rechteck berührt – bei einer Figur mit 0,4 m Radius also
 * eine bis vier statt aller.
 */
const KRASTER = 8;
const schluessel = (i, j) => (i + 512) * 1024 + (j + 512);

/** Quaderliste in Zellen einsortieren. Ein Quader steht in jeder Zelle, die er berührt. */
export function rasterBauen(colliders) {
  const raster = new Map();
  for (const m of colliders) {
    const b = m.userData.box;
    const i0 = Math.floor(b.min.x / KRASTER), i1 = Math.floor(b.max.x / KRASTER);
    const j0 = Math.floor(b.min.z / KRASTER), j1 = Math.floor(b.max.z / KRASTER);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const k = schluessel(i, j);
        let a = raster.get(k); if (!a) raster.set(k, a = []);
        a.push(m);
      }
    }
  }
  return raster;
}

// Ein Zähler statt einer Menge: derselbe Quader liegt in mehreren Zellen und
// darf nur einmal in der Antwort stehen. Ein `Set` je Abfrage wäre Müll je Bild.
let stempel = 0;
const _bereich = [];
const _strahl = [];

/**
 * Alle Quader, die ein Rechteck auf der Grundfläche berühren können.
 * Ohne eigenes `out` schreibt die Abfrage in einen geteilten Zwischenspeicher –
 * wer währenddessen eine zweite Abfrage stellt, muss eine eigene Liste mitgeben.
 */
export function inBereich(world, minX, minZ, maxX, maxZ, out = _bereich) {
  out.length = 0;
  if (!world.raster) { for (const m of world.colliders) out.push(m); return out; }
  stempel++;
  const i0 = Math.floor(minX / KRASTER), i1 = Math.floor(maxX / KRASTER);
  const j0 = Math.floor(minZ / KRASTER), j1 = Math.floor(maxZ / KRASTER);
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const a = world.raster.get(schluessel(i, j)); if (!a) continue;
      for (const m of a) {
        if (m.userData.stempel === stempel) continue;
        m.userData.stempel = stempel; out.push(m);
      }
    }
  }
  return out;
}

/**
 * Alle Quader entlang eines Strahls – die Kandidatenliste für `intersectObjects`.
 *
 * Der Strahl läuft Zelle für Zelle über das Raster (klassisches Voxel-Laufen),
 * nicht in festen Schritten: ein Schrittmaß müsste kleiner sein als die Zelle,
 * sonst springt der Strahl über Ecken hinweg und schießt durch Wände.
 */
export function amStrahl(world, origin, dir, dist, out = _strahl) {
  out.length = 0;
  if (!world.raster) { for (const m of world.colliders) out.push(m); return out; }
  stempel++;
  const x0 = origin.x, z0 = origin.z;
  const x1 = x0 + dir.x * dist, z1 = z0 + dir.z * dist;
  let i = Math.floor(x0 / KRASTER), j = Math.floor(z0 / KRASTER);
  const iZ = Math.floor(x1 / KRASTER), jZ = Math.floor(z1 / KRASTER);
  const dx = x1 - x0, dz = z1 - z0;
  const si = Math.sign(dx), sj = Math.sign(dz);
  let tx = si ? ((i + (si > 0 ? 1 : 0)) * KRASTER - x0) / dx : Infinity;
  let tz = sj ? ((j + (sj > 0 ? 1 : 0)) * KRASTER - z0) / dz : Infinity;
  const dtx = si ? KRASTER / Math.abs(dx) : Infinity;
  const dtz = sj ? KRASTER / Math.abs(dz) : Infinity;
  for (let schutz = 0; schutz < 200; schutz++) {
    const a = world.raster.get(schluessel(i, j));
    if (a) for (const m of a) {
      if (m.userData.stempel === stempel) continue;
      m.userData.stempel = stempel; out.push(m);
    }
    if (i === iZ && j === jZ) break;
    if (tx < tz) { i += si; tx += dtx; } else { j += sj; tz += dtz; }
  }
  return out;
}

/**
 * Höhe des Bodens unter einer Position. Berücksichtigt nur Flächen, die
 * höchstens `maxY` hoch liegen – dadurch zieht ein Dach über dem Kopf nicht nach oben.
 */
export function groundHeightAt(pos, radius, world, maxY) {
  // Unter allem liegt das Gelände. Vorher begann diese Suche bei null – auf
  // einer Terrasse auf 17 m wäre das ein Sturz ins Bodenlose.
  let h = hoeheBei(pos.x, pos.z);
  for (const m of inBereich(world, pos.x - radius, pos.z - radius, pos.x + radius, pos.z + radius)) {
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
export function resolveCollisions(pos, radius, world, { stepUp = STEP_UP, height = 1.8, von = null } = {}) {
  // Die Grenze ist je Achse eigen: das Tal ist dreimal so lang wie breit, und
  // ein quadratischer Ausschnitt läge zur Hälfte in der Böschung.
  const b = world.grenze ?? world.zonen.ganz;
  pos.x = Math.min(b.x, Math.max(-b.x, pos.x));
  pos.z = Math.min(b.z, Math.max(-b.z, pos.z));
  // Steile Böschungen sind Wand, nicht Rampe: wer bergauf in eine Neigung über
  // `NEIGUNG_MAX` läuft, bleibt stehen. Ohne diese Regel liefe man jede Terrasse
  // gerade hinauf, und die Höhe im Gelände wäre bedeutungslos.
  if (von && neigungBei(pos.x, pos.z) > NEIGUNG_MAX
    && hoeheBei(pos.x, pos.z) > hoeheBei(von.x, von.z) + 0.02) {
    pos.x = von.x; pos.z = von.z;
  }
  for (const m of inBereich(world, pos.x - radius, pos.z - radius, pos.x + radius, pos.z + radius)) {
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
