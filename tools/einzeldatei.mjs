/**
 * Packt den fertigen Build in eine einzelne HTML-Datei: Skript und Stile
 * eingebettet, Modelle und Texturen base64-kodiert. Damit läuft das Spiel
 * ohne Server und ohne Nachladen – etwa als Artefakt oder von einem USB-Stick.
 *
 *   npm run build && node tools/einzeldatei.mjs [ausgabe.html]
 */
import fs from 'node:fs';
import path from 'node:path';
import { runtimeAssets } from './assets-liste.mjs';

const DIST = 'dist';
const out = process.argv[2] || 'dist/crash-corps-einzeldatei.html';

// Welche Assets werden zur Laufzeit wirklich geholt? Dieselbe Auswahl wie für
// die Vorlade-Liste des Service Workers – die Regel steht nur an einer Stelle,
// sonst wandert eine Änderung in die eine Datei und nicht in die andere.
const embed = {};
for (const rel of runtimeAssets()) {
  embed[rel] = fs.readFileSync(path.join('public', rel)).toString('base64');
}

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
