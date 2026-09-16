import * as THREE from 'three';

/**
 * Wie eine Spielfigur beleuchtet wird.
 *
 * Die Figuren behalten ihr physikalisches Material aus dem Loader – anders als
 * Props und Welt, die auf Toon-Material umgestellt werden. Damit hängen sie
 * allein am Sonnen- und Fülllicht der Arena, und das ist für Figuren zu flach:
 * ein grüner Ork vor grauer Straße landet fast vollständig in einer
 * Helligkeitsstufe, verliert seine Form und sieht billig aus.
 *
 * Statt das Weltlicht umzubauen – das ist für die Arena eingestellt – bekommen
 * nur die Figuren zwei Zutaten in den Shader:
 *
 *  - **Weniger Fülllicht**: das Umgebungslicht der Arena ist so hell, dass die
 *    Schattenseite einer Figur fast so hell ist wie die Sonnenseite – damit
 *    verliert der Körper seine Rundung. Für Figuren wird der indirekte Anteil
 *    heruntergezogen, die Sonne arbeitet dadurch sichtbar. Das ist der größte
 *    Einzelgewinn, nicht der Saum.
 *  - **Saum** (Fresnel): zur Silhouette hin wird leicht aufgehellt. Trennt die
 *    Figur vom Hintergrund. Sparsam dosieren – zu viel, und die Figur bekommt
 *    einen milchigen Schleier und verliert ihre Farbe.
 *  - **Bodenverdunkelung**: nach unten hin wird abgedunkelt, in Modellkoordinaten
 *    gerechnet. Ersetzt den Kontaktschatten, den die Sonne aus flachem Winkel
 *    nicht wirft, und stellt die Figur auf den Boden statt davor.
 *
 * Beides läuft über `onBeforeCompile`, verändert also nur diese Materialien und
 * lässt Arena, Waffen und Effekte unberührt.
 */

/** Regler an einem Ort, damit sich der Look ohne Shader-Suche nachstellen lässt. */
export const LOOK = {
  fuellAnteil: 0.55,          // wie viel vom Umgebungslicht die Figur behält
  saumStaerke: 0.16,          // wie hell der Rand wird
  saumBreite: 4.5,            // Exponent: größer = schmaler Saum
  saumFarbe: new THREE.Color(0xcfe4ff),
  bodenDunkel: 0.34,          // wie stark die Figur nach unten abdunkelt
  bodenHoehe: 0.4,            // bis zu welchem Anteil der Figurhöhe das reicht
};

/**
 * Saum und Bodenverdunkelung in ein Figurenmaterial einbauen.
 * @param {THREE.Material} mat geklontes Material der Figur
 * @param {number} hoehe Höhe der Figur in Modellkoordinaten, für die Verdunkelung
 */
export function figurMaterial(mat, hoehe = 1) {
  if (!mat || mat.userData.saumDrin) return mat;
  mat.userData.saumDrin = true;

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.fuellAnteil = { value: LOOK.fuellAnteil };
    shader.uniforms.saumStaerke = { value: LOOK.saumStaerke };
    shader.uniforms.saumBreite = { value: LOOK.saumBreite };
    shader.uniforms.saumFarbe = { value: LOOK.saumFarbe };
    shader.uniforms.bodenDunkel = { value: LOOK.bodenDunkel };
    shader.uniforms.bodenBis = { value: Math.max(0.001, hoehe * LOOK.bodenHoehe) };

    // Modell-Y je Bildpunkt: daraus wird die Bodenverdunkelung gerechnet.
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n varying float vLokalY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vLokalY = position.y;');

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vLokalY;
        uniform float fuellAnteil, saumStaerke, saumBreite, bodenDunkel, bodenBis;
        uniform vec3 saumFarbe;`)
      // Fülllicht dämpfen, solange die Beiträge noch getrennt vorliegen
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        reflectedLight.indirectDiffuse *= fuellAnteil;`)
      // Ganz am Ende, nach dem Tone-Mapping-Block von three: auf die fertige Farbe.
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        {
          // Fresnel: 0 in der Flächenmitte, 1 an der Silhouette
          float blick = 1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition)));
          float saum = pow(clamp(blick, 0.0, 1.0), saumBreite);
          gl_FragColor.rgb += saumFarbe * saum * saumStaerke;
          // Nach unten hin abdunkeln – ersetzt den fehlenden Kontaktschatten
          float unten = 1.0 - smoothstep(0.0, bodenBis, vLokalY);
          gl_FragColor.rgb *= 1.0 - unten * bodenDunkel;
        }`);
  };
  mat.needsUpdate = true;
  return mat;
}
