/**
 * Main Application Component for ErgoGotchi.
 * Orchestrates edge vision, scoring engine, WebSocket streaming, and UI views.
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  BiometricSignals, 
  PetState, 
  DifficultyLevel,
  ScoringParams, 
  ScoringState, 
  StretchCue,
  UpdateInfo,
  UpdateProgress,
} from './types';
import { 
  createInitialState, 
  DEMO_PARAMS, 
  DIFFICULTY_PRESETS,
  NORMAL_PARAMS, 
  step 
} from './dev1_sensing_and_scoring/scoring';
import { visionPipeline, CAMERA_PREF_KEY, type CameraOption } from './dev1_sensing_and_scoring/visionPipeline';
import { wsClient } from './net/websocketClient';
import { MascotSprite } from './dev2_mascot_and_ui/MascotSprite';
import type { Activity, ForcedActivity, PetEmote } from './dev2_mascot_and_ui/PixelMascot';
import {
  cornInterval,
  earnCorn,
  earnsCorn,
  feed,
  grantCorn,
  loadPet,
  PET_STORAGE_KEY,
  startOver,
  updatePet,
  setLevel,
  type PetProfile,
} from './dev2_mascot_and_ui/progression';
import { OnboardingWizard, ONBOARDING_STORAGE_KEY } from './dev2_mascot_and_ui/OnboardingWizard';
import { DEFAULT_SKIN, loadStoredSkin, saveStoredSkin, SKIN_STORAGE_KEY, type EggShellSkin } from './dev2_mascot_and_ui/eggShellSkins';

/** Posture warnings clear after this many consecutive seconds of good posture. */
const CLEAR_WARNING_AFTER_GOOD_SECONDS = 2;
/** Strain below this counts as "sitting up" (same line where HP stops draining). */
const GOOD_POSTURE_STRAIN = 0.5;
const POSTURE_CUES: StretchCue[] = ['CHIN_TUCK', 'SHOULDER_ROLL', 'SIT_BACK'];

/** How long the "don't duck with me" knife warning stays up (matches the speech bubble). */
const KNIFE_EMOTE_MS = 8000;
import { Dashboard } from './dev2_mascot_and_ui/Dashboard';
import {
  DEMO_TIME_MULTIPLIER,
  EVENTS_STORAGE_KEY,
  JOURNAL_STORAGE_KEY,
  loadEvents,
  loadJournal,
  recordFeed,
  tickJournal,
  updateEvents,
  updateJournal,
  type Events,
  type Journal,
} from './dev2_mascot_and_ui/journal';
import {
  BUTTON_NEUTRAL,
  BUTTON_PRIMARY,
  loadTheme,
  PAGE,
  saveTheme,
  THEME_CYCLE_ORDER,
  THEME_STORAGE_KEY,
  THEMES,
  type ThemeMode,
} from './dev2_mascot_and_ui/theme';

interface ElectronAPI {
  isElectron: boolean;
  openDashboard: () => void;
  setPetBounds?: (bounds: { width: number; height: number; x?: number; y?: number; center?: boolean }) => void;
  setIgnoreMouse?: (ignore: boolean) => void;
  onRecalibrate: (cb: () => void) => void;
  onForceState: (cb: (state: PetState) => void) => void;
  onToggleDemoMode: (cb: () => void) => void;
  setCameraList: (cameras: CameraOption[], activeId: string | null) => void;
  onSelectCamera: (cb: (deviceId: string) => void) => void;
  onActivity: (cb: (activity: Activity) => void) => void;
  onForceActivity: (cb: (value: ForcedActivity) => void) => void;
  onAddCorn: (cb: (amount: number) => void) => void;
  onResetGrowth: (cb: () => void) => void;
  onOpenWizard?: (cb: () => void) => void;
  setWizardActive?: (active: boolean) => void;
  onSetDifficulty?: (cb: (level: DifficultyLevel) => void) => void;
  centerPet?: (width?: number, height?: number) => void;
  dockPet?: () => void;
  onToggleLock?: (cb: (locked: boolean) => void) => void;
  setLocked?: (locked: boolean) => void;
  onFeedDuck?: (cb: () => void) => void;
  movePet?: (x: number, y: number, save?: boolean) => void;
  movePetBy?: (dx: number, dy: number, save?: boolean) => void;
  getPetPosition?: () => Promise<{ x: number; y: number }>;
  onPetDocked?: (cb: () => void) => void;
  setAlwaysShowCorn?: (show: boolean) => void;
  onAlwaysShowCornChanged?: (cb: (show: boolean) => void) => void;
  checkForUpdates?: () => Promise<UpdateInfo>;
  downloadAndInstallUpdate?: (asset: { name: string; downloadUrl: string; size?: number }) => Promise<{ success: boolean; path?: string; error?: string }>;
  onUpdateProgress?: (cb: (progress: UpdateProgress) => void) => void;
  onUpdateAvailable?: (cb: (info: UpdateInfo) => void) => void;
  getLoginItemSettings?: () => Promise<boolean>;
  setLoginItemSettings?: (openAtLogin: boolean) => Promise<boolean>;
  getAppVersion?: () => Promise<string>;
  onMenuCheckUpdates?: (cb: () => void) => void;
}

/**
 * Presenter controls are shared between the pet window and the dashboard window, so a button
 * pressed in the dashboard acts on the duck on the desktop. Each window keeps its own copy and
 * broadcasts changes to the other over this channel.
 */
interface PresenterState {
  forcedState: PetState | null;
  forcedActivity: ForcedActivity;
  demoMode: boolean;
}
type PresenterMessage =
  | { type: 'set'; patch: Partial<PresenterState> }
  | { type: 'hello' }
  | { type: 'recalibrate' }
  | { type: 'warning' }
  | { type: 'lock'; locked: boolean }
  | { type: 'skin'; skin: EggShellSkin }
  | { type: 'scoring'; state: PetState; hp: number; strainIndex?: number }
  | { type: 'feed' };
const presenterChannel: BroadcastChannel | null =
  typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('ergogotchi-presenter');

const FORCED_ACTIVITY: Record<Exclude<ForcedActivity, 'AUTO'>, Activity> = {
  WATCHING: { scene: 'WATCHING', music: false },
  MUSIC: { scene: 'IDLE', music: true },
  WORKING: { scene: 'WORKING', music: false },
  NONE: { scene: 'IDLE', music: false },
};

const electronAPI: ElectronAPI | undefined = (window as any).electronAPI;
const isDashboardView = new URLSearchParams(window.location.search).get('view') === 'dashboard';
// Electron's transparent pet window: render only the mascot, no browser demo chrome
const isPetWindow = !!electronAPI?.isElectron && !isDashboardView;
const captureMouse = {
  onMouseEnter: () => electronAPI?.setIgnoreMouse?.(false),
  onMouseLeave: () => electronAPI?.setIgnoreMouse?.(true),
};

// React StrictMode runs effects twice in dev; the camera must only be opened once
let visionStarted = false;
let cameraSwitchInFlight = false;
// Electron menu listeners must be attached once, or "Give 10 corn" would be applied twice in dev
let growthMenuBound = false;

// Only one window hands out corn, so the pet and dashboard windows don't both count the same second.
// In Electron that is the pet window; in a plain browser tab it is the page itself.
const awardsCorn = !electronAPI?.isElectron || isPetWindow;

export const App: React.FC = () => {
  // Application view state
  const [showDashboard, setShowDashboard] = useState(isDashboardView);
  const [isDemoMode, setIsDemoMode] = useState(true); // Default to Demo mode for sunhacks judging!
  const [difficulty, setDifficulty] = useState<DifficultyLevel>(() => {
    try {
      const saved = localStorage.getItem('ergogotchi.difficulty');
      if (saved === 'strict' || saved === 'normal' || saved === 'forgiving') return saved;
    } catch {}
    return 'normal';
  });
  const difficultyRef = useRef(difficulty);
  difficultyRef.current = difficulty;

  const handleSetDifficulty = (level: DifficultyLevel) => {
    setDifficulty(level);
    try {
      localStorage.setItem('ergogotchi.difficulty', level);
    } catch {}
  };

  const [forcedState, setForcedState] = useState<PetState | null>(null);
  const [showWizard, setShowWizard] = useState<boolean>(() => {
    try {
      return !localStorage.getItem(ONBOARDING_STORAGE_KEY);
    } catch {
      return false;
    }
  });
  const [isLocked, setIsLocked] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('ergogotchi_pet_locked');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const handleToggleLock = (locked: boolean) => {
    setIsLocked(locked);
    try {
      localStorage.setItem('ergogotchi_pet_locked', String(locked));
    } catch {}
    electronAPI?.setLocked?.(locked);
    presenterChannel?.postMessage({ type: 'lock', locked });
  };

  const [eggShellSkin, setEggShellSkin] = useState<EggShellSkin>(() => loadStoredSkin());
  const handleSelectSkin = (skin: EggShellSkin) => {
    setEggShellSkin(skin);
    saveStoredSkin(skin);
    presenterChannel?.postMessage({ type: 'skin', skin });
  };

  // Scoring and biometric state
  const [scoringState, setScoringState] = useState<ScoringState>(createInitialState());
  const [currentSignals, setCurrentSignals] = useState<BiometricSignals | null>(null);
  const [isCalibrated, setIsCalibrated] = useState(false);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [isPresent, setIsPresent] = useState(true);
  const [isConnected, setIsConnected] = useState(false);

  // Camera picker state
  const [cameras, setCameras] = useState<CameraOption[]>([]);
  const [activeCameraId, setActiveCameraId] = useState<string | null>(null);

  // The pet's profile (name, level, corn, clothes), kept in localStorage and shared between windows
  const [pet, setPet] = useState<PetProfile>(() => loadPet());
  const changePet = (change: (pet: PetProfile) => PetProfile) => setPet(updatePet(change));
  // Seconds of upright sitting counted towards the next corn
  const uprightSecondsRef = useRef(0);
  // Posture journal (time counters) and events (things the user did): quests, achievements, report
  const [journal, setJournal] = useState<Journal>(() => loadJournal());
  const [events, setEvents] = useState<Events>(() => loadEvents());
  const changeEvents = (change: (events: Events) => Events) => setEvents(updateEvents(change));

  // Aesthetic Theme State (Sanrio Pastel, Kuromi Gothic, Midnight Classic, Daylight Cream)
  const [theme, setTheme] = useState<ThemeMode>(() => loadTheme());
  const toggleTheme = () =>
    setTheme((mode) => {
      const idx = THEME_CYCLE_ORDER.indexOf(mode);
      const next = THEME_CYCLE_ORDER[(idx + 1) % THEME_CYCLE_ORDER.length];
      saveTheme(next);
      return next;
    });

  const handleSelectTheme = (mode: ThemeMode) => {
    setTheme(mode);
    saveTheme(mode);
  };

  /** Feed the pet the corn it needs to level up. Returns false if there isn't enough corn. */
  const handleFeed = (): boolean => {
    let fed = false;
    changePet((p) => {
      const next = feed(p);
      fed = next !== p;
      return next;
    });
    if (fed) changeEvents((e) => recordFeed(e));
    return fed;
  };

  // What the user is doing on the computer, detected by the Electron shell (or forced for demos)
  const [detectedActivity, setDetectedActivity] = useState<Activity>({ scene: 'IDLE', music: false });
  const [forcedActivity, setForcedActivity] = useState<ForcedActivity>('AUTO');
  const activity = forcedActivity === 'AUTO' ? detectedActivity : FORCED_ACTIVITY[forcedActivity];
  const forcedActivityRef = useRef(forcedActivity);
  forcedActivityRef.current = forcedActivity;

  // Auto-Update & Launch on Startup State
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateProgress, setUpdateProgress] = useState<UpdateProgress | null>(null);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [showUpdateModal, setShowUpdateModal] = useState<boolean>(false);
  const [appVersion, setAppVersion] = useState<string>('1.0.1');
  const [launchOnStartup, setLaunchOnStartup] = useState<boolean>(false);

  // Speech bubble state
  const [speechText, setSpeechText] = useState<string | null>(null);
  const [speechCue, setSpeechCue] = useState<StretchCue | null>(null);

  // Temporary pet reaction shown on top of its normal look
  const [emote, setEmote] = useState<PetEmote | null>(null);
  const emoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showEmote = (e: PetEmote, ms: number) => {
    setEmote(e);
    if (emoteTimerRef.current) clearTimeout(emoteTimerRef.current);
    emoteTimerRef.current = setTimeout(() => setEmote(null), ms);
  };

  const scoringStateRef = useRef<ScoringState>(scoringState);
  scoringStateRef.current = scoringState;

  const forcedStateRef = useRef<PetState | null>(forcedState);
  forcedStateRef.current = forcedState;

  const isDemoModeRef = useRef<boolean>(isDemoMode);
  isDemoModeRef.current = isDemoMode;

  const sessionStartTimeRef = useRef<number>(Date.now());

  // Latest vision output, read by the 1 Hz loop without restarting it (signals arrive at 25 fps)
  const currentSignalsRef = useRef<BiometricSignals | null>(null);
  currentSignalsRef.current = currentSignals;
  const isPresentRef = useRef<boolean>(isPresent);
  isPresentRef.current = isPresent;

  const speechCueRef = useRef<StretchCue | null>(speechCue);
  speechCueRef.current = speechCue;
  const emoteRef = useRef<PetEmote | null>(emote);
  emoteRef.current = emote;
  const goodPostureSecondsRef = useRef(0);

  // 1. Initialise Vision Pipeline & WebSocket Client
  useEffect(() => {
    wsClient.onConnectionChange = (connected) => setIsConnected(connected);
    wsClient.onInterventionReceived = (msg) => {
      // A slow (e.g. Gemini) reply can land after the user already sat up: don't nag then
      const postureCue = POSTURE_CUES.includes(msg.cue as StretchCue);
      if (postureCue && scoringStateRef.current.strainIndex < GOOD_POSTURE_STRAIN) return;
      setSpeechText(msg.text);
      setSpeechCue(msg.cue);
    };
    wsClient.connect();

    // Setup vision callbacks
    visionPipeline.onSignalsComputed = (signals, present) => {
      setCurrentSignals(signals);
      setIsPresent(present);
    };

    visionPipeline.onCalibrationComplete = () => {
      setIsCalibrated(true);
      setIsCalibrating(false);
    };

    // Auto-start camera and run initial calibration
    const initVision = async () => {
      await visionPipeline.initMediaPipe();
      await visionPipeline.startCamera();
      refreshCameras();
      // Auto-start 5s calibration
      setIsCalibrating(true);
      visionPipeline.startCalibration();
    };

    if (!visionStarted) {
      visionStarted = true;
      if (awardsCorn) {
        initVision();
      } else {
        refreshCameras();
      }
    }
  }, []);

  // Camera picker: keep the list current, and tell Electron so the right-click menu can show it
  const refreshCameras = async () => {
    const list = await visionPipeline.listCameras();
    setCameras(list);
    setActiveCameraId(visionPipeline.activeCameraId);
    if (isPetWindow) electronAPI?.setCameraList?.(list, visionPipeline.activeCameraId);
  };

  const handleSelectCamera = async (deviceId: string) => {
    if (!deviceId || deviceId === visionPipeline.activeCameraId) return;
    // One switch at a time: duplicate events (menu + storage, StrictMode listeners) must not open two streams
    if (cameraSwitchInFlight) return;
    cameraSwitchInFlight = true;
    const all = await visionPipeline.listCameras();
    const nameOf = (id: string | null) => all.find((c) => c.deviceId === id)?.label ?? 'that camera';
    let switched = false;
    try {
      switched = await visionPipeline.switchCamera(deviceId);
      await refreshCameras();
    } finally {
      cameraSwitchInFlight = false;
    }
    setSpeechCue(null);
    if (!switched) {
      // Nothing changed: say so instead of silently recalibrating on the old camera
      const current = visionPipeline.activeCameraId;
      setSpeechText(
        `Couldn't start ${nameOf(deviceId)}. Is its app running?` +
          (current ? ` Still using ${nameOf(current)}.` : '')
      );
      return;
    }
    setSpeechText(`Now watching through ${nameOf(deviceId)}.`);
    // A different camera sees you from a different angle: the old baseline no longer applies
    handleRecalibrate();
  };

  useEffect(() => {
    // Cameras plugged in or removed
    const onDeviceChange = () => refreshCameras();
    // Another window (pet <-> dashboard) picked a camera: follow it
    const onStorage = (e: StorageEvent) => {
      if (e.key === CAMERA_PREF_KEY && e.newValue) handleSelectCamera(e.newValue);
    };
    navigator.mediaDevices?.addEventListener('devicechange', onDeviceChange);
    window.addEventListener('storage', onStorage);
    electronAPI?.onSelectCamera?.((deviceId) => handleSelectCamera(deviceId));
    return () => {
      navigator.mediaDevices?.removeEventListener('devicechange', onDeviceChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  // Update actions
  const handleManualCheckUpdates = async (): Promise<UpdateInfo> => {
    if (electronAPI?.checkForUpdates) {
      try {
        const info = await electronAPI.checkForUpdates();
        setUpdateInfo(info);
        return info;
      } catch (err: any) {
        const errInfo: UpdateInfo = {
          updateAvailable: false,
          currentVersion: appVersion,
          latestVersion: appVersion,
          error: err?.message || 'Could not connect to update server',
        };
        setUpdateInfo(errInfo);
        return errInfo;
      }
    }
    const fallback: UpdateInfo = {
      updateAvailable: false,
      currentVersion: appVersion,
      latestVersion: appVersion,
    };
    setUpdateInfo(fallback);
    return fallback;
  };

  const handleTriggerUpdate = async (asset?: { name: string; downloadUrl: string; size?: number } | null) => {
    const target = asset || updateInfo?.asset;
    if (!target) return;
    setIsUpdating(true);
    setShowUpdateModal(true);
    setUpdateProgress({ percent: 0, receivedBytes: 0, totalBytes: target.size || 0 });

    try {
      if (electronAPI?.downloadAndInstallUpdate) {
        await electronAPI.downloadAndInstallUpdate(target);
      }
    } catch (err: any) {
      console.warn('[App] Update install failed:', err);
      setIsUpdating(false);
      setShowUpdateModal(false);
    }
  };

  const handleToggleLaunchOnStartup = async (enabled: boolean) => {
    setLaunchOnStartup(enabled);
    if (electronAPI?.setLoginItemSettings) {
      try {
        const res = await electronAPI.setLoginItemSettings(enabled);
        setLaunchOnStartup(res);
      } catch (e) {
        console.warn('[App] Failed to update login item settings:', e);
      }
    }
  };

  // Auto-Updater & System Startup Listeners
  useEffect(() => {
    if (electronAPI?.getAppVersion) {
      electronAPI.getAppVersion().then((v) => {
        if (v) setAppVersion(v);
      });
    }
    if (electronAPI?.getLoginItemSettings) {
      electronAPI.getLoginItemSettings().then((enabled) => setLaunchOnStartup(!!enabled));
    }

    electronAPI?.onUpdateProgress?.((progress) => {
      setUpdateProgress(progress);
    });

    electronAPI?.onUpdateAvailable?.((info) => {
      setUpdateInfo(info);
      const autoInstall = localStorage.getItem('ergogotchi.autoInstallUpdates') === 'true';
      if (autoInstall && info.asset) {
        handleTriggerUpdate(info.asset);
      } else {
        setSpeechText(`⚡ Update ${info.latestVersion} available!`);
      }
    });

    electronAPI?.onMenuCheckUpdates?.(() => {
      handleManualCheckUpdates();
    });

    // Auto-check on startup if enabled (defaults to true)
    const autoCheck = localStorage.getItem('ergogotchi.autoCheckUpdates') !== 'false';
    if (autoCheck && electronAPI?.checkForUpdates) {
      electronAPI.checkForUpdates().then((info) => {
        if (info && info.updateAvailable) {
          setUpdateInfo(info);
          const autoInstall = localStorage.getItem('ergogotchi.autoInstallUpdates') === 'true';
          if (autoInstall && info.asset) {
            handleTriggerUpdate(info.asset);
          } else {
            setSpeechText(`⚡ Update ${info.latestVersion} available!`);
          }
        }
      });
    }
  }, []);

  // Update calibration progress
  useEffect(() => {
    if (!isCalibrating) return;
    const interval = setInterval(() => {
      setCalibrationProgress(visionPipeline.calibrationProgress);
      if (visionPipeline.isCalibrated) {
        setIsCalibrated(true);
        setIsCalibrating(false);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [isCalibrating]);

  // 2. 1-Hz Scoring & Telemetry Dispatch Loop
  useEffect(() => {
    // Only the primary window (pet window in Electron, or plain browser preview)
    // runs the scoring & telemetry loop. The dashboard window receives synced scoring over IPC.
    if (!awardsCorn) return;

    const loopInterval = setInterval(() => {
      const params: ScoringParams = isDemoModeRef.current 
        ? DEMO_PARAMS 
        : (DIFFICULTY_PRESETS[difficultyRef.current] || NORMAL_PARAMS);
      const prev = scoringStateRef.current;
      const currentSignals = currentSignalsRef.current;
      const isPresent = isPresentRef.current;

      // Execute pure scoring step
      let next = step(
        prev,
        currentSignals,
        1.0,
        params,
        visionPipeline.isCalibrated,
        isPresent
      );

      // Apply forced presenter hotkey state if active
      if (forcedStateRef.current) {
        next.state = forcedStateRef.current;
        if (forcedStateRef.current === 'THRIVING') next.hp = 95;
        if (forcedStateRef.current === 'NEUTRAL') next.hp = 75;
        if (forcedStateRef.current === 'SLOUCHING') next.hp = 45;
        if (forcedStateRef.current === 'WILTED') next.hp = 15;
      }

      setScoringState(next);
      presenterChannel?.postMessage({
        type: 'scoring',
        state: next.state,
        hp: next.hp,
        strainIndex: next.strainIndex,
      } satisfies PresenterMessage);

      // Sitting upright earns corn: one for every stretch of good posture
      if (awardsCorn) {
        let cornEarned = 0;
        if (earnsCorn(next.state)) {
          uprightSecondsRef.current += 1;
          if (uprightSecondsRef.current >= cornInterval(isDemoModeRef.current)) {
            uprightSecondsRef.current = 0;
            cornEarned = 1;
            changePet((p) => earnCorn(p, 1));
          }
        }
        // ...and is written into the journal behind the quests, achievements and session report
        const tick = {
          state: next.state,
          blinkRate: currentSignals?.blink_rate_1m ?? 0,
          seconds: isDemoModeRef.current ? DEMO_TIME_MULTIPLIER : 1,
          cornEarned,
        };
        setJournal(updateJournal((j) => tickJournal(j, tick)));
      }

      // Clear posture warnings (bubble + knife) shortly after the user sits up
      const goodPosture = next.state !== 'CALIBRATING' && next.strainIndex < GOOD_POSTURE_STRAIN;
      goodPostureSecondsRef.current = goodPosture ? goodPostureSecondsRef.current + 1 : 0;
      if (goodPostureSecondsRef.current >= CLEAR_WARNING_AFTER_GOOD_SECONDS) {
        if (speechCueRef.current && POSTURE_CUES.includes(speechCueRef.current as StretchCue)) {
          setSpeechText(null);
          setSpeechCue(null);
        }
        if (emoteRef.current === 'KNIFE') {
          if (emoteTimerRef.current) clearTimeout(emoteTimerRef.current);
          setEmote(null);
        }
      }

      // Contract 1: Emit 1 Hz Telemetry over WebSocket
      wsClient.sendTelemetry({
        present: isPresent,
        calibrated: visionPipeline.isCalibrated,
        forward_head: currentSignals ? currentSignals.forward_head : null,
        head_drop: currentSignals ? currentSignals.head_drop : null,
        head_pitch_deg: currentSignals ? currentSignals.head_pitch_deg : null,
        lean_in: currentSignals ? currentSignals.lean_in : null,
        shoulder_tilt_deg: currentSignals ? currentSignals.shoulder_tilt_deg : null,
        blink_rate_1m: currentSignals ? currentSignals.blink_rate_1m : null,
        strain_index: next.strainIndex,
        hp: Math.round(next.hp),
        state: next.state,
      });

      // Contract 2: Emit Intervention Request if trigger condition met
      if (next.triggerIntervention && next.interventionReason) {
        // Bad posture (slouching or leaning in too close) -> knife warning, even when offline
        if (next.interventionReason === 'SLOUCH') showEmote('KNIFE', KNIFE_EMOTE_MS);

        const sessionMins = Math.round((Date.now() - sessionStartTimeRef.current) / 60000);
        wsClient.requestIntervention(next.interventionReason, {
          minutes_in_session: Math.max(1, sessionMins),
          worst_signal: next.worstSignal || 'forward_head',
          strain_index: next.strainIndex,
          blink_rate_1m: currentSignals?.blink_rate_1m || 12,
          hp: Math.round(next.hp),
        });
      }
    }, 1000);

    return () => clearInterval(loopInterval);
  }, []);

  // Presenter controls: apply here and tell the other window
  const applyPresenter = (patch: Partial<PresenterState>) => {
    if ('forcedState' in patch) {
      const s = patch.forcedState ?? null;
      setForcedState(s);
      if (s) {
        const h = s === 'THRIVING' ? 95 : s === 'NEUTRAL' ? 75 : s === 'SLOUCHING' ? 45 : 15;
        setScoringState((prev) => ({ ...prev, state: s, hp: h }));
      }
    }
    if (patch.forcedActivity) setForcedActivity(patch.forcedActivity);
    if (typeof patch.demoMode === 'boolean') setIsDemoMode(patch.demoMode);
  };
  const setPresenter = (patch: Partial<PresenterState>) => {
    applyPresenter(patch);
    presenterChannel?.postMessage({ type: 'set', patch } satisfies PresenterMessage);
  };
  const forceState = (s: PetState | null) => setPresenter({ forcedState: s });
  const forceActivity = (value: ForcedActivity) => setPresenter({ forcedActivity: value });
  const toggleDemoMode = () => setPresenter({ demoMode: !isDemoModeRef.current });
  const showWarning = () => showEmote('KNIFE', KNIFE_EMOTE_MS);
  /** Warning emote in every window (the duck that matters is the one on the desktop). */
  const showWarningEverywhere = () => {
    showWarning();
    presenterChannel?.postMessage({ type: 'warning' } satisfies PresenterMessage);
  };
  /** Recalibrate in every window: each one runs its own camera pipeline. */
  const recalibrateEverywhere = () => {
    handleRecalibrate();
    presenterChannel?.postMessage({ type: 'recalibrate' } satisfies PresenterMessage);
  };

  useEffect(() => {
    if (!presenterChannel) return;
    const onMessage = (e: MessageEvent<PresenterMessage>) => {
      const msg = e.data;
      if (msg.type === 'set') applyPresenter(msg.patch);
      else if (msg.type === 'scoring') {
        if (!awardsCorn) {
          setScoringState((prev) => ({
            ...prev,
            state: msg.state,
            hp: msg.hp,
            strainIndex: msg.strainIndex ?? prev.strainIndex,
          }));
        }
      }
      else if (msg.type === 'recalibrate') {
        if (awardsCorn) handleRecalibrate();
      }
      else if (msg.type === 'warning') showWarning();
      else if (msg.type === 'lock') {
        setIsLocked(msg.locked);
        try {
          localStorage.setItem('ergogotchi_pet_locked', String(msg.locked));
        } catch {}
      } else if (msg.type === 'feed') {
        handleFeed();
      } else if (msg.type === 'skin') {
        setEggShellSkin(msg.skin);
        saveStoredSkin(msg.skin);
      } else if (msg.type === 'hello') {
        // A window just opened: send it the current controls
        presenterChannel.postMessage({
          type: 'set',
          patch: {
            forcedState: forcedStateRef.current,
            forcedActivity: forcedActivityRef.current,
            demoMode: isDemoModeRef.current,
          },
        } satisfies PresenterMessage);
        if (awardsCorn) {
          presenterChannel.postMessage({
            type: 'scoring',
            state: scoringStateRef.current.state,
            hp: scoringStateRef.current.hp,
            strainIndex: scoringStateRef.current.strainIndex,
          } satisfies PresenterMessage);
        }
      }
    };
    presenterChannel.addEventListener('message', onMessage);
    presenterChannel.postMessage({ type: 'hello' } satisfies PresenterMessage);
    return () => presenterChannel.removeEventListener('message', onMessage);
  }, []);

  // 3. Hotkeys handler for live judge walkthrough
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Typing in a text box (e.g. renaming the duck) must not trigger the single-key hotkeys
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const key = e.key.toLowerCase();
      if (key === '1') forceState('THRIVING');
      else if (key === '2') forceState('SLOUCHING');
      else if (key === '3') forceState('WILTED');
      else if (key === '4') forceState(null); // back to following the camera
      else if (key === '5') showWarningEverywhere();
      else if (key === '6') forceActivity('WATCHING');
      else if (key === '7') forceActivity('MUSIC');
      else if (key === '8') forceActivity('WORKING');
      else if (key === '9') forceActivity('AUTO'); // back to following the real foreground app
      else if (key === 'x') changePet((p) => grantCorn(p, 10));
      else if (key === 'z') changePet((p) => grantCorn(p, 100));
      else if (key === 'f') handleFeed();
      else if (key === ']') changePet((p) => setLevel(p, p.level + 1));
      else if (key === '[') changePet((p) => setLevel(p, p.level - 1));
      else if (key === 'e') changePet(startOver);
      else if (key === 'd') toggleDemoMode();
      else if (key === 'c') recalibrateEverywhere();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleRecalibrate = () => {
    setIsCalibrating(true);
    visionPipeline.startCalibration();
  };

  // 4. Electron native right-click menu actions
  useEffect(() => {
    if (!electronAPI) return;
    electronAPI.onRecalibrate(() => handleRecalibrate());
    electronAPI.onForceState((s) => forceState(s));
    electronAPI.onToggleDemoMode(() => toggleDemoMode());
    electronAPI.onOpenWizard?.(() => setShowWizard(true));
    electronAPI.onToggleLock?.((locked) => {
      setIsLocked(locked);
      try {
        localStorage.setItem('ergogotchi_pet_locked', String(locked));
      } catch {}
    });
    electronAPI.onFeedDuck?.(() => {
      handleFeed();
    });
    electronAPI.onSetDifficulty?.((level) => handleSetDifficulty(level));
    const onDiffEvent = () => {
      try {
        const saved = localStorage.getItem('ergogotchi.difficulty');
        if (saved === 'strict' || saved === 'normal' || saved === 'forgiving') setDifficulty(saved);
      } catch {}
    };
    window.addEventListener('ergogotchi-difficulty-changed', onDiffEvent);
    return () => window.removeEventListener('ergogotchi-difficulty-changed', onDiffEvent);
  }, []);

  // 5. Growth and activity: follow the Electron shell and the other window
  useEffect(() => {
    // The pet lives in localStorage; each window picks up what the other one changed
    const onStorage = (e: StorageEvent) => {
      if (e.key === PET_STORAGE_KEY) setPet(loadPet());
      else if (e.key === JOURNAL_STORAGE_KEY) setJournal(loadJournal());
      else if (e.key === EVENTS_STORAGE_KEY) setEvents(loadEvents());
      else if (e.key === THEME_STORAGE_KEY) setTheme(loadTheme());
      else if (e.key === 'ergogotchi_pet_locked') {
        setIsLocked(e.newValue !== 'false');
      } else if (e.key === SKIN_STORAGE_KEY && e.newValue) {
        setEggShellSkin(e.newValue as EggShellSkin);
      }
    };
    window.addEventListener('storage', onStorage);

    if (electronAPI && !growthMenuBound) {
      growthMenuBound = true;
      electronAPI.onActivity?.((a) => setDetectedActivity(a));
      electronAPI.onForceActivity?.((value) => forceActivity(value));
      electronAPI.onAddCorn?.((amount) => changePet((p) => grantCorn(p, amount)));
      electronAPI.onResetGrowth?.(() => changePet(startOver));
    }
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Handle dynamic pet window size expansion & centering for onboarding wizard
  useEffect(() => {
    if (isPetWindow) {
      electronAPI?.setWizardActive?.(showWizard);
      if (showWizard) {
        if (electronAPI?.centerPet) {
          electronAPI.centerPet(480, 640);
        } else if (electronAPI?.setPetBounds) {
          electronAPI.setPetBounds({ width: 480, height: 640, center: true });
        }
        electronAPI?.setIgnoreMouse?.(false);
      }
    }
  }, [isPetWindow, showWizard]);

  const handleWizardComplete = () => {
    setShowWizard(false);
    if (isPetWindow) {
      electronAPI?.setWizardActive?.(false);
      // Return to original corner dock position
      if (electronAPI?.dockPet) {
        electronAPI.dockPet();
      } else if (electronAPI?.setPetBounds) {
        electronAPI.setPetBounds({ width: 340, height: 480 });
      }
      electronAPI?.setIgnoreMouse?.(true);
    }
    handleRecalibrate();
  };

  const handleOpenDashboard = () => {
    if (electronAPI) electronAPI.openDashboard();
    else setShowDashboard(true);
  };

  const activeState = forcedState || scoringState.state;
  const activeHp = forcedState
    ? (forcedState === 'THRIVING' ? 95 : forcedState === 'NEUTRAL' ? 75 : forcedState === 'SLOUCHING' ? 45 : 15)
    : scoringState.hp;

  // Fullscreen / Floating Update Progress Modal (when downloading/installing)
  const updateModal = showUpdateModal && (
    <div
      {...captureMouse}
      className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 select-none"
      style={{ WebkitAppRegion: 'no-drag' } as any}
    >
      <div className="bg-slate-900 border-2 border-cyan-400 rounded-3xl p-4 sm:p-6 w-full max-w-[310px] sm:max-w-md shadow-2xl space-y-3 sm:space-y-4 text-center">
        <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto rounded-2xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-2xl sm:text-3xl animate-pulse">
          📦
        </div>
        <div>
          <h3 className="text-base sm:text-lg font-bold text-white">Updating ErgoGotchi</h3>
          <p className="text-[11px] sm:text-xs text-slate-300 mt-0.5">
            Downloading version {updateInfo?.latestVersion || 'latest'} from GitHub...
          </p>
        </div>

        <div className="space-y-1.5 pt-1">
          <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden border border-slate-700">
            <div
              className="bg-gradient-to-r from-cyan-400 to-emerald-400 h-full transition-all duration-150"
              style={{ width: `${updateProgress?.percent || 0}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-[10px] sm:text-[11px] font-mono text-slate-400 px-1">
            <span>
              {updateProgress && updateProgress.totalBytes > 0
                ? `${(updateProgress.receivedBytes / (1024 * 1024)).toFixed(1)} / ${(updateProgress.totalBytes / (1024 * 1024)).toFixed(1)} MB`
                : 'Connecting...'}
            </span>
            <span className="text-cyan-300 font-bold">{updateProgress?.percent || 0}%</span>
          </div>
        </div>

        <p className="text-[10px] sm:text-[11px] text-slate-400 italic">
          {updateProgress && updateProgress.percent >= 100
            ? '✓ Download complete! Launching installer and restarting...'
            : 'ErgoGotchi will restart automatically.'}
        </p>
      </div>
    </div>
  );

  if (isPetWindow) {
    if (showWizard) {
      return (
        <div className="w-screen h-screen bg-transparent flex items-center justify-center p-2 select-none overflow-hidden">
          <OnboardingWizard
            onComplete={handleWizardComplete}
            onRecalibrateRequested={handleRecalibrate}
          />
        </div>
      );
    }

    return (
      <div className="w-screen h-screen bg-transparent flex flex-col items-center justify-end overflow-hidden select-none pb-1">
        {updateModal}
        <MascotSprite
          state={activeState}
          hp={activeHp}
          isReviving={scoringState.isReviving}
          speechText={speechText}
          speechCue={speechCue}
          emote={emote}
          pet={pet}
          onFeed={handleFeed}
          activity={activity}
          onDismissSpeech={() => setSpeechText(null)}
          onOpenDashboard={handleOpenDashboard}
          onRecalibrate={handleRecalibrate}
          isLocked={isLocked}
          onToggleLock={handleToggleLock}
          isCalibrating={isCalibrating}
          calibrationProgress={calibrationProgress}
          skin={eggShellSkin}
        />
      </div>
    );
  }

  // First-run setup wizard, shown on top of the dashboard or the browser preview
  const wizardOverlay = showWizard && (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
      <OnboardingWizard onComplete={handleWizardComplete} onRecalibrateRequested={handleRecalibrate} />
    </div>
  );

  if (showDashboard) {
    return (
      <div data-theme={theme} className={`h-screen font-sans select-none overflow-hidden ${PAGE}`}>
        {wizardOverlay}
        {updateModal}
        <Dashboard
          hp={activeHp}
          state={activeState}
          strainIndex={scoringState.strainIndex}
          blinkRate={currentSignals?.blink_rate_1m || 14}
          worstSignal={scoringState.worstSignal || 'None'}
          isDemoMode={isDemoMode}
          onToggleDemoMode={toggleDemoMode}
          onForceState={forceState}
          onRecalibrate={recalibrateEverywhere}
          sessionId={wsClient.getSessionId()}
          pet={pet}
          onPetChange={changePet}
          onFeed={handleFeed}
          isConnected={isConnected}
          cameras={cameras}
          activeCameraId={activeCameraId}
          onSelectCamera={handleSelectCamera}
          onHide={isDashboardView ? undefined : () => setShowDashboard(false)}
          forcedState={forcedState}
          forcedActivity={forcedActivity}
          onForceActivity={forceActivity}
          onShowWarning={showWarningEverywhere}
          journal={journal}
          events={events}
          onEventsChange={changeEvents}
          theme={theme}
          onToggleTheme={toggleTheme}
          onSelectTheme={handleSelectTheme}
          isLocked={isLocked}
          onToggleLock={handleToggleLock}
          skin={eggShellSkin}
          onSelectSkin={handleSelectSkin}
          difficulty={difficulty}
          onSetDifficulty={handleSetDifficulty}
          isPresent={isPresent}
          isCalibrating={isCalibrating}
          calibrationProgress={calibrationProgress}
          appVersion={appVersion}
          updateInfo={updateInfo}
          updateProgress={updateProgress}
          isUpdating={isUpdating}
          onCheckForUpdates={handleManualCheckUpdates}
          onTriggerUpdate={handleTriggerUpdate}
          launchOnStartup={launchOnStartup}
          onToggleLaunchOnStartup={handleToggleLaunchOnStartup}
        />
      </div>
    );
  }

  // Browser preview: a pretend desktop with the duck in the corner
  return (
    <div data-theme={theme} className={`min-h-screen flex flex-col font-sans select-none relative overflow-hidden ${PAGE}`}>
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 bg-[var(--surface)] border-b border-[var(--line)]">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-[var(--accent)] flex items-center justify-center text-xl">🦆</span>
          <div className="leading-tight">
            <h1 className="text-base font-bold tracking-tight">ErgoGotchi</h1>
            <p className="text-[11px] text-[var(--muted)]">Desktop preview</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={toggleTheme} className={`${BUTTON_NEUTRAL} flex items-center gap-1.5`} title="Cycle theme">
            <span>{THEMES.find((t) => t.id === theme)?.icon ?? '🌸'}</span>
            <span>{THEMES.find((t) => t.id === theme)?.label ?? 'Theme'}</span>
          </button>
          <button onClick={() => setShowWizard(true)} className={BUTTON_NEUTRAL}>
            Setup wizard 🪄
          </button>
          <button onClick={() => setShowDashboard(true)} className={BUTTON_PRIMARY}>
            Open dashboard
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center relative z-10 w-full p-4">
        {updateModal}
        {wizardOverlay}
          <div className="relative w-full max-w-4xl min-h-[500px] rounded-3xl bg-slate-900/40 border border-slate-800/80 shadow-2xl flex flex-col justify-between p-6 backdrop-blur-sm overflow-hidden">
            {/* Mock Code Editor in Background to demonstrate desktop companion feel */}
            <div className="font-mono text-xs text-slate-500 space-y-1 select-none pointer-events-none opacity-60">
              <p><span className="text-purple-400">import</span> &#123; ErgoGotchi &#125; <span className="text-purple-400">from</span> <span className="text-emerald-400">'@sunhacks/ergogotchi'</span>;</p>
              <p><span className="text-blue-400">const</span> developer = <span className="text-yellow-400">new</span> <span className="text-emerald-300">Programmer</span>(&#123; caffeine: <span className="text-amber-400">100</span>, posture: <span className="text-emerald-400">'upright'</span> &#125;);</p>
              <p><span className="text-slate-600">// Slouching triggers instant ErgoGotchi comic intervention & Tiger Data continuous aggregation...</span></p>
              <p>developer.<span className="text-blue-300">maintainFlow</span>();</p>
            </div>

            {/* Calibration Overlay Banner */}
            {isCalibrating && (
              <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center z-50 p-6 text-center">
                <div className="w-16 h-16 rounded-full border-4 border-cyan-400 border-t-transparent animate-spin mb-4" />
                <h2 className="text-lg font-bold text-white mb-1">Calibrating Upright Posture...</h2>
                <p className="text-xs text-slate-300 max-w-sm mb-3">
                  Sit tall and look naturally at your screen for 5 seconds to lock your baseline zero-point.
                </p>
                <div className="w-48 bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-700">
                  <div
                    className="bg-cyan-400 h-full transition-all duration-200"
                    style={{ width: `${calibrationProgress}%` }}
                  />
                </div>
                <span className="text-xs font-mono text-cyan-300 mt-2">{calibrationProgress}%</span>
              </div>
            )}

            {/* Floating Desktop Pet */}
            <div className="flex justify-end items-end w-full">
              <MascotSprite
                state={activeState}
                hp={activeHp}
                isReviving={scoringState.isReviving}
                speechText={speechText}
                speechCue={speechCue}
                emote={emote}
                pet={pet}
                onFeed={handleFeed}
                activity={activity}
                onDismissSpeech={() => setSpeechText(null)}
                onOpenDashboard={handleOpenDashboard}
                onRecalibrate={handleRecalibrate}
                isLocked={isLocked}
                onToggleLock={handleToggleLock}
                isCalibrating={isCalibrating}
                calibrationProgress={calibrationProgress}
                skin={eggShellSkin}
              />
            </div>
          </div>
      </main>

      <footer className="text-center text-[11px] text-[var(--muted)] select-none pb-3">
        Double-click the duck or press “Open dashboard” for stats, wardrobe and presenter controls.
      </footer>
    </div>
  );
};
