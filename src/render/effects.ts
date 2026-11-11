import * as THREE from 'three';
import { shared } from './models';

/**
 * Visual effects with few draw calls (good for phones):
 *  - one THREE.Points cloud of soft round particles (splashes, foam, smoke,
 *    sparkles), each with its own colour, size, gravity and fade
 *  - a small pool of water ripples (expanding rings)
 */

const MAX_PARTICLES = 900;
const MAX_RIPPLES = 32;

interface Particle {
  alive: boolean;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  gravity: number;
  drag: number;
  life: number;
  maxLife: number;
  size: number;
  grow: number;
  r: number; g: number; b: number;
  additive: boolean;
}

interface Ripple {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  size: number;
}

export class Effects {
  private particles: Particle[] = [];
  private points: THREE.Points;
  private glowPoints: THREE.Points;
  private positions = new Float32Array(MAX_PARTICLES * 3);
  private colors = new Float32Array(MAX_PARTICLES * 4);
  private sizes = new Float32Array(MAX_PARTICLES);
  private glowPositions = new Float32Array(MAX_PARTICLES * 3);
  private glowColors = new Float32Array(MAX_PARTICLES * 4);
  private glowSizes = new Float32Array(MAX_PARTICLES);
  private ripples: Ripple[] = [];
  private next = 0;

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, gravity: 0, drag: 0, life: 0, maxLife: 1, size: 1, grow: 0, r: 1, g: 1, b: 1, additive: false });
    }
    this.points = this.makePoints(this.positions, this.colors, this.sizes, false);
    this.glowPoints = this.makePoints(this.glowPositions, this.glowColors, this.glowSizes, true);
    scene.add(this.points, this.glowPoints);

    const ringGeo = shared(new THREE.RingGeometry(0.8, 1, 28));
    for (let i = 0; i < MAX_RIPPLES; i++) {
      const mesh = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      mesh.renderOrder = 15;
      scene.add(mesh);
      this.ripples.push({ mesh, life: 0, maxLife: 1, size: 1 });
    }
  }

  private makePoints(pos: Float32Array, col: Float32Array, size: Float32Array, additive: boolean): THREE.Points {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uScale: { value: 400 } },
      vertexShader: /* glsl */ `
        attribute vec4 color;
        attribute float size;
        uniform float uScale;
        varying vec4 vColor;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * uScale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec4 vColor;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float soft = smoothstep(0.5, 0.15, d);
          gl_FragColor = vec4(vColor.rgb, vColor.a * soft);
        }
      `,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 30;
    return pts;
  }

  /** Point size scale follows the viewport height so particles look the same on every phone. */
  setViewportHeight(px: number): void {
    const s = px * 0.55;
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = s;
    (this.glowPoints.material as THREE.ShaderMaterial).uniforms.uScale.value = s;
  }

  private spawn(p: Partial<Particle> & { x: number; y: number; z: number }): void {
    // ring buffer: oldest particles are reused when the pool is full
    const slot = this.particles[this.next];
    this.next = (this.next + 1) % MAX_PARTICLES;
    Object.assign(slot, {
      alive: true, vx: 0, vy: 0, vz: 0, gravity: 0, drag: 0, life: 1, maxLife: 1, size: 0.4, grow: 0,
      r: 1, g: 1, b: 1, additive: false,
    }, p);
    slot.maxLife = slot.life;
  }

  /** Water splash: droplets thrown up plus a ripple. */
  splash(x: number, z: number, count: number, color = 0xffffff, size = 1): void {
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (1.2 + Math.random() * 2.6) * size;
      this.spawn({
        x: x + Math.cos(a) * 0.3, y: 0.1, z: z + Math.sin(a) * 0.3,
        vx: Math.cos(a) * sp, vy: (3 + Math.random() * 4.5) * Math.sqrt(size), vz: Math.sin(a) * sp,
        gravity: 14, drag: 0.5, life: 0.55 + Math.random() * 0.45, size: (0.22 + Math.random() * 0.25) * size,
        r: c.r, g: c.g, b: c.b, additive: color !== 0xffffff,
      });
    }
    if (count >= 4) this.ripple(x, z, 1.2 + size * 0.8 + count * 0.04, color === 0xffffff ? 0xffffff : color);
  }

  /** Foam left behind a moving boat. */
  wake(x: number, z: number, size = 1): void {
    this.spawn({
      x: x + (Math.random() - 0.5) * 0.5, y: 0.08, z: z + (Math.random() - 0.5) * 0.5,
      vx: (Math.random() - 0.5) * 0.4, vz: (Math.random() - 0.5) * 0.4,
      life: 1.2 + Math.random() * 0.6, size: 0.35 * size, grow: 0.9 * size,
    });
  }

  /** Little smoke puff (boat chimney). */
  smoke(x: number, y: number, z: number): void {
    this.spawn({
      x, y, z, vx: (Math.random() - 0.5) * 0.3, vy: 0.9 + Math.random() * 0.4, vz: -0.4 + (Math.random() - 0.5) * 0.3,
      life: 1.6, size: 0.25, grow: 0.7, r: 0.85, g: 0.87, b: 0.9,
    });
  }

  /** Glittering sparkles (goldfish, treasure, rewards). */
  sparkle(x: number, y: number, z: number, color = 0xffe066, count = 3, spread = 1.2): void {
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      this.spawn({
        x: x + (Math.random() - 0.5) * spread, y: y + Math.random() * spread * 0.6, z: z + (Math.random() - 0.5) * spread,
        vy: 0.6 + Math.random() * 0.8, life: 0.5 + Math.random() * 0.5, size: 0.25 + Math.random() * 0.25,
        r: c.r, g: c.g, b: c.b, additive: true,
      });
    }
  }

  /** Big burst of glowing particles (boss defeated, treasure opened). */
  burst(x: number, y: number, z: number, color: number, count = 40, speed = 6): void {
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = Math.random();
      const sp = speed * (0.5 + Math.random() * 0.5);
      this.spawn({
        x, y, z, vx: Math.cos(a) * sp * (1 - up * 0.5), vy: up * sp * 1.2, vz: Math.sin(a) * sp * (1 - up * 0.5),
        gravity: 6, drag: 1.2, life: 0.8 + Math.random() * 0.6, size: 0.35 + Math.random() * 0.3,
        r: c.r, g: c.g, b: c.b, additive: true,
      });
    }
  }

  /** Expanding ring on the water. */
  ripple(x: number, z: number, size = 2, color = 0xffffff): void {
    const r = this.ripples.find((o) => o.life <= 0) ?? this.ripples.reduce((a, b) => (a.life < b.life ? a : b));
    r.life = r.maxLife = 0.9 + size * 0.1;
    r.size = size;
    r.mesh.position.set(x, 0.12, z);
    (r.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
    r.mesh.visible = true;
  }

  update(dt: number, waveHeight: (x: number, z: number) => number): void {
    let n = 0;
    let gn = 0;
    for (const p of this.particles) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        continue;
      }
      p.vy -= p.gravity * dt;
      const drag = Math.max(0, 1 - p.drag * dt);
      p.vx *= drag;
      p.vz *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.size += p.grow * dt;
      // droplets disappear when they fall back into the sea
      if (p.gravity > 0 && p.vy < 0 && p.y < waveHeight(p.x, p.z) - 0.1) {
        p.alive = false;
        continue;
      }
      const t = p.life / p.maxLife;
      const alpha = Math.min(1, t * 2.2) * (p.grow > 0 ? t : 1);
      if (p.additive) {
        this.glowPositions.set([p.x, p.y, p.z], gn * 3);
        this.glowColors.set([p.r, p.g, p.b, alpha], gn * 4);
        this.glowSizes[gn] = p.size;
        gn++;
      } else {
        this.positions.set([p.x, p.y, p.z], n * 3);
        this.colors.set([p.r, p.g, p.b, alpha * 0.95], n * 4);
        this.sizes[n] = p.size;
        n++;
      }
    }
    this.flush(this.points, n);
    this.flush(this.glowPoints, gn);

    for (const r of this.ripples) {
      if (r.life <= 0) continue;
      r.life -= dt;
      const k = 1 - Math.max(0, r.life) / r.maxLife;
      const s = r.size * (0.3 + k * 0.9);
      r.mesh.scale.set(s, s, s);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.55;
      if (r.life <= 0) r.mesh.visible = false;
    }
  }

  private flush(pts: THREE.Points, count: number): void {
    const geo = pts.geometry;
    geo.setDrawRange(0, count);
    for (const name of ['position', 'color', 'size']) {
      const attr = geo.getAttribute(name) as THREE.BufferAttribute;
      attr.needsUpdate = true;
    }
  }
}
