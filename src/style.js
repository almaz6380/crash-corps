/**
 * Darstellungsstil. Umschaltbar über die Adresszeile: ?stil=real
 * "toon"  – Cel-Shading mit Outline (Standard, passt zu den Cartoon-Modellen)
 * "real"  – physikalische Materialien, Himmelslicht, Umgebungsverdeckung
 */
const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
export const STYLE = q?.get('stil') === 'real' ? 'real' : 'toon';
export const REAL = STYLE === 'real';
