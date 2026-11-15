/**
 * Beginner-Friendly Setup & Permission Wizard for ErgoGotchi.
 * Provides a clean, cute onboarding flow for first-time users:
 * 1. Meet your pixel duck pet ("Welcome your new pet")
 * 2. Camera permission check, camera selector, and audio test
 * 3. 5-Second upright posture calibration
 * 4. Desktop companion quick-start guide
 */

import React, { useState, useEffect, useRef } from 'react';
import { renderPixelMascot } from './PixelMascot';
import { soundEffects } from './soundEffects';
import { visionPipeline, CAMERA_PREF_KEY, type CameraOption } from '../dev1_sensing_and_scoring/visionPipeline';
import {
  probeBackendStatus,
  testIntegration,
  saveIntegrationConfig,
  type BackendConfigStatus,
} from '../net/configClient';

interface OnboardingWizardProps {
  onComplete: () => void;
  onRecalibrateRequested?: () => void;
}

export const ONBOARDING_STORAGE_KEY = 'ergogotchi_onboarding_completed_v1';

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({
  onComplete,
  onRecalibrateRequested,
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  // Camera check state
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [availableCameras, setAvailableCameras] = useState<CameraOption[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [cameraTesting, setCameraTesting] = useState(false);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);

  // Audio test state
  const [audioTested, setAudioTested] = useState(false);

  // Calibration countdown state
  const [calibrating, setCalibrating] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [calibrationDone, setCalibrationDone] = useState(false);

  // AI & Webhook Configuration state (Step 4)
  const [configStatus, setConfigStatus] = useState<BackendConfigStatus | null>(null);
  const [geminiApiKey, setGeminiApiKey] = useState<string>(() => {
    try {
      return localStorage.getItem('ergogotchi.geminiApiKey') || '';
    } catch {
      return '';
    }
  });
  const [webhookUrl, setWebhookUrl] = useState<string>(() => {
    try {
      return localStorage.getItem('ergogotchi.webhookUrl') || '';
    } catch {
      return '';
    }
  });
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [testingGemini, setTestingGemini] = useState(false);
  const [geminiTestResult, setGeminiTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [webhookTestResult, setWebhookTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  // Auto-detect backend status on mount and when entering step 4
  useEffect(() => {
    let active = true;
    probeBackendStatus()
      .then((status) => {
        if (active) setConfigStatus(status);
      })
      .catch(() => {
        if (active) setConfigStatus({ online: false, gemini_configured: false, webhook_configured: false });
      });
    return () => {
      active = false;
    };
  }, [step]);

  // Stop video preview element on unmount without closing the shared pipeline stream
  useEffect(() => {
    return () => {
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = null;
      }
    };
  }, []);

  // Hook directly into Paul's visionPipeline camera engine on mount and step change
  useEffect(() => {
    let mounted = true;

    const syncCameraFromPipeline = async () => {
      setCameraTesting(true);
      setCameraError(null);

      try {
        let stream = visionPipeline.getVideoStream();
        if (!stream) {
          await visionPipeline.startCamera();
          stream = visionPipeline.getVideoStream();
        }

        const list = await visionPipeline.listCameras();
        if (!mounted) return;

        setAvailableCameras(list);
        const activeId = visionPipeline.activeCameraId || (list[0]?.deviceId ?? '');
        setSelectedCameraId(activeId);

        if (stream && videoPreviewRef.current) {
          videoPreviewRef.current.srcObject = stream;
          videoPreviewRef.current.play().catch(() => {});
          setHasCameraPermission(true);
        } else if (list.length > 0) {
          setHasCameraPermission(true);
        }
      } catch (err: any) {
        if (!mounted) return;
        console.warn('[Onboarding] Error syncing camera:', err);
        setHasCameraPermission(false);
        setCameraError(err?.message || 'Could not connect to camera.');
      } finally {
        if (mounted) setCameraTesting(false);
      }
    };

    if (step === 2) {
      syncCameraFromPipeline();
    }

    return () => {
      mounted = false;
    };
  }, [step]);

  // Request or re-activate camera using visionPipeline
  const requestCameraAccess = async () => {
    setCameraTesting(true);
    setCameraError(null);

    try {
      const ok = await visionPipeline.startCamera();
      const list = await visionPipeline.listCameras();
      setAvailableCameras(list);
      setSelectedCameraId(visionPipeline.activeCameraId || (list[0]?.deviceId ?? ''));

      const stream = visionPipeline.getVideoStream();
      if (videoPreviewRef.current && stream) {
        videoPreviewRef.current.srcObject = stream;
        videoPreviewRef.current.play().catch(() => {});
      }

      if (ok && stream) {
        setHasCameraPermission(true);
        soundEffects.playPet();
      } else {
        setHasCameraPermission(false);
        setCameraError('Camera did not return a video stream. Please check camera privacy settings.');
      }
    } catch (err: any) {
      setHasCameraPermission(false);
      setCameraError(err?.message || 'Could not access camera.');
    } finally {
      setCameraTesting(false);
    }
  };

  // Switch camera using Paul's exact switchCamera() function in visionPipeline
  const handleCameraChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value;
    if (!newId || newId === selectedCameraId) return;

    setSelectedCameraId(newId);
    setCameraTesting(true);
    setCameraError(null);

    try {
      const switched = await visionPipeline.switchCamera(newId);
      const stream = visionPipeline.getVideoStream();

      if (videoPreviewRef.current && stream) {
        videoPreviewRef.current.srcObject = stream;
        videoPreviewRef.current.play().catch(() => {});
      }

      if (switched) {
        setHasCameraPermission(true);
        soundEffects.playPet();
      } else {
        setCameraError('Could not switch to that camera. Is another application using it?');
      }
    } catch (err: any) {
      setCameraError(err?.message || 'Failed to switch camera device.');
    } finally {
      setCameraTesting(false);
    }
  };

  const handleTestAudio = () => {
    soundEffects.playRevive();
    setAudioTested(true);
  };

  const startCalibrationStep = () => {
    setCalibrating(true);
    setCountdown(5);
    setCalibrationDone(false);

    if (onRecalibrateRequested) {
      onRecalibrateRequested();
    }

    let remaining = 5;
    const interval = setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        setCalibrating(false);
        setCalibrationDone(true);
        soundEffects.playRevive();
      }
    }, 1000);
  };

  const handleTestGemini = async () => {
    setTestingGemini(true);
    setGeminiTestResult(null);
    try {
      const res = await testIntegration('gemini', geminiApiKey);
      setGeminiTestResult(res);
      if (res.ok) {
        soundEffects.playPet();
      }
    } catch (err: any) {
      setGeminiTestResult({ ok: false, message: err?.message || 'Connection test failed.' });
    } finally {
      setTestingGemini(false);
    }
  };

  const handleTestWebhook = async () => {
    setTestingWebhook(true);
    setWebhookTestResult(null);
    try {
      const res = await testIntegration('webhook', webhookUrl);
      setWebhookTestResult(res);
      if (res.ok) {
        soundEffects.playPet();
      }
    } catch (err: any) {
      setWebhookTestResult({ ok: false, message: err?.message || 'Webhook ping failed.' });
    } finally {
      setTestingWebhook(false);
    }
  };

  const handleSaveAndContinue = async () => {
    setIsSavingConfig(true);
    try {
      if (geminiApiKey.trim() || webhookUrl.trim()) {
        await saveIntegrationConfig(geminiApiKey, webhookUrl);
      }
    } catch (err) {
      console.warn('[Onboarding] Error saving integration config:', err);
    } finally {
      setIsSavingConfig(false);
      setStep(5);
    }
  };

  const finishOnboarding = () => {
    try {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
    } catch {}

    // Detach preview element so the shared vision pipeline stream continues smoothly
    if (videoPreviewRef.current) {
      videoPreviewRef.current.srcObject = null;
    }

    onComplete();
  };

  return (
    <div 
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
      className="w-[450px] max-w-full mx-auto bg-slate-900/95 text-white border-2 border-emerald-400/80 rounded-3xl shadow-2xl p-6 backdrop-blur-xl flex flex-col justify-between select-none relative z-50"
    >
      {/* Top Header / Draggable App Titlebar */}
      <div 
        className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4 select-none cursor-move"
        style={{ WebkitAppRegion: 'drag' } as any}
        title="Click and drag to move window"
      >
        <div className="flex items-center gap-2 pointer-events-none">
          <span className="w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
            ErgoGotchi Setup Wizard
          </span>
        </div>
        <div className="flex items-center gap-2 pointer-events-none">
          <span className="text-[10px] text-slate-500 font-mono">⋮⋮ Drag</span>
          <span className="text-xs font-mono text-slate-400">Step {step} of 5</span>
        </div>
      </div>

      {/* STEP 1: WELCOME SCREEN */}
      {step === 1 && (
        <div className="flex flex-col items-center text-center space-y-4 py-2">
          <div className="bg-emerald-500/10 border border-emerald-400/30 px-3 py-1 rounded-full text-xs font-semibold text-emerald-300">
            Welcome your new pet!
          </div>

          {/* Paul's Pixel Duck Mascot */}
          <div className="py-2 scale-110 transform transition-transform hover:scale-125 cursor-pointer" onClick={() => soundEffects.playPet()}>
            {renderPixelMascot('THRIVING', 100, null)}
          </div>

          <h1 className="text-xl font-extrabold text-white tracking-tight">
            Meet Your Desktop Posture Duck
          </h1>

          <p className="text-xs text-slate-300 leading-relaxed px-2">
            Your friendly companion lives right along the bottom of your screen. When your posture is upright, it's cheerful and thriving. When you slouch or stop blinking, it gently reminds you to stretch!
          </p>

          {/* Privacy & File Storage Callout */}
          <div className="w-full bg-slate-800/80 border border-slate-700/80 rounded-2xl p-3 text-left space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
              <span className="text-sm">🔒</span> 100% Private & Stored On-Device
            </div>
            <p className="text-[11px] text-slate-400 leading-normal">
              All MediaPipe biometric calculations run locally in memory. Zero camera video or personal frames are ever saved, uploaded, or transmitted across the internet.
            </p>
          </div>

          <button
            onClick={() => setStep(2)}
            className="w-full py-2.5 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
          >
            Let's Get Started &rarr;
          </button>
        </div>
      )}

      {/* STEP 2: CAMERA PERMISSIONS & AUDIO TEST */}
      {step === 2 && (
        <div className="flex flex-col items-center space-y-3.5 py-1 text-center">
          <h2 className="text-base font-bold text-white">Camera & Permissions</h2>
          <p className="text-xs text-slate-300">
            ErgoGotchi uses your front webcam to measure subtle shoulder and head posture changes relative to your baseline.
          </p>

          {/* Live Camera Preview Box */}
          <div className="w-full h-36 bg-slate-950 rounded-2xl border-2 border-slate-700 overflow-hidden relative flex items-center justify-center shadow-inner">
            <video
              ref={videoPreviewRef}
              playsInline
              muted
              className={`w-full h-full object-cover ${hasCameraPermission ? 'block' : 'hidden'}`}
            />

            {!hasCameraPermission && !cameraTesting && (
              <div className="flex flex-col items-center p-3 text-slate-400 space-y-1">
                <span className="text-2xl">📷</span>
                <span className="text-xs font-medium">Camera not yet connected</span>
              </div>
            )}

            {cameraTesting && (
              <div className="flex items-center gap-2 text-xs text-cyan-300 font-medium">
                <span className="w-4 h-4 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
                Connecting to webcam...
              </div>
            )}

            {hasCameraPermission && (
              <div className="absolute top-2 right-2 bg-emerald-500/90 text-slate-950 text-[10px] font-bold px-2 py-0.5 rounded-full shadow">
                ✓ Live Feed Ready
              </div>
            )}
          </div>

          {/* Camera Source Selector (Powered by visionPipeline) */}
          <div className="w-full text-left space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-slate-400">Camera Device:</label>
              <button
                type="button"
                onClick={() => requestCameraAccess()}
                className="text-[10px] text-emerald-400 hover:text-emerald-300 font-semibold"
              >
                🔄 Refresh Cameras
              </button>
            </div>
            {availableCameras.length > 0 ? (
              <select
                value={selectedCameraId}
                onChange={handleCameraChange}
                className="w-full text-xs bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-2 text-slate-200 focus:outline-none focus:border-emerald-400 shadow-inner"
              >
                {availableCameras.map((cam) => (
                  <option key={cam.deviceId} value={cam.deviceId}>
                    📷 {cam.label}
                  </option>
                ))}
              </select>
            ) : (
              <button
                type="button"
                onClick={() => requestCameraAccess()}
                className="w-full py-2 px-3 rounded-xl font-semibold text-xs bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition active:scale-95 flex items-center justify-center gap-1.5"
              >
                <span>Enable Webcam Access</span>
              </button>
            )}
          </div>

          {cameraError && (
            <p className="text-[11px] text-rose-400 bg-rose-950/40 border border-rose-800/60 p-2 rounded-xl text-left">
              {cameraError}
            </p>
          )}

          {/* Audio Chime Test */}
          <div className="w-full flex items-center justify-between bg-slate-800/60 border border-slate-700/60 p-2.5 rounded-xl">
            <div className="text-left">
              <div className="text-xs font-semibold text-slate-200">8-Bit Sound Synthesizer</div>
              <div className="text-[10px] text-slate-400">Retro procedural sound effects</div>
            </div>
            <button
              onClick={handleTestAudio}
              className="text-xs px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 transition font-medium"
            >
              {audioTested ? '✓ Played!' : 'Test Sound 🔊'}
            </button>
          </div>

          <div className="flex gap-2 w-full pt-1">
            <button
              onClick={() => setStep(1)}
              className="w-1/3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300"
            >
              &larr; Back
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!hasCameraPermission}
              className={`w-2/3 py-2 rounded-xl text-xs font-bold shadow-md transition ${
                hasCameraPermission
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 active:scale-95'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              Next: Calibration &rarr;
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: POSTURE CALIBRATION */}
      {step === 3 && (
        <div className="flex flex-col items-center space-y-4 py-2 text-center">
          <div className="bg-cyan-500/10 border border-cyan-400/30 px-3 py-1 rounded-full text-xs font-semibold text-cyan-300">
            5-Second Upright Calibration
          </div>

          <div className="py-2">
            {renderPixelMascot(calibrating ? 'CALIBRATING' : 'NEUTRAL', 90, null)}
          </div>

          <h3 className="text-base font-bold text-white">Lock In Your Upright Baseline</h3>
          <p className="text-xs text-slate-300 leading-relaxed px-1">
            Sit comfortably tall, look at your monitor naturally, and press the button below. ErgoGotchi will record 5 seconds of calm posture as your personal zero-point.
          </p>

          {calibrating && (
            <div className="w-full flex flex-col items-center space-y-2 py-2">
              <div className="w-16 h-16 rounded-full border-4 border-cyan-400 border-t-transparent animate-spin flex items-center justify-center">
                <span className="text-xl font-bold font-mono text-cyan-300">{countdown}s</span>
              </div>
              <p className="text-[11px] text-cyan-300 font-medium animate-pulse">
                Hold your posture tall...
              </p>
            </div>
          )}

          {!calibrating && !calibrationDone && (
            <button
              onClick={startCalibrationStep}
              className="w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-500/20 active:scale-95 transition"
            >
              Start 5-Second Calibration 🎯
            </button>
          )}

          {calibrationDone && (
            <div className="w-full bg-emerald-950/40 border border-emerald-500/40 p-2.5 rounded-xl text-center">
              <span className="text-xs font-bold text-emerald-300">
                ✓ Upright Baseline Locked!
              </span>
            </div>
          )}

          <div className="flex gap-2 w-full pt-2">
            <button
              onClick={() => setStep(2)}
              className="w-1/3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300"
            >
              &larr; Back
            </button>
            <button
              onClick={() => setStep(4)}
              disabled={!calibrationDone}
              className={`w-2/3 py-2 rounded-xl text-xs font-bold transition ${
                calibrationDone
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 active:scale-95'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              Next: AI & Notifications &rarr;
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: AI & WEBHOOK NOTIFICATIONS */}
      {step === 4 && (
        <div className="flex flex-col space-y-3 py-1 text-center">
          {/* Status badge: Backend Online vs Offline Edge Mode */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${configStatus?.online ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span className="text-[11px] font-medium text-slate-300">
                {configStatus?.online
                  ? `Backend Engine Online (${configStatus.storage || 'timescaledb'})`
                  : 'Edge Companion Mode (FastAPI optional)'}
              </span>
            </div>
            {configStatus?.online && (
              <span className="text-[10px] text-emerald-400 font-mono bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                Connected
              </span>
            )}
          </div>

          <div>
            <h3 className="text-base font-bold text-white">AI Persona & Notifications</h3>
            <p className="text-[11px] text-slate-300 mt-0.5 leading-snug">
              Optional cloud superpowers: dynamic Gemini speech lines & instant posture stretch alerts to Discord, Slack, or ntfy.sh.
            </p>
          </div>

          {/* Integration 1: Gemini 3.8 Flash API Key */}
          <div className="w-full bg-slate-800/70 border border-slate-700/80 rounded-2xl p-3 text-left space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-sm">✨</span>
                <span className="text-xs font-semibold text-slate-200">Gemini 3.8 Flash API Key</span>
              </div>
              <div className="flex items-center gap-1.5">
                {configStatus?.gemini_configured && (
                  <span className="text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded-full font-medium">
                    ✓ Active: {configStatus.gemini_model || 'gemini-3.8-flash'}
                  </span>
                )}
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-cyan-400 hover:text-cyan-300 hover:underline"
                >
                  Get free key ↗
                </a>
              </div>
            </div>

            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <input
                  type={showGeminiKey ? 'text' : 'password'}
                  value={geminiApiKey}
                  onChange={(e) => {
                    setGeminiApiKey(e.target.value);
                    setGeminiTestResult(null);
                  }}
                  placeholder={
                    configStatus?.gemini_configured
                      ? 'Loaded from .env (paste to override)'
                      : 'AIzaSy...'
                  }
                  className="w-full text-xs font-mono bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 pr-8 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                />
                <button
                  type="button"
                  onClick={() => setShowGeminiKey(!showGeminiKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 text-xs"
                  title={showGeminiKey ? 'Hide key' : 'Show key'}
                >
                  {showGeminiKey ? '🙈' : '👁️'}
                </button>
              </div>

              <button
                type="button"
                onClick={handleTestGemini}
                disabled={testingGemini || (!geminiApiKey.trim() && !configStatus?.gemini_configured)}
                className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-slate-200 transition shrink-0 flex items-center gap-1"
              >
                {testingGemini ? (
                  <>
                    <span className="w-3 h-3 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
                    <span>Testing...</span>
                  </>
                ) : (
                  <span>Test Key</span>
                )}
              </button>
            </div>

            {geminiTestResult && (
              <p className={`text-[10px] leading-tight ${geminiTestResult.ok ? 'text-emerald-300' : 'text-rose-400'}`}>
                {geminiTestResult.ok ? '✓ ' : '✕ '}
                {geminiTestResult.message}
              </p>
            )}
          </div>

          {/* Integration 2: Webhook Notifications */}
          <div className="w-full bg-slate-800/70 border border-slate-700/80 rounded-2xl p-3 text-left space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-sm">🔔</span>
                <span className="text-xs font-semibold text-slate-200">Posture Stretch Webhook</span>
              </div>
              {configStatus?.webhook_configured && (
                <span className="text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded-full font-medium font-mono">
                  ✓ {configStatus.webhook_preview}
                </span>
              )}
            </div>

            <div className="flex gap-1.5">
              <input
                type="text"
                value={webhookUrl}
                onChange={(e) => {
                  setWebhookUrl(e.target.value);
                  setWebhookTestResult(null);
                }}
                placeholder={
                  configStatus?.webhook_configured
                    ? 'Loaded from .env (paste to override)'
                    : 'https://discord.com/api/webhooks/...'
                }
                className="flex-1 text-xs font-mono bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
              />

              <button
                type="button"
                onClick={handleTestWebhook}
                disabled={testingWebhook || (!webhookUrl.trim() && !configStatus?.webhook_configured)}
                className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-slate-200 transition shrink-0 flex items-center gap-1"
              >
                {testingWebhook ? (
                  <>
                    <span className="w-3 h-3 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
                    <span>Sending...</span>
                  </>
                ) : (
                  <span>Send Ping</span>
                )}
              </button>
            </div>

            {webhookTestResult && (
              <p className={`text-[10px] leading-tight ${webhookTestResult.ok ? 'text-emerald-300' : 'text-rose-400'}`}>
                {webhookTestResult.ok ? '✓ ' : '✕ '}
                {webhookTestResult.message}
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              onClick={() => setStep(3)}
              className="w-1/4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            >
              &larr; Back
            </button>

            <button
              onClick={() => setStep(5)}
              className="w-1/3 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 transition"
            >
              Skip for Now
            </button>

            <button
              onClick={handleSaveAndContinue}
              disabled={isSavingConfig}
              className="flex-1 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-md shadow-emerald-500/20 transition active:scale-95 flex items-center justify-center gap-1.5"
            >
              {isSavingConfig ? (
                <>
                  <span className="w-3 h-3 rounded-full border-2 border-slate-950 border-t-transparent animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save & Continue &rarr;</span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* STEP 5: HOW TO PLAY & FINISH */}
      {step === 5 && (
        <div className="flex flex-col items-center space-y-3.5 py-1 text-center">
          <div className="scale-105">
            {renderPixelMascot('THRIVING', 100, null)}
          </div>

          <h3 className="text-base font-bold text-white">You're All Set!</h3>
          <p className="text-xs text-slate-300">
            Here are three handy tips for enjoying your new desk companion:
          </p>

          <div className="w-full space-y-2 text-left">
            <div className="flex items-start gap-2.5 p-2 bg-slate-800/60 rounded-xl border border-slate-700/50">
              <span className="text-base">🖱️</span>
              <div>
                <div className="text-xs font-bold text-slate-200">Pet Your Duck</div>
                <div className="text-[11px] text-slate-400">Click directly on the duck to pet it (floating hearts and harp chime!).</div>
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-2 bg-slate-800/60 rounded-xl border border-slate-700/50">
              <span className="text-base">🛡️</span>
              <div>
                <div className="text-xs font-bold text-slate-200">Click-Through Desktop</div>
                <div className="text-[11px] text-slate-400">Clicks pass straight through the transparent window to your code and browser.</div>
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-2 bg-slate-800/60 rounded-xl border border-slate-700/50">
              <span className="text-base">⚙️</span>
              <div>
                <div className="text-xs font-bold text-slate-200">Right-Click Menu</div>
                <div className="text-[11px] text-slate-400">Right-click the pet anytime to switch cameras, recalibrate, or open the dashboard.</div>
              </div>
            </div>
          </div>

          <div className="flex gap-2 w-full pt-1">
            <button
              onClick={() => setStep(4)}
              className="w-1/3 py-2.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            >
              &larr; Back
            </button>
            <button
              onClick={finishOnboarding}
              className="w-2/3 py-2.5 rounded-xl font-extrabold text-xs bg-gradient-to-r from-emerald-400 to-teal-400 hover:from-emerald-300 hover:to-teal-300 text-slate-950 shadow-xl shadow-emerald-500/25 transition active:scale-95"
            >
              Launch Desktop Pet ✨
            </button>
          </div>
        </div>
      )}

      {/* Progress Dots */}
      <div className="flex justify-center items-center gap-1.5 pt-3 border-t border-slate-800/80">
        {[1, 2, 3, 4, 5].map((s) => (
          <span
            key={s}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              s === step
                ? 'w-6 bg-emerald-400'
                : s < step
                ? 'w-1.5 bg-emerald-500/50'
                : 'w-1.5 bg-slate-700'
            }`}
          />
        ))}
      </div>
    </div>
  );
};
