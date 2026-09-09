import * as THREE from 'three';
import { CLASSES } from './classes.js';
import { buildWorld, WORLD_PROPS } from './world.js';
import { Player } from './player.js';
import { Bot } from './bots.js';
import { Hud } from './hud.js';
import { Pipeline } from './render.js';
import { preloadCharacters, preloadProps } from './assets.js';
import { REAL } from './style.js';
import { preloadTextures } from './surface.js';
import { Input } from './input.js';
import { TOUCH, QUALITY } from './device.js';
import { Sound } from './sound.js';
import { Domination, TEAMS } from './domination.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, QUALITY.pixelRatio));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(80, 1, 0.05, 300);
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

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  pipeline.setSize(innerWidth, innerHeight, renderer.getPixelRatio());
}
addEventListener('resize', resize); resize();

/**
 * Spawn möglichst weit weg von allen lebenden Figuren. Bei Domination kommen
 * nur die Plätze der eigenen Mannschaftshälfte in Frage, sonst landet man
 * mitten unter Gegnern.
 */
function pickSpawn(avoid, team = null) {
  const plaetze = team == null ? world.spawns : world.spawns.filter(s => seite(s) === team);
  let best = null, bd = -1;
  for (const s of (plaetze.length ? plaetze : world.spawns)) {
    const d = avoid.filter(a => a && !a.dead).reduce((m, a) => Math.min(m, a.pos.distanceTo(s)), 1e9);
    if (d > bd) { bd = d; best = s; }
  }
  return best;
}
/** Arenahälfte eines Punktes: Südwesten gehört Rot, Nordosten Blau. */
const seite = (v) => (v.x + v.z < 0 ? 0 : 1);

function start(clsId) {
  if (player) player.dispose();
  for (const b of bots) b.dispose();
  dom?.dispose(); dom = null;
  sound.resume();                        // Browser lassen Ton erst nach einer Geste zu
  const domination = hud.modus === 'domination';

  player = new Player(camera, CLASSES[clsId], world, scene, input, sound);
  const ids = Object.keys(CLASSES);
  // Deathmatch: der Spieler allein gegen fünf Bots. Domination: drei gegen drei.
  const teams = domination ? [0, 0, 1, 1, 1] : [1, 1, 1, 1, 1];
  bots = teams.map((team, i) => {
    const b = new Bot(scene, world, ids[i % ids.length], sound, team);
    b.onDeath = () => {
      // Nur gegnerische Abschüsse zählen für den Spieler
      if (b.team !== player.team) { player.kills++; hud.kill(`Du → ${b.name}`); sound.abschuss(); }
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
hud.onCustomize = () => {
  sound.klick();
  // Menü ausblenden, Bedienung über dem eingefrorenen Bild anordnen
  hud.showMenu(false);
  input.touch.onDone = () => { input.touch.edit(false); hud.showMenu(true); };
  input.touch.edit(true);
};
hud.onPause = () => { if (running) { sound.klick(); running = false; input.showTouch(false); hud.showMenu(true); hud.hint(false); } };
hud.onModus = () => sound.klick();
// Gyroskop: der Knopf ist die Nutzergeste, die iOS für die Erlaubnis verlangt
hud.onGyro = async () => {
  sound.klick();
  const an = await input.gyro.schalten();
  hud.gyroAbgelehnt = !an && input.gyro.einst.an === false;
  return an;
};
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
])
  .then(() => { world = buildWorld(scene, renderer); hud.loading(null); hud.showMenu(true); })
  .catch((err) => {
    console.error(err);
    hud.loading('Assets konnten nicht geladen werden. Liegen die Modelle in public/assets/?');
  });

if (!TOUCH) {
  canvas.addEventListener('click', () => { if (running && document.pointerLockElement !== canvas) canvas.requestPointerLock(); });
  document.addEventListener('pointerlockchange', () => hud.hint(running && document.pointerLockElement !== canvas));
}

let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (input.takeMute()) hud.tonStand(sound.schalten());
  if (input.takeMenu() && running) { running = false; input.showTouch(false); hud.showMenu(true); hud.hint(false); }
  if (!running) { input.gyro.leeren(); pipeline.render(scene, camera); return; }
  time += dt;
  const alle = [player, ...bots];
  const wasDead = player.dead;
  // Der Spieler schießt nur auf die andere Mannschaft
  player.update(dt, bots.filter(b => !b.dead && b.team !== player.team), fx);
  sound.listener(player.eye, player.yaw);   // Ohr sitzt am Auge und dreht mit
  if (player.dead && player.respawnIn <= 0) player.spawn(pickSpawn(bots, dom ? player.team : null));
  for (const b of bots) {
    b.update(dt, alle.filter(a => !a.dead && a.team !== b.team), bots, fx, dom);
    if (b.dead && b.respawnIn <= 0) b.spawn(pickSpawn(alle, dom ? b.team : null));
  }
  if (!wasDead && player.dead) hud.kill(`Ein Gegner → Du`);
  dom?.update(dt, alle);
  fx.update(dt);
  hud.update(player, bots, time);
  pipeline.render(scene, camera);
}
requestAnimationFrame(loop);
