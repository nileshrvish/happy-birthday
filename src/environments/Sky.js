import * as THREE from 'three';

// Per-area moods (sky, fog, lights). Blended by player position.
export const moods = {
  welcome: { top: '#5a4aa0', mid: '#f59ac3', hor: '#ffc99a', fog: '#f4b4c8', sun: '#ffd6aa', sunI: 2.4, hemiS: '#ffe0ef', hemiG: '#6c5b8a', hemiI: 1.1, stars: 0.0 },
  mau: { top: '#4b3a80', mid: '#f08b72', hor: '#ffc27c', fog: '#eea78f', sun: '#ffb877', sunI: 2.2, hemiS: '#ffd8b8', hemiG: '#6a4a6a', hemiI: 1.0, stars: 0.1 },
  garden: { top: '#7a64c8', mid: '#f6a8d8', hor: '#ffe2f2', fog: '#f1c2dd', sun: '#ffe6f2', sunI: 2.3, hemiS: '#ffe6f6', hemiG: '#7a6a9a', hemiI: 1.15, stars: 0.0 },
  distA: { top: '#070b26', mid: '#1f2a66', hor: '#6870b8', fog: '#2b3474', sun: '#a9c2ff', sunI: 1.1, hemiS: '#8ea2ff', hemiG: '#1c1a3a', hemiI: 0.8, stars: 1.0 },
  distB: { top: '#070b26', mid: '#1f2a66', hor: '#6870b8', fog: '#2b3474', sun: '#a9c2ff', sunI: 1.1, hemiS: '#8ea2ff', hemiG: '#1c1a3a', hemiI: 0.8, stars: 1.0 },
  kingdom: { top: '#33246a', mid: '#e47fb2', hor: '#ffd27a', fog: '#e7a2c4', sun: '#ffcf7a', sunI: 2.3, hemiS: '#ffd9ec', hemiG: '#5a3a6a', hemiI: 1.1, stars: 0.45 },
};

export function createSky() {
  const uniforms = {
    top: { value: new THREE.Color() },
    mid: { value: new THREE.Color() },
    hor: { value: new THREE.Color() },
    sunDir: { value: new THREE.Vector3(0.4, 0.15, -1).normalize() },
    sunCol: { value: new THREE.Color('#fff0d0') },
    stars: { value: 0 },
    time: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `
      uniform vec3 top, mid, hor, sunDir, sunCol; uniform float stars, time; varying vec3 vDir;
      float hash(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 c = mix(hor, mid, smoothstep(-0.05, 0.25, h));
        c = mix(c, top, smoothstep(0.2, 0.85, h));
        c = mix(c, hor * 0.85, smoothstep(0.0, -0.4, h));
        float s = max(dot(d, sunDir), 0.0);
        c += sunCol * (pow(s, 800.0) * 0.7 + pow(s, 16.0) * 0.12);
        if (stars > 0.0) {
          vec3 q = floor(d * 260.0);
          float st = step(0.9965, hash(q));
          float tw = 0.6 + 0.4 * sin(time * 2.0 + hash(q + 3.0) * 40.0);
          c += vec3(1.0, 0.95, 1.0) * st * tw * stars * smoothstep(0.0, 0.3, h);
        }
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}
