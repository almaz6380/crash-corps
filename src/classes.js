// Alle Gameplay-Werte der Klassen. Nur hier ändern.
// `model` verweist auf einen Eintrag in assets.js (Datei in public/assets/).
export const CLASSES = {
  brawler: {
    id: 'brawler', name: 'Grimmbart', tagline: 'Viel Panzer, kurze Lunte.',
    hp: 160, speed: 5.2, color: 0xb65a2a, accent: 0xffd166,
    weapon: 'shotgun', special: 'charge', body: { width: 1.3, height: 2.0, head: 0.5 },
    model: 'kay_barbar',
  },
  scout: {
    id: 'scout', name: 'Nachtschatten', tagline: 'Schnell rein, schneller raus.',
    hp: 90, speed: 7.8, color: 0x2ab7ca, accent: 0xf6f0e8,
    weapon: 'smg', special: 'dash', body: { width: 0.9, height: 1.72, head: 0.42 },
    model: 'kay_schurke',
  },
  marksman: {
    id: 'marksman', name: 'Runenweber', tagline: 'Ein Zauber, ein Punkt.',
    hp: 110, speed: 5.8, color: 0x8c6bd4, accent: 0x6fd8ff,
    weapon: 'rifle', special: 'focus', body: { width: 1.0, height: 1.85, head: 0.44 },
    model: 'kay_magier',
  },
};

export const SPECIALS = {
  charge: { cooldown: 8, duration: 0.6, speedMul: 3.2 },
  dash:   { cooldown: 5, duration: 0.25, speedMul: 4.5 },
  focus:  { cooldown: 10, duration: 3, damageMul: 2, fovZoom: 0.55 },
};
