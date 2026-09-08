import * as THREE from 'three';
import { embeddedBytes } from './embed.js';

/**
 * Oberflächen für den realistischen Stil.
 *
 * Die Modelle bringen weder Texturen noch (bei den Props) UV-Koordinaten mit.
 * Deshalb zwei Wege:
 *  - Props: die Textur wird im Weltraum dreifach projiziert (triplanar) und
 *    moduliert Farbe, Rauheit und Normale. Braucht keine UVs.
 *  - Flächen mit UVs (Boden, Arenaplatte): normale Texturzuweisung mit Kachelung.
 *
 * Texturen: Poly Haven, CC0. Siehe public/assets/textures/README.md
 */

export const TEXTURE_SETS = [
  'container_side', 'rust_coarse_01', 'asphalt_03', 'concrete_floor_02', 'brown_planks_05', 'leafy_grass',
];

/** Welches Material welche Oberfläche bekommt, nach Prop-Name. */
export const SURFACE_FOR_PROP = {
  Container_Long: 'container_side', Container_Small: 'container_side',
  Structure_2: 'container_side', Structure_4: 'container_side',
  MetalFence: 'rust_coarse_01', Barrier_Large: 'rust_coarse_01', Barrier_Single: 'rust_coarse_01',
  Tank: 'rust_coarse_01', Pipes: 'rust_coarse_01', GasTank: 'rust_coarse_01',
  ExplodingBarrel: 'rust_coarse_01', Debris_BrokenCar: 'rust_coarse_01', Debris_Tires: 'rust_coarse_01',
  StreetLight: 'rust_coarse_01', TrafficCone: 'rust_coarse_01',
  Crate: 'brown_planks_05', Pallet: 'brown_planks_05', CardboardBoxes_2: 'brown_planks_05',
  SackTrench: 'concrete_floor_02', SackTrench_Small: 'concrete_floor_02', BrickWall_2: 'concrete_floor_02',
};

const sets = new Map();

/** Mittlere Helligkeit eines Bildes, grob über eine 32x32-Verkleinerung. */
function meanLuminance(img) {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0, 32, 32);
  const d = x.getImageData(0, 0, 32, 32).data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) {
    // sRGB -> linear, damit der Mittelwert zur Shader-Rechnung passt
    const lin = (v) => { const u = v / 255; return u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4); };
    sum += 0.299 * lin(d[i]) + 0.587 * lin(d[i + 1]) + 0.114 * lin(d[i + 2]);
  }
  return Math.max(0.03, sum / (d.length / 4));
}

/** Lädt die Textursätze. Muss vor dem Aufbau der Welt durchlaufen sein. */
export async function preloadTextures(onProgress) {
  const loader = new THREE.TextureLoader();
  let done = 0;
  await Promise.all(TEXTURE_SETS.map(async (name) => {
    const load = async (short, srgb) => {
      const url = `assets/textures/${name}/${short}.jpg`;
      const bytes = embeddedBytes(url);
      let t;
      if (bytes) {
        // Einzeldatei-Build: Bild aus den Rohdaten, ohne Netzzugriff
        t = new THREE.Texture(await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' })));
        t.needsUpdate = true;
      } else t = await loader.loadAsync(url);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      return t;
    };
    const diff = await load('diff', true);
    sets.set(name, {
      diff, nor: await load('nor', false), rough: await load('rough', false),
      // Mittlere Helligkeit der Textur. Ohne sie würde eine dunkle Textur wie
      // Rost die Grundfarbe abdunkeln statt sie nur zu strukturieren.
      ref: meanLuminance(diff.image),
    });
    onProgress?.(++done / TEXTURE_SETS.length, name);
  }));
}

export function hasTextures() { return sets.size > 0; }

/** Rohbild eines Textursatzes, um damit auf ein Canvas zu malen. */
export function setImage(name, which = 'diff') { return sets.get(name)?.[which]?.image ?? null; }

/** Rauheit und Metallanteil nach Materialnamen – Blech spiegelt, Sandsack nicht. */
const LOOK = [
  [/metal|grey2|steel|tank|pipe/i, { roughness: 0.42, metalness: 0.75 }],
  [/grey|silver|chrome/i, { roughness: 0.5, metalness: 0.55 }],
  [/red|blue|green|yellow|cyan|orange|enemy|main/i, { roughness: 0.62, metalness: 0.35 }],
  [/wood|cardboard|tape|pallet/i, { roughness: 0.94, metalness: 0.0 }],
  [/sack|brick|concrete|stone|rust|dirt/i, { roughness: 0.98, metalness: 0.0 }],
  [/skin/i, { roughness: 0.72, metalness: 0.0 }],
  [/black|dark/i, { roughness: 0.68, metalness: 0.15 }],
];

const TRI_VERT = `
  varying vec3 vWPosD; varying vec3 vWNrmD;`;
const TRI_FRAG = `
  varying vec3 vWPosD; varying vec3 vWNrmD;
  uniform sampler2D tDiff, tNor, tRough;
  uniform float triScale, triAmount, triRef;
  vec3 triBlend(vec3 n){ vec3 b = pow(abs(n), vec3(4.0)); return b / (b.x + b.y + b.z + 1e-5); }
  vec3 triSample(sampler2D t, vec3 p, vec3 b){
    return texture2D(t, p.yz * triScale).rgb * b.x
         + texture2D(t, p.zx * triScale).rgb * b.y
         + texture2D(t, p.xy * triScale).rgb * b.z;
  }
  // Normalen dreifach projiziert, "whiteout"-Mischung: die Tangentenräume der
  // drei Projektionen werden über die Flächennormale zusammengeführt.
  vec3 triNormalW(vec3 p, vec3 n, vec3 b){
    vec3 nx = texture2D(tNor, p.yz * triScale).xyz * 2.0 - 1.0;
    vec3 ny = texture2D(tNor, p.zx * triScale).xyz * 2.0 - 1.0;
    vec3 nz = texture2D(tNor, p.xy * triScale).xyz * 2.0 - 1.0;
    nx = vec3(nx.xy + n.zy, abs(nx.z) * n.x);
    ny = vec3(ny.xy + n.xz, abs(ny.z) * n.y);
    nz = vec3(nz.xy + n.xy, abs(nz.z) * n.z);
    return normalize(nx.zyx * b.x + ny.xzy * b.y + nz.xyz * b.z);
  }`;

/**
 * Physikalisches Material. Mit `set` kommt eine echte Oberfläche dazu,
 * dreifach projiziert; ohne `set` bleibt es bei Rauheit und Metallanteil.
 */
export function realisticMaterial(mat, { set = null, scale = 0.5, amount = 1.0 } = {}) {
  if (!mat || !mat.isMeshStandardMaterial) return mat;
  const hit = LOOK.find(([re]) => re.test(mat.name || ''));
  const look = hit ? hit[1] : { roughness: 0.8, metalness: 0.1 };
  mat.roughness = look.roughness;
  mat.metalness = look.metalness;
  mat.envMapIntensity = 1.0;

  const tex = set && sets.get(set);
  if (!tex) return mat;

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.tDiff = { value: tex.diff };
    shader.uniforms.tNor = { value: tex.nor };
    shader.uniforms.tRough = { value: tex.rough };
    shader.uniforms.triScale = { value: scale };
    shader.uniforms.triAmount = { value: amount };
    shader.uniforms.triRef = { value: tex.ref };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>' + TRI_VERT)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vWPosD = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWNrmD = normalize(mat3(modelMatrix) * objectNormal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>' + TRI_FRAG)
      // Muster der Textur als Helligkeitsschwankung, damit die Klassen- und
      // Containerfarben erhalten bleiben; etwas Eigenfarbe kommt dazu.
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 triB = triBlend(normalize(vWNrmD));
        vec3 triD = triSample(tDiff, vWPosD, triB);
        float triL = dot(triD, vec3(0.299, 0.587, 0.114));
        diffuseColor.rgb *= mix(1.0, clamp(triL / triRef, 0.55, 1.7), triAmount);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * triD / triRef, 0.22 * triAmount);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(mix(roughnessFactor,
          triSample(tRough, vWPosD, triBlend(normalize(vWNrmD))).r, 0.75 * triAmount), 0.04, 1.0);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec3 triW = triNormalW(vWPosD, normalize(vWNrmD), triBlend(normalize(vWNrmD)));
        normal = normalize(mix(normal, (viewMatrix * vec4(triW, 0.0)).xyz, triAmount));`);
  };
  mat.needsUpdate = true;
  return mat;
}

/** Für Flächen mit UVs (Boden, Arenaplatte): Karten direkt zuweisen. */
export function uvSurface(mat, setName, { repeat = 10, keepMap = false } = {}) {
  const tex = sets.get(setName);
  if (!tex || !mat.isMeshStandardMaterial) return mat;
  const clone = (t) => { const c = t.clone(); c.repeat.set(repeat, repeat); c.needsUpdate = true; return c; };
  if (!keepMap) mat.map = clone(tex.diff);
  mat.normalMap = clone(tex.nor);
  mat.roughnessMap = clone(tex.rough);
  mat.normalScale = new THREE.Vector2(0.8, 0.8);
  mat.needsUpdate = true;
  return mat;
}
