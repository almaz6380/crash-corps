import * as THREE from 'three';
import { resolveCollisions, groundHeightAt, STEP_UP } from './world.js';
import { Weapon } from './weapons.js';
import { SPECIALS } from './classes.js';
import { buildViewmodel, buildCharacter, trefferQuader } from './characters.js';
import { ViewmodelAnimator, CharacterAnimator } from './animation.js';
import { AIM_ASSIST } from './device.js';
import { bestTarget, pullToward, ASSIST } from './aimassist.js';

const EYE = 1.6, GRAVITY = 22, JUMP = 8;

/**
 * Schulterkamera. Die Figur steht etwas links im Bild, die Kamera dahinter und
 * leicht darüber. `polster` hält sie von Wänden weg – ohne das steckt sie in
 * jeder Gasse in der Hauswand und man sieht das Innere der Geometrie.
 */
const SCHULTER = { abstand: 2.7, hoehe: 0.3, seite: 0.6, polster: 0.3, nah: 0.5, zeigen: 1.35 };
const SICHT_KEY = 'crashcorps.sicht';

/** Zuletzt gewählte Ansicht. Ab Werk die Verfolgersicht – die Figuren will man sehen. */
function sichtLaden() {
  try { return localStorage.getItem(SICHT_KEY) === 'ego'; } catch { return false; }
}

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
    // Unsichtbarer Trefferkörper – ohne ihn können die Bots den Spieler nicht
    // anvisieren. Die Bots haben seit den Trefferzonen denselben Quader, aus
    // demselben Bauplan: auf eine animierte Figur zu schießen, trifft sie nicht
    // verlässlich (siehe `trefferQuader` in bots.js).
    this.mesh = trefferQuader(cls);
    this.mesh.userData.target = this;
    this.trefferKoerper = this.mesh;
    scene.add(this.mesh);
    // Eigene Figur. In der Ego-Sicht unsichtbar, sonst sieht man sich von innen.
    this.figur = buildCharacter(cls);
    this.figurAnim = new CharacterAnimator(this.figur);
    scene.add(this.figur);
    this.egoSicht = sichtLaden();
    this.kamRay = new THREE.Raycaster();
    this.zielRay = new THREE.Raycaster();
    this.zielPunkt = new THREE.Vector3();
    this.sichtAnwenden();
    this.kills = 0; this.deaths = 0;
    this.schrittWeg = 0;      // gelaufene Strecke seit dem letzten Schritt
    this.warLaden = false;    // für die Flanke am Ende des Nachladens
  }
  /** Abräumen beim Klassenwechsel: Viewmodel, Figur und Trefferkörper lösen. */
  dispose() {
    this.camera.remove(this.viewmodel);
    this.scene.remove(this.mesh);
    this.scene.remove(this.figur);
    this.mesh.geometry.dispose(); this.mesh.material.dispose();
  }

  /** Ego- und Verfolgersicht wechseln; die Wahl bleibt über Matches hinweg. */
  sichtUmschalten() {
    this.egoSicht = !this.egoSicht;
    try { localStorage.setItem(SICHT_KEY, this.egoSicht ? 'ego' : 'figur'); } catch { /* egal */ }
    this.sichtAnwenden();
    return this.egoSicht;
  }

  /** Immer genau eins von beidem zeigen: Ego-Waffe oder ganze Figur. */
  sichtAnwenden() {
    this.viewmodel.visible = this.egoSicht;
    this.figur.visible = !this.egoSicht;
  }
  spawn(at) {
    this.pos.copy(at); this.pos.y = 0; this.vel.set(0, 0, 0);
    this.hp = this.cls.hp; this.dead = false; this.weapon = new Weapon(this.cls.weapon);
    this.warLaden = false; this.schrittWeg = 0;
    this.figurAnim.reset();
    this.sichtAnwenden();
  }
  useSpecial() {
    if (this.special.cool > 0 || this.dead) return;
    this.special.active = this.special.def.duration; this.special.cool = this.special.def.cooldown;
    this.sound?.spezial(this.cls.special);
  }
  /**
   * @param {number} dmg
   * @param {{kopf?:boolean, von?:object}} [info] Trefferzone und Schütze.
   *   Der Schütze wird als Position gemerkt, nicht als Winkel: der Keil im HUD
   *   soll auf ihn zeigen, auch wenn man sich danach dreht.
   */
  onHit(dmg, { kopf = false, von = null } = {}) {
    if (this.dead) return;
    this.hp -= dmg; this.flash = kopf ? 0.4 : 0.25;
    this.schadenVon = von?.pos?.clone() ?? null;
    this.letzterSchuetze = von;
    this.schadenZeit = 1.2;
    this.figurAnim.hit();
    if (this.hp <= 0) {
      this.hp = 0; this.dead = true; this.deaths++; this.respawnIn = 3;
      this.figurAnim.die(); this.sound?.tod();
    } else this.sound?.schmerz();
  }

  /** Trefferrückmeldung am Fadenkreuz. `art`: 'körper' | 'kopf' | 'abschuss'. */
  marker(art) { this.trefferArt = art; this.trefferZeit = art === 'abschuss' ? 0.6 : 0.3; }

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
    this.trefferZeit = Math.max(0, (this.trefferZeit || 0) - dt);
    this.schadenZeit = Math.max(0, (this.schadenZeit || 0) - dt);
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

    // Figur: steht auf den Füßen, schaut dorthin, wohin gezielt wird. Das Modell
    // blickt nach +z, der Spieler nach -z – daher die halbe Drehung.
    this.figur.position.copy(this.pos);
    this.figur.rotation.y = this.yaw + Math.PI;

    // Kamera
    const dashTilt = sp.active > 0 && sp.def.speedMul ? -Math.sign(inp.moveX) * 0.09 * (sp.active / sp.def.duration) : 0;
    this.kameraSetzen();
    this.camera.rotation.set(this.pitch, this.yaw, dashTilt, 'YXZ');
    const zoom = sp.active > 0 && sp.def.fovZoom ? sp.def.fovZoom : 1;
    this.camera.fov += (this.baseFov * zoom - this.camera.fov) * Math.min(1, dt * 10);
    this.camera.updateProjectionMatrix();

    // Feuern
    const ziel = this.zielen(targets);
    if (inp.fire) {
      const dmgMul = sp.active > 0 && sp.def.damageMul ? sp.def.damageMul : 1;
      const von = this.schussStart(ziel);
      const richtung = ziel.clone().sub(von).normalize();
      const hits = this.weapon.fire(von, richtung, targets, this.world, dmgMul, this);
      if (hits) {
        this.vmAnim.fire(); this.figurAnim.fire();
        fx.tracers(this.eye, hits, this.cls.accent);
        this.sound?.schuss(this.cls.weapon);
        if (this.weapon.hitCount > 0) {
          const kopf = this.weapon.kopfCount > 0;
          this.marker(kopf ? 'kopf' : 'körper');
          if (kopf) this.sound?.kopftreffer(); else this.sound?.treffer();
        }
      }
      if (!this.weapon.def.auto) inp.fireHeld = false;   // Einzelschuss: Taste muss neu gedrückt werden
    }

    // Waffenanimation
    const w = this.weapon;
    this.vmAnim.update(dt, {
      moving, speed, grounded: this.grounded, yaw: this.yaw, pitch: this.pitch,
      reload: w.reloading > 0 ? 1 - w.reloading / w.def.reload : 0,
    });
    // Figurenanimation. `advance`/`strafe` kommen direkt aus der Eingabe – sie
    // stehen schon im Bezugssystem der Figur, weil die mit dem Blick dreht.
    this.figurAnim.update(dt, {
      moving, speed, aiming: !!inp.fire,
      advance: inp.moveY, strafe: inp.moveX,
      lookAt: ziel,
    });
  }

  /**
   * Kamera setzen. In der Ego-Sicht sitzt sie im Auge, sonst über der Schulter.
   *
   * Der Strahl von der Schulter zur Wunschposition verhindert, dass sie durch
   * Wände rutscht: steht etwas dazwischen, rückt sie davor. `nah` als Untergrenze,
   * damit sie in der engsten Gasse nicht im Hinterkopf der Figur landet.
   */
  kameraSetzen() {
    if (this.egoSicht) { this.camera.position.copy(this.eye); return; }
    const f = this.forward;
    const rechts = new THREE.Vector3(-f.z, 0, f.x);
    const hoch = new THREE.Vector3(0, 1, 0);

    // Zwei Schritte statt einem: erst gerade nach hinten, dann zur Seite. In
    // einem Zug gerechnet würde eine Hauswand seitlich auch den Abstand nach
    // hinten fressen – die Kamera säße mitten in der Figur, obwohl hinter ihr
    // Platz ist. Der Strahl startet im Auge; das steckt nie in einer Wand.
    const rueck = this.aim.clone().negate();
    this.kamRay.set(this.eye, rueck);
    this.kamRay.far = SCHULTER.abstand;
    const hinderniss = this.kamRay.intersectObjects(this.world.colliders, false)[0];
    const hinten = hinderniss
      ? Math.max(SCHULTER.nah, hinderniss.distance - SCHULTER.polster)
      : SCHULTER.abstand;
    const anteil = hinten / SCHULTER.abstand;
    const basis = this.eye.clone()
      .addScaledVector(rueck, hinten)
      .addScaledVector(hoch, SCHULTER.hoehe * anteil);

    this.kamRay.set(basis, rechts);
    this.kamRay.far = SCHULTER.seite;
    const seitlich = this.kamRay.intersectObjects(this.world.colliders, false)[0];
    const seite = seitlich
      ? Math.max(0, seitlich.distance - SCHULTER.polster)
      : SCHULTER.seite * anteil;
    this.camera.position.copy(basis).addScaledVector(rechts, seite);

    // Ist kaum Platz nach hinten, steckt die Kamera im Kopf der Figur und
    // nimmt das halbe Bild. Dann verschwindet die Figur lieber.
    this.figur.visible = hinten > SCHULTER.zeigen;
  }

  /**
   * Woher der Schuss kommt.
   *
   * Normal aus dem Auge der Figur – das ist ehrlich: was die Figur deckt,
   * deckt auch den Schuss. Steht sie aber dicht vor einer Kante, die der
   * Spieler von der Kamera aus gar nicht sieht, frisst diese Kante jeden
   * Schuss, und es sieht nach einem Fehler aus. In dem Fall wird von der
   * Kamera gefeuert, damit trifft, was im Fadenkreuz steht.
   */
  schussStart(ziel) {
    if (this.egoSicht) return this.eye;
    const richtung = ziel.clone().sub(this.eye).normalize();
    this.zielRay.set(this.eye, richtung);
    this.zielRay.far = SCHULTER.abstand;
    const nah = this.zielRay.intersectObjects(this.world.colliders, false)[0];
    if (!nah) return this.eye;
    return this.camera.position.clone().addScaledVector(this.aim, 0.5);
  }

  /**
   * Der Punkt, auf den das Fadenkreuz zeigt.
   *
   * In der Verfolgersicht steht die Kamera neben der Figur – schösse man weiter
   * vom Auge entlang der Blickrichtung, träfe man neben das, was in der
   * Bildmitte steht. Deshalb erst von der Kamera aus suchen, worauf gezielt
   * wird, und dann von der Figur dorthin feuern. In der Ego-Sicht fallen beide
   * Punkte zusammen, dort ändert sich nichts.
   */
  zielen(targets) {
    const von = this.camera.position;
    this.zielRay.set(von, this.aim);
    this.zielRay.far = 200;
    const wand = this.zielRay.intersectObjects(this.world.colliders, false)[0];
    const gegner = this.zielRay.intersectObjects(targets.map(t => t.trefferKoerper ?? t.mesh), false)[0];
    const treffer = gegner && (!wand || gegner.distance < wand.distance) ? gegner : wand;
    if (treffer) this.zielPunkt.copy(treffer.point);
    else this.zielPunkt.copy(von).addScaledVector(this.aim, 120);
    return this.zielPunkt;
  }
}
