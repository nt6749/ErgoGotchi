/**
 * Expressive Mascot Sprite Engine for ErgoGotchi ("Bobi the Posture Blob").
 * Renders state-driven CSS/SVG animations with dynamic physics, speech bubble, and interaction.
 */

import React, { useState, useEffect, useRef } from 'react';
import { PetState, StretchCue } from '../types';
import { soundEffects } from './soundEffects';
import { Activity, DEFAULT_LOOK, PET_WALKS, PetEmote, renderPixelMascot, USE_PIXEL_MASCOT } from './PixelMascot';
import { HATCH_MS } from './lifeStageSprites';
import { ADULT_LEVEL, canFeed, cornNeeded, NEW_PET, stageOf, type LifeStage, type PetProfile } from './progression';

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
}) => {
  const [isPetting, setIsPetting] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [alwaysShowCorn, setAlwaysShowCorn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('ergogotchi.alwaysShowCorn') !== 'false';
    } catch {
      return true;
    }
  });
  const [webOffset, setWebOffset] = useState<{ x: number; y: number }>(() => {
    try {
      const saved = localStorage.getItem('ergogotchi_web_pet_offset');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return { x: 0, y: 0 };
  });

  const dragRef = useRef<{
    isMouseDown: boolean;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    hasDragged: boolean;
  }>({
    isMouseDown: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    hasDragged: false,
  });

  const isHoveredRef = useRef(false);

  // Feeding feedback: a burst of corn flying in, or a "not enough" shake
  const [feedBurst, setFeedBurst] = useState<number | null>(null);
  const [refused, setRefused] = useState(false);
  const [typedText, setTypedText] = useState('');
  const [posX, setPosX] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);

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

  // Reset web offset if the pet is docked to corner via menu or settings
  useEffect(() => {
    const handleReset = () => {
      setWebOffset({ x: 0, y: 0 });
      try {
        localStorage.removeItem('ergogotchi_web_pet_offset');
      } catch (e) {}
    };

    if (electronAPI?.onPetDocked) {
      electronAPI.onPetDocked(handleReset);
    }
    window.addEventListener('pet-docked', handleReset);
    return () => {
      window.removeEventListener('pet-docked', handleReset);
    };
  }, []);

  // Listen for always-show-corn changes across tabs/windows or right-click menu
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'ergogotchi.alwaysShowCorn') {
        setAlwaysShowCorn(e.newValue !== 'false');
      }
    };
    const handleCustom = (e: any) => {
      if (typeof e.detail === 'boolean') {
        setAlwaysShowCorn(e.detail);
      }
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener('always-show-corn-changed', handleCustom);
    if (electronAPI?.onAlwaysShowCornChanged) {
      electronAPI.onAlwaysShowCornChanged((val: boolean) => {
        setAlwaysShowCorn(val);
        try {
          localStorage.setItem('ergogotchi.alwaysShowCorn', String(val));
        } catch {}
      });
    }
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('always-show-corn-changed', handleCustom);
    };
  }, []);

  // Draggable Window & Pet Physics
  const handleMouseDown = (e: React.MouseEvent) => {
    // Only primary (left) button initiates drag
    if (e.button !== 0) return;
    dragRef.current = {
      isMouseDown: true,
      startX: e.screenX,
      startY: e.screenY,
      lastX: e.screenX,
      lastY: e.screenY,
      hasDragged: false,
    };
    electronAPI?.setIgnoreMouse?.(false);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current.isMouseDown) return;

      const totalDist = Math.hypot(
        e.screenX - dragRef.current.startX,
        e.screenY - dragRef.current.startY
      );

      // Drag threshold: require at least 5px of intentional movement
      if (!dragRef.current.hasDragged) {
        if (totalDist > 5) {
          dragRef.current.hasDragged = true;
          setIsDragging(true);
        } else {
          return;
        }
      }

      const dx = e.screenX - dragRef.current.lastX;
      const dy = e.screenY - dragRef.current.lastY;
      dragRef.current.lastX = e.screenX;
      dragRef.current.lastY = e.screenY;

      if (electronAPI?.isElectron && electronAPI?.movePetBy) {
        electronAPI.movePetBy(dx, dy, false);
      } else {
        setWebOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      }
    };

    const handleMouseUp = () => {
      if (!dragRef.current.isMouseDown) return;
      dragRef.current.isMouseDown = false;

      if (dragRef.current.hasDragged) {
        if (electronAPI?.isElectron && electronAPI?.movePetBy) {
          electronAPI.movePetBy(0, 0, true);
        } else {
          try {
            setWebOffset((curr) => {
              localStorage.setItem('ergogotchi_web_pet_offset', JSON.stringify(curr));
              return curr;
            });
          } catch (err) {}
        }

        setTimeout(() => {
          dragRef.current.hasDragged = false;
          setIsDragging(false);
        }, 80);
      } else {
        setIsDragging(false);
      }

      if (!isHoveredRef.current) {
        captureMouse.onMouseLeave();
        setHovered(false);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Audio trigger on state changes
  useEffect(() => {
    if (isReviving) {
      soundEffects.playRevive();
    } else if (state === 'SLOUCHING') {
      soundEffects.playSlouchMelt();
    }
  }, [state, isReviving]);

  // Soft walking wandering along taskbar when Thriving/Neutral (paused during drag)
  useEffect(() => {
    if (!PET_WALKS) return;
    if (isDragging) return;
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
  }, [state, direction, isDragging]);

  // Clicking feeds the pet: it eats the corn it needs to level up, or refuses if there isn't enough
  const handleFeed = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (dragRef.current.hasDragged) return;
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

  return (
    <div 
      className="relative flex flex-col items-center justify-end select-none"
      style={{
        width: '180px',
        minHeight: speechText ? '260px' : '170px',
        transform: electronAPI?.isElectron ? undefined : `translate(${webOffset.x}px, ${webOffset.y}px)`,
        transition: isDragging ? 'none' : 'transform 0.1s ease-out',
      }}
    >
      {/* Dynamic Comic Speech Bubble */}
      {speechText && (
        <div {...captureMouse} className="animate-bounce-in mb-3 w-48 bg-white text-black p-3 rounded-2xl border-2 border-black shadow-[3px_3px_0_0_#000] relative z-50">
          <button
            onClick={onDismissSpeech}
            className="absolute -top-2.5 -right-2.5 bg-yellow-400 hover:bg-yellow-300 text-black font-black rounded-full w-5 h-5 flex items-center justify-center text-xs border-2 border-black"
            title="Dismiss"
          >
            ×
          </button>
          
          {speechCue && speechCue !== 'NONE' && (
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-yellow-400 text-black border border-black">
                {speechCue.replace('_', ' ')}
              </span>
            </div>
          )}

          <p className="text-xs font-semibold leading-relaxed text-black">
            {typedText}
          </p>

          {/* Bubble tail arrow */}
          <div className="absolute -bottom-[9px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[7px] border-l-transparent border-r-[7px] border-r-transparent border-t-[9px] border-t-black" />
        </div>
      )}

      {/* Mascot Sprite Container */}
      <div
        onMouseEnter={() => {
          isHoveredRef.current = true;
          captureMouse.onMouseEnter();
          setHovered(true);
        }}
        onMouseLeave={() => {
          isHoveredRef.current = false;
          if (!isDragging && !dragRef.current.isMouseDown) {
            captureMouse.onMouseLeave();
            setHovered(false);
          }
        }}
        onMouseDown={handleMouseDown}
        onClick={handleFeed}
        onDoubleClick={(e) => {
          if (dragRef.current.hasDragged) return;
          onOpenDashboard();
        }}
        onContextMenu={(e) => {
          // In Electron, let the native right-click menu open instead
          if ((window as any).electronAPI?.isElectron) return;
          e.preventDefault();
          onRecalibrate();
        }}
        title="Drag anywhere to move · Click to feed · Double-click for Dashboard"
        className={`transition-transform duration-150 relative select-none ${
          isDragging ? 'cursor-grabbing scale-105 drop-shadow-xl' : 'cursor-grab hover:scale-102'
        } ${isReviving ? 'animate-backflip' : ''} ${isPetting ? 'scale-110' : ''} ${
          flashing ? 'animate-level-flash' : ''
        } ${refused ? 'animate-knife-shake' : ''}`}
        style={{
          transform: `translateX(${posX}px) scaleX(${direction})`,
        }}
      >
        {/* Cute Draggable Indicator Hint when hovered */}
        {hovered && !isDragging && !banner && (
          <div
            className={`absolute ${(alwaysShowCorn || hovered) && pet ? '-top-16' : '-top-7'} left-1/2 -translate-x-1/2 pointer-events-none z-50 whitespace-nowrap px-2 py-0.5 rounded-full bg-black/80 text-yellow-300 text-[10px] font-mono tracking-wide border border-yellow-400/50 shadow-md flex items-center gap-1 opacity-95 transition-all duration-200`}
          >
            <span>✥</span>
            <span>drag to move</span>
          </div>
        )}

        {/* Render State Specific SVG Graphic */}
        {USE_PIXEL_MASCOT ? renderPixelMascot(state, hp, emote, look) : renderMascotGraphic(state, hp)}

        {/* Level-up sparks and banner, and floating XP numbers (never block the mouse) */}
        {banner && (
          <div key={banner.id} className="absolute inset-0 pointer-events-none z-40">
            {SPARK_DIRECTIONS.map(([dx, dy], i) => (
              <span
                key={i}
                className="absolute left-1/2 top-1/2 text-amber-300 text-sm animate-level-spark"
                style={{ ['--dx' as any]: `${dx}px`, ['--dy' as any]: `${dy}px` }}
              >
                ✦
              </span>
            ))}
            <div className="absolute -top-7 left-1/2 -translate-x-1/2">
              <div className="animate-level-banner whitespace-nowrap px-2.5 py-1 rounded-full bg-yellow-400 text-black text-[11px] font-black uppercase tracking-wide border-2 border-black shadow-[2px_2px_0_0_#000]">
                {banner.text}
              </div>
            </div>
          </div>
        )}
        {cornPops.map((pop) => (
          <span
            key={pop.id}
            className="absolute -top-1 right-0 pointer-events-none z-30 text-[11px] font-black text-black animate-xp-float whitespace-nowrap px-1 rounded bg-yellow-400 border border-black"
          >
            +{pop.amount} 🌽
          </span>
        ))}

        {/* Fed: corn flies into the pet */}
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

        {/* Corn status card: always shown if enabled (default), or shown on hover */}
        {pet && (alwaysShowCorn || hovered) && !banner && (
          <div className="absolute -top-10 left-1/2 -translate-x-1/2 pointer-events-none z-40 whitespace-nowrap text-center px-2 py-1 rounded-lg bg-white border-2 border-black shadow-[2px_2px_0_0_#000] transition-opacity duration-200">
            <div className={`text-[12px] font-black leading-tight ${enoughCorn ? 'text-emerald-600' : 'text-rose-600'}`}>
              {profile.corn}/{need} 🌽
            </div>
            <div className="text-[9px] font-semibold text-neutral-700 leading-tight">
              {enoughCorn ? `Click to feed ${profile.name}` : `${need - profile.corn} more to level up`}
            </div>
          </div>
        )}
      </div>

      {/* Micro Health Bar under Mascot */}
      <div className="w-20 bg-white rounded-full h-2 mt-2 border-2 border-black overflow-hidden">
        <div
          className={`h-full transition-all duration-500 ${
            hp >= 80 ? 'bg-emerald-500' : hp >= 40 ? 'bg-yellow-400' : 'bg-rose-500'
          }`}
          style={{ width: `${Math.max(4, hp)}%` }}
        />
      </div>

      {/* Level, corn progress towards the next level, and the pantry */}
      {pet && (
        <div className="flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded-full bg-white border-2 border-black">
          <span className="text-[9px] font-black text-black leading-none">Lv {profile.level}</span>
          <div className="w-10 bg-neutral-200 rounded-full h-1.5 border border-black overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${enoughCorn ? 'bg-emerald-500' : 'bg-yellow-400'}`}
              style={{ width: `${Math.max(3, Math.min(1, profile.corn / need) * 100)}%` }}
            />
          </div>
          <span className={`text-[9px] font-black leading-none ${enoughCorn ? 'text-emerald-600' : 'text-black'}`}>
            🌽{profile.corn}
          </span>
        </div>
      )}
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
