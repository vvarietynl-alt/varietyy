import { LEVEL_COUNT, type Rarity } from './balance';

/**
 * Fish species. Per level (GDD): 10 common, 7 rare, 5 endangered,
 * 5 legendary, 2 mythical (the bosses) and 1 goldfish = 30 species,
 * 300 in total over 10 levels.
 *
 * Level 1 has natural fish; later levels "evolve" the same base fish into a
 * themed variant (GDD art: ordinary → magical → fairy-tale → bony → giant …).
 */

export interface LevelTheme {
  name: string;
  prefix: string;
  /** Shallow / deep water colours and fog. */
  shallow: number;
  deep: number;
  sky: number;
  /** Tint mixed into fish colours. */
  fishTint: number;
  /** Extra decoration drawn on fish meshes. */
  decor: 'none' | 'glow' | 'wings' | 'bones' | 'spikes' | 'ice' | 'horns' | 'crystal' | 'robot' | 'stars';
  bosses: [string, string];
}

export const LEVEL_THEMES: LevelTheme[] = [
  { name: 'Sunny Shallows', prefix: '', shallow: 0x3fd6e8, deep: 0x1676c9, sky: 0x9fe3ff, fishTint: 0xffffff, decor: 'none', bosses: ['Greyback Whale', 'Storm Leviathan'] },
  { name: 'Glowing Lagoon', prefix: 'Glow', shallow: 0x37e0c4, deep: 0x125f9e, sky: 0x8fd8f0, fishTint: 0x9dfff0, decor: 'glow', bosses: ['Lumen Whale', 'Aurora Serpent'] },
  { name: 'Fairy Reef', prefix: 'Fairy', shallow: 0x6fd8f5, deep: 0x3b62c4, sky: 0xc9d8ff, fishTint: 0xffb3ec, decor: 'wings', bosses: ['Winged Narwhal', 'Sky Kraken'] },
  { name: 'Bone Sea', prefix: 'Bony', shallow: 0x5bc2c9, deep: 0x245c7a, sky: 0xb5d3d6, fishTint: 0xf2efe4, decor: 'bones', bosses: ['Bone Whale', 'Skull Serpent'] },
  { name: 'Giant Deep', prefix: 'Giant', shallow: 0x2fb6c8, deep: 0x0c4f86, sky: 0x86c6e0, fishTint: 0xffd29a, decor: 'spikes', bosses: ['Titan Whale', 'Colossal Kraken'] },
  { name: 'Frozen Sea', prefix: 'Frost', shallow: 0x9fe8f5, deep: 0x3d86c4, sky: 0xe3f6ff, fishTint: 0xcff4ff, decor: 'ice', bosses: ['Frost Whale', 'Glacier Wyrm'] },
  { name: 'Ember Sea', prefix: 'Ember', shallow: 0xf0a35e, deep: 0x8a2f3e, sky: 0xffc9a0, fishTint: 0xff8a5c, decor: 'horns', bosses: ['Magma Whale', 'Inferno Hydra'] },
  { name: 'Crystal Sea', prefix: 'Crystal', shallow: 0xb8a5ff, deep: 0x4b3aa8, sky: 0xe0d6ff, fishTint: 0xd7c7ff, decor: 'crystal', bosses: ['Crystal Whale', 'Prism Leviathan'] },
  { name: 'Mecha Sea', prefix: 'Robo', shallow: 0x7fc4c9, deep: 0x2d4f63, sky: 0xc4d6da, fishTint: 0xc0ccd6, decor: 'robot', bosses: ['Mecha Whale', 'Steel Kraken'] },
  { name: 'Cosmic Abyss', prefix: 'Void', shallow: 0x5a57c9, deep: 0x15134a, sky: 0x7b6fd6, fishTint: 0xb38cff, decor: 'stars', bosses: ['Void Whale', 'Cosmic Leviathan'] },
];

/** Base species of level 1, by rarity. */
const BASE_SPECIES: Record<Exclude<Rarity, 'mythical' | 'goldfish'>, { name: string; color: number; shape: FishShape }[]> = {
  common: [
    { name: 'Sardine', color: 0x8fb4d9, shape: 'slim' },
    { name: 'Herring', color: 0x9db7c9, shape: 'slim' },
    { name: 'Anchovy', color: 0xa7c0cf, shape: 'slim' },
    { name: 'Mackerel', color: 0x4f8fb0, shape: 'slim' },
    { name: 'Sprat', color: 0xb9cbd6, shape: 'slim' },
    { name: 'Cod', color: 0xb9a37a, shape: 'round' },
    { name: 'Haddock', color: 0x9a9a8a, shape: 'round' },
    { name: 'Mullet', color: 0xa3a9b5, shape: 'round' },
    { name: 'Sea Bass', color: 0x8c9ba8, shape: 'round' },
    { name: 'Pollock', color: 0x7e8f7a, shape: 'round' },
  ],
  rare: [
    { name: 'Salmon', color: 0xf08a6a, shape: 'slim' },
    { name: 'Red Snapper', color: 0xe0503f, shape: 'round' },
    { name: 'Grouper', color: 0x9c6b4a, shape: 'round' },
    { name: 'Mahi-Mahi', color: 0x5fcf6a, shape: 'slim' },
    { name: 'Halibut', color: 0xa38b6d, shape: 'flat' },
    { name: 'Yellowfin Tuna', color: 0x3d5f9e, shape: 'round' },
    { name: 'Parrotfish', color: 0x3fd1b5, shape: 'round' },
  ],
  endangered: [
    { name: 'Bluefin Tuna', color: 0x274c8f, shape: 'round' },
    { name: 'Sturgeon', color: 0x6b6b5e, shape: 'slim' },
    { name: 'Hammerhead', color: 0x7d8a96, shape: 'shark' },
    { name: 'Sawfish', color: 0xb0a07c, shape: 'shark' },
    { name: 'Humphead Wrasse', color: 0x2fa39a, shape: 'round' },
  ],
  legendary: [
    { name: 'Coelacanth', color: 0x3b4f8a, shape: 'round' },
    { name: 'Oarfish', color: 0xd9dde6, shape: 'eel' },
    { name: 'Giant Squid', color: 0xd9614c, shape: 'squid' },
    { name: 'Ocean Sunfish', color: 0xb4bfc9, shape: 'flat' },
    { name: 'Megamouth Shark', color: 0x5c5f6b, shape: 'shark' },
  ],
};

export type FishShape = 'slim' | 'round' | 'flat' | 'shark' | 'eel' | 'squid' | 'whale' | 'serpent';

export interface FishSpecies {
  id: string;
  level: number; // 1-based
  rarity: Rarity;
  name: string;
  color: number;
  shape: FishShape;
  /** For bosses: which boss of the level (0 = zone 5, 1 = zone 10). */
  bossIndex?: number;
}

function mixColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

function buildSpecies(): FishSpecies[] {
  const out: FishSpecies[] = [];
  for (let l = 1; l <= LEVEL_COUNT; l++) {
    const theme = LEVEL_THEMES[l - 1];
    const prefix = theme.prefix ? `${theme.prefix} ` : '';
    for (const rarity of ['common', 'rare', 'endangered', 'legendary'] as const) {
      BASE_SPECIES[rarity].forEach((base, i) => {
        out.push({
          id: `L${l}-${rarity}-${i}`,
          level: l,
          rarity,
          name: prefix + base.name,
          color: l === 1 ? base.color : mixColor(base.color, theme.fishTint, 0.45),
          shape: base.shape,
        });
      });
    }
    theme.bosses.forEach((name, i) => {
      out.push({
        id: `L${l}-mythical-${i}`,
        level: l,
        rarity: 'mythical',
        name,
        color: mixColor(i === 0 ? 0x5d7290 : 0x3e5a7a, theme.fishTint, 0.35),
        shape: i === 0 ? 'whale' : 'serpent',
        bossIndex: i,
      });
    });
    out.push({
      id: `L${l}-goldfish-0`,
      level: l,
      rarity: 'goldfish',
      name: `${prefix}Golden Koi`,
      color: 0xffc928,
      shape: 'round',
    });
  }
  return out;
}

export const ALL_SPECIES: FishSpecies[] = buildSpecies();
export const SPECIES_BY_ID: Map<string, FishSpecies> = new Map(ALL_SPECIES.map((s) => [s.id, s]));

export function speciesFor(level: number, rarity: Rarity): FishSpecies[] {
  return ALL_SPECIES.filter((s) => s.level === level && s.rarity === rarity);
}

export function bossSpecies(level: number, bossIndex: number): FishSpecies {
  const s = SPECIES_BY_ID.get(`L${level}-mythical-${bossIndex}`);
  if (!s) throw new Error(`no boss ${level}/${bossIndex}`);
  return s;
}

export function goldfishSpecies(level: number): FishSpecies {
  return SPECIES_BY_ID.get(`L${level}-goldfish-0`)!;
}
