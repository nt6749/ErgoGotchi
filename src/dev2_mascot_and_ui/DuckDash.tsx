/**
 * Duck Dash: an endless runner starring your own duck (at its current age, wearing its clothes).
 * Jump over cones, hay bales and crates, and grab the floating corn. Corn collected in a run is
 * added to the pantry when the run ends.
 *
 * Controls: Space / Up arrow / W / click or tap.
 */

import React, { useEffect, useRef, useState } from 'react';
import { dress } from './cosmetics';
import { DUCK, PALETTE } from './duckSprites';
import { BABY, EGG_SPRITES } from './lifeStageSprites';
import type { LifeStage, Outfit } from './progression';
import { BUTTON_PRIMARY, CARD, LABEL, MUTED } from './theme';

/** Most corn a single run can pay out. */
export const MAX_CORN_PER_RUN = 15;

// Logical canvas size; it is scaled to the available width
const W = 640;
const H = 200;
const GROUND = 164;
const DUCK_X = 70;
const SPRITE_PX = 2; // screen pixels per art pixel -> 48x48 duck
const SPRITE_SIZE = 24 * SPRITE_PX;

const JUMP_SPEED = 540; // px/s upwards
const GRAVITY = 1500; // px/s^2
const START_SPEED = 230; // px/s
const MAX_SPEED = 520;
const SPEED_GAIN = 7; // px/s gained per second
const DISTANCE_PER_POINT = 12;

/** Empty rows above each stage's art, so the hitbox matches what is drawn. */
const TOP_GAP: Record<LifeStage, number> = { EGG: 6, BABY: 7, ADULT: 3 };

type ObstacleKind = 'cone' | 'bale' | 'crates';
const OBSTACLE_SIZE: Record<ObstacleKind, { w: number; h: number }> = {
  cone: { w: 20, h: 28 },
  bale: { w: 34, h: 24 },
  crates: { w: 24, h: 42 },
};

interface Obstacle {
  kind: ObstacleKind;
  x: number;
}
interface Corn {
  x: number;
  y: number;
}
interface Game {
  y: number; // duck height above the ground (0 = standing, negative = in the air)
  vy: number;
  speed: number;
  distance: number;
  time: number;
  corn: number;
  obstacles: Obstacle[];
  corns: Corn[];
  nextObstacleIn: number; // px until the next obstacle spawns
  nextCornIn: number; // seconds until the next corn spawns
}

const newGame = (): Game => ({
  y: 0,
  vy: 0,
  speed: START_SPEED,
  distance: 0,
  time: 0,
  corn: 0,
  obstacles: [],
  corns: [],
  nextObstacleIn: 420,
  nextCornIn: 1.2,
});

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const scoreOf = (game: Game) => Math.floor(game.distance / DISTANCE_PER_POINT);

/** Advance the game by `dt` seconds. Returns true if the duck hit something. */
function step(game: Game, dt: number, stage: LifeStage): boolean {
  game.time += dt;
  game.speed = Math.min(MAX_SPEED, START_SPEED + SPEED_GAIN * game.time);
  const dx = game.speed * dt;
  game.distance += dx;

  // Jump physics
  game.vy += GRAVITY * dt;
  game.y = Math.min(0, game.y + game.vy * dt);
  if (game.y === 0) game.vy = 0;

  // Scroll and spawn obstacles; gaps grow with speed so every one stays jumpable
  for (const o of game.obstacles) o.x -= dx;
  game.obstacles = game.obstacles.filter((o) => o.x > -60);
  game.nextObstacleIn -= dx;
  if (game.nextObstacleIn <= 0) {
    const kinds: ObstacleKind[] = game.time < 8 ? ['cone', 'bale'] : ['cone', 'bale', 'crates'];
    game.obstacles.push({ kind: kinds[Math.floor(Math.random() * kinds.length)], x: W + 20 });
    game.nextObstacleIn = game.speed * rand(1.0, 1.9);
  }

  // Scroll and spawn corn: some at ground level, most up where a jump reaches
  for (const c of game.corns) c.x -= dx;
  game.corns = game.corns.filter((c) => c.x > -30);
  game.nextCornIn -= dt;
  if (game.nextCornIn <= 0) {
    game.corns.push({ x: W + 20, y: Math.random() < 0.3 ? GROUND - 22 : GROUND - rand(62, 96) });
    game.nextCornIn = rand(1.1, 2.4);
  }

  // The duck's body, a little smaller than the sprite so near misses feel fair
  const left = DUCK_X + 12;
  const right = DUCK_X + SPRITE_SIZE - 12;
  const bottom = GROUND + game.y - 3;
  const top = GROUND + game.y - SPRITE_SIZE + TOP_GAP[stage] * SPRITE_PX + 5;

  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  game.corns = game.corns.filter((c) => {
    if (Math.abs(c.x - cx) < 26 && Math.abs(c.y - cy) < 30) {
      game.corn += 1;
      return false;
    }
    return true;
  });

  return game.obstacles.some((o) => {
    const { w, h } = OBSTACLE_SIZE[o.kind];
    return o.x + 3 < right && o.x + w - 3 > left && GROUND - h + 3 < bottom;
  });
}

/** Draw a sprite's text grid onto its own small canvas, once, so each frame is a single blit. */
function renderSprite(rows: string[]): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = rows[0].length * SPRITE_PX;
  canvas.height = rows.length * SPRITE_PX;
  const ctx = canvas.getContext('2d')!;
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      ctx.fillStyle = PALETTE[ch];
      ctx.fillRect(x * SPRITE_PX, y * SPRITE_PX, SPRITE_PX, SPRITE_PX);
    })
  );
  return canvas;
}

function drawObstacle(ctx: CanvasRenderingContext2D, o: Obstacle) {
  const { w, h } = OBSTACLE_SIZE[o.kind];
  const x = Math.round(o.x);
  const top = GROUND - h;
  if (o.kind === 'cone') {
    ctx.fillStyle = '#1c1917';
    ctx.fillRect(x, GROUND - 5, w, 5);
    ctx.fillStyle = '#f97316';
    ctx.fillRect(x + 3, GROUND - 12, w - 6, 7);
    ctx.fillRect(x + 6, GROUND - 20, w - 12, 8);
    ctx.fillRect(x + 8, top, w - 16, 8);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 5, GROUND - 15, w - 10, 3);
  } else if (o.kind === 'bale') {
    ctx.fillStyle = '#1c1917';
    ctx.fillRect(x, top, w, h);
    ctx.fillStyle = '#eab308';
    ctx.fillRect(x + 2, top + 2, w - 4, h - 4);
    ctx.fillStyle = '#a16207';
    ctx.fillRect(x + 9, top + 2, 3, h - 4);
    ctx.fillRect(x + w - 12, top + 2, 3, h - 4);
  } else {
    // Two stacked crates
    for (const cy of [top, top + h / 2]) {
      ctx.fillStyle = '#1c1917';
      ctx.fillRect(x, cy, w, h / 2);
      ctx.fillStyle = '#b45309';
      ctx.fillRect(x + 2, cy + 2, w - 4, h / 2 - 4);
      ctx.fillStyle = '#78350f';
      ctx.fillRect(x + 2, cy + h / 4 - 1, w - 4, 2);
    }
  }
}

interface DuckDashProps {
  stage: LifeStage;
  outfit: Outfit;
  /** Best score so far, shown next to the current one. */
  best: number;
  /** Called when a run ends, with the score and the corn it pays out. */
  onFinish: (score: number, corn: number) => void;
}

type Phase = 'READY' | 'RUNNING' | 'OVER';

export const DuckDash: React.FC<DuckDashProps> = ({ stage, outfit, best, onFinish }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<Game>(newGame());
  const phaseRef = useRef<Phase>('READY');
  const [phase, setPhase] = useState<Phase>('READY');
  const [result, setResult] = useState<{ score: number; corn: number } | null>(null);

  // Latest props for the animation loop, which is set up once
  const stageRef = useRef(stage);
  stageRef.current = stage;
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  const bestRef = useRef(best);
  bestRef.current = best;

  // The duck as it looks right now: its age, wearing its clothes
  const spriteRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const base = stage === 'ADULT' ? DUCK : stage === 'BABY' ? BABY : EGG_SPRITES.NEUTRAL[0].rows;
    spriteRef.current = renderSprite(dress(base, stage, outfit));
  }, [stage, outfit]);

  const setGamePhase = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  /** Jump, or start / restart the run. */
  const press = () => {
    const game = gameRef.current;
    if (phaseRef.current === 'RUNNING') {
      if (game.y === 0) game.vy = -JUMP_SPEED;
      return;
    }
    gameRef.current = newGame();
    gameRef.current.vy = -JUMP_SPEED; // the starting press is also the first hop
    setResult(null);
    setGamePhase('RUNNING');
  };

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.code !== 'ArrowUp' && e.code !== 'KeyW') return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault(); // keep Space from scrolling the page or re-clicking a focused button
      if (!e.repeat) press();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.imageSmoothingEnabled = false;

    let frame = 0;
    let last = performance.now();
    let colours = { ink: '#f5f5f4', muted: '#a8a29e', line: '#2b2b2b', accent: '#facc15' };
    let colourAge = 999;

    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000); // a hidden tab must not cause one giant step
      last = now;

      // Follow the theme (light / dark) without reading styles on every frame
      colourAge += dt;
      if (colourAge > 0.5) {
        colourAge = 0;
        const css = getComputedStyle(canvas);
        const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
        colours = {
          ink: v('--ink', colours.ink),
          muted: v('--muted', colours.muted),
          line: v('--line', colours.line),
          accent: v('--accent', colours.accent),
        };
      }

      const game = gameRef.current;
      if (phaseRef.current === 'RUNNING' && step(game, dt, stageRef.current)) {
        const score = scoreOf(game);
        const corn = Math.min(MAX_CORN_PER_RUN, game.corn);
        setResult({ score, corn });
        setGamePhase('OVER');
        onFinishRef.current(score, corn);
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // Ground, with dashes that scroll to show speed
      ctx.fillStyle = colours.muted;
      ctx.fillRect(0, GROUND, W, 2);
      ctx.fillStyle = colours.line;
      const offset = game.distance % 46;
      for (let x = -offset; x < W; x += 46) ctx.fillRect(x, GROUND + 9, 18, 2);
      for (let x = 23 - offset; x < W; x += 46) ctx.fillRect(x, GROUND + 19, 10, 2);

      game.obstacles.forEach((o) => drawObstacle(ctx, o));

      ctx.font = '20px system-ui, "Segoe UI Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const c of game.corns) ctx.fillText('🌽', c.x, c.y);

      // The duck: a small bob while running on the ground
      const sprite = spriteRef.current;
      if (sprite) {
        const bob = phaseRef.current === 'RUNNING' && game.y === 0 && Math.floor(game.time * 9) % 2 ? 1 : 0;
        ctx.drawImage(sprite, DUCK_X, Math.round(GROUND - SPRITE_SIZE + game.y + bob));
      }

      // Score and corn
      ctx.font = 'bold 14px ui-monospace, Consolas, monospace';
      ctx.textBaseline = 'top';
      ctx.fillStyle = colours.ink;
      ctx.textAlign = 'right';
      ctx.fillText(String(scoreOf(game)).padStart(5, '0'), W - 12, 10);
      ctx.fillStyle = colours.muted;
      ctx.fillText(`BEST ${String(Math.max(bestRef.current, scoreOf(game))).padStart(5, '0')}`, W - 70, 10);
      ctx.textAlign = 'left';
      ctx.fillStyle = colours.accent;
      ctx.fillText(`🌽 ${Math.min(MAX_CORN_PER_RUN, game.corn)}`, 12, 10);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className={`${CARD} p-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h3 className="text-sm font-bold">🏃 Duck Dash</h3>
        <span className={`text-[11px] ${MUTED}`}>
          Space / ↑ / click to jump · grab corn, dodge everything else · up to {MAX_CORN_PER_RUN} 🌽 per run
        </span>
      </div>

      <div className="relative rounded-xl border border-[var(--line)] bg-[var(--bg)] overflow-hidden">
        <canvas
          ref={canvasRef}
          onPointerDown={press}
          className="block w-full cursor-pointer"
          style={{ aspectRatio: `${W} / ${H}`, imageRendering: 'pixelated' }}
          aria-label="Duck Dash game"
        />
        {phase !== 'RUNNING' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[var(--bg)]/70 text-center pointer-events-none">
            {result ? (
              <>
                <p className={LABEL}>Game over</p>
                <p className="text-2xl font-black">{result.score} points</p>
                <p className="text-sm font-bold text-[var(--accent)]">
                  {result.corn > 0 ? `+${result.corn} 🌽 added to the pantry` : 'No corn this time'}
                </p>
              </>
            ) : (
              <p className="text-sm font-bold">Ready when you are</p>
            )}
            <button onClick={press} className={`${BUTTON_PRIMARY} pointer-events-auto mt-1`}>
              {result ? 'Play again' : 'Start'} <span className="opacity-70">(Space)</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
