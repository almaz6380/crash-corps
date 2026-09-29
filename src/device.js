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


/**
 * Auflösung in drei benannten Stufen.
 *
 * `scharf` heißt **nativ**: `main.js` deckelt mit `devicePixelRatio`, auf einem
 * iPhone mit dreifacher Dichte wird dann 1:1 auf den Bildschirm gezeichnet und
 * der Browser skaliert gar nichts mehr. Genau das war vorher der Grund für die
 * Treppenstufen an jeder Dachkante: gezeichnet wurde mit 1,4, angezeigt mit 3.
 *
 * Warum überhaupt wählbar? Weil die Stufe Füllrate kostet und nur der
 * entscheiden kann, der auf das Bild schaut – gemessen werden kann hier nur,
 * was sie bringt, nicht, ob sie sich lohnt.
 */
const STUFEN = { sparsam: 1.4, normal: 2, scharf: 3 };
export const BILDPUNKT_STUFEN = ['sparsam', 'normal', 'scharf'];
const BILDPUNKTE_KEY = 'crashcorps.bildpunkte';
const bpForced = q?.get('bildpunkte');
let bildpunkte = (() => {
  if (bpForced && STUFEN[bpForced]) return bpForced;
  try {
    const v = localStorage.getItem(BILDPUNKTE_KEY);
    if (v && STUFEN[v]) return v;
  } catch { /* privater Modus */ }
  return 'scharf';
})();

/** Name der gewählten Stufe. */
export const bildpunkteStufe = () => bildpunkte;

/** Zahlenwert einer Stufe (ungedeckelt – den Deckel setzt `devicePixelRatio`). */
export const bildpunkteWert = (stufe = bildpunkte) => STUFEN[stufe] ?? STUFEN.normal;

/** Eine Stufe weiter, im Kreis. @returns {string} die neue Stufe */
export function bildpunkteWeiter() {
  const i = BILDPUNKT_STUFEN.indexOf(bildpunkte);
  bildpunkte = BILDPUNKT_STUFEN[(i + 1) % BILDPUNKT_STUFEN.length];
  try { localStorage.setItem(BILDPUNKTE_KEY, bildpunkte); } catch { /* privater Modus */ }
  return bildpunkte;
}

/**
 * Wie viele Abtastungen die Kantenglättung bei dieser Bildpunktdichte noch
 * verdient.
 *
 * Im Comic-Stil fast keine: der Umriss – die auffälligste Kante im Bild – wird
 * im Composite aus dem Normalen-Puffer gerechnet, und **der hat gar keine
 * Abtastung** (`this.normal` in `render.js`). Die Glättung am Farb-Target
 * erwischt also nur Polygonkanten, die der schwarze Strich ohnehin überdeckt.
 * Dieselbe Bandbreite in Auflösung gesteckt hilft beidem: bei gleichen Kosten
 * wie 2,0 mit zwei Abtastungen bekommt man 2,45 ohne, also 2068 statt 1688
 * Bildpunkte in der Breite.
 *
 * Auf dem Rechner bleibt es bei vier: im realen Stil ist der Umriss aus, und
 * dann ist die Kantenglättung die einzige Glättung, die es gibt.
 */
export const kantenFuer = (pixel) => (LOW_END ? (pixel >= 2.5 ? 0 : 2) : 4);

/**
 * Anisotrope Filterung für alles, was eine Textur auf eine Fläche legt.
 *
 * Ohne sie steht der Wert auf 1, und three nimmt dann für eine schräg stehende
 * Fläche die Mipmap-Stufe des **stärker** verkleinerten Randes – eine Straße,
 * die bis zum Horizont läuft, wird dadurch schon nach wenigen Metern zu Brei.
 * Genau das war der Bausatz, bis `assets.js` es bekam.
 *
 * Die Zahl steht hier und nicht in `assets.js`, weil `surface.js` sie auch
 * braucht und von `assets.js` selbst eingelesen wird – eine gemeinsame Zahl in
 * der Mitte spart den Ringschluss. 16 ist der übliche Höchstwert; three
 * deckelt von sich aus auf das, was die Grafikkarte kann.
 */
export const ANISO = 16;

export const QUALITY = {
  pixelRatio: bildpunkteWert(),
  shadowSize: LOW_END ? 1024 : 2048,
  ao: !LOW_END,              // Umgebungsverdeckung kostet 16 Abtastungen je Bildpunkt
  bloom: !LOW_END,           // Streulicht: drei zusätzliche Durchgänge in halber Auflösung
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
