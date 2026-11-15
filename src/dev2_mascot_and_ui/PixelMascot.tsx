/**
 * Pixel-art mascot renderer.
 *
 * MASCOT_STYLE picks the character:
 *   'duck'   - pixel duck (duckSprites.ts), static, with knife / tired emotes
 *   'sprout' - pixel sprout blob (pixelSprites.ts)
 *   'blob'   - the original smooth SVG blob in MascotSprite.tsx
 */

import React, { useEffect, useState } from 'react';
import type { PetState } from '../types';
import { buildSprite, GRID_H, GRID_W } from './pixelSprites';
import { DUCK_H, DUCK_SPRITES, DUCK_W, DuckSpriteKey, PALETTE } from './duckSprites';

export type MascotStyle = 'duck' | 'sprout' | 'blob';
export const MASCOT_STYLE = 'duck' as MascotStyle;

/** Kept for MascotSprite: true unless the original SVG blob is selected. */
export const USE_PIXEL_MASCOT = MASCOT_STYLE !== 'blob';

/** The duck stays put; the older mascots wander along the bottom of the window. */
export const PET_WALKS = MASCOT_STYLE !== 'duck';

/** Emotes temporarily override the pet's normal look. */
export type PetEmote = 'KNIFE';

/** Below this HP the duck looks tired (unless it is slouching, wilted, etc.). */
const TIRED_HP = 50;

/** Screen pixels per art pixel. */
const DUCK_SCALE = 4; // 24x24 -> 96x96
const SPROUT_SCALE = 4; // 20x18 -> 80x72

/** Which duck sprite to show for a pet state, HP and active emote. */
export function pickDuckSprite(state: PetState, hp: number, emote: PetEmote | null): DuckSpriteKey {
  if (emote === 'KNIFE' && state !== 'WILTED') return 'KNIFE';
  if (state === 'NEUTRAL' && hp < TIRED_HP) return 'TIRED';
  return state;
}

/** Plays a duck sprite's frames on a loop (single-frame sprites stay still). */
const DuckSprite: React.FC<{ sprite: DuckSpriteKey }> = ({ sprite }) => {
  const frames = DUCK_SPRITES[sprite] ?? DUCK_SPRITES.NEUTRAL;
  const [frameIdx, setFrameIdx] = useState(0);

  useEffect(() => {
    setFrameIdx(0);
  }, [sprite]);

  useEffect(() => {
    if (frames.length < 2) return;
    const current = frames[frameIdx % frames.length];
    const timer = setTimeout(() => setFrameIdx((i) => (i + 1) % frames.length), current.ms);
    return () => clearTimeout(timer);
  }, [frames, frameIdx]);

  const rows = frames[frameIdx % frames.length].rows;
  return (
    <svg
      width={DUCK_W * DUCK_SCALE}
      height={DUCK_H * DUCK_SCALE}
      viewBox={`0 0 ${DUCK_W} ${DUCK_H}`}
      shapeRendering="crispEdges"
      aria-label={sprite}
    >
      {rows.flatMap((row, y) =>
        [...row].map((ch, x) =>
          ch === '.' ? null : <rect key={`${x},${y}`} x={x} y={y} width={1} height={1} fill={PALETTE[ch]} />
        )
      )}
    </svg>
  );
};

const SPROUT_ANIMATION: Record<PetState, string> = {
  THRIVING: 'animate-bounce-slow',
  NEUTRAL: 'animate-pulse-subtle',
  SLOUCHING: 'animate-wobble',
  WILTED: 'opacity-80',
  CALIBRATING: '',
  AWAY: 'opacity-70',
};

export function renderPixelMascot(state: PetState, hp: number, emote: PetEmote | null) {
  let art: React.ReactNode;
  let motion = '';

  if (MASCOT_STYLE === 'duck') {
    const sprite = pickDuckSprite(state, hp, emote);
    art = <DuckSprite sprite={sprite} />;
    if (sprite === 'KNIFE') motion = 'animate-knife-shake';
    else if (sprite === 'SLOUCHING') motion = 'animate-lazy-wobble';
  } else {
    art = (
      <svg
        width={GRID_W * SPROUT_SCALE}
        height={GRID_H * SPROUT_SCALE}
        viewBox={`0 0 ${GRID_W} ${GRID_H}`}
        shapeRendering="crispEdges"
        aria-label={state}
      >
        {buildSprite(state).map(([x, y, colour]) => (
          <rect key={`${x},${y}`} x={x} y={y} width={1} height={1} fill={colour} />
        ))}
      </svg>
    );
    motion = SPROUT_ANIMATION[state] ?? '';
  }

  return (
    <div className={`relative flex flex-col items-center ${motion}`}>
      {art}
      {state === 'CALIBRATING' && (
        <span className="text-[10px] font-mono font-bold text-cyan-300 mt-1 animate-pulse">CALIBRATING</span>
      )}
    </div>
  );
}
