/**
 * Dashboard themes:
 *  - 'sanrio': Dreamy strawberry milk & pastel pop aesthetic (My Melody / Cinnamoroll vibes)
 *  - 'kuromi': Midnight gothic purple & electric neon pop
 *  - 'dark': Sleek dark mode with duck-yellow accent
 *  - 'light': Crisp warm cream stationery mode
 *
 * Colours are CSS variables defined in index.css and switched by `data-theme="..."`.
 */

export type ThemeMode = 'sanrio' | 'kuromi' | 'dark' | 'light';
export const THEME_STORAGE_KEY = 'ergogotchi.theme';

export interface ThemeOption {
  id: ThemeMode;
  label: string;
  icon: string;
  sublabel: string;
  badge: string;
  swatchBg: string;
}

export const THEMES: ThemeOption[] = [
  {
    id: 'sanrio',
    label: 'Sanrio Pastel',
    icon: '🌸',
    sublabel: 'Strawberry milk & marshmallow cloud',
    badge: 'Sweet & Artsy',
    swatchBg: 'from-pink-300 via-rose-200 to-sky-200',
  },
  {
    id: 'kuromi',
    label: 'Kuromi Gothic',
    icon: '🎀',
    sublabel: 'Midnight purple & electric neon pop',
    badge: 'Pop Punk',
    swatchBg: 'from-purple-900 via-fuchsia-900 to-pink-600',
  },
  {
    id: 'dark',
    label: 'Midnight Classic',
    icon: '🌙',
    sublabel: 'Deep dark slate & warm duck yellow',
    badge: 'Classic',
    swatchBg: 'from-neutral-900 via-stone-900 to-yellow-500',
  },
  {
    id: 'light',
    label: 'Daylight Cream',
    icon: '☀️',
    sublabel: 'Warm stationery & clean sunny vibes',
    badge: 'Clean',
    swatchBg: 'from-amber-100 via-stone-100 to-amber-500',
  },
];

export const THEME_CYCLE_ORDER: ThemeMode[] = ['sanrio', 'kuromi', 'dark', 'light'];

/** Saved choice, defaulting to 'sanrio' for the delightful aesthetic redesign! */
export function loadTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'sanrio' || saved === 'kuromi' || saved === 'dark' || saved === 'light') {
      return saved;
    }
  } catch {
    // Storage unavailable: fall through
  }
  return 'sanrio';
}

export function saveTheme(mode: ThemeMode): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Storage unavailable: the choice just won't persist
  }
}

/** Page background and default text colour. */
export const PAGE = 'bg-[var(--bg)] text-[var(--ink)] transition-colors duration-300';
/** Card: a raised surface with a soft pillowy curve and subtle pop shadow. */
export const CARD = 'bg-[var(--card)] border-2 border-[var(--line)] rounded-3xl shadow-[var(--shadow-pop)] transition-all duration-200';
/** Quieter inner panel on top of a card. */
export const PANEL = 'bg-[var(--chip)] border border-[var(--line)] rounded-2xl transition-all duration-200';
/** Highlighted callout tinted with the accent colour. */
export const CALLOUT = 'bg-[var(--accent-soft)] border-2 border-[var(--accent)] rounded-3xl shadow-sm';
/** Small uppercase label above a value. */
export const LABEL = 'text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]';
export const MUTED = 'text-[var(--muted)]';
export const FAINT = 'text-[var(--faint)]';

const BUTTON =
  'px-4 py-2 text-xs font-bold rounded-2xl border-2 transition-all duration-150 ' +
  'active:scale-95 active:translate-y-0.5 disabled:opacity-45 disabled:cursor-not-allowed ' +
  'shadow-[var(--btn-shadow)]';

/** Main action with juicy pop feel. */
export const BUTTON_PRIMARY = `${BUTTON} bg-[var(--accent)] text-[var(--accent-ink)] border-[var(--accent)] hover:brightness-105 hover:-translate-y-0.5`;
/** Secondary action. */
export const BUTTON_NEUTRAL = `${BUTTON} bg-[var(--chip)] text-[var(--ink)] border-[var(--line)] hover:border-[var(--accent)] hover:bg-[var(--card)]`;
/** Selected / "on" state in a row of choices. */
export const BUTTON_SELECTED = BUTTON_PRIMARY;
/** Accent-outlined action. */
export const BUTTON_OUTLINE = `${BUTTON} bg-transparent text-[var(--accent)] border-[var(--accent)] hover:bg-[var(--accent-soft)] hover:-translate-y-0.5`;

/** Progress-bar track; put a coloured bar inside it. */
export const TRACK = 'w-full bg-[var(--track)] rounded-full overflow-hidden p-0.5 border border-[var(--line)]';
export const BAR_GOOD = 'bg-[var(--good)] shadow-[0_0_10px_var(--good)]';
export const BAR_ACCENT = 'bg-[var(--accent)] shadow-[0_0_10px_var(--accent)]';
export const BAR_BAD = 'bg-[var(--bad)] shadow-[0_0_10px_var(--bad)]';

export const GOOD_TEXT = 'text-[var(--good)]';
export const BAD_TEXT = 'text-[var(--bad)]';
export const ACCENT_TEXT = 'text-[var(--accent)]';
