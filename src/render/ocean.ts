import * as THREE from 'three';

/**
 * Low-poly ocean: animated waves with flat-shaded facets, shallow → deep
 * colour by distance from the island, beach foam, dashed zone borders and
 * darker water for locked zones. Semi-transparent so fish can be seen as
 * shapes under the surface (GDD: "the player can see the outline of a fish
 * underwater").
 */
export function createOcean(size: number, segments: number): { mesh: THREE.Mesh; material: THREE.ShaderMaterial } {
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    extensions: { derivatives: true } as never,
    uniforms: {
      uTime: { value: 0 },
      uShallow: { value: new THREE.Color(0x3fd6e8) },
      uDeep: { value: new THREE.Color(0x1676c9) },
      uSky: { value: new THREE.Color(0x9fe3ff) },
      uIslandR: { value: 14 },
      uZoneW: { value: 10 },
      uZones: { value: 10 },
      uUnlockedR: { value: 24 },
      uActiveInner: { value: 14 },
      uActiveOuter: { value: 24 },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vWorld;
      void main() {
        vec3 p = position;
        vec4 w = modelMatrix * vec4(p, 1.0);
        float t = uTime;
        float h = sin(w.x * 0.33 + t * 1.25) * 0.16
                + sin(w.z * 0.41 - t * 1.05) * 0.15
                + sin((w.x + w.z) * 0.85 + t * 2.1) * 0.05;
        w.y += h;
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uShallow;
      uniform vec3 uDeep;
      uniform vec3 uSky;
      uniform float uIslandR;
      uniform float uZoneW;
      uniform float uZones;
      uniform float uUnlockedR;
      uniform float uActiveInner;
      uniform float uActiveOuter;
      varying vec3 vWorld;

      void main() {
        vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        if (n.y < 0.0) n = -n;
        float r = length(vWorld.xz);
        float maxR = uIslandR + uZoneW * uZones;
        float depthT = smoothstep(uIslandR, maxR, r);
        vec3 col = mix(uShallow, uDeep, pow(depthT, 0.65));

        vec3 L = normalize(vec3(0.45, 1.0, 0.35));
        float diff = clamp(dot(n, L), 0.0, 1.0);
        col *= 0.72 + 0.38 * diff;
        vec3 V = normalize(cameraPosition - vWorld);
        vec3 H = normalize(L + V);
        col += pow(max(dot(n, H), 0.0), 70.0) * 0.55;

        // foam along the beach
        float shoreD = r - uIslandR - 2.2;
        float foamWave = 0.5 + 0.5 * sin(atan(vWorld.z, vWorld.x) * 18.0 + uTime * 1.5);
        float shore = 1.0 - smoothstep(0.0, 1.6 + foamWave * 0.8, shoreD);
        col = mix(col, vec3(1.0), clamp(shore, 0.0, 1.0) * 0.85);

        // dashed zone borders
        float zr = (r - uIslandR) / uZoneW;
        if (zr > 0.5 && zr < uZones + 0.01) {
          float f = fract(zr);
          float d = min(f, 1.0 - f) * uZoneW;
          float line = 1.0 - smoothstep(0.06, 0.28, d);
          float ang = atan(vWorld.z, vWorld.x);
          float dash = step(0.45, fract(ang * r * 0.09));
          col = mix(col, vec3(1.0), line * dash * 0.45);
        }

        // active zone slightly brighter
        if (r > uActiveInner && r < uActiveOuter) col *= 1.07;

        // locked zones darker
        float locked = smoothstep(uUnlockedR - 0.3, uUnlockedR + 0.6, r);
        col = mix(col, uDeep * 0.45, locked * 0.6);

        float alpha = mix(0.5, 0.78, depthT);
        alpha = max(alpha, shore * 0.95);

        float fd = length(vWorld - cameraPosition);
        float fog = smoothstep(70.0, 150.0, fd);
        col = mix(col, uSky, fog);
        alpha = mix(alpha, 1.0, fog);
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.renderOrder = 10;
  return { mesh, material };
}
