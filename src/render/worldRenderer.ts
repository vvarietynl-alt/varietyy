import * as THREE from 'three';
import type { CatchableRarity } from '../data/balance';
import { themeFor, type FishSpecies } from '../data/fish';
import { boatSpeedMult, engineVisualTier } from '../game/economy';
import { type FishEntity, type FishingWorld, ISLAND_RADIUS, ZONE_WIDTH, zoneBand } from '../game/fishing';
import type { Game } from '../game/game';
import type { Fleet } from '../game/fleet';
import { FleetRenderer } from './fleet';
import { BOAT_SKINS, type DecorId } from '../data/balance';
import { Effects } from './effects';
import { type BoatModel, type BuildingId, createBlobShadow, createBoat, createBottle, createDecor, createGull, createFish, createIsland, createRock, createTreasureChest, flat, shared } from './models';
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


export type CameraMode = 'sea' | 'island';

/** Soft vertical sky gradient (lighter towards the top). */
function skyGradient(color: number): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const base = new THREE.Color(color);
  const top = base.clone().lerp(new THREE.Color(0xffffff), 0.45);
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, `#${top.getHexString()}`);
  g.addColorStop(1, `#${base.getHexString()}`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Goldfish / treasure rings have their own material (fading opacity); free it on removal. */
function disposeRing(g: THREE.Object3D): void {
  const ring = g.getObjectByName('ring') as THREE.Mesh | undefined;
  (ring?.material as THREE.Material | undefined)?.dispose();
}

export class WorldRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private ocean: ReturnType<typeof createOcean>;
  private floor: THREE.Mesh;
  private boat: BoatModel;
  readonly effects: Effects;
  private sun: THREE.DirectionalLight;
  private boatShadow: THREE.Mesh;
  private gulls: THREE.Group[] = [];
  private smokeTimer = 0;
  private boatSkin = '';
  private decor = new THREE.Group();
  private decorKey = '';
  private buildings: Map<BuildingId, THREE.Object3D>;
  private island: THREE.Group;
  private fishMeshes = new Map<number, THREE.Group>();
  private goldMeshes = new Map<number, THREE.Group>();
  private treasureMeshes = new Map<number, THREE.Group>();
  private bossMesh: THREE.Group | null = null;
  private bossKey = '';
  private jumpers: Jumper[] = [];
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
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.5, 400);

    // warm sun + cool sky light; the sun casts soft shadows on the island
    this.scene.add(new THREE.HemisphereLight(0xd8f1ff, 0x2f6d8f, 1.25));
    this.sun = new THREE.DirectionalLight(0xfff0d6, 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -26;
    sc.right = sc.top = 26;
    sc.near = 10;
    sc.far = 140;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);
    this.effects = new Effects(this.scene);

    this.floor = new THREE.Mesh(new THREE.CircleGeometry(220, 40), new THREE.MeshBasicMaterial({ color: 0x0d4f8a }));
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -6;
    this.scene.add(this.floor);

    this.ocean = createOcean(340, 150);
    this.scene.add(this.ocean.mesh);

    const isl = createIsland(ISLAND_RADIUS);
    this.island = isl.group;
    this.buildings = isl.buildings;
    this.island.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
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
    this.boatShadow = createBlobShadow(4.6, 2.6);
    this.scene.add(this.boatShadow);
    this.scene.add(this.decor);

    this.fleetRenderer = new FleetRenderer(this.scene, fleet, game, (x, z) => this.waveHeight(x, z), this.effects);

    for (let i = 0; i < 5; i++) {
      const gull = createGull();
      gull.userData.angle = i * 1.3;
      gull.userData.radius = 9 + (i % 3) * 4;
      gull.userData.height = 8 + (i % 2) * 2.5;
      gull.userData.speed = 0.25 + (i % 3) * 0.08;
      this.gulls.push(gull);
      this.scene.add(gull);
    }

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
        case 'hit': {
          this.effects.splash(e.x, e.z, e.crit ? 7 : 3, 0xffffff, e.crit ? 0.9 : 0.6);
          if (e.crit) this.effects.sparkle(e.x, 0.6, e.z, 0xffb347, 6, 1);
          const t = this.world.target;
          const m = t ? this.fishMeshes.get(t.id) : undefined;
          if (m) m.userData.squash = 1;
          break;
        }
        case 'hooked':
          this.effects.splash(e.fish.x, e.fish.z, 12, 0xffffff, 1);
          break;
        case 'goldfish-collected':
          this.effects.splash(e.goldfish.x, e.goldfish.z, 10, 0xffffff, 1);
          this.effects.burst(e.goldfish.x, 0.8, e.goldfish.z, 0xffd23f, 36, 6);
          break;
        case 'treasure-opened':
          this.effects.splash(e.treasure.x, e.treasure.z, 12, 0xffffff, 1.1);
          this.effects.burst(e.treasure.x, 0.8, e.treasure.z, 0xffd23f, 50, 7);
          this.shake = 0.25;
          break;
        case 'frenzy-start':
          this.shake = 0.3;
          this.effects.burst(this.world.boat.x, 1, this.world.boat.z, 0xff8a3d, 50, 7);
          break;
        case 'boss-mini-hit':
          if (e.hit) this.shake = 0.35;
          break;
        case 'boss-won':
          this.shake = 0.8;
          if (this.bossMesh) {
            const p = this.bossMesh.position;
            this.effects.splash(p.x, p.z, 40, 0xffffff, 1.8);
            this.effects.burst(p.x, 1.5, p.z, 0xffd23f, 80, 10);
            this.effects.ripple(p.x, p.z, 9);
          }
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
    this.effects?.setViewportHeight(h);
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
    const theme = themeFor(level);
    const u = this.ocean.material.uniforms;
    (u.uShallow.value as THREE.Color).setHex(theme.shallow);
    (u.uDeep.value as THREE.Color).setHex(theme.deep);
    (u.uSky.value as THREE.Color).setHex(theme.sky);
    this.scene.background = skyGradient(theme.sky);
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
    const ev = this.world.seaEvent;
    if (ev) (u.uEventTint.value as THREE.Color).setHex(ev.kind === 'goldenHour' ? 0xffc928 : 0x6fffe0);
    u.uEventAmt.value += ((ev ? 1 : 0) - u.uEventAmt.value) * Math.min(1, dt * 2);
    u.uZoneW.value = ZONE_WIDTH;

    this.syncCosmetics();
    this.updateBoat(dt);
    this.fleetRenderer.update(dt);
    this.syncFish(dt);
    this.syncGoldfish();
    this.syncTreasure();
    this.syncBoss(dt);
    this.updateMarkers();
    this.updateJumpers(dt);
    this.updateGulls(dt);
    this.effects.update(dt, (x, z) => this.waveHeight(x, z));
    this.updateCamera(dt);
    // the sun's shadow box follows what the camera looks at
    this.sun.position.set(this.camTarget.x + 30, 60, this.camTarget.z + 20);
    this.sun.target.position.copy(this.camTarget);
    this.renderer.render(this.scene, this.camera);
  }

  /** Rebuild the player boat when the skin changes, and place bought decorations. */
  private syncCosmetics(): void {
    const c = this.game.state.cosmetics;
    const tier = engineVisualTier(this.game.state.upgrades.engine);
    const boatKey = `${c.boatSkin}-${tier}`;
    if (boatKey !== this.boatSkin) {
      const upgraded = this.boatSkin !== '' && this.boatSkin.endsWith(`-${tier - 1}`);
      this.boatSkin = boatKey;
      this.scene.remove(this.boat.group);
      this.boat = createBoat(BOAT_SKINS[c.boatSkin] ?? BOAT_SKINS.classic, tier);
      this.boat.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
      if (upgraded) this.effects.burst(this.world.boat.x, 1, this.world.boat.z, 0xffd23f, 40, 6);
      this.scene.add(this.boat.group);
    }
    const key = c.decor.join();
    if (key !== this.decorKey) {
      this.decorKey = key;
      this.decor.clear();
      const spots: Record<DecorId, [number, number, number]> = {
        flowers: [1.2, 1.15, -0.8],
        flags: [3.5, 1.15, 10.5],
        lanterns: [-6.5, 1.15, 9.5],
        fountain: [2.6, 1.15, 2.4],
        statue: [-8.5, 1.15, -0.5],
      };
      for (const id of c.decor) {
        const d = createDecor(id);
        d.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        const [x, y, z] = spots[id];
        d.position.set(x, y, z);
        this.decor.add(d);
      }
    }
    if (this.decor.children.length) {
      this.decor.traverse((o) => {
        if (o.userData.spin) o.rotation.y += 0.02;
        if (o.userData.wave !== undefined) o.rotation.y = Math.sin(this.time * 3 + o.userData.wave) * 0.3;
      });
    }
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
    const speed = boatSpeedMult(this.game.state.upgrades.engine);
    g.traverse((o) => {
      if (o.userData.prop) o.rotation.z += dt * (b.moving ? 40 : 6);
      if (o.userData.flame) o.scale.setScalar(b.moving ? 0.8 + Math.random() * 0.6 : 0.3);
      if (o.userData.wave !== undefined) o.rotation.y = Math.sin(this.time * (b.moving ? 9 : 4)) * 0.35;
    });
    this.boatShadow.position.set(b.x, 0.06, b.z);
    this.boatShadow.rotation.z = -b.heading;
    // foam trail behind the boat, bigger the faster it goes
    if (b.moving && Math.random() < dt * 30 * speed) {
      const bx = b.x - Math.sin(b.heading) * 1.9;
      const bz = b.z - Math.cos(b.heading) * 1.9;
      this.effects.wake(bx, bz, 0.8 + speed * 0.25);
    }
    // chimney smoke
    this.smokeTimer -= dt;
    if (this.smokeTimer <= 0) {
      this.smokeTimer = b.moving ? 0.18 : 0.45;
      const p = new THREE.Vector3();
      this.boat.smokeTip.getWorldPosition(p);
      this.effects.smoke(p.x, p.y, p.z);
    }
  }

  private syncFish(dt: number): void {
    const theme = themeFor(this.game.state.level);
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
      const base = m.userData.size * (0.4 + 0.6 * fade);
      // squash when hit
      const sq = Math.max(0, (m.userData.squash ?? 0) as number);
      m.userData.squash = sq - dt * 7;
      m.scale.set(base * (1 + 0.22 * sq), base * (1 - 0.18 * sq), base * (1 + 0.08 * sq));
      const hooked = f.state === 'hooked';
      const y = hooked ? -0.2 + Math.sin(f.phase * 9) * 0.12 : FISH_DEPTH + Math.sin(f.phase * 1.5) * 0.08;
      m.position.set(f.x, y, f.z);
      m.rotation.y = f.heading;
      const wiggleSpeed = hooked ? 22 : f.state === 'flee' ? 16 : 7;
      m.traverse((o) => {
        if (o.userData.tail) o.rotation.y = (o.userData.tailBase ?? 0) + Math.sin(f.phase * wiggleSpeed) * 0.5;
        if (o.userData.pec) o.rotation.x = Math.sin(f.phase * wiggleSpeed * 0.6) * 0.35;
        if (o.userData.segment !== undefined) o.position.x = Math.sin(f.phase * 4 - o.userData.segment * 0.9) * 0.18;
        if (o.userData.wing) o.rotation.z = o.userData.wing * (0.4 + Math.sin(f.phase * 10) * 0.35);
      });
      if (hooked && Math.random() < dt * 8) this.effects.splash(f.x + (Math.random() - 0.5), f.z + (Math.random() - 0.5), 2, 0xffffff, 0.5);
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
          shared(new THREE.RingGeometry(1.2, 1.6, 20)),
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
      if (Math.random() < 0.25) this.effects.sparkle(g.x, 1, g.z, 0xffe066, 1, 1.4);
      (ring.material as THREE.MeshBasicMaterial).opacity = Math.min(0.85, g.ttl / 2);
    }
    for (const [id, m] of this.goldMeshes) {
      if (!alive.has(id)) {
        this.goldMeshes.delete(id);
        this.scene.remove(m);
        disposeRing(m);
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
          shared(new THREE.RingGeometry(1.4, 1.8, 24)),
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
      if (Math.random() < 0.15) this.effects.sparkle(t.x, 0.6, t.z, 0xffe066, 1, 1.6);
    }
    for (const [id, m] of this.treasureMeshes) {
      if (!alive.has(id)) {
        this.treasureMeshes.delete(id);
        this.scene.remove(m);
        disposeRing(m);
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
        const theme = themeFor(this.game.state.level);
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
      if (fighting && Math.random() < dt * 10) this.effects.splash(boss.x + (Math.random() - 0.5) * 5, boss.z + (Math.random() - 0.5) * 5, 4, 0xffffff, 1.2);
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
    this.effects.splash(f.x, f.z, 18, 0xffffff, 1.1);
    if (f.rarity !== 'common') this.effects.burst(f.x, 1, f.z, f.rarity === 'legendary' ? 0xa35cff : f.rarity === 'endangered' ? 0x3cc45a : 0x3fa2ff, 24, 5);
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

  /** Splash on the water (kept for callers outside the renderer). */
  splash(x: number, z: number, count: number, color: number, size = 1): void {
    this.effects.splash(x, z, count, color, size);
  }

  /** Small ripple where the player taps the sea. */
  private lastTapRipple = 0;
  tapRipple(x: number, z: number): void {
    // fast tapping would stack dozens of rings; one every 0.35 s is enough
    if (this.time - this.lastTapRipple < 0.35) return;
    this.lastTapRipple = this.time;
    this.effects.ripple(x, z, 1.2);
  }

  private updateGulls(dt: number): void {
    for (const g of this.gulls) {
      const d = g.userData;
      d.angle += dt * d.speed;
      g.position.set(this.camTarget.x + Math.sin(d.angle) * d.radius, d.height + Math.sin(this.time * 0.8 + d.angle) * 0.6, this.camTarget.z - 4 + Math.cos(d.angle) * d.radius * 0.7);
      g.rotation.y = d.angle + Math.PI / 2;
      g.rotation.z = -0.25;
      for (const c of g.children) if (c.userData.wing) c.rotation.z = c.userData.wing * Math.sin(this.time * 7 + d.angle * 3) * 0.55;
    }
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
    const theme = themeFor(species.level);
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
    cam.position.set(0, 0.5, 4.6);
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
