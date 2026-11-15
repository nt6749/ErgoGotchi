/**
 * Renders the pixel-art mascot as crisp SVG squares (no blurring at any scale).
 *
 * Using your own pixel art instead: drop transparent PNGs/GIFs into public/mascot/
 * and list them in CUSTOM_SPRITE_IMAGES, e.g. THRIVING: '/mascot/thriving.png'.
 * Any state left out keeps the built-in sprite.
 */

import React from 'react';
import type { PetState } from '../types';
import { buildSprite, GRID_H, GRID_W } from './pixelSprites';

/** Set to false to switch back to the original smooth SVG blob. */
export const USE_PIXEL_MASCOT = true;

/** Screen pixels per art pixel (20x18 grid x 4 = 80x72 on screen). */
const SCALE = 4;

const CUSTOM_SPRITE_IMAGES: Partial<Record<PetState, string>> = {
  // THRIVING: '/mascot/thriving.png',
};

const ANIMATION: Record<PetState, string> = {
  THRIVING: 'animate-bounce-slow',
  NEUTRAL: 'animate-pulse-subtle',
  SLOUCHING: 'animate-wobble',
  WILTED: 'opacity-80',
  CALIBRATING: '',
  AWAY: 'opacity-70',
};

export function renderPixelMascot(state: PetState) {
  const width = GRID_W * SCALE;
  const height = GRID_H * SCALE;
  const custom = CUSTOM_SPRITE_IMAGES[state];

  const art = custom ? (
    <img
      src={custom}
      width={width}
      height={height}
      alt={state}
      draggable={false}
      style={{ imageRendering: 'pixelated', objectFit: 'contain' }}
    />
  ) : (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${GRID_W} ${GRID_H}`}
      shapeRendering="crispEdges"
      aria-label={state}
    >
      {buildSprite(state).map(([x, y, colour]) => (
        <rect key={`${x},${y}`} x={x} y={y} width={1} height={1} fill={colour} />
      ))}
    </svg>
  );

  return (
    <div className={`relative flex flex-col items-center ${ANIMATION[state] ?? ''}`}>
      {art}
      {state === 'CALIBRATING' && (
        <span className="text-[10px] font-mono font-bold text-cyan-300 mt-1 animate-pulse">CALIBRATING</span>
      )}
    </div>
  );
}
