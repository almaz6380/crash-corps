import * as THREE from 'three';

/**
 * Prozedurale Animation über den Modell-Clips. Die Clips liefern Stehen, Gehen
 * und Rennen; alles was ein Shooter sonst braucht – Anschlag, Rückstoß,
 * Treffer, Umfallen – legt diese Ebene per Knochen darüber. Reine Optik-Werte,
 * Gameplay bleibt in classes.js / weapons.js.
 */
const ANIM = {
  runFrom: 3.2, runTo: 7.0,   // ab welchem Tempo von Gehen auf Rennen geblendet wird
  blend: 7,                   // Tempo der Gewichtswechsel
  aimBlend: 10,
  recoilDecay: 6.5,
  deathTime: 0.95,
  hurtTime: 0.3,
  walkCycleSpeed: 2.4,        // Tempo, für das der Geh-Clip gebaut ist
  runCycleSpeed: 6.5,
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const damp = (a, b, rate, dt) => THREE.MathUtils.lerp(a, b, 1 - Math.exp(-rate * dt));

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _m1 = new THREE.Matrix4();
const FORWARD = new THREE.Vector3(0, 0, 1), UP = new THREE.Vector3(0, 1, 0);

/**
 * Richtet einen Knochen so aus, dass seine Gliedmaßen-Achse in eine
 * Weltrichtung zeigt, und blendet das mit Gewicht w über die Clip-Pose.
 * Modellunabhängig: die Achse kommt aus der Ruhelage des Kindknochens.
 */
function pointBone(bone, axis, worldDir, w) {
  if (!bone || !bone.parent) return;
  _m1.copy(bone.parent.matrixWorld).invert();
  _v3.copy(worldDir).transformDirection(_m1).normalize();
  _q1.setFromUnitVectors(axis, _v3);
  bone.quaternion.slerp(_q1, w);
  bone.updateMatrixWorld(true);
}

export class CharacterAnimator {
  constructor(mesh) {
    const rig = mesh.userData.rig;
    this.rig = rig;
    this.inst = rig.inst;
    this.bones = rig.inst.bones;
    this.mesh = mesh;
    this.tune = rig.inst.def.aimTune || {};
    const b = this.bones;
    // Gliedmaßen-Achsen aus der Ruhelage: Richtung vom Knochen zu seinem Kind
    this.axis = {
      rightArm: b.rightForeArm ? b.rightForeArm.position.clone().normalize() : null,
      rightForeArm: b.rightHand ? b.rightHand.position.clone().normalize() : null,
      leftArm: b.leftForeArm ? b.leftForeArm.position.clone().normalize() : null,
      leftForeArm: b.leftHand ? b.leftHand.position.clone().normalize() : null,
    };
    this.w = { idle: 1, walk: 0, run: 0 };
    this.aim = 0; this.recoil = 0; this.hurt = 0; this.death = 0; this.fallDir = 1;
    this.inst.mixer.setTime(Math.random() * 3);   // Bots nicht im Gleichschritt
  }

  fire() { this.recoil = 1; this.aim = 1; }
  hit() { this.hurt = 1; }
  die() {
    if (this.death > 0) return;
    this.death = 1e-4;
    this.fallDir = Math.random() < 0.5 ? 1 : -1;
    this.inst.mixer.timeScale = 0;                // Pose einfrieren, dann kippen
  }
  get fallen() { return this.death >= 1; }

  reset() {
    const r = this.rig;
    this.w = { idle: 1, walk: 0, run: 0 };
    this.aim = this.recoil = this.hurt = this.death = 0;
    r.frame.rotation.set(0, 0, 0); r.frame.position.set(0, 0, 0);
    r.weapon.position.copy(r.weaponRest);
    this.inst.mixer.timeScale = 1;
    for (const [k, a] of Object.entries(this.inst.actions)) a.setEffectiveWeight(k === 'idle' ? 1 : 0);
    for (const m of this.inst.materials) m.emissive?.setScalar(0);
  }

  update(dt, state = {}) {
    const { actions, mixer, materials } = this.inst;
    this.recoil = Math.max(0, this.recoil - dt * ANIM.recoilDecay);
    this.hurt = Math.max(0, this.hurt - dt / ANIM.hurtTime);
    for (const m of materials) m.emissive?.setScalar(this.hurt * 0.5);

    if (this.death > 0) return this._death(dt);

    // Fortbewegung: Stehen → Gehen → Rennen nach Tempo
    const speed = state.moving ? (state.speed || 0) : 0;
    const run = state.moving ? clamp01((speed - ANIM.runFrom) / (ANIM.runTo - ANIM.runFrom)) : 0;
    const walk = state.moving ? 1 - run : 0;
    this.w.run = damp(this.w.run, run, ANIM.blend, dt);
    this.w.walk = damp(this.w.walk, walk, ANIM.blend, dt);
    this.w.idle = damp(this.w.idle, 1 - run - walk, ANIM.blend, dt);
    actions.run?.setEffectiveWeight(this.w.run);
    actions.walk?.setEffectiveWeight(this.w.walk);
    actions.idle?.setEffectiveWeight(this.w.idle);
    // Schrittfrequenz ans Tempo koppeln, sonst rutschen die Füße
    actions.walk?.setEffectiveTimeScale(THREE.MathUtils.clamp(speed / ANIM.walkCycleSpeed, 0.6, 1.8));
    actions.run?.setEffectiveTimeScale(THREE.MathUtils.clamp(speed / ANIM.runCycleSpeed, 0.7, 1.6));

    mixer.update(dt);

    // Overlays auf die Clip-Pose
    this.aim = damp(this.aim, state.aiming ? 1 : 0, ANIM.aimBlend, dt);
    this._aim(this.aim);
    this.rig.weapon.position.z = this.rig.weaponRest.z - 0.12 * this.recoil;
  }

  /** Arme in den Anschlag führen und die Waffe nach vorn ausrichten. */
  _aim(w) {
    const b = this.bones, t = this.tune, rig = this.rig;
    if (!b.chest) return;
    if (w < 0.002 && this.recoil <= 0) {
      // Nichts zu tun – Waffe zurück in die Ruhelage, Matrizen sparen
      if (this._posed && rig.holder) { rig.holder.quaternion.copy(rig.holderRest); this._posed = false; }
      return;
    }
    this._posed = true;

    // Bezugssystem der Figur
    this.mesh.updateWorldMatrix(true, true);
    const fwd = _v1.copy(FORWARD).transformDirection(this.mesh.matrixWorld).normalize().clone();
    const right = fwd.clone().cross(UP).normalize();
    const chestPos = b.chest.getWorldPosition(new THREE.Vector3());
    const target = (o) => chestPos.clone()
      .addScaledVector(fwd, o[0]).addScaledVector(UP, o[1]).addScaledVector(right, o[2]);

    if (w > 0.002) {
      const hand = target(t.hand), elbow = target(t.elbow);
      const offHand = target(t.offHand), offElbow = target(t.offElbow);
      const chain = (arm, fore, elbowT, handT) => {
        const a = b[arm], f = b[fore];
        if (!a || !f || !this.axis[arm] || !this.axis[fore]) return;
        pointBone(a, this.axis[arm], elbowT.clone().sub(a.getWorldPosition(_v2)), w);
        pointBone(f, this.axis[fore], handT.clone().sub(f.getWorldPosition(_v2)), w);
      };
      chain('rightArm', 'rightForeArm', elbow, hand);
      chain('leftArm', 'leftForeArm', offElbow, offHand);
    }

    // Waffe: Ruhelage in der Hand, im Anschlag Lauf nach vorn, Rückstoß nach oben
    if (rig.holder && b.rightHand) {
      b.rightHand.updateMatrixWorld(true);
      rig.holder.quaternion.copy(rig.holderRest);
      if (w > 0.002) {
        _m1.copy(b.rightHand.matrixWorld).invert();
        _v3.copy(fwd).transformDirection(_m1).normalize();
        rig.holder.quaternion.slerp(_q1.setFromUnitVectors(FORWARD, _v3), w);
      }
      if (this.recoil > 0) rig.holder.rotateX(-0.35 * this.recoil * Math.max(w, 0.4));
    }
  }

  _death(dt) {
    this.death = Math.min(1, this.death + dt / ANIM.deathTime);
    const e = 1 - Math.pow(1 - this.death, 3);
    this.inst.mixer.update(0);                       // eingefrorene Pose halten
    this.rig.frame.rotation.x = e * (Math.PI / 2) * this.fallDir;
    this.rig.frame.position.y = -e * 0.1;
  }
}

/** Animiert die Ego-Waffe: Laufwippen, Maus-Nachlauf, Rückstoß, Nachladen. */
export class ViewmodelAnimator {
  constructor(vm) {
    this.vm = vm; this.home = vm.userData.home.clone();
    this.t = 0; this.kick = 0; this.sway = new THREE.Vector2();
    this.bobAmt = 0; this.lastYaw = 0; this.lastPitch = 0;
  }
  fire() { this.kick = 1; }

  update(dt, state) {
    const vm = this.vm;
    this.t += dt;
    this.kick = Math.max(0, this.kick - dt * 6);

    const dYaw = state.yaw - this.lastYaw, dPitch = state.pitch - this.lastPitch;
    this.lastYaw = state.yaw; this.lastPitch = state.pitch;
    this.sway.x = damp(this.sway.x, THREE.MathUtils.clamp(dYaw * 4, -0.06, 0.06), 8, dt);
    this.sway.y = damp(this.sway.y, THREE.MathUtils.clamp(-dPitch * 4, -0.06, 0.06), 8, dt);

    const want = state.moving && state.grounded ? Math.min(1, state.speed / 7) : 0;
    this.bobAmt = damp(this.bobAmt, want, 8, dt);
    const bobY = Math.abs(Math.sin(this.t * 9)) * 0.018 * this.bobAmt;
    const bobX = Math.sin(this.t * 4.5) * 0.02 * this.bobAmt;
    const dip = state.reload > 0 ? Math.sin(state.reload * Math.PI) : 0;

    vm.position.set(
      this.home.x + this.sway.x + bobX,
      this.home.y + this.sway.y + bobY - dip * 0.3,
      this.home.z + this.kick * 0.15,
    );
    vm.rotation.set(this.kick * 0.5 + dip * 0.5, -0.06 - this.sway.x * 3, dip * 0.7 + this.sway.x * 2);
  }
}
