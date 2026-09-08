/**
 * Gerät und Leistungsstufe. Auf Handys ist alles teurer: kleinere Auflösung,
 * kleinere Schattenkarte, keine Umgebungsverdeckung.
 */
const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;

/** Touch-Bedienung: erkannt oder erzwungen über ?touch=1 (zum Testen am Rechner). */
export const TOUCH = q?.get('touch') === '1' || (
  typeof matchMedia !== 'undefined' &&
  matchMedia('(pointer: coarse)').matches &&
  (navigator.maxTouchPoints || 0) > 0
);

/** Grobe Leistungsstufe. ?leistung=hoch|niedrig überschreibt die Erkennung. */
const forced = q?.get('leistung');
export const LOW_END = forced ? forced === 'niedrig' : TOUCH;

/** Zielhilfe: auf Touch an, sonst aus. ?zielhilfe=an|aus überschreibt das. */
const aimForced = q?.get('zielhilfe');
export const AIM_ASSIST = aimForced ? aimForced === 'an' : TOUCH;

export const QUALITY = {
  pixelRatio: LOW_END ? 1.4 : 2,
  shadowSize: LOW_END ? 1024 : 2048,
  ao: !LOW_END,              // Umgebungsverdeckung kostet 16 Abtastungen je Bildpunkt
  shadowRadius: LOW_END ? 1 : 3,
};
