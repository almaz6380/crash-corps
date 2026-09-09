import * as THREE from 'three';
import { resolveCollisions, groundHeightAt, STEP_UP } from './world.js';
import { Weapon } from './weapons.js';
import { SPECIALS } from './classes.js';
import { buildViewmodel } from './characters.js';
import { ViewmodelAnimator } from './animation.js';
import { AIM_ASSIST } from './device.js';
import { bestTarget, pullToward, ASSIST } from './aimassist.js';

const EYE = 1.6, GRAVITY = 22, JUMP = 8;

export class Player {
  constructor(camera, cls, world, scene, input, sound) {
    this.camera = camera; this.cls = cls; this.world = world; this.scene = scene;
    this.input = input; this.sound = sound;
    this.team = 0;                     // der Spieler steht immer in Mannschaft 0
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; this.grounded = true;
    this.hp = cls.hp; this.dead = false; this.respawnIn = 0;
    this.weapon = new Weapon(cls.weapon);
    this.special = { def: SPECIALS[cls.special], cool: 0, active: 0 };
    this.baseFov = camera.fov;
    this.viewmodel = buildViewmodel(cls); camera.add(this.viewmodel);
    this.vmAnim = new ViewmodelAnimator(this.viewmodel);
    // Unsichtbarer Trefferkörper – ohne ihn können die Bots den Spieler nicht anvisieren.
    this.mesh = new THREE.Mesh(
      new THREE.BoxGeometry(cls.body.width, cls.body.height, cls.body.width * 0.6),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    this.mesh.userData.target = this;
    scene.add(this.mesh);
    this.kills = 0; this.deaths = 0;
    this.schrittWeg = 0;      // gelaufene Strecke seit dem letzten Schritt
    this.warLaden = false;    // für die Flanke am Ende des Nachladens
  }
  /** Abräumen beim Klassenwechsel: Viewmodel und Trefferkörper lösen. */
  dispose() {
    this.camera.remove(this.viewmodel);
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose(); this.mesh.material.dispose();
  }
  spawn(at) {
    this.pos.copy(at); this.pos.y = 0; this.vel.set(0, 0, 0);
    this.hp = this.cls.hp; this.dead = false; this.weapon = new Weapon(this.cls.weapon);
    this.warLaden = false; this.schrittWeg = 0;
  }
  useSpecial() {
    if (this.special.cool > 0 || this.dead) return;
    this.special.active = this.special.def.duration; this.special.cool = this.special.def.cooldown;
    this.sound?.spezial(this.cls.special);
  }
  onHit(dmg) {
    if (this.dead) return;
    this.hp -= dmg; this.flash = 0.25;
    if (this.hp <= 0) { this.hp = 0; this.dead = true; this.deaths++; this.respawnIn = 3; this.sound?.tod(); }
    else this.sound?.schmerz();
  }

  get forward() { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  get aim() { return new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)); }
  get eye() { return this.pos.clone().setY(this.pos.y + EYE); }

  update(dt, targets, fx) {
    const inp = this.input;
    // Umsehen: Maus liefert Pixel pro Bewegung, Touch die Zugstrecke
    let [lx, ly] = inp.takeLook();
    const sens = inp.touch ? 0.0042 : 0.0022;
    // Zielhilfe: bremst das Wischen nahe am Gegner und führt danach nach
    const aimed = AIM_ASSIST && !this.dead ? bestTarget(this, targets, this.world) : null;
    if (aimed) { const s = 1 - ASSIST.friction * aimed.weight; lx *= s; ly *= s; }
    // Gyroskop kommt schon als Winkel und wird von der Zielhilfe genauso gebremst
    let [gx, gy] = inp.takeGyro();
    if (aimed) { const s = 1 - ASSIST.friction * aimed.weight; gx *= s; gy *= s; }
    this.yaw -= lx * sens; this.pitch -= ly * sens;
    this.yaw += gx; this.pitch += gy;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    if (aimed) {
      // Nur nachführen, solange der Spieler selbst wischt, dreht oder läuft
      const activity = Math.min(1,
        (Math.hypot(lx, ly) / 6) + (Math.hypot(gx, gy) * 12) + Math.hypot(inp.moveX, inp.moveY));
      pullToward(this, aimed, dt, activity);
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    }
    if (inp.takeReload()) this.weapon.reload();
    if (inp.takeSpecial()) this.useSpecial();

    this.weapon.update(dt);
    // Flanke: Magazin sitzt. Gilt auch fürs selbsttätige Nachladen bei 0 Schuss.
    const laedt = this.weapon.reloading > 0;
    if (this.warLaden && !laedt) this.sound?.nachladen(true);
    else if (!this.warLaden && laedt) this.sound?.nachladen();
    this.warLaden = laedt;
    this.special.cool = Math.max(0, this.special.cool - dt);
    this.special.active = Math.max(0, this.special.active - dt);
    this.flash = Math.max(0, (this.flash || 0) - dt);
    if (this.dead) { this.respawnIn -= dt; return; }

    // Bewegung
    const f = this.forward, r = new THREE.Vector3(-f.z, 0, f.x);
    const move = new THREE.Vector3()
      .addScaledVector(f, inp.moveY)
      .addScaledVector(r, inp.moveX);
    if (move.lengthSq() > 1) move.normalize();
    let speed = this.cls.speed * (inp.sprint ? 1.35 : 1);
    const sp = this.special;
    if (sp.active > 0 && sp.def.speedMul) { speed *= sp.def.speedMul; if (move.lengthSq() === 0) move.copy(f); }
    const moving = move.lengthSq() > 0;
    if (moving) move.normalize().multiplyScalar(speed);
    this.vel.x = move.x; this.vel.z = move.z;
    if (inp.jump && this.grounded) { this.vel.y = JUMP; this.grounded = false; }
    this.vel.y -= GRAVITY * dt;
    this.pos.addScaledVector(this.vel, dt);
    resolveCollisions(this.pos, 0.45, this.world, { height: this.cls.body.height });
    // Boden unter den Füßen: Rampenstufen und Plattformdächer zählen mit
    const support = groundHeightAt(this.pos, 0.32, this.world, this.pos.y + STEP_UP);
    const fallTempo = this.vel.y;
    if (this.pos.y <= support) {
      this.pos.y = support; this.vel.y = 0;
      if (!this.grounded && fallTempo < -5) this.sound?.landung(Math.min(1, -fallTempo / 16));
      this.grounded = true;
    } else this.grounded = false;
    // Schritte: nach je gut zwei Metern einer, schneller beim Sprinten
    if (this.grounded && moving) {
      this.schrittWeg += Math.hypot(this.vel.x, this.vel.z) * dt;
      if (this.schrittWeg > 2.1) { this.schrittWeg = 0; this.sound?.schritt(null, inp.sprint); }
    } else this.schrittWeg = 1.6;   // beim Loslaufen kommt der erste Schritt früh
    this.mesh.position.set(this.pos.x, this.pos.y + this.cls.body.height / 2, this.pos.z);

    // Kamera
    this.camera.position.copy(this.eye);
    // Dash: Kamera kippt kurz zur Seite, sonst fühlt sich der Sprint nach nichts an
    const dashTilt = sp.active > 0 && sp.def.speedMul ? -Math.sign(inp.moveX) * 0.09 * (sp.active / sp.def.duration) : 0;
    this.camera.rotation.set(this.pitch, this.yaw, dashTilt, 'YXZ');
    const zoom = sp.active > 0 && sp.def.fovZoom ? sp.def.fovZoom : 1;
    this.camera.fov += (this.baseFov * zoom - this.camera.fov) * Math.min(1, dt * 10);
    this.camera.updateProjectionMatrix();

    // Feuern
    if (inp.fire) {
      const dmgMul = sp.active > 0 && sp.def.damageMul ? sp.def.damageMul : 1;
      const hits = this.weapon.fire(this.eye, this.aim, targets, this.world, dmgMul);
      if (hits) {
        this.vmAnim.fire(); fx.tracers(this.eye, hits, this.cls.accent);
        this.sound?.schuss(this.cls.weapon);
        if (this.weapon.hitCount > 0) this.sound?.treffer();
      }
      if (!this.weapon.def.auto) inp.fireHeld = false;   // Einzelschuss: Taste muss neu gedrückt werden
    }

    // Waffenanimation
    const w = this.weapon;
    this.vmAnim.update(dt, {
      moving, speed, grounded: this.grounded, yaw: this.yaw, pitch: this.pitch,
      reload: w.reloading > 0 ? 1 - w.reloading / w.def.reload : 0,
    });
  }
}
