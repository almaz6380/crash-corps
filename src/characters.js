import * as THREE from 'three';

const mat = (c) => new THREE.MeshToonMaterial({ color: c });

/** Baut eine Low-Poly-Figur aus Grundkörpern. Root steht mit Füßen auf y=0. */
export function buildCharacter(cls) {
  const g = new THREE.Group();
  const { width: w, height: h, head } = cls.body;
  const legH = h * 0.42, torsoH = h * 0.38;
  const body = mat(cls.color), skin = mat(0xf2c9a0), dark = mat(0x3a2e2a), acc = mat(cls.accent);

  const legs = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, legH, w * 0.45), dark);
  legs.position.y = legH / 2; g.add(legs);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(w, torsoH, w * 0.55), body);
  torso.position.y = legH + torsoH / 2; g.add(torso);

  const belt = new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, 0.12, w * 0.57), acc);
  belt.position.y = legH + 0.06; g.add(belt);

  const hd = new THREE.Mesh(new THREE.BoxGeometry(head, head, head), skin);
  hd.position.y = legH + torsoH + head / 2 + 0.05; g.add(hd);

  const helmet = new THREE.Mesh(new THREE.BoxGeometry(head * 1.15, head * 0.45, head * 1.15), body);
  helmet.position.y = hd.position.y + head * 0.4; g.add(helmet);

  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(w * 0.22, torsoH * 0.9, w * 0.22), body);
    arm.position.set(s * (w / 2 + w * 0.13), legH + torsoH * 0.5, 0); g.add(arm);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(w * 0.22, 0.18, w * 0.22), skin);
    hand.position.set(arm.position.x, legH + 0.1, 0); g.add(hand);
  }
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.9), dark);
  gun.position.set(w / 2 + w * 0.13, legH + 0.2, -0.45); g.add(gun);

  g.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
  g.userData.parts = { torso, hd, legs };
  return g;
}

/** Ego-Waffe (nur sichtbarer Lauf unten rechts im Bild). */
export function buildViewmodel(cls) {
  const g = new THREE.Group();
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.9), mat(0x3a2e2a));
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.14), mat(cls.accent));
  grip.position.set(0, -0.18, 0.25);
  g.add(barrel, grip);
  g.position.set(0.32, -0.32, -0.7);
  return g;
}
