import * as THREE from 'three';

/**
 * Die drei Waffen. `abfall` ist der Schadensabfall über die Entfernung: voller
 * Schaden bis `ab`, dann linear fallend bis `bis`, danach bleibt `rest`.
 *
 * Vorher galt eine Formel für alle (`1 - Entfernung / Reichweite`, mindestens
 * 0,35). Das traf genau die Falschen: die Schrotflinte trug damit noch auf
 * 15 m, und der Runenstab – eine Fernkampfwaffe – verlor, je weiter er schoss.
 * Jede Waffe hat jetzt ihre eigene Kurve, und die entscheidet, auf welcher
 * Entfernung welche Klasse gewinnt.
 */
export const WEAPONS = {
  shotgun: { name: 'Spalterklinge', damage: 11, pellets: 8, spread: 0.09, cooldown: 0.85, mag: 6, reload: 1.8, range: 26, auto: false,
    abfall: { ab: 4, bis: 16, rest: 0.25 }, kopfzone: false },
  smg:     { name: 'Bolzenwerfer', damage: 9,  pellets: 1, spread: 0.035, cooldown: 0.09, mag: 32, reload: 1.4, range: 45, auto: true,
    abfall: { ab: 12, bis: 30, rest: 0.4 } },
  rifle:   { name: 'Runenstab',    damage: 70, pellets: 1, spread: 0.002, cooldown: 1.3, mag: 5, reload: 2.2, range: 120, auto: false,
    abfall: null },
};

/** Schadensanteil einer Waffe auf eine Entfernung. */
export function abfallFaktor(def, entfernung) {
  const a = def.abfall;
  if (!a || entfernung <= a.ab) return 1;
  if (entfernung >= a.bis) return a.rest;
  return 1 - (1 - a.rest) * (entfernung - a.ab) / (a.bis - a.ab);
}

/**
 * Trefferzonen. Der Kopf zählt doppelt – für Bots wie für den Spieler, sonst
 * wäre es keine Regel, sondern ein Vorteil.
 *
 * `hoehe` ist der Anteil der Körperhöhe, ab dem der Kopf beginnt. Er kommt
 * nicht aus `body.head` allein: der Wert dort ist der Durchmesser des Kopfes,
 * und die Schulterpartie liegt darunter. Ein Streifschuss an der Schulter soll
 * kein Kopftreffer sein.
 */
export const TREFFERZONEN = { kopf: 2, hoehe: 0.86 };

/** Höchster Schadensfaktor aus Zone und Spezial zusammen. */
export const MAX_FAKTOR = 2.5;

/** Waffenzustand für eine Figur (Spieler oder Bot). */
export class Weapon {
  constructor(id) {
    this.def = WEAPONS[id];
    this.ammo = this.def.mag;
    this.cool = 0;
    this.reloading = 0;
    this.hitCount = 0;
  }
  update(dt) {
    this.cool = Math.max(0, this.cool - dt);
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) { this.ammo = this.def.mag; this.reloading = 0; }
    }
  }
  canFire() { return this.cool === 0 && this.reloading === 0 && this.ammo > 0; }
  reload() { if (this.reloading === 0 && this.ammo < this.def.mag) this.reloading = this.def.reload; }

  /**
   * Feuert Hitscan-Strahlen. targets = Array von {mesh, onHit(dmg, info)}.
   * Gibt Array von Trefferpunkten (Vector3) zurück, für Effekte.
   * `hitCount` steht danach auf der Zahl der getroffenen Figuren, `kopfCount`
   * auf der Zahl der Kopftreffer – daran hängt der Trefferton, ohne dass der
   * Aufrufer die Strahlen noch einmal prüfen muss.
   *
   * @param {object} [von] Schütze; wird an `onHit` weitergereicht, damit der
   *   Getroffene weiß, aus welcher Richtung es kam.
   */
  fire(origin, dir, targets, world, damageMul = 1, von = null) {
    if (!this.canFire()) return null;
    this.ammo--; this.cool = this.def.cooldown; this.hitCount = 0; this.kopfCount = 0;
    const hits = [];
    const ray = new THREE.Raycaster();
    ray.far = this.def.range;
    // Gezielt wird auf den Trefferquader, nicht auf die Figur – siehe bots.js
    const meshes = targets.map(t => t.trefferKoerper ?? t.mesh);
    for (let i = 0; i < this.def.pellets; i++) {
      const d = dir.clone();
      d.x += (Math.random() - 0.5) * this.def.spread * 2;
      d.y += (Math.random() - 0.5) * this.def.spread * 2;
      d.z += (Math.random() - 0.5) * this.def.spread * 2;
      d.normalize();
      ray.set(origin, d);
      const wall = ray.intersectObjects(world.colliders, false)[0];
      const hit = ray.intersectObjects(meshes, false)[0];
      if (hit && (!wall || hit.distance < wall.distance)) {
        let o = hit.object; while (o && !o.userData.target) o = o.parent;
        const falloff = abfallFaktor(this.def, hit.distance);
        if (o) {
          const ziel = o.userData.target;
          // Kopfzone: Höhe des Treffers über den Füßen der Figur. Der
          // Trefferpunkt kommt aus dem Strahl, eine zweite Abfrage braucht es
          // nicht – und ein eigener Kopf-Quader wäre ein Kollider mehr je Figur.
          const hoehe = ziel.cls?.body.height ?? 1.8;
          // Streuwaffen kennen keine Kopfzone: acht Schrotkugeln über einen
          // halben Meter verteilt treffen den Kopf von allein, das hat mit
          // Zielen nichts zu tun – und vergäbe nebenbei den Abschuss mit einem
          // einzigen Schuss, den es sonst nirgends gibt.
          const kopf = this.def.kopfzone !== false
            && hit.point.y - ziel.pos.y > hoehe * TREFFERZONEN.hoehe;
          const faktor = Math.min(MAX_FAKTOR, (kopf ? TREFFERZONEN.kopf : 1) * damageMul);
          ziel.onHit(this.def.damage * falloff * faktor, { kopf, von });
          this.hitCount++; if (kopf) this.kopfCount++;
        }
        hits.push(hit.point);
      } else if (wall) hits.push(wall.point);
      else hits.push(origin.clone().addScaledVector(d, this.def.range));
    }
    if (this.ammo === 0) this.reload();
    return hits;
  }
}
