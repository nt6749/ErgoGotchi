/**
 * Expressive Mascot Sprite Engine for ErgoGotchi ("Bobi the Posture Blob").
 * Renders state-driven CSS/SVG animations with dynamic physics, speech bubble, and interaction.
 */

import React, { useState, useEffect, useRef } from 'react';
import { PetState, StretchCue } from '../types';
import { soundEffects } from './soundEffects';

interface MascotSpriteProps {
  state: PetState;
  hp: number;
  isReviving: boolean;
  speechText: string | null;
  speechCue: StretchCue | null;
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
  onDismissSpeech,
  onOpenDashboard,
  onRecalibrate,
}) => {
  const [isPetting, setIsPetting] = useState(false);
  const [hearts, setHearts] = useState<Array<{ id: number; x: number; y: number }>>([]);
  const [typedText, setTypedText] = useState('');
  const [posX, setPosX] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);

  const bubbleTimerRef = useRef<any>(null);

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
      onDismissSpeech();
    }, 8000);

    return () => {
      clearInterval(interval);
      if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
    };
  }, [speechText, onDismissSpeech]);

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

  // Handle clicking / petting
  const handlePet = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsPetting(true);
    soundEffects.playPet();

    const newHeart = { id: Date.now(), x: (Math.random() - 0.5) * 30, y: -20 };
    setHearts((prev) => [...prev, newHeart]);

    setTimeout(() => {
      setIsPetting(false);
      setHearts((prev) => prev.filter((h) => h.id !== newHeart.id));
    }, 1200);
  };

  return (
    <div 
      className="relative flex flex-col items-center justify-end select-none"
      style={{ width: '180px', minHeight: speechText ? '260px' : '170px' }}
    >
      {/* Dynamic Comic Speech Bubble */}
      {speechText && (
        <div className="animate-bounce-in mb-3 w-48 bg-slate-900/95 text-white p-3 rounded-2xl shadow-2xl border-2 border-emerald-400/80 backdrop-blur-md relative z-50">
          <button
            onClick={onDismissSpeech}
            className="absolute -top-2 -right-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-full w-5 h-5 flex items-center justify-center text-xs border border-slate-600 shadow"
            title="Dismiss"
          >
            ×
          </button>
          
          {speechCue && speechCue !== 'NONE' && (
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {speechCue.replace('_', ' ')}
              </span>
            </div>
          )}

          <p className="text-xs font-medium leading-relaxed tracking-wide text-slate-100">
            {typedText}
          </p>

          {/* Bubble tail arrow */}
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-emerald-400/80" />
        </div>
      )}

      {/* Floating Hearts from Petting */}
      {hearts.map((h) => (
        <span
          key={h.id}
          className="absolute text-pink-400 font-bold text-lg pointer-events-none animate-float-fade"
          style={{ transform: `translate(${h.x}px, ${h.y}px)` }}
        >
          ♥
        </span>
      ))}

      {/* Mascot Sprite Container */}
      <div
        onClick={handlePet}
        onDoubleClick={onOpenDashboard}
        onContextMenu={(e) => {
          e.preventDefault();
          onRecalibrate();
        }}
        title="Double-click to open Dashboard | Right-click to Calibrate | Click to Pet"
        className={`cursor-pointer transition-transform duration-300 relative ${
          isReviving ? 'animate-backflip' : ''
        } ${isPetting ? 'scale-110' : ''}`}
        style={{
          transform: `translateX(${posX}px) scaleX(${direction})`,
        }}
      >
        {/* Render State Specific SVG Graphic */}
        {renderMascotGraphic(state, hp)}
      </div>

      {/* Micro Health Bar under Mascot */}
      <div className="w-20 bg-slate-900/80 rounded-full h-1.5 mt-2 border border-slate-700 overflow-hidden shadow">
        <div
          className={`h-full transition-all duration-500 rounded-full ${
            hp >= 80 ? 'bg-emerald-400' : hp >= 40 ? 'bg-amber-400' : 'bg-rose-500'
          }`}
          style={{ width: `${Math.max(4, hp)}%` }}
        />
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
