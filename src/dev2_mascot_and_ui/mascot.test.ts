import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { ADULT_ACTIVITY, BABY_ACTIVITY } from './activitySprites';
import { DUCK_H, DUCK_SPRITES, DUCK_W, PALETTE, type DuckFrame } from './duckSprites';
import { BABY_SPRITES, EGG_SPRITES, HATCH_FRAMES, HATCH_MS } from './lifeStageSprites';
import { DEFAULT_LOOK, pickActivityPose, pickFrames, type MascotLook } from './PixelMascot';
import { COSMETICS, dress } from './cosmetics';
import { DUCK } from './duckSprites';
import { BABY } from './lifeStageSprites';
import {
  ADULT_LEVEL,
  buy,
  canFeed,
  cornInterval,
  cornNeeded,
  cornToLevelUp,
  DEFAULT_NAME,
  earnCorn,
  earnsCorn,
  equip,
  feed,
  grantCorn,
  HATCH_LEVEL,
  MAX_NAME_LENGTH,
  NEW_PET,
  rename,
  sanitizePet,
  stageForLevel,
  stageOf,
  startOver,
  type PetProfile,
} from './progression';

const require = createRequire(import.meta.url);
const { classifyActivity } = require('../../electron/activityClassifier.cjs');

const pet = (over: Partial<PetProfile> = {}): PetProfile => ({ ...NEW_PET, ...over });
const TOP_HAT = COSMETICS.find((c) => c.id === 'top-hat')!;
const BOW_TIE = COSMETICS.find((c) => c.id === 'bow-tie')!;

describe('corn: earning, feeding and growing', () => {
  it('starts as a level 1 egg with no corn', () => {
    expect(NEW_PET).toMatchObject({ level: 1, corn: 0, name: DEFAULT_NAME });
    expect(stageOf(NEW_PET)).toBe('EGG');
  });

  it('only upright sitting counts towards corn, and demo mode pays out faster', () => {
    expect(earnsCorn('NEUTRAL')).toBe(true);
    expect(earnsCorn('THRIVING')).toBe(true);
    for (const state of ['SLOUCHING', 'WILTED', 'AWAY', 'CALIBRATING'] as const) {
      expect(earnsCorn(state)).toBe(false);
    }
    expect(cornInterval(true)).toBeLessThan(cornInterval(false));
  });

  it('earned corn is counted in the all-time total, granted corn is not', () => {
    expect(earnCorn(pet({ corn: 2, cornEarned: 5 }), 1)).toMatchObject({ corn: 3, cornEarned: 6 });
    expect(grantCorn(pet({ corn: 2, cornEarned: 5 }), 10)).toMatchObject({ corn: 12, cornEarned: 5 });
  });

  it('each level costs more corn: 10, 20, 30', () => {
    expect([1, 2, 3].map(cornToLevelUp)).toEqual([10, 20, 30]);
    expect(cornNeeded(pet({ level: 3 }))).toBe(30);
  });

  it('feeding spends the corn needed and levels up', () => {
    const fed = feed(pet({ corn: 25 }));
    expect(fed).toMatchObject({ level: 2, corn: 15 });
    expect(canFeed(fed)).toBe(false); // level 2 needs 20
  });

  it('refuses to eat when there is not enough corn', () => {
    const hungry = pet({ corn: 9 });
    expect(canFeed(hungry)).toBe(false);
    expect(feed(hungry)).toBe(hungry);
  });

  it('hatches into a baby, then grows into the adult duck', () => {
    expect(stageForLevel(HATCH_LEVEL - 1)).toBe('EGG');
    expect(stageForLevel(HATCH_LEVEL)).toBe('BABY');
    expect(stageForLevel(ADULT_LEVEL - 1)).toBe('BABY');
    expect(stageForLevel(ADULT_LEVEL)).toBe('ADULT');
  });

  it('starting over keeps the name and the clothes', () => {
    const before = pet({ level: 5, corn: 40, name: 'Quackers', owned: ['top-hat'], equipped: { hat: 'top-hat' } });
    expect(startOver(before)).toMatchObject({ level: 1, corn: 0, name: 'Quackers', owned: ['top-hat'] });
  });
});

describe('name', () => {
  it('trims, collapses spaces and caps the length', () => {
    expect(rename(pet(), '  Sir   Quacks  ').name).toBe('Sir Quacks');
    expect(rename(pet(), 'x'.repeat(50)).name).toHaveLength(MAX_NAME_LENGTH);
  });

  it('falls back to the default for an empty name', () => {
    expect(rename(pet({ name: 'Old' }), '   ').name).toBe(DEFAULT_NAME);
  });
});

describe('clothes', () => {
  const duckling = pet({ level: HATCH_LEVEL, corn: 50 });

  it('buying spends corn and puts the item on', () => {
    const bought = buy(duckling, TOP_HAT);
    expect(bought).toMatchObject({ corn: 50 - TOP_HAT.price, owned: ['top-hat'], equipped: { hat: 'top-hat' } });
  });

  it('cannot buy without enough corn, twice, or for an egg', () => {
    const poor = pet({ level: HATCH_LEVEL, corn: TOP_HAT.price - 1 });
    expect(buy(poor, TOP_HAT)).toBe(poor);
    const bought = buy(duckling, TOP_HAT);
    expect(buy(bought, TOP_HAT)).toBe(bought);
    const egg = pet({ level: 1, corn: 999 });
    expect(buy(egg, TOP_HAT)).toBe(egg);
  });

  it('wears one item per slot and can take it off', () => {
    let p = buy(buy(duckling, TOP_HAT), BOW_TIE);
    expect(p.equipped).toEqual({ hat: 'top-hat', neck: 'bow-tie' });
    p = equip(p, 'hat', null);
    expect(p.equipped).toEqual({ neck: 'bow-tie' });
    expect(equip(p, 'hat', 'crown')).toBe(p); // not owned
    expect(equip(p, 'hat', 'top-hat').equipped.hat).toBe('top-hat');
  });

  it('every item draws inside the sprite, on both the baby and the grown duck', () => {
    for (const item of COSMETICS) {
      for (const [stage, base] of [['ADULT', DUCK], ['BABY', BABY]] as const) {
        const dressed = dress(base, stage, { [item.slot]: item.id });
        expect(dressed, `${item.id} on ${stage} changes the sprite`).not.toEqual(base);
        expect(dressed.length).toBe(base.length);
        for (const row of dressed) {
          expect(row.length, `${item.id} on ${stage} row width`).toBe(DUCK_W);
          for (const ch of row) if (ch !== '.') expect(PALETTE[ch], `${item.id} colour '${ch}'`).toBeDefined();
        }
      }
    }
  });

  it('the egg never wears anything', () => {
    expect(dress(DUCK, 'EGG', { hat: 'top-hat' })).toBe(DUCK);
  });

  it('has unique ids and positive prices', () => {
    expect(new Set(COSMETICS.map((c) => c.id)).size).toBe(COSMETICS.length);
    for (const c of COSMETICS) expect(c.price).toBeGreaterThan(0);
  });
});

describe('stored profile', () => {
  it('repairs junk into a valid pet', () => {
    expect(sanitizePet(null)).toEqual(NEW_PET);
    expect(sanitizePet('nope')).toEqual(NEW_PET);
    expect(sanitizePet({ level: -3, corn: NaN, name: 42, owned: 'x', equipped: 7 })).toEqual(NEW_PET);
  });

  it('keeps valid data and drops clothes that are worn but not owned', () => {
    const stored = { name: 'Quackers', level: 3, corn: 12.9, cornEarned: 70, owned: ['scarf'], equipped: { hat: 'crown', neck: 'scarf' } };
    expect(sanitizePet(stored)).toEqual({
      name: 'Quackers',
      level: 3,
      corn: 12,
      cornEarned: 70,
      owned: ['scarf'],
      equipped: { neck: 'scarf' },
    });
  });
});

describe('sprite art', () => {
  const groups: Record<string, Record<string, DuckFrame[]>> = {
    adult: DUCK_SPRITES,
    egg: EGG_SPRITES,
    baby: BABY_SPRITES,
    hatch: { HATCH: HATCH_FRAMES },
    adultActivity: ADULT_ACTIVITY,
    babyActivity: BABY_ACTIVITY,
  };

  for (const [group, sprites] of Object.entries(groups)) {
    it(`${group}: every frame is a clean grid using known colours`, () => {
      for (const [name, frames] of Object.entries(sprites)) {
        expect(frames.length, `${group}.${name} has frames`).toBeGreaterThan(0);
        frames.forEach((frame, i) => {
          const where = `${group}.${name}[${i}]`;
          expect(frame.rows.length, `${where} height`).toBe(DUCK_H);
          const width = frame.rows[0].length;
          expect(width, `${where} width`).toBeGreaterThanOrEqual(DUCK_W);
          for (const row of frame.rows) {
            expect(row.length, `${where} row width`).toBe(width);
            for (const ch of row) {
              if (ch !== '.') expect(PALETTE[ch], `${where} colour '${ch}'`).toBeDefined();
            }
          }
          // Animated sprites need a duration on every frame, or the animation would spin
          if (frames.length > 1) expect(frame.ms, `${where} duration`).toBeGreaterThan(0);
        });
      }
    });
  }

  it('the egg and the baby cover every look the grown duck has', () => {
    expect(Object.keys(EGG_SPRITES).sort()).toEqual(Object.keys(DUCK_SPRITES).sort());
    expect(Object.keys(BABY_SPRITES).sort()).toEqual(Object.keys(DUCK_SPRITES).sort());
  });

  it('the hatching animation has a sensible length', () => {
    expect(HATCH_MS).toBeGreaterThan(1500);
    expect(HATCH_MS).toBeLessThan(5000);
  });
});

describe('choosing what to draw', () => {
  const look = (over: Partial<MascotLook>): MascotLook => ({ ...DEFAULT_LOOK, ...over });

  it('maps activity to a pose', () => {
    expect(pickActivityPose({ scene: 'WATCHING', music: false })).toBe('WATCHING');
    expect(pickActivityPose({ scene: 'WATCHING', music: true })).toBe('WATCHING');
    expect(pickActivityPose({ scene: 'WORKING', music: false })).toBe('WORKING');
    expect(pickActivityPose({ scene: 'WORKING', music: true })).toBe('WORKING_MUSIC');
    expect(pickActivityPose({ scene: 'IDLE', music: true })).toBe('MUSIC');
    expect(pickActivityPose({ scene: 'IDLE', music: false })).toBeNull();
  });

  it('shows the activity pose while posture is fine', () => {
    const watching = look({ activity: { scene: 'WATCHING', music: false } });
    expect(pickFrames('NEUTRAL', 90, null, watching).key).toBe('ADULT:WATCHING');
    expect(pickFrames('THRIVING', 90, null, look({ ...watching, stage: 'BABY' })).key).toBe('BABY:WATCHING');
  });

  it('lets posture warnings win over the activity pose', () => {
    const working = look({ activity: { scene: 'WORKING', music: true } });
    expect(pickFrames('SLOUCHING', 40, null, working).key).toBe('ADULT:SLOUCHING');
    expect(pickFrames('WILTED', 5, null, working).key).toBe('ADULT:WILTED');
    expect(pickFrames('NEUTRAL', 90, 'KNIFE', working).key).toBe('ADULT:KNIFE');
    expect(pickFrames('NEUTRAL', 30, null, working).key).toBe('ADULT:TIRED');
    expect(pickFrames('SLOUCHING', 40, null, look({ ...working, stage: 'BABY' })).key).toBe('BABY:SLOUCHING');
  });

  it('the egg warns about posture but ignores activities', () => {
    const egg = look({ stage: 'EGG', activity: { scene: 'WATCHING', music: true } });
    expect(pickFrames('NEUTRAL', 90, null, egg).key).toBe('EGG:NEUTRAL');
    expect(pickFrames('SLOUCHING', 40, null, egg).key).toBe('EGG:SLOUCHING');
  });

  it('draws clothes on the baby and the grown duck, and returns the same frames each time', () => {
    const dressed = look({ outfit: { hat: 'top-hat' } });
    const first = pickFrames('NEUTRAL', 90, null, dressed).frames;
    expect(first).not.toBe(pickFrames('NEUTRAL', 90, null, look({})).frames);
    // Same array on the next render, or the frame animation would restart every time
    expect(pickFrames('NEUTRAL', 90, null, look({ outfit: { hat: 'top-hat' } })).frames).toBe(first);
    expect(pickFrames('NEUTRAL', 90, null, look({ ...dressed, stage: 'BABY' })).frames[0].rows).not.toEqual(BABY);
  });

  it('keeps clothes off the egg and off the slouched / flopped grown duck', () => {
    const outfit = { hat: 'top-hat' };
    expect(pickFrames('NEUTRAL', 90, null, look({ stage: 'EGG', outfit })).frames).toBe(
      pickFrames('NEUTRAL', 90, null, look({ stage: 'EGG' })).frames
    );
    for (const state of ['SLOUCHING', 'WILTED'] as const) {
      expect(pickFrames(state, 20, null, look({ outfit })).frames).toBe(pickFrames(state, 20, null, look({})).frames);
    }
  });

  it('plays the hatching frames while hatching', () => {
    expect(pickFrames('NEUTRAL', 90, null, look({ stage: 'EGG', hatching: true })).frames).toBe(HATCH_FRAMES);
  });
});

describe('activity detection from the foreground window', () => {
  const c = (proc: string, title = '', spotifyTitle = '') => classifyActivity({ proc, title, spotifyTitle });

  it('YouTube and friends mean watching', () => {
    expect(c('chrome', 'Lofi beats - YouTube - Google Chrome')).toEqual({ scene: 'WATCHING', music: false });
    expect(c('msedge', 'Stranger Things | Netflix')).toEqual({ scene: 'WATCHING', music: false });
    expect(c('vlc', 'movie.mp4 - VLC media player')).toEqual({ scene: 'WATCHING', music: false });
  });

  it('music apps mean music, and YouTube Music is not "watching"', () => {
    expect(c('Spotify', 'Spotify Premium')).toEqual({ scene: 'IDLE', music: true });
    expect(c('chrome', 'YouTube Music - Google Chrome')).toEqual({ scene: 'IDLE', music: true });
  });

  it('Spotify playing in the background adds music to whatever is in front', () => {
    expect(c('Code', 'App.tsx - Visual Studio Code', 'Daft Punk - One More Time')).toEqual({
      scene: 'WORKING',
      music: true,
    });
    // Paused Spotify shows only its own name
    expect(c('Code', 'App.tsx - Visual Studio Code', 'Spotify Free')).toEqual({ scene: 'WORKING', music: false });
  });

  it('editors, terminals and work sites mean working', () => {
    expect(c('Code.exe', 'x').scene).toBe('WORKING');
    expect(c('WindowsTerminal', 'pwsh').scene).toBe('WORKING');
    expect(c('chrome', 'nt6749/sunhacks-project2 - GitHub - Google Chrome').scene).toBe('WORKING');
  });

  it('anything else is idle', () => {
    expect(c('explorer', 'Downloads')).toEqual({ scene: 'IDLE', music: false });
    expect(c('chrome', 'Math.max() - JavaScript | MDN')).toEqual({ scene: 'IDLE', music: false });
    expect(c('', '')).toEqual({ scene: 'IDLE', music: false });
  });

  it("ignores ErgoGotchi's own windows", () => {
    expect(c('electron', 'ErgoGotchi · sunhacks 2026')).toBeNull();
  });
});
