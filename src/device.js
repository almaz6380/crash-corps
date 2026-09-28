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

/**
 * Zielhilfe: auf Touch an, sonst aus. `?zielhilfe=an|aus` überschreibt das, und
 * der Knopf im Menü merkt sich die Wahl.
 *
 * Umschaltbar muss sie sein, weil sie sich nicht messen lässt: ob eine
 * Zielhilfe hilft oder im Weg ist, sagt nur der, der sie benutzt – und ohne
 * Schalter kann er es nicht ausprobieren und mir auch nicht sagen.
 */
const aimForced = q?.get('zielhilfe');
const ZIELHILFE_KEY = 'crashcorps.zielhilfe';
let zielhilfe = (() => {
  if (aimForced) return aimForced === 'an';
  try {
    const v = localStorage.getItem(ZIELHILFE_KEY);
    if (v !== null) return v === 'an';
  } catch { /* privater Modus */ }
  return TOUCH;
})();

/** Ist die Zielhilfe gerade an? Als Funktion, damit der Schalter sofort wirkt. */
export const zielhilfeAn = () => zielhilfe;

/** Zielhilfe umschalten und merken. @returns {boolean} der neue Stand */
export function zielhilfeSetzen(an) {
  zielhilfe = !!an;
  try { localStorage.setItem(ZIELHILFE_KEY, zielhilfe ? 'an' : 'aus'); } catch { /* privater Modus */ }
  return zielhilfe;
}


export const QUALITY = {
  // Auf dem Handy stand hier 1,4, und das ist der Grund, warum das Bild dort
  // weich aussieht: ein iPhone hat dreifache Bildpunktdichte, gezeichnet wurde
  // also mit weniger als der halben Auflösung des Schirms, und den Rest hat der
  // Browser hochskaliert. Ein Testflug hat gezeigt, dass Bildpunkte dort gar
  // nicht das Teure sind – „halbe Auflösung" brachte null –, also ist der Weg
  // nach oben frei. Wird es doch zu viel, nimmt die Sparleiter es in zwei
  // Stufen zurück (0,7 und 0,55), und die reagiert jetzt in anderthalb
  // Sekunden statt in einer halben Minute.
  pixelRatio: 2,
  shadowSize: LOW_END ? 1024 : 2048,
  ao: !LOW_END,              // Umgebungsverdeckung kostet 16 Abtastungen je Bildpunkt
  bloom: !LOW_END,           // Streulicht: drei zusätzliche Durchgänge in halber Auflösung
  shadowRadius: LOW_END ? 1 : 3,
  // Kantenglättung am Farb-Target. Bei doppelter Bildpunktdichte sind die
  // Bildpunkte auf einem Handy so klein, dass vierfache Abtastung kaum noch
  // etwas hinzufügt – die Bandbreite steckt man besser in die Auflösung.
  samples: LOW_END ? 2 : 4,
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
