import * as THREE from 'three';

export const WEAPONS = {
  shotgun: { name: 'Donnerbüchse', damage: 14, pellets: 7, spread: 0.09, cooldown: 0.9, mag: 6, reload: 1.8, range: 22, auto: false },
  smg:     { name: 'Nähmaschine', damage: 9,  pellets: 1, spread: 0.035, cooldown: 0.08, mag: 32, reload: 1.4, range: 45, auto: true },
  rifle:   { name: 'Langfinger',  damage: 70, pellets: 1, spread: 0.002, cooldown: 1.3, mag: 5, reload: 2.2, range: 120, auto: false },
};

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
   * Feuert Hitscan-Strahlen. targets = Array von {mesh, onHit(dmg)}.
   * Gibt Array von Trefferpunkten (Vector3) zurück, für Effekte.
   * `hitCount` steht danach auf der Zahl der getroffenen Figuren – daran hängt
   * der Trefferton, ohne dass der Aufrufer die Strahlen noch einmal prüfen muss.
   */
  fire(origin, dir, targets, world, damageMul = 1) {
    if (!this.canFire()) return null;
    this.ammo--; this.cool = this.def.cooldown; this.hitCount = 0;
    const hits = [];
    const ray = new THREE.Raycaster();
    ray.far = this.def.range;
    const meshes = targets.map(t => t.mesh);
    for (let i = 0; i < this.def.pellets; i++) {
      const d = dir.clone();
      d.x += (Math.random() - 0.5) * this.def.spread * 2;
      d.y += (Math.random() - 0.5) * this.def.spread * 2;
      d.z += (Math.random() - 0.5) * this.def.spread * 2;
      d.normalize();
      ray.set(origin, d);
      const wall = ray.intersectObjects(world.colliders, false)[0];
      const hit = ray.intersectObjects(meshes, true)[0];
      if (hit && (!wall || hit.distance < wall.distance)) {
        let o = hit.object; while (o && !o.userData.target) o = o.parent;
        const falloff = Math.max(0.35, 1 - hit.distance / this.def.range);
        if (o) { o.userData.target.onHit(this.def.damage * falloff * damageMul); this.hitCount++; }
        hits.push(hit.point);
      } else if (wall) hits.push(wall.point);
      else hits.push(origin.clone().addScaledVector(d, this.def.range));
    }
    if (this.ammo === 0) this.reload();
    return hits;
  }
}
