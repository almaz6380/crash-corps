import * as THREE from 'three';

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
 */
export function buildWeapon(kind, accent) {
  const g = new THREE.Group();
  const dark = toon(0x46403a), acc = toon(accent), metal = toon(0x9aa2ae);
  const add = (geo, mat, x, y, z, rx = 0) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx;
    m.castShadow = true; g.add(m); return m;
  };
  const tube = (r, len) => new THREE.CylinderGeometry(r, r, len, 10);

  if (kind === 'shotgun') {
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
  muzzle.position.set(0, kind === 'rifle' ? 0.02 : 0.05, kind === 'rifle' ? 0.9 : kind === 'smg' ? 0.48 : 0.66);
  g.add(muzzle); g.userData.muzzle = muzzle;
  return g;
}

/** Ego-Waffe: dieselbe Waffe, nur für die Kamera gesetzt. */
export function buildViewmodel(cls) {
  const g = new THREE.Group();
  const w = buildWeapon(cls.weapon, cls.accent);
  // Im Ego-Bild darf die Waffe nicht in der dunkelsten Toon-Stufe verschwinden
  w.traverse(o => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    o.material.color.lerp(new THREE.Color(0xffffff), 0.35);
    o.castShadow = false;
  });
  w.rotation.y = Math.PI;            // Lauf nach -z, also weg von der Kamera
  w.scale.setScalar(0.24);
  g.add(w);
  // Handschuhe an der Waffe, damit sie nicht frei schwebt
  const glove = new THREE.MeshToonMaterial({ color: 0x6b5c4c });
  const hand = (x, y, z) => {
    const m = new THREE.Mesh(roundedBox(0.06, 0.07, 0.075, 0.02), glove);
    m.position.set(x, y, z); g.add(m);
  };
  hand(0, -0.06, 0.05);
  hand(-0.01, -0.04, -0.09);
  g.position.set(0.34, -0.3, -0.82);
  g.rotation.set(0.02, -0.16, 0.03);   // leicht eingedreht, sonst sieht man nur den Schaft
  // Eigenes Nahlicht: die Waffe hängt an der Kamera und läge sonst je nach
  // Blickrichtung im Schatten der Sonne. Kurze Reichweite, damit die Arena
  // davon nichts abbekommt.
  const lamp = new THREE.PointLight(0xfff0d8, 2.2, 1.6, 2);
  lamp.position.set(0.15, 0.35, 0.3);
  g.add(lamp);
  g.userData.home = g.position.clone();
  return g;
}
