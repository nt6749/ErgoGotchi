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
import { DUCK_SPRITES, DuckFrame, DuckSpriteKey, PALETTE } from './duckSprites';
import { BABY_SPRITES, EGG_SPRITES, HATCH_FRAMES } from './lifeStageSprites';
import { ADULT_ACTIVITY, ActivityPose, BABY_ACTIVITY, WATCHING_X_OFFSET } from './activitySprites';
import { dress, outfitKey } from './cosmetics';
import type { CosmeticSlot, LifeStage, Outfit } from './progression';

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

/** What the user is doing on their computer, as reported by the Electron shell. */
export type ActivityScene = 'IDLE' | 'WATCHING' | 'WORKING';
export interface Activity {
  scene: ActivityScene;
  music: boolean;
}

/** Manual override of the activity pose (presenter controls); AUTO follows the real foreground app. */
export type ForcedActivity = 'AUTO' | 'WATCHING' | 'MUSIC' | 'WORKING' | 'NONE';

/** Everything about the pet's look that is not posture: how grown it is and what it is doing. */
export interface MascotLook {
  stage: LifeStage;
  activity: Activity;
  /** True while the egg-to-baby hatching animation should play. */
  hatching: boolean;
  /** Clothes being worn (ignored for the egg). */
  outfit?: Outfit;
}

export const DEFAULT_LOOK: MascotLook = {
  stage: 'ADULT',
  activity: { scene: 'IDLE', music: false },
  hatching: false,
};

const STAGE_SPRITES: Record<LifeStage, Record<DuckSpriteKey, DuckFrame[]>> = {
  EGG: EGG_SPRITES,
  BABY: BABY_SPRITES,
  ADULT: DUCK_SPRITES,
};

/** The activity pose for what the user is doing, or null for the plain pet. */
export function pickActivityPose(activity: Activity): ActivityPose | null {
  if (activity.scene === 'WATCHING') return 'WATCHING';
  if (activity.scene === 'WORKING') return activity.music ? 'WORKING_MUSIC' : 'WORKING';
  return activity.music ? 'MUSIC' : null;
}

/**
 * Frames to draw, plus a name for them.
 * Posture always wins: activity poses only replace the content looks (NEUTRAL / THRIVING),
 * so a slouching, tired or wilted pet still warns the user. The egg has no activity poses.
 */
export function pickFrames(
  state: PetState,
  hp: number,
  emote: PetEmote | null,
  look: MascotLook
): { key: string; frames: DuckFrame[]; sprite: DuckSpriteKey; pose: ActivityPose | null } {
  const sprite = pickDuckSprite(state, hp, emote);
  if (look.hatching) return { key: 'HATCH', frames: HATCH_FRAMES, sprite, pose: null };

  const content = sprite === 'NEUTRAL' || sprite === 'THRIVING';
  const pose = content && look.stage !== 'EGG' ? pickActivityPose(look.activity) : null;
  const key = `${look.stage}:${pose ?? sprite}`;
  const bare = pose
    ? (look.stage === 'BABY' ? BABY_ACTIVITY : ADULT_ACTIVITY)[pose]
    : STAGE_SPRITES[look.stage][sprite] ?? STAGE_SPRITES[look.stage].NEUTRAL;
  return { key, frames: dressFrames(key, bare, look.stage, sprite, pose, look.outfit), sprite, pose };
}

/** Dressed frames are cached, so the same array comes back each render and animations keep their place. */
const dressedCache = new Map<string, DuckFrame[]>();

function dressFrames(
  key: string,
  frames: DuckFrame[],
  stage: LifeStage,
  sprite: DuckSpriteKey,
  pose: ActivityPose | null,
  outfit: Outfit | undefined
): DuckFrame[] {
  if (!outfit || stage === 'EGG' || !Object.keys(outfit).length) return frames;
  // The grown duck's slouched and flopped bodies are different shapes: clothes wouldn't line up
  if (stage === 'ADULT' && !pose && (sprite === 'SLOUCHING' || sprite === 'WILTED')) return frames;

  const cacheKey = `${key}|${outfitKey(outfit)}`;
  let dressed = dressedCache.get(cacheKey);
  if (!dressed) {
    // Don't draw sunglasses over the work glasses or the calibration visor
    const skip: CosmeticSlot[] =
      pose === 'WORKING' || pose === 'WORKING_MUSIC' || sprite === 'CALIBRATING' ? ['face'] : [];
    const xOffset = pose === 'WATCHING' ? WATCHING_X_OFFSET : 0;
    dressed = frames.map((f) => ({ ...f, rows: dress(f.rows, stage, outfit, xOffset, skip) }));
    dressedCache.set(cacheKey, dressed);
  }
  return dressed;
}

/** Which duck sprite to show for a pet state, HP and active emote. */
export function pickDuckSprite(state: PetState, hp: number, emote: PetEmote | null): DuckSpriteKey {
  if (emote === 'KNIFE' && state !== 'WILTED') return 'KNIFE';
  if (state === 'NEUTRAL' && hp < TIRED_HP) return 'TIRED';
  return state;
}

/** Draws one still sprite (used for small previews such as the wardrobe). */
export const PixelArt: React.FC<{ rows: string[]; scale?: number }> = ({ rows, scale = DUCK_SCALE }) => (
  <svg
    width={rows[0].length * scale}
    height={rows.length * scale}
    viewBox={`0 0 ${rows[0].length} ${rows.length}`}
    shapeRendering="crispEdges"
  >
    {rows.flatMap((row, y) =>
      [...row].map((ch, x) =>
        ch === '.' ? null : <rect key={`${x},${y}`} x={x} y={y} width={1} height={1} fill={PALETTE[ch]} />
      )
    )}
  </svg>
);

/** Plays a sprite's frames on a loop (single-frame sprites stay still). */
const DuckSprite: React.FC<{ name: string; frames: DuckFrame[] }> = ({ name, frames }) => {
  const [frameIdx, setFrameIdx] = useState(0);

  useEffect(() => {
    setFrameIdx(0);
  }, [name]);

  useEffect(() => {
    if (frames.length < 2) return;
    const current = frames[frameIdx % frames.length];
    const timer = setTimeout(() => setFrameIdx((i) => (i + 1) % frames.length), current.ms);
    return () => clearTimeout(timer);
  }, [frames, frameIdx]);

  // Sprites are usually 24x24, but some (the TV scene) are wider
  const rows = frames[frameIdx % frames.length].rows;
  const width = rows[0].length;
  const height = rows.length;
  return (
    <svg
      width={width * DUCK_SCALE}
      height={height * DUCK_SCALE}
      viewBox={`0 0 ${width} ${height}`}
      shapeRendering="crispEdges"
      aria-label={name}
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

export function renderPixelMascot(
  state: PetState,
  hp: number,
  emote: PetEmote | null,
  look: MascotLook = DEFAULT_LOOK
) {
  let art: React.ReactNode;
  let motion = '';

  if (MASCOT_STYLE === 'duck') {
    const { key, frames, sprite, pose } = pickFrames(state, hp, emote, look);
    art = <DuckSprite name={key} frames={frames} />;
    if (look.hatching) motion = 'animate-hatch-shake';
    else if (sprite === 'KNIFE') motion = 'animate-knife-shake';
    else if (sprite === 'SLOUCHING') motion = look.stage === 'EGG' ? 'animate-knife-shake' : 'animate-lazy-wobble';
    else if (pose === 'MUSIC' || pose === 'WORKING_MUSIC') motion = 'animate-head-bob';
    else if (look.stage === 'EGG' && (sprite === 'NEUTRAL' || sprite === 'THRIVING' || sprite === 'TIRED')) {
      motion = 'animate-egg-wobble';
    }
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
