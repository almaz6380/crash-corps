import * as THREE from 'three';

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

const OUTLINE_SHADER = {
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `
    varying vec2 vUv;
    uniform sampler2D tColor, tNormal, tDepth;
    uniform vec2 texel; uniform float near, far, width;
    float vz(vec2 uv){ float z = texture2D(tDepth, uv).x; return (near*far)/((far-near)*z - far); }
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
      col = mix(col, col * 0.12, edge);
      col = mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, 1.05);
      float v = smoothstep(1.25, 0.35, distance(vUv, vec2(0.5)));
      col *= mix(0.86, 1.0, v);
      // Der Quad-Pass geht an der Farbraum-Konvertierung von three vorbei
      col = mix(col * 12.92, 1.055 * pow(col, vec3(0.41666)) - 0.055, step(0.0031308, col));
      gl_FragColor = vec4(col, 1.0);
    }`,
};

/**
 * Kapselt die drei Durchgänge pro Bild: Normalen+Tiefe, Farbe, Zusammensetzen.
 * `render(scene, camera)` ersetzt renderer.render().
 */
export class Pipeline {
  constructor(renderer, camera) {
    this.renderer = renderer; this.camera = camera;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    this.color = new THREE.WebGLRenderTarget(1, 1, { samples: 4 });
    this.normal = new THREE.WebGLRenderTarget(1, 1);
    this.normal.depthTexture = new THREE.DepthTexture(1, 1);
    this.normal.depthTexture.type = THREE.UnsignedIntType;
    this.normalMat = new THREE.MeshNormalMaterial();

    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.mat = new THREE.ShaderMaterial({
      ...OUTLINE_SHADER,
      uniforms: {
        tColor: { value: this.color.texture },
        tNormal: { value: this.normal.texture },
        tDepth: { value: this.normal.depthTexture },
        texel: { value: new THREE.Vector2() },
        near: { value: camera.near }, far: { value: camera.far },
        width: { value: 1.6 },
      },
    });
    this.quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat));
  }

  setSize(w, h, pixelRatio) {
    const pw = Math.floor(w * pixelRatio), ph = Math.floor(h * pixelRatio);
    this.color.setSize(pw, ph);
    this.normal.setSize(pw, ph);
    this.mat.uniforms.texel.value.set(1 / pw, 1 / ph);
  }

  render(scene, camera) {
    const r = this.renderer;
    this.mat.uniforms.near.value = camera.near;
    this.mat.uniforms.far.value = camera.far;
    scene.overrideMaterial = this.normalMat;
    r.setRenderTarget(this.normal); r.render(scene, camera);
    scene.overrideMaterial = null;
    r.setRenderTarget(this.color); r.render(scene, camera);
    r.setRenderTarget(null); r.render(this.quadScene, this.quadCam);
  }
}
