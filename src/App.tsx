/**
 * Main Application Component for ErgoGotchi.
 * Orchestrates edge vision, scoring engine, WebSocket streaming, and UI views.
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  BiometricSignals, 
  PetState, 
  ScoringParams, 
  ScoringState, 
  StretchCue 
} from './types';
import { 
  createInitialState, 
  DEMO_PARAMS, 
  NORMAL_PARAMS, 
  step 
} from './dev1_sensing_and_scoring/scoring';
import { visionPipeline, CAMERA_PREF_KEY, type CameraOption } from './dev1_sensing_and_scoring/visionPipeline';
import { wsClient } from './net/websocketClient';
import { MascotSprite } from './dev2_mascot_and_ui/MascotSprite';
import type { PetEmote } from './dev2_mascot_and_ui/PixelMascot';

/** Posture warnings clear after this many consecutive seconds of good posture. */
const CLEAR_WARNING_AFTER_GOOD_SECONDS = 2;
/** Strain below this counts as "sitting up" (same line where HP stops draining). */
const GOOD_POSTURE_STRAIN = 0.5;
const POSTURE_CUES: StretchCue[] = ['CHIN_TUCK', 'SHOULDER_ROLL', 'SIT_BACK'];

/** How long the "don't duck with me" knife warning stays up (matches the speech bubble). */
const KNIFE_EMOTE_MS = 8000;
import { Dashboard } from './dev2_mascot_and_ui/Dashboard';

interface ElectronAPI {
  isElectron: boolean;
  openDashboard: () => void;
  onRecalibrate: (cb: () => void) => void;
  onForceState: (cb: (state: PetState) => void) => void;
  onToggleDemoMode: (cb: () => void) => void;
  setCameraList: (cameras: CameraOption[], activeId: string | null) => void;
  onSelectCamera: (cb: (deviceId: string) => void) => void;
}

const electronAPI: ElectronAPI | undefined = (window as any).electronAPI;
const isDashboardView = new URLSearchParams(window.location.search).get('view') === 'dashboard';
// Electron's transparent pet window: render only the mascot, no browser demo chrome
const isPetWindow = !!electronAPI?.isElectron && !isDashboardView;

// React StrictMode runs effects twice in dev; the camera must only be opened once
let visionStarted = false;
let cameraSwitchInFlight = false;

export const App: React.FC = () => {
  // Application view state
  const [showDashboard, setShowDashboard] = useState(isDashboardView);
  const [isDemoMode, setIsDemoMode] = useState(true); // Default to Demo mode for sunhacks judging!
  const [forcedState, setForcedState] = useState<PetState | null>(null);

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
      initVision();
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
      const params: ScoringParams = isDemoModeRef.current ? DEMO_PARAMS : NORMAL_PARAMS;
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
        if (forcedStateRef.current === 'SLOUCHING') next.hp = 45;
        if (forcedStateRef.current === 'WILTED') next.hp = 15;
      }

      setScoringState(next);

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

  // 3. Hotkeys handler for live judge walkthrough
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Hotkey 1: Force Thriving
      if (e.key === '1') {
        setForcedState('THRIVING');
      } else if (e.key === '2') {
        // Hotkey 2: Force Slouching
        setForcedState('SLOUCHING');
      } else if (e.key === '3') {
        // Hotkey 3: Force Wilted
        setForcedState('WILTED');
      } else if (e.key === '4') {
        // Hotkey 4: Release override
        setForcedState(null);
      } else if (e.key === '5') {
        // Hotkey 5: preview the "don't duck with me" knife warning
        showEmote('KNIFE', KNIFE_EMOTE_MS);
      } else if (e.key === 'd' || e.key === 'D') {
        // Toggle Demo Mode
        setIsDemoMode((prev) => !prev);
      } else if (e.key === 'c' || e.key === 'C') {
        // Recalibrate
        handleRecalibrate();
      }
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
    electronAPI.onForceState((s) => setForcedState(s));
    electronAPI.onToggleDemoMode(() => setIsDemoMode((prev) => !prev));
  }, []);

  const handleOpenDashboard = () => {
    if (electronAPI) electronAPI.openDashboard();
    else setShowDashboard(true);
  };

  const activeState = forcedState || scoringState.state;

  if (isPetWindow) {
    return (
      <div className="w-screen h-screen bg-transparent flex flex-col items-center justify-end overflow-hidden select-none pb-1">
        {isCalibrating && (
          <div className="mb-2 px-3 py-2 rounded-xl bg-slate-900/90 border border-cyan-400/60 text-center shadow-xl">
            <p className="text-[11px] font-semibold text-white">Sit tall… calibrating</p>
            <div className="w-36 bg-slate-800 rounded-full h-1.5 mt-1.5 overflow-hidden">
              <div
                className="bg-cyan-400 h-full transition-all duration-200"
                style={{ width: `${calibrationProgress}%` }}
              />
            </div>
          </div>
        )}
        <MascotSprite
          state={activeState}
          hp={scoringState.hp}
          isReviving={scoringState.isReviving}
          speechText={speechText}
          speechCue={speechCue}
          emote={emote}
          onDismissSpeech={() => setSpeechText(null)}
          onOpenDashboard={handleOpenDashboard}
          onRecalibrate={handleRecalibrate}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950/90 text-white flex flex-col justify-between p-4 font-sans select-none relative overflow-hidden">
      {/* Top Floating App Bar */}
      <header className="flex items-center justify-between z-40 bg-slate-900/80 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-slate-800 shadow-xl">
        <div className="flex items-center gap-3">
          <span className="text-xl">👾</span>
          <div>
            <h1 className="text-xs font-black tracking-wider uppercase text-emerald-400">ErgoGotchi</h1>
            <p className="text-[10px] text-slate-400 font-mono">sunhacks 2026 Edition</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Connection status badge */}
          <span className="flex items-center gap-1.5 text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700">
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-emerald-400 shadow-emerald-400/50 shadow' : 'bg-amber-400'
              }`}
            />
            {isConnected ? 'LIVE WS' : 'LOCAL CACHE'}
          </span>

          {/* Camera picker */}
          <select
            value={activeCameraId ?? ''}
            onChange={(e) => handleSelectCamera(e.target.value)}
            title="Camera used for posture tracking"
            className="text-[11px] max-w-[180px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-200 border border-slate-700"
          >
            {!activeCameraId && <option value="">📷 No camera</option>}
            {cameras.map((cam) => (
              <option key={cam.deviceId} value={cam.deviceId}>
                📷 {cam.label}
              </option>
            ))}
          </select>

          {/* Demo mode pill */}
          <button
            onClick={() => setIsDemoMode((prev) => !prev)}
            className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border transition-all ${
              isDemoMode
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            {isDemoMode ? '⚡ DEMO (1.5s)' : 'NORMAL'}
          </button>

          {/* Toggle Dashboard Button */}
          <button
            onClick={() => setShowDashboard((prev) => !prev)}
            className="text-xs font-semibold px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 shadow"
          >
            {showDashboard ? 'Hide Dashboard' : 'Open Dashboard'}
          </button>
        </div>
      </header>

      {/* Main View Area: Either Companion Dashboard or Desktop Simulation */}
      <main className="flex-1 flex flex-col items-center justify-center relative z-10 w-full my-auto">
        {showDashboard ? (
          <Dashboard
            hp={scoringState.hp}
            state={activeState}
            strainIndex={scoringState.strainIndex}
            blinkRate={currentSignals?.blink_rate_1m || 14}
            worstSignal={scoringState.worstSignal || 'None'}
            isDemoMode={isDemoMode}
            onToggleDemoMode={() => setIsDemoMode((prev) => !prev)}
            onForceState={(s) => setForcedState(s)}
            onRecalibrate={handleRecalibrate}
            sessionId={wsClient.getSessionId()}
          />
        ) : (
          /* Simulated Transparent Desktop Canvas / Code Workspace */
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
                onDismissSpeech={() => setSpeechText(null)}
                onOpenDashboard={handleOpenDashboard}
                onRecalibrate={handleRecalibrate}
              />
            </div>
          </div>
        )}
      </main>

      {/* Bottom Hint Footer */}
      <footer className="text-center text-[11px] text-slate-500 py-2 select-none z-30">
        Press <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">1</kbd> Thriving |{' '}
        <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">2</kbd> Slouching |{' '}
        <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">3</kbd> Wilted |{' '}
        <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">4</kbd> Auto |{' '}
        <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">D</kbd> Toggle Demo Mode |{' '}
        <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">C</kbd> Calibrate
      </footer>
    </div>
  );
};
