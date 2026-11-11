import * as THREE from 'three';
import { speciesFor } from '../data/fish';
import { boatClassFor, type Fleet, PIER_X, piersFor } from '../game/fleet';
import { ISLAND_RADIUS } from '../game/fishing';
import type { Game } from '../game/game';
import { createCrate, createFish, createFleetBoat, createPier, type FleetBoatModel } from './models';

interface Flyer {
  obj: THREE.Object3D;
  from: THREE.Vector3;
  to: () => THREE.Vector3;
  t: number;
  duration: number;
  height: number;
  keep: number;
}

/** Draws the fishing company: fleet boats with crew, catches, piers and crates. */
export class FleetRenderer {
  private models = new Map<number, FleetBoatModel>();
  private lines = new Map<number, THREE.Line>();
  private piers = new THREE.Group();
  private pierCount = 0;
  private flyers: Flyer[] = [];
  private stayingCrates: { obj: THREE.Object3D; life: number }[] = [];
  private time = 0;

  constructor(
    private scene: THREE.Scene,
    private fleet: Fleet,
    private game: Game,
    private waveHeight: (x: number, z: number) => number,
    private splash: (x: number, z: number, count: number, color: number, size?: number) => void,
  ) {
    scene.add(this.piers);
    fleet.on((e) => {
      const m = this.models.get(e.boat.id);
      if (!m) return;
      if (e.type === 'fleet-catch') this.catchFish(e.boat.x, e.boat.z, e.boat.heading, m);
      if (e.type === 'fleet-unload') this.unloadCrate(m);
      if (e.type === 'fleet-launch') this.splash(e.boat.x, e.boat.z, 12, 0xffffff);
    });
  }

  update(dt: number): void {
    this.time += dt;
    this.syncPiers();
    const alive = new Set<number>();
    for (const b of this.fleet.boats) {
      alive.add(b.id);
      let m = this.models.get(b.id);
      if (!m) {
        m = createFleetBoat(b.tier, boatClassFor(b.tier));
        this.models.set(b.id, m);
        this.scene.add(m.group);
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
          new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }),
        );
        line.frustumCulled = false;
        this.lines.set(b.id, line);
        this.scene.add(line);
      }
      const g = m.group;
      const moving = b.state === 'leaving' || b.state === 'transit' || b.state === 'returning' || b.state === 'arriving';
      g.position.set(b.x, this.waveHeight(b.x, b.z) - 0.25, b.z);
      g.rotation.y = b.heading;
      g.rotation.z = Math.sin(b.phase * 1.6) * 0.06;
      g.rotation.x = Math.sin(b.phase * 1.2) * 0.04 + (moving ? -0.04 : 0);
      // crew bob; during unloading they "hand over" crates
      m.crew.forEach((c, i) => {
        c.rotation.y = b.state === 'unloading' ? Math.sin(this.time * 6 + i) * 0.8 : Math.sin(b.phase * 0.7 + i) * 0.3;
      });
      g.traverse((o) => {
        if (o.userData.spin) o.rotation.y += dt * 1.5;
      });
      if (moving && Math.random() < dt * 10) {
        this.splash(b.x - Math.sin(b.heading) * 1.4, b.z - Math.cos(b.heading) * 1.4, 1, 0xffffff, 0.5);
      }
      const line = this.lines.get(b.id)!;
      line.visible = b.state === 'fishing';
      if (line.visible) {
        const tip = new THREE.Vector3();
        m.rodTip.getWorldPosition(tip);
        const side = b.heading - Math.PI / 2;
        const pos = line.geometry.attributes.position as THREE.BufferAttribute;
        pos.setXYZ(0, tip.x, tip.y, tip.z);
        pos.setXYZ(1, b.x + Math.sin(side) * 2.4 + Math.sin(b.phase * 2) * 0.2, -0.05, b.z + Math.cos(side) * 2.4);
        pos.needsUpdate = true;
      }
    }
    for (const [id, m] of this.models) {
      if (!alive.has(id)) {
        this.scene.remove(m.group);
        const line = this.lines.get(id)!;
        this.scene.remove(line);
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
        this.models.delete(id);
        this.lines.delete(id);
      }
    }
    this.updateFlyers(dt);
  }

  private syncPiers(): void {
    const n = piersFor(this.fleet.tiersOwned);
    if (n === this.pierCount) return;
    this.pierCount = n;
    this.piers.clear();
    // pier 0 is the island's original dock
    for (let i = 1; i < n; i++) {
      const x = PIER_X[i];
      const start = Math.sqrt(Math.max(0, ISLAND_RADIUS * ISLAND_RADIUS - x * x)) - 1.2;
      const pier = createPier(ISLAND_RADIUS + 4.5 - start);
      pier.position.set(x, 0, start);
      this.piers.add(pier);
    }
    // crate stacks on the docks grow with the company
    for (let i = 0; i < n; i++) {
      const stack = Math.min(3, 1 + Math.floor(this.fleet.tiersOwned / 6));
      for (let k = 0; k < stack; k++) {
        const c = createCrate();
        const x = PIER_X[i] + (i === 0 ? -0.6 : 0);
        c.position.set(x, 0.65 + k * 0.45, ISLAND_RADIUS + 0.2 + (k % 2) * 0.1);
        c.rotation.y = k * 0.4;
        this.piers.add(c);
      }
    }
  }

  private catchFish(x: number, z: number, heading: number, m: FleetBoatModel): void {
    const list = [...speciesFor(this.game.state.level, 'common'), ...speciesFor(this.game.state.level, 'rare')];
    const sp = list[Math.floor(Math.random() * list.length)];
    const fish = createFish(sp.color, sp.shape, 'none', 0.45);
    const side = heading - Math.PI / 2;
    const from = new THREE.Vector3(x + Math.sin(side) * 2.4, -0.2, z + Math.cos(side) * 2.4);
    fish.position.copy(from);
    this.scene.add(fish);
    this.splash(from.x, from.z, 6, 0xffffff, 0.7);
    this.flyers.push({ obj: fish, from, to: () => m.hold.getWorldPosition(new THREE.Vector3()), t: 0, duration: 0.7, height: 2, keep: 0 });
  }

  private unloadCrate(m: FleetBoatModel): void {
    const crate = createCrate();
    const from = m.hold.getWorldPosition(new THREE.Vector3());
    const to = new THREE.Vector3(m.group.position.x * 0.7, 0.6, ISLAND_RADIUS + 1.5 + Math.random() * 2);
    crate.position.copy(from);
    this.scene.add(crate);
    this.flyers.push({ obj: crate, from, to: () => to, t: 0, duration: 0.6, height: 1.6, keep: 3 });
  }

  private updateFlyers(dt: number): void {
    for (const f of this.flyers) {
      f.t += dt / f.duration;
      const k = Math.min(1, f.t);
      f.obj.position.lerpVectors(f.from, f.to(), k);
      f.obj.position.y += Math.sin(k * Math.PI) * f.height;
      f.obj.rotation.x = -k * Math.PI * 2;
    }
    for (const f of this.flyers.filter((o) => o.t >= 1)) {
      if (f.keep > 0) {
        f.obj.rotation.set(0, Math.random(), 0);
        this.stayingCrates.push({ obj: f.obj, life: f.keep });
      } else this.scene.remove(f.obj);
    }
    this.flyers = this.flyers.filter((o) => o.t < 1);
    for (const c of this.stayingCrates) {
      c.life -= dt;
      if (c.life < 0.5) c.obj.scale.setScalar(Math.max(0.01, c.life * 2));
    }
    for (const c of this.stayingCrates.filter((o) => o.life <= 0)) this.scene.remove(c.obj);
    this.stayingCrates = this.stayingCrates.filter((o) => o.life > 0);
  }

  reset(): void {
    for (const m of this.models.values()) this.scene.remove(m.group);
    for (const l of this.lines.values()) this.scene.remove(l);
    this.models.clear();
    this.lines.clear();
    this.pierCount = -1;
  }
}
