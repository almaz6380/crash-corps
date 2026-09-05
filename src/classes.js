// Alle Gameplay-Werte der Klassen. Nur hier ändern.
export const CLASSES = {
  brawler: {
    id: 'brawler', name: 'Rammbock', tagline: 'Viel Panzer, kurze Lunte.',
    hp: 160, speed: 5.2, color: 0xe0522a, accent: 0xffd166,
    weapon: 'shotgun', special: 'charge', body: { width: 1.3, height: 1.9, head: 0.5 },
  },
  scout: {
    id: 'scout', name: 'Flitzer', tagline: 'Schnell rein, schneller raus.',
    hp: 90, speed: 7.8, color: 0x2ab7ca, accent: 0xf6f0e8,
    weapon: 'smg', special: 'dash', body: { width: 0.9, height: 1.7, head: 0.42 },
  },
  marksman: {
    id: 'marksman', name: 'Adlerauge', tagline: 'Ein Schuss, ein Punkt.',
    hp: 110, speed: 5.8, color: 0x7bb661, accent: 0x3a2e2a,
    weapon: 'rifle', special: 'focus', body: { width: 1.0, height: 1.85, head: 0.44 },
  },
};

export const SPECIALS = {
  charge: { cooldown: 8, duration: 0.6, speedMul: 3.2 },
  dash:   { cooldown: 5, duration: 0.25, speedMul: 4.5 },
  focus:  { cooldown: 10, duration: 3, damageMul: 2, fovZoom: 0.55 },
};
