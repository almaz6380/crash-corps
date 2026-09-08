import { defineConfig } from 'vite';

// Relative Pfade: damit läuft der Build auch in einem Unterordner
// (GitHub Pages, Netlify, oder direkt vom Dateisystem).
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 900 },
});
