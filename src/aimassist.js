import * as THREE from 'three';

/**
 * Zielhilfe für die Touch-Bedienung. Mit dem Daumen zu zielen ist deutlich
 * gröber als mit der Maus; ohne Hilfe sind die Bots im Vorteil.
 *
 * Zwei Wirkungen, beide nur innerhalb eines Kegels um die Blickrichtung:
 *  - Reibung: das Wischen wird langsamer, sobald ein Gegner nah am Fadenkreuz
 *    ist. Man rutscht nicht mehr über ihn hinweg.
 *  - Nachführen: das Fadenkreuz wandert langsam auf den Gegner zu – aber nur,
 *    während der Spieler selbst wischt oder läuft. Wer stillhält, bekommt keine
 *    Korrektur; sonst rastet das Fadenkreuz von allein ein und das wäre Auto-Aim.
 *
 * Greift nur bei freier Sichtlinie.
 */
export const ASSIST = {
  cone: 0.15,        // Halbwinkel des Kegels (rad), knapp 9 Grad
  friction: 0.6,     // wie stark das Wischen in der Kegelmitte gebremst wird
  pull: 0.9,         // maximale Nachführung in rad/s
  chest: 0.62,       // Zielpunkt auf Körperhöhe, nicht auf Augenhöhe
};

const _ray = new THREE.Raycaster();
const _dir = new THREE.Vector3();
const _pt = new THREE.Vector3();

/** Kürzester Winkel von a nach b, im Bereich -PI..PI. */
const shortest = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Bestes Ziel im Kegel um die Blickrichtung, mit Sichtlinie.
 * @returns {{yaw:number, pitch:number, weight:number}|null} weight 0..1,
 *   1 genau im Fadenkreuz, 0 am Kegelrand.
 */
export function bestTarget(player, targets, world) {
  const eye = player.eye, aim = player.aim;
  let best = null, bestAngle = ASSIST.cone;
  for (const t of targets) {
    if (!t || t.dead) continue;
    _pt.copy(t.pos); _pt.y += (t.cls?.body.height ?? 1.8) * ASSIST.chest;
    _dir.copy(_pt).sub(eye);
    const dist = _dir.length();
    if (dist < 0.5 || dist > player.weapon.def.range) continue;
    _dir.divideScalar(dist);
    const angle = Math.acos(Math.min(1, Math.max(-1, _dir.dot(aim))));
    if (angle >= bestAngle) continue;
    _ray.set(eye, _dir); _ray.far = dist - 0.4;
    if (_ray.intersectObjects(world.colliders, false).length) continue;   // Deckung dazwischen
    bestAngle = angle;
    best = {
      yaw: Math.atan2(-_dir.x, -_dir.z),
      pitch: Math.asin(Math.min(1, Math.max(-1, _dir.y))),
      weight: 1 - angle / ASSIST.cone,
    };
  }
  return best;
}

/**
 * Fadenkreuz träge auf das Ziel zuführen.
 * @param {number} activity 0..1 – wie sehr der Spieler gerade selbst steuert.
 *   Bei 0 passiert nichts, damit die Hilfe nicht von allein einrastet.
 */
export function pullToward(player, target, dt, activity) {
  if (activity <= 0.01) return;
  const step = ASSIST.pull * target.weight * Math.min(1, activity) * dt;
  const dy = shortest(target.yaw - player.yaw);
  const dp = target.pitch - player.pitch;
  player.yaw += Math.max(-step, Math.min(step, dy));
  player.pitch += Math.max(-step, Math.min(step, dp));
}
