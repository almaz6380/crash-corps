import fs from 'node:fs';
import path from 'node:path';
import { runtimeAssets } from './assets-liste.mjs';

/**
 * Trägt die Vorlade-Liste und eine Version in dist/sw.js ein.
 * Ohne das kennt der Service Worker die Modelle nicht und kann sie nicht
 * vorhalten – dann läuft das Spiel offline nur zufällig.
 *
 * Läuft automatisch nach `npm run build`.
 */
const DIST = 'dist';
const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
const gebaut = [...html.matchAll(/(?:src|href)="\.?\/?(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
const version = (gebaut.find((f) => f.endsWith('.js')) || 'v1').replace(/.*index-|\.js$/g, '') || 'v1';

const liste = [...new Set([...gebaut, ...runtimeAssets()])].map((p) => './' + p);
const sw = fs.readFileSync(path.join(DIST, 'sw.js'), 'utf8')
  .replace("'__VERSION__'", JSON.stringify(version))
  .replace('__ASSETS__', JSON.stringify(liste, null, 0));
fs.writeFileSync(path.join(DIST, 'sw.js'), sw);
console.log(`sw.js: Version ${version}, ${liste.length} Dateien vorgemerkt`);
