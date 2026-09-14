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

/**
 * Das Bild ist immer quer. Hält jemand das Handy hochkant – etwa weil die
 * Drehsperre an ist und der Browser nicht drehen darf –, wird die ganze Bühne
 * per CSS um 90° gedreht statt einen Hinweis zu zeigen. Alle Maße und alle
 * Zeigerkoordinaten laufen deshalb über diese Funktionen, nie über
 * innerWidth/innerHeight direkt.
 * @returns {{w:number, h:number, gedreht:boolean}}
 */
export function bild() {
  const gedreht = TOUCH && innerHeight > innerWidth;
  return gedreht ? { w: innerHeight, h: innerWidth, gedreht } : { w: innerWidth, h: innerHeight, gedreht };
}

/** Bühne an die Fenstergröße anpassen; bei Bedarf drehen. Gibt die Bildmaße zurück. */
export function buehneAnpassen() {
  const b = bild();
  const el = document.getElementById('buehne');
  document.body.classList.toggle('gedreht', b.gedreht);
  // Ersatz für @media (max-height): die Abfrage sähe bei gedrehter Bühne das Fenster
  document.body.classList.toggle('klein', b.h <= 520);
  if (el) { el.style.width = `${b.w}px`; el.style.height = `${b.h}px`; }
  return b;
}

/** Zeigerposition aus Fensterkoordinaten in Bildkoordinaten. */
export function zuBild(x, y) {
  return bild().gedreht ? { x: y, y: innerWidth - x } : { x, y };
}
