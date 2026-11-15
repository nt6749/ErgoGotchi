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
import {
  visionPipeline,
  CAMERA_PREF_KEY,
  type CameraOption,
  type CameraStatus,
  type VisionLandmarks,
} from './dev1_sensing_and_scoring/visionPipeline';
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
import { BUTTON_NEUTRAL, BUTTON_PRIMARY, loadTheme, PAGE, saveTheme, type ThemeMode } from './dev2_mascot_and_ui/theme';

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
  | { type: 'select_camera'; deviceId: string }
  | { type: 'preview_request'; active: boolean }
  | {
      type: 'preview_frame';
      dataUrl: string;
      landmarks?: VisionLandmarks | null;
      timestamp: number;
    }
  | {
      type: 'telemetry_sync';
      hp: number;
      state: PetState;
      strainIndex: number;
      worstSignal: string;
      blinkRate: number;
      isCalibrated: boolean;
      isPresent: boolean;
      speechText?: string | null;
      speechCue?: StretchCue | null;
      activeCameraId?: string | null;
      cameraStatus?: CameraStatus;
    };
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
  const [isDemoMode, setIsDemoMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('ergogotchi.demoMode') === 'true';
    } catch {
      return false;
    }
  });
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

  // Scoring and biometric state
  const [scoringState, setScoringState] = useState<ScoringState>(createInitialState());
  const [currentSignals, setCurrentSignals] = useState<BiometricSignals | null>(null);
  const [isCalibrated, setIsCalibrated] = useState(() => visionPipeline.isCalibrated);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [isPresent, setIsPresent] = useState(true);
  const [isConnected, setIsConnected] = useState(false);

  // Camera picker state
  const [cameras, setCameras] = useState<CameraOption[]>([]);
  const [activeCameraId, setActiveCameraId] = useState<string | null>(null);
  const [previewFrame, setPreviewFrame] = useState<string | null>(null);
  const [landmarks, setLandmarks] = useState<VisionLandmarks | null>(null);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>(() => visionPipeline.cameraStatus);
  const previewRequestedRef = useRef<boolean>(false);
  const lastPreviewRequestedAtRef = useRef<number>(0);

  // The pet's profile (name, level, corn, clothes), kept in localStorage and shared between windows
  const [pet, setPet] = useState<PetProfile>(() => loadPet());
  const changePet = (change: (pet: PetProfile) => PetProfile) => setPet(updatePet(change));
  // Seconds of upright sitting counted towards the next corn
  const uprightSecondsRef = useRef(0);
  // Posture journal (time counters) and events (things the user did): quests, achievements, report
  const [journal, setJournal] = useState<Journal>(() => loadJournal());
  const [events, setEvents] = useState<Events>(() => loadEvents());
  const changeEvents = (change: (events: Events) => Events) => setEvents(updateEvents(change));

  // Dashboard light / dark mode
  const [theme, setTheme] = useState<ThemeMode>(() => loadTheme());
  const toggleTheme = () =>
    setTheme((mode) => {
      const next: ThemeMode = mode === 'dark' ? 'light' : 'dark';
      saveTheme(next);
      return next;
    });

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
  const lastTelemetrySyncAtRef = useRef<number>(0);

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

    // Auto-start camera and run initial calibration if not already calibrated
    const initVision = async () => {
      await visionPipeline.initMediaPipe();
      await visionPipeline.startCamera();
      refreshCameras();
      if (!visionPipeline.isCalibrated) {
        setIsCalibrating(true);
        visionPipeline.startCalibration();
      } else {
        setIsCalibrated(true);
      }
    };

    if (!visionStarted && (!isDashboardView || !electronAPI?.isElectron)) {
      visionStarted = true;
      initVision();
    }
  }, []);

  // Camera picker: keep the list current, and tell Electron so the right-click menu can show it
  const refreshCameras = async () => {
    const list = await visionPipeline.listCameras();
    setCameras(list);
    const active = visionPipeline.activeCameraId;
    setActiveCameraId(active);
    setCameraStatus(visionPipeline.cameraStatus);
    if (isPetWindow) electronAPI?.setCameraList?.(list, active);
  };

  // Re-enumerate cameras on mount across all windows (Duck & Dashboard) so camera list is immediately populated
  useEffect(() => {
    refreshCameras();
  }, []);

  const handleSelectCamera = async (deviceId: string) => {
    if (!deviceId) return;

    // Follower / Dashboard view: delegate hardware camera selection to Duck companion window
    if (isDashboardView && electronAPI?.isElectron) {
      setActiveCameraId(deviceId);
      try {
        localStorage.setItem(CAMERA_PREF_KEY, deviceId);
      } catch {}
      presenterChannel?.postMessage({
        type: 'select_camera',
        deviceId,
      } satisfies PresenterMessage);
      return;
    }

    if (deviceId === visionPipeline.activeCameraId) return;
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

  const handlePreviewRequest = (active: boolean) => {
    previewRequestedRef.current = active;
    if (active) {
      lastPreviewRequestedAtRef.current = Date.now();
    }
    if (isDashboardView && presenterChannel) {
      presenterChannel.postMessage({
        type: 'preview_request',
        active,
      } satisfies PresenterMessage);
    }
  };

  // Crisp Preview + Native Vector Overlay (Approach A): Broadcast frames + landmarks only when requested
  useEffect(() => {
    if (isDashboardView && electronAPI?.isElectron) return;

    // ~20-24 FPS (45ms interval). 640x360 JPEG 0.80 produces crisp feed with zero IPC overhead when dormant
    const streamInterval = setInterval(() => {
      if (!previewRequestedRef.current) return;
      // Auto-inactivate if Dashboard stopped requesting (e.g. closed without cleanup)
      if (Date.now() - lastPreviewRequestedAtRef.current > 6000) {
        previewRequestedRef.current = false;
        return;
      }
      if (!presenterChannel) return;

      const dataUrl = visionPipeline.capturePreviewFrame(false, 640, 360, 0.8);
      if (dataUrl) {
        presenterChannel.postMessage({
          type: 'preview_frame',
          dataUrl,
          landmarks: visionPipeline.latestLandmarks,
          timestamp: Date.now(),
        } satisfies PresenterMessage);
      }
    }, 45);

    return () => clearInterval(streamInterval);
  }, []);

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
    const loopInterval = setInterval(() => {
      // If this window is a secondary dashboard view receiving live telemetry from the desktop duck,
      // preserve the remote duck's live HP/strain instead of calculating locally without a camera
      const isReceivingRemoteTelemetry = isDashboardView && Date.now() - lastTelemetrySyncAtRef.current < 2500;
      if (isReceivingRemoteTelemetry) {
        return;
      }

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

      // Broadcast live telemetry to other open windows (e.g. popped-out companion dashboard)
      if (!isDashboardView && presenterChannel) {
        presenterChannel.postMessage({
          type: 'telemetry_sync',
          hp: next.hp,
          state: next.state,
          strainIndex: next.strainIndex,
          worstSignal: next.worstSignal || 'None',
          blinkRate: currentSignals?.blink_rate_1m || 14,
          isCalibrated: visionPipeline.isCalibrated,
          isPresent,
          speechText: speechCueRef.current ? speechText : null,
          speechCue: speechCueRef.current,
          activeCameraId: visionPipeline.activeCameraId,
          cameraStatus: visionPipeline.cameraStatus,
        } satisfies PresenterMessage);
      }
    }, 1000);

    return () => clearInterval(loopInterval);
  }, []);

  // Presenter controls: apply here and tell the other window
  const applyPresenter = (patch: Partial<PresenterState>) => {
    if ('forcedState' in patch) setForcedState(patch.forcedState ?? null);
    if (patch.forcedActivity) setForcedActivity(patch.forcedActivity);
    if (typeof patch.demoMode === 'boolean') {
      setIsDemoMode(patch.demoMode);
      try {
        localStorage.setItem('ergogotchi.demoMode', String(patch.demoMode));
      } catch {}
    }
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
      else if (msg.type === 'recalibrate') handleRecalibrate();
      else if (msg.type === 'warning') showWarning();
      else if (msg.type === 'select_camera') {
        handleSelectCamera(msg.deviceId);
      } else if (msg.type === 'preview_request') {
        previewRequestedRef.current = msg.active;
        if (msg.active) {
          lastPreviewRequestedAtRef.current = Date.now();
        }
      } else if (msg.type === 'preview_frame') {
        setPreviewFrame(msg.dataUrl);
        if (msg.landmarks !== undefined) {
          setLandmarks(msg.landmarks);
        }
      } else if (msg.type === 'telemetry_sync') {
        lastTelemetrySyncAtRef.current = Date.now();
        setScoringState((prev) => ({
          ...prev,
          hp: msg.hp,
          state: msg.state,
          strainIndex: msg.strainIndex,
          worstSignal: msg.worstSignal,
        }));
        if (typeof msg.blinkRate === 'number') {
          setCurrentSignals((prev) => ({
            ...(prev || {
              forward_head: 0,
              head_drop: 0,
              head_pitch_deg: 0,
              head_yaw_deg: 0,
              lean_in: 0,
              shoulder_tilt_deg: 0,
              open_eye_score: 0.1,
            }),
            blink_rate_1m: msg.blinkRate,
          }));
        }
        setIsCalibrated(msg.isCalibrated);
        setIsPresent(msg.isPresent);
        if (msg.speechText !== undefined) setSpeechText(msg.speechText);
        if (msg.speechCue !== undefined) setSpeechCue(msg.speechCue);
        if (msg.activeCameraId !== undefined) setActiveCameraId(msg.activeCameraId);
        if (msg.cameraStatus !== undefined) setCameraStatus(msg.cameraStatus);
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

        // If this window is the primary telemetry producer, immediately sync the new window with current HP & camera
        if (!isDashboardView) {
          const currentScoring = scoringStateRef.current;
          const currentSig = currentSignalsRef.current;
          presenterChannel.postMessage({
            type: 'telemetry_sync',
            hp: currentScoring.hp,
            state: currentScoring.state,
            strainIndex: currentScoring.strainIndex,
            worstSignal: currentScoring.worstSignal || 'None',
            blinkRate: currentSig?.blink_rate_1m || 14,
            isCalibrated: visionPipeline.isCalibrated,
            isPresent: isPresentRef.current,
            speechText: speechCueRef.current ? speechText : null,
            speechCue: speechCueRef.current,
            activeCameraId: visionPipeline.activeCameraId,
            cameraStatus: visionPipeline.cameraStatus,
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
        electronAPI.setPetBounds({ width: 280, height: 320 });
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

  // Floating Update Notification Banner (when an update is found)
  const updateBanner = updateInfo?.updateAvailable && !showUpdateModal && (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 border-2 border-cyan-400 rounded-2xl px-4 py-2.5 shadow-2xl backdrop-blur-md flex items-center gap-3 animate-bounce">
      <span className="text-xl">⚡</span>
      <div className="text-left text-xs leading-tight">
        <span className="font-bold text-white">Update {updateInfo.latestVersion} Available!</span>
        <p className="text-[10px] text-slate-300">Click to download update & restart ErgoGotchi.</p>
      </div>
      <button
        type="button"
        onClick={() => handleTriggerUpdate()}
        className="px-3 py-1.5 rounded-xl text-xs font-bold bg-cyan-400 hover:bg-cyan-300 text-slate-950 transition active:scale-95 shadow"
      >
        Update & Restart
      </button>
      <button
        type="button"
        onClick={() => setUpdateInfo((prev) => (prev ? { ...prev, updateAvailable: false } : null))}
        className="text-slate-400 hover:text-slate-200 text-xs px-1"
        title="Dismiss for now"
      >
        ✕
      </button>
    </div>
  );

  // Fullscreen / Floating Update Progress Modal (when downloading/installing)
  const updateModal = showUpdateModal && (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border-2 border-cyan-400 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 text-center">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-3xl animate-bounce">
          📦
        </div>
        <div>
          <h3 className="text-lg font-bold text-white">Updating ErgoGotchi</h3>
          <p className="text-xs text-slate-300 mt-1">
            Downloading version {updateInfo?.latestVersion || 'latest'} from GitHub...
          </p>
        </div>

        <div className="space-y-1.5 pt-2">
          <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden border border-slate-700">
            <div
              className="bg-gradient-to-r from-cyan-400 to-emerald-400 h-full transition-all duration-150"
              style={{ width: `${updateProgress?.percent || 0}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-[11px] font-mono text-slate-400 px-1">
            <span>
              {updateProgress && updateProgress.totalBytes > 0
                ? `${(updateProgress.receivedBytes / (1024 * 1024)).toFixed(1)} MB / ${(updateProgress.totalBytes / (1024 * 1024)).toFixed(1)} MB`
                : 'Connecting to GitHub...'}
            </span>
            <span className="text-cyan-300 font-bold">{updateProgress?.percent || 0}%</span>
          </div>
        </div>

        <p className="text-[11px] text-slate-400 italic">
          {updateProgress && updateProgress.percent >= 100
            ? '✓ Download complete! Launching installer and restarting...'
            : 'Please wait while the update downloads. ErgoGotchi will restart automatically.'}
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
        {isCalibrating && (
          <div className="mb-2 px-3 py-2 rounded-xl bg-white border-2 border-black text-center shadow-[3px_3px_0_0_#000]">
            <p className="text-[11px] font-black text-black">Sit tall… calibrating</p>
            <div className="w-36 bg-neutral-200 border border-black rounded-full h-2 mt-1.5 overflow-hidden">
              <div
                className="bg-yellow-400 h-full transition-all duration-200"
                style={{ width: `${calibrationProgress}%` }}
              />
            </div>
          </div>
        )}
        {updateBanner}
        {updateModal}
        <MascotSprite
          state={activeState}
          hp={scoringState.hp}
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
        {updateBanner}
        {updateModal}
        <Dashboard
          hp={scoringState.hp}
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
          previewFrame={previewFrame}
          landmarks={landmarks}
          cameraStatus={cameraStatus}
          onPreviewRequest={handlePreviewRequest}
          onRefreshCameras={refreshCameras}
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
          <button onClick={() => setShowWizard(true)} className={BUTTON_NEUTRAL}>
            Setup wizard 🪄
          </button>
          <button onClick={() => setShowDashboard(true)} className={BUTTON_PRIMARY}>
            Open dashboard
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center relative z-10 w-full p-4">
        {updateBanner}
        {updateModal}
        {wizardOverlay}
          <div className="relative w-full max-w-4xl h-96 rounded-3xl bg-slate-900/40 border border-slate-800/80 shadow-2xl flex flex-col justify-between p-6 backdrop-blur-sm overflow-hidden">
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
                hp={scoringState.hp}
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
