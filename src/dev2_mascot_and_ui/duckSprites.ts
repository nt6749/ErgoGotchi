/**
 * Pixel duck sprites for ErgoGotchi.
 * 24x24 grid, drawn as text: one character per pixel, '.' = transparent (see PALETTE for the rest).
 * Every sprite is bottom-aligned on the same ground line so the duck never jumps between moods.
 *
 * Edit a sprite by changing its rows (each row must stay exactly 24 characters).
 * Animated sprites are a list of frames, each shown for `ms` milliseconds.
 */

import type { PetState } from '../types';

export const DUCK_W = 24;
export const DUCK_H = 24;

export const PALETTE: Record<string, string> = {
  K: '#1c1917', // outline
  W: '#ffffff', // feathers
  S: '#d5dde8', // feather shade / tired eyelids
  O: '#f59e0b', // beak & feet
  D: '#c2410c', // beak underside
  E: '#111111', // eyes
  P: '#fda4af', // blush
  G: '#cbd5e1', // knife blade
  H: '#7f1d1d', // knife handle
  M: '#f5efe0', // mug
  C: '#6b3f1d', // coffee
  B: '#22d3ee', // calibration visor
  Y: '#facc15', // sparkles & halo
  Z: '#64748b', // sleep "Z"
  T: '#7dd3fc', // sweat drop
  R: '#ef4444', // anger mark
};

/** Sprite keys: the pet states plus the two extra looks. */
export type DuckSpriteKey = PetState | 'KNIFE' | 'TIRED';

export interface DuckFrame {
  rows: string[];
  ms: number;
}

// ---------------------------------------------------------------- base duck
const BASE = [
  '.........KKKKKK.........',
  '.......KKWWWWWWKK.......',
  '......KWWWWWWWWWWK......',
  '.....KWWWWWWWWWWWWK.....',
  '.....KWWWWWWWWWWWWK.....',
  '....KWWWEWWWWWWEWWWK....', // eyes
  '....KWWWEWWWWWWEWWWK....',
  '....KWWWWOOOOOOWWWWK....', // beak
  '...KWWPWOOOOOOOOWPWWK...',
  '...KWWWWWDDDDDDWWWWWK...',
  '...KWWWWWWWWWWWWWWWWK...',
  '..KWWWWWWWWWWWWWWWWWWK..',
  '..KWKWWWWWWWWWWWWWWKWK..', // wings
  '..KWKWWWWWWWWWWWWWWKWK..',
  '..KWWKWWWWWWWWWWWWKWWK..',
  '..KSWWWWWWWWWWWWWWWWSK..',
  '...KSSWWWWWWWWWWWWSSK...',
  '....KKSSSSSSSSSSSSKK....',
  '......KKKKKKKKKKKK......',
  '......KOOOK..KOOOK......', // feet
  '......KKKKK..KKKKK......',
];

const SQUASHED = [
  '.........KKKKKK.........',
  '......KKKWWWWWWKKK......',
  '....KKWWWWWWWWWWWWKK....',
  '...KWWWWWWWWWWWWWWWWK...',
  '..KWWWWKKWWWWWWKKWWWWK..',
  '..KWWWWWWOOOOOOWWWWWWK..',
  '..KWWWWWWOOOOOOWWWWWWK..',
  '..KWWWWWWDDDDDDWWWWWWK..',
  '.KWWWWWWWWWWWWWWWWWWWWK.',
  '.KWWWWWWWWWWWWWWWWWWWWK.',
  '.KSWWWWWWWWWWWWWWWWWWSK.',
  '.KSSWWWWWWWWWWWWWWWWSSK.',
  '..KSSSSSSSSSSSSSSSSSSK..',
  '...KKKKKKKKKKKKKKKKKK...',
  '....KOOOK......KOOOK....',
  '....KKKKK......KKKKK....',
];

const FLOPPED = [
  '..........YYYY..........',
  '.........Y....Y.........',
  '..........YYYY..........',
  '........................',
  '........KKKKKKKK........',
  '.....KKKWWWWWWWWKKK.....',
  '...KKWWWWWWWWWWWWWWKK...',
  '..KWWWKWKWWWWWWKWKWWWK..',
  '..KWWWWKWWOOOOWWKWWWWK..',
  '.KWWWWKWKWDDDDWKWKWWWWK.',
  '.KSWWWWWWWWWWWWWWWWWWSK.',
  'KOKSSSSSSSSSSSSSSSSSSKOK',
  '.KKKKKKKKKKKKKKKKKKKKKK.',
];

// ---------------------------------------------------------------- helpers
/** Bottom-align art onto the full 24-row canvas. */
function canvas(art: string[]): string[] {
  return [...Array(DUCK_H - art.length).fill('.'.repeat(DUCK_W)), ...art];
}

/** Copy rows and stamp strings at (x, y) in canvas coordinates. '.' in a stamp leaves the pixel unchanged. */
function stamp(rows: string[], marks: Array<[number, number, string]>): string[] {
  const out = [...rows];
  for (const [x, y, s] of marks) {
    const chars = out[y].split('');
    [...s].forEach((c, i) => {
      if (c !== '.') chars[x + i] = c;
    });
    out[y] = chars.join('');
  }
  return out;
}

// BASE art starts on canvas row 3, so face rows are: eyes 8-9, beak 10-12, wings 15-17
const DUCK = canvas(BASE);

const EYES_CLOSED = stamp(DUCK, [[5, 8, 'WWWWWWWWWWWWWW'], [5, 9, 'WWKKWWWWWWKKWW']]);
const EYES_HAPPY = stamp(DUCK, [[5, 8, 'WWWEWWWWWWEWWW'], [5, 9, 'WWEWEWWWWEWEWW']]);

const SPARKLE_A: Array<[number, number, string]> = [[1, 7, 'Y'], [0, 8, 'YWY'], [1, 9, 'Y'], [21, 4, 'Y'], [20, 5, 'YWY'], [21, 6, 'Y']];
const SPARKLE_B: Array<[number, number, string]> = [[1, 8, 'Y'], [21, 5, 'Y']];

// Knife held at the belly; `y` is the top row of the blade
const knife = (y: number): Array<[number, number, string]> => [
  [8, y, 'GGGGG'],
  [4, y + 1, 'HHGGGGGGG'],
  [8, y + 2, 'GGGG'],
];
const ANGRY_BROWS: Array<[number, number, string]> = [[6, 6, 'K'], [17, 6, 'K'], [7, 7, 'K'], [16, 7, 'K']];
const ANGER_MARK: Array<[number, number, string]> = [[19, 3, 'R.R'], [20, 4, 'R'], [19, 5, 'R.R']];

const TIRED_FACE: Array<[number, number, string]> = [
  [5, 8, 'WWSSWWWWWWSSWW'], // heavy lids
  [5, 9, 'WWWEWWWWWWEWWW'],
  [5, 10, 'WWSSOOOOOOSSWW'], // eye bags
];
const MUG: Array<[number, number, string]> = [
  [9, 15, 'KCCCK'],
  [9, 16, 'KMMMKK'],
  [9, 17, 'KMMMK'],
  [9, 18, 'KKKKK'],
];
const STEAM_A: Array<[number, number, string]> = [[10, 13, 'S'], [11, 14, 'S']];
const STEAM_B: Array<[number, number, string]> = [[11, 13, 'S'], [10, 14, 'S']];

// ---------------------------------------------------------------- sprites
export const DUCK_SPRITES: Record<DuckSpriteKey, DuckFrame[]> = {
  NEUTRAL: [
    { rows: DUCK, ms: 3800 },
    { rows: EYES_CLOSED, ms: 160 }, // blink
  ],
  THRIVING: [
    { rows: stamp(EYES_HAPPY, SPARKLE_A), ms: 450 },
    { rows: stamp(EYES_HAPPY, SPARKLE_B), ms: 450 },
  ],
  CALIBRATING: [
    { rows: stamp(DUCK, [[5, 8, 'WBBBBBBBBBBBBW'], [5, 9, 'WBBEBBBBBBEBBW']]), ms: 0 },
  ],
  SLOUCHING: [
    { rows: stamp(canvas(SQUASHED), [[19, 3, 'T'], [19, 4, 'T'], [18, 5, 'TTT'], [19, 6, 'T']]), ms: 0 },
  ],
  WILTED: [{ rows: canvas(FLOPPED), ms: 0 }],
  AWAY: [
    { rows: stamp(EYES_CLOSED, [[19, 0, 'ZZZZ'], [21, 1, 'Z'], [20, 2, 'Z'], [19, 3, 'ZZZZ']]), ms: 0 },
  ],
  // "Don't duck with me": knife bobs, anger mark blinks
  KNIFE: [
    { rows: stamp(DUCK, [...ANGRY_BROWS, ...knife(15), ...ANGER_MARK]), ms: 280 },
    { rows: stamp(DUCK, [...ANGRY_BROWS, ...knife(14)]), ms: 280 },
  ],
  // Low HP: heavy eyelids, coffee mug, drifting steam
  TIRED: [
    { rows: stamp(DUCK, [...TIRED_FACE, ...MUG, ...STEAM_A]), ms: 650 },
    { rows: stamp(DUCK, [...TIRED_FACE, ...MUG, ...STEAM_B]), ms: 650 },
  ],
};
