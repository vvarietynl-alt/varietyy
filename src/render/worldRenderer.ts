import * as THREE from 'three';
import type { CatchableRarity } from '../data/balance';
import { LEVEL_THEMES, type FishSpecies } from '../data/fish';
import { type FishEntity, type FishingWorld, ISLAND_RADIUS, ZONE_WIDTH, zoneBand } from '../game/fishing';
import type { Game } from '../game/game';
import type { Fleet } from '../game/fleet';
import { FleetRenderer } from './fleet';
import { type BoatModel, type BuildingId, createBoat, createBottle, createFish, createIsland, createRock, createTreasureChest, flat } from './models';
import { createOcean } from './ocean';

const RARITY_SIZE: Record<CatchableRarity, number> = { common: 0.85, rare: 1.0, endangered: 1.15, legendary: 1.4 };
const FISH_DEPTH = -0.55;

interface Jumper {
  obj: THREE.Object3D;
  from: THREE.Vector3;
  t: number;
  duration: number;
  height: number;
  spin: number;
}

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
}

export type CameraMode = 'sea' | 'island';

export class WorldRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private ocean: ReturnType<typeof createOcean>;
  private floor: THREE.Mesh;
  private boat: BoatModel;
  private buildings: Map<BuildingId, THREE.Object3D>;
  private island: THREE.Group;
  private fishMeshes = new Map<number, THREE.Group>();
  private goldMeshes = new Map<number, THREE.Group>();
  private treasureMeshes = new Map<number, THREE.Group>();
  private bossMesh: THREE.Group | null = null;
  private bossKey = '';
  private jumpers: Jumper[] = [];
  private particles: Particle[] = [];
  private line: THREE.Line;
  private targetRing: THREE.Mesh;
  private nextArrow: THREE.Mesh;
  private rocks = new THREE.Group();
  private raycaster = new THREE.Raycaster();
  private camTarget = new THREE.Vector3();
  private camPos = new THREE.Vector3();
  private shake = 0;
  private time = 0;
  private themeLevel = 0;
  mode: CameraMode = 'sea';
  readonly fleetRenderer: FleetRenderer;

  constructor(private canvas: HTMLCanvasElement, private world: FishingWorld, private game: Game, fleet: Fleet) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.5, 400);

    this.scene.add(new THREE.HemisphereLight(0xdff6ff, 0x3b6e8f, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 1.9);
    sun.position.set(30, 60, 20);
    this.scene.add(sun);

    this.floor = new THREE.Mesh(new THREE.CircleGeometry(220, 40), new THREE.MeshBasicMaterial({ color: 0x0d4f8a }));
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -6;
    this.scene.add(this.floor);

    this.ocean = createOcean(340, 150);
    this.scene.add(this.ocean.mesh);

    const isl = createIsland(ISLAND_RADIUS);
    this.island = isl.group;
    this.buildings = isl.buildings;
    this.scene.add(this.island);

    // scattered rocks in the sea for depth cues
    for (let i = 0; i < 18; i++) {
      const a = i * 2.39996;
      const r = ISLAND_RADIUS + 24 + ((i * 37) % 80);
      const rock = createRock(0.5 + (i % 3) * 0.3);
      rock.position.set(Math.sin(a) * r, -0.5, Math.cos(a) * r);
      rock.rotation.y = i;
      this.rocks.add(rock);
    }
    this.scene.add(this.rocks);

    this.boat = createBoat();
    this.scene.add(this.boat.group);

    this.fleetRenderer = new FleetRenderer(this.scene, fleet, game, (x, z) => this.waveHeight(x, z), (x, z, n, c, sz) => this.splash(x, z, n, c, sz));

    this.line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }),
    );
    this.line.frustumCulled = false;
    this.scene.add(this.line);

    this.targetRing = new THREE.Mesh(
      new THREE.RingGeometry(1.1, 1.35, 20),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }),
    );
    this.targetRing.rotation.x = -Math.PI / 2;
    this.targetRing.renderOrder = 20;
    this.scene.add(this.targetRing);

    this.nextArrow = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.9, 4), flat(0xffd23f, { emissive: 0xffb000 }));
    this.nextArrow.rotation.x = Math.PI;
    this.scene.add(this.nextArrow);

    this.camTarget.set(world.boat.x, 0, world.boat.z);
    this.camPos.copy(this.desiredCamPos());
    this.applyTheme();
    this.resize();

    world.on((e) => {
      switch (e.type) {
        case 'caught':
          this.startJump(e.fish);
          break;
        case 'hit':
          this.splash(e.x, e.z, 4, 0xffffff);
          break;
        case 'hooked':
          this.splash(e.fish.x, e.fish.z, 10, 0xffffff);
          break;
        case 'goldfish-collected':
          this.splash(e.goldfish.x, e.goldfish.z, 18, 0xffd23f);
          break;
        case 'treasure-opened':
          this.splash(e.treasure.x, e.treasure.z, 26, 0xffd23f, 1.2);
          this.shake = 0.25;
          break;
        case 'frenzy-start':
          this.shake = 0.3;
          this.splash(this.world.boat.x, this.world.boat.z, 30, 0xff8a3d, 1.1);
          break;
        case 'boss-mini-hit':
          if (e.hit) this.shake = 0.35;
          break;
        case 'boss-won':
          this.shake = 0.8;
          if (this.bossMesh) this.splash(this.bossMesh.position.x, this.bossMesh.position.z, 40, 0xffffff);
          break;
        case 'zone-reset':
          this.clearEntities();
          break;
      }
    });
  }

  // --- Public helpers ------------------------------------------------------------

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // keep a similar horizontal view on narrow phones
    this.camera.fov = w / h < 0.7 ? 58 : 48;
    this.camera.updateProjectionMatrix();
  }

  screenToWorld(clientX: number, clientY: number): { x: number; z: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(plane, hit)) return null;
    return { x: hit.x, z: hit.z };
  }

  pickBuilding(clientX: number, clientY: number): BuildingId | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects([...this.buildings.values()], true);
    return (hits[0]?.object.userData.building as BuildingId) ?? null;
  }

  /** Project a world position to CSS pixels. */
  toScreen(x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: rect.left + ((v.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - v.y) / 2) * rect.height,
      visible: v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2,
    };
  }

  buildingScreenPos(id: BuildingId): { x: number; y: number; visible: boolean } {
    const b = this.buildings.get(id)!;
    const p = new THREE.Vector3();
    b.getWorldPosition(p);
    return this.toScreen(p.x, p.y + 4.2, p.z);
  }

  applyTheme(): void {
    const level = this.game.state.level;
    if (level === this.themeLevel) return;
    this.themeLevel = level;
    const theme = LEVEL_THEMES[level - 1];
    const u = this.ocean.material.uniforms;
    (u.uShallow.value as THREE.Color).setHex(theme.shallow);
    (u.uDeep.value as THREE.Color).setHex(theme.deep);
    (u.uSky.value as THREE.Color).setHex(theme.sky);
    this.scene.background = new THREE.Color(theme.sky);
    (this.floor.material as THREE.MeshBasicMaterial).color.setHex(theme.deep).multiplyScalar(0.55);
    this.clearEntities();
  }

  // --- Frame ---------------------------------------------------------------------

  update(dt: number): void {
    this.time += dt;
    this.applyTheme();
    const s = this.game.state;
    const u = this.ocean.material.uniforms;
    u.uTime.value = this.time;
    u.uUnlockedR.value = zoneBand(s.unlockedZone).outer;
    const band = zoneBand(s.activeZone);
    u.uActiveInner.value = band.inner;
    u.uActiveOuter.value = band.outer;
    u.uIslandR.value = ISLAND_RADIUS;
    u.uZoneW.value = ZONE_WIDTH;

    this.updateBoat(dt);
    this.fleetRenderer.update(dt);
    this.syncFish(dt);
    this.syncGoldfish();
    this.syncTreasure();
    this.syncBoss(dt);
    this.updateMarkers();
    this.updateJumpers(dt);
    this.updateParticles(dt);
    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
  }

  private waveHeight(x: number, z: number): number {
    const t = this.time;
    return Math.sin(x * 0.33 + t * 1.25) * 0.16 + Math.sin(z * 0.41 - t * 1.05) * 0.15 + Math.sin((x + z) * 0.85 + t * 2.1) * 0.05;
  }

  private updateBoat(dt: number): void {
    const b = this.world.boat;
    const g = this.boat.group;
    g.position.set(b.x, this.waveHeight(b.x, b.z) - 0.25, b.z);
    g.rotation.y = b.heading;
    g.rotation.z = Math.sin(this.time * 1.7) * 0.05;
    g.rotation.x = Math.sin(this.time * 1.3) * 0.04 + (b.moving ? -0.05 : 0);
    this.boat.radar.rotation.y += dt * (1 + this.game.state.upgrades.radar * 0.4);
    if (b.moving && Math.random() < dt * 25) {
      const back = new THREE.Vector3(-Math.sin(b.heading) * 1.6, 0, -Math.cos(b.heading) * 1.6);
      this.splash(b.x + back.x, b.z + back.z, 1, 0xffffff, 0.6);
    }
  }

  private syncFish(dt: number): void {
    const theme = LEVEL_THEMES[this.game.state.level - 1];
    const alive = new Set<number>();
    for (const f of this.world.fish) {
      alive.add(f.id);
      let m = this.fishMeshes.get(f.id);
      if (!m) {
        m = createFish(f.species.color, f.species.shape, theme.decor, RARITY_SIZE[f.rarity]);
        m.userData.size = RARITY_SIZE[f.rarity];
        this.fishMeshes.set(f.id, m);
        this.scene.add(m);
      }
      const fade = Math.min(1, f.age / 0.8);
      m.scale.setScalar(m.userData.size * (0.4 + 0.6 * fade));
      const hooked = f.state === 'hooked';
      const y = hooked ? -0.2 + Math.sin(f.phase * 9) * 0.12 : FISH_DEPTH + Math.sin(f.phase * 1.5) * 0.08;
      m.position.set(f.x, y, f.z);
      m.rotation.y = f.heading;
      const wiggleSpeed = hooked ? 22 : f.state === 'flee' ? 16 : 7;
      m.traverse((o) => {
        if (o.userData.tail) o.rotation.y = Math.PI / 4 + Math.sin(f.phase * wiggleSpeed) * 0.5;
        if (o.userData.segment !== undefined) o.position.x = Math.sin(f.phase * 4 - o.userData.segment * 0.9) * 0.18;
        if (o.userData.wing) o.rotation.z = o.userData.wing * (0.4 + Math.sin(f.phase * 10) * 0.35);
      });
      if (hooked && Math.random() < dt * 6) this.splash(f.x, f.z, 1, 0xffffff, 0.5);
    }
    for (const [id, m] of this.fishMeshes) {
      if (!alive.has(id)) {
        this.fishMeshes.delete(id);
        if (!this.jumpers.some((j) => j.obj === m)) this.scene.remove(m);
      }
    }
  }

  private syncGoldfish(): void {
    const alive = new Set<number>();
    for (const g of this.world.goldfish) {
      alive.add(g.id);
      let m = this.goldMeshes.get(g.id);
      if (!m) {
        m = new THREE.Group();
        const fish = createFish(0xffc928, 'round', 'glow', 0.75);
        fish.name = 'fish';
        m.add(fish);
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(1.2, 1.6, 20),
          new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.8, depthWrite: false }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.15;
        ring.name = 'ring';
        m.add(ring);
        this.goldMeshes.set(g.id, m);
        this.scene.add(m);
      }
      m.position.set(g.x, 0, g.z);
      const fish = m.getObjectByName('fish')!;
      const jump = (this.time * 1.4 + g.id) % 1;
      fish.position.y = Math.sin(jump * Math.PI) * 1.6 - 0.2;
      fish.rotation.x = (jump - 0.5) * 2.2;
      fish.rotation.y = g.id;
      const ring = m.getObjectByName('ring') as THREE.Mesh;
      const pulse = 1 + Math.sin(this.time * 6) * 0.12;
      ring.scale.setScalar(pulse);
      (ring.material as THREE.MeshBasicMaterial).opacity = Math.min(0.85, g.ttl / 2);
    }
    for (const [id, m] of this.goldMeshes) {
      if (!alive.has(id)) {
        this.goldMeshes.delete(id);
        this.scene.remove(m);
      }
    }
  }

  private syncTreasure(): void {
    const alive = new Set<number>();
    for (const t of this.world.treasures) {
      alive.add(t.id);
      let m = this.treasureMeshes.get(t.id);
      if (!m) {
        m = new THREE.Group();
        const obj = t.kind === 'chest' ? createTreasureChest() : createBottle();
        obj.name = 'obj';
        m.add(obj);
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(1.4, 1.8, 24),
          new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.8, depthWrite: false }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.12;
        ring.name = 'ring';
        m.add(ring);
        this.treasureMeshes.set(t.id, m);
        this.scene.add(m);
      }
      m.position.set(t.x, this.waveHeight(t.x, t.z) - 0.15, t.z);
      const obj = m.getObjectByName('obj')!;
      obj.rotation.set(Math.sin(this.time * 1.8 + t.id) * 0.18, t.heading + this.time * 0.2, Math.cos(this.time * 1.4) * 0.15);
      const ring = m.getObjectByName('ring') as THREE.Mesh;
      ring.scale.setScalar(1 + Math.sin(this.time * 4) * 0.1);
      (ring.material as THREE.MeshBasicMaterial).opacity = Math.min(0.85, t.ttl / 2);
      if (Math.random() < 0.08) this.splash(t.x + (Math.random() - 0.5), t.z + (Math.random() - 0.5), 1, 0xffe066, 0.6);
    }
    for (const [id, m] of this.treasureMeshes) {
      if (!alive.has(id)) {
        this.treasureMeshes.delete(id);
        this.scene.remove(m);
      }
    }
  }

  private syncBoss(dt: number): void {
    const boss = this.world.boss;
    const key = boss ? boss.species.id : '';
    if (key !== this.bossKey) {
      if (this.bossMesh) {
        const old = this.bossMesh;
        this.jumpers.push({ obj: old, from: old.position.clone(), t: 0, duration: 1.4, height: 5, spin: 0.6 });
      }
      this.bossMesh = null;
      this.bossKey = key;
      if (boss) {
        const theme = LEVEL_THEMES[this.game.state.level - 1];
        this.bossMesh = createFish(boss.species.color, boss.species.shape, theme.decor, boss.species.shape === 'whale' ? 2.6 : 2.2);
        this.scene.add(this.bossMesh);
      }
    }
    if (boss && this.bossMesh) {
      const fight = this.world.fight;
      const fighting = !!fight && !fight.over;
      const target = new THREE.Vector3(boss.x, fighting ? -0.4 : -1.0, boss.z);
      this.bossMesh.position.lerp(target, Math.min(1, dt * 2));
      this.bossMesh.position.y += Math.sin(this.time * (fighting ? 6 : 1.2)) * (fighting ? 0.15 : 0.1);
      this.bossMesh.rotation.y = boss.heading + (fighting ? Math.sin(this.time * 8) * 0.15 : 0);
      this.bossMesh.traverse((o) => {
        if (o.userData.tail) o.rotation.x = Math.sin(this.time * (fighting ? 9 : 2)) * 0.35;
        if (o.userData.segment !== undefined) o.position.y = Math.sin(this.time * 2.5 - o.userData.segment) * 0.35;
      });
      if (fighting && Math.random() < dt * 8) this.splash(boss.x + (Math.random() - 0.5) * 4, boss.z + (Math.random() - 0.5) * 4, 2, 0xffffff);
    }
  }

  private updateMarkers(): void {
    const t = this.world.target;
    const showLine = !!t && t.state === 'hooked';
    this.line.visible = showLine || (!!this.world.fight && !this.world.fight.over);
    const tip = new THREE.Vector3();
    this.boat.rodTip.getWorldPosition(tip);
    const pos = (this.line.geometry as THREE.BufferGeometry).attributes.position as THREE.BufferAttribute;
    if (showLine && t) {
      pos.setXYZ(0, tip.x, tip.y, tip.z);
      pos.setXYZ(1, t.x, -0.1, t.z);
      pos.needsUpdate = true;
    } else if (this.line.visible && this.bossMesh) {
      pos.setXYZ(0, tip.x, tip.y, tip.z);
      pos.setXYZ(1, this.bossMesh.position.x, 0, this.bossMesh.position.z);
      pos.needsUpdate = true;
    }

    this.targetRing.visible = !!t;
    if (t) {
      this.targetRing.position.set(t.x, 0.25, t.z);
      const s = t.state === 'hooked' ? 1 + Math.sin(this.time * 10) * 0.08 : 1.2;
      this.targetRing.scale.setScalar(s);
      (this.targetRing.material as THREE.MeshBasicMaterial).color.setHex(t.state === 'hooked' ? 0xffffff : 0xbff3ff);
    }
    const next = this.world.fish.find((f) => f.id === this.world.nextTargetId);
    this.nextArrow.visible = !!next;
    if (next) {
      this.nextArrow.position.set(next.x, 1.6 + Math.sin(this.time * 5) * 0.25, next.z);
      this.nextArrow.rotation.y += 0.05;
    }
  }

  private startJump(f: FishEntity): void {
    const m = this.fishMeshes.get(f.id);
    if (!m) return;
    this.jumpers.push({ obj: m, from: m.position.clone(), t: 0, duration: 0.75, height: 3.2, spin: 2 });
    this.splash(f.x, f.z, 14, 0xffffff);
  }

  private updateJumpers(dt: number): void {
    const boat = this.boat.group.position;
    for (const j of this.jumpers) {
      j.t += dt / j.duration;
      const k = Math.min(1, j.t);
      const isBoss = j.duration > 1;
      const to = isBoss ? new THREE.Vector3(j.from.x, -4, j.from.z) : new THREE.Vector3(boat.x, 1, boat.z);
      j.obj.position.lerpVectors(j.from, to, k);
      j.obj.position.y += Math.sin(k * Math.PI) * j.height;
      j.obj.rotation.x = -k * Math.PI * j.spin;
      if (!isBoss) j.obj.scale.multiplyScalar(1 - dt * 0.6);
    }
    for (const j of this.jumpers.filter((o) => o.t >= 1)) this.scene.remove(j.obj);
    this.jumpers = this.jumpers.filter((o) => o.t < 1);
  }

  splash(x: number, z: number, count: number, color: number, size = 1): void {
    for (let i = 0; i < count; i++) {
      if (this.particles.length > 220) break;
      const p = new THREE.Mesh(new THREE.TetrahedronGeometry(0.14 * size, 0), flat(color));
      p.position.set(x + (Math.random() - 0.5) * 0.8, 0.1, z + (Math.random() - 0.5) * 0.8);
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 2.5;
      this.particles.push({ mesh: p, vel: new THREE.Vector3(Math.cos(a) * sp, 3 + Math.random() * 4, Math.sin(a) * sp), life: 0.6 + Math.random() * 0.4 });
      this.scene.add(p);
    }
  }

  private updateParticles(dt: number): void {
    for (const p of this.particles) {
      p.life -= dt;
      p.vel.y -= 14 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += dt * 8;
    }
    for (const p of this.particles.filter((o) => o.life <= 0 || o.mesh.position.y < -0.5)) {
      this.scene.remove(p.mesh);
      p.mesh.geometry.dispose();
    }
    this.particles = this.particles.filter((o) => o.life > 0 && o.mesh.position.y >= -0.5);
  }

  private desiredCamPos(): THREE.Vector3 {
    if (this.mode === 'island') return new THREE.Vector3(0, 34, 30);
    return new THREE.Vector3(this.camTarget.x, 36, this.camTarget.z + 23);
  }

  private updateCamera(dt: number): void {
    const b = this.world.boat;
    const focus = this.mode === 'island' ? new THREE.Vector3(0, 0, 1.5) : new THREE.Vector3(b.x, 0, b.z);
    this.camTarget.lerp(focus, Math.min(1, dt * 3));
    this.camPos.lerp(this.desiredCamPos(), Math.min(1, dt * 3));
    this.camera.position.copy(this.camPos);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
    }
    this.camera.lookAt(this.camTarget);
  }

  private clearEntities(): void {
    for (const m of this.fishMeshes.values()) this.scene.remove(m);
    this.fishMeshes.clear();
    for (const m of this.goldMeshes.values()) this.scene.remove(m);
    this.goldMeshes.clear();
    for (const m of this.treasureMeshes.values()) this.scene.remove(m);
    this.treasureMeshes.clear();
  }

  /** Small 3D preview of a species for the Atlas (rendered once to a data URL). */
  static previewCache = new Map<string, string>();
  renderPreview(species: FishSpecies): string {
    const cached = WorldRenderer.previewCache.get(species.id);
    if (cached) return cached;
    const theme = LEVEL_THEMES[species.level - 1];
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x446688, 2));
    const dl = new THREE.DirectionalLight(0xffffff, 1.5);
    dl.position.set(2, 4, 3);
    scene.add(dl);
    const big = species.shape === 'whale' || species.shape === 'serpent';
    const fish = createFish(species.color, species.shape, theme.decor, big ? 0.55 : 1);
    fish.rotation.y = Math.PI / 2 + 0.35;
    fish.rotation.x = 0.25;
    if (species.shape === 'eel' || species.shape === 'serpent') fish.position.x = big ? 1.1 : 1.6;
    scene.add(fish);
    const cam = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
    cam.position.set(0, 0.6, 6);
    cam.lookAt(0, 0, 0);
    const size = 128;
    const rt = new THREE.WebGLRenderTarget(size, size);
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    const prevBg = scene.background;
    this.renderer.setRenderTarget(rt);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear();
    this.renderer.render(scene, cam);
    const pixels = new Uint8Array(size * size * 4);
    this.renderer.readRenderTargetPixels(rt, 0, 0, size, size, pixels);
    this.renderer.setRenderTarget(null);
    this.renderer.setClearColor(0x000000, 1);
    void prevBg;
    rt.dispose();
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      const src = (size - 1 - y) * size * 4;
      img.data.set(pixels.subarray(src, src + size * 4), y * size * 4);
    }
    ctx.putImageData(img, 0, 0);
    const url = c.toDataURL();
    WorldRenderer.previewCache.set(species.id, url);
    return url;
  }
}
