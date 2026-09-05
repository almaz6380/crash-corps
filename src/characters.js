import * as THREE from 'three';

const mat = (c) => new THREE.MeshToonMaterial({ color: c });

/**
 * Baut eine Low-Poly-Figur aus Grundkörpern mit animierbarem Rig.
 * Aufbau: root (Position/Blickrichtung) → frame (Hüpfen/Umfallen) → Beine + upper.
 * Root steht mit Füßen auf y=0, die Figur schaut nach +z (wie in bots.js gedreht).
 */
export function buildCharacter(cls) {
  const g = new THREE.Group();
  const { width: w, height: h, head } = cls.body;
  const legH = h * 0.42, torsoH = h * 0.38, armLen = torsoH * 0.9;
  const body = mat(cls.color), skin = mat(0xf2c9a0), dark = mat(0x3a2e2a), acc = mat(cls.accent);

  // frame trägt alles, was die Animation kippt/hebt – die Blickrichtung bleibt am root.
  const frame = new THREE.Group(); g.add(frame);

  // Beine: eigene Drehpunkte an der Hüfte, Mesh hängt nach unten
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(s * w * 0.22, legH, 0); frame.add(hip);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(w * 0.34, legH, w * 0.45), dark);
    leg.position.y = -legH / 2; hip.add(leg);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(w * 0.36, 0.14, w * 0.6), acc);
    foot.position.set(0, -legH + 0.07, w * 0.08); hip.add(foot);
    legs.push(hip);
  }

  // Oberkörper als eigene Gruppe (Drehpunkt Hüfte) – trägt Rumpf, Kopf, Arme
  const upper = new THREE.Group(); upper.position.y = legH; frame.add(upper);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(w, torsoH, w * 0.55), body);
  torso.position.y = torsoH / 2; upper.add(torso);

  const belt = new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, 0.12, w * 0.57), acc);
  belt.position.y = 0.06; upper.add(belt);

  const neck = new THREE.Group(); neck.position.y = torsoH + 0.05; upper.add(neck);
  const hd = new THREE.Mesh(new THREE.BoxGeometry(head, head, head), skin);
  hd.position.y = head / 2; neck.add(hd);
  const helmet = new THREE.Mesh(new THREE.BoxGeometry(head * 1.15, head * 0.45, head * 1.15), body);
  helmet.position.y = head * 0.9; neck.add(helmet);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(head * 0.9, head * 0.18, head * 0.1), dark);
  visor.position.set(0, head * 0.6, head * 0.5); neck.add(visor);

  // Arme: Drehpunkt an der Schulter, Mesh hängt nach unten
  const arms = [];
  for (const s of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(s * (w / 2 + w * 0.13), torsoH * 0.95, 0); upper.add(shoulder);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(w * 0.22, armLen, w * 0.22), body);
    arm.position.y = -armLen / 2; shoulder.add(arm);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(w * 0.24, 0.18, w * 0.24), skin);
    hand.position.y = -armLen - 0.09; shoulder.add(hand);
    arms.push(shoulder);
  }
  const [armL, armR] = arms;

  // Waffe hängt an der rechten Hand. Lauf liegt auf der Armachse: im Stand nach
  // unten, im Anschlag (Arm waagerecht) automatisch nach vorn (+z).
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.78), dark);
  gun.rotation.x = Math.PI / 2;
  gun.position.set(0, -armLen - 0.05, 0.06); armR.add(gun);
  const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.19, 0.12), acc);
  muzzle.position.z = 0.36; gun.add(muzzle);

  g.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
  g.userData.rig = {
    frame, upper, neck, legL: legs[0], legR: legs[1], armL, armR, gun,
    bodyMat: body, gunY: gun.position.y,
  };
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
  g.userData.home = g.position.clone();
  return g;
}
