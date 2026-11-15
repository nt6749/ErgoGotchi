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

interface OnboardingWizardProps {
  onComplete: () => void;
  onRecalibrateRequested?: () => void;
}

export const ONBOARDING_STORAGE_KEY = 'ergogotchi_onboarding_completed_v1';

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({
  onComplete,
  onRecalibrateRequested,
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Camera check state
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [availableCameras, setAvailableCameras] = useState<CameraOption[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [cameraTesting, setCameraTesting] = useState(false);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Audio test state
  const [audioTested, setAudioTested] = useState(false);

  // Calibration countdown state
  const [calibrating, setCalibrating] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [calibrationDone, setCalibrationDone] = useState(false);

  // Stop video preview stream on unmount
  useEffect(() => {
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Request camera and enumerate devices
  const requestCameraAccess = async (deviceId?: string) => {
    setCameraTesting(true);
    setCameraError(null);

    // Stop existing test stream if any
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: deviceId
          ? { deviceId: { exact: deviceId }, width: { ideal: 640 }, height: { ideal: 480 } }
          : { width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStreamRef.current = stream;

      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
        videoPreviewRef.current.play().catch(() => {});
      }

      setHasCameraPermission(true);

      // Enumerate cameras
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices
        .filter((d) => d.kind === 'videoinput')
        .map((d, idx) => ({
          deviceId: d.deviceId,
          label: d.label || `Camera ${idx + 1}`,
        }));

      setAvailableCameras(videoInputs);

      // Determine active device id
      const track = stream.getVideoTracks()[0];
      const settings = track?.getSettings();
      const activeId = settings?.deviceId || videoInputs[0]?.deviceId || '';
      setSelectedCameraId(activeId);
      try {
        localStorage.setItem(CAMERA_PREF_KEY, activeId);
      } catch {}

      soundEffects.playPet();
    } catch (err: any) {
      console.warn('[Onboarding] Camera error:', err);
      setHasCameraPermission(false);
      setCameraError(err.message || 'Could not access camera. Please check your system privacy settings.');
    } finally {
      setCameraTesting(false);
    }
  };

  const handleCameraChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value;
    setSelectedCameraId(newId);
    try {
      localStorage.setItem(CAMERA_PREF_KEY, newId);
    } catch {}
    await requestCameraAccess(newId);
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

  const finishOnboarding = () => {
    try {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
    } catch {}

    // Clean up preview stream so the vision pipeline can claim the webcam exclusively
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    onComplete();
  };

  return (
    <div className="w-[450px] max-w-full mx-auto bg-slate-900/95 text-white border-2 border-emerald-400/80 rounded-3xl shadow-2xl p-6 backdrop-blur-xl flex flex-col justify-between select-none relative z-50">
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
          <span className="text-xs font-mono text-slate-400">Step {step} of 4</span>
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

          {/* Camera Access Button or Dropdown */}
          {!hasCameraPermission ? (
            <button
              onClick={() => requestCameraAccess()}
              className="w-full py-2 px-3 rounded-xl font-semibold text-xs bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition active:scale-95 flex items-center justify-center gap-1.5"
            >
              <span>Enable Webcam Access</span>
            </button>
          ) : (
            availableCameras.length > 1 && (
              <div className="w-full text-left">
                <label className="text-[11px] font-medium text-slate-400 mb-1 block">Choose Camera Device:</label>
                <select
                  value={selectedCameraId}
                  onChange={handleCameraChange}
                  className="w-full text-xs bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-400"
                >
                  {availableCameras.map((cam) => (
                    <option key={cam.deviceId} value={cam.deviceId}>
                      {cam.label}
                    </option>
                  ))}
                </select>
              </div>
            )
          )}

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
              Next: How to Play &rarr;
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: HOW TO PLAY & FINISH */}
      {step === 4 && (
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

          <button
            onClick={finishOnboarding}
            className="w-full py-2.5 rounded-xl font-extrabold text-xs bg-gradient-to-r from-emerald-400 to-teal-400 hover:from-emerald-300 hover:to-teal-300 text-slate-950 shadow-xl shadow-emerald-500/25 transition active:scale-95"
          >
            Launch Desktop Pet ✨
          </button>
        </div>
      )}
    </div>
  );
};
