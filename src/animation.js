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
  layerWeight: 6,             // Gewicht der Oberkörper-Ebene gegenüber der Gangart
  lookBlend: 6,               // wie schnell der Kopf zum Ziel dreht / zurückkehrt
  lookMaxYaw: 1.15,           // max. Kopfdrehung seitlich (rad)
  lookMaxPitch: 0.6,          // max. Kopfneigung (rad)
  rollTimeScale: 1.6,         // Roll-Clip schneller abspielen, sonst dauert die Rolle zu lang
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
    this.tune = rig.inst.def.aimTune || null;      // null: Modell bringt eigene Ziel-Clips mit
    this.hasAimClips = !!(rig.inst.actions.aimIdle || rig.inst.actions.aimWalk || rig.inst.actions.aimRun);
    const b = this.bones;
    // Gliedmaßen-Achsen aus der Ruhelage: Richtung vom Knochen zu seinem Kind
    this.axis = {
      rightArm: b.rightForeArm ? b.rightForeArm.position.clone().normalize() : null,
      rightForeArm: b.rightHand ? b.rightHand.position.clone().normalize() : null,
      leftArm: b.leftForeArm ? b.leftForeArm.position.clone().normalize() : null,
      leftForeArm: b.leftHand ? b.leftHand.position.clone().normalize() : null,
    };
    this.w = { idle: 1 };
    this.aim = 0; this.recoil = 0; this.hurt = 0; this.death = 0; this.fallDir = 1;
    this.look = 0; this.lookDelta = new THREE.Quaternion(); this.rolling = 0;
    this.inst.mixer.setTime(Math.random() * 3);   // Bots nicht im Gleichschritt
  }

  fire() {
    this.recoil = 1; this.aim = 1;
    const l = this.inst.layers;
    if (l.shoot) l.shoot.reset().setEffectiveWeight(ANIM.layerWeight * 1.5).play();
  }
  hit() {
    this.hurt = 1;
    const l = this.inst.layers;
    if (l.hit && this.death === 0) l.hit.reset().setEffectiveWeight(ANIM.layerWeight).play();
  }
  die() {
    if (this.death > 0) return;
    this.death = 1e-4;
    this.fallDir = Math.random() < 0.5 ? 1 : -1;
    const { actions, mixer, layers } = this.inst;
    for (const a of Object.values(layers)) a.stop();
    if (actions.death) {
      // Sterbe-Clip: alles andere ausblenden, Clip einmal abspielen und Endpose halten
      for (const [k, a] of Object.entries(actions)) if (k !== 'death') a.setEffectiveWeight(0);
      actions.death.reset().setEffectiveWeight(1).play();
      this.deathClip = actions.death.getClip().duration;
    } else {
      mixer.timeScale = 0;                          // Pose einfrieren, dann kippen
    }
  }
  get fallen() { return this.death >= 1; }

  /**
   * Ausweichrolle (Vollkörper-Clip). Gibt die Dauer in Sekunden zurück,
   * 0 wenn das Modell keinen Roll-Clip hat.
   */
  roll() {
    const a = this.inst.actions.roll;
    if (!a || this.death > 0) return 0;
    const dur = a.getClip().duration / ANIM.rollTimeScale;
    a.reset().setEffectiveTimeScale(ANIM.rollTimeScale).setEffectiveWeight(1).play();
    for (const l of Object.values(this.inst.layers)) l.setEffectiveWeight(0);
    this.rolling = dur;
    return dur;
  }

  reset() {
    const r = this.rig;
    this.w = { idle: 1 };
    this.aim = this.recoil = this.hurt = this.death = 0;
    this.look = 0; this.rolling = 0; this.lookDelta.identity();
    this.inst.actions.roll?.stop();
    r.frame.rotation.set(0, 0, 0); r.frame.position.set(0, 0, 0);
    if (r.weaponRest) r.weapon.position.copy(r.weaponRest);
    this.inst.mixer.timeScale = 1;
    for (const [k, a] of Object.entries(this.inst.actions)) {
      if (k === 'death' || k === 'hit') a.stop();
      else { a.play(); a.setEffectiveWeight(k === 'idle' ? 1 : 0); }
    }
    for (const [k, a] of Object.entries(this.inst.layers)) {
      a.stop();
      if (k === 'aim') { a.play(); a.setEffectiveWeight(0); }
    }
    for (const m of this.inst.materials) m.emissive?.setScalar(0);
  }

  update(dt, state = {}) {
    const { actions, layers, mixer, materials, def } = this.inst;
    this.recoil = Math.max(0, this.recoil - dt * ANIM.recoilDecay);
    this.hurt = Math.max(0, this.hurt - dt / ANIM.hurtTime);
    for (const m of materials) m.emissive?.setScalar(this.hurt * 0.5);

    if (this.death > 0) return this._death(dt);

    // ---- Ausweichrolle: Vollkörper-Clip, Gangart und Ebenen ruhen solange ----
    this.rolling = Math.max(0, this.rolling - dt);
    const rollW = this.rolling > 0 ? 1 : 0;
    const gaitScale = 1 - rollW;

    // ---- Gangart: Stehen → Gehen → Rennen nach Tempo ----
    const moving = !!state.moving;
    const speed = moving ? (state.speed || 0) : 0;
    const run = moving ? clamp01((speed - ANIM.runFrom) / (ANIM.runTo - ANIM.runFrom)) : 0;
    const walk = moving ? 1 - run : 0;

    // ---- Richtung: vor / zurück / seitwärts, wenn das Modell Richtungs-Clips hat ----
    let fwdW = 1, backW = 0, leftW = 0, rightW = 0;
    if (actions.runLeft && moving) {
      const adv = state.advance ?? 1, str = state.strafe ?? 0;
      fwdW = Math.max(0, adv); backW = Math.max(0, -adv);
      rightW = Math.max(0, str); leftW = Math.max(0, -str);
      const sum = fwdW + backW + leftW + rightW || 1;
      fwdW /= sum; backW /= sum; leftW /= sum; rightW /= sum;
    }
    // Seit- und Rückwärtsclips gibt es nur als Lauf: bei Gehtempo laufen sie langsamer ab
    const side = run + walk;
    const target = {
      idle: (1 - run - walk) * gaitScale,
      walk: walk * fwdW * gaitScale, run: run * fwdW * gaitScale,
      runLeft: side * leftW * gaitScale, runRight: side * rightW * gaitScale, runBack: side * backW * gaitScale,
    };
    this.aim = damp(this.aim, state.aiming ? 1 : 0, ANIM.aimBlend, dt);
    const a = this.hasAimClips ? this.aim : 0;   // Modelle mit Vollkörper-Zielclips
    const pair = (plain, aimed, w) => {
      this.w[plain] = damp(this.w[plain] || 0, w, ANIM.blend, dt);
      if (actions[aimed]) {
        actions[plain]?.setEffectiveWeight(this.w[plain] * (1 - a));
        actions[aimed].setEffectiveWeight(this.w[plain] * a);
      } else actions[plain]?.setEffectiveWeight(this.w[plain]);
    };
    pair('idle', 'aimIdle', target.idle);
    pair('walk', 'aimWalk', target.walk);
    pair('run', 'aimRun', target.run);
    for (const k of ['runLeft', 'runRight', 'runBack']) {
      if (!actions[k]) continue;
      this.w[k] = damp(this.w[k] || 0, target[k], ANIM.blend, dt);
      actions[k].setEffectiveWeight(this.w[k]);
    }

    // ---- Schrittfrequenz ans Tempo koppeln, sonst rutschen die Füße ----
    const cyc = def.cycle || {};
    const ws = THREE.MathUtils.clamp(speed / (cyc.walkSpeed || ANIM.walkCycleSpeed), 0.6, 1.8);
    const rs = THREE.MathUtils.clamp(speed / (cyc.runSpeed || ANIM.runCycleSpeed), 0.55, 1.6);
    actions.walk?.setEffectiveTimeScale(ws); actions.aimWalk?.setEffectiveTimeScale(ws);
    for (const k of ['run', 'aimRun', 'runLeft', 'runRight', 'runBack']) actions[k]?.setEffectiveTimeScale(rs);

    // ---- Oberkörper-Ebene: Anschlag über jeder Gangart ----
    // Der Mixer normiert Gewichte pro Knochen; ein hohes Gewicht auf der
    // Ebene lässt den Oberkörper fast vollständig dem Zielclip folgen.
    if (layers.aim) layers.aim.setEffectiveWeight(this.aim * ANIM.layerWeight * gaitScale);

    mixer.update(dt);

    // ---- Kopf folgt dem Ziel (z. B. dem Spieler), solange eines gesetzt ist ----
    this._lookAt(state.lookAt, dt, rollW > 0);

    // ---- Overlays per Knochen, nur für Modelle ohne eigene Zielclips ----
    if (this.tune) {
      this._aim(this.aim);
      if (this.rig.weaponRest) this.rig.weapon.position.z = this.rig.weaponRest.z - 0.12 * this.recoil;
    } else if (!layers.shoot && this.recoil > 0 && this.bones.chest) {
      this.bones.chest.rotateX(-0.12 * this.recoil);   // kleiner Ruck beim Schuss
    }
  }

  /**
   * Dreht den Kopfknochen zum Ziel. Rechnet in Weltkoordinaten die Drehung
   * von "Blickrichtung der Figur" nach "Richtung zum Ziel", begrenzt sie und
   * legt sie über die Clip-Pose – dadurch egal, wie das Modell seine
   * Kopfachsen definiert. Ohne Ziel kehrt der Kopf weich zurück.
   */
  _lookAt(target, dt, suppress) {
    const head = this.bones.head;
    if (!head || !head.parent) return;
    const want = target && !suppress ? 1 : 0;
    this.look = damp(this.look, want, ANIM.lookBlend, dt);
    if (this.look < 0.005 && !target) return;

    if (target) {
      this.mesh.updateWorldMatrix(true, true);
      const fwd = _v1.copy(FORWARD).transformDirection(this.mesh.matrixWorld).normalize();
      const headPos = head.getWorldPosition(_v2);
      const dir = _v3.copy(target).sub(headPos).normalize();
      // Winkel in Gier und Neigung zerlegen und begrenzen
      const right = new THREE.Vector3().crossVectors(fwd, UP).normalize();
      const yaw = THREE.MathUtils.clamp(Math.atan2(dir.dot(right), dir.dot(fwd)), -ANIM.lookMaxYaw, ANIM.lookMaxYaw);
      const pitch = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(dir.y - fwd.y, -1, 1)), -ANIM.lookMaxPitch, ANIM.lookMaxPitch);
      const qYaw = new THREE.Quaternion().setFromAxisAngle(UP, -yaw);
      const qPitch = new THREE.Quaternion().setFromAxisAngle(right, -pitch);
      this.lookDelta.multiplyQuaternions(qYaw, qPitch);
    }
    if (this.look < 0.005) return;
    // Welt-Delta auf den Knochen: local' = inv(parentWorld) * delta * headWorld
    const parentQ = head.parent.getWorldQuaternion(new THREE.Quaternion());
    const headQ = head.getWorldQuaternion(new THREE.Quaternion());
    const delta = new THREE.Quaternion().slerpQuaternions(new THREE.Quaternion(), this.lookDelta, this.look);
    const newWorld = delta.multiply(headQ);
    head.quaternion.copy(parentQ.invert().multiply(newWorld));
    head.updateMatrixWorld(true);
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
    if (this.inst.actions.death) {
      this.inst.mixer.update(dt);
      this.death = Math.min(1, this.death + dt / Math.max(0.2, this.deathClip || ANIM.deathTime));
      return;
    }
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
