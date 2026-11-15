/**
 * Activity poses: what the duck does while you use your computer.
 *   WATCHING       - a TV next to the duck (YouTube, Netflix, ...)
 *   MUSIC          - headphones and floating notes (Spotify, ...)
 *   WORKING        - glasses and a laptop (editor, terminal, docs, ...)
 *   WORKING_MUSIC  - working with headphones on
 *
 * Drawn for the grown duck and the baby. The egg has no activity poses.
 * WATCHING sprites are wider than the usual 24 columns because the TV sits beside the duck.
 */

import { DUCK, DUCK_H, EYES_HAPPY, stamp, type DuckFrame, type Mark } from './duckSprites';
import { BABY, BABY_EYES_HAPPY } from './lifeStageSprites';

export type ActivityPose = 'WATCHING' | 'MUSIC' | 'WORKING' | 'WORKING_MUSIC';

// ---------------------------------------------------------------- music
// `dy` shifts everything down: 0 for the grown duck, 3 for the baby's lower, smaller head
const HEADPHONES_ADULT: Mark[] = [
  [7, 2, 'XXXXXXXXXX'],
  [5, 3, 'XX'], [17, 3, 'XX'],
  [4, 4, 'XX'], [18, 4, 'XX'],
  [3, 5, 'XX'], [19, 5, 'XX'],
  [2, 6, '.XX'], [19, 6, 'XX.'],
  [2, 7, 'XxX'], [19, 7, 'XxX'],
  [2, 8, 'XxX'], [19, 8, 'XxX'],
  [2, 9, 'XxX'], [19, 9, 'XxX'],
  [2, 10, '.XX'], [19, 10, 'XX.'],
];
const HEADPHONES_BABY: Mark[] = [
  [8, 6, 'XXXXXXXX'],
  [6, 7, 'XX'], [16, 7, 'XX'],
  [5, 8, 'XX'], [17, 8, 'XX'],
  [4, 9, 'XX'], [18, 9, 'XX'],
  [3, 10, '.XX'], [18, 10, 'XX.'],
  [3, 11, 'XxX'], [18, 11, 'XxX'],
  [3, 12, 'XxX'], [18, 12, 'XxX'],
  [3, 13, '.XX'], [18, 13, 'XX.'],
];

/** An eighth note, 3 wide and 5 tall, in palette colour `c`. */
const note = (x: number, y: number, c: string): Mark[] => [
  [x, y, `.${c}${c}`],
  [x, y + 1, `.${c}.`],
  [x, y + 2, `.${c}.`],
  [x, y + 3, `${c}${c}.`],
  [x, y + 4, `${c}${c}.`],
];
// The two notes bob in opposite directions between frames
const notes = (top: number, phase: 0 | 1): Mark[] => [
  ...note(0, top + phase, 'F'),
  ...note(21, top + 1 - phase, 'n'),
];

// ---------------------------------------------------------------- working
/** Glasses over the eyes; `dy` as above. `up` is where the pupils look (at the screen or the keys). */
const glasses = (dy: number, fill: string, up: boolean): Mark[] => [
  [6, 7 + dy, 'KKKK'], [14, 7 + dy, 'KKKK'],
  [10, 8 + dy, 'KKKK'],
  [6, 8 + dy, 'K'], [9, 8 + dy, 'K'], [14, 8 + dy, 'K'], [17, 8 + dy, 'K'],
  [6, 9 + dy, 'K'], [9, 9 + dy, 'K'], [14, 9 + dy, 'K'], [17, 9 + dy, 'K'],
  [6, 10 + dy, 'KKK'], [15, 10 + dy, 'KKK'],
  // Lenses: one pupil each, on the upper or lower row
  [7, 8 + dy, up ? `${fill}E` : `${fill}${fill}`], [15, 8 + dy, up ? `E${fill}` : `${fill}${fill}`],
  [7, 9 + dy, up ? `${fill}${fill}` : `${fill}E`], [15, 9 + dy, up ? `${fill}${fill}` : `E${fill}`],
];

/** Laptop seen from behind, in front of the duck. `glow` is the logo colour. */
const laptopAdult = (glow: string): Mark[] => [
  [6, 15, 'KKKKKKKKKKKK'],
  [6, 16, 'KllllllllllK'],
  [6, 17, `Kllll${glow}${glow}llllK`],
  [6, 18, `Kllll${glow}${glow}llllK`],
  [6, 19, 'KllllllllllK'],
  [4, 20, 'KkkkkkkkkkkkkkkK'],
  [4, 21, 'KKKKKKKKKKKKKKKK'],
];
/** A smaller toy laptop so the baby's diaper still shows at the sides. */
const laptopBaby = (glow: string): Mark[] => [
  [8, 16, 'KKKKKKKK'],
  [8, 17, `Kll${glow}${glow}llK`],
  [8, 18, `Kll${glow}${glow}llK`],
  [8, 19, 'KllllllK'],
  [7, 20, 'KkkkkkkkkK'],
  [7, 21, 'KKKKKKKKKK'],
];

// ---------------------------------------------------------------- watching
const tv = (screen: [string, string, string]): string[] => [
  '..K.......K..',
  '...K.....K...',
  '....K...K....',
  '.KKKKKKKKKKK.',
  'KvvvvvvvvvvvK',
  'KvKKKKKKKvvvK',
  `KvK${screen[0]}KvYvK`,
  `KvK${screen[1]}KvvvK`,
  `KvK${screen[2]}KvRvK`,
  'KvKKKKKKKvvvK',
  'KvvvvvvvvvvvK',
  '.KKKKKKKKKKK.',
  '..KK.....KK..',
];
const TV_A = tv(['uuwuu', 'uwwuu', 'uuuwu']);
const TV_B = tv(['wuuuw', 'uuwuu', 'uwuuu']);

/** In WATCHING sprites the duck starts this many columns in: the TV's width plus a 1-column gap. */
export const WATCHING_X_OFFSET = TV_A[0].length + 1;

/** Put a prop to the left of a sprite, both standing on the same ground line. */
function withPropOnLeft(prop: string[], rows: string[]): string[] {
  const propWidth = prop[0].length;
  const blank = '.'.repeat(propWidth);
  const top = DUCK_H - prop.length;
  return rows.map((row, y) => `${y >= top ? prop[y - top] : blank}.${row}`);
}

// Pupils glance left, towards the TV
const ADULT_LOOK_LEFT: Mark[] = [[7, 8, 'EW'], [14, 8, 'EW'], [7, 9, 'EW'], [14, 9, 'EW']];
const BABY_LOOK_LEFT: Mark[] = [[7, 11, 'EA'], [14, 11, 'EA'], [7, 12, 'EA'], [14, 12, 'EA']];
const POPCORN: Mark[] = [[9, 14, '.YYYY.'], [9, 15, 'KRWRWK'], [9, 16, 'KRWRWK'], [9, 17, '.KKKK.']];

const ADULT_WATCHING = stamp(DUCK, [...ADULT_LOOK_LEFT, ...POPCORN]);
const BABY_WATCHING = stamp(BABY, BABY_LOOK_LEFT);

// ---------------------------------------------------------------- sprites
export const ADULT_ACTIVITY: Record<ActivityPose, DuckFrame[]> = {
  WATCHING: [
    { rows: withPropOnLeft(TV_A, ADULT_WATCHING), ms: 320 },
    { rows: withPropOnLeft(TV_B, ADULT_WATCHING), ms: 320 },
  ],
  MUSIC: [
    { rows: stamp(EYES_HAPPY, [...HEADPHONES_ADULT, ...notes(0, 0)]), ms: 420 },
    { rows: stamp(EYES_HAPPY, [...HEADPHONES_ADULT, ...notes(0, 1)]), ms: 420 },
  ],
  WORKING: [
    { rows: stamp(DUCK, [...glasses(0, 'W', false), ...laptopAdult('g')]), ms: 700 },
    { rows: stamp(DUCK, [...glasses(0, 'W', true), ...laptopAdult('Y')]), ms: 700 },
  ],
  WORKING_MUSIC: [
    { rows: stamp(DUCK, [...glasses(0, 'W', false), ...laptopAdult('g'), ...HEADPHONES_ADULT, ...notes(0, 0)]), ms: 500 },
    { rows: stamp(DUCK, [...glasses(0, 'W', true), ...laptopAdult('Y'), ...HEADPHONES_ADULT, ...notes(0, 1)]), ms: 500 },
  ],
};

const BABY_HAPPY = stamp(BABY, BABY_EYES_HAPPY);

export const BABY_ACTIVITY: Record<ActivityPose, DuckFrame[]> = {
  WATCHING: [
    { rows: withPropOnLeft(TV_A, BABY_WATCHING), ms: 320 },
    { rows: withPropOnLeft(TV_B, BABY_WATCHING), ms: 320 },
  ],
  MUSIC: [
    { rows: stamp(BABY_HAPPY, [...HEADPHONES_BABY, ...notes(1, 0)]), ms: 420 },
    { rows: stamp(BABY_HAPPY, [...HEADPHONES_BABY, ...notes(1, 1)]), ms: 420 },
  ],
  WORKING: [
    { rows: stamp(BABY, [...glasses(3, 'A', false), ...laptopBaby('g')]), ms: 700 },
    { rows: stamp(BABY, [...glasses(3, 'A', true), ...laptopBaby('Y')]), ms: 700 },
  ],
  WORKING_MUSIC: [
    { rows: stamp(BABY, [...glasses(3, 'A', false), ...laptopBaby('g'), ...HEADPHONES_BABY, ...notes(1, 0)]), ms: 500 },
    { rows: stamp(BABY, [...glasses(3, 'A', true), ...laptopBaby('Y'), ...HEADPHONES_BABY, ...notes(1, 1)]), ms: 500 },
  ],
};
