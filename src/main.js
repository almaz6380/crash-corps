import * as THREE from 'three';
import { CLASSES } from './classes.js';
import { buildWorld } from './world.js';
import { Player } from './player.js';
import { Bot } from './bots.js';
import { Hud } from './hud.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(80, 1, 0.05, 300);
camera.userData.canvas = canvas;
scene.add(camera);

const world = buildWorld(scene);
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
  update(dt) {
    for (const it of this.items) { it.t -= dt; it.line.material.opacity = it.t / 0.12; }
    this.items = this.items.filter(it => { if (it.t <= 0) { scene.remove(it.line, it.spark); return false; } return true; });
  },
};

let player = null, bots = [], time = 0, running = false;

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
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
  if (player) camera.remove(player.viewmodel);
  for (const b of bots) scene.remove(b.mesh);
  player = new Player(camera, CLASSES[clsId], world);
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
hud.showMenu(true);

canvas.addEventListener('click', () => { if (running && document.pointerLockElement !== canvas) canvas.requestPointerLock(); });
document.addEventListener('pointerlockchange', () => hud.hint(running && document.pointerLockElement !== canvas));
addEventListener('keydown', e => { if (e.code === 'Escape' && running) { running = false; hud.showMenu(true); } });

let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!running) { renderer.render(scene, camera); return; }
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
  renderer.render(scene, camera);
}
requestAnimationFrame(loop);
