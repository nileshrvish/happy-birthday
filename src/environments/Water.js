import * as THREE from 'three';
import { shared } from '../components/Assets.js';

/** Stylized animated water surface (lakes, streams, ocean). */
export function makeWater(opts) {
  const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: true });
  const proto = waterMaterialSource(opts);
  m.uniforms = proto.uniforms;
  m.uniforms.time = shared.time;
  m.vertexShader = proto.vertexShader;
  m.fragmentShader = proto.fragmentShader;
  return m;
}

function waterMaterialSource({ deep = '#3d8fd6', shallow = '#8fe3ff', scale = 1, opacity = 0.88, flow = [0, 0] } = {}) {
  return {
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { deep: { value: new THREE.Color(deep) }, shallow: { value: new THREE.Color(shallow) }, scale: { value: scale }, opacity: { value: opacity }, flow: { value: new THREE.Vector2(...flow) } },
    ]),
    vertexShader: `
      #include <fog_pars_vertex>
      varying vec2 vUv; varying vec3 vW;
      void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz;
        vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      #include <fog_pars_fragment>
      uniform vec3 deep, shallow; uniform float time, scale, opacity; uniform vec2 flow;
      varying vec2 vUv; varying vec3 vW;
      void main(){
        vec2 p = vW.xz * 0.35 * scale + flow * time;
        float w = sin(p.x * 2.1 + time * 1.3) * sin(p.y * 1.7 - time * 1.1) + 0.5 * sin((p.x + p.y) * 3.3 + time * 2.0);
        float caust = smoothstep(0.75, 1.2, w);
        vec3 c = mix(deep, shallow, 0.35 + 0.25 * w);
        c += vec3(1.0) * caust * 0.45;
        gl_FragColor = vec4(c, opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  };
}

/** Vertical waterfall sheet with scrolling streaks. */
export function makeWaterfall(width, height) {
  const geo = new THREE.PlaneGeometry(width, height, 1, 8);
  geo.translate(0, -height / 2, 0);
  const m = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { time: { value: 0 } }]),
    vertexShader: `
      #include <fog_pars_vertex>
      varying vec2 vUv;
      void main(){ vUv = uv; vec3 p = position; p.z += sin(uv.y * 6.0) * 0.15 * (1.0 - uv.y);
        vec4 mvPosition = modelViewMatrix * vec4(p,1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      #include <fog_pars_fragment>
      uniform float time; varying vec2 vUv;
      float hash(float n){ return fract(sin(n)*43758.5453); }
      void main(){
        float col = floor(vUv.x * 18.0);
        float speed = 0.8 + hash(col) * 0.6;
        float streak = fract(vUv.y * 3.0 + time * speed + hash(col + 7.0));
        float s = smoothstep(0.0, 0.5, streak) * smoothstep(1.0, 0.6, streak);
        vec3 c = mix(vec3(0.45, 0.75, 1.0), vec3(1.0), s * 0.8);
        float a = (0.55 + 0.4 * s) * smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x) * smoothstep(0.0, 0.25, vUv.y);
        gl_FragColor = vec4(c, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  m.uniforms.time = shared.time;
  return new THREE.Mesh(geo, m);
}

export function linkTime(mat) {
  mat.uniforms.time = shared.time;
  return mat;
}
