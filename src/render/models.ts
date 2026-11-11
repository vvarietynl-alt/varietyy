import * as THREE from 'three';
import type { FishShape, LevelTheme } from '../data/fish';

/**
 * Low-poly placeholder models built from primitives. They follow the GDD art
 * direction (flat-shaded low poly, bright colours) and can be swapped for
 * real GLTF models from an artist later without touching game logic.
 */

const matCache = new Map<string, THREE.MeshStandardMaterial>();
export function flat(color: number, opts: { emissive?: number; transparent?: boolean; opacity?: number; metalness?: number; roughness?: number } = {}): THREE.MeshStandardMaterial {
  const key = `${color}-${opts.emissive ?? 0}-${opts.opacity ?? 1}-${opts.metalness ?? 0}-${opts.roughness ?? 0.85}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      flatShading: true,
      roughness: opts.roughness ?? 0.85,
      metalness: opts.metalness ?? 0,
      emissive: opts.emissive ?? 0x000000,
      emissiveIntensity: opts.emissive ? 0.6 : 0,
      transparent: opts.transparent ?? false,
      opacity: opts.opacity ?? 1,
    });
    matCache.set(key, m);
  }
  return m;
}

const geoCache = new Map<string, THREE.BufferGeometry>();
/**
 * Reuse identical geometries. Fish, splashes and crates are created all the
 * time; without this every one of them left a geometry on the GPU (a leak
 * that slowed phones down over a long session).
 */
export function shared<T extends THREE.BufferGeometry>(geo: T): T {
  const params = (geo as unknown as { parameters?: unknown }).parameters;
  const key = geo.type + JSON.stringify(params ?? geo.uuid);
  const hit = geoCache.get(key);
  if (hit) {
    geo.dispose();
    return hit as T;
  }
  geoCache.set(key, geo);
  return geo;
}

function mesh(geo: THREE.BufferGeometry, color: number, opts?: Parameters<typeof flat>[1]): THREE.Mesh {
  return new THREE.Mesh(shared(geo), flat(color, opts));
}

// ---------------------------------------------------------------------------
// Island
// ---------------------------------------------------------------------------

export type BuildingId = 'researchCenter' | 'fishingWorkshop' | 'boatWorkshop' | 'fishermenSchool' | 'aquarium' | 'lighthouse';

export function createIsland(radius: number): { group: THREE.Group; buildings: Map<BuildingId, THREE.Object3D> } {
  const group = new THREE.Group();
  const buildings = new Map<BuildingId, THREE.Object3D>();

  const sand = mesh(new THREE.CylinderGeometry(radius, radius + 2.5, 2.4, 18, 1), 0xf3d99b);
  sand.position.y = -0.7;
  group.add(sand);
  const shelf = mesh(new THREE.CylinderGeometry(radius + 2.5, radius + 6, 2, 18, 1), 0xe8c886);
  shelf.position.y = -2.6;
  group.add(shelf);
  const grass = mesh(new THREE.CylinderGeometry(radius - 2.6, radius - 1.6, 0.8, 16, 1), 0x6fd16a);
  grass.position.y = 0.75;
  group.add(grass);
  const hill = mesh(new THREE.ConeGeometry(4.5, 3.2, 7, 1), 0x58b955);
  hill.position.set(-3, 2.6, -3.5);
  group.add(hill);

  // rocks on the beach
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3;
    const rock = mesh(new THREE.DodecahedronGeometry(0.6 + (i % 3) * 0.3, 0), 0x9aa3ad);
    rock.position.set(Math.sin(a) * (radius - 0.6), 0.2, Math.cos(a) * (radius - 0.6));
    rock.rotation.set(i, i * 2, 0);
    group.add(rock);
  }

  // palms
  const palmSpots: [number, number][] = [[6.5, -6], [-8, 3], [-6.5, 7.5], [8.5, 4], [1, -9.5], [-10, -3]];
  for (const [x, z] of palmSpots) group.add(createPalm(x, z));

  // dock toward the sea (+z side)
  const dock = new THREE.Group();
  const planks = mesh(new THREE.BoxGeometry(2.2, 0.25, 6), 0xb0763f);
  planks.position.set(0, 0.3, radius + 1.5);
  dock.add(planks);
  for (const dx of [-0.9, 0.9]) for (const dz of [radius - 0.5, radius + 1.5, radius + 3.8]) {
    const post = mesh(new THREE.CylinderGeometry(0.15, 0.15, 2, 5), 0x7a4f2a);
    post.position.set(dx, -0.4, dz);
    dock.add(post);
  }
  group.add(dock);

  const place = (id: BuildingId, obj: THREE.Object3D, x: number, z: number, rotY = 0) => {
    obj.position.set(x, 1.15, z);
    obj.rotation.y = rotY;
    obj.userData.building = id;
    obj.traverse((o) => (o.userData.building = id));
    buildings.set(id, obj);
    group.add(obj);
  };
  place('researchCenter', createResearchCenter(), -4.5, 3.5, 0.4);
  place('fishingWorkshop', createShop(0xb5763d, 0xe8503a), 4.5, 6, -0.5);
  place('boatWorkshop', createHut(), 7, -1.5, -1.2);
  place('fishermenSchool', createSchool(), 1.5, -5.5, 0.1);
  place('aquarium', createAquarium(), -6.5, -3.5, 0.9);
  place('lighthouse', createLighthouse(), -2.2, 9.2, 0);

  return { group, buildings };
}

function createPalm(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  let y = 1.1;
  const lean = (x + z) % 2 > 0 ? 0.12 : -0.12;
  for (let i = 0; i < 4; i++) {
    const seg = mesh(new THREE.CylinderGeometry(0.22 - i * 0.03, 0.27 - i * 0.03, 0.9, 5), 0x9a6b3c);
    seg.position.set(lean * i, y + 0.45, 0);
    seg.rotation.z = -lean;
    g.add(seg);
    y += 0.85;
  }
  for (let i = 0; i < 6; i++) {
    const leaf = mesh(new THREE.ConeGeometry(0.55, 2.4, 4, 1), i % 2 ? 0x3faa48 : 0x4cc457);
    const a = (i / 6) * Math.PI * 2;
    leaf.position.set(lean * 4 + Math.sin(a) * 0.9, y + 0.1, Math.cos(a) * 0.9);
    leaf.rotation.set(Math.cos(a) * 1.25, 0, -Math.sin(a) * 1.25);
    leaf.scale.set(1, 1, 0.35);
    g.add(leaf);
  }
  g.position.set(x, 0, z);
  return g;
}

function createResearchCenter(): THREE.Group {
  const g = new THREE.Group();
  const base = mesh(new THREE.BoxGeometry(3.6, 0.4, 3), 0xdfe6ea);
  base.position.y = 0.2;
  g.add(base);
  const glass = mesh(new THREE.BoxGeometry(2.4, 2.8, 2.2), 0x7fd6f2, { transparent: true, opacity: 0.85, roughness: 0.2, metalness: 0.2 });
  glass.position.set(-0.4, 1.8, 0);
  g.add(glass);
  const glass2 = mesh(new THREE.BoxGeometry(1.4, 1.8, 2), 0x5fc3e8, { roughness: 0.2, metalness: 0.2 });
  glass2.position.set(1.2, 1.3, 0.1);
  g.add(glass2);
  const roof = mesh(new THREE.BoxGeometry(2.7, 0.35, 2.5), 0x5cbf5a);
  roof.position.set(-0.4, 3.35, 0);
  g.add(roof);
  const dish = mesh(new THREE.ConeGeometry(0.6, 0.4, 7, 1, true), 0xffffff);
  dish.position.set(-0.4, 3.9, 0);
  dish.rotation.x = Math.PI;
  g.add(dish);
  return g;
}

function createShop(wall: number, awning: number): THREE.Group {
  const g = new THREE.Group();
  const body = mesh(new THREE.BoxGeometry(2.8, 2, 2.2), wall);
  body.position.y = 1;
  g.add(body);
  const roof = mesh(new THREE.BoxGeometry(3.1, 0.3, 2.5), 0x8a5a30);
  roof.position.y = 2.15;
  g.add(roof);
  const aw = mesh(new THREE.BoxGeometry(2.9, 0.12, 0.9), awning);
  aw.position.set(0, 1.55, 1.45);
  aw.rotation.x = 0.35;
  g.add(aw);
  const win = mesh(new THREE.BoxGeometry(1.6, 0.8, 0.05), 0x9fe3ff, { roughness: 0.2 });
  win.position.set(0, 0.9, 1.12);
  g.add(win);
  const sign = mesh(new THREE.BoxGeometry(1.6, 0.5, 0.12), 0xfff2c4);
  sign.position.set(0, 2.6, 0.6);
  g.add(sign);
  const fishSign = mesh(new THREE.ConeGeometry(0.18, 0.7, 4), 0x3b8fd9);
  fishSign.position.set(0, 2.6, 0.7);
  fishSign.rotation.z = Math.PI / 2;
  g.add(fishSign);
  return g;
}

function createHut(): THREE.Group {
  const g = new THREE.Group();
  const body = mesh(new THREE.BoxGeometry(3, 1.8, 2.4), 0xa86a38);
  body.position.y = 0.9;
  g.add(body);
  const roof = mesh(new THREE.ConeGeometry(2.4, 1.4, 4, 1), 0x7a4824);
  roof.position.y = 2.5;
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1.25, 1, 1);
  g.add(roof);
  const door = mesh(new THREE.BoxGeometry(1.4, 1.3, 0.05), 0x5a3418);
  door.position.set(0, 0.65, 1.22);
  g.add(door);
  const hull = mesh(new THREE.BoxGeometry(0.9, 0.5, 2.2), 0xd94b3d);
  hull.position.set(2.1, 0.25, 0.4);
  g.add(hull);
  return g;
}

function createSchool(): THREE.Group {
  const g = new THREE.Group();
  const body = mesh(new THREE.BoxGeometry(3.4, 2.8, 2.2), 0xf4f1e8);
  body.position.y = 1.4;
  g.add(body);
  const roof = mesh(new THREE.BoxGeometry(3.7, 0.35, 2.5), 0x3a7bd5);
  roof.position.y = 2.95;
  g.add(roof);
  for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) {
    const w = mesh(new THREE.BoxGeometry(0.7, 0.6, 0.05), 0x7fd0f5, { roughness: 0.2 });
    w.position.set(-1.05 + col * 1.05, 0.9 + row * 1.15, 1.12);
    g.add(w);
  }
  const entrance = mesh(new THREE.BoxGeometry(1.2, 0.2, 0.9), 0x3a7bd5);
  entrance.position.set(0, 1.25, 1.5);
  g.add(entrance);
  const flagPole = mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 4), 0xdddddd);
  flagPole.position.set(1.4, 3.8, 0);
  g.add(flagPole);
  const flag = mesh(new THREE.BoxGeometry(0.7, 0.4, 0.04), 0xffc928);
  flag.position.set(1.75, 4.35, 0);
  g.add(flag);
  return g;
}

function createAquarium(): THREE.Group {
  const g = new THREE.Group();
  const base = mesh(new THREE.CylinderGeometry(1.9, 2, 0.5, 10), 0xdfe6ea);
  base.position.y = 0.25;
  g.add(base);
  const tank = mesh(new THREE.CylinderGeometry(1.6, 1.6, 2.2, 10), 0x3fb8e8, { transparent: true, opacity: 0.75, roughness: 0.1 });
  tank.position.y = 1.6;
  g.add(tank);
  const dome = mesh(new THREE.SphereGeometry(1.6, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0xbdeeff, { transparent: true, opacity: 0.7, roughness: 0.1 });
  dome.position.y = 2.7;
  g.add(dome);
  const fishInside = mesh(new THREE.ConeGeometry(0.25, 0.8, 4), 0xff8a3d);
  fishInside.position.set(0.4, 1.7, 0.3);
  fishInside.rotation.z = Math.PI / 2;
  g.add(fishInside);
  return g;
}

function createLighthouse(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const seg = mesh(new THREE.CylinderGeometry(0.75 - i * 0.1, 0.85 - i * 0.1, 1.2, 8), i % 2 ? 0xe8463a : 0xffffff);
    seg.position.y = 0.6 + i * 1.2;
    g.add(seg);
  }
  const top = mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.7, 8), 0xfff4b0, { emissive: 0xffe066 });
  top.position.y = 5.15;
  g.add(top);
  const cap = mesh(new THREE.ConeGeometry(0.75, 0.7, 8), 0xe8463a);
  cap.position.y = 5.85;
  g.add(cap);
  return g;
}

// ---------------------------------------------------------------------------
// Boat
// ---------------------------------------------------------------------------

export interface BoatModel {
  group: THREE.Group;
  rodTip: THREE.Object3D;
  radar: THREE.Object3D;
}

export function createBoat(skin: { hull: number; trim: number; roof: number; glow?: number } = { hull: 0xd8392f, trim: 0xfaf6ee, roof: 0xd8392f }, engineTier = 0): BoatModel {
  const group = new THREE.Group();
  const glow = skin.glow ? { emissive: skin.glow } : undefined;
  const hullShape = new THREE.Shape();
  // top view outline, bow at +y (becomes +z after rotation)
  hullShape.moveTo(0, 2.1);
  hullShape.quadraticCurveTo(1.05, 1.1, 0.95, -0.6);
  hullShape.lineTo(0.85, -1.5);
  hullShape.lineTo(-0.85, -1.5);
  hullShape.lineTo(-0.95, -0.6);
  hullShape.quadraticCurveTo(-1.05, 1.1, 0, 2.1);
  const lower = new THREE.ExtrudeGeometry(hullShape, { depth: 0.55, bevelEnabled: false, curveSegments: 3 });
  const upper = new THREE.ExtrudeGeometry(hullShape, { depth: 0.35, bevelEnabled: false, curveSegments: 3 });
  const hullLow = mesh(lower, skin.hull, glow);
  hullLow.rotation.x = Math.PI / 2;
  hullLow.position.y = 0.15;
  hullLow.scale.set(0.92, 0.95, 1);
  group.add(hullLow);
  const hullUp = mesh(upper, skin.trim, glow);
  hullUp.rotation.x = Math.PI / 2;
  hullUp.position.y = 0.5;
  group.add(hullUp);
  const deck = mesh(new THREE.BoxGeometry(1.5, 0.05, 2.6), 0xc58b52);
  deck.position.set(0, 0.52, -0.1);
  group.add(deck);
  const cabin = mesh(new THREE.BoxGeometry(1.2, 0.9, 1.1), skin.trim);
  cabin.position.set(0, 0.98, -0.55);
  group.add(cabin);
  const roof = mesh(new THREE.BoxGeometry(1.4, 0.15, 1.3), skin.roof, glow);
  roof.position.set(0, 1.5, -0.55);
  group.add(roof);
  const window = mesh(new THREE.BoxGeometry(0.9, 0.35, 0.05), 0x3b5f7a);
  window.position.set(0, 1.08, 0.01);
  group.add(window);
  const mast = mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.2, 5), 0xe8e2d6);
  mast.position.set(0, 2.5, -0.55);
  group.add(mast);
  const flag = mesh(new THREE.BoxGeometry(0.04, 0.35, 0.55), skin.roof);
  flag.position.set(0, 3.4, -0.85);
  group.add(flag);

  const radar = new THREE.Group();
  const dish = mesh(new THREE.BoxGeometry(0.6, 0.12, 0.08), 0xdddddd);
  dish.position.y = 0.08;
  radar.add(dish);
  radar.position.set(0, 1.62, -0.55);
  group.add(radar);

  // fishing rod on the starboard side
  const rod = new THREE.Group();
  const pole = mesh(new THREE.CylinderGeometry(0.03, 0.05, 2.6, 4), 0x5a3a1e);
  pole.position.y = 1.3;
  rod.add(pole);
  const rodTip = new THREE.Object3D();
  rodTip.position.y = 2.6;
  rod.add(rodTip);
  rod.position.set(0.55, 0.6, 0.6);
  rod.rotation.set(0.2, 0, -0.85);
  group.add(rod);

  // net bundle and harpoon on deck (GDD ship parts)
  const net = mesh(new THREE.DodecahedronGeometry(0.28, 0), 0x6b8f71);
  net.position.set(-0.45, 0.7, 0.55);
  group.add(net);
  const harpoon = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 4), 0x555b66);
  harpoon.position.set(0, 0.8, 1.2);
  harpoon.rotation.x = Math.PI / 2.4;
  group.add(harpoon);

  // engine upgrades: outboard motor → twin motors → turbo
  const motorXs = engineTier >= 2 ? [-0.42, 0.42] : engineTier >= 1 ? [0] : [];
  for (const x of motorXs) {
    const motor = new THREE.Group();
    const head = mesh(new THREE.BoxGeometry(0.42, 0.5, 0.45), engineTier >= 3 ? 0x2b2b33 : 0x3a3f4a);
    head.position.y = 0.75;
    motor.add(head);
    const cap = mesh(new THREE.BoxGeometry(0.44, 0.12, 0.47), skin.roof);
    cap.position.y = 1.05;
    motor.add(cap);
    const shaft = mesh(new THREE.BoxGeometry(0.12, 0.6, 0.12), 0x555b66);
    shaft.position.y = 0.3;
    motor.add(shaft);
    const prop = mesh(new THREE.BoxGeometry(0.5, 0.08, 0.06), 0xc0c4cc);
    prop.position.set(0, 0.05, -0.08);
    prop.userData.prop = true;
    motor.add(prop);
    if (engineTier >= 3) {
      const flame = mesh(new THREE.ConeGeometry(0.13, 0.5, 6), 0xff9a1a, { emissive: 0xff6a00 });
      flame.rotation.x = -Math.PI / 2;
      flame.position.set(0, 0.85, -0.45);
      flame.userData.flame = true;
      motor.add(flame);
    }
    motor.position.set(x, 0.1, -1.68);
    group.add(motor);
  }
  if (engineTier >= 3) {
    const spoiler = mesh(new THREE.BoxGeometry(1.5, 0.06, 0.35), skin.roof, glow);
    spoiler.position.set(0, 1.72, -1.05);
    group.add(spoiler);
  }

  return { group, rodTip, radar };
}

// ---------------------------------------------------------------------------
// Fish
// ---------------------------------------------------------------------------

const DECOR_COLORS: Record<LevelTheme['decor'], number> = {
  none: 0xffffff, glow: 0x9dfff0, wings: 0xffd1f5, bones: 0xfdfbf2, spikes: 0xffb84d,
  ice: 0xdff8ff, horns: 0x3a1f1a, crystal: 0xe6dcff, robot: 0x8c9aa8, stars: 0xfff3a8,
};

export function createFish(color: number, shape: FishShape, decor: LevelTheme['decor'], size = 1): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const emissive = decor === 'glow' || decor === 'stars' ? color : undefined;
  const bodyMat = { emissive };
  const finColor = shade(color, 0.75);

  const addTail = (z: number, w: number, h: number) => {
    const tail = mesh(new THREE.ConeGeometry(h, w, 4, 1), finColor);
    tail.rotation.x = -Math.PI / 2;
    tail.rotation.y = Math.PI / 4;
    tail.scale.set(0.25, 1, 1);
    tail.position.z = z;
    tail.userData.tail = true;
    body.add(tail);
  };

  switch (shape) {
    case 'eel':
    case 'serpent': {
      const segs = shape === 'serpent' ? 7 : 6;
      for (let i = 0; i < segs; i++) {
        const s = mesh(new THREE.IcosahedronGeometry(0.42 * (1 - i * 0.07), 0), color, bodyMat);
        s.position.z = -i * 0.62;
        s.scale.set(0.8, 0.8, 1.2);
        s.userData.segment = i;
        body.add(s);
      }
      if (shape === 'serpent') {
        const head = mesh(new THREE.ConeGeometry(0.4, 0.9, 5), shade(color, 1.1), bodyMat);
        head.rotation.x = Math.PI / 2;
        head.position.z = 0.6;
        body.add(head);
      }
      addTail(-segs * 0.62, 0.7, 0.4);
      break;
    }
    case 'squid': {
      const mantle = mesh(new THREE.ConeGeometry(0.55, 2, 6, 1), color, bodyMat);
      mantle.rotation.x = -Math.PI / 2;
      mantle.position.z = -0.4;
      body.add(mantle);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const t = mesh(new THREE.CylinderGeometry(0.06, 0.02, 1.2, 3), finColor);
        t.rotation.x = Math.PI / 2;
        t.position.set(Math.sin(a) * 0.25, Math.cos(a) * 0.15, 1.1);
        body.add(t);
      }
      break;
    }
    case 'whale': {
      const b = mesh(new THREE.SphereGeometry(1, 8, 5), color, bodyMat);
      b.scale.set(0.9, 0.7, 2.2);
      body.add(b);
      const belly = mesh(new THREE.SphereGeometry(0.95, 8, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), shade(color, 1.45));
      belly.scale.set(0.85, 0.5, 2);
      belly.position.y = -0.1;
      body.add(belly);
      const fluke = mesh(new THREE.BoxGeometry(1.8, 0.1, 0.6), finColor);
      fluke.position.z = -2.4;
      fluke.userData.tail = true;
      body.add(fluke);
      for (const s of [-1, 1]) {
        const fin = mesh(new THREE.BoxGeometry(0.9, 0.08, 0.4), finColor);
        fin.position.set(s * 0.9, -0.3, 0.3);
        fin.rotation.y = s * 0.5;
        body.add(fin);
      }
      break;
    }
    default: {
      const dims: Record<string, [number, number, number]> = {
        slim: [0.42, 0.5, 1.2],
        round: [0.5, 0.68, 1],
        flat: [0.75, 0.3, 0.95],
        shark: [0.45, 0.5, 1.45],
      };
      const [sx, sy, sz] = dims[shape] ?? dims.round;
      const b = mesh(new THREE.SphereGeometry(1, 7, 5), color, bodyMat);
      b.scale.set(sx, sy, sz);
      body.add(b);
      const dorsal = mesh(new THREE.ConeGeometry(shape === 'shark' ? 0.35 : 0.22, shape === 'shark' ? 0.8 : 0.45, 3), finColor);
      dorsal.position.set(0, sy + (shape === 'shark' ? 0.25 : 0.1), -0.1);
      dorsal.scale.set(0.3, 1, 1);
      body.add(dorsal);
      addTail(-sz - 0.25, 0.6, shape === 'flat' ? 0.5 : 0.4);
      const eye = mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), 0x1a1a1a);
      for (const s of [-1, 1]) {
        const e = eye.clone();
        e.position.set(s * sx * 0.75, sy * 0.25, sz * 0.6);
        body.add(e);
      }
    }
  }

  addDecor(body, decor, shape, color);
  g.scale.setScalar(size);
  return g;
}

function addDecor(body: THREE.Group, decor: LevelTheme['decor'], shape: FishShape, color: number): void {
  const c = DECOR_COLORS[decor];
  const big = shape === 'whale' ? 2 : 1;
  switch (decor) {
    case 'wings':
      for (const s of [-1, 1]) {
        const w = mesh(new THREE.BoxGeometry(0.9 * big, 0.04, 0.5 * big), c, { transparent: true, opacity: 0.85 });
        w.position.set(s * 0.6 * big, 0.3 * big, 0.1);
        w.rotation.z = s * 0.5;
        w.userData.wing = s;
        body.add(w);
      }
      break;
    case 'bones': {
      const skull = mesh(new THREE.IcosahedronGeometry(0.4 * big, 0), c);
      skull.position.set(0, 0.1 * big, 0.65 * big);
      skull.scale.set(1.1, 1, 0.9);
      body.add(skull);
      for (let i = 0; i < 3; i++) {
        const rib = mesh(new THREE.TorusGeometry(0.42 * big, 0.04, 3, 6, Math.PI), c);
        rib.position.set(0, 0.05, (-0.1 - i * 0.3) * big);
        body.add(rib);
      }
      break;
    }
    case 'spikes':
    case 'horns':
      for (let i = 0; i < 3; i++) {
        const sp = mesh(new THREE.ConeGeometry(0.1 * big, 0.45 * big, 4), c);
        sp.position.set(decor === 'horns' ? (i - 1) * 0.25 * big : 0, 0.55 * big, (0.5 - i * 0.35) * big);
        body.add(sp);
      }
      break;
    case 'ice':
    case 'crystal':
      for (let i = 0; i < 3; i++) {
        const cr = mesh(new THREE.OctahedronGeometry(0.18 * big, 0), c, { transparent: true, opacity: 0.85, roughness: 0.2 });
        cr.position.set((i - 1) * 0.2, 0.5 * big, (0.3 - i * 0.3) * big);
        cr.scale.set(0.7, 1.6, 0.7);
        body.add(cr);
      }
      break;
    case 'robot': {
      const plate = mesh(new THREE.BoxGeometry(0.7 * big, 0.12, 0.9 * big), c, { metalness: 0.6, roughness: 0.4 });
      plate.position.y = 0.5 * big;
      body.add(plate);
      const antenna = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 3), 0xff4d4d, { emissive: 0xff4d4d });
      antenna.position.set(0, 0.8 * big, 0.3);
      body.add(antenna);
      break;
    }
    case 'glow':
    case 'stars':
      for (let i = 0; i < 4; i++) {
        const dot = mesh(new THREE.OctahedronGeometry(0.07 * big, 0), c, { emissive: c });
        dot.position.set((i % 2 ? 0.3 : -0.3) * big, 0.25 * big, (0.4 - i * 0.3) * big);
        body.add(dot);
      }
      break;
    default:
      void color;
  }
}

export function shade(color: number, f: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((color >> 8) & 255) * f));
  const b = Math.min(255, Math.round((color & 255) * f));
  return (r << 16) | (g << 8) | b;
}

// ---------------------------------------------------------------------------
// Small props
// ---------------------------------------------------------------------------

export function createBuoy(color: number): THREE.Group {
  const g = new THREE.Group();
  const b = mesh(new THREE.CylinderGeometry(0.35, 0.5, 0.9, 6), color);
  b.position.y = 0.2;
  g.add(b);
  const top = mesh(new THREE.ConeGeometry(0.25, 0.6, 6), 0xffffff);
  top.position.y = 0.95;
  g.add(top);
  return g;
}

export function createRock(size: number, color = 0x8c96a3): THREE.Mesh {
  const r = mesh(new THREE.DodecahedronGeometry(size, 0), color);
  r.scale.y = 1.4;
  return r;
}

// ---------------------------------------------------------------------------
// Fishing company: fleet boats, crew and harbour
// ---------------------------------------------------------------------------

const TIER_COLORS = [
  0x3a7bd5, 0xe8a33a, 0x4cae4f, 0xd84b6a, 0x2fb5a8, 0x8a5cd6, 0xf0c93a, 0x3c5a99,
  0xe0663a, 0x5fb3e8, 0xb84ad9, 0x47a36b, 0xd9603e, 0x2e6fb5, 0x7d4fc9, 0xc23b3b,
  0x2a9d8f, 0x1d3557, 0x222222, 0xff7aa2, 0x8b5a2b, 0x4f6d7a, 0xffd23f, 0x3b1f6b, 0x6a2ea0,
];

/** Little low-poly fisherman: body, head, hat. */
export function createCrew(shirt: number, hat: number): THREE.Group {
  const g = new THREE.Group();
  const body = mesh(new THREE.CylinderGeometry(0.17, 0.22, 0.5, 6), shirt);
  body.position.y = 0.25;
  g.add(body);
  const head = mesh(new THREE.IcosahedronGeometry(0.16, 0), 0xf1c27d);
  head.position.y = 0.62;
  g.add(head);
  const brim = mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.04, 8), hat);
  brim.position.y = 0.74;
  g.add(brim);
  const top = mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.14, 8), hat);
  top.position.y = 0.82;
  g.add(top);
  return g;
}

export interface FleetBoatModel {
  group: THREE.Group;
  rodTip: THREE.Object3D;
  /** where caught fish land */
  hold: THREE.Object3D;
  crew: THREE.Group[];
}

export function createFleetBoat(tier: number, cls: 'rowboat' | 'fishingBoat' | 'trawler' | 'galleon' | 'mystic'): FleetBoatModel {
  const group = new THREE.Group();
  const color = TIER_COLORS[tier % TIER_COLORS.length];
  const crew: THREE.Group[] = [];
  const rodTip = new THREE.Object3D();
  const hold = new THREE.Object3D();
  const addRod = (x: number, y: number, z: number, len: number) => {
    const rod = new THREE.Group();
    const pole = mesh(new THREE.CylinderGeometry(0.025, 0.04, len, 4), 0x5a3a1e);
    pole.position.y = len / 2;
    rod.add(pole);
    rodTip.position.y = len;
    rod.add(rodTip);
    rod.position.set(x, y, z);
    rod.rotation.set(0.15, 0, -0.9);
    group.add(rod);
  };
  const hullFrom = (len: number, width: number, height: number, hullColor: number, trim: number) => {
    const shape = new THREE.Shape();
    shape.moveTo(0, len * 0.55);
    shape.quadraticCurveTo(width * 0.55, len * 0.25, width * 0.5, -len * 0.2);
    shape.lineTo(width * 0.42, -len * 0.45);
    shape.lineTo(-width * 0.42, -len * 0.45);
    shape.lineTo(-width * 0.5, -len * 0.2);
    shape.quadraticCurveTo(-width * 0.55, len * 0.25, 0, len * 0.55);
    const low = new THREE.Mesh(shared(new THREE.ExtrudeGeometry(shape, { depth: height * 0.65, bevelEnabled: false, curveSegments: 3 })), flat(hullColor));
    low.rotation.x = Math.PI / 2;
    low.position.y = height * 0.3;
    group.add(low);
    const up = new THREE.Mesh(shared(new THREE.ExtrudeGeometry(shape, { depth: height * 0.35, bevelEnabled: false, curveSegments: 3 })), flat(trim));
    up.rotation.x = Math.PI / 2;
    up.position.y = height * 0.65;
    group.add(up);
    const deck = mesh(new THREE.BoxGeometry(width * 0.75, 0.05, len * 0.75), 0xc58b52);
    deck.position.set(0, height * 0.66, -len * 0.05);
    group.add(deck);
    return height * 0.68;
  };

  switch (cls) {
    case 'rowboat': {
      const deckY = hullFrom(2.2, 1.1, 0.5, 0x9a6b3c, color);
      const c = createCrew(color, 0xf0d060);
      c.position.set(0, deckY, -0.2);
      crew.push(c);
      addRod(0.3, deckY + 0.3, 0.1, 1.8);
      hold.position.set(0, deckY + 0.1, 0.5);
      for (const s of [-1, 1]) {
        const oar = mesh(new THREE.BoxGeometry(1.2, 0.04, 0.12), 0x8a5a30);
        oar.position.set(s * 0.75, deckY, -0.2);
        oar.rotation.z = s * -0.3;
        group.add(oar);
      }
      break;
    }
    case 'fishingBoat': {
      const deckY = hullFrom(2.8, 1.4, 0.7, color, 0xfaf6ee);
      const cabin = mesh(new THREE.BoxGeometry(0.9, 0.7, 0.8), 0xfaf6ee);
      cabin.position.set(0, deckY + 0.35, -0.5);
      group.add(cabin);
      const roof = mesh(new THREE.BoxGeometry(1.05, 0.1, 0.95), color);
      roof.position.set(0, deckY + 0.75, -0.5);
      group.add(roof);
      for (const x of [-0.3, 0.35]) {
        const c = createCrew(x < 0 ? 0xf2c14e : 0x3a7bd5, 0xe8463a);
        c.position.set(x, deckY, 0.45);
        crew.push(c);
      }
      addRod(0.45, deckY + 0.3, 0.6, 2.2);
      hold.position.set(0, deckY + 0.1, 0.8);
      break;
    }
    case 'trawler': {
      const deckY = hullFrom(3.8, 1.7, 0.9, color, 0xf2efe6);
      const cabin = mesh(new THREE.BoxGeometry(1.2, 1.1, 1.1), 0xf2efe6);
      cabin.position.set(0, deckY + 0.55, 0.6);
      group.add(cabin);
      const bridge = mesh(new THREE.BoxGeometry(1.0, 0.45, 0.8), 0xf2efe6);
      bridge.position.set(0, deckY + 1.3, 0.6);
      group.add(bridge);
      const win = mesh(new THREE.BoxGeometry(0.8, 0.2, 0.05), 0x3b5f7a);
      win.position.set(0, deckY + 1.35, 1.01);
      group.add(win);
      const boom = mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 4), 0x555b66);
      boom.position.set(0, deckY + 1.4, -1.0);
      boom.rotation.x = 0.5;
      group.add(boom);
      const net = mesh(new THREE.DodecahedronGeometry(0.4, 0), 0x6b8f71);
      net.position.set(0, deckY + 0.3, -1.3);
      group.add(net);
      for (const [x, z] of [[-0.5, -0.4], [0.5, -0.6], [0, -1.6]]) {
        const c = createCrew(0xff8c1a, 0xffd23f);
        c.position.set(x, deckY, z);
        crew.push(c);
      }
      addRod(0.7, deckY + 0.2, -0.4, 2.4);
      hold.position.set(0, deckY + 0.2, -1.2);
      break;
    }
    case 'galleon': {
      const pirate = tier === 18;
      const deckY = hullFrom(4.6, 1.9, 1.1, pirate ? 0x2a2a2a : 0x7a4a24, pirate ? 0x8b1e1e : color);
      for (const z of [0.9, -0.9]) {
        const mast = mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.2, 5), 0x6b4423);
        mast.position.set(0, deckY + 1.6, z);
        group.add(mast);
        const sail = mesh(new THREE.BoxGeometry(1.6, 1.4, 0.05), pirate ? 0x1a1a1a : 0xfaf3e0);
        sail.position.set(0, deckY + 1.9, z + 0.1);
        group.add(sail);
      }
      const flagM = mesh(new THREE.BoxGeometry(0.04, 0.3, 0.5), pirate ? 0x111111 : color);
      flagM.position.set(0, deckY + 3.3, 0.7);
      group.add(flagM);
      const stern = mesh(new THREE.BoxGeometry(1.5, 0.6, 0.9), 0x8a5a30);
      stern.position.set(0, deckY + 0.3, -1.7);
      group.add(stern);
      for (const [x, z] of [[-0.5, 0.2], [0.5, -0.3], [0, 1.6], [0, -1.7]]) {
        const c = createCrew(pirate ? 0xe8e8e8 : 0x3a7bd5, pirate ? 0x111111 : 0x2a2a2a);
        c.position.set(x, z === -1.7 ? deckY + 0.6 : deckY, z);
        crew.push(c);
      }
      addRod(0.8, deckY + 0.2, 1.2, 2.6);
      hold.position.set(0, deckY + 0.2, 0);
      break;
    }
    case 'mystic': {
      const deckY = hullFrom(4.2, 1.8, 1.0, 0x2b1f4a, color);
      const glow = flat(0x9dfff0, { emissive: 0x6fffe0 });
      const orb = new THREE.Mesh(shared(new THREE.IcosahedronGeometry(0.45, 0)), glow);
      orb.position.set(0, deckY + 2.2, 0);
      orb.userData.spin = true;
      group.add(orb);
      const mast = mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.8, 5), 0xd9c8ff);
      mast.position.set(0, deckY + 0.9, 0);
      group.add(mast);
      const sail = mesh(new THREE.ConeGeometry(0.9, 1.6, 3), color, { transparent: true, opacity: 0.85, emissive: color });
      sail.position.set(0, deckY + 1.2, -0.6);
      sail.rotation.y = Math.PI / 6;
      group.add(sail);
      for (let i = 0; i < 4; i++) {
        const cr = mesh(new THREE.OctahedronGeometry(0.15, 0), 0xfff3a8, { emissive: 0xffe066 });
        cr.position.set(i % 2 ? 0.8 : -0.8, deckY + 0.3, 1.2 - i * 0.8);
        group.add(cr);
      }
      for (const [x, z] of [[-0.45, 0.9], [0.45, 0.9], [0, -1.4]]) {
        const c = createCrew(0x6a2ea0, 0xffd23f);
        c.position.set(x, deckY, z);
        crew.push(c);
      }
      addRod(0.7, deckY + 0.2, 1.4, 2.6);
      hold.position.set(0, deckY + 0.2, 0.2);
      break;
    }
  }
  for (const c of crew) group.add(c);
  group.add(hold);
  return { group, rodTip, hold, crew };
}

/** Extra piers and crate stacks; shown as the company grows. */
export function createPier(length: number): THREE.Group {
  const g = new THREE.Group();
  const planks = mesh(new THREE.BoxGeometry(1.6, 0.22, length), 0xb0763f);
  planks.position.set(0, 0.3, length / 2);
  g.add(planks);
  for (let i = 0; i <= 2; i++) for (const dx of [-0.65, 0.65]) {
    const post = mesh(new THREE.CylinderGeometry(0.13, 0.13, 2, 5), 0x7a4f2a);
    post.position.set(dx, -0.4, (i / 2) * length);
    g.add(post);
  }
  return g;
}

export function createCrate(): THREE.Mesh {
  const c = mesh(new THREE.BoxGeometry(0.6, 0.45, 0.6), 0xc8924f);
  return c;
}

export function createTreasureChest(): THREE.Group {
  const g = new THREE.Group();
  const base = mesh(new THREE.BoxGeometry(1.2, 0.6, 0.8), 0x9a5b2a);
  base.position.y = 0.3;
  g.add(base);
  const lid = mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.2, 6, 1, false, 0, Math.PI), 0xb06a32);
  lid.rotation.z = Math.PI / 2;
  lid.position.y = 0.6;
  g.add(lid);
  for (const x of [-0.45, 0.45]) {
    const band = mesh(new THREE.BoxGeometry(0.1, 0.65, 0.84), 0xffc928, { metalness: 0.5, roughness: 0.4 });
    band.position.set(x, 0.32, 0);
    g.add(band);
  }
  const lock = mesh(new THREE.BoxGeometry(0.2, 0.22, 0.06), 0xffe066, { emissive: 0xffb000 });
  lock.position.set(0, 0.55, 0.42);
  g.add(lock);
  return g;
}

export function createBottle(): THREE.Group {
  const g = new THREE.Group();
  const glass = mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.9, 7), 0x8fe3c8, { transparent: true, opacity: 0.7, roughness: 0.1 });
  glass.rotation.z = Math.PI / 2;
  glass.position.y = 0.25;
  g.add(glass);
  const neck = mesh(new THREE.CylinderGeometry(0.1, 0.22, 0.35, 7), 0x8fe3c8, { transparent: true, opacity: 0.7, roughness: 0.1 });
  neck.rotation.z = -Math.PI / 2;
  neck.position.set(0.6, 0.25, 0);
  g.add(neck);
  const cork = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.16, 6), 0xb5835a);
  cork.rotation.z = Math.PI / 2;
  cork.position.set(0.84, 0.25, 0);
  g.add(cork);
  const paper = mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.6, 6), 0xfff1c9);
  paper.rotation.z = Math.PI / 2;
  paper.position.y = 0.25;
  g.add(paper);
  return g;
}

/** Island decorations bought in the ruby shop. */
export function createDecor(id: 'flowers' | 'lanterns' | 'fountain' | 'statue' | 'flags'): THREE.Group {
  const g = new THREE.Group();
  switch (id) {
    case 'flowers': {
      const colors = [0xff5a8a, 0xffd23f, 0xff8a3d, 0xc77dff, 0xffffff];
      for (let i = 0; i < 14; i++) {
        const a = i * 2.4;
        const r = 0.6 + (i % 4) * 0.45;
        const stem = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.35, 3), 0x3f9e3f);
        stem.position.set(Math.sin(a) * r, 0.17, Math.cos(a) * r);
        g.add(stem);
        const bloom = mesh(new THREE.IcosahedronGeometry(0.15, 0), colors[i % colors.length]);
        bloom.position.set(Math.sin(a) * r, 0.4, Math.cos(a) * r);
        g.add(bloom);
      }
      break;
    }
    case 'lanterns':
      for (let i = 0; i < 4; i++) {
        const post = mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.6, 5), 0x4a3a2a);
        post.position.set((i - 1.5) * 1.6, 0.8, 0);
        g.add(post);
        const lamp = mesh(new THREE.OctahedronGeometry(0.22, 0), 0xffb347, { emissive: 0xff9a1a });
        lamp.position.set((i - 1.5) * 1.6, 1.7, 0);
        lamp.userData.spin = true;
        g.add(lamp);
      }
      break;
    case 'fountain': {
      const basin = mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.4, 10), 0xdfe6ea);
      basin.position.y = 0.2;
      g.add(basin);
      const water = mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.1, 10), 0x5fc3e8, { emissive: 0x2a8fd0 });
      water.position.y = 0.38;
      g.add(water);
      const column = mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.9, 6), 0xdfe6ea);
      column.position.y = 0.8;
      g.add(column);
      const top = mesh(new THREE.ConeGeometry(0.35, 0.5, 8), 0x9fe3ff, { transparent: true, opacity: 0.8 });
      top.position.y = 1.4;
      top.rotation.x = Math.PI;
      g.add(top);
      break;
    }
    case 'statue': {
      const plinth = mesh(new THREE.BoxGeometry(1.4, 0.6, 1.4), 0xdfe6ea);
      plinth.position.y = 0.3;
      g.add(plinth);
      const gold = flat(0xffc928, { metalness: 0.7, roughness: 0.3, emissive: 0x7a5200 });
      const body = new THREE.Mesh(shared(new THREE.SphereGeometry(0.7, 8, 5)), gold);
      body.scale.set(0.7, 0.55, 1.4);
      body.position.y = 1.15;
      body.rotation.x = -0.4;
      g.add(body);
      const tail = new THREE.Mesh(shared(new THREE.BoxGeometry(1.1, 0.08, 0.4)), gold);
      tail.position.set(0, 1.9, -0.75);
      tail.rotation.x = -0.9;
      g.add(tail);
      break;
    }
    case 'flags':
      for (let i = 0; i < 3; i++) {
        const pole = mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 5), 0xdddddd);
        pole.position.set((i - 1) * 1.3, 1.2, 0);
        g.add(pole);
        const flag = mesh(new THREE.BoxGeometry(0.8, 0.5, 0.04), [0x2e8ee0, 0xffc928, 0xe8463a][i]);
        flag.position.set((i - 1) * 1.3 + 0.42, 2.15, 0);
        flag.userData.wave = i;
        g.add(flag);
      }
      break;
  }
  return g;
}
