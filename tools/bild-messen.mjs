#!/usr/bin/env node
/**
 * Bilder vergleichen, ohne sie anzusehen.
 *
 *   node tools/bild-messen.mjs vorher.png nachher.png …
 *
 * „Sieht besser aus“ ist beim Umbau der Grafik kein Befund. Diese drei Zahlen
 * sind einer:
 *  - **ausgebrannt**: Anteil reinweißer Bildpunkte. Ein Himmel, der ganz in
 *    Weiß liegt, hat keine Wolken mehr – das war der Kern des alten Fehlers.
 *  - **Tonwertumfang** (p1 bis p99): wie weit das Bild von dunkel nach hell
 *    reicht. Ein flaues Bild drängt sich in der Mitte.
 *  - **Mittel**: die Gesamthelligkeit, damit man Belichtungsänderungen sieht.
 */

const sharp = (await import('sharp')).default;

const dateien = process.argv.slice(2);
if (!dateien.length) {
  console.error('Aufruf: node tools/bild-messen.mjs <bild.png> [weitere …]');
  process.exit(1);
}

for (const datei of dateien) {
  const { data, info } = await sharp(datei).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = info.width * info.height;
  const lum = new Float32Array(n);
  let weiss = 0, schwarz = 0, summe = 0;
  for (let i = 0; i < n; i++) {
    const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lum[i] = l; summe += l;
    if (r > 250 && g > 250 && b > 250) weiss++;
    if (l < 8) schwarz++;
  }
  const s = Array.from(lum).sort((a, b) => a - b);
  const q = (x) => s[Math.floor(n * x)];
  const name = datei.split('/').pop();
  console.log(`${name.padEnd(26)} Mittel ${(summe / n).toFixed(0).padStart(3)}`
    + `   p1 ${q(0.01).toFixed(0).padStart(3)}  p50 ${q(0.5).toFixed(0).padStart(3)}  p99 ${q(0.99).toFixed(0).padStart(3)}`
    + `   Umfang ${(q(0.99) - q(0.01)).toFixed(0).padStart(3)}`
    + `   ausgebrannt ${(weiss / n * 100).toFixed(1).padStart(4)} %   tiefschwarz ${(schwarz / n * 100).toFixed(1)} %`);
}
