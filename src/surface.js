import * as THREE from 'three';

/**
 * Oberflächen für den realistischen Stil. Die Modelle bringen weder Texturen
 * noch (bei den Props) UV-Koordinaten mit – deshalb kommt die Struktur hier
 * prozedural dazu: eine Rauschtextur wird im Weltraum dreifach projiziert
 * (triplanar) und moduliert Farbe und Rauheit. Ohne das wirken die Flächen
 * unter physikalischem Licht wie lackiertes Plastik.
 */
let noiseTex = null;
function detailNoise() {
  if (noiseTex) return noiseTex;
  const S = 512, c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  x.fillStyle = '#808080'; x.fillRect(0, 0, S, S);
  const img = x.getImageData(0, 0, S, S), d = img.data;
  for (let i = 0; i < d.length; i += 4) {                 // feines Korn
    const v = 128 + (Math.random() - 0.5) * 18;
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  for (let i = 0; i < 420; i++) {                          // größere Flecken
    const px = Math.random() * S, py = Math.random() * S, r = 14 + Math.random() * 90;
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    const dark = Math.random() < 0.5;
    g.addColorStop(0, dark ? 'rgba(40,40,40,0.42)' : 'rgba(230,230,230,0.30)');
    g.addColorStop(1, 'rgba(128,128,128,0)');
    x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill();
  }
  noiseTex = new THREE.CanvasTexture(c);
  noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping;
  return noiseTex;
}

/** Rauheit und Metallanteil nach Materialnamen – Blech spiegelt, Sandsack nicht. */
const LOOK = [
  [/metal|grey2|steel|tank|pipe/i, { roughness: 0.42, metalness: 0.75 }],
  [/grey|silver|chrome/i, { roughness: 0.5, metalness: 0.55 }],
  [/red|blue|green|yellow|cyan|orange|enemy|main/i, { roughness: 0.62, metalness: 0.35 }],  // lackiertes Blech
  [/wood|cardboard|tape|pallet/i, { roughness: 0.94, metalness: 0.0 }],
  [/sack|brick|concrete|stone|rust|dirt/i, { roughness: 0.98, metalness: 0.0 }],
  [/skin/i, { roughness: 0.72, metalness: 0.0 }],
  [/black|dark/i, { roughness: 0.68, metalness: 0.15 }],
];

/** Setzt Rauheit/Metall nach Namen und hängt die triplanare Struktur ein. */
export function realisticMaterial(mat, { detail = 1.0, scale = 0.3 } = {}) {
  if (!mat || !mat.isMeshStandardMaterial) return mat;
  const hit = LOOK.find(([re]) => re.test(mat.name || ''));
  const look = hit ? hit[1] : { roughness: 0.8, metalness: 0.1 };
  mat.roughness = look.roughness;
  mat.metalness = look.metalness;
  mat.envMapIntensity = 1.0;
  if (detail <= 0) return mat;

  const tex = detailNoise();
  mat.userData.detail = { value: detail };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.tDetail = { value: tex };
    shader.uniforms.detailScale = { value: scale };
    shader.uniforms.detailAmount = { value: detail };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPosD;\nvarying vec3 vWNrmD;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vWPosD = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWNrmD = normalize(mat3(modelMatrix) * objectNormal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPosD; varying vec3 vWNrmD;
        uniform sampler2D tDetail; uniform float detailScale; uniform float detailAmount;
        // Dreifachprojektion: Rauschen im Weltraum, gewichtet nach Flächennormale
        float triNoise(vec3 p, vec3 n) {
          vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z + 1e-5);
          float a = texture2D(tDetail, p.yz * detailScale).r;
          float b = texture2D(tDetail, p.zx * detailScale).r;
          float c = texture2D(tDetail, p.xy * detailScale).r;
          return a * w.x + b * w.y + c * w.z;
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        float dN = triNoise(vWPosD, normalize(vWNrmD));
        roughnessFactor = clamp(roughnessFactor + (dN - 0.5) * 0.45 * detailAmount, 0.05, 1.0);`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= 1.0 + (triNoise(vWPosD, normalize(vWNrmD)) - 0.5) * 0.42 * detailAmount;`);
  };
  mat.needsUpdate = true;
  return mat;
}
