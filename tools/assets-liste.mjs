import fs from 'node:fs';

/**
 * Welche Assets holt das Spiel zur Laufzeit wirklich?
 * Wird von tools/einzeldatei.mjs und tools/sw-liste.mjs genutzt, damit beide
 * dieselbe Auswahl treffen (ungenutzte Alternativ-Modelle bleiben draußen).
 *
 * Zwei Gruppen, weil sie verschieden behandelt werden:
 *  - **grund**: Figuren und Bausatzteile. Ohne sie startet nichts, sie gehören
 *    ins Offline-Paket.
 *  - **real**: Himmel und Fotooberflächen des realistischen Stils. Zusammen
 *    mehrere Megabyte, gebraucht nur in diesem Stil – die werden nachgeladen
 *    und erst danach zwischengespeichert. Sonst käme niemand mehr unter die
 *    8 MB, die ein Offline-Paket haben soll.
 */
export function runtimeAssets() {
  const { grund, real } = assetGruppen();
  return [...grund, ...real];
}

/** Dieselbe Auswahl, aber getrennt nach Grundpaket und Realismus-Satz. */
export function assetGruppen() {
  const classes = fs.readFileSync('src/classes.js', 'utf8');
  const models = [...classes.matchAll(/model:\s*'([^']+)'/g)].map((m) => m[1]);
  const world = fs.readFileSync('src/world.js', 'utf8');
  // Einzel-Props stehen als 'Name', Bausatzteile als 'bausatz:Teil' – vom
  // Bausatz wird die eine Sammeldatei gebraucht, nicht das einzelne Teil.
  const props = [...world.matchAll(/'([A-Za-z0-9_]+)(?::[A-Za-z0-9_.]+)?'/g)]
    .map((m) => m[1])
    .filter((n) => fs.existsSync(`public/assets/props/${n}.glb`));
  const texSets = fs.existsSync('public/assets/textures')
    ? fs.readdirSync('public/assets/textures').filter((d) => fs.statSync(`public/assets/textures/${d}`).isDirectory())
    : [];

  const grund = [], real = [];
  for (const m of new Set(models)) grund.push(`assets/characters/${m}.glb`);
  for (const p of new Set(props)) grund.push(`assets/props/${p}.glb`);
  for (const t of texSets) for (const f of ['diff', 'nor', 'rough']) real.push(`assets/textures/${t}/${f}.jpg`);
  if (fs.existsSync('public/assets/hdri/himmel.hdr')) real.push('assets/hdri/himmel.hdr');
  const da = (rel) => fs.existsSync(`public/${rel}`);
  return { grund: grund.filter(da), real: real.filter(da) };
}
