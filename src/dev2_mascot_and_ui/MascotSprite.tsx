/**
 * Expressive Mascot Sprite Engine for ErgoGotchi ("Bobi the Posture Blob").
 * Renders state-driven CSS/SVG animations with dynamic physics, speech bubble, and interaction.
 */

import React, { useState, useEffect, useRef } from 'react';
import { PetState, StretchCue } from '../types';
import { soundEffects } from './soundEffects';
import { Activity, DEFAULT_LOOK, PET_WALKS, PetEmote, renderPixelMascot, USE_PIXEL_MASCOT } from './PixelMascot';
import { HATCH_MS } from './lifeStageSprites';
import { ADULT_LEVEL, canFeed, cornNeeded, NEW_PET, stageOf, STAGE_TITLES, type LifeStage, type PetProfile } from './progression';
import { DEFAULT_SKIN, EGG_SHELL_SKINS, type EggShellSkin } from './eggShellSkins';

/** Shown when no pet profile is passed in: a plain grown duck. */
const GROWN_UP: PetProfile = { ...NEW_PET, level: ADULT_LEVEL };
/** Level-up sparks fly out in these directions (px). */
const SPARK_DIRECTIONS = [
  [0, -46], [34, -34], [48, 0], [34, 30], [0, 40], [-34, 30], [-48, 0], [-34, -34],
];
/** Corn flies into the pet from these offsets (px) when it is fed. */
const FEED_CORN_FROM = [
  [-46, -40], [0, -56], [46, -40], [-30, -62], [30, -62],
];

/**
 * The Electron pet window ignores the mouse (clicks fall through to the desktop) except while
 * the pointer is over the pet or its speech bubble.
 */
const electronAPI: any = (window as any).electronAPI;
const captureMouse = {
  onMouseEnter: () => electronAPI?.setIgnoreMouse?.(false),
  onMouseLeave: () => electronAPI?.setIgnoreMouse?.(true),
};

interface MascotSpriteProps {
  state: PetState;
  hp: number;
  isReviving: boolean;
  speechText: string | null;
  speechCue: StretchCue | null;
  emote?: PetEmote | null;
  /** The pet's profile: name, level, corn and clothes. Omit for a plain grown duck. */
  pet?: PetProfile;
  /** Feed the pet (spends corn). Returns true if it ate, false if there wasn't enough corn. */
  onFeed?: () => boolean;
  /** What the user is doing on their computer (TV / music / work). */
  activity?: Activity;
  onDismissSpeech: () => void;
  onOpenDashboard: () => void;
  onRecalibrate: () => void;
  /** Position lock mode: if false, user can drag the egg machine across screen */
  isLocked?: boolean;
  onToggleLock?: (locked: boolean) => void;
  /** Calibration state to show inside the machine screen */
  isCalibrating?: boolean;
  calibrationProgress?: number;
  /** Active egg shell skin */
  skin?: EggShellSkin;
}

export const MascotSprite: React.FC<MascotSpriteProps> = ({
  state,
  hp,
  isReviving,
  speechText,
  speechCue,
  emote = null,
  pet,
  onFeed,
  activity = DEFAULT_LOOK.activity,
  onDismissSpeech,
  onOpenDashboard,
  onRecalibrate,
  isLocked = true,
  onToggleLock,
  isCalibrating = false,
  calibrationProgress = 0,
  skin = DEFAULT_SKIN,
}) => {
  const skinConfig = EGG_SHELL_SKINS[skin] || EGG_SHELL_SKINS[DEFAULT_SKIN];
  const [isPetting, setIsPetting] = useState(false);
  const [hovered, setHovered] = useState(false);
  // Hearts burst when petted
  const [hearts, setHearts] = useState<Array<{ id: number; x: number; y: number; size: number; emoji: string; angle: number }>>([]);
  // Feeding feedback: a burst of corn flying in, or a "not enough" shake
  const [feedBurst, setFeedBurst] = useState<number | null>(null);
  const [refused, setRefused] = useState(false);
  const [typedText, setTypedText] = useState('');
  const [posX, setPosX] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);

  // Dragging support (when !isLocked)
  const [isDragging, setIsDragging] = useState(false);
  const [browserOffset, setBrowserOffset] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; winX: number; winY: number; elX: number; elY: number } | null>(null);

  const bubbleTimerRef = useRef<any>(null);

  // ---- Growth: level-up, hatching and corn feedback
  const profile = pet ?? GROWN_UP;
  const stage = stageOf(profile);
  // The stage being drawn lags behind the real one while a hatch / evolve animation plays
  const [shownStage, setShownStage] = useState<LifeStage>(stage);
  const [hatching, setHatching] = useState(false);
  const [flashing, setFlashing] = useState(false);
  const [banner, setBanner] = useState<{ id: number; text: string } | null>(null);
  const [cornPops, setCornPops] = useState<Array<{ id: number; amount: number }>>([]);
  const prevGrowthRef = useRef({ level: profile.level, stage, earned: profile.cornEarned });
  const growthTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const later = (fn: () => void, ms: number) => {
    growthTimersRef.current.push(setTimeout(fn, ms));
  };
  useEffect(() => () => growthTimersRef.current.forEach(clearTimeout), []);
  // Steps of the hatch / evolve animation in progress, cancelled if the level changes again mid-way
  const stageTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const stageLater = (fn: () => void, ms: number) => {
    stageTimersRef.current.push(setTimeout(fn, ms));
  };
  const cancelStageAnimation = () => {
    stageTimersRef.current.forEach(clearTimeout);
    stageTimersRef.current = [];
    setHatching(false);
    setFlashing(false);
  };
  useEffect(() => () => stageTimersRef.current.forEach(clearTimeout), []);

  useEffect(() => {
    const prev = prevGrowthRef.current;
    const { level, cornEarned } = profile;
    prevGrowthRef.current = { level, stage, earned: cornEarned };

    // Floating "+1 corn" each time sitting upright pays out
    const earned = cornEarned - prev.earned;
    if (earned > 0) {
      const pop = { id: Date.now() + Math.random(), amount: earned };
      setCornPops((pops) => [...pops, pop]);
      later(() => setCornPops((pops) => pops.filter((p) => p.id !== pop.id)), 1400);
    }

    if (level < prev.level) {
      // Went back a level or started over: snap straight to the new stage, no fanfare
      cancelStageAnimation();
      setShownStage(stage);
      return;
    }

    if (level > prev.level) {
      const id = Date.now();
      cancelStageAnimation();
      if (prev.stage === 'EGG' && stage !== 'EGG') {
        // Egg -> baby: play the hatching frames, then switch to the new stage
        setBanner({ id, text: 'It hatched!' });
        setHatching(true);
        soundEffects.playHatch();
        stageLater(() => {
          setHatching(false);
          setShownStage(stage);
        }, HATCH_MS);
      } else {
        setBanner({ id, text: stage !== prev.stage ? 'All grown up!' : `Level up!  Lv ${level}` });
        setFlashing(true);
        soundEffects.playLevelUp();
        // Swap the sprite in the middle of the flash so the change is hidden by it
        stageLater(() => setShownStage(stage), 650);
        stageLater(() => setFlashing(false), 1400);
      }
      later(() => setBanner((b) => (b && b.id === id ? null : b)), 2600);
    }
  }, [profile.level, profile.cornEarned]);

  const need = cornNeeded(profile);
  const enoughCorn = canFeed(profile);

  const look = { stage: shownStage, activity, hatching, outfit: profile.equipped };

  // The parent passes a new callback on every render (25x/sec with a live camera).
  // Read it through a ref so the typewriter below only restarts when the text changes.
  const onDismissSpeechRef = useRef(onDismissSpeech);
  onDismissSpeechRef.current = onDismissSpeech;

  // Typewriter effect for speech bubbles
  useEffect(() => {
    if (!speechText) {
      setTypedText('');
      return;
    }

    soundEffects.playWarning();
    let idx = 0;
    setTypedText('');

    const interval = setInterval(() => {
      idx++;
      setTypedText(speechText.substring(0, idx));
      if (idx >= speechText.length) {
        clearInterval(interval);
      }
    }, 25);

    // Auto-dismiss after 8 seconds
    if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
    bubbleTimerRef.current = setTimeout(() => {
      onDismissSpeechRef.current();
    }, 8000);

    return () => {
      clearInterval(interval);
      if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
    };
  }, [speechText]);

  // Audio trigger on state changes
  useEffect(() => {
    if (isReviving) {
      soundEffects.playRevive();
    } else if (state === 'SLOUCHING') {
      soundEffects.playSlouchMelt();
    }
  }, [state, isReviving]);

  // Soft walking wandering along taskbar when Thriving/Neutral
  useEffect(() => {
    if (!PET_WALKS) return;
    if (state === 'SLOUCHING' || state === 'WILTED' || state === 'CALIBRATING' || state === 'AWAY') {
      return;
    }

    const walkInterval = setInterval(() => {
      setPosX((prev) => {
        const next = prev + direction * 1.5;
        if (next > 40) setDirection(-1);
        if (next < -40) setDirection(1);
        return next;
      });
    }, 100);

    return () => clearInterval(walkInterval);
  }, [state, direction]);

  // Clicking the duck or Button A: Pets the duck! Hearts pop out and sweet chime plays.
  const handlePet = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    soundEffects.playPet();
    setIsPetting(true);
    later(() => setIsPetting(false), 700);

    const emojis = ['💖', '💕', '❤️', '✨', '🌸', '🥰'];
    const newHearts = Array.from({ length: 6 }).map((_, i) => ({
      id: Date.now() + i + Math.random(),
      x: (Math.random() - 0.5) * 50,
      y: -15 - Math.random() * 35,
      size: 13 + Math.floor(Math.random() * 9),
      emoji: emojis[Math.floor(Math.random() * emojis.length)],
      angle: (Math.random() - 0.5) * 35,
    }));
    setHearts((prev) => [...prev, ...newHearts]);
    later(() => {
      setHearts((prev) => prev.filter((h) => !newHearts.some((nh) => nh.id === h.id)));
    }, 1100);
  };

  // Feeding the pet: eaten corn spends corn to level up, or refuses if not enough
  const handleFeed = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!onFeed) return;
    if (onFeed()) {
      const id = Date.now();
      setIsPetting(true);
      setFeedBurst(id);
      soundEffects.playEat();
      later(() => setIsPetting(false), 600);
      later(() => setFeedBurst((b) => (b === id ? null : b)), 700);
    } else {
      setRefused(true);
      soundEffects.playRefuse();
      later(() => setRefused(false), 450);
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (isLocked) return;
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input')) return;

    e.preventDefault();
    setIsDragging(true);
    isDraggingRef.current = true;
    electronAPI?.setIgnoreMouse?.(false);

    let lastX = e.screenX;
    let lastY = e.screenY;

    const onPointerMove = (moveEv: PointerEvent) => {
      const dx = moveEv.screenX - lastX;
      const dy = moveEv.screenY - lastY;
      lastX = moveEv.screenX;
      lastY = moveEv.screenY;

      if (dx === 0 && dy === 0) return;

      if (electronAPI?.isElectron && (electronAPI as any).movePetBy) {
        (electronAPI as any).movePetBy(dx, dy);
      } else {
        setBrowserOffset((prev) => ({
          x: prev.x + dx,
          y: prev.y + dy,
        }));
      }
    };

    const onPointerUp = () => {
      setIsDragging(false);
      isDraggingRef.current = false;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const captureMouseHandlers = {
    onMouseEnter: () => {
      electronAPI?.setIgnoreMouse?.(false);
      setHovered(true);
    },
    onMouseLeave: () => {
      setHovered(false);
      if (!isDraggingRef.current) {
        electronAPI?.setIgnoreMouse?.(true);
      }
    },
  };

  return (
    <div 
      className="relative flex flex-col items-center justify-end select-none"
      style={{
        width: '260px',
        minHeight: speechText ? '390px' : '310px',
        transform: electronAPI?.isElectron ? undefined : `translate(${browserOffset.x}px, ${browserOffset.y}px)`,
      }}
    >
      {/* Dynamic Comic Speech Bubble (Positioned outside & above the egg machine) */}
      {speechText && (
        <div
          {...captureMouseHandlers}
          className="animate-bounce-in mb-3 w-56 bg-white text-black p-3 rounded-2xl border-2 border-black shadow-[4px_4px_0_0_#000] relative z-50 text-left"
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          <button
            onClick={onDismissSpeech}
            className="absolute -top-2 -right-2 bg-yellow-400 hover:bg-yellow-300 text-black font-black rounded-full w-5 h-5 flex items-center justify-center text-xs border-2 border-black cursor-pointer shadow-sm"
            title="Dismiss"
          >
            ×
          </button>
          
          {speechCue && speechCue !== 'NONE' && (
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-yellow-400 text-black border border-black uppercase tracking-wider">
                {speechCue.replace('_', ' ')}
              </span>
            </div>
          )}

          <p className="text-[11px] font-bold leading-snug text-black">
            {typedText}
          </p>

          {/* Bubble tail arrow */}
          <div className="absolute -bottom-[8px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-black" />
        </div>
      )}

      {/* Sparks and level banner (Outside the egg shell) */}
      {banner && (
        <div key={banner.id} className="absolute top-10 left-1/2 -translate-x-1/2 pointer-events-none z-50 flex flex-col items-center">
          {SPARK_DIRECTIONS.map(([dx, dy], i) => (
            <span
              key={i}
              className="absolute left-1/2 top-1/2 text-amber-400 text-base animate-level-spark"
              style={{ ['--dx' as any]: `${dx * 1.5}px`, ['--dy' as any]: `${dy * 1.5}px` }}
            >
              ✦
            </span>
          ))}
          <div className="animate-level-banner whitespace-nowrap px-3 py-1 rounded-full bg-yellow-400 text-black text-xs font-black uppercase tracking-wide border-2 border-black shadow-[3px_3px_0_0_#000]">
            {banner.text}
          </div>
        </div>
      )}

      {/* Floating Corn Pops: Popping OUT of the egg machine */}
      {cornPops.map((pop) => (
        <span
          key={pop.id}
          className="absolute top-14 right-2 pointer-events-none z-50 text-xs font-black text-black animate-xp-float whitespace-nowrap px-2.5 py-0.5 rounded-full bg-yellow-400 border-2 border-black shadow-[2px_2px_0_0_#000]"
        >
          +{pop.amount} 🌽
        </span>
      ))}

      {/* Floating Hearts: Bursting OUT of the egg machine into the air */}
      {hearts.map((h) => (
        <span
          key={h.id}
          className="absolute left-1/2 top-48 pointer-events-none z-50 select-none animate-heart-float"
          style={{
            '--hx': `${h.x * 1.8}px`,
            '--hy': `${h.y * 2.2}px`,
            '--hrot': `${h.angle}deg`,
            fontSize: `${h.size + 6}px`,
          } as any}
        >
          {h.emoji}
        </span>
      ))}

      {/* Outer Layer: Egg Machine Shell based on Vintage Photos */}
      <div
        {...captureMouseHandlers}
        onPointerDown={handlePointerDown}
        className={`relative w-[236px] rounded-[50%_50%_44%_44%_/_58%_58%_42%_42%] p-3.5 border-4 ${skinConfig.shellBorder} shadow-[4px_6px_0_0_#000] flex flex-col items-center justify-between text-black transition-all overflow-hidden ${
          isLocked ? '' : 'cursor-grab active:cursor-grabbing ring-2 ring-amber-400/80 ring-offset-2'
        }`}
        style={{
          minHeight: '292px',
          background: skinConfig.shellGradient,
          WebkitAppRegion: 'no-drag',
        } as any}
      >
        {/* Realistic Ball Chain Keychain at Top */}
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none z-30">
          <div className="flex flex-col items-center -space-y-0.5 mb-0.5">
            <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-slate-100 via-slate-300 to-slate-500 border border-slate-700 shadow-[0_1px_1px_rgba(0,0,0,0.5)]" />
            <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-slate-100 via-slate-300 to-slate-500 border border-slate-700 shadow-[0_1px_1px_rgba(0,0,0,0.5)]" />
          </div>
          <div className="w-5 h-3.5 rounded-t-full border-2 border-black/80 bg-white/50 backdrop-blur-sm flex items-center justify-center shadow-sm">
            <div className="w-2 h-2 rounded-full border border-black/80 bg-neutral-900" />
          </div>
        </div>

        {/* Specular Highlight / Gloss on Shell */}
        <div className="absolute top-3 left-6 w-16 h-7 rounded-[50%] bg-white/30 rotate-[-28deg] pointer-events-none z-10" />

        {/* --- Skin Specific Shell Background Decorations --- */}
        {skin === 'cosmic' && (
          <>
            {/* Crescent Moon on Left */}
            <div className="absolute top-14 left-2.5 pointer-events-none select-none text-yellow-300 drop-shadow-[0_0_5px_rgba(253,224,71,0.9)] opacity-90 z-0">
              <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                <path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.79c-.44-.06-.9-.1-1.36-.1z" />
              </svg>
            </div>
            {/* Constellation Stars */}
            <div className="absolute top-9 right-4 pointer-events-none select-none text-yellow-200 text-xs z-0">✦</div>
            <div className="absolute top-16 right-2 pointer-events-none select-none text-yellow-300 text-sm z-0">★</div>
            <div className="absolute bottom-20 left-3 pointer-events-none select-none text-yellow-200 text-xs z-0">✦</div>
            <div className="absolute bottom-16 right-3 pointer-events-none select-none text-yellow-300 text-xs z-0">★</div>
            <div className="absolute top-28 left-1 pointer-events-none select-none text-yellow-100 text-[10px] z-0">⋆</div>
          </>
        )}

        {skin === 'pastel' && (
          <div className="absolute inset-0 overflow-hidden rounded-[50%_50%_44%_44%_/_58%_58%_42%_42%] pointer-events-none opacity-50 z-0">
            <div className="absolute -top-12 -left-12 w-52 h-52 rounded-full border-[14px] border-yellow-200/70" />
            <div className="absolute -top-9 -left-9 w-52 h-52 rounded-full border-[12px] border-purple-300/60" />
            <div className="absolute -top-6 -left-6 w-52 h-52 rounded-full border-[10px] border-sky-300/60" />
            <div className="absolute bottom-14 -left-4 w-20 h-10 rounded-full bg-white/40 blur-[1px]" />
            <div className="absolute top-12 -right-4 w-16 h-8 rounded-full bg-white/40 blur-[1px]" />
          </div>
        )}

        {skin === 'avocado' && (
          <>
            {/* Floating Avocado Halves */}
            <div className="absolute top-10 left-3 pointer-events-none select-none flex items-center justify-center z-0">
              <div className="w-5 h-6 rounded-[50%_50%_45%_45%_/_60%_60%_40%_40%] bg-emerald-200 border border-emerald-700 flex items-center justify-center shadow-sm">
                <div className="w-2.5 h-2.5 rounded-full bg-amber-800" />
              </div>
            </div>
            <div className="absolute top-12 right-3 pointer-events-none select-none flex items-center justify-center z-0">
              <div className="w-5 h-6 rounded-[50%_50%_45%_45%_/_60%_60%_40%_40%] bg-emerald-200 border border-emerald-700 flex items-center justify-center shadow-sm">
                <div className="w-2.5 h-2.5 rounded-full bg-amber-800" />
              </div>
            </div>
            {/* Gingham Checkered Bottom Banner */}
            <div
              className="absolute bottom-0 left-0 right-0 h-16 rounded-b-[42px] border-t-2 border-emerald-600/40 pointer-events-none opacity-40 z-0"
              style={{
                backgroundImage: `
                  linear-gradient(45deg, rgba(255,255,255,0.7) 25%, transparent 25%), 
                  linear-gradient(-45deg, rgba(255,255,255,0.7) 25%, transparent 25%), 
                  linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.7) 75%), 
                  linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.7) 75%)
                `,
                backgroundSize: '16px 16px',
                backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
                backgroundColor: '#bbf7d0',
              }}
            />
          </>
        )}

        {/* Iconic Arched ErGoGotCHi Logo */}
        <div
          className="w-full flex items-center justify-center pt-0.5 pb-0.5 z-10 select-none"
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          <span
            className="text-[15px] font-black tracking-wide font-sans transform -rotate-1"
            style={{
              color: skinConfig.logoColor,
              textShadow: skinConfig.logoShadow,
            }}
          >
            ErGoGotCHi<span className="text-[8px] align-super">®</span>
          </span>
        </div>

        {/* Authentic Starburst Bezel from Photos */}
        <div
          className="relative p-3 my-0.5 flex items-center justify-center z-10"
          style={{
            background: skinConfig.starBurstBg,
            boxShadow: skinConfig.starBurstShadow,
            clipPath: 'polygon(18% 0%, 50% 7%, 82% 0%, 93% 18%, 100% 50%, 93% 82%, 82% 100%, 50% 93%, 18% 100%, 7% 82%, 0% 50%, 7% 18%)',
            WebkitAppRegion: 'no-drag',
          } as any}
        >
          {/* LCD Screen Glass with 8 Classic Icons */}
          <div
            className="w-[172px] h-[130px] rounded-xl border-2 relative overflow-hidden flex flex-col items-center justify-between p-1 shadow-inner cursor-pointer"
            style={{
              background: skinConfig.lcdBg,
              borderColor: skinConfig.lcdBorder,
              color: skinConfig.lcdTextColor,
            }}
            onClick={handlePet}
            onDoubleClick={onOpenDashboard}
            onContextMenu={(e) => {
              if ((window as any).electronAPI?.isElectron) return;
              e.preventDefault();
              onRecalibrate();
            }}
            title="Click Duck to Pet 💖 | Double-click for Dashboard"
          >
            {/* Top 4 Classic LCD Icons */}
            <div className="flex items-center justify-between w-full px-2 pt-0.5 text-[9px] font-mono select-none opacity-70">
              <span className={hovered ? 'scale-125 font-black text-amber-900' : ''} title="Food">🍴</span>
              <span title="Light">💡</span>
              <span title="Game">⚾</span>
              <span className={state === 'SLOUCHING' || state === 'WILTED' ? 'scale-125 text-rose-800 font-black animate-pulse' : ''} title="Care">💉</span>
            </div>

            {/* Calibration Overlay inside Screen */}
            {isCalibrating && (
              <div className="absolute inset-0 bg-[#c7dfbd]/95 backdrop-blur-[1px] flex flex-col items-center justify-center p-2 z-30 text-center">
                <p className="text-[10px] font-black text-[#1a2814] leading-tight">Sit tall… calibrating</p>
                <div className="w-28 bg-neutral-300 border border-black rounded-full h-2 mt-1 overflow-hidden">
                  <div
                    className="bg-yellow-400 h-full transition-all duration-200"
                    style={{ width: `${calibrationProgress}%` }}
                  />
                </div>
                <span className="text-[9px] font-mono font-black text-[#1a2814] mt-0.5">{calibrationProgress}%</span>
              </div>
            )}

            {/* Center Mascot Sprite Stage */}
            <div
              className={`relative transition-transform duration-200 ${
                isReviving ? 'animate-backflip' : ''
              } ${isPetting ? 'scale-115' : ''} ${flashing ? 'animate-level-flash' : ''} ${
                refused ? 'animate-knife-shake' : ''
              }`}
              style={{
                transform: `translateX(${posX}px) scaleX(${direction})`,
              }}
            >
              {USE_PIXEL_MASCOT ? renderPixelMascot(state, hp, emote, look) : renderMascotGraphic(state, hp)}

              {/* Corn fly-in on feeding */}
              {feedBurst !== null && (
                <div key={feedBurst} className="absolute inset-0 pointer-events-none z-30">
                  {FEED_CORN_FROM.map(([dx, dy], i) => (
                    <span
                      key={i}
                      className="absolute left-1/2 top-1/2 text-sm animate-corn-fly"
                      style={{ ['--dx' as any]: `${dx}px`, ['--dy' as any]: `${dy}px`, animationDelay: `${i * 60}ms` }}
                    >
                      🌽
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Bottom 4 Classic LCD Icons */}
            <div className="flex items-center justify-between w-full px-2 pb-0.5 text-[9px] font-mono select-none opacity-70">
              <span title="Clean">🦆</span>
              <span title="Health Meter">⚖️</span>
              <span title="Discipline">🗯️</span>
              <span className={state === 'THRIVING' ? 'scale-125 text-emerald-800 font-black' : ''} title="Attention">💖</span>
            </div>
          </div>
        </div>

        {/* Integrated Machine Stats Bar */}
        <div
          className="w-full max-w-[200px] bg-black/80 rounded-lg px-2 py-1 text-white border border-black/80 flex items-center justify-between text-[9px] font-black select-none z-10 shadow-sm"
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          <div className="flex items-center gap-1">
            <span className="text-[10px]">❤️</span>
            <span className="font-mono">{Math.round(hp)}%</span>
            <div className="w-12 bg-neutral-800 rounded-full h-1.5 border border-black/60 overflow-hidden ml-0.5">
              <div
                className={`h-full transition-all duration-500 ${
                  hp >= 80 ? 'bg-emerald-400' : hp >= 40 ? 'bg-yellow-400' : 'bg-rose-500'
                }`}
                style={{ width: `${Math.max(4, hp)}%` }}
              />
            </div>
          </div>

          <div className="flex items-center gap-1 font-mono">
            <span>Lv.{profile.level}</span>
            <span className={enoughCorn ? 'text-emerald-400' : 'text-amber-300'}>
              🌽{profile.corn}/{need}
            </span>
          </div>
        </div>

        {/* 3 Classic Physical Buttons: [A] Pet, [B] Feed, [C] Lock */}
        <div
          className="flex items-center justify-around w-full pt-1 pb-0.5 px-3 z-10"
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          {/* Button A: Pet */}
          <div className="flex flex-col items-center">
            <button
              type="button"
              onClick={handlePet}
              className="w-8 h-8 rounded-full border-2 border-black/80 shadow-[0_2px_0_0_#000] flex items-center justify-center font-black text-xs transition-transform active:translate-y-0.5 cursor-pointer"
              style={{
                background: skinConfig.buttonBg,
                borderColor: skinConfig.buttonBorder,
                color: skinConfig.buttonTextColor,
              }}
              title="Button A: Pet Duck 💖"
            >
              A
            </button>
            <span className="text-[8px] font-black uppercase tracking-tight mt-0.5 text-black/90">Pet</span>
          </div>

          {/* Button B: Feed */}
          <div className="flex flex-col items-center">
            <button
              type="button"
              onClick={handleFeed}
              className="w-8 h-8 rounded-full border-2 border-black/80 shadow-[0_2px_0_0_#000] flex items-center justify-center font-black text-xs transition-transform active:translate-y-0.5 cursor-pointer"
              style={{
                background: skinConfig.buttonBg,
                borderColor: skinConfig.buttonBorder,
                color: skinConfig.buttonTextColor,
              }}
              title={`Button B: Feed (${profile.corn}/${need} 🌽)`}
            >
              B
            </button>
            <span className="text-[8px] font-black uppercase tracking-tight mt-0.5 text-black/90">Feed</span>
          </div>

          {/* Button C: Lock / Move */}
          <div className="flex flex-col items-center">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleLock?.(!isLocked);
              }}
              className={`w-8 h-8 rounded-full border-2 border-black/80 shadow-[0_2px_0_0_#000] flex items-center justify-center font-black text-[10px] transition-transform active:translate-y-0.5 cursor-pointer ${
                !isLocked ? 'ring-2 ring-amber-400 animate-pulse' : ''
              }`}
              style={{
                background: skinConfig.buttonBg,
                borderColor: skinConfig.buttonBorder,
                color: skinConfig.buttonTextColor,
              }}
              title={isLocked ? 'Button C: Position Locked. Click to Unlock & Move' : 'Button C: Position Unlocked. Click to Lock'}
            >
              {isLocked ? '🔒' : '🔓'}
            </button>
            <span className="text-[8px] font-black uppercase tracking-tight mt-0.5 text-black/90">
              {isLocked ? 'Lock' : 'Move'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

/** High-fidelity SVG Character Graphics per Pet State */
function renderMascotGraphic(state: PetState, hp: number) {
  switch (state) {
    case 'THRIVING':
      return (
        <div className="relative group animate-bounce-slow">
          {/* Headphones */}
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-16 h-7 border-t-4 border-indigo-400 rounded-t-full pointer-events-none z-10" />
          <div className="absolute top-1 -left-1 w-3 h-5 bg-indigo-500 rounded-full z-10 shadow" />
          <div className="absolute top-1 -right-1 w-3 h-5 bg-indigo-500 rounded-full z-10 shadow" />

          {/* Golden Sparkles */}
          <div className="absolute -top-2 -right-3 text-amber-300 text-xs animate-ping">✦</div>
          <div className="absolute top-4 -left-3 text-emerald-300 text-xs animate-pulse">★</div>

          {/* Upright Bouncing Body */}
          <svg width="74" height="66" viewBox="0 0 74 66" fill="none">
            <path
              d="M37 4C18 4 6 18 6 36C6 52 18 62 37 62C56 62 68 52 68 36C68 18 56 4 37 4Z"
              fill="url(#thriving_grad)"
            />
            {/* Happy Eye Arcs */}
            <path d="M22 30C24 26 28 26 30 30" stroke="#0F172A" strokeWidth="3" strokeLinecap="round" />
            <path d="M44 30C46 26 50 26 52 30" stroke="#0F172A" strokeWidth="3" strokeLinecap="round" />
            {/* Cheerful Open Mouth */}
            <path d="M32 37C32 42 42 42 42 37" fill="#F43F5E" />
            {/* Blushing cheeks */}
            <circle cx="18" cy="36" r="3.5" fill="#FDA4AF" opacity="0.8" />
            <circle cx="56" cy="36" r="3.5" fill="#FDA4AF" opacity="0.8" />

            <defs>
              <linearGradient id="thriving_grad" x1="37" y1="4" x2="37" y2="62" gradientUnits="userSpaceOnUse">
                <stop stopColor="#34D399" />
                <stop offset="1" stopColor="#059669" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      );

    case 'SLOUCHING':
      return (
        <div className="relative animate-wobble">
          {/* Blue Stress Sweat Drop */}
          <div className="absolute -top-2 right-1 text-sky-400 font-bold text-sm animate-bounce">💧</div>

          {/* Squashed Melted Puddle Body */}
          <svg width="86" height="48" viewBox="0 0 86 48" fill="none">
            <path
              d="M43 8C20 8 4 20 4 38C4 44 22 46 43 46C64 46 82 44 82 38C82 20 66 8 43 8Z"
              fill="url(#slouch_grad)"
            />
            {/* Furrowed Strained Eyes */}
            <path d="M26 26L34 29" stroke="#1E293B" strokeWidth="3" strokeLinecap="round" />
            <path d="M60 26L52 29" stroke="#1E293B" strokeWidth="3" strokeLinecap="round" />
            {/* Wavy Slumping Mouth */}
            <path d="M37 36C40 33 46 38 49 35" stroke="#1E293B" strokeWidth="2.5" strokeLinecap="round" />

            <defs>
              <linearGradient id="slouch_grad" x1="43" y1="8" x2="43" y2="46" gradientUnits="userSpaceOnUse">
                <stop stopColor="#FBBF24" />
                <stop offset="1" stopColor="#D97706" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      );

    case 'WILTED':
      return (
        <div className="relative animate-float-fade">
          {/* Ghost Angel Halo */}
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-8 h-2.5 border-2 border-amber-300 rounded-full" />
          <div className="absolute -top-1 -right-2 text-slate-400 text-xs font-mono">Zzz...</div>

          {/* Pale Translucent Ghost Puddle */}
          <svg width="74" height="64" viewBox="0 0 74 64" fill="none" opacity="0.88">
            <path
              d="M37 6C20 6 8 20 8 38C8 56 16 60 26 54C32 50 42 50 48 54C58 60 66 56 66 38C66 20 54 6 37 6Z"
              fill="url(#wilted_grad)"
            />
            {/* X _ X Eyes */}
            <path d="M24 26L30 32M30 26L24 32" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M44 26L50 32M50 26L44 32" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" />
            {/* Flat line mouth */}
            <line x1="33" y1="38" x2="41" y2="38" stroke="#475569" strokeWidth="2" strokeLinecap="round" />

            <defs>
              <linearGradient id="wilted_grad" x1="37" y1="6" x2="37" y2="58" gradientUnits="userSpaceOnUse">
                <stop stopColor="#94A3B8" />
                <stop offset="1" stopColor="#64748B" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      );

    case 'CALIBRATING':
      return (
        <div className="relative flex flex-col items-center">
          {/* Holographic scanning ring */}
          <div className="absolute -inset-2 border-2 border-dashed border-cyan-400 rounded-full animate-spin" />
          <svg width="70" height="60" viewBox="0 0 70 60" fill="none">
            <path
              d="M35 6C18 6 8 20 8 36C8 50 18 56 35 56C52 56 62 50 62 36C62 20 52 6 35 6Z"
              fill="#0284C7"
            />
            <circle cx="27" cy="30" r="3" fill="#FFFFFF" />
            <circle cx="43" cy="30" r="3" fill="#FFFFFF" />
            <path d="M31 40Q35 44 39 40" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="text-[10px] font-mono font-bold text-cyan-300 mt-1 animate-pulse">CALIBRATING</span>
        </div>
      );

    case 'AWAY':
      return (
        <div className="relative opacity-70">
          <div className="absolute -top-3 right-0 text-amber-300 font-bold text-xs">?</div>
          <svg width="70" height="60" viewBox="0 0 70 60" fill="none">
            <path
              d="M35 6C18 6 8 20 8 36C8 50 18 56 35 56C52 56 62 50 62 36C62 20 52 6 35 6Z"
              fill="#64748B"
            />
            {/* Sleeping closed curves */}
            <path d="M23 32Q27 36 31 32" stroke="#1E293B" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M39 32Q43 36 47 32" stroke="#1E293B" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </div>
      );

    case 'NEUTRAL':
    default:
      return (
        <div className="relative animate-pulse-subtle">
          <svg width="72" height="62" viewBox="0 0 72 62" fill="none">
            <path
              d="M36 6C18 6 8 20 8 36C8 50 18 58 36 58C54 58 64 50 64 36C64 20 54 6 36 6Z"
              fill="url(#neutral_grad)"
            />
            {/* Round Inquisitive Eyes */}
            <circle cx="26" cy="30" r="3.5" fill="#0F172A" />
            <circle cx="46" cy="30" r="3.5" fill="#0F172A" />
            <circle cx="25" cy="29" r="1.2" fill="#FFFFFF" />
            <circle cx="45" cy="29" r="1.2" fill="#FFFFFF" />
            {/* Mild Smile */}
            <path d="M32 38Q36 42 40 38" stroke="#0F172A" strokeWidth="2" strokeLinecap="round" />

            <defs>
              <linearGradient id="neutral_grad" x1="36" y1="6" x2="36" y2="58" gradientUnits="userSpaceOnUse">
                <stop stopColor="#38BDF8" />
                <stop offset="1" stopColor="#0284C7" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      );
  }
}
