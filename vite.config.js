import { defineConfig } from 'vite';

// Relative Pfade: damit läuft der Build auch in einem Unterordner
// (GitHub Pages, Netlify, oder direkt vom Dateisystem).
// Bauzeit als Stempel im Menü, damit nie unklar ist, welche Fassung gerade läuft
const stempel = new Date().toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });

export default defineConfig({
  define: { __BUILD__: JSON.stringify(stempel) },
  base: './',
  build: { chunkSizeWarningLimit: 900 },
});
