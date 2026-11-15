/**
 * ErgoGotchi Companion Dashboard.
 *
 * Layout, top to bottom: a header bar of buttons, a bar of tabs, then the tab (the live stats sit
 * at the top of the Telemetry and Demo tabs). Light and dark mode come from theme.ts.
 */

import React, { useState, useEffect } from 'react';
import { DifficultyLevel, PetState, UpdateInfo, UpdateProgress } from '../types';
import { NEW_EVENTS, NEW_JOURNAL, type Events, type Journal, recordDebriefReward, updateJournal } from './journal';
import { MyDuck } from './MyDuck';
import { CameraScreen } from './CameraScreen';
import type { ForcedActivity } from './PixelMascot';
import {
  ADULT_LEVEL,
  canFeed,
  cornInterval,
  cornNeeded,
  earnCorn,
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

  // Difficulty setting
  difficulty?: DifficultyLevel;
  onSetDifficulty?: (level: DifficultyLevel) => void;

  // Biometrics & camera diagnostics
  isPresent?: boolean;
  isCalibrating?: boolean;
  calibrationProgress?: number;

  // Auto-Updates & System Startup
  appVersion?: string;
  updateInfo?: UpdateInfo | null;
  updateProgress?: UpdateProgress | null;
  isUpdating?: boolean;
  onCheckForUpdates?: () => Promise<UpdateInfo>;
  onTriggerUpdate?: (asset?: { name: string; downloadUrl: string; size?: number } | null) => void;
  launchOnStartup?: boolean;
  onToggleLaunchOnStartup?: (enabled: boolean) => void;
}

type TabId = 'analytics' | 'myduck' | 'quests' | 'tigerdata' | 'demo' | 'settings';
const TABS: Array<{ id: TabId; icon: string; label: string }> = [
  { id: 'analytics', icon: '📊', label: 'Telemetry' },
  { id: 'myduck', icon: '🦆', label: 'My DuckDuck' },
  { id: 'quests', icon: '🎯', label: 'Quests' },
  { id: 'tigerdata', icon: '🐅', label: 'Tiger Data' },
  { id: 'demo', icon: '🎬', label: 'Demo' },
  { id: 'settings', icon: '⚙️', label: 'Settings' },
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
  difficulty,
  onSetDifficulty,
  isPresent = true,
  isCalibrating = false,
  calibrationProgress = 0,
  appVersion = '1.0.1',
  updateInfo = null,
  updateProgress = null,
  isUpdating = false,
  onCheckForUpdates,
  onTriggerUpdate,
  launchOnStartup = false,
  onToggleLaunchOnStartup,
}) => {
  const [autoCheckUpdates, setAutoCheckUpdates] = useState<boolean>(() => {
    try {
      return localStorage.getItem('ergogotchi.autoCheckUpdates') !== 'false';
    } catch {
      return true;
    }
  });

  const [autoInstallUpdates, setAutoInstallUpdates] = useState<boolean>(() => {
    try {
      return localStorage.getItem('ergogotchi.autoInstallUpdates') === 'true';
    } catch {
      return false;
    }
  });

  const [alwaysShowCorn, setAlwaysShowCorn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('ergogotchi.alwaysShowCorn') !== 'false';
    } catch {
      return true;
    }
  });

  const handleToggleAlwaysShowCorn = (checked: boolean) => {
    setAlwaysShowCorn(checked);
    try {
      localStorage.setItem('ergogotchi.alwaysShowCorn', String(checked));
      window.dispatchEvent(new CustomEvent('always-show-corn-changed', { detail: checked }));
    } catch {}
    if ((window as any).electronAPI?.setAlwaysShowCorn) {
      (window as any).electronAPI.setAlwaysShowCorn(checked);
    }
  };

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'ergogotchi.alwaysShowCorn') {
        setAlwaysShowCorn(e.newValue !== 'false');
      }
    };
    const handleCustom = (e: any) => {
      if (typeof e.detail === 'boolean') {
        setAlwaysShowCorn(e.detail);
      }
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener('always-show-corn-changed', handleCustom);
    if ((window as any).electronAPI?.onAlwaysShowCornChanged) {
      (window as any).electronAPI.onAlwaysShowCornChanged((val: boolean) => {
        setAlwaysShowCorn(val);
        try {
          localStorage.setItem('ergogotchi.alwaysShowCorn', String(val));
        } catch {}
      });
    }
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('always-show-corn-changed', handleCustom);
    };
  }, []);

  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [checkResult, setCheckResult] = useState<UpdateInfo | null>(updateInfo || null);

  useEffect(() => {
    if (updateInfo) setCheckResult(updateInfo);
  }, [updateInfo]);

  const handleToggleAutoCheck = (checked: boolean) => {
    setAutoCheckUpdates(checked);
    try {
      localStorage.setItem('ergogotchi.autoCheckUpdates', String(checked));
    } catch {}
  };

  const handleToggleAutoInstall = (checked: boolean) => {
    setAutoInstallUpdates(checked);
    try {
      localStorage.setItem('ergogotchi.autoInstallUpdates', String(checked));
    } catch {}
  };

  const handleManualCheckClick = async () => {
    setCheckingUpdates(true);
    try {
      if (onCheckForUpdates) {
        const res = await onCheckForUpdates();
        setCheckResult(res);
      }
    } finally {
      setCheckingUpdates(false);
    }
  };
  const [localDifficulty, setLocalDifficulty] = useState<DifficultyLevel>(() => {
    try {
      const saved = localStorage.getItem('ergogotchi.difficulty');
      if (saved === 'strict' || saved === 'normal' || saved === 'forgiving') return saved;
    } catch {}
    return difficulty || 'normal';
  });

  const currentDifficulty = difficulty || localDifficulty;
  const handlePickDifficulty = (level: DifficultyLevel) => {
    setLocalDifficulty(level);
    try {
      localStorage.setItem('ergogotchi.difficulty', level);
    } catch {}
    if (onSetDifficulty) onSetDifficulty(level);
    window.dispatchEvent(new Event('ergogotchi-difficulty-changed'));
  };

  const [activeTab, setActiveTab] = useState<TabId>('analytics');
  const [seriesData, setSeriesData] = useState<any[]>([]);
  const [sessionSummary, setSessionSummary] = useState<string>('Analyzing your focus session...');
  const [tigerStats, setTigerStats] = useState<any>(null);

  const [isSendingDebrief, setIsSendingDebrief] = useState(false);
  const [debriefSent, setDebriefSent] = useState(false);
  const [debriefStatus, setDebriefStatus] = useState<string | null>(null);

  const [webhookUrlInput, setWebhookUrlInput] = useState<string>(() => {
    try {
      return localStorage.getItem('ergogotchi.webhookUrl') || 'https://ntfy.sh/ergogotchi_sunhacks_2026';
    } catch {
      return 'https://ntfy.sh/ergogotchi_sunhacks_2026';
    }
  });
  const [testWebhookStatus, setTestWebhookStatus] = useState<string | null>(null);
  const [isTestingWebhook, setIsTestingWebhook] = useState(false);

  const handleSaveWebhook = (url: string) => {
    setWebhookUrlInput(url);
    try {
      localStorage.setItem('ergogotchi.webhookUrl', url.trim());
    } catch {}
  };

  const handleTestWebhookPing = async () => {
    if (isTestingWebhook) return;
    setIsTestingWebhook(true);
    setTestWebhookStatus(null);
    try {
      const url = webhookUrlInput.trim();
      const res = await fetch(`http://localhost:8000/grok-bot/webhook?session_id=test-ping&webhook_url=${encodeURIComponent(url)}`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok && data.dispatched) {
        setTestWebhookStatus(`✓ Test notification successfully dispatched to ${url}! Check your phone.`);
      } else {
        setTestWebhookStatus(`✗ Dispatch note: ${data.reason || data.detail || 'Check server connection or URL.'}`);
      }
    } catch {
      setTestWebhookStatus('✗ Could not reach backend server on http://localhost:8000. Start backend first.');
    } finally {
      setIsTestingWebhook(false);
    }
  };

  const handleSendDebrief = async () => {
    if (isSendingDebrief || debriefSent) return;
    setIsSendingDebrief(true);
    setDebriefStatus(null);
    try {
      const customUrl = localStorage.getItem('ergogotchi.webhookUrl')?.trim() || webhookUrlInput?.trim();
      const queryParam = customUrl ? `&webhook_url=${encodeURIComponent(customUrl)}` : '';
      const res = await fetch(`http://localhost:8000/grok-bot/webhook?session_id=${encodeURIComponent(sessionId)}${queryParam}`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok && data.dispatched) {
        updateJournal((j) => recordDebriefReward(j, 5));
        if (onPetChange) onPetChange((p) => earnCorn(p, 5));
        setDebriefSent(true);
        setDebriefStatus('Achievement medal & $0 desk diagnosis dispatched! +5 🌽 added to your pantry.');
      } else if (res.status === 429) {
        setDebriefStatus(data.detail || 'Rate limit active: please wait 10s between dispatches.');
      } else {
        setDebriefStatus(data.reason ? `Dispatch note: ${data.reason}` : 'Session summary logged (no external webhook configured).');
      }
    } catch (err) {
      setDebriefStatus('Backend service offline or unreachable.');
    } finally {
      setIsSendingDebrief(false);
    }
  };

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
                <div className="flex flex-wrap items-center justify-between gap-3 mb-1.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--accent)]">
                    ✨ Google Gemini coach brief
                  </h3>
                  <button
                    onClick={handleSendDebrief}
                    disabled={isSendingDebrief || debriefSent}
                    className={`text-xs px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 ${
                      debriefSent
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 cursor-default'
                        : isSendingDebrief
                        ? 'bg-[var(--chip)] text-[var(--muted)] border border-[var(--line)] cursor-wait'
                        : 'bg-[var(--accent)] text-[var(--accent-ink)] hover:brightness-110 shadow-sm active:scale-95'
                    }`}
                  >
                    {debriefSent ? (
                      <>✅ Debrief Sent (+5 🌽 Claimed!)</>
                    ) : isSendingDebrief ? (
                      <>⏳ Dispatching...</>
                    ) : (
                      <>🚀 Dispatch Grok Debrief (+5 🌽)</>
                    )}
                  </button>
                </div>
                <p className={`text-sm italic ${MUTED}`}>"{sessionSummary}"</p>
                {debriefStatus && (
                  <p className="text-xs text-[var(--accent)] font-semibold mt-2">
                    {debriefStatus}
                  </p>
                )}
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
            <MyDuck pet={pet} onPetChange={onPetChange} onFeed={onFeed} cornEverySeconds={cornInterval(isDemoMode)} />
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

          {/* Demo controls & Camera diagnostics */}
          {activeTab === 'demo' && (
            <>
              <div className={`${CALLOUT} px-5 py-4`}>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--accent)] mb-1.5">🎬 Demo & Camera Diagnostics</h3>
                <p className={`text-sm leading-relaxed ${MUTED}`}>
                  Test your camera live and watch real-time biometric tracking, or drive the duck manually with keyboard hotkeys for live presentations.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
                {/* Column 1: Live Camera Screen Viewfinder */}
                <CameraScreen
                  cameras={cameras}
                  activeCameraId={activeCameraId}
                  onSelectCamera={onSelectCamera}
                  onRecalibrate={onRecalibrate}
                  strainIndex={strainIndex}
                  blinkRate={blinkRate}
                  worstSignal={worstSignal}
                  state={state}
                  isPresent={isPresent}
                  isCalibrating={isCalibrating}
                  calibrationProgress={calibrationProgress}
                />

                {/* Column 2: Presenter Manual Overrides */}
                <div className={`${CARD} p-5 space-y-5`}>
                  <div className="flex items-center justify-between pb-2 border-b border-[var(--line)]">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--accent)]">
                      🎮 Manual Presenter Overrides
                    </h4>
                    <span className={`text-[11px] ${MUTED}`}>Hotkeys in brackets</span>
                  </div>

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
              </div>

              <div className={`${PANEL} px-4 py-3 text-xs leading-relaxed ${MUTED}`}>
                Demo mode makes everything faster: the duck slouches after 1.5 seconds instead of 5, sitting upright
                pays 1 corn every {cornInterval(true)} seconds instead of every {cornInterval(false)}, and time-based
                quests fill up about 30 times quicker.
              </div>
            </>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-6">
              <div className={`${CARD} p-5 space-y-4`}>
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-base flex items-center gap-2">
                    <span>🎚️</span> Posture Reaction Difficulty
                  </h3>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-mono font-semibold ${
                    currentDifficulty === 'strict' ? 'bg-red-500/20 text-red-300 border border-red-500/30' :
                    currentDifficulty === 'normal' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                    'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                  }`}>
                    {currentDifficulty.toUpperCase()} ({
                      currentDifficulty === 'strict' ? '0.5s reaction' :
                      currentDifficulty === 'normal' ? '1.5s reaction' : '3.0s reaction'
                    })
                  </span>
                </div>

                <p className={`text-xs leading-relaxed ${MUTED}`}>
                  Controls how quickly the duck registers a slouch. Shorter dwell times encourage strict spinal alignment, while longer dwell times are more forgiving of natural reaching, drinking, and movement.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => handlePickDifficulty('strict')}
                    className={`p-3.5 rounded-xl border text-left transition-all ${
                      currentDifficulty === 'strict'
                        ? 'border-red-400 bg-red-950/30 shadow-lg shadow-red-950/20 ring-1 ring-red-400'
                        : `${PANEL} hover:border-slate-600`
                    }`}
                  >
                    <div className="font-semibold text-sm text-red-400 mb-1 flex items-center justify-between">
                      <span>Strict</span>
                      <span className="font-mono text-xs">0.5s</span>
                    </div>
                    <p className={`text-xs ${MUTED}`}>
                      Immediate posture enforcement. Catches micro-slouches almost instantaneously.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePickDifficulty('normal')}
                    className={`p-3.5 rounded-xl border text-left transition-all ${
                      currentDifficulty === 'normal'
                        ? 'border-emerald-400 bg-emerald-950/30 shadow-lg shadow-emerald-950/20 ring-1 ring-emerald-400'
                        : `${PANEL} hover:border-slate-600`
                    }`}
                  >
                    <div className="font-semibold text-sm text-emerald-400 mb-1 flex items-center justify-between">
                      <span>Normal</span>
                      <span className="font-mono text-xs">1.5s</span>
                    </div>
                    <p className={`text-xs ${MUTED}`}>
                      Balanced ergonomic sweet spot. Ideal for daily coding and hackathon walkthroughs.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePickDifficulty('forgiving')}
                    className={`p-3.5 rounded-xl border text-left transition-all ${
                      currentDifficulty === 'forgiving'
                        ? 'border-blue-400 bg-blue-950/30 shadow-lg shadow-blue-950/20 ring-1 ring-blue-400'
                        : `${PANEL} hover:border-slate-600`
                    }`}
                  >
                    <div className="font-semibold text-sm text-blue-400 mb-1 flex items-center justify-between">
                      <span>Forgiving</span>
                      <span className="font-mono text-xs">3.0s</span>
                    </div>
                    <p className={`text-xs ${MUTED}`}>
                      Relaxed grace period. Gives ample time to shift positions or reach for notes.
                    </p>
                  </button>
                </div>
              </div>

              {/* ErgoGotchi Auto-Updates Card */}
              <div className={`${CARD} p-5 space-y-4`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🔄</span>
                    <div>
                      <h3 className="font-bold text-base">ErgoGotchi Updates</h3>
                      <p className={`text-xs ${MUTED}`}>Check for updates and configure automated version releases</p>
                    </div>
                  </div>
                  <span className="text-xs px-2.5 py-1 rounded-full font-mono font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                    Installed: v{appVersion || '1.0.1'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  {/* Toggle 1: Auto-check on startup */}
                  <label className={`${PANEL} p-3 rounded-xl flex items-start gap-3 cursor-pointer hover:border-slate-600 transition`}>
                    <input
                      type="checkbox"
                      checked={autoCheckUpdates}
                      onChange={(e) => handleToggleAutoCheck(e.target.checked)}
                      className="mt-1 accent-yellow-400 w-4 h-4 cursor-pointer"
                    />
                    <div>
                      <div className="text-xs font-semibold text-[var(--ink)]">Check for updates on startup</div>
                      <div className={`text-[11px] ${MUTED}`}>
                        Automatically polls GitHub Releases when ErgoGotchi opens.
                      </div>
                    </div>
                  </label>

                  {/* Toggle 2: Auto-install before launch */}
                  <label className={`${PANEL} p-3 rounded-xl flex items-start gap-3 cursor-pointer hover:border-slate-600 transition`}>
                    <input
                      type="checkbox"
                      checked={autoInstallUpdates}
                      onChange={(e) => handleToggleAutoInstall(e.target.checked)}
                      className="mt-1 accent-yellow-400 w-4 h-4 cursor-pointer"
                    />
                    <div>
                      <div className="text-xs font-semibold text-[var(--ink)]">Auto-install updates before launch</div>
                      <div className={`text-[11px] ${MUTED}`}>
                        Installs new releases automatically with a download progress indicator window.
                      </div>
                    </div>
                  </label>
                </div>

                {/* Manual Check Button & Result */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--line)]">
                  <button
                    type="button"
                    onClick={handleManualCheckClick}
                    disabled={checkingUpdates || isUpdating}
                    className={`${BUTTON_PRIMARY} flex items-center gap-2`}
                  >
                    <span>{checkingUpdates ? '⏳' : '🔍'}</span>
                    <span>{checkingUpdates ? 'Checking GitHub...' : 'Check for Updates Now'}</span>
                  </button>

                  {checkResult && (
                    <div className="text-xs font-semibold">
                      {checkResult.updateAvailable ? (
                        <span className="text-cyan-400 flex items-center gap-1.5">
                          <span>⚡</span> Update {checkResult.latestVersion} is available!
                        </span>
                      ) : checkResult.error ? (
                        <span className="text-rose-400">⚠️ {checkResult.error}</span>
                      ) : (
                        <span className="text-emerald-400">✓ ErgoGotchi is up to date!</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Update Available Highlight Card */}
                {checkResult?.updateAvailable && (
                  <div className="p-4 rounded-xl bg-cyan-950/40 border border-cyan-500/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
                          🚀 New Version {checkResult.latestVersion} Available
                        </h4>
                        <p className={`text-[11px] ${MUTED}`}>
                          {checkResult.releaseName || 'Bug fixes, performance improvements & new pet animations'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onTriggerUpdate?.(checkResult.asset)}
                        disabled={isUpdating}
                        className={`${BUTTON_PRIMARY} !bg-cyan-400 !text-slate-950 !border-cyan-400 font-bold`}
                      >
                        {isUpdating ? 'Downloading...' : 'Update & Restart Now'}
                      </button>
                    </div>
                    {checkResult.releaseNotes && (
                      <div className="text-[11px] text-slate-300 bg-slate-900/60 p-2.5 rounded-lg max-h-24 overflow-y-auto font-mono whitespace-pre-wrap select-text">
                        {checkResult.releaseNotes}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Launch at System Startup Card */}
              <div className={`${CARD} p-5 space-y-4`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🚀</span>
                    <div>
                      <h3 className="font-bold text-base">Launch at System Startup</h3>
                      <p className={`text-xs ${MUTED}`}>Configure ErgoGotchi to start automatically when your PC boots</p>
                    </div>
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-mono font-semibold ${
                    launchOnStartup
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-slate-500/20 text-slate-400 border border-slate-500/30'
                  }`}>
                    {launchOnStartup ? 'ENABLED' : 'DISABLED'}
                  </span>
                </div>

                <label className={`${PANEL} p-3.5 rounded-xl flex items-center justify-between cursor-pointer hover:border-slate-600 transition`}>
                  <div className="space-y-0.5">
                    <div className="text-xs font-semibold text-[var(--ink)]">
                      Start ErgoGotchi automatically when you log into your computer
                    </div>
                    <div className={`text-[11px] ${MUTED}`}>
                      Launches your pet docked in the screen corner so posture feedback is ready from your first line of code.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={launchOnStartup}
                    onChange={(e) => onToggleLaunchOnStartup?.(e.target.checked)}
                    className="accent-yellow-400 w-5 h-5 cursor-pointer ml-4"
                  />
                </label>
              </div>

              {/* Desktop Pet Placement & Draggable Setting */}
              <div className={`${CARD} p-5 space-y-4`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">📍</span>
                    <div>
                      <h3 className="font-bold text-base">Desktop Pet Placement</h3>
                      <p className={`text-xs ${MUTED}`}>Freely drag your duck anywhere on screen or snap back to corner</p>
                    </div>
                  </div>
                  <span className="text-xs px-2.5 py-1 rounded-full font-mono font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    DRAGGABLE
                  </span>
                </div>

                <div className={`${PANEL} p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3`}>
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-[var(--ink)]">
                      Move your pet freely across monitors and desktop space
                    </div>
                    <div className={`text-[11px] ${MUTED}`}>
                      Click and hold your duck to drag it to any corner, edge, or secondary monitor. Your position is automatically saved across sessions!
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if ((window as any).electronAPI?.dockPet) {
                        (window as any).electronAPI.dockPet();
                      } else {
                        localStorage.removeItem('ergogotchi_web_pet_offset');
                        window.dispatchEvent(new CustomEvent('pet-docked'));
                      }
                    }}
                    className={`${BUTTON_PRIMARY} whitespace-nowrap flex items-center gap-1.5`}
                  >
                    <span>📌</span>
                    <span>Dock to Corner</span>
                  </button>
                </div>
              </div>

              {/* Pet Display: Always Show Corn Level Overlay Card */}
              <div className={`${CARD} p-5 space-y-4`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🌽</span>
                    <div>
                      <h3 className="font-bold text-base">Corn Level & Pantry Overlay</h3>
                      <p className={`text-xs ${MUTED}`}>Choose whether the corn progress card stays pinned above your pet</p>
                    </div>
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-mono font-semibold ${
                    alwaysShowCorn
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-slate-500/20 text-slate-400 border border-slate-500/30'
                  }`}>
                    {alwaysShowCorn ? 'ALWAYS VISIBLE' : 'ON HOVER ONLY'}
                  </span>
                </div>

                <label className={`${PANEL} p-3.5 rounded-xl flex items-center justify-between cursor-pointer hover:border-slate-600 transition`}>
                  <div className="space-y-0.5">
                    <div className="text-xs font-semibold text-[var(--ink)]">
                      Always show corn level above pet
                    </div>
                    <div className={`text-[11px] ${MUTED}`}>
                      When enabled (default), your corn count and level-up requirement stay visible above your pet at all times. If unchecked, the indicator only appears while hovering.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={alwaysShowCorn}
                    onChange={(e) => handleToggleAlwaysShowCorn(e.target.checked)}
                    className="accent-yellow-400 w-5 h-5 cursor-pointer ml-4"
                  />
                </label>
              </div>

              {/* SpaceXSI Grok Bot & Mobile Notifications Card */}
              <div className={`${CARD} p-5 space-y-4`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🚀</span>
                    <div>
                      <h3 className="font-bold text-base">SpaceXSI Grok Bot & Mobile Webhooks</h3>
                      <p className={`text-xs ${MUTED}`}>Send end-of-session achievement medals and $0 desk fixes to your phone or Discord</p>
                    </div>
                  </div>
                  <span className="text-xs px-2.5 py-1 rounded-full font-mono font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    ntfy.sh / Discord
                  </span>
                </div>

                <div className={`${PANEL} p-4 rounded-xl space-y-3`}>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[var(--ink)] block">
                      Webhook Target URL
                    </label>
                    <p className={`text-[11px] ${MUTED}`}>
                      Use free <strong>ntfy.sh</strong> (e.g. <code className="text-cyan-300">https://ntfy.sh/ergogotchi_sunhacks_2026</code>) for lock-screen mobile toasts, or a Discord/Slack webhook URL.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="url"
                      value={webhookUrlInput}
                      onChange={(e) => handleSaveWebhook(e.target.value)}
                      placeholder="https://ntfy.sh/ergogotchi_sunhacks_2026"
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:border-cyan-400 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleTestWebhookPing}
                      disabled={isTestingWebhook || !webhookUrlInput.trim()}
                      className={`${BUTTON_PRIMARY} !bg-cyan-500 !text-slate-950 !border-cyan-400 font-bold whitespace-nowrap`}
                    >
                      {isTestingWebhook ? 'Sending...' : '⚡ Test Ping'}
                    </button>
                  </div>

                  {testWebhookStatus && (
                    <div className={`text-xs font-mono p-2.5 rounded-lg border ${
                      testWebhookStatus.startsWith('✓')
                        ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                        : 'bg-red-950/40 border-red-500/40 text-red-300'
                    }`}>
                      {testWebhookStatus}
                    </div>
                  )}
                </div>
              </div>

              {/* Dev 1 Biometric Safeguards Overview */}
              <div className={`${CARD} p-5 space-y-4`}>
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <span>🛡️</span> Biometric Safeguards & Tuning
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className={`${PANEL} p-3 rounded-lg space-y-1`}>
                    <div className="font-semibold text-emerald-400">👀 Optical Fixation Guard</div>
                    <div className={MUTED}>
                      Blink rate threshold set to &lt;7 blinks/min. Triggers a cute reminder and gently drains HP with an exponential acceleration curve if prolonged.
                    </div>
                  </div>

                  <div className={`${PANEL} p-3 rounded-lg space-y-1`}>
                    <div className="font-semibold text-cyan-400">🖥️ Multi-Monitor Yaw Guard</div>
                    <div className={MUTED}>
                      Head turns up to 20° are protected. Turning to look at secondary screens won't trigger false forward-head slouch alerts.
                    </div>
                  </div>

                  <div className={`${PANEL} p-3 rounded-lg space-y-1`}>
                    <div className="font-semibold text-indigo-400">📐 Ergonomic Sensitivities</div>
                    <div className={MUTED}>
                      Calibrated with slightly relaxed tolerances (Forward Head 0.08–0.20, Neck Pitch 14°–32°) to accommodate natural breathing and posture variations.
                    </div>
                  </div>

                  <div className={`${PANEL} p-3 rounded-lg space-y-1`}>
                    <div className="font-semibold text-amber-400">☕ Absence Detection</div>
                    <div className={MUTED}>
                      If your face leaves the frame for &gt;3 seconds, the pet enters AWAY mode and freezes all health drain until you return.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
