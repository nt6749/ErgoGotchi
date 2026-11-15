/**
 * ErgoGotchi Companion Dashboard.
 *
 * Layout, top to bottom: a header bar of buttons, a bar of tabs, then the tab (the live stats sit
 * at the top of the Telemetry and Demo tabs). Light and dark mode come from theme.ts.
 */

import React, { useState, useEffect } from 'react';
import { PetState } from '../types';
import { NEW_EVENTS, NEW_JOURNAL, type Events, type Journal } from './journal';
import { MyDuck } from './MyDuck';
import { DEFAULT_SKIN, type EggShellSkin } from './eggShellSkins';
import type { ForcedActivity } from './PixelMascot';
import {
  ADULT_LEVEL,
  canFeed,
  cornInterval,
  cornNeeded,
  grantCorn,
  HATCH_LEVEL,
  NEW_PET,
  setLevel,
  STAGE_TITLES,
  stageOf,
  startOver,
  type PetProfile,
} from './progression';
import { QuestsTab } from './QuestsTab';
import {
  BAD_TEXT,
  BAR_ACCENT,
  BAR_BAD,
  BAR_GOOD,
  BUTTON_NEUTRAL,
  BUTTON_OUTLINE,
  BUTTON_PRIMARY,
  BUTTON_SELECTED,
  CALLOUT,
  CARD,
  FAINT,
  GOOD_TEXT,
  LABEL,
  MUTED,
  PANEL,
  TRACK,
  type ThemeMode,
} from './theme';

interface CameraChoice {
  deviceId: string;
  label: string;
}

interface DashboardProps {
  hp: number;
  state: PetState;
  strainIndex: number;
  blinkRate: number;
  worstSignal: string;
  isDemoMode: boolean;
  onToggleDemoMode: () => void;
  /** Force a pet state for demos, or null to follow the camera again. */
  onForceState: (state: PetState | null) => void;
  onRecalibrate: () => void;
  sessionId: string;
  /** The pet's profile: name, level, corn and clothes. */
  pet?: PetProfile;
  /** Apply a change to the stored pet profile (rename, buy, wear). */
  onPetChange?: (change: (pet: PetProfile) => PetProfile) => void;
  /** Feed the pet; true if it ate. */
  onFeed?: () => boolean;

  // Button bar
  isConnected?: boolean;
  cameras?: CameraChoice[];
  activeCameraId?: string | null;
  onSelectCamera?: (deviceId: string) => void;
  /** Shown as a "Back to desktop" button when provided (browser view only). */
  onHide?: () => void;

  // Presenter controls
  /** The pet state currently being forced, or null when following the camera. */
  forcedState?: PetState | null;
  forcedActivity?: ForcedActivity;
  onForceActivity?: (value: ForcedActivity) => void;
  /** Show the posture-warning emote (knife / tantrum / angry egg). */
  onShowWarning?: () => void;

  // Quests tab
  journal?: Journal;
  events?: Events;
  onEventsChange?: (change: (events: Events) => Events) => void;

  // Light / dark mode
  theme?: ThemeMode;
  onToggleTheme?: () => void;

  // Position lock mode
  isLocked?: boolean;
  onToggleLock?: (locked: boolean) => void;

  // Egg Shell Skin
  skin?: EggShellSkin;
  onSelectSkin?: (skin: EggShellSkin) => void;
}

type TabId = 'analytics' | 'myduck' | 'quests' | 'tigerdata' | 'demo';
const TABS: Array<{ id: TabId; icon: string; label: string }> = [
  { id: 'analytics', icon: '📊', label: 'Telemetry' },
  { id: 'myduck', icon: '🦆', label: 'My DuckDuck' },
  { id: 'quests', icon: '🎯', label: 'Quests' },
  { id: 'tigerdata', icon: '🐅', label: 'Tiger Data' },
  { id: 'demo', icon: '🎬', label: 'Demo' },
];

/** A row of choices where the current one is shown as "on". */
function ChoiceRow<T extends string | null>({
  choices,
  current,
  onPick,
}: {
  choices: Array<{ value: T; label: string }>;
  current: T;
  onPick: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {choices.map((c) => (
        <button
          key={String(c.value)}
          onClick={() => onPick(c.value)}
          aria-pressed={c.value === current}
          className={c.value === current ? BUTTON_SELECTED : BUTTON_NEUTRAL}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

export const Dashboard: React.FC<DashboardProps> = ({
  hp,
  state,
  strainIndex,
  blinkRate,
  worstSignal,
  isDemoMode,
  onToggleDemoMode,
  onForceState,
  onRecalibrate,
  sessionId,
  pet = NEW_PET,
  onPetChange = () => {},
  onFeed = () => false,
  isConnected = false,
  cameras = [],
  activeCameraId = null,
  onSelectCamera,
  onHide,
  forcedState = null,
  forcedActivity = 'AUTO',
  onForceActivity = () => {},
  onShowWarning = () => {},
  journal = NEW_JOURNAL,
  events = NEW_EVENTS,
  onEventsChange = () => {},
  theme = 'dark',
  onToggleTheme,
  isLocked = true,
  onToggleLock,
  skin = DEFAULT_SKIN,
  onSelectSkin,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('analytics');
  const [seriesData, setSeriesData] = useState<any[]>([]);
  const [sessionSummary, setSessionSummary] = useState<string>('Analyzing your focus session...');
  const [tigerStats, setTigerStats] = useState<any>(null);

  // Fetch 30-minute series and summary from backend
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`http://localhost:8000/sessions/${sessionId}/series?minutes=30`);
        if (res.ok) {
          const json = await res.json();
          if (json.data && json.data.length > 0) {
            setSeriesData(json.data);
          }
        }

        const sumRes = await fetch(`http://localhost:8000/sessions/${sessionId}/summary`);
        if (sumRes.ok) {
          const sumJson = await sumRes.json();
          setSessionSummary(sumJson.summary);
        }

        const tigerRes = await fetch('http://localhost:8000/tiger-data/stats');
        if (tigerRes.ok) {
          const tJson = await tigerRes.json();
          setTigerStats(tJson);
        }
      } catch (err) {
        // Backend offline / local fallback mode
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [sessionId]);

  const stage = stageOf(pet);
  const need = cornNeeded(pet);
  const enoughCorn = canFeed(pet);
  const hpBar = hp >= 80 ? BAR_GOOD : hp >= 40 ? BAR_ACCENT : BAR_BAD;
  const blinkOk = blinkRate >= 10;
  // Live stats matter on the tabs about the current session; the others have their own headers
  const showStats = activeTab === 'analytics' || activeTab === 'demo';

  return (
    <div className="w-full h-full flex flex-col">
      {/* Bar 1: buttons */}
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 bg-[var(--surface)] border-b border-[var(--line)]">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-[var(--accent)] flex items-center justify-center text-xl">🦆</span>
          <div className="leading-tight">
            <h1 className="text-base font-bold tracking-tight">ErgoGotchi</h1>
            <p className={`text-[11px] ${MUTED}`}>{pet.name}'s companion dashboard</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`${BUTTON_NEUTRAL} flex items-center gap-2 cursor-default hover:!border-[var(--line)]`}
            title={isConnected ? 'Connected to the telemetry server' : 'Server offline: using built-in lines'}
          >
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-[var(--good)]' : 'bg-[var(--warn)]'}`} />
            {isConnected ? 'Live' : 'Offline'}
          </span>

          {onSelectCamera && (
            <select
              value={activeCameraId ?? ''}
              onChange={(e) => onSelectCamera(e.target.value)}
              title="Camera used for posture tracking"
              className={`${BUTTON_NEUTRAL} max-w-[170px]`}
            >
              {!activeCameraId && <option value="">📷 No camera</option>}
              {cameras.map((cam) => (
                <option key={cam.deviceId} value={cam.deviceId}>
                  📷 {cam.label}
                </option>
              ))}
            </select>
          )}

          <button onClick={onToggleDemoMode} aria-pressed={isDemoMode} className={isDemoMode ? BUTTON_SELECTED : BUTTON_NEUTRAL}>
            ⚡ Demo mode: {isDemoMode ? 'on' : 'off'}
          </button>
          <button onClick={onRecalibrate} className={BUTTON_OUTLINE}>
            Calibrate
          </button>
          {onToggleTheme && (
            <button
              onClick={onToggleTheme}
              className={BUTTON_NEUTRAL}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
            </button>
          )}
          {onHide && (
            <button onClick={onHide} className={BUTTON_NEUTRAL}>
              Back to desktop
            </button>
          )}
        </div>
      </header>

      {/* Bar 2: tabs */}
      <nav className="flex flex-wrap px-4 bg-[var(--surface)] border-b border-[var(--line)]">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            aria-pressed={activeTab === tab.id}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              activeTab === tab.id
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-transparent text-[var(--muted)] hover:text-[var(--ink)]'
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-5 space-y-4">
          {/* Live stats */}
          {showStats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className={`${CARD} p-5`}>
                <span className={LABEL}>Duck HP</span>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-3xl font-bold">{Math.round(hp)}%</span>
                  <span className={`text-sm capitalize ${MUTED}`}>{state.toLowerCase()}</span>
                </div>
                <div className={`${TRACK} h-1.5 mt-3`}>
                  <div className={`h-full transition-all duration-500 ${hpBar}`} style={{ width: `${Math.max(3, hp)}%` }} />
                </div>
              </div>

              <div className={`${CARD} p-5`}>
                <span className={LABEL}>Strain</span>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-3xl font-bold">{(strainIndex * 100).toFixed(0)}%</span>
                  <span className={`text-sm truncate ${MUTED}`}>worst: {worstSignal.replace('_', ' ')}</span>
                </div>
                <div className={`${TRACK} h-1.5 mt-3`}>
                  <div
                    className={`h-full transition-all duration-300 ${strainIndex >= 0.5 ? BAR_BAD : BAR_ACCENT}`}
                    style={{ width: `${strainIndex * 100}%` }}
                  />
                </div>
              </div>

              <div className={`${CARD} p-5`}>
                <span className={LABEL}>Blink rate</span>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-3xl font-bold">{blinkRate}</span>
                  <span className={`text-sm ${MUTED}`}>blinks/min</span>
                </div>
                <p className={`text-xs font-semibold mt-2 ${blinkOk ? GOOD_TEXT : BAD_TEXT}`}>
                  {blinkOk ? 'Eyes are fine' : 'Staring too hard'}
                </p>
                <div className={`${TRACK} h-1.5 mt-2`}>
                  <div
                    className={`h-full transition-all duration-300 ${blinkOk ? BAR_GOOD : BAR_BAD}`}
                    style={{ width: `${Math.min(1, blinkRate / 20) * 100}%` }}
                  />
                </div>
              </div>

              <div className={`${CARD} p-5`}>
                <span className={LABEL}>{STAGE_TITLES[stage]}</span>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className={`text-xs ${MUTED}`}>Lv</span>
                  <span className="text-3xl font-bold">{pet.level}</span>
                  <span className={`text-sm font-semibold ${enoughCorn ? GOOD_TEXT : BAD_TEXT}`}>
                    {pet.corn}/{need} 🌽
                  </span>
                </div>
                <div className={`${TRACK} h-1.5 mt-3`}>
                  <div
                    className={`h-full transition-all duration-300 ${enoughCorn ? BAR_GOOD : BAR_ACCENT}`}
                    style={{ width: `${Math.min(1, pet.corn / need) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Telemetry & fatigue charts */}
          {activeTab === 'analytics' && (
            <>
              <div className={`${CALLOUT} px-5 py-4`}>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--accent)] mb-1.5">
                  ✨ Google Gemini coach brief
                </h3>
                <p className={`text-sm italic ${MUTED}`}>"{sessionSummary}"</p>
              </div>

              <div className={`${CARD} p-5`}>
                <div className="flex flex-wrap justify-between items-baseline gap-2 mb-4">
                  <h3 className="text-sm font-bold">
                    📈 30-minute strain curve <span className={`font-normal text-xs ${MUTED}`}>Tiger Data 1-min buckets</span>
                  </h3>
                  <span className={`text-[11px] font-mono ${FAINT}`}>Continuous aggregate: ergo_1min</span>
                </div>

                {seriesData.length > 0 ? (
                  <div className="h-48 w-full flex items-end gap-1.5 pt-4 border-b border-[var(--line)]">
                    {seriesData.map((d, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end group relative">
                        <div className="absolute bottom-full mb-1 hidden group-hover:flex flex-col bg-[var(--ink)] text-[var(--bg)] text-[10px] p-2 rounded-lg whitespace-nowrap z-30">
                          <span>Time: {new Date(d.bucket).toLocaleTimeString()}</span>
                          <span>Strain: {(d.avg_strain * 100).toFixed(0)}%</span>
                          <span>Velocity: {d.strain_velocity > 0 ? `+${d.strain_velocity}` : d.strain_velocity}</span>
                        </div>
                        <div
                          className={`w-full rounded-t transition-all duration-300 hover:brightness-110 ${
                            d.avg_strain >= 0.5 ? BAR_BAD : d.avg_strain >= 0.3 ? BAR_ACCENT : BAR_GOOD
                          }`}
                          style={{ height: `${Math.max(8, d.avg_strain * 100)}%` }}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={`h-48 flex flex-col items-center justify-center border border-dashed border-[var(--line)] rounded-xl ${MUTED}`}>
                    <p className="text-sm">Collecting 1-minute data…</p>
                    <p className={`text-xs mt-1 ${FAINT}`}>Sit upright or slouch to see the live aggregates.</p>
                  </div>
                )}
                <div className={`flex justify-between text-[11px] mt-2 ${FAINT}`}>
                  <span>30 min ago</span>
                  <span>15 min ago</span>
                  <span>Now</span>
                </div>
              </div>
            </>
          )}

          {/* My DuckDuck: profile + wardrobe */}
          {activeTab === 'myduck' && (
            <MyDuck
              pet={pet}
              onPetChange={onPetChange}
              onFeed={onFeed}
              cornEverySeconds={cornInterval(isDemoMode)}
              isLocked={isLocked}
              onToggleLock={onToggleLock}
              skin={skin}
              onSelectSkin={onSelectSkin}
            />
          )}

          {/* Quests: daily quests, games, achievements, session report, stretches */}
          {activeTab === 'quests' && (
            <QuestsTab pet={pet} journal={journal} events={events} onPetChange={onPetChange} onEventsChange={onEventsChange} />
          )}

          {/* Tiger Data (TimescaleDB) showcase */}
          {activeTab === 'tigerdata' && (
            <>
              <div className={`${CARD} p-5`}>
                <h3 className="text-sm font-bold mb-2">🐅 Tiger Data / TimescaleDB hypertable architecture</h3>
                <p className={`text-sm leading-relaxed ${MUTED}`}>
                  ErgoGotchi ingests continuous 1 Hz biometric telemetry frames into a PostgreSQL hypertable partitioned
                  into 1-hour temporal chunks. Continuous aggregates maintain 1-minute real-time rolling summaries with
                  automatic 90%+ compression policies on historical data.
                </p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  ['Engine', tigerStats?.storage_engine || 'TimescaleDB (Tiger Data)'],
                  [
                    'Total telemetry rows',
                    tigerStats?.telemetry_rows ? tigerStats.telemetry_rows.toLocaleString() : '86,400+ / day',
                  ],
                  ['Aggregate view', 'ergo_1min (continuous)'],
                  ['Compression', 'Segmented by session_id'],
                ].map(([label, value]) => (
                  <div key={label} className={`${CARD} p-4`}>
                    <span className={LABEL}>{label}</span>
                    <p className="text-sm font-bold mt-1">{value}</p>
                  </div>
                ))}
              </div>

              <div className={`${CARD} p-5 font-mono text-[11px] overflow-x-auto select-text`}>
                <p className="text-[var(--accent)] font-bold mb-1">-- Real-time continuous aggregate definition:</p>
                <pre className={MUTED}>{`CREATE MATERIALIZED VIEW ergo_1min
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT
  time_bucket('1 minute', recorded_at) AS bucket,
  session_id,
  avg(strain_index)   AS avg_strain,
  max(strain_index)   AS peak_strain,
  avg(forward_head)   AS avg_forward_head,
  avg(head_drop)      AS avg_head_drop,
  avg(blink_rate_1m)  AS avg_blink_rate,
  min(hp)             AS min_hp
FROM ergo_telemetry
WHERE present
GROUP BY bucket, session_id;`}</pre>
              </div>
            </>
          )}

          {/* Demo controls */}
          {activeTab === 'demo' && (
            <>
              <div className={`${CALLOUT} px-5 py-4`}>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--accent)] mb-1.5">🎬 Demo controls</h3>
                <p className={`text-sm leading-relaxed ${MUTED}`}>
                  Drive the duck by hand during a demo, e.g. when venue lighting confuses the webcam. Everything here
                  acts on the duck on your desktop straight away. The key in brackets does the same thing while this
                  window is focused.
                </p>
              </div>

              <div className={`${CARD} p-5 space-y-5`}>
                <div>
                  <h4 className={`${LABEL} mb-2`}>Posture state</h4>
                  <ChoiceRow<PetState | null>
                    current={forcedState}
                    onPick={onForceState}
                    choices={[
                      { value: null, label: 'Follow camera [4]' },
                      { value: 'THRIVING', label: 'Thriving [1]' },
                      { value: 'NEUTRAL', label: 'Neutral' },
                      { value: 'SLOUCHING', label: 'Slouching [2]' },
                      { value: 'WILTED', label: 'Wilted [3]' },
                      { value: 'AWAY', label: 'Away' },
                    ]}
                  />
                  <button onClick={onShowWarning} className={`${BUTTON_OUTLINE} mt-2`}>
                    Show posture warning [5]
                  </button>
                </div>

                <div>
                  <h4 className={`${LABEL} mb-2`}>Activity</h4>
                  <ChoiceRow<ForcedActivity>
                    current={forcedActivity}
                    onPick={onForceActivity}
                    choices={[
                      { value: 'AUTO', label: 'Follow my apps [9]' },
                      { value: 'WATCHING', label: 'Watching TV [6]' },
                      { value: 'MUSIC', label: 'Music [7]' },
                      { value: 'WORKING', label: 'Working [8]' },
                      { value: 'NONE', label: 'Nothing' },
                    ]}
                  />
                </div>

                <div>
                  <h4 className={`${LABEL} mb-2`}>
                    Age <span className="normal-case font-normal">· now level {pet.level}, {STAGE_TITLES[stage]}</span>
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => onPetChange((p) => setLevel(p, 1))}
                      className={stage === 'EGG' ? BUTTON_SELECTED : BUTTON_NEUTRAL}
                    >
                      Egg
                    </button>
                    <button
                      onClick={() => onPetChange((p) => setLevel(p, HATCH_LEVEL))}
                      className={stage === 'BABY' ? BUTTON_SELECTED : BUTTON_NEUTRAL}
                    >
                      Baby duck
                    </button>
                    <button
                      onClick={() => onPetChange((p) => setLevel(p, ADULT_LEVEL))}
                      className={stage === 'ADULT' ? BUTTON_SELECTED : BUTTON_NEUTRAL}
                    >
                      Grown duck
                    </button>
                    <button onClick={() => onPetChange((p) => setLevel(p, p.level + 1))} className={BUTTON_OUTLINE}>
                      Level up +1 []]
                    </button>
                    <button
                      onClick={() => onPetChange((p) => setLevel(p, p.level - 1))}
                      disabled={pet.level <= 1}
                      className={BUTTON_OUTLINE}
                    >
                      Level down −1 [[]
                    </button>
                  </div>
                </div>

                <div>
                  <h4 className={`${LABEL} mb-2`}>
                    Corn <span className="normal-case font-normal">· {pet.corn} 🌽 in the pantry, next level costs {need}</span>
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => onPetChange((p) => grantCorn(p, 10))} className={BUTTON_NEUTRAL}>
                      +10 corn [X]
                    </button>
                    <button onClick={() => onPetChange((p) => grantCorn(p, 100))} className={BUTTON_PRIMARY}>
                      +100 corn [Z]
                    </button>
                    <button onClick={onFeed} disabled={!enoughCorn} className={BUTTON_NEUTRAL}>
                      Feed [F]
                    </button>
                    <button onClick={() => onPetChange((p) => ({ ...p, corn: 0 }))} className={BUTTON_NEUTRAL}>
                      Empty pantry
                    </button>
                  </div>
                </div>

                <div>
                  <h4 className={`${LABEL} mb-2`}>Session</h4>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={onToggleDemoMode} aria-pressed={isDemoMode} className={isDemoMode ? BUTTON_SELECTED : BUTTON_NEUTRAL}>
                      ⚡ Demo mode: {isDemoMode ? 'on' : 'off'} [D]
                    </button>
                    <button onClick={onRecalibrate} className={BUTTON_NEUTRAL}>
                      Calibrate [C]
                    </button>
                    <button onClick={() => onPetChange(startOver)} className={BUTTON_NEUTRAL}>
                      Start over as an egg [E]
                    </button>
                  </div>
                </div>
              </div>

              <div className={`${PANEL} px-4 py-3 text-xs leading-relaxed ${MUTED}`}>
                Demo mode makes everything faster: the duck slouches after 1.5 seconds instead of 5, sitting upright
                pays 1 corn every {cornInterval(true)} seconds instead of every {cornInterval(false)}, and time-based
                quests fill up about 30 times quicker.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
