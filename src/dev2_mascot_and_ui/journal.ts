/**
 * The posture journal: what happened today and over the pet's lifetime.
 * It feeds three things on the Quests tab: daily quests, achievements and the session report.
 *
 * Two separate records, so the two windows never overwrite each other's work:
 *   Journal - time counters, written once a second by the window that watches the camera
 *   Events  - things the user did (fed, stretched, played, claimed), written when they happen
 *
 * Pure functions plus a small localStorage wrapper. Nothing here talks to the backend.
 */

import type { PetState } from '../types';
import { COSMETICS } from './cosmetics';
import { ADULT_LEVEL, DEFAULT_NAME, HATCH_LEVEL, type PetProfile } from './progression';

/** In demo mode each real second counts as this many, so time-based quests finish in a walkthrough. */
export const DEMO_TIME_MULTIPLIER = 30;
/** How many days of history the session report keeps. */
export const HISTORY_DAYS = 7;
/** Blinks per minute at or above this count as healthy. */
export const HEALTHY_BLINK_RATE = 10;

// ---------------------------------------------------------------- shapes
export interface DayStats {
  uprightSec: number;
  slouchSec: number;
  awaySec: number;
  /** Seconds upright with a healthy blink rate. */
  goodBlinkSec: number;
  /** Times the user sat back up after slouching. */
  recoveries: number;
  /** Longest unbroken upright stretch of the day. */
  bestStreakSec: number;
  /** Corn earned from sitting upright. */
  cornFromSitting: number;
}

export interface Journal {
  days: Record<string, DayStats>;
  /** The upright stretch currently running (reset by slouching). */
  streakSec: number;
  /** Whether the last counted second was a slouch, to spot recoveries. */
  wasSlouching: boolean;
  life: { uprightSec: number; recoveries: number; bestStreakSec: number };
}

export interface DayEvents {
  /** Ids of quests whose reward has been collected. */
  claimed: string[];
  /** Stretch cues marked as done. */
  stretches: string[];
  feeds: number;
  games: number;
  gameBest: number;
}

export interface Events {
  days: Record<string, DayEvents>;
  life: { feeds: number; games: number; gameBest: number; stretches: number };
}

export const EMPTY_DAY: DayStats = {
  uprightSec: 0,
  slouchSec: 0,
  awaySec: 0,
  goodBlinkSec: 0,
  recoveries: 0,
  bestStreakSec: 0,
  cornFromSitting: 0,
};
export const EMPTY_DAY_EVENTS: DayEvents = { claimed: [], stretches: [], feeds: 0, games: 0, gameBest: 0 };
export const NEW_JOURNAL: Journal = {
  days: {},
  streakSec: 0,
  wasSlouching: false,
  life: { uprightSec: 0, recoveries: 0, bestStreakSec: 0 },
};
export const NEW_EVENTS: Events = { days: {}, life: { feeds: 0, games: 0, gameBest: 0, stretches: 0 } };

/** Local calendar day, e.g. "2026-11-15". */
export function dayKey(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export const statsFor = (journal: Journal, day: string): DayStats => journal.days[day] ?? EMPTY_DAY;
export const eventsFor = (events: Events, day: string): DayEvents => events.days[day] ?? EMPTY_DAY_EVENTS;

/** Keep only the most recent days. */
function prune<T>(days: Record<string, T>): Record<string, T> {
  const keys = Object.keys(days).sort();
  if (keys.length <= HISTORY_DAYS) return days;
  return Object.fromEntries(keys.slice(-HISTORY_DAYS).map((k) => [k, days[k]]));
}

// ---------------------------------------------------------------- journal: one tick per second
export interface Tick {
  state: PetState;
  blinkRate: number;
  /** Seconds this tick stands for (1, or more in demo mode). */
  seconds: number;
  /** Corn paid out for sitting upright during this tick. */
  cornEarned?: number;
}

export function tickJournal(journal: Journal, tick: Tick, day: string = dayKey()): Journal {
  const { state, blinkRate, seconds } = tick;
  const d: DayStats = { ...statsFor(journal, day) };
  const life = { ...journal.life };
  let { streakSec, wasSlouching } = journal;

  if (state === 'NEUTRAL' || state === 'THRIVING') {
    d.uprightSec += seconds;
    life.uprightSec += seconds;
    if (blinkRate >= HEALTHY_BLINK_RATE) d.goodBlinkSec += seconds;
    if (wasSlouching) {
      d.recoveries += 1;
      life.recoveries += 1;
      wasSlouching = false;
    }
    streakSec += seconds;
    d.bestStreakSec = Math.max(d.bestStreakSec, streakSec);
    life.bestStreakSec = Math.max(life.bestStreakSec, streakSec);
  } else if (state === 'SLOUCHING' || state === 'WILTED') {
    d.slouchSec += seconds;
    streakSec = 0;
    wasSlouching = true;
  } else if (state === 'AWAY') {
    // Stepping away is not slouching: the streak pauses instead of resetting
    d.awaySec += seconds;
  }
  d.cornFromSitting += tick.cornEarned ?? 0;

  return { days: prune({ ...journal.days, [day]: d }), streakSec, wasSlouching, life };
}

// ---------------------------------------------------------------- events
function withDay(events: Events, day: string, change: (d: DayEvents) => DayEvents): Events {
  return { ...events, days: prune({ ...events.days, [day]: change(eventsFor(events, day)) }) };
}

export function recordFeed(events: Events, day: string = dayKey()): Events {
  const next = withDay(events, day, (d) => ({ ...d, feeds: d.feeds + 1 }));
  return { ...next, life: { ...next.life, feeds: next.life.feeds + 1 } };
}

/** Mark a stretch as done today (each stretch counts once a day). */
export function recordStretch(events: Events, cue: string, day: string = dayKey()): Events {
  if (eventsFor(events, day).stretches.includes(cue)) return events;
  const next = withDay(events, day, (d) => ({ ...d, stretches: [...d.stretches, cue] }));
  return { ...next, life: { ...next.life, stretches: next.life.stretches + 1 } };
}

export function recordGame(events: Events, score: number, day: string = dayKey()): Events {
  const next = withDay(events, day, (d) => ({ ...d, games: d.games + 1, gameBest: Math.max(d.gameBest, score) }));
  return { ...next, life: { ...next.life, games: next.life.games + 1, gameBest: Math.max(next.life.gameBest, score) } };
}

// ---------------------------------------------------------------- daily quests
export interface Quest {
  id: string;
  title: string;
  description: string;
  /** Corn paid when claimed. */
  reward: number;
  target: number;
  /** How far along the user is today, in the same unit as `target`. */
  progress: (stats: DayStats, events: DayEvents) => number;
  /** Show progress as minutes (the values are seconds). */
  inMinutes?: boolean;
}

export const QUESTS: Quest[] = [
  {
    id: 'sit-tall',
    title: 'Sit tall',
    description: 'Sit upright for 10 minutes today.',
    reward: 5,
    target: 600,
    inMinutes: true,
    progress: (s) => s.uprightSec,
  },
  {
    id: 'bounce-back',
    title: 'Bounce back',
    description: 'Catch yourself slouching and sit back up 3 times.',
    reward: 3,
    target: 3,
    progress: (s) => s.recoveries,
  },
  {
    id: 'bright-eyes',
    title: 'Bright eyes',
    description: 'Keep a healthy blink rate for 5 minutes.',
    reward: 3,
    target: 300,
    inMinutes: true,
    progress: (s) => s.goodBlinkSec,
  },
  {
    id: 'limber-up',
    title: 'Limber up',
    description: 'Do 2 different stretches from the Stretches list.',
    reward: 2,
    target: 2,
    progress: (_, e) => e.stretches.length,
  },
  {
    id: 'dinner-time',
    title: 'Dinner time',
    description: 'Feed your duck once.',
    reward: 2,
    target: 1,
    progress: (_, e) => e.feeds,
  },
  {
    id: 'dash-300',
    title: 'Quick feet',
    description: 'Score 300 or more in Duck Dash.',
    reward: 3,
    target: 300,
    progress: (_, e) => e.gameBest,
  },
];

export type QuestStatus = 'IN_PROGRESS' | 'READY' | 'CLAIMED';

export function questStatus(quest: Quest, stats: DayStats, events: DayEvents): QuestStatus {
  if (events.claimed.includes(quest.id)) return 'CLAIMED';
  return quest.progress(stats, events) >= quest.target ? 'READY' : 'IN_PROGRESS';
}

/** Collect a finished quest. Returns the same object if it isn't ready or was already claimed. */
export function claimQuest(events: Events, quest: Quest, stats: DayStats, day: string = dayKey()): Events {
  if (questStatus(quest, stats, eventsFor(events, day)) !== 'READY') return events;
  return withDay(events, day, (d) => ({ ...d, claimed: [...d.claimed, quest.id] }));
}

// ---------------------------------------------------------------- achievements (lifetime)
export interface Achievement {
  id: string;
  icon: string;
  title: string;
  description: string;
  unlocked: (pet: PetProfile, journal: Journal, events: Events) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'hatched', icon: '🐣', title: 'Hello, world', description: 'Hatch your egg.', unlocked: (p) => p.level >= HATCH_LEVEL },
  { id: 'grown', icon: '🦆', title: 'All grown up', description: 'Raise a fully grown duck.', unlocked: (p) => p.level >= ADULT_LEVEL },
  { id: 'named', icon: '🏷️', title: 'On a first-name basis', description: 'Give your duck its own name.', unlocked: (p) => p.name !== DEFAULT_NAME },
  { id: 'corn-100', icon: '🌽', title: 'Corn baron', description: 'Earn 100 corn in total.', unlocked: (p) => p.cornEarned >= 100 },
  { id: 'fed-5', icon: '🍽️', title: 'Well fed', description: 'Feed your duck 5 times.', unlocked: (_, __, e) => e.life.feeds >= 5 },
  { id: 'dressed', icon: '🎩', title: 'Dressed to impress', description: 'Own 3 pieces of clothing.', unlocked: (p) => p.owned.length >= 3 },
  { id: 'wardrobe', icon: '👑', title: 'Full wardrobe', description: 'Own every piece of clothing.', unlocked: (p) => p.owned.length >= COSMETICS.length },
  { id: 'streak-30', icon: '🧘', title: 'Iron spine', description: 'Sit upright for 30 minutes without slouching.', unlocked: (_, j) => j.life.bestStreakSec >= 1800 },
  { id: 'recover-10', icon: '💪', title: 'Comeback kid', description: 'Sit back up after a slouch 10 times.', unlocked: (_, j) => j.life.recoveries >= 10 },
  { id: 'stretch-10', icon: '🤸', title: 'Bendy', description: 'Do 10 stretches.', unlocked: (_, __, e) => e.life.stretches >= 10 },
  { id: 'dash-500', icon: '🏃', title: 'Dash champion', description: 'Score 500 or more in Duck Dash.', unlocked: (_, __, e) => e.life.gameBest >= 500 },
];

// ---------------------------------------------------------------- storage
export const JOURNAL_STORAGE_KEY = 'ergogotchi.journal';
export const EVENTS_STORAGE_KEY = 'ergogotchi.events';

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

export function sanitizeJournal(raw: unknown): Journal {
  const r = obj(raw);
  const days: Record<string, DayStats> = {};
  for (const [day, value] of Object.entries(obj(r.days))) {
    const d = obj(value);
    days[day] = {
      uprightSec: num(d.uprightSec),
      slouchSec: num(d.slouchSec),
      awaySec: num(d.awaySec),
      goodBlinkSec: num(d.goodBlinkSec),
      recoveries: num(d.recoveries),
      bestStreakSec: num(d.bestStreakSec),
      cornFromSitting: num(d.cornFromSitting),
    };
  }
  const life = obj(r.life);
  return {
    days: prune(days),
    streakSec: num(r.streakSec),
    wasSlouching: r.wasSlouching === true,
    life: { uprightSec: num(life.uprightSec), recoveries: num(life.recoveries), bestStreakSec: num(life.bestStreakSec) },
  };
}

export function sanitizeEvents(raw: unknown): Events {
  const r = obj(raw);
  const days: Record<string, DayEvents> = {};
  for (const [day, value] of Object.entries(obj(r.days))) {
    const d = obj(value);
    days[day] = {
      claimed: strings(d.claimed),
      stretches: strings(d.stretches),
      feeds: num(d.feeds),
      games: num(d.games),
      gameBest: num(d.gameBest),
    };
  }
  const life = obj(r.life);
  return {
    days: prune(days),
    life: { feeds: num(life.feeds), games: num(life.games), gameBest: num(life.gameBest), stretches: num(life.stretches) },
  };
}

function read(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}
function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable: the journal just won't persist
  }
}

export const loadJournal = (): Journal => sanitizeJournal(read(JOURNAL_STORAGE_KEY));
export const loadEvents = (): Events => sanitizeEvents(read(EVENTS_STORAGE_KEY));

/** Apply a change to the stored journal and return the result. */
export function updateJournal(change: (journal: Journal) => Journal): Journal {
  const next = change(loadJournal());
  write(JOURNAL_STORAGE_KEY, next);
  return next;
}

/** Apply a change to the stored events and return the result. */
export function updateEvents(change: (events: Events) => Events): Events {
  const next = change(loadEvents());
  write(EVENTS_STORAGE_KEY, next);
  return next;
}
