/**
 * "My DuckDuck" dashboard tab: the pet's profile (name, avatar, level, corn)
 * and its wardrobe, where corn buys clothes for the baby and grown duck.
 */

import React, { useEffect, useState } from 'react';
import { COSMETICS, dress, SLOT_LABELS, type Cosmetic } from './cosmetics';
import { DUCK } from './duckSprites';
import { BABY } from './lifeStageSprites';
import { DEFAULT_LOOK, PixelArt, renderPixelMascot } from './PixelMascot';
import {
  ADULT_LEVEL,
  buy,
  canFeed,
  canWearClothes,
  cornNeeded,
  equip,
  HATCH_LEVEL,
  MAX_NAME_LENGTH,
  rename,
  STAGE_TITLES,
  stageOf,
  type CosmeticSlot,
  type PetProfile,
} from './progression';
import { BAD_TEXT, BUTTON_NEUTRAL, BUTTON_PRIMARY, BUTTON_SELECTED, CARD, GOOD_TEXT, LABEL, MUTED, TRACK } from './theme';
import { DEFAULT_SKIN, EGG_SHELL_SKINS, type EggShellSkin } from './eggShellSkins';

interface MyDuckProps {
  pet: PetProfile;
  /** Apply a change to the stored pet profile. */
  onPetChange: (change: (pet: PetProfile) => PetProfile) => void;
  /** Feed the pet; true if it ate. */
  onFeed: () => boolean;
  /** Seconds of upright sitting that earn one corn right now (depends on demo mode). */
  cornEverySeconds: number;
  isLocked?: boolean;
  onToggleLock?: (locked: boolean) => void;
  skin?: EggShellSkin;
  onSelectSkin?: (skin: EggShellSkin) => void;
}

const SLOTS: CosmeticSlot[] = ['hat', 'face', 'neck'];

export const MyDuck: React.FC<MyDuckProps> = ({
  pet,
  onPetChange,
  onFeed,
  cornEverySeconds,
  isLocked = true,
  onToggleLock,
  skin = DEFAULT_SKIN,
  onSelectSkin,
}) => {
  const stage = stageOf(pet);
  const need = cornNeeded(pet);
  const enough = canFeed(pet);
  const dressable = canWearClothes(pet);

  // Rename: edit a draft, save on Enter or the button
  const [draftName, setDraftName] = useState(pet.name);
  useEffect(() => setDraftName(pet.name), [pet.name]);
  const saveName = () => onPetChange((p) => rename(p, draftName));

  const nextMilestone =
    pet.level < HATCH_LEVEL
      ? `Hatches at level ${HATCH_LEVEL}`
      : pet.level < ADULT_LEVEL
        ? `Fully grown at level ${ADULT_LEVEL}`
        : 'Fully grown';

  const stats: Array<[string, string]> = [
    ['Level', String(pet.level)],
    ['Stage', STAGE_TITLES[stage]],
    ['Corn in pantry', `${pet.corn} 🌽`],
    ['Corn earned all time', `${pet.cornEarned} 🌽`],
    ['Next level costs', `${need} 🌽`],
    ['Next milestone', nextMilestone],
    ['Clothes owned', `${pet.owned.length} / ${COSMETICS.length}`],
    ['Earning rate', `1 🌽 per ${cornEverySeconds}s sitting upright`],
  ];

  // Wardrobe previews are drawn on the stage the pet is in (or the baby, while it is still an egg)
  const previewStage = stage === 'ADULT' ? 'ADULT' : 'BABY';
  const previewBase = previewStage === 'ADULT' ? DUCK : BABY;

  const itemButton = (item: Cosmetic) => {
    const owned = pet.owned.includes(item.id);
    const wearing = pet.equipped[item.slot] === item.id;
    const full = 'w-full !text-[11px] !px-2 !py-1';
    if (!dressable) {
      return (
        <button disabled className={`${BUTTON_NEUTRAL} ${full}`}>
          Hatch first
        </button>
      );
    }
    if (wearing) {
      return (
        <button
          onClick={() => onPetChange((p) => equip(p, item.slot, null))}
          className={`${BUTTON_SELECTED} ${full}`}
        >
          Wearing · take off
        </button>
      );
    }
    if (owned) {
      return (
        <button
          onClick={() => onPetChange((p) => equip(p, item.slot, item.id))}
          className={`${BUTTON_NEUTRAL} ${full}`}
        >
          Wear
        </button>
      );
    }
    const affordable = pet.corn >= item.price;
    return (
      <button
        disabled={!affordable}
        onClick={() => onPetChange((p) => buy(p, item))}
        className={`${BUTTON_PRIMARY} ${full}`}
      >
        {affordable ? `Buy · ${item.price} 🌽` : `${item.price} 🌽 · need ${item.price - pet.corn} more`}
      </button>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* Profile */}
      <div className="lg:col-span-2 space-y-4">
        <div className={`${CARD} p-5 flex flex-col items-center text-center`}>
          <div className="w-44 h-36 rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent)] flex items-end justify-center pb-2 overflow-hidden">
            {renderPixelMascot('NEUTRAL', 100, null, { ...DEFAULT_LOOK, stage, outfit: pet.equipped })}
          </div>

          <h2 className="text-xl font-black mt-3">{pet.name}</h2>
          <p className={`text-xs font-semibold ${MUTED}`}>
            {STAGE_TITLES[stage]} · <span className="px-1.5 py-0.5 rounded bg-[var(--accent)] text-[var(--accent-ink)]">Lvl {pet.level}</span>
          </p>

          {/* Rename */}
          <div className="flex gap-2 mt-3 w-full max-w-xs">
            <input
              value={draftName}
              maxLength={MAX_NAME_LENGTH}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                // Keep the app's single-key hotkeys from firing while typing a name
                e.stopPropagation();
                if (e.key === 'Enter') saveName();
              }}
              placeholder="Name your duck"
              aria-label="Duck name"
              className="flex-1 min-w-0 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[var(--chip)] border border-[var(--line)] text-[var(--ink)] select-text focus:outline-none focus:border-[var(--accent)]"
            />
            <button
              onClick={saveName}
              disabled={draftName.trim() === pet.name || !draftName.trim()}
              className={BUTTON_PRIMARY}
            >
              Rename
            </button>
          </div>

          {/* Corn towards the next level */}
          <div className="w-full max-w-xs mt-4">
            <div className="flex items-baseline justify-between">
              <span className={LABEL}>Corn to level up</span>
              <span className={`text-sm font-black ${enough ? GOOD_TEXT : BAD_TEXT}`}>
                {pet.corn}/{need} 🌽
              </span>
            </div>
            <div className={`${TRACK} h-2 mt-1`}>
              <div
                className={`h-full transition-all duration-300 ${enough ? 'bg-[var(--good)]' : 'bg-[var(--accent)]'}`}
                style={{ width: `${Math.min(1, pet.corn / need) * 100}%` }}
              />
            </div>
            <button
              onClick={onFeed}
              disabled={!enough}
              className={`${BUTTON_PRIMARY} w-full mt-3 !py-2`}
            >
              {enough ? `Feed ${pet.name} ${need} 🌽 and level up` : `Needs ${need - pet.corn} more 🌽 to level up`}
            </button>
          </div>
        </div>

        {/* Desktop Pet Position Lock / Unlock */}
        <div className={`${CARD} p-4 flex items-center justify-between`}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">{isLocked ? '🔒' : '🔓'}</span>
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider">
                {isLocked ? 'Desktop Pet: Locked' : 'Desktop Pet: Movable'}
              </h3>
              <p className={`text-[11px] ${MUTED}`}>
                {isLocked
                  ? 'Docked in corner. Click unlock to drag around screen.'
                  : 'Unlocked! Click and drag the egg machine to move it.'}
              </p>
            </div>
          </div>
          <button
            onClick={() => onToggleLock?.(!isLocked)}
            className={isLocked ? BUTTON_NEUTRAL : BUTTON_PRIMARY}
            title={isLocked ? 'Unlock to drag anywhere' : 'Lock position'}
          >
            {isLocked ? 'Unlock 🔓' : 'Lock 🔒'}
          </button>
        </div>

        <div className={`${CARD} p-4`}>
          <h3 className="text-xs font-black uppercase tracking-wider mb-2">Stats</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            {stats.map(([label, value]) => (
              <div key={label}>
                <dt className={LABEL}>{label}</dt>
                <dd className="text-xs font-bold">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Vintage Egg Shell Skins */}
        <div className={`${CARD} p-4 space-y-3`}>
          <div className="flex items-baseline justify-between">
            <h3 className="text-xs font-black uppercase tracking-wider">Egg Shell Skin 🥚</h3>
            <span className="text-[10px] font-bold text-[var(--accent)]">Vintage Editions</span>
          </div>
          <p className={`text-[11px] ${MUTED}`}>
            Change the look of your desktop egg machine. Changes apply immediately!
          </p>

          <div className="space-y-2">
            {(Object.values(EGG_SHELL_SKINS) as (typeof EGG_SHELL_SKINS[EggShellSkin])[]).map((s) => {
              const active = skin === s.id;
              return (
                <div
                  key={s.id}
                  onClick={() => onSelectSkin?.(s.id)}
                  className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                    active
                      ? 'bg-[var(--accent-soft)] border-[var(--accent)] shadow-sm'
                      : 'bg-[var(--chip)] border-[var(--line)] hover:border-[var(--muted)]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {/* Mini Egg Color Indicator */}
                    <div
                      className="w-7 h-9 rounded-[50%_50%_45%_45%_/_60%_60%_40%_40%] border-2 border-black/80 shadow-sm flex items-center justify-center relative overflow-hidden"
                      style={{ background: s.shellGradient }}
                    >
                      <div
                        className="w-3.5 h-3.5"
                        style={{
                          background: s.starBurstBg,
                          clipPath: 'polygon(18% 0%, 50% 7%, 82% 0%, 93% 18%, 100% 50%, 93% 82%, 82% 100%, 50% 93%, 18% 100%, 7% 82%, 0% 50%, 7% 18%)',
                        }}
                      />
                    </div>

                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-black">{s.name}</span>
                        {active && (
                          <span className="text-[9px] font-black px-1.5 py-0.2 rounded-full bg-[var(--accent)] text-[var(--accent-ink)]">
                            Active
                          </span>
                        )}
                      </div>
                      <p className={`text-[10px] ${MUTED}`}>{s.tagline}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectSkin?.(s.id);
                    }}
                    className={`text-xs px-2.5 py-1 rounded-lg font-bold border transition-all ${
                      active
                        ? BUTTON_SELECTED
                        : BUTTON_NEUTRAL
                    }`}
                  >
                    {active ? 'Selected ✓' : 'Use Skin'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Wardrobe */}
      <div className={`${CARD} lg:col-span-3 p-5`}>
        <div className="flex items-baseline justify-between mb-1">
          <h3 className="text-xs font-black uppercase tracking-wider">Customize · Wardrobe</h3>
          <span className="text-xs font-bold px-2 py-0.5 rounded-lg bg-[var(--accent-soft)] border border-[var(--accent)] text-[var(--accent)]">
            {pet.corn} 🌽 to spend
          </span>
        </div>
        <p className={`text-[11px] mb-4 ${MUTED}`}>
          {dressable
            ? 'Buy clothes with corn, then wear one item per slot. Corn spent here is corn not fed to your duck.'
            : 'An egg can’t wear clothes. Feed it until it hatches to unlock the wardrobe.'}
        </p>

        <div className="space-y-4">
          {SLOTS.map((slot) => (
            <div key={slot}>
              <h4 className={`${LABEL} mb-2`}>{SLOT_LABELS[slot]}</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {COSMETICS.filter((c) => c.slot === slot).map((item) => (
                  <div
                    key={item.id}
                    className={`p-2 rounded-xl border flex flex-col items-center gap-1.5 ${
                      pet.equipped[slot] === item.id
                        ? 'bg-[var(--accent-soft)] border-[var(--accent)]'
                        : 'bg-[var(--chip)] border-[var(--line)]'
                    }`}
                  >
                    <div className={dressable ? '' : 'opacity-50'}>
                      <PixelArt rows={dress(previewBase, previewStage, { [slot]: item.id })} scale={2} />
                    </div>
                    <span className="text-xs font-bold">{item.name}</span>
                    {itemButton(item)}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
