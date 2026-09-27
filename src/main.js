import * as THREE from 'three';
import { CLASSES } from './classes.js';
import { klassenBilder } from './vorschau.js';
import { buildWorld, WORLD_PROPS } from './world.js';
import { Player } from './player.js';
import { Bot } from './bots.js';
import { Hud } from './hud.js';
import { Pipeline, ladeHimmel } from './render.js';
import { preloadCharacters, preloadProps } from './assets.js';
import { REAL, stilSetzen, stilZurueckfallen, schwachGemerkt } from './style.js';
import { preloadTextures } from './surface.js';
import { Input } from './input.js';
import { buehneAnpassen, TOUCH, QUALITY } from './device.js';
import { Sound } from './sound.js';
import { Domination, TEAMS } from './domination.js';
import { Navgitter } from './navgitter.js';
import { WELT } from './terrain.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, QUALITY.pixelRatio));
const scene = new THREE.Scene();
// Sichtweite auf die 240-m-Welt: von einer Ecke zur anderen sind es 339 m,
// und die Hügel am Rand sollen im Dunst verschwinden, nicht abgeschnitten werden.
const camera = new THREE.PerspectiveCamera(80, 1, 0.05, 450);
camera.userData.canvas = canvas;
scene.add(camera);
const pipeline = new Pipeline(renderer, camera);

let world = null;                      // wird nach dem Laden der Props gebaut
const input = new Input(canvas);
// Klang wird erzeugt, nicht geladen – siehe sound.js
const sound = new Sound();
if (TOUCH) document.body.classList.add('touch');

// Als Webapp installierbar und offline spielbar. Nur im eigenen Fenster und
// nur über HTTPS – in einem eingebetteten Rahmen (z. B. Artefakt) hätte der
// Service Worker keinen eigenen Geltungsbereich.
if ('serviceWorker' in navigator && isSecureContext && window.top === window) {
  addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.typ === 'offline-fortschritt') hud.offline(e.data.anteil);
  });
  // Übernimmt ein neuer Service Worker die Seite, läuft hier noch das alte
  // Skript. Einmal neu laden – sonst spielt man tagelang den alten Stand.
  let hatteSteuerung = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hatteSteuerung && !running) location.reload();
    hatteSteuerung = true;
  });
}
const hud = new Hud(document.getElementById('hud'));

// Effekte: kurze Leuchtspuren + Treffer-Funken
const fx = {
  items: [],
  tracers(from, points, color) {
    for (const p of points) {
      const g = new THREE.BufferGeometry().setFromPoints([from, p]);
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
      const spark = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffd166 }));
      spark.position.copy(p);
      scene.add(line, spark); this.items.push({ line, spark, t: 0.12 });
    }
  },
  flashes: [],
  // Ein einziges Licht, das wandert. Lichter zur Laufzeit hinzuzufügen zwingt
  // three dazu, sämtliche Shader neu zu übersetzen – das ruckelt bei jedem Schuss.
  flashLight: (() => { const l = new THREE.PointLight(0xffc046, 0, 5, 2); scene.add(l); return l; })(),
  flashGeo: new THREE.SphereGeometry(0.16, 6, 5),
  flashMat: new THREE.MeshBasicMaterial({ color: 0xffe08a }),
  /** Mündungsfeuer an einer Weltposition. */
  flash(at) {
    const m = new THREE.Mesh(this.flashGeo, this.flashMat);
    m.position.copy(at); m.scale.set(1.6, 1, 1.6);
    scene.add(m); this.flashes.push({ m, t: 0.06 });
    this.flashLight.position.copy(at); this.flashLight.userData.t = 0.06;
  },
  update(dt) {
    for (const it of this.items) { it.t -= dt; it.line.material.opacity = it.t / 0.12; }
    this.items = this.items.filter(it => { if (it.t <= 0) { scene.remove(it.line, it.spark); return false; } return true; });
    for (const f of this.flashes) f.t -= dt;
    this.flashes = this.flashes.filter(f => {
      if (f.t <= 0) { scene.remove(f.m); return false; }
      return true;
    });
    const fl = this.flashLight;
    fl.userData.t = Math.max(0, (fl.userData.t || 0) - dt);
    fl.intensity = 7 * (fl.userData.t / 0.06);
  },
};

let player = null, bots = [], time = 0, running = false;
let dom = null;              // Domination-Zustand, null im Deathmatch
let zuvielFiguren = 0;       // wie viele Bots die Leistungsstufe schon gestrichen hat

function resize() {
  const { w, h } = buehneAnpassen();
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  pipeline.setSize(w, h, renderer.getPixelRatio());
}
addEventListener('resize', resize); resize();

/**
 * Spawn möglichst weit weg von allen lebenden Figuren. Bei Domination kommen
 * nur die Plätze der eigenen Mannschaftshälfte in Frage, sonst landet man
 * mitten unter Gegnern.
 */
function pickSpawn(avoid, team = null) {
  // Im Deathmatch gelten die Plätze des Ausschnitts, sonst die der Stadt.
  const alle = world.grenze?.spawns ?? world.spawns;
  const plaetze = team == null ? alle : alle.filter(s => seite(s) === team);
  const auswahl = plaetze.length ? plaetze : alle;
  const abstand = (s) => avoid.filter(a => a && !a.dead)
    .reduce((m, a) => Math.min(m, a.pos.distanceTo(s)), 1e9);
  // Über die ganze Stadt zählt nicht mehr „möglichst weit weg": wer nach jedem
  // Tod am anderen Ende erscheint, läuft eine Minute. Also der Platz, der
  // einem eigenen Punkt am nächsten liegt – solange kein Gegner danebensteht.
  const eigene = dom?.punkte.filter(k => k.besitzer === team) ?? [];
  if (eigene.length) {
    let best = null, bd = Infinity;
    for (const s of auswahl) {
      if (abstand(s) < 16) continue;
      const d = eigene.reduce((m, k) => Math.min(m, k.pos.distanceTo(s)), 1e9);
      if (d < bd) { bd = d; best = s; }
    }
    if (best) return best;
  }
  let best = null, bd = -1;
  for (const s of auswahl) {
    const d = abstand(s);
    if (d > bd) { bd = d; best = s; }
  }
  return best;
}
/**
 * Welcher Mannschaft eine Stelle zugeordnet ist. Die Karte ist an z = 0
 * gespiegelt: Süden gehört Rot, Norden Blau. (Vorher entschied x + z – das
 * passte zur alten, punktsymmetrischen Arena, nicht zum Tal zwischen zwei
 * Terrassen.)
 */
const seite = (v) => (v.z < 0 ? 0 : 1);

function start(clsId) {
  if (player) player.dispose();
  for (const b of bots) b.dispose();
  dom?.dispose(); dom = null;
  sound.resume();                        // Browser lassen Ton erst nach einer Geste zu
  const domination = hud.modus === 'domination';
  // Jeder Modus bekommt seinen Ausschnitt der Stadt: Domination die ganze
  // Karte, Deathmatch das Tal. Sechs Figuren auf 240 m wären eine Wanderung.
  world.grenze = domination ? world.zonen.ganz : world.zonen.deathmatch;

  player = new Player(camera, CLASSES[clsId], world, scene, input, sound);
  const ids = Object.keys(CLASSES);
  // Deathmatch: der Spieler allein gegen fünf Bots, eng und schnell.
  // Domination: sechs gegen sechs über fünf Punkte und drei Ebenen – bei
  // weniger Leuten steht die halbe Karte leer.
  const teams = domination
    ? [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1]
    : [1, 1, 1, 1, 1];
  zuvielFiguren = 0;
  bots = teams.map((team, i) => {
    const b = new Bot(scene, world, ids[i % ids.length], sound, team);
    b.onDeath = (von) => {
      // Nur eigene Abschüsse zählen. Vorher zählte jeder tote Gegner als
      // Abschuss des Spielers – in Domination schießen aber auch die Bots
      // der eigenen Mannschaft.
      if (von === player) {
        player.kills++; hud.kill(`Du → ${b.name}`); sound.abschuss();
        player.marker('abschuss');
      } else if (von) hud.kill(`${von.name ?? 'Jemand'} → ${b.name}`);
      else hud.kill(`${b.name} gefallen`);
    };
    return b;
  });
  player.spawn(pickSpawn(bots, domination ? 0 : null));
  for (const b of bots) b.spawn(pickSpawn([player, ...bots], domination ? b.team : null));

  if (domination) {
    dom = new Domination(world, sound);
    dom.onErobert = (punkt, team) => hud.kill(`${TEAMS[team].name} nimmt ${punkt.id}`);
    dom.onEnde = (sieger) => {
      running = false; input.showTouch(false);
      const gewonnen = sieger === player.team;
      hud.ende(gewonnen ? 'Sieg!' : 'Verloren', gewonnen);
      sound.matchEnde(gewonnen);
      if (!TOUCH) document.exitPointerLock?.();
    };
  }
  hud.domAufbauen(dom);
  hud.ende(null);
  time = 0; running = true;
  hud.showMenu(false);
  if (TOUCH) {
    hud.hint(false);
    input.showTouch(true);
    // Vollbild und Querformat brauchen eine Nutzergeste – der Klassen-Knopf ist eine
    document.documentElement.requestFullscreen?.().catch(() => {});
    screen.orientation?.lock?.('landscape').catch(() => {});
  } else {
    hud.hint(true);
    canvas.requestPointerLock();
  }
}
hud.onPick = (id) => { sound.resume(); sound.klick(); start(id); };
hud.onSound = () => { sound.resume(); const an = sound.schalten(); if (an) sound.klick(); return an; };
hud.tonStand(sound.an);
if (schwachGemerkt()) {
  hud.hinweis('Die fotorealistische Fassung lief auf diesem Gerät zu langsam – '
    + 'das Spiel startet deshalb im Comic-Stil. Über den Knopf lässt sie sich zurückholen.');
}
hud.onCustomize = () => {
  sound.klick();
  // Menü ausblenden, Bedienung über dem eingefrorenen Bild anordnen
  hud.showMenu(false);
  input.touch.onDone = () => { input.touch.edit(false); hud.showMenu(true); };
  input.touch.edit(true);
};
hud.onPause = () => { if (running) { sound.klick(); running = false; input.showTouch(false); hud.showMenu(true); hud.hint(false); } };
hud.onModus = () => sound.klick();
// Grafikstil: die halbe Szene hängt daran (Materialien, Licht, Himmel,
// Render-Ziele), deshalb wird neu geladen statt umgebaut.
hud.onGrafik = () => {
  sound.klick();
  stilSetzen(REAL ? 'toon' : 'real');
  location.reload();
};
// Gyroskop. Der Knopf ist die Nutzergeste, die iOS für die Erlaubnis verlangt.
// Einschalten heißt immer kalibrieren: zwei Bewegungen, aus denen die Achsen
// gemessen werden. Ohne gültige Achsen bleibt der Gyro aus.
let kalibLaeuft = false;   // solange wahr, darf die Schleife den Gyro-Puffer nicht leeren
async function gyroKalibrieren() {
  kalibLaeuft = true;
  try { return await _gyroKalibrieren(input.gyro); }
  finally { kalibLaeuft = false; }
}
async function _gyroKalibrieren(g) {
  let fehler = null, gewarnt = false;
  // Anzeige der Rohwerte in jedem Schritt: so lässt sich aus einem Bildschirm-
  // foto ablesen, was das Gerät bei welcher Bewegung meldet.
  let lauf = true, punkt = null;
  const zeigen = () => {
    if (!lauf) return;
    const [b, ga, a] = g.roh, s = g.schwere;
    hud.kalibMess(`Drehung β ${b} γ ${ga} α ${a} °/s` + (s
      ? `   Lage x ${s[0].toFixed(1)} y ${s[1].toFixed(1)} z ${s[2].toFixed(1)}`
      : '   Lage –') + (g.laeuft ? '' : '   (kein Sensor)'));
    punkt?.();
    requestAnimationFrame(zeigen);
  };
  zeigen();

  /**
   * Der Prüfschritt: ein Punkt bewegt sich genau so, wie das Spiel den Blick
   * bewegen würde. „Stimmt“ gibt es erst, wenn er rechts **und** oben war –
   * eine Kalibrierung, bei der eine Richtung tot ist oder verkehrt herum
   * läuft, kommt so nicht ins Spiel.
   */
  const pruefen = async () => {
    let px = 0, py = 0, warRechts = false, warOben = false;
    punkt = () => {
      const [dyaw, dpitch] = g.take();
      // yaw+ = Blick nach links → Punkt nach links; pitch+ = nach oben
      px = Math.max(-1, Math.min(1, px - dyaw * 1.4));
      py = Math.max(-1, Math.min(1, py + dpitch * 1.4));
      px *= 0.94; py *= 0.94;              // zieht zur Mitte zurück, wie ein Fadenkreuz-Test
      hud.kalibPunkt(px, py);
      if (px > 0.4) warRechts = true;
      if (py > 0.4) warOben = true;
      hud.kalibStimmtFrei(warRechts && warOben);
    };
    g.take();
    const stimmt = await hud.kalibSchritt(3, 'Prüfen',
      'Dreh nach rechts – der Punkt muss nach rechts. Kipp nach oben – der Punkt muss nach oben. „Stimmt“ wird frei, sobald er beides gemacht hat. Geht er in die falsche Richtung oder gar nicht: Nochmal.', null, { pruefen: true });
    punkt = null;
    return stimmt;
  };

  try {
    // Hierher kommt nur, wer **keine** Achsen hat oder ausdrücklich „Neu
    // kalibrieren“ getippt hat. Niemand sonst sieht diesen Bildschirm – ein
    // Prüfschritt bei jedem Einschalten ist eine Zumutung, kein Schutz.
    for (let versuch = 0; versuch < 5; versuch++) {
      g.kalibStart();
      let weiter = await hud.kalibSchritt(1, 'Nach links schwenken',
        'Halte das Handy wie eine Kamera vor dich. Richte es jetzt auf etwas, das LINKS von dir liegt – die ganze Hand schwenkt mit, wie beim Filmen. Nicht kippen, nicht wie ein Lenkrad drehen. Dann tipp auf Weiter.', fehler);
      if (!weiter) return false;
      const links = g.kalibEnde();
      if (!links) { fehler = 'Zu wenig Bewegung gemessen. Schwenk das Handy deutlicher – eine Vierteldrehung reicht.'; continue; }
      // Plausibilität: ein Schwenk dreht um die Hochachse, also um die Schwerkraft.
      // Ein Lenkrad-Drehen oder Kippen dreht quer dazu. Nur einmal warnen – falls
      // ein Gerät die Schwerkraft in einem anderen System meldet, geht es weiter.
      const hoch = g.hochanteil(links);
      if (hoch !== null && hoch < 0.5 && !gewarnt) {
        gewarnt = true;
        fehler = 'Das sah nach Kippen oder Lenkrad-Drehen aus, nicht nach einem Schwenk. Richte das Handy wie eine Kamera auf etwas links von dir.';
        continue;
      }

      g.kalibStart();
      weiter = await hud.kalibSchritt(2, 'Nach oben kippen',
        'Jetzt richte die Kamera auf die Decke: Oberkante des Handys von dir weg kippen. Dann Weiter.', null);
      if (!weiter) return false;
      const oben = g.kalibEnde();
      if (!oben) { fehler = 'Zu wenig Bewegung beim Kippen. Beide Bewegungen bitte nochmal.'; continue; }

      if (!g.kalibSetzen(links, oben)) {
        fehler = 'Die beiden Bewegungen waren fast gleich. Erst schwenken, dann kippen – deutlich verschieden.';
        continue;
      }

      if (await pruefen()) { g.kalibBestaetigen(); return true; }
      // Nicht bestanden heißt: die gemessenen Achsen sind nichts wert. Sie
      // stehen gar nicht erst im Speicher und werden hier auch aus dem
      // laufenden Zustand geworfen.
      g.kalibVerwerfen();
      fehler = null;   // „Nochmal“ ist kein Fehler – einfach von vorn
    }
    return false;
  } finally {
    lauf = false;
    hud.kalibAus();
  }
}
hud.onGyro = async () => {
  sound.klick();
  const g = input.gyro;
  if (g.einst.an && g.laeuft) { g.ausschalten(); hud.gyroStand(false); return false; }
  if (!(await g.einschalten())) { hud.gyroStand(false); return false; }     // keine Erlaubnis
  // **Ein Tipp schaltet ein und lässt an.** Gemessen wird nur, wenn es nichts
  // zu messen gibt: ohne Achsen kann der Gyro nicht zielen. Sind welche da,
  // kommt kein Bildschirm dazwischen – stimmt die Richtung nicht, drehen die
  // Pfeile neben dem Kompass sie um, und „Neu kalibrieren“ misst neu.
  const ok = g.hatAchsen || await gyroKalibrieren();
  if (!ok) g.ausschalten();
  hud.gyroStand(ok, g.einst);
  return ok;
};
// War der Gyro beim letzten Mal an, soll er es wieder sein. iOS gibt den Sensor
// aber nur aus einer Nutzergeste heraus frei – also bei der ersten Berührung
// nachholen, was beim Laden nicht ging.
const gyroNachholen = async () => {
  const g = input.gyro;
  if (!g.einst.an || g.laeuft || !g.hatAchsen) return;
  await g.einschalten().catch(() => {});
  hud.gyroStand(g.einst.an && g.laeuft, g.einst);
};
for (const ev of ['click', 'touchend', 'keydown']) addEventListener(ev, gyroNachholen, { once: true, capture: true });
hud.onGyroKalib = async () => {
  sound.klick();
  const g = input.gyro;
  if (!(await g.einschalten())) return;
  // „Neu kalibrieren“ heißt neu messen, nicht nur nachprüfen.
  const ok = await gyroKalibrieren();
  if (!ok && !g.hatAchsen) g.ausschalten();
  hud.gyroStand(g.einst.an && g.laeuft, g.einst);
};
if (input.touch) input.touch.onKalib = () => hud.onGyroKalib();
hud.onGyroStaerke = (v) => input.gyro.staerke(v);
hud.onGyroUmkehr = (achse, an) => input.gyro.umkehren(achse, an);
hud.gyroStand(input.gyro.einst.an && input.gyro.laeuft, input.gyro.einst);
hud.onWeiter = () => { sound.klick(); hud.ende(null); hud.showMenu(true); };

// Figuren und Arena-Props laden, dann Arena bauen, dann Menü freigeben
hud.showMenu(false); hud.loading('Wird geladen …');
Promise.all([
  preloadCharacters((p) => hud.loading(`Figuren … ${Math.round(p * 100)}%`), Object.values(CLASSES).map(c => c.model)),
  preloadProps(WORLD_PROPS, (p) => hud.loading(`Arena … ${Math.round(p * 100)}%`)),
  REAL ? preloadTextures((p) => hud.loading(`Oberflächen … ${Math.round(p * 100)}%`)) : null,
  REAL ? ladeHimmel((p) => hud.loading(`Himmel … ${Math.round(p * 100)}%`)) : null,
])
  .then(() => {
    world = buildWorld(scene, renderer);
    // Das Navigationsgitter kommt **nach** dem Weltaufbau: es liest die
    // fertigen Kollisionsquader. Gebaut wird es hier und nicht in `world.js`,
    // damit die beiden Module nicht im Kreis voneinander abhängen.
    world.nav = new Navgitter(world, WELT);
    // Bilder der Figuren für die Klassenwahl. Aus der Ich-Perspektive sieht man
    // die eigene Figur nie – ohne diese Vorschau wählt man blind.
    hud.klassenBilder(klassenBilder(Object.values(CLASSES)));
    hud.loading(null); hud.showMenu(true);
  })
  .catch((err) => {
    console.error(err);
    hud.loading('Assets konnten nicht geladen werden. Liegen die Modelle in public/assets/?');
  });

if (!TOUCH) {
  canvas.addEventListener('click', () => { if (running && document.pointerLockElement !== canvas) canvas.requestPointerLock(); });
  document.addEventListener('pointerlockchange', () => hud.hint(running && document.pointerLockElement !== canvas));
}

/**
 * Testschalter `?tempo=N`: N Rechenschritte je Bild statt einem.
 *
 * Im kopflosen Browser zeichnet die Software-Grafik etwa ein Bild je Sekunde,
 * und weil ein Schritt auf 50 ms gedeckelt ist, vergeht dort im Spiel nur ein
 * Zwanzigstel der Zeit: eine Messung über drei Minuten wäre neun Sekunden
 * Spiel. Mit `tempo` laufen Bots, Waffen und Modus schneller, gezeichnet wird
 * weiter einmal je Bild. Am normalen Spiel (ohne Schalter) ändert sich nichts.
 */
const TEMPO = Math.max(1, Math.min(100, +new URLSearchParams(location.search).get("tempo") || 1));

/** Ein Rechenschritt: alles, was sich um dt weiterbewegt. */
function simulieren(dt) {
  time += dt;
  world.leben?.update(dt, dom);
  const alle = [player, ...bots];
  const wasDead = player.dead;
  // Der Spieler schießt nur auf die andere Mannschaft
  player.update(dt, bots.filter(b => !b.dead && b.team !== player.team), fx);
  sound.listener(player.eye, player.yaw);   // Ohr sitzt am Auge und dreht mit
  // Der Schattenausschnitt wandert mit: eng um den Spieler statt über die ganze
  // Stadt gespannt (siehe lichtFolgen in world.js).
  world.lichtFolgen?.(player.pos);
  if (player.dead && player.respawnIn <= 0) player.spawn(pickSpawn(bots, dom ? player.team : null));
  for (const b of bots) {
    b.update(dt, alle.filter(a => !a.dead && a.team !== b.team), bots, fx, dom);
    if (b.dead && b.respawnIn <= 0) b.spawn(pickSpawn(alle, dom ? b.team : null));
  }
  // Wer den Spieler erwischt hat, steht seit dem letzten Treffer fest
  if (!wasDead && player.dead) hud.kill(`${player.letzterSchuetze?.name ?? 'Ein Gegner'} → Du`);
  dom?.update(dt, alle);
  fx.update(dt);
}

/**
 * Bildrate beobachten. Die fotorealistische Fassung kostet, und nicht jedes
 * Gerät trägt sie. Statt sie dort einfach ruckeln zu lassen, wird sie
 * stufenweise billiger; reicht auch das nicht, startet das Spiel beim
 * nächsten Mal im Comic-Stil. Wer den Stil selbst gewählt hat, wird nicht
 * bevormundet – das entscheidet `stilZurueckfallen()`.
 */
const LEISTUNG = { fenster: 100, sparenUnter: 26, aufgebenUnter: 19 };
const bildzeiten = [];
function leistungPruefen(dt) {
  if (!REAL) return;
  bildzeiten.push(dt);
  if (bildzeiten.length < LEISTUNG.fenster) return;
  const sortiert = [...bildzeiten].sort((a, b) => a - b);
  const median = sortiert[Math.floor(sortiert.length / 2)];
  bildzeiten.length = 0;
  const fps = 1 / Math.max(median, 1e-4);
  if (fps >= LEISTUNG.sparenUnter) return;
  const weg = pipeline.sparsam();
  if (weg) { hud.kill(`Zu langsam – ${weg} aus`); return; }
  if (figurenKuerzen()) return;
  if (fps < LEISTUNG.aufgebenUnter && stilZurueckfallen()) {
    hud.kill('Zu langsam – nächster Start im Comic-Stil');
  }
}

/**
 * Der letzte Regler vor dem Stilwechsel: weniger Figuren.
 *
 * Eine Figur kostet Skelett, Animation, Wegsuche und einen Schatten – auf
 * zwölf Figuren summiert sich das. Genommen wird paarweise, je eine aus jeder
 * Mannschaft, sonst verschiebt das Sparen den Spielstand. Unter acht Figuren
 * wird nicht gekürzt; dann ist die Karte leer und das Spiel kaputtgespart.
 */
function figurenKuerzen() {
  if (bots.length < 7 || zuvielFiguren >= 4) return false;
  for (const team of [0, 1]) {
    const i = bots.findLastIndex(b => b.team === team);
    if (i < 0) continue;
    bots[i].dispose(); bots.splice(i, 1); zuvielFiguren++;
  }
  hud.kill(`Zu langsam – ${zuvielFiguren} Figuren weniger`);
  return true;
}

let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const roh = (now - last) / 1000;              // echte Bildzeit, ungedeckelt
  const dt = Math.min(0.05, roh); last = now;
  if (input.takeMute()) hud.tonStand(sound.schalten());
  if (input.takeSicht() && player) { sound.klick(); player.sichtUmschalten(); }
  if (input.takeMenu() && running) { running = false; input.showTouch(false); hud.showMenu(true); hud.hint(false); }
  // Im Menü sammelt sich sonst Drehung an, die beim Start den Blick wegreißt –
  // außer während der Kalibrierung, da liest der Prüfschritt den Puffer selbst.
  if (!running) { if (!kalibLaeuft) input.gyro.leeren(); pipeline.render(scene, camera); return; }
  leistungPruefen(roh);
  for (let i = 0; i < TEMPO && running; i++) simulieren(dt);
  hud.update(player, bots, time);
  pipeline.render(scene, camera);
}
requestAnimationFrame(loop);
