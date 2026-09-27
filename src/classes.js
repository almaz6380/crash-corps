// Alle Gameplay-Werte der Klassen. Nur hier ändern.
// `model` verweist auf einen Eintrag in assets.js (Datei in public/assets/).
export const CLASSES = {
  brawler: {
    id: 'brawler', name: 'Grimmbart', tagline: 'Viel Panzer, kurze Lunte.',
    hp: 160, speed: 5.2, color: 0xb65a2a, accent: 0xffd166,
    weapon: 'shotgun', special: 'charge', body: { width: 1.3, height: 1.95, head: 0.5 },
    model: 'qua_barbar',
  },
  scout: {
    id: 'scout', name: 'Nachtschatten', tagline: 'Schnell rein, schneller raus.',
    hp: 90, speed: 7.8, color: 0x2ab7ca, accent: 0xf6f0e8,
    weapon: 'smg', special: 'dash', body: { width: 0.9, height: 1.8, head: 0.42 },
    model: 'qua_schurke',
  },
  marksman: {
    id: 'marksman', name: 'Runenweber', tagline: 'Ein Zauber, ein Punkt.',
    hp: 110, speed: 5.8, color: 0x8c6bd4, accent: 0x6fd8ff,
    weapon: 'rifle', special: 'focus', body: { width: 1.0, height: 1.85, head: 0.44 },
    model: 'qua_magier',
  },
};

/**
 * Spezialfähigkeiten.
 *
 * Der Sturmangriff hat lange nur schnell gemacht – ein Angriff, bei dem nichts
 * passierte. `schaden` und `stoss` geben ihm Wirkung: wer im Lauf getroffen
 * wird, verliert Leben und fliegt zur Seite. `reichweite` ist der Abstand, in
 * dem das zählt, und jeder Gegner wird je Angriff nur einmal erwischt.
 *
 * `focus` verdoppelte den Schaden. Zusammen mit Kopftreffern wären das 4× –
 * ein Schuss, jede Klasse tot, aus jeder Entfernung. 1,6× bleibt spürbar, und
 * die Obergrenze aus Zone × Spezial liegt bei `MAX_FAKTOR` in weapons.js.
 */
export const SPECIALS = {
  charge: { cooldown: 8, duration: 0.6, speedMul: 3.2, schaden: 45, stoss: 7, reichweite: 1.6 },
  dash:   { cooldown: 4.5, duration: 0.25, speedMul: 4.5 },
  focus:  { cooldown: 10, duration: 3, damageMul: 1.6, fovZoom: 0.55 },
};
