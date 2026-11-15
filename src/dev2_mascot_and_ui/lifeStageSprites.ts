/**
 * Egg and baby-duck sprites: the first two life stages before the grown duck in duckSprites.ts.
 * Same 24x24 text-grid format and palette. Each stage has a sprite for every DuckSpriteKey,
 * so the egg and the baby can warn about posture just like the grown duck does.
 *
 * Canvas rows: the egg is 18 rows tall (rows 6-23) and the baby 17 (rows 7-23).
 */

import { canvas, stamp, type DuckFrame, type DuckSpriteKey, type Mark } from './duckSprites';

/** Swap palette letters across a whole sprite (e.g. to grey it out). */
function recolor(rows: string[], map: Record<string, string>): string[] {
  return rows.map((row) => [...row].map((c) => map[c] ?? c).join(''));
}

const Z_MARK: Mark[] = [[19, 2, 'ZZZZ'], [21, 3, 'Z'], [20, 4, 'Z'], [19, 5, 'ZZZZ']];
const ANGER_MARK: Mark[] = [[20, 3, 'R.R'], [21, 4, 'R'], [20, 5, 'R.R']];

// ---------------------------------------------------------------- egg
const EGG_ART = [
  '..........KKKK..........',
  '........KKLLLLKK........',
  '.......KLLLLLLLLK.......',
  '......KLLLLLLLLLLK......',
  '......KLLQQLLLLLLK......',
  '.....KLLLQQLLLLLLLK.....',
  '.....KLLLLLLLLLLLLK.....',
  '....KLLLLLLLLLLQQLLK....',
  '....KLLLLLLLLLLQQLLK....',
  '....KLLLLLLLLLLLLLLK....',
  '....KLLQQLLLLLLLLLLK....',
  '....KLLQQLLLLLLLLLNK....',
  '....KLLLLLLLLQQLLNNK....',
  '....KNLLLLLLLQQLNNNK....',
  '.....KNNLLLLLLLNNNK.....',
  '.....KNNNNNNNNNNNNK.....',
  '......KKNNNNNNNNKK......',
  '........KKKKKKKK........',
];

const EGG = canvas(EGG_ART); // rows 6-23

const EGG_SPARKLE_A: Mark[] = [[1, 11, 'Y'], [0, 12, 'YWY'], [1, 13, 'Y'], [21, 7, 'Y'], [20, 8, 'YWY'], [21, 9, 'Y']];
const EGG_SPARKLE_B: Mark[] = [[1, 12, 'Y'], [21, 8, 'Y']];
const EGG_SWEAT: Mark[] = [[21, 9, 'T'], [21, 10, 'T'], [20, 11, 'TTT'], [21, 12, 'T']];

/** A jagged slot cracked open in the shell, with something looking out of it. */
const peek = (eyes: string): Mark[] => [
  [7, 12, 'K..K..K..K'],
  [6, 13, 'KKKKKKKKKKKK'],
  [6, 14, eyes],
  [6, 15, 'KKKKKKKKKKKK'],
  [8, 16, 'K..K..K.K'],
];
const WORRIED_EYES = 'KKWEKKKKEWKK';
const WORRIED_EYES_SHUT = 'KKKKKKKKKKKK';
const ANGRY_EYES = 'KKRRKKKKRRKK';

export const EGG_SPRITES: Record<DuckSpriteKey, DuckFrame[]> = {
  NEUTRAL: [{ rows: EGG, ms: 0 }],
  TIRED: [{ rows: EGG, ms: 0 }],
  THRIVING: [
    { rows: stamp(EGG, EGG_SPARKLE_A), ms: 450 },
    { rows: stamp(EGG, EGG_SPARKLE_B), ms: 450 },
  ],
  CALIBRATING: [{ rows: stamp(EGG, [[5, 14, 'BBBBBBBBBBBBBB'], [5, 15, 'BBBBBBBBBBBBBB']]), ms: 0 }],
  // Posture warning: worried eyes peek out through a crack
  SLOUCHING: [
    { rows: stamp(EGG, [...peek(WORRIED_EYES), ...EGG_SWEAT]), ms: 1400 },
    { rows: stamp(EGG, [...peek(WORRIED_EYES_SHUT), ...EGG_SWEAT]), ms: 160 },
  ],
  // Stronger warning (the grown duck's knife moment): glowing angry eyes
  KNIFE: [
    { rows: stamp(EGG, [...peek(ANGRY_EYES), ...ANGER_MARK]), ms: 280 },
    { rows: stamp(EGG, peek(ANGRY_EYES)), ms: 280 },
  ],
  // Gone cold: grey shell with frost
  WILTED: [
    {
      rows: stamp(recolor(EGG, { L: 'S', N: 'G', Q: 'G' }), [[9, 11, 'T'], [15, 13, 'T'], [7, 17, 'T'], [13, 19, 'T'], [17, 16, 'T']]),
      ms: 0,
    },
  ],
  AWAY: [{ rows: stamp(EGG, Z_MARK), ms: 0 }],
};

// ---------------------------------------------------------------- baby duck (in a diaper)
const BABY_ART = [
  '.........KKKKKK.........',
  '.......KKAAAAAAKK.......',
  '......KAAAAAAAAAAK......',
  '.....KAAAAAAAAAAAAK.....',
  '.....KAAEAAAAAAEAAK.....', // eyes (canvas rows 11-12)
  '.....KAAEAAAAAAEAAK.....',
  '.....KAPAAOOOOAAPAK.....', // beak + blush
  '.....KAAAAODDOAAAAK.....',
  '......KAAAAAAAAAAK......',
  '.....KAKAAAAAAAAKAK.....', // stubby wings
  '.....KAKAAAAAAAAKAK.....',
  '.....KKIIIIIIIIIIKK.....', // diaper
  '.....KIIVIIIIIIVIIK.....', // diaper pins
  '......KJIIIIIIIIJK......',
  '.......KKJJJJJJKK.......',
  '.......KOOK..KOOK.......', // feet
  '.......KKKK..KKKK.......',
];

export const BABY = canvas(BABY_ART); // rows 7-23

const BABY_EYES_CLOSED: Mark[] = [[7, 11, 'AA'], [15, 11, 'AA'], [7, 12, 'KK'], [15, 12, 'KK']];
export const BABY_EYES_HAPPY: Mark[] = [[7, 11, 'AEA'], [14, 11, 'AEA'], [7, 12, 'EAE'], [14, 12, 'EAE']];
const BABY_SPARKLE_A: Mark[] = [[1, 12, 'Y'], [0, 13, 'YWY'], [1, 14, 'Y'], [21, 8, 'Y'], [20, 9, 'YWY'], [21, 10, 'Y']];
const BABY_SPARKLE_B: Mark[] = [[1, 13, 'Y'], [21, 9, 'Y']];

// Tantrum: angry brows and a rattle shaken in the air; `y` is the top row of the rattle
const BABY_BROWS: Mark[] = [[7, 9, 'K'], [8, 10, 'K'], [16, 9, 'K'], [15, 10, 'K']];
const rattle = (y: number): Mark[] => [
  [20, y, 'FFF'],
  [20, y + 1, 'FYF'],
  [20, y + 2, 'FFF'],
  [20, y + 3, 'H'],
  [19, y + 4, 'H'],
];

const BABY_X_EYES: Mark[] = [
  [7, 10, 'KAK'], [7, 11, 'AKA'], [7, 12, 'KAK'],
  [14, 10, 'KAK'], [14, 11, 'AKA'], [14, 12, 'KAK'],
];
const HALO: Mark[] = [[10, 3, 'YYYY'], [9, 4, 'Y'], [14, 4, 'Y'], [10, 5, 'YYYY']];

export const BABY_SPRITES: Record<DuckSpriteKey, DuckFrame[]> = {
  NEUTRAL: [
    { rows: BABY, ms: 3200 },
    { rows: stamp(BABY, BABY_EYES_CLOSED), ms: 160 }, // blink
  ],
  THRIVING: [
    { rows: stamp(BABY, [...BABY_EYES_HAPPY, ...BABY_SPARKLE_A]), ms: 450 },
    { rows: stamp(BABY, [...BABY_EYES_HAPPY, ...BABY_SPARKLE_B]), ms: 450 },
  ],
  CALIBRATING: [{ rows: stamp(BABY, [[6, 11, 'BBEBBBBBBEBB'], [6, 12, 'BBEBBBBBBEBB']]), ms: 0 }],
  // Posture warning: crying, tears running down
  SLOUCHING: [
    { rows: stamp(BABY, [...BABY_EYES_CLOSED, [7, 13, 'T'], [16, 13, 'T'], [10, 14, 'DDDD']]), ms: 350 },
    { rows: stamp(BABY, [...BABY_EYES_CLOSED, [7, 13, 'T'], [16, 13, 'T'], [7, 14, 'T'], [16, 14, 'T'], [10, 14, 'DDDD']]), ms: 350 },
  ],
  // Stronger warning: full tantrum with the rattle
  KNIFE: [
    { rows: stamp(BABY, [...BABY_BROWS, ...rattle(11), ...ANGER_MARK]), ms: 240 },
    { rows: stamp(BABY, [...BABY_BROWS, ...rattle(12)]), ms: 240 },
  ],
  // Low HP: droopy eyelids and a pacifier
  TIRED: [
    { rows: stamp(BABY, [[8, 11, 'a'], [15, 11, 'a'], [10, 13, 'FFFF'], [11, 14, 'FF']]), ms: 0 },
  ],
  WILTED: [{ rows: recolor(stamp(BABY, [...BABY_X_EYES, ...HALO]), { A: 'S', P: 'S', O: 'G', D: 'G' }), ms: 0 }],
  AWAY: [{ rows: stamp(BABY, [...BABY_EYES_CLOSED, ...Z_MARK]), ms: 0 }],
};

// ---------------------------------------------------------------- hatching (egg -> baby, played once)
const CRACK_SMALL: Mark[] = [[8, 14, 'K.K.K.K.K'], [7, 15, 'K.K.K.K.K']];
const CRACK_BIG: Mark[] = [...CRACK_SMALL, [5, 14, 'KK'], [17, 14, 'KK'], [9, 13, 'K...K...K'], [10, 16, 'K...K']];

// The top of the shell worn as a hat, sitting just above the baby's head
const SHELL_CAP: Mark[] = [
  [10, 2, 'KKKK'],
  [8, 3, 'KKLLLLKK'],
  [7, 4, 'KLLLLLLLLK'],
  [6, 5, 'KLLQQLLLLLLK'],
  [6, 6, 'KLKK.KK.KKLK'],
];
// The bottom half of the shell with a jagged rim, hiding the baby's lower body
const SHELL_BOTTOM: Mark[] = [
  [6, 16, 'K...K...K...K'],
  [4, 17, 'KKLKKKLKKKLKKKLK'],
  [4, 18, 'KLLLLLLLLQQLLNNK'],
  [4, 19, 'KNLLLLLLLQQLNNNK'],
  [5, 20, 'KNNLLLLLLLNNNK'],
  [5, 21, 'KNNNNNNNNNNNNK'],
  [6, 22, 'KKNNNNNNNNKK'],
  [8, 23, 'KKKKKKKK'],
];
/** The baby with its feet removed, so they don't poke out under the shell. */
const BABY_NO_FEET = BABY.map((row, y) => (y >= 22 ? '.'.repeat(row.length) : row));

const BABY_HAPPY = stamp(BABY, BABY_EYES_HAPPY);

export const HATCH_FRAMES: DuckFrame[] = [
  { rows: stamp(EGG, CRACK_SMALL), ms: 450 },
  { rows: stamp(EGG, CRACK_BIG), ms: 450 },
  { rows: stamp(EGG, [...CRACK_BIG, ...peek(WORRIED_EYES)]), ms: 450 },
  { rows: stamp(BABY_NO_FEET, [...SHELL_BOTTOM, ...SHELL_CAP]), ms: 600 },
  { rows: stamp(BABY_HAPPY, SHELL_CAP), ms: 700 },
  { rows: BABY_HAPPY, ms: 400 },
];

/** Total running time of the hatching animation. */
export const HATCH_MS = HATCH_FRAMES.reduce((sum, f) => sum + f.ms, 0);
