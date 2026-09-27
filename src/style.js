/**
 * Darstellungsstil.
 *
 * "real" – fotografische Oberflächen, Himmelslicht aus einer HDRI, AgX-Kurve
 * "toon" – Cel-Shading mit Outline (die alte Optik, passt zu Cartoon-Modellen)
 *
 * Voreinstellung ist **real**; auf Touch-Geräten **toon**, weil die Bildrate
 * dort sonst nicht reicht. Die Wahl aus dem Menü liegt in `localStorage` und
 * gilt ab dem nächsten Laden – die halbe Szene hängt am Stil (Materialien,
 * Licht, Himmel, Render-Ziele), und die im laufenden Spiel umzubauen wäre ein
 * eigenes Stück Arbeit für wenig Gewinn.
 *
 * `?stil=real|toon` übersteuert weiterhin alles, für Messungen und Fehlersuche.
 */
const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;

export const STIL_KEY = 'crashcorps.stil';
/** Merker: hier trägt main.js ein, wenn die Bildrate zum Umschalten gezwungen hat. */
export const SCHWACH_KEY = 'crashcorps.stilSchwach';

const TOUCH = typeof matchMedia !== 'undefined'
  && matchMedia('(pointer: coarse)').matches
  && (navigator.maxTouchPoints || 0) > 0;

function gespeichert() {
  try { return localStorage.getItem(STIL_KEY); } catch { return null; }
}

function gewaehlt() {
  const ausAdresse = q?.get('stil');
  if (ausAdresse === 'real' || ausAdresse === 'toon') return ausAdresse;
  const gesp = gespeichert();
  if (gesp === 'real' || gesp === 'toon') return gesp;
  return TOUCH || q?.get('touch') === '1' ? 'toon' : 'real';
}

export const STYLE = gewaehlt();
export const REAL = STYLE === 'real';

/** Stil wählen. Wirkt erst nach dem Neuladen, deshalb lädt der Aufrufer neu. */
export function stilSetzen(stil) {
  try {
    localStorage.setItem(STIL_KEY, stil);
    localStorage.removeItem(SCHWACH_KEY);
  } catch { /* ohne Speicher gilt die Voreinstellung */ }
}

/** Hat das Spiel selbst zurückgeschaltet, weil es zu langsam lief? */
export function schwachGemerkt() {
  try { return localStorage.getItem(SCHWACH_KEY) === '1'; } catch { return false; }
}

/**
 * Zu langsam: auf Cartoon zurückfallen und das merken, damit der nächste Start
 * gar nicht erst mit der teuren Fassung anfängt. Gibt zurück, ob umgeschaltet
 * wurde – wer den Stil selbst gewählt hat, wird nicht bevormundet.
 */
export function stilZurueckfallen() {
  if (!REAL || gespeichert() === 'real' || q?.get('stil')) return false;
  try {
    localStorage.setItem(STIL_KEY, 'toon');
    localStorage.setItem(SCHWACH_KEY, '1');
  } catch { return false; }
  return true;
}
