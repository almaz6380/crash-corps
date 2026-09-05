import * as THREE from 'three';
import { resolveCollisions } from './world.js';
import { Weapon } from './weapons.js';
import { SPECIALS } from './classes.js';
import { buildViewmodel } from './characters.js';

const EYE = 1.6, GRAVITY = 22, JUMP = 8;

export class Player {
  constructor(camera, cls, world) {
    this.camera = camera; this.cls = cls; this.world = world;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; this.grounded = true;
    this.hp = cls.hp; this.dead = false; this.respawnIn = 0;
    this.weapon = new Weapon(cls.weapon);
    this.special = { def: SPECIALS[cls.special], cool: 0, active: 0 };
    this.keys = {}; this.firing = false; this.baseFov = camera.fov;
    this.viewmodel = buildViewmodel(cls); camera.add(this.viewmodel);
    this.kick = 0;
    this.kills = 0; this.deaths = 0;
    this._bind();
  }
  _bind() {
    addEventListener('keydown', e => { this.keys[e.code] = true; if (e.code === 'KeyR') this.weapon.reload(); if (e.code === 'KeyQ') this.useSpecial(); });
    addEventListener('keyup', e => { this.keys[e.code] = false; });
    addEventListener('mousemove', e => {
      if (document.pointerLockElement !== this.camera.userData.canvas) return;
      this.yaw -= e.movementX * 0.0022; this.pitch -= e.movementY * 0.0022;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    });
    addEventListener('mousedown', e => { if (e.button === 0) this.firing = true; });
    addEventListener('mouseup', e => { if (e.button === 0) this.firing = false; });
  }
  spawn(at) { this.pos.copy(at); this.pos.y = 0; this.vel.set(0, 0, 0); this.hp = this.cls.hp; this.dead = false; this.weapon = new Weapon(this.cls.weapon); }
  useSpecial() { if (this.special.cool > 0 || this.dead) return; this.special.active = this.special.def.duration; this.special.cool = this.special.def.cooldown; }
  onHit(dmg) { if (this.dead) return; this.hp -= dmg; this.flash = 0.25; if (this.hp <= 0) { this.hp = 0; this.dead = true; this.deaths++; this.respawnIn = 3; } }

  get forward() { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  get aim() { return new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)); }
  get eye() { return this.pos.clone().setY(this.pos.y + EYE); }

  update(dt, targets, fx) {
    this.weapon.update(dt);
    this.special.cool = Math.max(0, this.special.cool - dt);
    this.special.active = Math.max(0, this.special.active - dt);
    this.flash = Math.max(0, (this.flash || 0) - dt);
    if (this.dead) { this.respawnIn -= dt; return; }

    // Bewegung
    const f = this.forward, r = new THREE.Vector3(-f.z, 0, f.x);
    const move = new THREE.Vector3();
    if (this.keys.KeyW) move.add(f); if (this.keys.KeyS) move.sub(f);
    if (this.keys.KeyD) move.add(r); if (this.keys.KeyA) move.sub(r);
    let speed = this.cls.speed * (this.keys.ShiftLeft ? 1.35 : 1);
    const sp = this.special;
    if (sp.active > 0 && sp.def.speedMul) { speed *= sp.def.speedMul; if (move.lengthSq() === 0) move.copy(f); }
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(speed);
    this.vel.x = move.x; this.vel.z = move.z;
    if (this.keys.Space && this.grounded) { this.vel.y = JUMP; this.grounded = false; }
    this.vel.y -= GRAVITY * dt;
    this.pos.addScaledVector(this.vel, dt);
    if (this.pos.y <= 0) { this.pos.y = 0; this.vel.y = 0; this.grounded = true; }
    resolveCollisions(this.pos, 0.45, this.world);

    // Kamera
    this.camera.position.copy(this.eye);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    const zoom = sp.active > 0 && sp.def.fovZoom ? sp.def.fovZoom : 1;
    this.camera.fov += (this.baseFov * zoom - this.camera.fov) * Math.min(1, dt * 10);
    this.camera.updateProjectionMatrix();
    this.kick = Math.max(0, this.kick - dt * 6);
    this.viewmodel.position.z = -0.7 + this.kick * 0.15;
    this.viewmodel.rotation.x = this.kick * 0.5;
    const bob = move.lengthSq() > 0 && this.grounded ? Math.sin(performance.now() / 90) * 0.015 : 0;
    this.viewmodel.position.y = -0.32 + bob;

    // Feuern
    if (this.firing) {
      const dmgMul = sp.active > 0 && sp.def.damageMul ? sp.def.damageMul : 1;
      const hits = this.weapon.fire(this.eye, this.aim, targets, this.world, dmgMul);
      if (hits) { this.kick = 1; fx.tracers(this.eye, hits, this.cls.accent); }
      if (!this.weapon.def.auto) this.firing = false;
    }
  }
}
