/**
 * Dashboard theme: near-black or cream background, soft cards, and a duck-yellow accent.
 * Light and dark mode share these class strings; the colours themselves are CSS variables
 * defined in index.css and switched by `data-theme="light" | "dark"` on the page wrapper.
 */

export type ThemeMode = 'light' | 'dark';
export const THEME_STORAGE_KEY = 'ergogotchi.theme';

/** Saved choice, or the system preference the first time. */
export function loadTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Storage unavailable: fall through to the system preference
  }
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
}

export function saveTheme(mode: ThemeMode): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Storage unavailable: the choice just won't persist
  }
}

/** Page background and default text colour. */
export const PAGE = 'bg-[var(--bg)] text-[var(--ink)]';
/** Card: a raised surface with a hairline border. */
export const CARD = 'bg-[var(--card)] border border-[var(--line)] rounded-2xl';
/** Quieter inner panel on top of a card. */
export const PANEL = 'bg-[var(--chip)] border border-[var(--line)] rounded-xl';
/** Highlighted callout tinted with the accent colour. */
export const CALLOUT = 'bg-[var(--accent-soft)] border border-[var(--accent)] rounded-2xl';
/** Small uppercase label above a value. */
export const LABEL = 'text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]';
export const MUTED = 'text-[var(--muted)]';
export const FAINT = 'text-[var(--faint)]';

const BUTTON =
  'px-3.5 py-2 text-xs font-semibold rounded-xl border transition-all ' +
  'disabled:opacity-45 disabled:cursor-not-allowed';
/** Main action. */
export const BUTTON_PRIMARY = `${BUTTON} bg-[var(--accent)] text-[var(--accent-ink)] border-[var(--accent)] hover:brightness-110`;
/** Secondary action. */
export const BUTTON_NEUTRAL = `${BUTTON} bg-[var(--chip)] text-[var(--ink)] border-[var(--line)] hover:border-[var(--accent)]`;
/** Selected / "on" state in a row of choices. */
export const BUTTON_SELECTED = BUTTON_PRIMARY;
/** Accent-outlined action. */
export const BUTTON_OUTLINE = `${BUTTON} bg-transparent text-[var(--accent)] border-[var(--accent)] hover:bg-[var(--accent-soft)]`;

/** Progress-bar track; put a coloured bar inside it. */
export const TRACK = 'w-full bg-[var(--track)] rounded-full overflow-hidden';
export const BAR_GOOD = 'bg-[var(--good)]';
export const BAR_ACCENT = 'bg-[var(--accent)]';
export const BAR_BAD = 'bg-[var(--bad)]';

export const GOOD_TEXT = 'text-[var(--good)]';
export const BAD_TEXT = 'text-[var(--bad)]';
export const ACCENT_TEXT = 'text-[var(--accent)]';
