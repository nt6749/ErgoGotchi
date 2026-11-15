/**
 * Authentic Vintage Egg Shell Skins based on classic pocket virtual pet releases.
 * Includes Cosmic Starlight, Pastel Rainbow Dream, and Avocado Gingham.
 */

export type EggShellSkin = 'cosmic' | 'pastel' | 'avocado';
export type TamagotchiSkin = EggShellSkin; // Backwards-compatibility alias

export interface EggShellSkinConfig {
  id: EggShellSkin;
  name: string;
  tagline: string;
  badge: string;
  accentColor: string;
  // Shell styling
  shellGradient: string;
  shellBorder: string;
  // Bezel styling (starburst frame)
  starBurstBg: string;
  starBurstBorder: string;
  starBurstShadow: string;
  // LCD screen glass
  lcdBg: string;
  lcdBorder: string;
  lcdTextColor: string;
  // Buttons
  buttonBg: string;
  buttonBorder: string;
  buttonShadow: string;
  buttonTextColor: string;
  // Logo text
  logoColor: string;
  logoShadow: string;
  // Preview colors for MyDuck tab
  previewBg: string;
  previewBorder: string;
}
export type TamagotchiSkinConfig = EggShellSkinConfig;

export const EGG_SHELL_SKINS: Record<EggShellSkin, EggShellSkinConfig> = {
  cosmic: {
    id: 'cosmic',
    name: 'Cosmic Starlight',
    tagline: 'Deep navy with gold stars & crescent moon',
    badge: '🌌 Starlight',
    accentColor: '#ffffff',
    shellGradient: 'radial-gradient(circle at 50% 25%, #1e3a8a 0%, #0f1d4a 65%, #070c24 100%)',
    shellBorder: 'border-[#0a1033]',
    starBurstBg: 'linear-gradient(135deg, #fef08a 0%, #eab308 45%, #ca8a04 100%)',
    starBurstBorder: '#92400e',
    starBurstShadow: '0 3px 8px rgba(0,0,0,0.6)',
    lcdBg: 'linear-gradient(180deg, #cbe3a8 0%, #a8c485 100%)',
    lcdBorder: '#4d6334',
    lcdTextColor: '#1f2e14',
    buttonBg: 'linear-gradient(180deg, #f0f9ff 0%, #bae6fd 100%)',
    buttonBorder: '#0369a1',
    buttonShadow: '#0284c7',
    buttonTextColor: '#0c4a6e',
    logoColor: '#ffffff',
    logoShadow: '0 1px 4px rgba(0,0,0,0.9), 0 0 10px rgba(255,255,255,0.8)',
    previewBg: 'bg-gradient-to-br from-indigo-950 via-blue-950 to-slate-950',
    previewBorder: 'border-yellow-400',
  },
  pastel: {
    id: 'pastel',
    name: 'Pastel Rainbow Dream',
    tagline: 'Soft bubblegum pink with sweeping rainbow clouds',
    badge: '🌈 Pastel',
    accentColor: '#c084fc',
    shellGradient: 'radial-gradient(circle at 50% 25%, #fbcfe8 0%, #f472b6 60%, #db2777 100%)',
    shellBorder: 'border-[#9d174d]',
    starBurstBg: 'linear-gradient(135deg, #e9d5ff 0%, #c084fc 50%, #9333ea 100%)',
    starBurstBorder: '#6b21a8',
    starBurstShadow: '0 3px 8px rgba(0,0,0,0.4)',
    lcdBg: 'linear-gradient(180deg, #dcfce7 0%, #bbf7d0 100%)',
    lcdBorder: '#3f6212',
    lcdTextColor: '#14532d',
    buttonBg: 'linear-gradient(180deg, #faf5ff 0%, #d8b4fe 100%)',
    buttonBorder: '#7e22ce',
    buttonShadow: '#6b21a8',
    buttonTextColor: '#581c87',
    logoColor: '#818cf8',
    logoShadow: '0 1px 2px rgba(0,0,0,0.4)',
    previewBg: 'bg-gradient-to-br from-pink-200 via-rose-300 to-pink-400',
    previewBorder: 'border-purple-400',
  },
  avocado: {
    id: 'avocado',
    name: 'Avocado Gingham',
    tagline: 'Fresh mint green with avocado prints & green gingham check',
    badge: '🥑 Avocado',
    accentColor: '#84cc16',
    shellGradient: 'radial-gradient(circle at 50% 25%, #86efac 0%, #4ade80 60%, #16a34a 100%)',
    shellBorder: 'border-[#14532d]',
    starBurstBg: 'linear-gradient(135deg, #d9f99d 0%, #a3e635 50%, #65a30d 100%)',
    starBurstBorder: '#3f6212',
    starBurstShadow: '0 3px 8px rgba(0,0,0,0.4)',
    lcdBg: 'linear-gradient(180deg, #ecfccb 0%, #d9f99d 100%)',
    lcdBorder: '#4d7c0f',
    lcdTextColor: '#1a2e05',
    buttonBg: 'linear-gradient(180deg, #fed7aa 0%, #fb923c 100%)',
    buttonBorder: '#9a3412',
    buttonShadow: '#c2410c',
    buttonTextColor: '#7c2d12',
    logoColor: '#065f46',
    logoShadow: '0 1px 2px rgba(255,255,255,0.6)',
    previewBg: 'bg-gradient-to-br from-emerald-200 via-lime-300 to-green-400',
    previewBorder: 'border-lime-500',
  },
};

export const TAMAGOTCHI_SKINS = EGG_SHELL_SKINS; // Alias

export const SKIN_STORAGE_KEY = 'ergogotchi_shell_skin';
export const DEFAULT_SKIN: EggShellSkin = 'cosmic';

export function loadStoredSkin(): EggShellSkin {
  try {
    const val = localStorage.getItem(SKIN_STORAGE_KEY) || localStorage.getItem('ergogotchi_tamagotchi_skin');
    if (val === 'cosmic' || val === 'pastel' || val === 'avocado') return val;
  } catch {}
  return DEFAULT_SKIN;
}

export function saveStoredSkin(skin: EggShellSkin): void {
  try {
    localStorage.setItem(SKIN_STORAGE_KEY, skin);
  } catch {}
}
