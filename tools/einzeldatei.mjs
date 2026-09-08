/**
 * Packt den fertigen Build in eine einzelne HTML-Datei: Skript und Stile
 * eingebettet, Modelle und Texturen base64-kodiert. Damit läuft das Spiel
 * ohne Server und ohne Nachladen – etwa als Artefakt oder von einem USB-Stick.
 *
 *   npm run build && node tools/einzeldatei.mjs [ausgabe.html]
 */
import fs from 'node:fs';
import path from 'node:path';

const DIST = 'dist';
const out = process.argv[2] || 'dist/crash-corps-einzeldatei.html';

// Welche Assets werden zur Laufzeit wirklich geholt?
const classes = fs.readFileSync('src/classes.js', 'utf8');
const models = [...classes.matchAll(/model:\s*'([^']+)'/g)].map((m) => m[1]);
const world = fs.readFileSync('src/world.js', 'utf8');
const props = [...world.matchAll(/'([A-Za-z0-9_]+)'/g)]
  .map((m) => m[1])
  .filter((n) => fs.existsSync(`public/assets/props/${n}.glb`));
const texSets = fs.readdirSync('public/assets/textures').filter((d) =>
  fs.statSync(`public/assets/textures/${d}`).isDirectory());

const embed = {};
const add = (rel) => {
  const file = path.join('public', rel);
  if (!fs.existsSync(file)) return;
  embed[rel] = fs.readFileSync(file).toString('base64');
};
for (const m of new Set(models)) add(`assets/characters/${m}.glb`);
for (const p of new Set(props)) add(`assets/props/${p}.glb`);
for (const t of texSets) for (const f of ['diff', 'nor', 'rough']) add(`assets/textures/${t}/${f}.jpg`);

// Gebautes HTML zerlegen und Skript/Stil einbetten
const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
const jsRef = html.match(/<script[^>]*src="([^"]+\.js)"/)?.[1];
const cssRef = html.match(/<link[^>]*href="([^"]+\.css)"/)?.[1];
if (!jsRef) throw new Error('Kein Skript im Build gefunden – erst npm run build');
const js = fs.readFileSync(path.join(DIST, jsRef.replace(/^\.\//, '')), 'utf8');
const css = cssRef ? fs.readFileSync(path.join(DIST, cssRef.replace(/^\.\//, '')), 'utf8') : '';

// Artefakte bekommen Rumpf und Kopf vom Host: nur Inhalt ausgeben
const doc = `<title>Crash Corps</title>
<style>
${css}
</style>
<canvas id="game"></canvas>
<div id="hud"></div>
<script>window.__CC_EMBED = ${JSON.stringify(embed)};</script>
<script type="module">
${js}
</script>
`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, doc);

const mb = (n) => (n / 1024 / 1024).toFixed(2) + ' MB';
console.log('Modelle:', Object.keys(embed).filter((k) => k.endsWith('.glb')).length,
  '· Texturen:', Object.keys(embed).filter((k) => k.endsWith('.jpg')).length);
console.log('Rohdaten:', mb(Object.values(embed).reduce((a, b) => a + b.length * 0.75, 0)));
console.log('Datei:', out, mb(fs.statSync(out).size));
