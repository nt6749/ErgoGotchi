import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  claimQuest,
  dayKey,
  eventsFor,
  HISTORY_DAYS,
  NEW_EVENTS,
  NEW_JOURNAL,
  QUESTS,
  questStatus,
  recordFeed,
  recordGame,
  recordStretch,
  sanitizeEvents,
  sanitizeJournal,
  statsFor,
  tickJournal,
  type Journal,
} from './journal';
import { ADULT_LEVEL, NEW_PET } from './progression';

const DAY = '2026-11-15';
const upright = (j: Journal, seconds = 1, blinkRate = 14, day = DAY) =>
  tickJournal(j, { state: 'NEUTRAL', blinkRate, seconds }, day);
const slouch = (j: Journal, seconds = 1, day = DAY) => tickJournal(j, { state: 'SLOUCHING', blinkRate: 14, seconds }, day);
const quest = (id: string) => QUESTS.find((q) => q.id === id)!;

describe('posture journal', () => {
  it('formats the local day', () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('counts upright, slouching and away time separately', () => {
    let j = upright(NEW_JOURNAL, 10);
    j = slouch(j, 4);
    j = tickJournal(j, { state: 'AWAY', blinkRate: 0, seconds: 7 }, DAY);
    j = tickJournal(j, { state: 'CALIBRATING', blinkRate: 0, seconds: 99 }, DAY);
    expect(statsFor(j, DAY)).toMatchObject({ uprightSec: 10, slouchSec: 4, awaySec: 7 });
  });

  it('only counts healthy-blink time while upright', () => {
    let j = upright(NEW_JOURNAL, 5, 14);
    j = upright(j, 5, 4);
    expect(statsFor(j, DAY).goodBlinkSec).toBe(5);
  });

  it('counts one recovery each time the user sits back up', () => {
    let j = upright(NEW_JOURNAL);
    j = slouch(slouch(j));
    j = upright(upright(j));
    j = slouch(j);
    j = upright(j);
    expect(statsFor(j, DAY).recoveries).toBe(2);
    expect(j.life.recoveries).toBe(2);
  });

  it('tracks the longest unbroken upright streak; slouching resets it, stepping away only pauses it', () => {
    let j = upright(NEW_JOURNAL, 30);
    j = tickJournal(j, { state: 'AWAY', blinkRate: 0, seconds: 60 }, DAY);
    j = upright(j, 20);
    expect(statsFor(j, DAY).bestStreakSec).toBe(50);
    j = slouch(j);
    j = upright(j, 10);
    expect(statsFor(j, DAY).bestStreakSec).toBe(50);
    expect(j.streakSec).toBe(10);
  });

  it('adds up corn earned from sitting', () => {
    const j = tickJournal(NEW_JOURNAL, { state: 'NEUTRAL', blinkRate: 14, seconds: 1, cornEarned: 1 }, DAY);
    expect(statsFor(j, DAY).cornFromSitting).toBe(1);
  });

  it('keeps only the last week of days', () => {
    let j = NEW_JOURNAL;
    for (let d = 1; d <= HISTORY_DAYS + 3; d++) j = upright(j, 1, 14, `2026-11-${String(d).padStart(2, '0')}`);
    expect(Object.keys(j.days)).toHaveLength(HISTORY_DAYS);
    expect(j.days['2026-11-01']).toBeUndefined();
    expect(j.life.uprightSec).toBe(HISTORY_DAYS + 3);
  });
});

describe('events', () => {
  it('counts feeds and games, and remembers the best score', () => {
    let e = recordFeed(recordFeed(NEW_EVENTS, DAY), DAY);
    e = recordGame(recordGame(e, 420, DAY), 150, DAY);
    expect(eventsFor(e, DAY)).toMatchObject({ feeds: 2, games: 2, gameBest: 420 });
    expect(e.life).toMatchObject({ feeds: 2, games: 2, gameBest: 420 });
  });

  it('counts each stretch once a day', () => {
    let e = recordStretch(NEW_EVENTS, 'CHIN_TUCK', DAY);
    expect(recordStretch(e, 'CHIN_TUCK', DAY)).toBe(e);
    e = recordStretch(e, 'SIT_BACK', DAY);
    expect(eventsFor(e, DAY).stretches).toEqual(['CHIN_TUCK', 'SIT_BACK']);
    expect(recordStretch(e, 'CHIN_TUCK', '2026-11-16').life.stretches).toBe(3);
  });
});

describe('daily quests', () => {
  it('has unique ids, positive rewards and targets', () => {
    expect(new Set(QUESTS.map((q) => q.id)).size).toBe(QUESTS.length);
    for (const q of QUESTS) {
      expect(q.reward).toBeGreaterThan(0);
      expect(q.target).toBeGreaterThan(0);
    }
  });

  it('goes from in progress to ready to claimed', () => {
    const sit = quest('sit-tall');
    let j = upright(NEW_JOURNAL, sit.target - 1);
    expect(questStatus(sit, statsFor(j, DAY), eventsFor(NEW_EVENTS, DAY))).toBe('IN_PROGRESS');
    j = upright(j, 1);
    expect(questStatus(sit, statsFor(j, DAY), eventsFor(NEW_EVENTS, DAY))).toBe('READY');
    const claimed = claimQuest(NEW_EVENTS, sit, statsFor(j, DAY), DAY);
    expect(questStatus(sit, statsFor(j, DAY), eventsFor(claimed, DAY))).toBe('CLAIMED');
  });

  it('cannot be claimed early or twice', () => {
    const feedQuest = quest('dinner-time');
    expect(claimQuest(NEW_EVENTS, feedQuest, statsFor(NEW_JOURNAL, DAY), DAY)).toBe(NEW_EVENTS);
    const fed = recordFeed(NEW_EVENTS, DAY);
    const claimed = claimQuest(fed, feedQuest, statsFor(NEW_JOURNAL, DAY), DAY);
    expect(claimed).not.toBe(fed);
    expect(claimQuest(claimed, feedQuest, statsFor(NEW_JOURNAL, DAY), DAY)).toBe(claimed);
  });

  it('resets the next day', () => {
    const feedQuest = quest('dinner-time');
    const claimed = claimQuest(recordFeed(NEW_EVENTS, DAY), feedQuest, statsFor(NEW_JOURNAL, DAY), DAY);
    expect(questStatus(feedQuest, statsFor(NEW_JOURNAL, '2026-11-16'), eventsFor(claimed, '2026-11-16'))).toBe('IN_PROGRESS');
  });

  it('follows the game score and stretches', () => {
    const e = recordStretch(recordStretch(recordGame(NEW_EVENTS, 310, DAY), 'CHIN_TUCK', DAY), 'LOOK_AWAY', DAY);
    const stats = statsFor(NEW_JOURNAL, DAY);
    expect(questStatus(quest('dash-300'), stats, eventsFor(e, DAY))).toBe('READY');
    expect(questStatus(quest('limber-up'), stats, eventsFor(e, DAY))).toBe('READY');
  });
});

describe('achievements', () => {
  const unlocked = (id: string, ...args: Parameters<(typeof ACHIEVEMENTS)[number]['unlocked']>) =>
    ACHIEVEMENTS.find((a) => a.id === id)!.unlocked(...args);

  it('starts with nothing unlocked', () => {
    for (const a of ACHIEVEMENTS) expect(a.unlocked(NEW_PET, NEW_JOURNAL, NEW_EVENTS), a.id).toBe(false);
  });

  it('unlocks from the pet, the journal and the events', () => {
    expect(unlocked('grown', { ...NEW_PET, level: ADULT_LEVEL }, NEW_JOURNAL, NEW_EVENTS)).toBe(true);
    expect(unlocked('named', { ...NEW_PET, name: 'Quackers' }, NEW_JOURNAL, NEW_EVENTS)).toBe(true);
    expect(unlocked('streak-30', NEW_PET, upright(NEW_JOURNAL, 1800), NEW_EVENTS)).toBe(true);
    expect(unlocked('dash-500', NEW_PET, NEW_JOURNAL, recordGame(NEW_EVENTS, 500, DAY))).toBe(true);
  });
});

describe('stored journal and events', () => {
  it('repairs junk', () => {
    expect(sanitizeJournal(null)).toEqual(NEW_JOURNAL);
    expect(sanitizeJournal({ days: 'x', streakSec: -4, life: 7 })).toEqual(NEW_JOURNAL);
    expect(sanitizeEvents('nope')).toEqual(NEW_EVENTS);
    expect(sanitizeEvents({ days: { [DAY]: { claimed: [1, 'a'], feeds: NaN } } }).days[DAY]).toEqual({
      claimed: ['a'],
      stretches: [],
      feeds: 0,
      games: 0,
      gameBest: 0,
    });
  });

  it('round-trips valid data', () => {
    const j = slouch(upright(NEW_JOURNAL, 12));
    expect(sanitizeJournal(JSON.parse(JSON.stringify(j)))).toEqual(j);
    const e = recordGame(recordFeed(NEW_EVENTS, DAY), 99, DAY);
    expect(sanitizeEvents(JSON.parse(JSON.stringify(e)))).toEqual(e);
  });
});
