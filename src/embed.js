/**
 * Eingebettete Assets für den Einzeldatei-Build.
 *
 * Normalerweise lädt das Spiel Modelle und Texturen über das Netz. Für eine
 * Auslieferung als einzelne HTML-Datei (z. B. als Artefakt) liegen sie
 * base64-kodiert in `window.__CC_EMBED`; dann wird nichts nachgeladen.
 */
const TABLE = typeof window !== 'undefined' ? window.__CC_EMBED : null;

/** Rohdaten eines eingebetteten Assets, oder null wenn normal geladen wird. */
export function embeddedBytes(path) {
  const b64 = TABLE?.[path];
  if (!b64) return null;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
