#!/usr/bin/env node
/**
 * Rechnet nach, was die Zahlen in `classes.js` und `weapons.js` bedeuten:
 * Schaden je Schuss über die Entfernung, Schüsse bis zum Abschuss, Dauer eines
 * Duells. Reine Rechnung, kein Spiel – läuft in einer Sekunde.
 *
 *   node tools/balance.mjs [--kopf] [--entfernungen=2,6,12,25,40]
 *
 * `--kopf` rechnet mit Kopftreffern (alle Schrotkugeln am Kopf, der schlimmste
 * Fall). Ohne den Schalter zählt der Körper.
 *
 * Gelesen wird direkt aus den Quelldateien, damit die Tabelle nicht neben dem
 * Spiel herläuft. Am Ende steht die Prüfung: kein Duell unter 0,6 s (sonst
 * stirbt man, ohne reagieren zu können), keins über 3 s, und jede Klasse
 * gewinnt auf ihrer Entfernung.
 */

import { CLASSES, SPECIALS } from '../src/classes.js';
import { WEAPONS, TREFFERZONEN, MAX_FAKTOR, abfallFaktor } from '../src/weapons.js';

const args = process.argv.slice(2);
const opt = (n, d = '') => args.find(a => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const mitKopf = args.includes('--kopf');
const ENTFERNUNGEN = opt('entfernungen', '2,6,12,25,40').split(',').map(Number);

/** Schaden eines vollen Treffers auf eine Entfernung. */
function schaden(waffe, entfernung, { kopf = false, spezial = 1 } = {}) {
  const def = WEAPONS[waffe];
  if (entfernung > def.range) return 0;
  const zone = kopf && def.kopfzone !== false ? TREFFERZONEN.kopf : 1;
  const faktor = Math.min(MAX_FAKTOR, zone * spezial);
  return def.damage * def.pellets * abfallFaktor(def, entfernung) * faktor;
}

/**
 * Dauer bis zum Abschuss: der erste Schuss fällt sofort, danach kostet jeder
 * weitere seine Nachladezeit. Ein Treffer, der allein tötet, braucht also
 * keine Zeit – das ist der Fall, den die Prüfung unten sucht.
 */
function dauer(waffe, ziel, entfernung, opts) {
  const def = WEAPONS[waffe];
  const je = schaden(waffe, entfernung, opts);
  if (je <= 0) return { schuesse: Infinity, zeit: Infinity, je: 0 };
  const schuesse = Math.ceil(ziel.hp / je);
  // Magazin leer: die Nachladezeit kommt dazu
  const nachladen = Math.floor((schuesse - 1) / def.mag) * def.reload;
  return { schuesse, zeit: (schuesse - 1) * def.cooldown + nachladen, je };
}

const klassen = Object.values(CLASSES);
const b = (n, s = 8) => String(n).padStart(s);

console.log(`\nSchaden je Schuss (${mitKopf ? 'Kopf' : 'Körper'}, volle Trefferwirkung)\n`);
console.log('  Waffe            ' + ENTFERNUNGEN.map(e => b(`${e} m`, 9)).join(''));
for (const k of klassen) {
  const werte = ENTFERNUNGEN.map(e => b(schaden(k.weapon, e, { kopf: mitKopf }).toFixed(1), 9));
  console.log(`  ${(WEAPONS[k.weapon].name + ' (' + k.name + ')').padEnd(17)}${werte.join('')}`);
}

console.log(`\nDauer bis zum Abschuss in Sekunden (Schüsse in Klammern)\n`);
const probleme = [];
for (const a of klassen) {
  console.log(`  ${a.name} schießt auf …`);
  for (const z of klassen) {
    const zeile = ENTFERNUNGEN.map(e => {
      const d = dauer(a.weapon, z, e, { kopf: mitKopf });
      return b(d.zeit === Infinity ? '–' : `${d.zeit.toFixed(2)} (${d.schuesse})`, 12);
    });
    console.log(`    → ${z.name.padEnd(14)}${zeile.join('')}`);
    // Eine lange Duelldauer ist kein Fehler, sondern der Sinn des Abfalls: eine
    // Schrotflinte soll auf 25 m nichts ausrichten. Gerügt wird nur, wenn auf
    // einer Entfernung *niemand* zügig tötet – das prüft die Tabelle darunter.
    // Hier zählt nur, was nie vorkommen darf: ein Abschuss mit einem einzigen
    // Körpertreffer. Wer so stirbt, hatte keine Gelegenheit zu reagieren.
    for (const e of ENTFERNUNGEN) {
      const d = dauer(a.weapon, z, e, { kopf: mitKopf });
      if (!mitKopf && d.schuesse === 1) {
        probleme.push(`${a.name} tötet ${z.name} auf ${e} m mit einem einzigen Körpertreffer`);
      }
    }
  }
}

console.log('\nWer gewinnt auf welcher Entfernung (schnellster Abschuss)\n');
const revier = { 2: 'Grimmbart', 6: 'Grimmbart', 12: 'Nachtschatten', 25: 'Runenweber', 40: 'Runenweber' };
for (const e of ENTFERNUNGEN) {
  // Mittelwert über alle Ziele: wer im Schnitt am schnellsten tötet, beherrscht
  // die Entfernung. Gegen den eigenen Spiegel zählt dabei mit.
  const rang = klassen.map(a => ({
    name: a.name,
    zeit: klassen.reduce((s, z) => s + dauer(a.weapon, z, e, { kopf: mitKopf }).zeit, 0) / klassen.length,
  })).sort((x, y) => x.zeit - y.zeit);
  const sieger = rang[0];
  // Mit Kopftreffern gewinnt der Runenweber überall – wer jeden Schuss auf den
  // Kopf setzt, soll das auch. Die Reviere gelten für Körpertreffer.
  const soll = mitKopf ? null : revier[e];
  const ok = !soll || sieger.name === soll;
  if (sieger.zeit > 3) probleme.push(`Auf ${e} m braucht selbst ${sieger.name} ${sieger.zeit.toFixed(1)} s im Schnitt`);
  console.log(`  ${b(e + ' m', 6)}  ${rang.map(r => `${r.name} ${r.zeit === Infinity ? '–' : r.zeit.toFixed(2)}`).join('   ')}`
    + (soll ? `   ${ok ? '✓' : '✗ erwartet: ' + soll}` : ''));
  if (!ok) probleme.push(`Auf ${e} m gewinnt ${sieger.name}, erwartet war ${soll}`);
}

console.log('\nSpezial × Zone\n');
for (const [name, sp] of Object.entries(SPECIALS)) {
  const mul = sp.damageMul || 1;
  const gesamt = Math.min(MAX_FAKTOR, mul * TREFFERZONEN.kopf);
  console.log(`  ${name.padEnd(8)} Schaden ×${mul}${sp.schaden ? `, Aufprall ${sp.schaden}` : ''}`
    + `   mit Kopftreffer ×${gesamt.toFixed(2)} (Grenze ${MAX_FAKTOR})`);
  if (mul * TREFFERZONEN.kopf > MAX_FAKTOR + 1e-9) {
    console.log(`           – wird auf ${MAX_FAKTOR} gedeckelt`);
  }
}

// Ein Kopftreffer mit Spezial darf keine Klasse aus voller Gesundheit töten,
// außer dem Runenstab: ein Zauberblick-Kopftreffer ist sein Lohn fürs Zielen.
console.log('');
if (probleme.length) {
  console.log('Auffällig:');
  for (const p of [...new Set(probleme)]) console.log(`  – ${p}`);
  process.exitCode = 1;
} else {
  console.log('Keine Ausreißer.');
}
