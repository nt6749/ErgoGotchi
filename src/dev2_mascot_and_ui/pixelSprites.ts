/**
 * Pixel-art sprites for ErgoGotchi ("Sprout", a little plant blob).
 * Every state is drawn on the same 20x18 grid so the pet never jumps when it changes mood.
 *
 * To tweak the character: change PALETTES (colours) or the face/prop pixel lists below.
 * Each pixel is [x, y, colourKey]; x runs 0..19 left to right, y runs 0..17 top to bottom.
 * Mirror a pixel horizontally with x -> 19 - x.
 */

import type { PetState } from '../types';

export const GRID_W = 20;
export const GRID_H = 18;

type Pixel = [number, number, string];

interface Palette {
  outline: string;
  body: string;
  shade: string;
  highlight: string;
}

const PALETTES: Record<string, Palette> = {
  thriving: { outline: '#14532d', body: '#4ade80', shade: '#16a34a', highlight: '#bbf7d0' },
  neutral: { outline: '#1e3a8a', body: '#60a5fa', shade: '#2563eb', highlight: '#dbeafe' },
  slouching: { outline: '#7c2d12', body: '#fb923c', shade: '#ea580c', highlight: '#fed7aa' },
  wilted: { outline: '#334155', body: '#94a3b8', shade: '#64748b', highlight: '#e2e8f0' },
  calibrating: { outline: '#164e63', body: '#22d3ee', shade: '#0891b2', highlight: '#cffafe' },
  away: { outline: '#334155', body: '#64748b', shade: '#475569', highlight: '#94a3b8' },
};

// Shared accent colours for faces and props
const C = {
  ink: '#0f172a',
  white: '#ffffff',
  cheek: '#f9a8d4',
  mouth: '#e11d48',
  leaf: '#22c55e',
  leafDark: '#15803d',
  stem: '#166534',
  dryLeaf: '#a16207',
  gold: '#facc15',
  sweat: '#7dd3fc',
};

interface BodyShape {
  cx: number; // centre x (grid units)
  cy: number; // centre y
  rx: number; // radius x
  ry: number; // radius y
  ghostHem?: boolean; // wavy ghost-like bottom edge
}

const UPRIGHT: BodyShape = { cx: 10, cy: 10, rx: 8.5, ry: 7.5 };
const SQUASHED: BodyShape = { cx: 10, cy: 13, rx: 9.5, ry: 4.6 };

/** Rasterise an ellipse body with outline, top-left highlight and bottom shading. */
function drawBody(shape: BodyShape, pal: Palette): Map<string, string> {
  const inside = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return false;
    const dx = (x + 0.5 - shape.cx) / shape.rx;
    const dy = (y + 0.5 - shape.cy) / shape.ry;
    if (dx * dx + dy * dy > 1) return false;
    // Ghost hem: notch the bottom two rows every other pair of columns
    if (shape.ghostHem && y >= shape.cy + shape.ry - 2 && Math.floor(x / 2) % 2 === 0) return false;
    return true;
  };

  const px = new Map<string, string>();
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (!inside(x, y)) continue;
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      const nx = (x + 0.5 - shape.cx) / shape.rx;
      const ny = (y + 0.5 - shape.cy) / shape.ry;
      let colour = pal.body;
      if (edge) colour = pal.outline;
      else if (ny > 0.5) colour = pal.shade;
      else if (nx < -0.3 && ny < -0.3) colour = pal.highlight;
      px.set(`${x},${y}`, colour);
    }
  }
  return px;
}

// ---------- Faces & props (upright body: eyes on rows 8-9, mouth rows 11-12) ----------

const EYES_ROUND: Pixel[] = [
  [6, 8, C.white], [7, 8, C.ink], [6, 9, C.ink], [7, 9, C.ink],
  [12, 8, C.white], [13, 8, C.ink], [12, 9, C.ink], [13, 9, C.ink],
];
const EYES_HAPPY: Pixel[] = [
  [5, 9, C.ink], [6, 8, C.ink], [7, 8, C.ink], [8, 9, C.ink],
  [11, 9, C.ink], [12, 8, C.ink], [13, 8, C.ink], [14, 9, C.ink],
];
const EYES_X: Pixel[] = [
  [5, 8, C.ink], [7, 8, C.ink], [6, 9, C.ink], [5, 10, C.ink], [7, 10, C.ink],
  [12, 8, C.ink], [14, 8, C.ink], [13, 9, C.ink], [12, 10, C.ink], [14, 10, C.ink],
];
const EYES_CLOSED: Pixel[] = [[6, 9, C.ink], [7, 9, C.ink], [12, 9, C.ink], [13, 9, C.ink]];
const EYES_SCAN: Pixel[] = [
  [6, 8, C.white], [7, 8, C.white], [6, 9, C.white], [7, 9, C.white],
  [12, 8, C.white], [13, 8, C.white], [12, 9, C.white], [13, 9, C.white],
];

const SMILE: Pixel[] = [[8, 11, C.ink], [9, 12, C.ink], [10, 12, C.ink], [11, 11, C.ink]];
const GRIN: Pixel[] = [
  [8, 11, C.ink], [9, 11, C.ink], [10, 11, C.ink], [11, 11, C.ink],
  [9, 12, C.mouth], [10, 12, C.mouth],
];
const FLAT_MOUTH: Pixel[] = [[9, 12, C.ink], [10, 12, C.ink]];
const CHEEKS: Pixel[] = [[4, 11, C.cheek], [15, 11, C.cheek]];

const SPROUT: Pixel[] = [
  [10, 2, C.stem], [10, 1, C.stem],
  [8, 0, C.leaf], [9, 0, C.leaf], [9, 1, C.leafDark],
  [11, 1, C.leafDark], [11, 0, C.leaf], [12, 0, C.leaf],
];
const SPARKLE: Pixel[] = [[17, 2, C.gold], [16, 3, C.gold], [17, 3, C.white], [18, 3, C.gold], [17, 4, C.gold]];
const HALO: Pixel[] = [
  [8, 0, C.gold], [9, 0, C.gold], [10, 0, C.gold], [11, 0, C.gold],
  [7, 1, C.gold], [12, 1, C.gold],
];
const DRY_SPROUT: Pixel[] = [[10, 2, C.dryLeaf], [11, 2, C.dryLeaf], [12, 3, C.dryLeaf]];
const ZZZ: Pixel[] = [
  [15, 0, C.white], [16, 0, C.white], [17, 0, C.white], [18, 0, C.white],
  [17, 1, C.white], [16, 2, C.white],
  [15, 3, C.white], [16, 3, C.white], [17, 3, C.white], [18, 3, C.white],
];

// ---------- Squashed (slouching) body: eyes rows 11-13, mouth rows 14-15 ----------

const SLOUCH_FACE: Pixel[] = [
  [6, 11, C.ink], [7, 12, C.ink], [6, 13, C.ink], // ">"
  [13, 11, C.ink], [12, 12, C.ink], [13, 13, C.ink], // "<"
  [8, 15, C.ink], [9, 14, C.ink], [10, 15, C.ink], [11, 14, C.ink], // wavy mouth
];
const DROOPY_SPROUT: Pixel[] = [
  [10, 7, C.stem], [9, 6, C.stem],
  [8, 6, C.leafDark], [7, 7, C.leaf],
  [11, 6, C.leafDark], [12, 7, C.leaf],
];
const SWEAT: Pixel[] = [
  [17, 3, C.sweat], [17, 4, C.sweat],
  [16, 5, C.sweat], [17, 5, C.sweat], [18, 5, C.sweat],
  [16, 6, C.white], [17, 6, C.sweat], [18, 6, C.sweat],
  [17, 7, C.sweat],
];

interface SpriteDef {
  palette: Palette;
  shape: BodyShape;
  overlays: Pixel[];
}

const SPRITES: Record<PetState, SpriteDef> = {
  THRIVING: { palette: PALETTES.thriving, shape: UPRIGHT, overlays: [...SPROUT, ...EYES_HAPPY, ...GRIN, ...CHEEKS, ...SPARKLE] },
  NEUTRAL: { palette: PALETTES.neutral, shape: UPRIGHT, overlays: [...SPROUT, ...EYES_ROUND, ...SMILE, ...CHEEKS] },
  SLOUCHING: { palette: PALETTES.slouching, shape: SQUASHED, overlays: [...DROOPY_SPROUT, ...SLOUCH_FACE, ...SWEAT] },
  WILTED: { palette: PALETTES.wilted, shape: { ...UPRIGHT, ghostHem: true }, overlays: [...HALO, ...DRY_SPROUT, ...EYES_X, ...FLAT_MOUTH] },
  CALIBRATING: { palette: PALETTES.calibrating, shape: UPRIGHT, overlays: [...SPROUT, ...EYES_SCAN, ...FLAT_MOUTH] },
  AWAY: { palette: PALETTES.away, shape: UPRIGHT, overlays: [...DRY_SPROUT, ...EYES_CLOSED, ...FLAT_MOUTH, ...ZZZ] },
};

/** Final pixel list for a state: body first, then face/props drawn on top. */
export function buildSprite(state: PetState): Pixel[] {
  const def = SPRITES[state] ?? SPRITES.NEUTRAL;
  const px = drawBody(def.shape, def.palette);
  for (const [x, y, colour] of def.overlays) px.set(`${x},${y}`, colour);
  return [...px.entries()].map(([key, colour]) => {
    const [x, y] = key.split(',').map(Number);
    return [x, y, colour] as Pixel;
  });
}
