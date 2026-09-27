import * as THREE from 'three';
import { CLASSES, SPECIALS } from './classes.js';
import { Weapon } from './weapons.js';
import { buildCharacter, trefferQuader } from './characters.js';
import { CharacterAnimator } from './animation.js';
import { resolveCollisions, groundHeightAt, STEP_UP, amStrahl, inBereich } from './world.js';
import { TEAMS } from './domination.js';

const NAMES = ['Brösel', 'Knacki', 'Zündel', 'Rumpel', 'Fiete', 'Gustl', 'Wuschel', 'Pumpf'];
let nameIdx = 0;

/** Zielhöhe als Anteil der Körperhöhe: Brust, wie bei der Zielhilfe. */
const ZIELHOEHE = 0.62;

/**
 * Können der Bots. Gameplay-Werte der Klassen stehen in `classes.js`, die der
 * Waffen in `weapons.js` – was hier steht, ist weder das eine noch das andere,
 * sondern wie gut jemand damit umgeht. Ein Ort, damit man daran drehen kann,
 * ohne den Zustandsautomaten zu lesen.
 *
 * Die Streuung ist ein **Winkel**. Vorher wurde ein fester Betrag auf den
 * Richtungsvektor addiert, und der ist so lang wie die Entfernung – Bots
 * zielten also umso genauer, je weiter weg das Ziel stand. Genau verkehrt.
 */
const KI = {
  reaktion: 0.6,          // Aufbauzeit, bis der erste Schuss fällt
  nachfuehren: 5.5,       // wie schnell das Zielkreuz dem Gegner folgt (1/s)
  streuung: 0.05,         // Grundstreuung in rad (auf 20 m rund ein Meter)
  streuungLauf: 0.045,    // Zuschlag, solange der Bot selbst läuft
  deckungAb: 0.35,        // Lebensanteil, ab dem Deckung gesucht wird
  deckungZeit: 2.2,       // Mindestaufenthalt in Deckung
  deckungPruefen: 0.5,    // Sekunden zwischen zwei Deckungssuchen
  deckungWeite: 11,       // wie weit ein Bot nach Deckung sucht
  nachladenAb: 0.3,       // Magazinanteil, ab dem im Gefecht nachgeladen wird
  spezialChance: 0.55,    // Anteil der Gelegenheiten, die genutzt werden
  spezialPruefen: 0.8,    // Sekunden zwischen zwei Prüfungen
};

/** Waffendistanz, auf die ein Bot sich einpendelt. */
const IDEAL = { shotgun: 4, smg: 9, rifle: 22 };

/**
 * Bot: patrol → chase → shoot. Sieht Gegner nur mit Sichtlinie.
 *
 * `team` bestimmt, wer Gegner ist. Im Deathmatch steht der Spieler allein in
 * Mannschaft 0 und alle Bots in Mannschaft 1 – daraus ergibt sich dasselbe
 * Verhalten wie vorher. Bei Domination sind beide Mannschaften gemischt.
 */
export class Bot {
  constructor(scene, world, clsId, sound, team = 1) {
    this.cls = CLASSES[clsId]; this.world = world; this.scene = scene; this.sound = sound;
    this.team = team;
    this.name = NAMES[nameIdx++ % NAMES.length];
    this.mesh = buildCharacter(this.cls);
    this.anim = new CharacterAnimator(this.mesh);
    // Trefferkörper: ein unsichtbarer Quader, nicht die Figur selbst.
    //
    // Ein Strahl gegen eine animierte Figur verfehlt sie verlässlich
    // unzuverlässig: three prüft zuerst die Hülle aus der Bindepose, und die
    // passt zur Laufpose nicht – gemessen gingen 15 von 17 Schüssen auf die
    // stehende Figur ins Leere. Der Spieler hatte von Anfang an einen Quader;
    // jetzt haben ihn beide, und damit gelten für beide dieselben Zonen.
    this.trefferKoerper = trefferQuader(this.cls);
    this.trefferKoerper.userData.target = this;
    scene.add(this.trefferKoerper);
    // Wimpel in Mannschaftsfarbe über dem Kopf. Ohne ihn sieht man im
    // Domination-Modus nicht, auf wen man schießen darf.
    this.wimpel = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 0.34, 6),
      new THREE.MeshBasicMaterial({ color: TEAMS[team].farbe }),
    );
    this.wimpel.rotation.x = Math.PI;
    this.wimpel.position.y = this.cls.body.height + 0.5;
    this.mesh.add(this.wimpel);
    scene.add(this.mesh);
    this.pos = this.mesh.position;
    this.hp = this.cls.hp; this.dead = false; this.respawnIn = 0;
    this.weapon = new Weapon(this.cls.weapon);
    this.target = null; this.wander = new THREE.Vector3();
    this.retarget = 0; this.reaction = 0; this.kills = 0;
    this.ray = new THREE.Raycaster();
    // Eigene Listen für die Rasterabfragen: die Deckungssuche stellt in ihrer
    // Schleife eine zweite Abfrage, ein geteilter Zwischenspeicher wäre danach
    // leer und die Suche bräche nach dem ersten Quader ab.
    this._kand = []; this._deckung = [];
    // Ausweichrolle (nur Klassen mit Dash-Spezial), Werte aus classes.js
    this.dodge = 0; this.dodgeCool = 0; this.dodgeDir = new THREE.Vector3(); this.dodgeSpeed = 0;
    this.vy = 0;   // Fallgeschwindigkeit, damit Bots von Plattformen fallen
    this.navPoint = null; this.navRefresh = 0;   // Zwischenziel beim Ebenenwechsel
    // Weg aus dem Navigationsgitter: Liste von Punkten, Zeiger darauf, Alter
    this.weg = null; this.wegIndex = 0; this.wegZiel = null; this.wegAlter = 0;
    this.klemmt = 0; this.klemmStrecke = 0; this.klemmZeit = 0;
    this.schrittWeg = 0;                         // Strecke seit dem letzten Schritt
    this.zielPunkt = new THREE.Vector3();        // nachgeführtes Zielkreuz
    this.deckung = null; this.deckungBis = 0; this.deckungPruefung = 0; this.deckungWeg = false;
    this.spezialAktiv = 0; this.spezialCool = 0; this.spezialFrage = 0;
    this.gerammt = null;                         // wen der laufende Sturmangriff schon traf
  }
  spawn(at) {
    this.pos.copy(at); this.vy = 0; this.hp = this.cls.hp; this.dead = false; this.mesh.visible = true;
    this.trefferSetzen();
    this.weapon = new Weapon(this.cls.weapon); this.retarget = 0; this.reaction = 0;
    this.dodge = 0; this.dodgeCool = 0; this.navPoint = null; this.navRefresh = 0;
    this.schrittWeg = 0;
    this.weg = null; this.wegZiel = null; this.wegAlter = 0; this.klemmt = 0;
    this.deckung = null; this.deckungWeg = false; this.deckungBis = 0;
    this.spezialAktiv = 0; this.spezialCool = 0; this.spezialFrage = 0; this.gerammt = null;
    this.zielPunkt.set(0, 0, 0);
    this.anim.reset();
  }
  /**
   * @param {number} dmg
   * @param {{kopf?:boolean, von?:object}} [info] Trefferzone und Schütze. Der
   *   Schütze wird an `onDeath` weitergereicht: nur so weiß `main.js`, wer den
   *   Abschuss hat – in Domination schießen auch die eigenen Leute.
   */
  onHit(dmg, { kopf = false, von = null } = {}) {
    if (this.dead) return;
    this.hp -= dmg; this.anim.hit();
    this.sound?.koerpertreffer(this.pos, kopf);
    if (this.hp > 0) this.tryDodge();
    if (this.hp <= 0) {
      this.hp = 0; this.dead = true; this.respawnIn = 4;
      this.anim.die(); // Leiche bleibt sichtbar, bis sie umgefallen ist
      this.sound?.sturz(this.pos);
      this.onDeath?.(von);
    }
  }
  get eye() { return this.pos.clone().setY(this.pos.y + this.cls.body.height * 0.9); }

  /**
   * Zwischenziel, wenn das eigentliche Ziel auf einer anderen Ebene liegt:
   * erst zum Fuß der günstigsten Rampe, dann hinauf. Rampen, deren Fuß selbst
   * höher liegt als der Bot steht, kommen nicht in Frage – so klettert er
   * mehrstufige Aufgänge Stück für Stück.
   */
  routeTo(dst, dt) {
    // Der Aufstieg ist der **letzte** Schritt, nicht der erste.
    //
    // Vorher schickte jedes höher liegende Ziel den Bot sofort auf die
    // nächstbeste Treppe. Auf 60 m ging das: dort war die nächste Treppe auch
    // die richtige. In der Stadt am Hang steht er dann auf einem Dach im Tal,
    // während der Punkt vierzig Meter weiter oben auf der Terrasse liegt –
    // erreichbar nur über einen Hohlweg, und den kennt die Rampenliste nicht,
    // sondern das Gitter.
    //
    // Also erst über den Boden in die Nähe, dann hinauf. Ein begonnener
    // Aufstieg wird zu Ende gebracht, sonst dreht der Bot auf halber Treppe um.
    const nah = Math.hypot(dst.x - this.pos.x, dst.z - this.pos.z) < 12;
    if (this.navPoint || nah) {
      const ebene = this.ebenenZiel(dst, dt);
      if (ebene !== dst) {
        // Zum **Fuß** einer Treppe läuft man wie zu jedem anderen Bodenziel:
        // über das Gitter. Geradeaus dorthin lief der Bot sonst durch den
        // Zaun des Innenhofs – gemessen 35 von 50 Klemmstellen an einer
        // einzigen Ecke. Nur der Aufstieg selbst geht geradeaus; auf der
        // Treppe hat das Gitter nichts zu sagen, es kennt nur den Boden.
        return ebene.y > this.pos.y + 0.6 ? ebene : this.gitterZiel(ebene, dt);
      }
    } else {
      this.navRefresh -= dt;
    }
    return this.gitterZiel(dst, dt);
  }

  /**
   * Der Weg **in** der Ebene, aus dem Navigationsgitter (`navgitter.js`).
   *
   * Gesucht wird nur, wenn die gerade Linie verstellt ist – das ist der
   * seltene Fall, und A* je Bot und Bild wäre pure Verschwendung. Ein
   * gefundener Weg hält gut eine Sekunde; danach kann sich das Ziel bewegt
   * haben. Findet die Suche nichts, bleibt Geradeaus: schlechter als ein Weg,
   * besser als Stehenbleiben.
   */
  gitterZiel(dst, dt) {
    const nav = this.world.nav;
    if (!nav) return dst;
    this.wegAlter -= dt;
    if (this.klemmt <= 0 && nav.sicht(this.pos.x, this.pos.z, dst.x, dst.z)) {
      this.weg = null; return dst;
    }
    const neuesZiel = !this.wegZiel || this.wegZiel.distanceTo(dst) > 4;
    if (!this.weg || this.wegAlter <= 0 || neuesZiel) {
      this.weg = nav.weg(this.pos, dst);
      this.wegIndex = 0;
      this.wegZiel = dst.clone();
      this.wegAlter = 1.2;
      this.klemmt = 0;
      if (!this.weg) return dst;
    }
    while (this.wegIndex < this.weg.length - 1
      && this.pos.distanceTo(this.weg[this.wegIndex]) < 1.6) this.wegIndex++;
    return this.weg[this.wegIndex];
  }

  /** Zwischenziel beim Ebenenwechsel – das bisherige `routeTo`. */
  ebenenZiel(dst, dt) {
    this.navRefresh -= dt;
    // Ein gewähltes Zwischenziel wird gehalten, bis es erreicht ist. Ohne das
    // verwirft der Bot es auf halber Rampe, weil der Höhenunterschied schrumpft.
    if (this.navPoint) {
      if (this.pos.distanceTo(this.navPoint) > 1.4 && this.navRefresh > -6) return this.navPoint;
      this.navPoint = null;
    }
    if (dst.y - this.pos.y < 0.9) return dst;                   // gleiche Ebene oder Ziel tiefer

    let best = null, bestCost = Infinity;
    for (const r of this.world.ramps || []) {
      if (r.top.y <= this.pos.y + 0.6) continue;                // führt nicht höher
      if (r.bottom.y > this.pos.y + 0.9) continue;              // Fuß liegt über meiner Ebene
      const cost = this.pos.distanceTo(r.bottom) + r.top.distanceTo(dst);
      if (cost < bestCost) { bestCost = cost; best = r; }
    }
    if (!best) return dst;
    this.navRefresh = 0.7;
    // Am Fuß angekommen: Ziel ist die Rampenoberkante
    this.navPoint = this.pos.distanceTo(best.bottom) > 2.2 ? best.bottom : best.top;
    return this.navPoint;
  }

  /** Schwerkraft und Bodenhöhe – Bots stehen auf Rampen und Dächern wie der Spieler. */
  applyGravity(dt) {
    this.vy -= 22 * dt;
    this.pos.y += this.vy * dt;
    const support = groundHeightAt(this.pos, 0.35, this.world, this.pos.y + STEP_UP);
    if (this.pos.y <= support) { this.pos.y = support; this.vy = 0; }
    this.trefferSetzen();
  }

  /** Trefferquader der Figur nachführen – er steht auf den Füßen, nicht im Bauch. */
  trefferSetzen() {
    this.trefferKoerper.position.set(this.pos.x, this.pos.y + this.cls.body.height / 2, this.pos.z);
  }

  /**
   * Seitlich wegrollen, wenn die Klasse Dash hat, die Abklingzeit um ist und
   * der Zufall will. Mit `richtung` rollt der Bot gezielt dorthin (der
   * Schattenschritt nutzt das, um vom Gegner wegzukommen), `sicher` überspringt
   * den Würfel.
   */
  tryDodge(richtung = null, sicher = false) {
    const sp = SPECIALS[this.cls.special];
    if (!sp?.speedMul || this.dodge > 0 || this.dodgeCool > 0 || (!sicher && Math.random() > 0.6)) return false;
    const dur = this.anim.roll();
    if (!dur) return false;
    // Gleiche Strecke wie der Spieler-Dash, gestreckt auf die Dauer des Roll-Clips
    const dist = this.cls.speed * sp.speedMul * sp.duration;
    const yaw = this.mesh.rotation.y;
    if (richtung) this.dodgeDir.copy(richtung).setY(0).normalize();
    else this.dodgeDir.set(Math.cos(yaw), 0, -Math.sin(yaw)).multiplyScalar(Math.random() < 0.5 ? 1 : -1);
    this.dodgeSpeed = dist / dur;
    this.dodge = dur; this.dodgeCool = sp.cooldown;
    // Der Clip ist eine Vorwärtsrolle: für die Dauer in die Ausweichrichtung drehen,
    // danach dreht die weiche Blickführung wieder zum Ziel zurück
    this.mesh.rotation.y = Math.atan2(this.dodgeDir.x, this.dodgeDir.z);
    return true;
  }

  /** Figur aus der Szene nehmen und ihre geklonten Materialien freigeben. */
  dispose() {
    this.scene.remove(this.mesh, this.trefferKoerper);
    for (const m of this.mesh.userData.rig.inst.materials) m.dispose();
    this.wimpel.geometry.dispose(); this.wimpel.material.dispose();
    this.trefferKoerper.geometry.dispose(); this.trefferKoerper.material.dispose();
  }

  /** Nächster sichtbarer Gegner, oder null. */
  zielSuchen(gegner) {
    let best = null, bd = Infinity;
    for (const g of gegner) {
      if (g.dead) continue;
      const d = this.pos.distanceTo(g.pos);
      if (d < bd && this.canSee(g)) { bd = d; best = g; }
    }
    return best;
  }

  canSee(p) {
    if (this.pos.distanceTo(p.pos) > this.weapon.def.range) return false;
    return this.sichtFrei(this.eye, p.eye);
  }

  /** Sichtlinie zwischen zwei Punkten frei? Nur Weltgeometrie zählt. */
  sichtFrei(von, nach) {
    const dir = nach.clone().sub(von), dist = dir.length();
    this.ray.set(von, dir.normalize()); this.ray.far = dist;
    // Kandidaten aus dem Kollisionsraster: nur die Zellen, durch die der Strahl
    // läuft. Diese Prüfung läuft je Bot und Bild, auf 240 m wäre „alle Quader"
    // allein dafür die halbe Bildzeit.
    return this.ray.intersectObjects(amStrahl(this.world, von, dir, dist, this._kand), false).length === 0;
  }

  /**
   * Zielkreuz nachführen, statt es hinschnappen zu lassen. Die Waffen treffen
   * ohne Flugzeit: wer sofort auf die aktuelle Position zielt, trifft immer,
   * und Ausweichen wäre wirkungslos. Mit Nachführung gewinnt einen Moment, wer
   * die Richtung wechselt – das ist der einzige Hebel, den ein Spieler gegen
   * einen Hitscan-Gegner hat.
   */
  zielFuehren(feind, dt) {
    if (!feind) return;
    const brust = feind.pos.clone();
    brust.y += feind.cls.body.height * ZIELHOEHE;
    // Beim ersten Sehen oder nach einem Sprung (Wiedereinstieg) sofort setzen
    if (this.zielPunkt.lengthSq() === 0 || this.zielPunkt.distanceTo(brust) > 25) this.zielPunkt.copy(brust);
    else this.zielPunkt.lerp(brust, Math.min(1, dt * KI.nachfuehren));
  }

  /**
   * Ein Platz in der Nähe, von dem aus der Gegner einen **nicht** sieht.
   * Kandidaten sind die vier Seiten der Kollisionsquader ringsum – genau dort
   * steht eine Wand zwischen den beiden. Geprüft wird mit derselben
   * Sichtprüfung wie beim Zielen, also ohne neue Geometrie.
   */
  deckungSuchen(feind) {
    const ziel = feind.eye;
    const augen = this.cls.body.height * 0.9;
    let best = null, bestD = Infinity;
    // Nur die Quader im Umkreis – und in eine eigene Liste, weil die
    // Sichtprüfung darunter selbst eine Rasterabfrage stellt.
    const w = KI.deckungWeite;
    for (const c of inBereich(this.world, this.pos.x - w, this.pos.z - w, this.pos.x + w, this.pos.z + w, this._deckung)) {
      const box = c.userData.box;
      if (!box) continue;
      const mx = (box.min.x + box.max.x) / 2, mz = (box.min.z + box.max.z) / 2;
      if (box.max.y < this.pos.y + 1.2) continue;                 // zu niedrig zum Dahinterstellen
      if (Math.abs(box.min.y - this.pos.y) > 3) continue;         // andere Ebene
      if (Math.hypot(mx - this.pos.x, mz - this.pos.z) > KI.deckungWeite) continue;
      for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const px = sx ? (sx > 0 ? box.max.x + 0.9 : box.min.x - 0.9) : mx;
        const pz = sz ? (sz > 0 ? box.max.z + 0.9 : box.min.z - 0.9) : mz;
        const p = new THREE.Vector3(px, this.pos.y, pz);
        const d = p.distanceTo(this.pos);
        if (d > KI.deckungWeite || d >= bestD) continue;
        const kopf = p.clone(); kopf.y += augen;
        if (this.sichtFrei(kopf, ziel)) continue;                 // dort sieht er mich noch
        best = p; bestD = d;
      }
    }
    return best;
  }

  /**
   * Spezialfähigkeit einsetzen, wenn die Lage passt: Grimmbart stürmt auf
   * mittlere Entfernung los, Nachtschatten wischt weg, wenn es eng wird, der
   * Runenweber zielt scharf, sobald er Abstand und freie Bahn hat.
   *
   * `spezialChance` sorgt dafür, dass nicht jede Gelegenheit genutzt wird –
   * ein Bot, der immer im selben Moment zündet, wirkt wie eine Maschine.
   */
  spezialUeberlegen(feind, dt) {
    const sp = SPECIALS[this.cls.special];
    this.spezialCool = Math.max(0, this.spezialCool - dt);
    this.spezialAktiv = Math.max(0, this.spezialAktiv - dt);
    this.spezialFrage -= dt;
    if (this.spezialAktiv <= 0) this.gerammt = null;
    if (!feind || !sp || this.spezialCool > 0 || this.spezialAktiv > 0 || this.spezialFrage > 0) return;
    this.spezialFrage = KI.spezialPruefen;
    const dist = this.pos.distanceTo(feind.pos);
    const leben = this.hp / this.cls.hp;
    const lage = this.cls.special === 'charge' ? dist > 5 && dist < 13
      : this.cls.special === 'dash' ? leben < 0.5 || dist < 4
      : dist > 15;
    if (!lage || Math.random() > KI.spezialChance) return;
    // Der Schattenschritt bringt nur etwas als Bewegung – und zwar vom Gegner
    // weg. Klappt die Rolle nicht (kein Clip, noch in der Abklingzeit), bleibt
    // auch die Fähigkeit ungenutzt, statt ins Leere zu laufen.
    if (this.cls.special === 'dash') {
      const weg = this.pos.clone().sub(feind.pos).setY(0);
      if (weg.lengthSq() === 0 || !this.tryDodge(weg.normalize(), true)) return;
    }
    this.spezialAktiv = sp.duration; this.spezialCool = sp.cooldown;
    this.sound?.spezial(this.cls.special, this.pos);
    if (sp.schaden) this.gerammt = new Set();
  }

  /**
   * Sturmangriff: wen der Bot im Lauf erwischt, den wirft es weg. Jeder Gegner
   * zählt je Angriff nur einmal – sonst frisst ein halbsekündiger Lauf durch
   * eine Gruppe jeden einzeln auf. Gleiche Regel wie beim Spieler.
   */
  /**
   * Deckung suchen, halten, verlassen. Ausgelöst wird sie von wenig Leben oder
   * leerem Magazin – beides Lagen, in denen Stehenbleiben tödlich ist.
   * Gesucht wird höchstens alle `deckungPruefen` Sekunden: die Suche geht über
   * alle Kollisionsquader in der Nähe und schießt je Kandidat einen Strahl.
   */
  deckungPruefen(feind, dt) {
    this.deckungPruefung -= dt;
    if (this.deckung) {
      if (this.pos.distanceTo(this.deckung) < 1.2) { this.deckungWeg = false; this.deckungBis -= dt; }
      const geladen = this.weapon.reloading === 0 && this.weapon.ammo > 0;
      // Verlassen, wenn nachgeladen und die Wartezeit um ist – oder wenn der
      // Gegner ohnehin weg ist. Sonst klebt ein Bot bis zum Rundenende hinter
      // seiner Kiste.
      if (!feind || (this.deckungBis <= 0 && geladen)) { this.deckung = null; this.deckungWeg = false; }
      return;
    }
    // Nicht mitten im Aufstieg: ein Deckungsziel würde das Rampen-Zwischenziel
    // überschreiben, und der Bot stünde auf halber Treppe.
    if (!feind || this.navPoint || this.deckungPruefung > 0) return;
    this.deckungPruefung = KI.deckungPruefen;
    const knapp = this.hp / this.cls.hp < KI.deckungAb || this.weapon.ammo === 0;
    if (!knapp) return;
    const p = this.deckungSuchen(feind);
    if (p) { this.deckung = p; this.deckungBis = KI.deckungZeit; this.deckungWeg = true; }
  }

  rammen(gegner) {
    const sp = SPECIALS[this.cls.special];
    if (this.spezialAktiv <= 0 || !sp?.schaden || !this.gerammt) return;
    for (const g of gegner) {
      if (!g || g.dead || this.gerammt.has(g)) continue;
      const d = g.pos.clone().sub(this.pos); d.y = 0;
      if (d.length() > sp.reichweite) continue;
      this.gerammt.add(g);
      g.onHit(sp.schaden, { kopf: false, von: this });
      g.pos.addScaledVector(d.normalize(), sp.stoss * 0.12);
      if (g.vy !== undefined) g.vy = Math.max(g.vy, 3.2);
    }
  }

  update(dt, gegner, others, fx, dom = null) {
    this.weapon.update(dt);
    if (this.dead) {
      // Leiche bleibt bis zum Respawn liegen
      this.respawnIn -= dt;
      this.anim.update(dt);
      return;
    }

    this.dodgeCool = Math.max(0, this.dodgeCool - dt);
    if (this.dodge > 0) {
      this.dodge -= dt;
      const vorRolle = { x: this.pos.x, z: this.pos.z };
      this.pos.addScaledVector(this.dodgeDir, this.dodgeSpeed * dt);
      resolveCollisions(this.pos, 0.5, this.world, { height: this.cls.body.height, von: vorRolle });
      this.applyGravity(dt);
      this.anim.update(dt, { moving: false, speed: 0 });
      return;
    }

    const feind = this.zielSuchen(gegner);
    const sees = !!feind;
    this.zielFuehren(feind, dt);
    this.spezialUeberlegen(feind, dt);
    this.rammen(gegner);
    this.deckungPruefen(feind, dt);
    this.retarget -= dt;
    if (sees) {
      this.target = feind; this.reaction = Math.min(1, this.reaction + dt * 2.5);
    } else {
      this.reaction = Math.max(0, this.reaction - dt);
      if (this.retarget <= 0) {
        // Bei Domination zieht es die Bots auf die Kontrollpunkte, sonst
        // streifen sie wie bisher ziellos umher.
        const ziel = dom?.zielFuer(this);
        if (ziel) this.wander.copy(ziel);
        else {
          // Ziellos, aber innerhalb der Zone des Modus und in Reichweite: über
          // die ganze Stadt gestreut liefe ein Bot sonst minutenlang in den
          // leeren Waldrand, statt dorthin, wo gespielt wird.
          const g = this.world.grenze ?? this.world.zonen.ganz;
          this.wander.set(
            Math.max(-g.x, Math.min(g.x, this.pos.x + (Math.random() - 0.5) * 70)), 0,
            Math.max(-g.z, Math.min(g.z, this.pos.z + (Math.random() - 0.5) * 70)));
        }
        this.retarget = dom ? 1.5 + Math.random() * 1.5 : 3 + Math.random() * 3;
      }
    }

    // Bewegung. In Deckung zählt nur der Weg dorthin – kein Abstandsspiel,
    // kein Ausweichen zur Seite, sonst bleibt der Bot auf halber Strecke stehen.
    const goal = this.deckungWeg && this.deckung ? this.deckung : sees ? feind.pos : this.wander;
    const dst = this.routeTo(goal, dt);
    const climbing = dst !== goal;                 // unterwegs zu einer Rampe
    const dir = dst.clone().sub(this.pos).setY(0);
    const dist = dir.length();
    const ideal = IDEAL[this.cls.weapon];
    // Auf einem Punkt, der uns noch nicht gehört, wird gehalten statt auf
    // Waffendistanz zu gehen. Ohne das laufen Bots im Gefecht vom Punkt herunter
    // und es wird nie einer fertig erobert.
    const halten = dom && !climbing
      && dom.punktUnter(this)?.besitzer !== this.team
      && dom.punktUnter(this) != null;
    let mv = new THREE.Vector3();
    if (this.deckungWeg && this.deckung) {
      if (dist > 0.6) mv.copy(dir).normalize();
      else this.deckungWeg = false;
    } else if (climbing) {
      mv.copy(dir).normalize();                    // direkt hin, kein Abstandsspiel
    } else if (this.spezialAktiv > 0 && SPECIALS[this.cls.special].schaden && sees) {
      mv.copy(dir).normalize();                    // Sturmangriff: geradewegs drauf zu
    } else if (sees) {
      if (!halten) {
        if (dist > ideal + 2) mv.copy(dir).normalize();
        else if (dist < ideal - 2) mv.copy(dir).normalize().negate();
      }
      // seitliches Ausweichen – auf dem Punkt kleiner, damit man drin bleibt
      mv.addScaledVector(new THREE.Vector3(-dir.z, 0, dir.x).normalize(),
        Math.sin(performance.now() / 700 + this.pos.x) * (halten ? 0.25 : 0.6));
    } else if (dist > (dom ? 1.2 : 1.5)) mv.copy(dir).normalize();
    // Der Sturmangriff macht seinem Namen Ehre: für seine Dauer schneller
    const sturm = this.spezialAktiv > 0 && SPECIALS[this.cls.special].schaden;
    const speed = this.cls.speed * 0.8 * (sturm ? SPECIALS[this.cls.special].speedMul : 1);
    const walking = mv.lengthSq() > 0;
    const vorSchritt = { x: this.pos.x, z: this.pos.z };
    if (walking) this.pos.addScaledVector(mv.normalize(), speed * dt);
    resolveCollisions(this.pos, 0.5, this.world, { height: this.cls.body.height, von: vorSchritt });
    this.applyGravity(dt);
    // Bots untereinander leicht auseinanderdrücken
    if (!climbing) for (const o of others) if (o !== this && !o.dead && Math.abs(o.pos.y - this.pos.y) < 1.2) {
      const d = this.pos.clone().sub(o.pos).setY(0); const l = d.length();
      if (l < 1.4 && l > 0) this.pos.addScaledVector(d.normalize(), (1.4 - l) * 0.5);
    }
    // Steckenbleiben erkennen. Ein Bot, der laufen will und sich über zwei
    // Sekunden kaum bewegt, steht an einer Ecke, die weder Gitter noch Rampe
    // kennt. Dann wird der Weg verworfen und neu gesucht – und beim nächsten
    // Mal auch dann, wenn die Luftlinie frei aussieht.
    // Gezählt wird nur, wer **unterwegs** ist. Im Gefecht und auf einem Punkt
    // steht ein Bot mit Absicht fast still (Abstandsspiel, seitliches
    // Ausweichen, Halten) – zählte das mit, meldete die Erkennung 86 % der
    // Proben als klemmend und würfe jeden Weg dauernd weg.
    const reisen = walking && !sees && !halten;
    if (reisen) {
      this.klemmZeit += dt;
      this.klemmStrecke += Math.hypot(this.pos.x - vorSchritt.x, this.pos.z - vorSchritt.z);
    } else { this.klemmZeit = 0; this.klemmStrecke = 0; }
    this.klemmt -= dt;
    if (this.klemmZeit >= 2) {
      if (this.klemmStrecke < 1.2) {
        this.weg = null; this.wegAlter = 0; this.navPoint = null; this.klemmt = 3;
      }
      this.klemmZeit = 0; this.klemmStrecke = 0;
    }

    // Blickrichtung: weich drehen statt umschnappen
    const look = sees && !climbing ? feind.pos : this.pos.clone().add(mv);
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
    if (sees && this.reaction > KI.reaktion && this.weapon.canFire() && !this.deckungWeg) {
      const aim = this.zielPunkt.clone().sub(this.eye).normalize();
      // Streuung als Winkel, nicht als Strecke: sonst zielt ein Bot auf 30 m
      // genauer als auf 5 m, weil derselbe Versatz auf einem längeren Vektor
      // einen kleineren Winkel ergibt.
      const streu = KI.streuung + (walking ? KI.streuungLauf : 0);
      aim.x += (Math.random() - 0.5) * 2 * streu;
      aim.y += (Math.random() - 0.5) * 2 * streu;
      aim.z += (Math.random() - 0.5) * 2 * streu;
      const mul = this.spezialAktiv > 0 ? (SPECIALS[this.cls.special].damageMul || 1) : 1;
      const hits = this.weapon.fire(this.eye, aim.normalize(), [feind], this.world, mul, this);
      if (hits) {
        this.anim.fire();
        this.sound?.schuss(this.cls.weapon, this.eye);
        fx.tracers(this.eye, hits, this.cls.accent);
        const rig = this.mesh.userData.rig;
        if (rig.muzzle) fx.flash(rig.muzzle.getWorldPosition(new THREE.Vector3()));
      }
    }
    // Nachladen: außer Sicht wie bisher, im Gefecht aber auch – wenn das
    // Magazin fast leer ist und der Gegner weiter weg steht als die eigene
    // Waffendistanz, oder wenn man ohnehin in Deckung läuft. Vorher zog ein Bot
    // mit einer Patrone im Magazin in den Nahkampf.
    const magAnteil = this.weapon.ammo / this.weapon.def.mag;
    const weitWeg = !sees || this.pos.distanceTo(feind.pos) > ideal * 1.5;
    if ((!sees || this.deckungWeg || (magAnteil <= KI.nachladenAb && weitWeg))
      && this.weapon.ammo < this.weapon.def.mag) this.weapon.reload();

    // Schritte hörbar machen – daran merkt man, dass sich jemand nähert
    if (walking) {
      this.schrittWeg += speed * dt;
      if (this.schrittWeg > 2.1) { this.schrittWeg = 0; this.sound?.schritt(this.pos); }
    } else this.schrittWeg = 1.6;

    this.anim.update(dt, { moving: walking, speed, aiming, advance, strafe, lookAt: sees ? feind.eye : null });
  }
}
