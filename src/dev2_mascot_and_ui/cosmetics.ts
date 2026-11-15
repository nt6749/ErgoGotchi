/**
 * Clothes the duck can wear, bought with corn.
 * Each item is drawn twice: once for the grown duck and once for the baby (whose head sits lower).
 * The egg can't wear anything.
 */

import { stamp, type Mark } from './duckSprites';
import type { CosmeticSlot, LifeStage, Outfit } from './progression';

export interface Cosmetic {
  id: string;
  name: string;
  slot: CosmeticSlot;
  /** Price in corn. */
  price: number;
  adult: Mark[];
  baby: Mark[];
}

const down = (marks: Mark[], dy: number): Mark[] => marks.map(([x, y, s]) => [x, y + dy, s]);

// The baby's head top is 4 rows lower than the grown duck's, its eyes 3 rows, its neck 2 rows
const hat = (id: string, name: string, price: number, adult: Mark[]): Cosmetic => ({
  id, name, slot: 'hat', price, adult, baby: down(adult, 4),
});
const face = (id: string, name: string, price: number, adult: Mark[]): Cosmetic => ({
  id, name, slot: 'face', price, adult, baby: down(adult, 3),
});

export const COSMETICS: Cosmetic[] = [
  hat('party-hat', 'Party Hat', 8, [
    [11, 0, 'YY'],
    [11, 1, 'FF'],
    [10, 2, 'FVVF'],
    [9, 3, 'FFVVFF'],
  ]),
  hat('beanie', 'Beanie', 10, [
    [11, 1, 'RR'],
    [8, 2, 'VVVVVVVV'],
    [7, 3, 'VVVVVVVVVV'],
    [6, 4, 'XXXXXXXXXXXX'],
  ]),
  hat('top-hat', 'Top Hat', 15, [
    [8, 0, 'KKKKKKKK'],
    [8, 1, 'KXXXXXXK'],
    [8, 2, 'KRRRRRRK'],
    [6, 3, 'KKKKKKKKKKKK'],
  ]),
  hat('crown', 'Crown', 40, [
    [8, 1, 'Y..YY..Y'],
    [8, 2, 'YYRYYRYY'],
    [8, 3, 'YYYYYYYY'],
  ]),
  face('sunglasses', 'Sunglasses', 12, [
    [6, 7, 'KKKK'],
    [14, 7, 'KKKK'],
    [5, 8, 'KKKKKKKKKKKKKK'],
    [6, 9, 'KKKK'],
    [14, 9, 'KKKK'],
    [7, 8, 'S'],
    [15, 8, 'S'],
  ]),
  {
    id: 'bow-tie',
    name: 'Bow Tie',
    slot: 'neck',
    price: 6,
    adult: [[9, 13, 'RRKKRR'], [9, 14, 'R.KK.R']],
    baby: [[9, 15, 'RRKKRR'], [9, 16, 'R.KK.R']],
  },
  {
    id: 'scarf',
    name: 'Scarf',
    slot: 'neck',
    price: 10,
    adult: [[4, 13, 'RHRHRHRHRHRHRHRH'], [14, 14, 'RH'], [14, 15, 'RH'], [14, 16, 'RR']],
    baby: [[6, 15, 'RHRHRHRHRHRH'], [13, 16, 'RH'], [13, 17, 'RR']],
  },
];

export const COSMETIC_BY_ID: Record<string, Cosmetic> = Object.fromEntries(COSMETICS.map((c) => [c.id, c]));
export const SLOT_LABELS: Record<CosmeticSlot, string> = { hat: 'Hat', face: 'Face', neck: 'Neck' };
const DRAW_ORDER: CosmeticSlot[] = ['neck', 'face', 'hat'];

/**
 * Draw an outfit onto a sprite.
 * `xOffset` shifts everything right for sprites where the duck isn't at the left edge (the TV scene).
 * `skip` leaves slots out, e.g. the face slot while the duck is already wearing work glasses.
 */
export function dress(
  rows: string[],
  stage: LifeStage,
  outfit: Outfit,
  xOffset = 0,
  skip: CosmeticSlot[] = []
): string[] {
  if (stage === 'EGG') return rows;
  const marks: Mark[] = [];
  for (const slot of DRAW_ORDER) {
    const item = COSMETIC_BY_ID[outfit[slot] ?? ''];
    if (!item || skip.includes(slot)) continue;
    for (const [x, y, s] of stage === 'BABY' ? item.baby : item.adult) marks.push([x + xOffset, y, s]);
  }
  return marks.length ? stamp(rows, marks) : rows;
}

/** Stable text key for an outfit, for caching dressed sprites. */
export const outfitKey = (outfit: Outfit): string => DRAW_ORDER.map((slot) => outfit[slot] ?? '-').join(',');
