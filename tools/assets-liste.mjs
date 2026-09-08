import fs from 'node:fs';

/**
 * Welche Assets holt das Spiel zur Laufzeit wirklich?
 * Wird von tools/einzeldatei.mjs und tools/sw-liste.mjs genutzt, damit beide
 * dieselbe Auswahl treffen (ungenutzte Alternativ-Modelle bleiben draußen).
 */
export function runtimeAssets() {
  const classes = fs.readFileSync('src/classes.js', 'utf8');
  const models = [...classes.matchAll(/model:\s*'([^']+)'/g)].map((m) => m[1]);
  const world = fs.readFileSync('src/world.js', 'utf8');
  const props = [...world.matchAll(/'([A-Za-z0-9_]+)'/g)]
    .map((m) => m[1])
    .filter((n) => fs.existsSync(`public/assets/props/${n}.glb`));
  const texSets = fs.existsSync('public/assets/textures')
    ? fs.readdirSync('public/assets/textures').filter((d) => fs.statSync(`public/assets/textures/${d}`).isDirectory())
    : [];

  const out = [];
  for (const m of new Set(models)) out.push(`assets/characters/${m}.glb`);
  for (const p of new Set(props)) out.push(`assets/props/${p}.glb`);
  for (const t of texSets) for (const f of ['diff', 'nor', 'rough']) out.push(`assets/textures/${t}/${f}.jpg`);
  return out.filter((rel) => fs.existsSync(`public/${rel}`));
}
