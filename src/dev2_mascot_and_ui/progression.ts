/**
 * The pet's profile and corn economy.
 *
 *   sit upright for a while  ->  earn corn
 *   click the pet            ->  feed it the corn it needs  ->  level up
 *   level                    ->  life stage (egg -> baby duck -> grown duck)
 *   spare corn               ->  buy clothes (baby and grown duck only)
 *
 * Pure functions plus a small localStorage wrapper. Nothing here talks to the backend.
 */

import type { PetState } from '../types';

export type LifeStage = 'EGG' | 'BABY' | 'ADULT';
export type CosmeticSlot = 'hat' | 'face' | 'neck';
export type Outfit = Partial<Record<CosmeticSlot, string>>;

/** Seconds of upright sitting that earn one corn. Demo mode is much faster for walkthroughs. */
export const CORN_EVERY_SECONDS = 30;
export const DEMO_CORN_EVERY_SECONDS = 2;
export const cornInterval = (demoMode: boolean): number =>
  demoMode ? DEMO_CORN_EVERY_SECONDS : CORN_EVERY_SECONDS;

/** Sitting upright means the pet is content: these states count towards the next corn. */
export const earnsCorn = (state: PetState): boolean => state === 'NEUTRAL' || state === 'THRIVING';

/** Corn the pet must be fed to go from `level` to the next one: 10, 20, 30, ... */
export const cornToLevelUp = (level: number): number => 10 * level;

/** Level 1 is the egg; it hatches at level 2 and is fully grown at level 4. */
export const HATCH_LEVEL = 2;
export const ADULT_LEVEL = 4;

export function stageForLevel(level: number): LifeStage {
  if (level < HATCH_LEVEL) return 'EGG';
  if (level < ADULT_LEVEL) return 'BABY';
  return 'ADULT';
}

export const STAGE_TITLES: Record<LifeStage, string> = {
  EGG: 'Unhatched Egg',
  BABY: 'Diaper Duckling',
  ADULT: 'Posture Duck',
};

export const DEFAULT_NAME = 'DuckDuck';
export const MAX_NAME_LENGTH = 16;

export interface PetProfile {
  name: string;
  level: number;
  /** Corn in the pantry right now. */
  corn: number;
  /** All corn ever earned by sitting upright. */
  cornEarned: number;
  /** Ids of the clothes that have been bought. */
  owned: string[];
  /** What is being worn, one item per slot. */
  equipped: Outfit;
}

export const NEW_PET: PetProfile = {
  name: DEFAULT_NAME,
  level: 1,
  corn: 0,
  cornEarned: 0,
  owned: [],
  equipped: {},
};

export const stageOf = (pet: PetProfile): LifeStage => stageForLevel(pet.level);
/** Only a hatched pet can wear clothes. */
export const canWearClothes = (pet: PetProfile): boolean => stageOf(pet) !== 'EGG';
export const cornNeeded = (pet: PetProfile): number => cornToLevelUp(pet.level);
export const canFeed = (pet: PetProfile): boolean => pet.corn >= cornNeeded(pet);

// ---------------------------------------------------------------- actions (each returns a new profile)
/** Corn earned by sitting upright. */
export function earnCorn(pet: PetProfile, amount: number): PetProfile {
  return { ...pet, corn: pet.corn + amount, cornEarned: pet.cornEarned + amount };
}

/** Corn handed out for free (demo shortcut): it does not count as earned. */
export function grantCorn(pet: PetProfile, amount: number): PetProfile {
  return { ...pet, corn: pet.corn + amount };
}

/** Feed the pet the corn it needs and level it up. Returns the same object if there isn't enough. */
export function feed(pet: PetProfile): PetProfile {
  if (!canFeed(pet)) return pet;
  return { ...pet, corn: pet.corn - cornNeeded(pet), level: pet.level + 1 };
}

/** Buy an item and put it on. Returns the same object if it can't be bought. */
export function buy(pet: PetProfile, item: { id: string; slot: CosmeticSlot; price: number }): PetProfile {
  if (!canWearClothes(pet) || pet.owned.includes(item.id) || pet.corn < item.price) return pet;
  return {
    ...pet,
    corn: pet.corn - item.price,
    owned: [...pet.owned, item.id],
    equipped: { ...pet.equipped, [item.slot]: item.id },
  };
}

/** Wear an owned item, or pass null to take off whatever is in that slot. */
export function equip(pet: PetProfile, slot: CosmeticSlot, id: string | null): PetProfile {
  if (id !== null && !pet.owned.includes(id)) return pet;
  const equipped = { ...pet.equipped };
  if (id === null) delete equipped[slot];
  else equipped[slot] = id;
  return { ...pet, equipped };
}

export function rename(pet: PetProfile, name: string): PetProfile {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
  return { ...pet, name: clean || DEFAULT_NAME };
}

/** Jump straight to a level (presenter control). Corn, name and clothes are untouched. */
export function setLevel(pet: PetProfile, level: number): PetProfile {
  return { ...pet, level: Math.max(1, Math.floor(level)) };
}

/** Back to a level 1 egg with an empty pantry. The name and bought clothes are kept. */
export function startOver(pet: PetProfile): PetProfile {
  return { ...pet, level: 1, corn: 0 };
}

// ---------------------------------------------------------------- storage
/** localStorage key (shared by the pet and dashboard windows). */
export const PET_STORAGE_KEY = 'ergogotchi.pet';
const SLOTS: CosmeticSlot[] = ['hat', 'face', 'neck'];

/** Turn whatever was stored into a valid profile. */
export function sanitizePet(raw: unknown): PetProfile {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const count = (v: unknown, min: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.floor(v)) : min;
  const owned = Array.isArray(r.owned) ? r.owned.filter((id): id is string => typeof id === 'string') : [];
  const equipped: Outfit = {};
  const rawEquipped = (r.equipped && typeof r.equipped === 'object' ? r.equipped : {}) as Record<string, unknown>;
  for (const slot of SLOTS) {
    const id = rawEquipped[slot];
    if (typeof id === 'string' && owned.includes(id)) equipped[slot] = id;
  }
  return rename(
    {
      name: DEFAULT_NAME,
      level: count(r.level, 1),
      corn: count(r.corn, 0),
      cornEarned: count(r.cornEarned, 0),
      owned,
      equipped,
    },
    typeof r.name === 'string' ? r.name : DEFAULT_NAME
  );
}

export function loadPet(): PetProfile {
  try {
    return sanitizePet(JSON.parse(localStorage.getItem(PET_STORAGE_KEY) ?? 'null'));
  } catch {
    return { ...NEW_PET };
  }
}

/**
 * Apply a change to the stored profile and return the result.
 * Always starts from what is in storage, because two windows (pet and dashboard) both write to it.
 */
export function updatePet(change: (pet: PetProfile) => PetProfile): PetProfile {
  const next = change(loadPet());
  try {
    localStorage.setItem(PET_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable: the pet just won't persist across restarts
  }
  return next;
}
