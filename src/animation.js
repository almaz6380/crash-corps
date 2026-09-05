import * as THREE from 'three';

/**
 * Prozedurale Animation. Enthält nur Optik-Werte (Ausschläge, Zeiten) –
 * Gameplay-Werte bleiben in classes.js / weapons.js.
 */
const ANIM = {
  stepBase: 2.6,     // Schrittfrequenz im Stand-Gehen
  stepPerSpeed: 1.1, // zusätzliche Frequenz pro m/s
  legSwing: 0.8,     // max. Beinausschlag (rad)
  armSwing: 0.5,     // max. Armausschlag beim Laufen (rad)
  bounce: 0.07,      // Hüpfen des Körpers (m)
  gaitBlend: 9,      // wie schnell Lauf/Stand ineinander blenden
  aimBlend: 11,      // wie schnell in/aus dem Anschlag geblendet wird
  aimPitch: -Math.PI / 2 + 0.12, // Arm waagerecht nach vorn (+z)
  recoilDecay: 6.5,
  recoilArm: 0.45,
  deathTime: 0.9,
  hurtTime: 0.3,
};

const lerp = THREE.MathUtils.lerp;
const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

/**
 * Animiert eine mit buildCharacter() gebaute Figur.
 * Zustände: Laufen (Schrittzyklus), Anschlag + Rückstoß beim Schießen,
 * Treffer-Zucken und Umfallen beim Tod.
 */
export class CharacterAnimator {
  constructor(mesh) {
    this.rig = mesh.userData.rig;
    this.phase = Math.random() * Math.PI * 2; // versetzt, damit Bots nicht im Gleichschritt laufen
    this.t = Math.random() * 10;
    this.gait = 0; this.aim = 0; this.recoil = 0; this.hurt = 0;
    this.death = 0; this.fallDir = 1;
  }

  /** Schuss abgefeuert: Rückstoß + sofort in den Anschlag. */
  fire() { this.recoil = 1; this.aim = 1; }
  /** Treffer einstecken: kurzes Aufleuchten und Zucken. */
  hit() { this.hurt = 1; }
  /** Tod: Figur kippt nach vorn oder hinten um. */
  die() { if (this.death === 0) { this.death = 1e-4; this.fallDir = Math.random() < 0.5 ? 1 : -1; } }
  /** Sterbeanimation durchgelaufen – die Figur darf verschwinden. */
  get fallen() { return this.death >= 1; }

  /** Zurück auf Anfang (Respawn). */
  reset() {
    const r = this.rig;
    this.gait = this.aim = this.recoil = this.hurt = this.death = 0;
    r.frame.rotation.set(0, 0, 0); r.frame.position.set(0, 0, 0);
    r.upper.rotation.set(0, 0, 0); r.neck.rotation.set(0, 0, 0);
    r.legL.rotation.set(0, 0, 0); r.legR.rotation.set(0, 0, 0);
    r.armL.rotation.set(0, 0, 0); r.armR.rotation.set(0, 0, 0);
    r.gun.position.y = r.gunY;
    r.bodyMat.emissive?.setScalar(0);
  }

  /** @param {{speed?:number, moving?:boolean, aiming?:boolean}} state */
  update(dt, state = {}) {
    const r = this.rig;
    this.t += dt;
    this.recoil = Math.max(0, this.recoil - dt * ANIM.recoilDecay);
    this.hurt = Math.max(0, this.hurt - dt / ANIM.hurtTime);
    r.bodyMat.emissive?.setScalar(this.hurt * 0.45);

    if (this.death > 0) return this._death(dt);

    const speed = state.speed || 0;
    const target = state.moving ? Math.min(1, 0.4 + speed / 9) : 0;
    this.gait = damp(this.gait, target, ANIM.gaitBlend, dt);
    this.phase += dt * (ANIM.stepBase + speed * ANIM.stepPerSpeed) * (state.moving ? 1 : 0.35);
    this.aim = damp(this.aim, state.aiming ? 1 : 0, ANIM.aimBlend, dt);

    const sw = Math.sin(this.phase), g = this.gait;
    const breathe = Math.sin(this.t * 1.9) * 0.022 * (1 - g);

    // Beine: gegenläufiger Schrittzyklus
    r.legL.rotation.x = sw * ANIM.legSwing * g;
    r.legR.rotation.x = -sw * ANIM.legSwing * g;

    // Körper: Hüpfen, Vorlage, Schulter-Gegenrotation
    r.frame.position.y = Math.abs(sw) * ANIM.bounce * g;
    r.upper.rotation.x = 0.13 * g + breathe - this.recoil * 0.12 - this.hurt * 0.1;
    r.upper.rotation.y = -sw * 0.13 * g;
    r.upper.rotation.z = Math.cos(this.phase) * 0.05 * g;
    r.neck.rotation.x = -0.06 * g + this.recoil * 0.18;

    // Arme: Pendeln im Lauf, Anschlag beim Zielen, Rückstoß beim Schuss
    const swing = sw * ANIM.armSwing * g;
    const aimX = ANIM.aimPitch + this.recoil * ANIM.recoilArm;
    r.armR.rotation.x = lerp(-swing, aimX, this.aim);
    r.armR.rotation.z = lerp(0.09, -0.12, this.aim);
    r.armL.rotation.x = lerp(swing, aimX + 0.22, this.aim);
    r.armL.rotation.z = lerp(-0.09, 0.34, this.aim);
    r.gun.position.y = r.gunY + this.recoil * 0.12 * this.aim; // Rückstoß schiebt die Waffe zurück
  }

  _death(dt) {
    const r = this.rig;
    this.death = Math.min(1, this.death + dt / ANIM.deathTime);
    const e = 1 - Math.pow(1 - this.death, 3); // easeOutCubic
    r.frame.rotation.x = e * (Math.PI / 2) * this.fallDir;
    r.frame.position.y = -e * 0.12;
    // Gliedmaßen werden schlaff und legen sich zum Körper
    const limp = (o, x, z = 0) => {
      o.rotation.x = damp(o.rotation.x, x, 5, dt);
      o.rotation.y = damp(o.rotation.y, 0, 5, dt);
      o.rotation.z = damp(o.rotation.z, z, 5, dt);
    };
    limp(r.upper, -0.12 * this.fallDir);
    limp(r.neck, 0.25 * this.fallDir);
    limp(r.legL, 0.12); limp(r.legR, -0.18);
    limp(r.armL, -0.25, 0.3); limp(r.armR, -0.15, -0.3);
  }
}

/** Animiert die Ego-Waffe: Laufwippen, Maus-Nachlauf, Rückstoß, Nachladen. */
export class ViewmodelAnimator {
  constructor(vm) {
    this.vm = vm; this.home = vm.userData.home.clone();
    this.t = 0; this.kick = 0; this.sway = new THREE.Vector2();
    this.bobAmt = 0; this.lastYaw = 0; this.lastPitch = 0;
  }
  /** Schuss: Waffe schlägt nach hinten/oben aus. */
  fire() { this.kick = 1; }

  /**
   * @param {{moving:boolean, speed:number, grounded:boolean,
   *          yaw:number, pitch:number, reload:number}} state
   *        reload = 0..1 Fortschritt, 0 wenn nicht nachgeladen wird
   */
  update(dt, state) {
    const vm = this.vm;
    this.t += dt;
    this.kick = Math.max(0, this.kick - dt * 6);

    // Maus-Nachlauf: Waffe hinkt der Blickrichtung minimal hinterher
    const dYaw = state.yaw - this.lastYaw, dPitch = state.pitch - this.lastPitch;
    this.lastYaw = state.yaw; this.lastPitch = state.pitch;
    this.sway.x = damp(this.sway.x, THREE.MathUtils.clamp(dYaw * 4, -0.06, 0.06), 8, dt);
    this.sway.y = damp(this.sway.y, THREE.MathUtils.clamp(-dPitch * 4, -0.06, 0.06), 8, dt);

    // Laufwippen
    const want = state.moving && state.grounded ? Math.min(1, state.speed / 7) : 0;
    this.bobAmt = damp(this.bobAmt, want, 8, dt);
    const bobY = Math.abs(Math.sin(this.t * 9)) * 0.018 * this.bobAmt;
    const bobX = Math.sin(this.t * 4.5) * 0.02 * this.bobAmt;

    // Nachladen: Waffe kippt nach unten weg und kommt zurück
    const dip = state.reload > 0 ? Math.sin(state.reload * Math.PI) : 0;

    vm.position.set(
      this.home.x + this.sway.x + bobX,
      this.home.y + this.sway.y + bobY - dip * 0.3,
      this.home.z + this.kick * 0.15,
    );
    vm.rotation.set(this.kick * 0.5 + dip * 0.5, -this.sway.x * 3, dip * 0.7 + this.sway.x * 2);
  }
}
