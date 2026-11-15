/**
 * "Quests" dashboard tab: everything that turns good posture into a game.
 *   Quests       - daily goals that pay corn
 *   Games        - Duck Dash, a runner that pays corn
 *   Achievements - lifetime milestones
 *   Report       - today's posture and the last week
 *   Stretches    - the stretch guide; ticking one off counts towards a quest
 */

import React, { useState } from 'react';
import { DuckDash } from './DuckDash';
import {
  ACHIEVEMENTS,
  claimQuest,
  dayKey,
  eventsFor,
  HISTORY_DAYS,
  QUESTS,
  questStatus,
  recordGame,
  recordStretch,
  statsFor,
  type Events,
  type Journal,
  type Quest,
} from './journal';
import { earnCorn, stageOf, type PetProfile } from './progression';
import {
  ACCENT_TEXT,
  BAR_ACCENT,
  BAR_BAD,
  BAR_GOOD,
  BUTTON_NEUTRAL,
  BUTTON_PRIMARY,
  CALLOUT,
  CARD,
  FAINT,
  GOOD_TEXT,
  LABEL,
  MUTED,
  PANEL,
  TRACK,
} from './theme';

export const STRETCHES = [
  {
    cue: 'CHIN_TUCK',
    title: 'Chin tuck',
    trigger: 'Head drifting forward',
    desc: 'Pull your head straight back as if making a double chin. Hold 5 seconds. Repeat 3 times.',
    benefit: 'Re-aligns the neck and eases the muscles at the base of the skull.',
  },
  {
    cue: 'SHOULDER_ROLL',
    title: 'Shoulder roll',
    trigger: 'Hunched shoulders',
    desc: 'Roll both shoulders up toward your ears, then sweep them back and down. Squeeze your shoulder blades.',
    benefit: 'Releases the upper back and opens the chest.',
  },
  {
    cue: 'SIT_BACK',
    title: 'Sit back',
    trigger: 'Creeping toward the screen',
    desc: 'Slide your hips to the back of the seat and let the backrest support your lower back.',
    benefit: 'Takes pressure off the lower spine.',
  },
  {
    cue: 'LOOK_AWAY',
    title: '20-20-20 eye break',
    trigger: 'Low blink rate',
    desc: 'Look at something at least 20 feet away for 20 seconds.',
    benefit: 'Relaxes the focusing muscles and re-wets the eyes.',
  },
];

type Section = 'quests' | 'games' | 'achievements' | 'report' | 'stretches';
const SECTIONS: Array<{ id: Section; label: string }> = [
  { id: 'quests', label: '🎯 Quests' },
  { id: 'games', label: '🎮 Games' },
  { id: 'achievements', label: '🏆 Achievements' },
  { id: 'report', label: '📋 Session report' },
  { id: 'stretches', label: '🧘 Stretches' },
];

/** "7 min", "1 h 05 min" or "40 s". */
function duration(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}

const questProgressText = (quest: Quest, progress: number): string =>
  quest.inMinutes
    ? `${Math.min(quest.target / 60, Math.floor(progress / 60))} / ${quest.target / 60} min`
    : `${Math.min(quest.target, Math.floor(progress))} / ${quest.target}`;

interface QuestsTabProps {
  pet: PetProfile;
  journal: Journal;
  events: Events;
  onPetChange: (change: (pet: PetProfile) => PetProfile) => void;
  onEventsChange: (change: (events: Events) => Events) => void;
}

export const QuestsTab: React.FC<QuestsTabProps> = ({ pet, journal, events, onPetChange, onEventsChange }) => {
  const [section, setSection] = useState<Section>('quests');
  const today = dayKey();
  const stats = statsFor(journal, today);
  const todayEvents = eventsFor(events, today);

  const readyCount = QUESTS.filter((q) => questStatus(q, stats, todayEvents) === 'READY').length;
  const unlockedCount = ACHIEVEMENTS.filter((a) => a.unlocked(pet, journal, events)).length;

  const claim = (quest: Quest) => {
    // Pay out only if the claim actually went through, so a double click can't pay twice
    let claimed = false;
    onEventsChange((e) => {
      const next = claimQuest(e, quest, stats, today);
      claimed = next !== e;
      return next;
    });
    if (claimed) onPetChange((p) => earnCorn(p, quest.reward));
  };

  const finishGame = (score: number, corn: number) => {
    onEventsChange((e) => recordGame(e, score, today));
    if (corn > 0) onPetChange((p) => earnCorn(p, corn));
  };

  // Last week of upright time for the report, oldest first
  const week = Array.from({ length: HISTORY_DAYS }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (HISTORY_DAYS - 1 - i));
    const key = dayKey(date);
    return { key, label: date.toLocaleDateString(undefined, { weekday: 'short' }), stats: statsFor(journal, key) };
  });
  const weekMax = Math.max(60, ...week.map((d) => d.stats.uprightSec));
  const tracked = stats.uprightSec + stats.slouchSec;
  const uprightShare = tracked > 0 ? Math.round((stats.uprightSec / tracked) * 100) : null;

  return (
    <div className="space-y-4">
      {/* Section switcher */}
      <div className="flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            aria-pressed={section === s.id}
            className={section === s.id ? BUTTON_PRIMARY : BUTTON_NEUTRAL}
          >
            {s.label}
            {s.id === 'quests' && readyCount > 0 && ` · ${readyCount} ready`}
            {s.id === 'achievements' && ` · ${unlockedCount}/${ACHIEVEMENTS.length}`}
          </button>
        ))}
      </div>

      {/* Daily quests */}
      {section === 'quests' && (
        <div className="space-y-3">
          <p className={`text-xs ${MUTED}`}>
            Daily quests reset at midnight. Finish one, then claim its corn. You have{' '}
            <span className={`font-bold ${ACCENT_TEXT}`}>{pet.corn} 🌽</span>.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {QUESTS.map((quest) => {
              const progress = quest.progress(stats, todayEvents);
              const status = questStatus(quest, stats, todayEvents);
              return (
                <div key={quest.id} className={`${CARD} p-4 ${status === 'CLAIMED' ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-bold">{quest.title}</h4>
                      <p className={`text-xs mt-0.5 ${MUTED}`}>{quest.description}</p>
                    </div>
                    <span className={`shrink-0 text-xs font-bold ${ACCENT_TEXT}`}>+{quest.reward} 🌽</span>
                  </div>
                  <div className={`${TRACK} h-1.5 mt-3`}>
                    <div
                      className={`h-full transition-all duration-300 ${status === 'IN_PROGRESS' ? BAR_ACCENT : BAR_GOOD}`}
                      style={{ width: `${Math.min(1, progress / quest.target) * 100}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className={`text-[11px] font-semibold ${MUTED}`}>{questProgressText(quest, progress)}</span>
                    {status === 'READY' && (
                      <button onClick={() => claim(quest)} className={`${BUTTON_PRIMARY} !py-1`}>
                        Claim {quest.reward} 🌽
                      </button>
                    )}
                    {status === 'CLAIMED' && <span className={`text-[11px] font-bold ${GOOD_TEXT}`}>✓ Claimed</span>}
                    {status === 'IN_PROGRESS' && <span className={`text-[11px] ${FAINT}`}>In progress</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Games */}
      {section === 'games' && (
        <div className="space-y-3">
          <DuckDash stage={stageOf(pet)} outfit={pet.equipped} best={events.life.gameBest} onFinish={finishGame} />
          <div className="grid grid-cols-3 gap-3">
            {[
              ['Best score', String(events.life.gameBest)],
              ['Best today', String(todayEvents.gameBest)],
              ['Runs played', String(events.life.games)],
            ].map(([label, value]) => (
              <div key={label} className={`${CARD} px-4 py-3`}>
                <span className={LABEL}>{label}</span>
                <p className="text-xl font-black mt-0.5">{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Achievements */}
      {section === 'achievements' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ACHIEVEMENTS.map((a) => {
            const done = a.unlocked(pet, journal, events);
            return (
              <div key={a.id} className={`${done ? CALLOUT : CARD} p-4 flex items-start gap-3 ${done ? '' : 'opacity-60'}`}>
                <span className={`text-2xl ${done ? '' : 'grayscale'}`}>{a.icon}</span>
                <div>
                  <h4 className="text-sm font-bold">{a.title}</h4>
                  <p className={`text-xs mt-0.5 ${MUTED}`}>{a.description}</p>
                  <p className={`text-[11px] font-bold mt-1 ${done ? GOOD_TEXT : FAINT}`}>{done ? '✓ Unlocked' : 'Locked'}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Session report */}
      {section === 'report' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ['Upright today', duration(stats.uprightSec)],
              ['Slouching today', duration(stats.slouchSec)],
              ['Best streak today', duration(stats.bestStreakSec)],
              ['Slouch recoveries', String(stats.recoveries)],
              ['Away from desk', duration(stats.awaySec)],
              ['Corn from sitting', `${stats.cornFromSitting} 🌽`],
              ['Times fed', String(todayEvents.feeds)],
              ['Stretches done', String(todayEvents.stretches.length)],
            ].map(([label, value]) => (
              <div key={label} className={`${CARD} px-4 py-3`}>
                <span className={LABEL}>{label}</span>
                <p className="text-lg font-black mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          <div className={`${CARD} p-4`}>
            <div className="flex items-baseline justify-between mb-2">
              <h4 className="text-sm font-bold">Upright vs slouching today</h4>
              <span className={`text-xs font-bold ${uprightShare === null ? FAINT : uprightShare >= 70 ? GOOD_TEXT : ACCENT_TEXT}`}>
                {uprightShare === null ? 'No data yet' : `${uprightShare}% upright`}
              </span>
            </div>
            <div className={`${TRACK} h-3 flex`}>
              {tracked > 0 && (
                <>
                  <div className={BAR_GOOD} style={{ width: `${(stats.uprightSec / tracked) * 100}%` }} />
                  <div className={BAR_BAD} style={{ width: `${(stats.slouchSec / tracked) * 100}%` }} />
                </>
              )}
            </div>
          </div>

          <div className={`${CARD} p-4`}>
            <h4 className="text-sm font-bold mb-3">Upright time, last {HISTORY_DAYS} days</h4>
            <div className="h-32 flex items-end gap-2">
              {week.map((d) => (
                <div key={d.key} className="flex-1 h-full flex flex-col items-center justify-end gap-1">
                  <span className={`text-[10px] ${MUTED}`}>{d.stats.uprightSec > 0 ? duration(d.stats.uprightSec) : ''}</span>
                  <div
                    className={`w-full rounded-t ${d.key === today ? BAR_ACCENT : 'bg-[var(--track)]'}`}
                    style={{ height: `${Math.max(2, (d.stats.uprightSec / weekMax) * 78)}%` }}
                  />
                  <span className={`text-[10px] font-semibold ${d.key === today ? ACCENT_TEXT : FAINT}`}>{d.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Stretches */}
      {section === 'stretches' && (
        <div className="space-y-3">
          <p className={`text-xs ${MUTED}`}>
            These are the stretches your duck asks for. Do one, then tick it off: it counts towards the “Limber up”
            quest.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {STRETCHES.map((stretch) => {
              const done = todayEvents.stretches.includes(stretch.cue);
              return (
                <div key={stretch.cue} className={`${CARD} p-4 space-y-2`}>
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-bold">{stretch.title}</h4>
                    <span className={`text-[11px] ${FAINT}`}>For: {stretch.trigger}</span>
                  </div>
                  <p className="text-xs leading-relaxed">{stretch.desc}</p>
                  <p className={`text-[11px] ${MUTED}`}>{stretch.benefit}</p>
                  <button
                    onClick={() => onEventsChange((e) => recordStretch(e, stretch.cue, today))}
                    disabled={done}
                    className={`${done ? BUTTON_NEUTRAL : BUTTON_PRIMARY} !py-1`}
                  >
                    {done ? '✓ Done today' : 'I did this stretch'}
                  </button>
                </div>
              );
            })}
          </div>
          <div className={`${PANEL} px-4 py-3 text-[11px] ${MUTED}`}>
            General wellbeing tips, not medical advice. Stop if anything hurts.
          </div>
        </div>
      )}
    </div>
  );
};
