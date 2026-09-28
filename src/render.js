import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { REAL } from './style.js';
import { QUALITY } from './device.js';

/**
 * Render-Stufe: Cel-Shading, Outline-Pass, Tone-Mapping.
 * Die Outline entsteht aus Tiefen- und Normalensprüngen, nicht aus
 * aufgeblasener Geometrie – dadurch bekommen auch Modell-Innenkanten eine Linie.
 */

/** Harte Lichtstufen statt weichem Verlauf. */
export function celRamp(steps = 4) {
  const d = new Uint8Array(steps);
  for (let i = 0; i < steps; i++) d[i] = Math.round(65 + (190 * i) / (steps - 1));
  const t = new THREE.DataTexture(d, steps, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

/**
 * Himmel aus einer HDRI (Poly Haven, CC0). Sie ist das Licht: Himmel um 1,
 * Sonne tausendfach darüber. Der gerechnete Himmel weiter unten liefert Werte
 * bis knapp über 1 – gemessen lag damit das ganze Bild zwischen 0,09 und 0,5,
 * und aus einem so flachen Signal kann keine Belichtung ein Foto machen.
 *
 * Geladen wird einmal beim Start (`ladeHimmel`), gebaut beim Weltaufbau.
 */
let hdriTextur = null;

/** @param {(p:number)=>void} [fortschritt] */
export async function ladeHimmel(fortschritt) {
  if (hdriTextur || !REAL) return hdriTextur;
  const { RGBELoader } = await import('three/addons/loaders/RGBELoader.js');
  const loader = new RGBELoader();
  hdriTextur = await new Promise((fertig) => {
    loader.load('assets/hdri/himmel.hdr',
      (t) => fertig(t),
      (e) => e.total && fortschritt?.(e.loaded / e.total),
      () => fertig(null));          // ohne Netz: der gerechnete Himmel muss reichen
  });
  return hdriTextur;
}

/**
 * Richtung und Stärke der Sonne aus der HDRI: der hellste Fleck ist die Sonne.
 * So passen Schattenwurf und sichtbarer Himmel zusammen, ohne dass jemand die
 * Richtung von Hand einträgt.
 */
function sonneAusHdri(tex) {
  const { data, width, height } = tex.image;
  let bestI = 0, best = -1;
  for (let i = 0; i < width * height; i++) {
    const l = data[i * 4] + data[i * 4 + 1] * 2 + data[i * 4 + 2];
    if (l > best) { best = l; bestI = i; }
  }
  const x = bestI % width, y = Math.floor(bestI / width);
  // three liest Äquirektangular als u = atan2(z, x)/2π + 0.5, v = asin(y)/π + 0.5.
  // Die Zeilen der geladenen Daten laufen von oben nach unten, deshalb 1 - v.
  const u = (x + 0.5) / width, v = 1 - (y + 0.5) / height;
  const theta = (u - 0.5) * Math.PI * 2, hoehe = (v - 0.5) * Math.PI;
  const dir = new THREE.Vector3(
    Math.cos(theta) * Math.cos(hoehe), Math.sin(hoehe), Math.sin(theta) * Math.cos(hoehe),
  );
  // Steht die Sonne rechnerisch unter dem Horizont, ist die Zeilenrichtung
  // andersherum – dann spiegeln statt raten.
  if (dir.y < 0.05) dir.y = Math.abs(dir.y) + 0.05;
  return { dir: dir.normalize(), helligkeit: best / 4 };
}

/**
 * Umgebung und Hintergrund aus der HDRI. Gibt die Sonnenrichtung zurück, damit
 * `world.js` das gerichtete Licht dorthin stellen kann.
 * @returns {{dir:THREE.Vector3, helligkeit:number}|null}
 */
export function himmelAusHdri(scene, renderer) {
  if (!hdriTextur) return null;
  hdriTextur.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(hdriTextur);
  scene.environment = env.texture;
  scene.background = hdriTextur;
  // Etwas unter dem physikalisch Richtigen: voller Himmel füllt die Schatten so
  // weit auf, dass die Sonne ihre Wirkung verliert. 0,75 lässt Schatten Schatten
  // sein, ohne dass sie absaufen.
  scene.environmentIntensity = 0.75;
  scene.backgroundIntensity = 1;
  pmrem.dispose();
  return sonneAusHdri(hdriTextur);
}

/**
 * Physikalischer Himmel (Rayleigh/Mie) und daraus das Umgebungslicht.
 * Rückfallebene, wenn die HDRI nicht geladen werden konnte.
 */
export function buildRealSky(scene, renderer, sunDir) {
  const sky = new Sky();
  sky.scale.setScalar(8000);
  const u = sky.material.uniforms;
  u.turbidity.value = 1.8;
  u.rayleigh.value = 3.4;
  u.mieCoefficient.value = 0.003;
  u.mieDirectionalG.value = 0.8;
  u.sunPosition.value.copy(sunDir);
  scene.add(sky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(sky, 0.02);
  scene.environment = env.texture;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();
  return sky;
}

/** Himmel als Verlauf – ersetzt die einfarbige Fläche. */
export function buildSky() {
  return new THREE.Mesh(new THREE.SphereGeometry(220, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x2e7fc4) },
      mid: { value: new THREE.Color(0x9fd7f7) },
      bot: { value: new THREE.Color(0xf3e6c8) },
    },
    vertexShader: `varying vec3 vP;
      void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vP; uniform vec3 top, mid, bot;
      void main(){ float h = normalize(vP).y;
        vec3 c = h > 0.05 ? mix(mid, top, smoothstep(0.05, 0.75, h))
                          : mix(bot, mid, smoothstep(-0.25, 0.05, h));
        gl_FragColor = vec4(c, 1.0); }`,
  }));
}

const QUAD_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

/**
 * AgX – die Tonwertkurve aus Blender und Filament, wie three sie mitbringt.
 * Sie muss hier noch einmal stehen, weil dieser Durchgang aus einem
 * Render-Target liest und damit am Tone-Mapping von three vorbeiläuft.
 *
 * Gegenüber ACES hält AgX die Farbe, wenn es hell wird: eine besonnte Ziegelwand
 * bleibt rot, statt nach Weiß zu kippen. Genau das unterscheidet ein Foto von
 * einem überstrahlten Spielbild.
 * https://github.com/google/filament/pull/7236
 */
const AGX_GLSL = `
  const mat3 AGX_IN = mat3(
    0.856627153315983, 0.137318972929847, 0.11189821299995,
    0.0951212405381588, 0.761241990602591, 0.0767994186031903,
    0.0482516061458583, 0.101439036467562, 0.811302368396859);
  const mat3 AGX_OUT = mat3(
    1.1271005818144368, -0.1413297634984383, -0.14132976349843826,
    -0.11060664309660323, 1.157823702216272, -0.11060664309660294,
    -0.016493938717834573, -0.016493938717834257, 1.2519364065950405);
  const mat3 SRGB_TO_REC2020 = mat3(
    0.6274, 0.0691, 0.0164,
    0.3293, 0.9195, 0.0880,
    0.0433, 0.0113, 0.8956);
  const mat3 REC2020_TO_SRGB = mat3(
    1.6605, -0.1246, -0.0182,
    -0.5876, 1.1329, -0.1006,
    -0.0728, -0.0083, 1.1187);
  vec3 agxKurve(vec3 x){
    vec3 x2 = x * x, x4 = x2 * x2;
    return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x
      + 0.4298 * x2 + 0.1191 * x - 0.00232;
  }
  vec3 agx(vec3 col){
    const float minEv = -12.47393, maxEv = 4.026069;
    col = SRGB_TO_REC2020 * col;
    col = AGX_IN * col;
    col = log2(max(col, 1e-10));
    col = clamp((col - minEv) / (maxEv - minEv), 0.0, 1.0);
    col = agxKurve(col);
    col = AGX_OUT * col;
    col = pow(max(vec3(0.0), col), vec3(2.2));
    return clamp(REC2020_TO_SRGB * col, 0.0, 1.0);
  }`;

/** Heller Anteil des Bildes, halbe Auflösung – Vorstufe des Bloom. */
const HELL_SHADER = {
  vertexShader: QUAD_VERT,
  fragmentShader: `
    varying vec2 vUv; uniform sampler2D tColor; uniform float schwelle, weich;
    void main(){
      vec3 c = texture2D(tColor, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      // Weicher Einsatz: ein harter Schnitt flackert an den Kanten heller Flächen
      gl_FragColor = vec4(c * smoothstep(schwelle, schwelle + weich, l), 1.0);
    }`,
};

/** Separierbare Unschärfe. `richtung` ist (1,0) oder (0,1) mal Texelgröße. */
const BLUR_SHADER = {
  vertexShader: QUAD_VERT,
  fragmentShader: `
    varying vec2 vUv; uniform sampler2D tColor; uniform vec2 richtung;
    void main(){
      // Neun Abtastungen, Gewichte einer Gaußkurve
      vec3 s = texture2D(tColor, vUv).rgb * 0.227027;
      s += (texture2D(tColor, vUv + richtung * 1.3846).rgb
          + texture2D(tColor, vUv - richtung * 1.3846).rgb) * 0.316216;
      s += (texture2D(tColor, vUv + richtung * 3.2308).rgb
          + texture2D(tColor, vUv - richtung * 3.2308).rgb) * 0.070270;
      gl_FragColor = vec4(s, 1.0);
    }`,
};

const COMPOSITE_SHADER = {
  vertexShader: QUAD_VERT,
  fragmentShader: `
    varying vec2 vUv;
    uniform sampler2D tColor, tNormal, tDepth, tBloom;
    uniform vec2 texel; uniform float near, far, width;
    uniform float outline, ao, aoRadius, saturation, exposure;
    uniform float agxAn, bloom, korn, schaerfe, zeit;
    uniform mat4 proj, invProj;
    ${AGX_GLSL}
    float vz(vec2 uv){ float z = texture2D(tDepth, uv).x; return (near*far)/((far-near)*z - far); }
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    // three wendet Tone-Mapping nur beim Rendern auf die Leinwand an, nicht in
    // ein Render-Target. Da diese Stufe aus einem Target liest, gehört es hierher.
    vec3 aces(vec3 x){
      const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
      return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
    }
    vec3 viewPos(vec2 uv, float zv){
      vec4 clip = vec4(uv * 2.0 - 1.0, 1.0, 1.0);
      vec4 v = invProj * clip;
      vec3 ray = v.xyz / v.w;
      return ray * (zv / ray.z);
    }
    void main(){
      vec3 col = texture2D(tColor, vUv).rgb;
      float d0 = vz(vUv); vec3 n0 = texture2D(tNormal, vUv).xyz;
      float dd = 0.0, nd = 0.0;
      vec2 o[4];
      o[0] = vec2(texel.x, 0.0); o[1] = vec2(-texel.x, 0.0);
      o[2] = vec2(0.0, texel.y); o[3] = vec2(0.0, -texel.y);
      for (int i = 0; i < 4; i++) {
        dd = max(dd, abs(vz(vUv + o[i]*width) - d0));
        nd = max(nd, distance(texture2D(tNormal, vUv + o[i]*width).xyz, n0));
      }
      float edge = max(smoothstep(0.006, 0.028, dd / max(1.0, abs(d0))), smoothstep(0.25, 0.55, nd));
      col = mix(col, col * 0.12, edge * outline);

      // Umgebungsverdeckung: Sichtbarkeit im Halbraum um den Bildpunkt.
      // Ohne sie schweben Objekte über dem Boden, weil Kontaktschatten fehlen.
      // Hintergrund (Himmel) liegt auf der Far-Plane und darf nicht verdeckt werden
      if (ao > 0.0 && abs(d0) < far * 0.9) {
        vec3 p = viewPos(vUv, d0);
        vec3 n = normalize(texture2D(tNormal, vUv).xyz * 2.0 - 1.0);
        float rot = hash(vUv * 1024.0) * 6.2831853;
        float occl = 0.0;
        for (int i = 0; i < 16; i++) {
          float fi = float(i);
          float ang = rot + fi * 2.3999632;              // goldener Winkel
          float rad = aoRadius * sqrt((fi + 0.5) / 16.0);
          vec3 dirv = vec3(cos(ang), sin(ang), 0.0);
          vec3 sp = p + (dirv + n * 0.6) * rad;
          vec4 cp = proj * vec4(sp, 1.0);
          vec2 su = cp.xy / cp.w * 0.5 + 0.5;
          if (su.x < 0.0 || su.x > 1.0 || su.y < 0.0 || su.y > 1.0) continue;
          float sd = vz(su);
          if (abs(sd) > far * 0.9) continue;
          float diff = sd - sp.z;                        // beide negativ, Blickrichtung -z
          float range = smoothstep(0.0, 1.0, aoRadius / max(0.001, abs(sd - p.z)));
          occl += (diff > 0.02 ? 1.0 : 0.0) * range;
        }
        col *= mix(1.0, clamp(1.0 - occl / 16.0, 0.0, 1.0), ao);
      }

      // Bloom vor dem Tone-Mapping: Streulicht entsteht im Objektiv, nicht im
      // fertigen Bild. Addiert man es danach, wird aus jedem hellen Fleck ein
      // milchiger Schleier.
      if (bloom > 0.0) col += texture2D(tBloom, vUv).rgb * bloom;

      col *= exposure;
      col = agxAn > 0.5 ? agx(col) : aces(col);
      col = mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, saturation);

      // Schärfung: die Differenz zum Mittel der vier Nachbarn dazugeben. Nach
      // dem Tone-Mapping, sonst zieht sie helle Kanten ins Ausbrennen.
      if (schaerfe > 0.0) {
        vec3 um = texture2D(tColor, vUv + vec2(texel.x, 0.0)).rgb
                + texture2D(tColor, vUv - vec2(texel.x, 0.0)).rgb
                + texture2D(tColor, vUv + vec2(0.0, texel.y)).rgb
                + texture2D(tColor, vUv - vec2(0.0, texel.y)).rgb;
        vec3 mitte = agxAn > 0.5 ? agx(um * 0.25 * exposure) : aces(um * 0.25 * exposure);
        col += (col - mitte) * schaerfe;
      }

      float v = smoothstep(1.25, 0.35, distance(vUv, vec2(0.5)));
      col *= mix(0.86, 1.0, v);

      // Filmkorn, wandernd. Ohne Bewegung sieht es wie Schmutz auf dem Schirm aus.
      if (korn > 0.0) col += (hash(vUv * 1024.0 + zeit) - 0.5) * korn;
      col = max(col, vec3(0.0));
      // Der Quad-Pass geht an der Farbraum-Konvertierung von three vorbei
      col = mix(col * 12.92, 1.055 * pow(col, vec3(0.41666)) - 0.055, step(0.0031308, col));
      gl_FragColor = vec4(col, 1.0);
    }`,
};

/**
 * Ebene für alles, was keinen Umriss bekommen soll. Der Normalen-Durchgang
 * tauscht alle Materialien gegen eines aus – damit fällt der Alphatest weg, und
 * aus einem Busch aus Blattkärtchen wird für die Kantenerkennung ein Stapel
 * Rechtecke mit weißem Rahmen. Laub und Rauch laufen deshalb außen vorbei:
 * gezeichnet werden sie normal, nur die Kantenerkennung sieht sie nicht.
 */
export const OHNE_UMRISS = 1;

/**
 * Bildwerte je Stil. Der reale Stil rechnet szenenbezogen: die Sonne liefert
 * Werte weit über 1, und erst Belichtung und Kurve machen daraus ein Bild.
 * Deshalb hier Blende und Kurve getrennt von allem anderen.
 */
const BILD = {
  // Belichtung nicht geraten, sondern gemessen: das geometrische Mittel der
  // Szenenwerte lag bei 0,22, mittleres Grau liegt bei 0,18 (tools: belichtung).
  real: { belichtung: 0.82, saettigung: 1.05, agx: 1, bloom: 0.5, schwelle: 1.0, korn: 0.012, schaerfe: 0.15 },
  toon: { belichtung: 1.15, saettigung: 1.05, agx: 0, bloom: 0.0, schwelle: 1.6, korn: 0.0, schaerfe: 0.0 },
};

/**
 * Kapselt die Durchgänge pro Bild: Normalen+Tiefe, Farbe, Bloom, Zusammensetzen.
 * `render(scene, camera)` ersetzt renderer.render().
 *
 * Das Farbbild läuft in ein **Halbgleitkomma**-Target. Vorher standen dort acht
 * Bit je Kanal: alles über Weiß wurde abgeschnitten, bevor die Belichtung
 * überhaupt rechnete. Genau daher kam der ausgebrannte Himmel im realen Stil –
 * Tone-Mapping kann nur retten, was noch da ist.
 */
export class Pipeline {
  /** @param {{outline?:boolean, ao?:number, bloom?:boolean}} opts */
  constructor(renderer, camera, opts = {}) {
    const useOutline = opts.outline ?? !REAL;
    const useAo = opts.ao ?? (REAL && QUALITY.ao ? 1.0 : 0);
    const bild = REAL ? BILD.real : BILD.toon;
    this.bloomAn = (opts.bloom ?? (REAL && QUALITY.bloom)) && bild.bloom > 0;
    this.renderer = renderer; this.camera = camera;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // **Einmal** je Bild, nicht zweimal. `render()` unten ruft `renderer.render()`
    // zweimal auf (Normalen, Farbe), und three baut die Schattenkarte bei jedem
    // Aufruf neu – ein kompletter zusätzlicher Durchgang über die ganze Szene,
    // für ein Ergebnis, das sich zwischen den beiden Aufrufen nicht ändert.
    // Gemessen: 604 von 1024 Zeichenaufrufen je Bild gingen an die Schatten.
    renderer.shadowMap.autoUpdate = false;
    // Die Zähler sollen **ein ganzes Bild** zusammenzählen, nicht nur den
    // letzten Durchgang. Von allein setzt three sie bei jedem `render()`
    // zurück – und weil das Zusammensetzen ein einzelnes Rechteck ist, stünde
    // am Ende „1 Zeichenaufruf, 2 Dreiecke“ da.
    renderer.info.autoReset = false;
    // Tone-Mapping macht der Composite-Shader, nicht der Renderer – siehe dort
    renderer.toneMapping = THREE.NoToneMapping;

    // Der Normalen-Durchgang zeichnet die **ganze Szene ein zweites Mal**. Er
    // liefert Normalen und Tiefe für Umriss und Umgebungsverdeckung – und lief
    // bisher auch dann, wenn beides aus ist. Im realen Stil ist der Umriss
    // grundsätzlich aus; schaltet die Automatik dann noch die Verdeckung ab,
    // zeichnete das Spiel die Szene weiter zweimal, für nichts.
    this.normalVoll = useOutline || useAo > 0;
    this.normalAn = this.normalVoll;
    this.color = new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType });
    this.normal = new THREE.WebGLRenderTarget(1, 1);
    this.normal.depthTexture = new THREE.DepthTexture(1, 1);
    this.normal.depthTexture.type = THREE.UnsignedIntType;
    this.normalMat = new THREE.MeshNormalMaterial();
    // Bloom in halber Auflösung, zwei Ziele zum Hin- und Herblurren
    this.hell = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.blur = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });

    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial());
    this.quadScene.add(this.quad);

    this.hellMat = new THREE.ShaderMaterial({
      ...HELL_SHADER,
      uniforms: {
        tColor: { value: this.color.texture },
        schwelle: { value: bild.schwelle }, weich: { value: 0.6 },
      },
    });
    this.blurMat = new THREE.ShaderMaterial({
      ...BLUR_SHADER,
      uniforms: { tColor: { value: null }, richtung: { value: new THREE.Vector2() } },
    });
    this.mat = new THREE.ShaderMaterial({
      ...COMPOSITE_SHADER,
      uniforms: {
        tColor: { value: this.color.texture },
        tNormal: { value: this.normal.texture },
        tDepth: { value: this.normal.depthTexture },
        tBloom: { value: this.blur.texture },
        texel: { value: new THREE.Vector2() },
        near: { value: camera.near }, far: { value: camera.far },
        width: { value: 1.6 },
        outline: { value: useOutline ? 1 : 0 },
        ao: { value: useAo },
        aoRadius: { value: 0.55 },
        saturation: { value: bild.saettigung },
        exposure: { value: bild.belichtung },
        agxAn: { value: bild.agx },
        bloom: { value: this.bloomAn ? bild.bloom : 0 },
        korn: { value: bild.korn },
        schaerfe: { value: bild.schaerfe },
        zeit: { value: 0 },
        proj: { value: new THREE.Matrix4() },
        invProj: { value: new THREE.Matrix4() },
      },
    });
    // Die vollen Werte merken: `stufe()` stellt sie wieder her, und ohne sie
    // bliebe nach dem Testflug alles auf null stehen.
    this.bloomVoll = this.bloomAn ? bild.bloom : 0;
    this.aoVoll = useAo;
    this.pixelVoll = renderer.getPixelRatio();
  }

  setSize(w, h, pixelRatio) {
    const pw = Math.floor(w * pixelRatio), ph = Math.floor(h * pixelRatio);
    this.color.setSize(pw, ph);
    this.normal.setSize(pw, ph);
    const bw = Math.max(1, pw >> 1), bh = Math.max(1, ph >> 1);
    this.hell.setSize(bw, bh); this.blur.setSize(bw, bh);
    this.halb = new THREE.Vector2(1 / bw, 1 / bh);
    this.mat.uniforms.texel.value.set(1 / pw, 1 / ph);
  }

  /** Einen Bildschirm-Shader in ein Ziel zeichnen (null = Leinwand). */
  zeichne(material, ziel) {
    this.quad.material = material;
    this.renderer.setRenderTarget(ziel);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  /** Streulicht: hellen Anteil abtrennen, waagerecht und senkrecht weichzeichnen. */
  bloomRechnen() {
    this.zeichne(this.hellMat, this.hell);
    this.blurMat.uniforms.tColor.value = this.hell.texture;
    this.blurMat.uniforms.richtung.value.set(this.halb.x, 0);
    this.zeichne(this.blurMat, this.blur);
    this.blurMat.uniforms.tColor.value = this.blur.texture;
    this.blurMat.uniforms.richtung.value.set(0, this.halb.y);
    this.zeichne(this.blurMat, this.hell);
    // Ergebnis liegt jetzt in `hell`; der Composite liest aus `tBloom`
    this.mat.uniforms.tBloom.value = this.hell.texture;
  }

  /**
   * Teure Effekte abschalten, wenn die Bildrate nicht reicht. Reihenfolge nach
   * Kosten: erst Streulicht (drei Durchgänge), dann Umgebungsverdeckung
   * (16 Abtastungen je Bildpunkt). Der Rest – HDR, Kurve, Schatten – bleibt,
   * denn daran hängt das Bild, nicht die Zugabe.
   */
  /**
   * Eine Stufe an- oder abschalten – für den Testflug (`mess.js`).
   *
   * Das ist bewusst dieselbe Liste wie in `sparsam()`, nur einzeln ansteuerbar:
   * gemessen wird genau das, woran die Automatik später dreht. Eine Messung,
   * die andere Knöpfe drückt als das Spiel, misst das falsche Spiel.
   */
  stufe(name, an) {
    const r = this.renderer, u = this.mat.uniforms;
    if (name === 'bloom') { this.bloomAn = an && this.bloomVoll > 0; u.bloom.value = an ? this.bloomVoll : 0; }
    else if (name === 'ao') u.ao.value = an ? this.aoVoll : 0;
    else if (name === 'normal') this.normalAn = an && this.normalVoll;
    else if (name === 'schatten') {
      // Abgeschaltet spart three den ganzen Schattendurchgang. Die Materialien
      // lesen dann eine leere Karte – das Bild stimmt in diesem Lauf nicht, die
      // Zeit schon, und darum geht es hier.
      r.shadowMap.enabled = an;
    } else if (name === 'halb') {
      const s = r.getSize(new THREE.Vector2());
      r.setPixelRatio(an ? this.pixelVoll : this.pixelVoll / 2);
      this.setSize(s.x, s.y, r.getPixelRatio());
    }
  }

  sparsam() {
    if (this.bloomAn) { this.bloomAn = false; this.mat.uniforms.bloom.value = 0; return 'Streulicht'; }
    if (this.mat.uniforms.ao.value > 0) {
      this.mat.uniforms.ao.value = 0;
      // Ohne Verdeckung **und** ohne Umriss braucht den Normalen-Durchgang
      // niemand mehr. Das ist der größte Einzelposten, den die Automatik
      // abschalten kann: ein ganzer Durchgang über die Szene.
      this.normalVoll = this.mat.uniforms.outline.value > 0;
      this.normalAn = this.normalVoll;
      return 'Umgebungsverdeckung';
    }
    return null;
  }

  render(scene, camera) {
    const r = this.renderer;
    r.info.reset();
    // Der erste `render()` unten zeichnet die Schattenkarte und setzt die Marke
    // selbst zurück; der zweite übernimmt sie dann.
    r.shadowMap.needsUpdate = true;
    this.mat.uniforms.near.value = camera.near;
    this.mat.uniforms.far.value = camera.far;
    this.mat.uniforms.zeit.value = performance.now() * 0.001;
    this.mat.uniforms.proj.value.copy(camera.projectionMatrix);
    this.mat.uniforms.invProj.value.copy(camera.projectionMatrixInverse);
    if (this.normalAn) {
      scene.overrideMaterial = this.normalMat;
      camera.layers.disable(OHNE_UMRISS);
      r.setRenderTarget(this.normal); r.render(scene, camera);
      camera.layers.enable(OHNE_UMRISS);
      scene.overrideMaterial = null;
    }
    r.setRenderTarget(this.color); r.render(scene, camera);
    if (this.bloomAn) this.bloomRechnen();
    this.zeichne(this.mat, null);
  }
}
