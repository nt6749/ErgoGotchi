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
} from './scoring/scoring';
import { visionPipeline } from './vision/visionPipeline';
import { wsClient } from './net/websocketClient';
import { MascotSprite } from './pet/MascotSprite';
import { Dashboard } from './dashboard/Dashboard';

export const App: React.FC = () => {
  // Application view state
  const [showDashboard, setShowDashboard] = useState(false);
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

  // Speech bubble state
  const [speechText, setSpeechText] = useState<string | null>(null);
  const [speechCue, setSpeechCue] = useState<StretchCue | null>(null);

  const scoringStateRef = useRef<ScoringState>(scoringState);
  scoringStateRef.current = scoringState;

  const forcedStateRef = useRef<PetState | null>(forcedState);
  forcedStateRef.current = forcedState;

  const isDemoModeRef = useRef<boolean>(isDemoMode);
  isDemoModeRef.current = isDemoMode;

  const sessionStartTimeRef = useRef<number>(Date.now());

  // 1. Initialise Vision Pipeline & WebSocket Client
  useEffect(() => {
    wsClient.onConnectionChange = (connected) => setIsConnected(connected);
    wsClient.onInterventionReceived = (msg) => {
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
      // Auto-start 5s calibration
      setIsCalibrating(true);
      visionPipeline.startCalibration();
    };

    initVision();

    return () => {
      visionPipeline.stopCamera();
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
  }, [currentSignals, isPresent]);

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

  const activeState = forcedState || scoringState.state;

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
                onDismissSpeech={() => setSpeechText(null)}
                onOpenDashboard={() => setShowDashboard(true)}
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
