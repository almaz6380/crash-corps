import * as THREE from 'three';
import { cloneWeaponMesh, CHARACTER_MODELS } from './assets.js';

/**
 * Waffen und Ausrüstung. Die Figuren kommen als Modelle aus public/assets/,
 * die Waffen baut der Code – dadurch bleibt pro Klasse eine eigene Silhouette,
 * ohne für jede Waffe ein Asset zu brauchen.
 */

const toon = (c) => new THREE.MeshToonMaterial({ color: c });

/** Box mit runden Kanten. */
export function roundedBox(w, h, d, r = 0.05) {
  r = Math.min(r, w / 2 - 0.005, h / 2 - 0.005);
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const bev = Math.min(0.025, d / 3);
  const g = new THREE.ExtrudeGeometry(s, {
    depth: d - bev * 2, bevelEnabled: true, bevelThickness: bev, bevelSize: bev,
    bevelSegments: 1, curveSegments: 2,
  });
  g.translate(0, 0, -(d - bev * 2) / 2);
  return g;
}

/**
 * Waffe der Klasse. Lauf zeigt nach +z, Griff sitzt im Ursprung –
 * so lässt sie sich direkt an einen Hand-Knochen hängen.
 *
 * `kind` ist der Spielwert aus `classes.js` (`shotgun`, `smg`, `rifle`) und
 * bestimmt normalerweise auch das Aussehen. `form` trennt beides: eine Klasse
 * kann mit den Werten einer Schrotflinte spielen und trotzdem eine Axt tragen.
 */
export function buildWeapon(kind, accent, form = kind) {
  const g = new THREE.Group();
  const dark = toon(0x46403a), acc = toon(accent), metal = toon(0x9aa2ae);
  const add = (geo, mat, x, y, z, rx = 0) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx;
    m.castShadow = true; g.add(m); return m;
  };
  const tube = (r, len) => new THREE.CylinderGeometry(r, r, len, 10);

  if (form === 'axt') {
    // Stiel entlang +z, Blatt vorn quer dazu – dieselbe Konvention wie beim
    // Lauf einer Schusswaffe, damit Rückstoß und Mündungsfeuer weiter passen.
    const holz = toon(0x6b4526), eisen = toon(0x6d7683);
    add(tube(0.034, 0.74), holz, 0, 0, 0.16, Math.PI / 2);                  // Stiel
    add(roundedBox(0.06, 0.06, 0.09, 0.02), acc, 0, 0, -0.14);              // Wicklung
    add(roundedBox(0.07, 0.07, 0.09, 0.02), acc, 0, 0, 0.36);               // Bund
    const blatt = add(roundedBox(0.035, 0.38, 0.3, 0.04), eisen, 0, 0.04, 0.5);
    blatt.rotation.y = 0.1;
    const bart = add(roundedBox(0.03, 0.22, 0.17, 0.03), eisen, 0, -0.17, 0.45);
    bart.rotation.y = 0.1;
    add(tube(0.03, 0.1), eisen, 0, 0.26, 0.56, Math.PI / 2);                // Dorn
  } else if (form === 'armbrust') {
    // Schaft entlang +z, Bogen quer vorn. Die Sehne ist ein flaches Dreieck –
    // eine echte Linie würde im Cel-Stil ohne Umriss verschwinden.
    const holz = toon(0x7a4f2a), eisen = toon(0x8a939f);
    add(roundedBox(0.07, 0.08, 0.52, 0.025), holz, 0, 0, 0.1);              // Schaft
    add(roundedBox(0.06, 0.13, 0.08, 0.02), holz, 0, -0.08, -0.08);         // Griff
    const bogenL = add(roundedBox(0.26, 0.045, 0.05, 0.02), eisen, -0.15, 0.03, 0.3);
    const bogenR = add(roundedBox(0.26, 0.045, 0.05, 0.02), eisen, 0.15, 0.03, 0.3);
    bogenL.rotation.z = 0.22; bogenR.rotation.z = -0.22;
    add(roundedBox(0.58, 0.012, 0.012, 0.004), acc, 0, 0.03, 0.14);         // Sehne
    add(roundedBox(0.05, 0.05, 0.16, 0.02), acc, 0, 0.06, 0.24);            // Nuss
    add(tube(0.012, 0.34), toon(0x5c4632), 0, 0.07, 0.3, Math.PI / 2);      // Bolzen
  } else if (form === 'stab') {
    // Langer Schaft, Kristall vorn. Der Kristall ist selbstleuchtend, damit er
    // im Schatten der Arena nicht abstirbt – Zauber sollen glühen.
    const holz = toon(0x6a4a2e);
    const kristall = new THREE.MeshToonMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.6 });
    add(tube(0.03, 0.92), holz, 0, 0, 0.22, Math.PI / 2);                   // Schaft
    add(roundedBox(0.07, 0.07, 0.1, 0.025), acc, 0, 0, -0.16);              // Knauf
    add(roundedBox(0.075, 0.075, 0.1, 0.03), acc, 0, 0, 0.5);               // Fassung
    const stein = add(new THREE.OctahedronGeometry(0.1), kristall, 0, 0.02, 0.62);
    stein.rotation.set(0.3, 0.4, 0);
    const ring = add(new THREE.TorusGeometry(0.14, 0.014, 6, 12), acc, 0, 0.02, 0.6);
    ring.rotation.y = Math.PI / 2;
  } else if (kind === 'shotgun') {
    add(roundedBox(0.12, 0.14, 0.58, 0.04), dark, 0, 0, 0.14);
    add(tube(0.042, 0.5), metal, 0, 0.05, 0.4, Math.PI / 2);
    add(roundedBox(0.1, 0.09, 0.22, 0.03), acc, 0, -0.05, 0.32);           // Pumpe
    add(roundedBox(0.1, 0.19, 0.26, 0.05), dark, 0, -0.07, -0.16);         // Schaft
    add(roundedBox(0.07, 0.14, 0.07, 0.02), dark, 0, -0.12, -0.02);        // Griff
  } else if (kind === 'smg') {
    add(roundedBox(0.1, 0.13, 0.4, 0.04), dark, 0, 0, 0.09);
    add(tube(0.028, 0.28), metal, 0, 0.03, 0.34, Math.PI / 2);
    add(roundedBox(0.06, 0.22, 0.09, 0.03), acc, 0, -0.16, 0.05);          // Magazin
    add(roundedBox(0.07, 0.14, 0.07, 0.02), dark, 0, -0.1, -0.09);         // Griff
    add(roundedBox(0.05, 0.05, 0.16, 0.02), acc, 0, 0.09, 0.12);           // Visier
  } else {
    add(roundedBox(0.09, 0.11, 0.66, 0.03), dark, 0, 0, 0.16);
    add(tube(0.026, 0.62), metal, 0, 0.02, 0.58, Math.PI / 2);
    add(tube(0.048, 0.28), acc, 0, 0.12, 0.22, Math.PI / 2);               // Zielfernrohr
    add(roundedBox(0.085, 0.19, 0.32, 0.05), dark, 0, -0.06, -0.22);       // Schaft
    add(roundedBox(0.06, 0.13, 0.06, 0.02), dark, 0, -0.12, 0.0);          // Griff
  }
  // Mündungspunkt für Effekte
  const muzzle = new THREE.Object3D();
  const z = { axt: 0.56, armbrust: 0.52, stab: 0.72, rifle: 0.9, smg: 0.48 }[form] ?? 0.66;
  muzzle.position.set(0, form === 'rifle' ? 0.02 : 0.05, z);
  g.add(muzzle); g.userData.muzzle = muzzle;
  return g;
}

/**
 * Ego-Waffe. Bringt das Modell der Klasse eigene Waffen-Meshes mit, wird das
 * passende geklont – so passt die Ego-Waffe zum Stil der Figuren. Sonst die
 * prozedurale Waffe.
 */
export function buildViewmodel(cls) {
  const g = new THREE.Group();
  const vm = CHARACTER_MODELS[cls.model]?.viewmodel;
  // Nennt das Manifest eine Form, wird immer prozedural gebaut. Nötig, wenn die
  // Waffe im Modell an die Knochen gewichtet ist statt angehängt: ein Klon davon
  // behält das Skelett der Vorlage, das nie mitläuft, und stünde in der Bindepose.
  const form = vm?.form || CHARACTER_MODELS[cls.model]?.waffenform;
  const builtin = form ? null : cloneWeaponMesh(cls.model, cls.weapon);
  const w = builtin || buildWeapon(cls.weapon, cls.accent, form || cls.weapon);
  // Im Ego-Bild darf die Waffe nicht in der dunkelsten Toon-Stufe verschwinden
  w.traverse(o => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) { if (m.color) m.color.lerp(new THREE.Color(0xffffff), 0.12); }
    o.castShadow = false;
  });
  if (builtin) {
    // Wie die Waffe im Modell liegt, ist von Paket zu Paket verschieden. Steht
    // im Manifest nichts, gilt die Lage des Toon-Kits: Lauf entlang -x,
    // Oberseite +z – erst aufrichten (z → y), dann den Lauf von der Kamera
    // weg drehen (-x → -z).
    if (vm) {
      w.rotation.fromArray(vm.rot || [0, 0, 0]);
      // Größe über die gewünschte Länge statt über einen Faktor: wie groß eine
      // Waffe im Modell gebaut ist, ist von Paket zu Paket verschieden, die
      // Länge im Ego-Bild ist dagegen immer dieselbe Handbreit.
      if (vm.laenge) {
        const d = new THREE.Box3().setFromObject(w).getSize(new THREE.Vector3());
        w.scale.multiplyScalar(vm.laenge / (Math.max(d.x, d.y, d.z) || 1));
      } else {
        w.scale.multiplyScalar(vm.scale ?? 0.42);
      }
      if (vm.pos) w.position.fromArray(vm.pos);
    } else {
      const roll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
      const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
      w.quaternion.multiplyQuaternions(yaw, roll);
      w.scale.multiplyScalar(0.42);
    }
  } else if (vm?.form) {
    // Prozedurale Waffe mit eigener Lage aus dem Manifest
    w.rotation.fromArray(vm.rot || [0, 0, 0]);
    if (vm.laenge) {
      const d = new THREE.Box3().setFromObject(w).getSize(new THREE.Vector3());
      w.scale.multiplyScalar(vm.laenge / (Math.max(d.x, d.y, d.z) || 1));
    } else w.scale.setScalar(vm.scale ?? 0.24);
    if (vm.pos) w.position.fromArray(vm.pos);
  } else {
    w.rotation.y = Math.PI;
    w.scale.setScalar(0.24);
    const glove = new THREE.MeshToonMaterial({ color: 0x6b5c4c });
    const hand = (x, y, z) => {
      const m = new THREE.Mesh(roundedBox(0.06, 0.07, 0.075, 0.02), glove);
      m.position.set(x, y, z); g.add(m);
    };
    hand(0, -0.06, 0.05);
    hand(-0.01, -0.04, -0.09);
  }
  g.add(w);
  g.position.set(0.3, -0.27, -0.6);
  g.rotation.set(0.02, -0.16, 0.03);   // leicht eingedreht, sonst sieht man nur den Schaft
  // Eigenes Nahlicht: die Waffe hängt an der Kamera und läge sonst je nach
  // Blickrichtung im Schatten der Sonne. Kurze Reichweite, damit die Arena
  // davon nichts abbekommt. Für prozedurale Waffen deutlich schwächer: ihre
  // Toon-Materialien haben keine Textur, die die Helligkeit bricht, und laufen
  // bei dieser Nähe sonst in die oberste Stufe – dann ist alles weiß.
  const lamp = new THREE.PointLight(0xfff0d8, builtin ? 2.2 : 1.0, 1.6, 2);
  lamp.position.set(0.15, 0.35, 0.3);
  g.add(lamp);
  g.userData.home = g.position.clone();
  return g;
}
