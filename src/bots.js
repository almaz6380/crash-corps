import * as THREE from 'three';
import { CLASSES } from './classes.js';
import { Weapon } from './weapons.js';
import { buildCharacter } from './characters.js';
import { CharacterAnimator } from './animation.js';
import { resolveCollisions } from './world.js';

const NAMES = ['Brösel', 'Knacki', 'Zündel', 'Rumpel', 'Fiete', 'Gustl', 'Wuschel', 'Pumpf'];
let nameIdx = 0;

/** Bot: patrol → chase → shoot. Sieht den Spieler nur mit Sichtlinie. */
export class Bot {
  constructor(scene, world, clsId) {
    this.cls = CLASSES[clsId]; this.world = world; this.scene = scene;
    this.name = NAMES[nameIdx++ % NAMES.length];
    this.mesh = buildCharacter(this.cls); this.mesh.userData.target = this;
    this.anim = new CharacterAnimator(this.mesh);
    scene.add(this.mesh);
    this.pos = this.mesh.position;
    this.hp = this.cls.hp; this.dead = false; this.respawnIn = 0;
    this.weapon = new Weapon(this.cls.weapon);
    this.target = null; this.wander = new THREE.Vector3();
    this.retarget = 0; this.reaction = 0; this.kills = 0;
    this.ray = new THREE.Raycaster();
  }
  spawn(at) {
    this.pos.copy(at); this.hp = this.cls.hp; this.dead = false; this.mesh.visible = true;
    this.weapon = new Weapon(this.cls.weapon); this.retarget = 0; this.reaction = 0;
    this.anim.reset();
  }
  onHit(dmg) {
    if (this.dead) return;
    this.hp -= dmg; this.anim.hit();
    if (this.hp <= 0) {
      this.hp = 0; this.dead = true; this.respawnIn = 4;
      this.anim.die(); // Leiche bleibt sichtbar, bis sie umgefallen ist
      this.onDeath?.();
    }
  }
  get eye() { return this.pos.clone().setY(this.pos.y + this.cls.body.height * 0.9); }

  /** Figur aus der Szene nehmen und ihre geklonten Materialien freigeben. */
  dispose() {
    this.scene.remove(this.mesh);
    for (const m of this.mesh.userData.rig.inst.materials) m.dispose();
  }

  canSee(p) {
    const from = this.eye, to = p.eye, dir = to.clone().sub(from), dist = dir.length();
    if (dist > this.weapon.def.range) return false;
    this.ray.set(from, dir.normalize()); this.ray.far = dist;
    return this.ray.intersectObjects(this.world.colliders, false).length === 0;
  }

  update(dt, player, others, fx) {
    this.weapon.update(dt);
    if (this.dead) {
      // Leiche bleibt bis zum Respawn liegen
      this.respawnIn -= dt;
      this.anim.update(dt);
      return;
    }

    const sees = !player.dead && this.canSee(player);
    this.retarget -= dt;
    if (sees) {
      this.target = player; this.reaction = Math.min(1, this.reaction + dt * 2.5);
    } else { this.reaction = Math.max(0, this.reaction - dt); if (this.retarget <= 0) { this.wander.set((Math.random() - 0.5) * 50, 0, (Math.random() - 0.5) * 50); this.retarget = 3 + Math.random() * 3; } }

    // Bewegung
    const dst = sees ? player.pos : this.wander;
    const dir = dst.clone().sub(this.pos).setY(0);
    const dist = dir.length();
    const ideal = { shotgun: 4, smg: 9, rifle: 22 }[this.cls.weapon];
    let mv = new THREE.Vector3();
    if (sees) {
      if (dist > ideal + 2) mv.copy(dir).normalize();
      else if (dist < ideal - 2) mv.copy(dir).normalize().negate();
      // seitliches Ausweichen
      mv.addScaledVector(new THREE.Vector3(-dir.z, 0, dir.x).normalize(), Math.sin(performance.now() / 700 + this.pos.x) * 0.6);
    } else if (dist > 1.5) mv.copy(dir).normalize();
    const speed = this.cls.speed * 0.8;
    const walking = mv.lengthSq() > 0;
    if (walking) this.pos.addScaledVector(mv.normalize(), speed * dt);
    resolveCollisions(this.pos, 0.5, this.world);
    // Bots untereinander leicht auseinanderdrücken
    for (const o of others) if (o !== this && !o.dead) {
      const d = this.pos.clone().sub(o.pos).setY(0); const l = d.length();
      if (l < 1.4 && l > 0) this.pos.addScaledVector(d.normalize(), (1.4 - l) * 0.5);
    }
    // Blickrichtung: weich drehen statt umschnappen
    const look = sees ? player.pos : this.pos.clone().add(mv);
    if (walking || sees) {
      const want = Math.atan2(look.x - this.pos.x, look.z - this.pos.z);
      let d = want - this.mesh.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));                 // kürzester Weg
      this.mesh.rotation.y += d * Math.min(1, dt * (sees ? 12 : 7));
    }
    // Bewegungsrichtung relativ zur Blickrichtung (für Seitwärts-/Rückwärtslaufen)
    const yaw = this.mesh.rotation.y;
    const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
    const advance = walking ? mv.dot(fwd) : 0;
    const strafe = walking ? mv.dot(right) : 0;

    // Schießen mit Reaktionszeit + Streuung
    const aiming = sees && this.reaction > 0.35;
    if (sees && this.reaction > 0.6 && this.weapon.canFire()) {
      const aim = player.eye.clone().sub(this.eye);
      aim.x += (Math.random() - 0.5) * 0.6; aim.y += (Math.random() - 0.5) * 0.4; aim.z += (Math.random() - 0.5) * 0.6;
      const hits = this.weapon.fire(this.eye, aim.normalize(), [player], this.world);
      if (hits) {
        this.anim.fire();
        fx.tracers(this.eye, hits, this.cls.accent);
        const rig = this.mesh.userData.rig;
        if (rig.muzzle) fx.flash(rig.muzzle.getWorldPosition(new THREE.Vector3()));
      }
    } else if (!sees && this.weapon.ammo < this.weapon.def.mag) this.weapon.reload();

    this.anim.update(dt, { moving: walking, speed, aiming, advance, strafe });
  }
}
