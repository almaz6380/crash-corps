import * as THREE from 'three';
import { CLASSES } from './classes.js';
import { buildWorld, WORLD_PROPS } from './world.js';
import { Player } from './player.js';
import { Bot } from './bots.js';
import { Hud } from './hud.js';
import { Pipeline } from './render.js';
import { preloadCharacters, preloadProps } from './assets.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(80, 1, 0.05, 300);
camera.userData.canvas = canvas;
scene.add(camera);
const pipeline = new Pipeline(renderer, camera);

let world = null;                      // wird nach dem Laden der Props gebaut
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

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  pipeline.setSize(innerWidth, innerHeight, renderer.getPixelRatio());
}
addEventListener('resize', resize); resize();

function pickSpawn(avoid) {
  // Spawn möglichst weit weg von allen lebenden Figuren
  let best = null, bd = -1;
  for (const s of world.spawns) {
    const d = avoid.filter(a => a && !a.dead).reduce((m, a) => Math.min(m, a.pos.distanceTo(s)), 1e9);
    if (d > bd) { bd = d; best = s; }
  }
  return best;
}

function start(clsId) {
  if (player) player.dispose();
  for (const b of bots) b.dispose();
  player = new Player(camera, CLASSES[clsId], world, scene);
  player.spawn(world.spawns[0]);
  const ids = Object.keys(CLASSES);
  bots = Array.from({ length: 5 }, (_, i) => {
    const b = new Bot(scene, world, ids[i % ids.length]);
    b.spawn(world.spawns[(i + 1) % world.spawns.length]);
    b.onDeath = () => { player.kills++; hud.kill(`Du → ${b.name}`); };
    return b;
  });
  time = 0; running = true;
  hud.showMenu(false); hud.hint(true);
  canvas.requestPointerLock();
}
hud.onPick = start;

// Figuren und Arena-Props laden, dann Arena bauen, dann Menü freigeben
hud.showMenu(false); hud.loading('Wird geladen …');
Promise.all([
  preloadCharacters((p) => hud.loading(`Figuren … ${Math.round(p * 100)}%`), Object.values(CLASSES).map(c => c.model)),
  preloadProps(WORLD_PROPS, (p) => hud.loading(`Arena … ${Math.round(p * 100)}%`)),
])
  .then(() => { world = buildWorld(scene, renderer); hud.loading(null); hud.showMenu(true); })
  .catch((err) => {
    console.error(err);
    hud.loading('Assets konnten nicht geladen werden. Liegen die Modelle in public/assets/?');
  });

canvas.addEventListener('click', () => { if (running && document.pointerLockElement !== canvas) canvas.requestPointerLock(); });
document.addEventListener('pointerlockchange', () => hud.hint(running && document.pointerLockElement !== canvas));
addEventListener('keydown', e => { if (e.code === 'Escape' && running) { running = false; hud.showMenu(true); } });

let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!running) { pipeline.render(scene, camera); return; }
  time += dt;
  const wasDead = player.dead;
  player.update(dt, bots.filter(b => !b.dead), fx);
  if (player.dead && player.respawnIn <= 0) player.spawn(pickSpawn(bots));
  for (const b of bots) {
    const wasBotDead = b.dead;
    b.update(dt, player, bots, fx);
    if (b.dead && b.respawnIn <= 0) b.spawn(pickSpawn([player, ...bots]));
  }
  if (!wasDead && player.dead) hud.kill(`Ein Bot → Du`);
  fx.update(dt);
  hud.update(player, bots, time);
  pipeline.render(scene, camera);
}
requestAnimationFrame(loop);
