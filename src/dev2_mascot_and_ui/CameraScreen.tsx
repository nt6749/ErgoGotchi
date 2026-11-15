/**
 * CameraScreen.tsx
 *
 * Real-time camera viewfinder and biometric diagnostics screen in the Demo tab.
 * Allows users and judges to:
 *  1. See themselves live in a mirrored or normal video viewport.
 *  2. Switch between available webcams to test hardware compatibility.
 *  3. Test real-time posture tracking, spinal strain, and blink detection.
 *  4. Trigger 5-second upright posture baseline calibration with visual countdown.
 *
 * Zero video egress: All MediaPipe frames execute in local browser memory.
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  visionPipeline,
  type CameraStatus,
  type VisionLandmarks,
} from '../dev1_sensing_and_scoring/visionPipeline';
import { PetState } from '../types';
import {
  CARD,
  PANEL,
  LABEL,
  MUTED,
  BUTTON_PRIMARY,
  BUTTON_NEUTRAL,
  BUTTON_OUTLINE,
  GOOD_TEXT,
  BAD_TEXT,
  ACCENT_TEXT,
  TRACK,
  BAR_GOOD,
  BAR_ACCENT,
  BAR_BAD,
  FAINT,
} from './theme';
import { soundEffects } from './soundEffects';

interface CameraChoice {
  deviceId: string;
  label: string;
}

export interface CameraScreenProps {
  cameras?: CameraChoice[];
  activeCameraId?: string | null;
  onSelectCamera?: (deviceId: string) => void;
  onRecalibrate: () => void;
  strainIndex: number;
  blinkRate: number;
  worstSignal: string;
  state: PetState;
  isPresent?: boolean;
  isCalibrating?: boolean;
  calibrationProgress?: number;
  previewFrame?: string | null;
  landmarks?: VisionLandmarks | null;
  cameraStatus?: CameraStatus;
  onPreviewRequest?: (active: boolean) => void;
  onRefreshCameras?: () => void;
}

export const CameraScreen: React.FC<CameraScreenProps> = ({
  cameras = [],
  activeCameraId = null,
  onSelectCamera,
  onRecalibrate,
  strainIndex,
  blinkRate,
  worstSignal,
  state,
  isPresent = true,
  isCalibrating = false,
  calibrationProgress = 0,
  previewFrame = null,
  landmarks = null,
  cameraStatus = 'OFFLINE',
  onPreviewRequest,
  onRefreshCameras,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isMirrored, setIsMirrored] = useState(true);
  const [hasStream, setHasStream] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number } | null>(null);

  // Connect to the shared visionPipeline video stream
  const attachStream = useCallback(async () => {
    // If preview frames are already being streamed from the primary Duck window or in follower dashboard mode,
    // skip exclusive local hardware grab to prevent Windows NotReadableError.
    const isDashboardView = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('view') === 'dashboard';
    if (previewFrame || (isDashboardView && !!(window as any).electronAPI?.isElectron)) {
      return;
    }

    setIsConnecting(true);
    setCameraError(null);

    try {
      let stream = visionPipeline.getVideoStream();
      if (!stream) {
        await visionPipeline.startCamera();
        stream = visionPipeline.getVideoStream();
      }

      // Browser fallback if stream is still unavailable
      if (!stream && navigator.mediaDevices) {
        const constraints: MediaStreamConstraints = {
          video: activeCameraId ? { deviceId: { exact: activeCameraId } } : { width: 640, height: 480 },
          audio: false,
        };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      }

      if (stream && videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch {
          // Play request may be interrupted by fast tab switching
        }
        setHasStream(true);

        const track = stream.getVideoTracks()[0];
        if (track) {
          const settings = track.getSettings();
          if (settings.width && settings.height) {
            setVideoDimensions({ width: settings.width, height: settings.height });
          }
        }
      } else {
        setHasStream(false);
      }
    } catch (err: any) {
      console.warn('[CameraScreen] Error connecting camera feed:', err);
      setCameraError(err?.message || 'Could not connect to camera device.');
      setHasStream(false);
    } finally {
      setIsConnecting(false);
    }
  }, [activeCameraId, previewFrame]);

  useEffect(() => {
    let mounted = true;

    // Signal Duck window to stream preview frames when CameraScreen is mounted/visible
    onPreviewRequest?.(true);

    const pingInterval = setInterval(() => {
      if (mounted && document.visibilityState === 'visible') {
        onPreviewRequest?.(true);
      }
    }, 3000);

    const onVisibility = () => {
      onPreviewRequest?.(document.visibilityState === 'visible');
    };
    document.addEventListener('visibilitychange', onVisibility);

    attachStream();

    // Stream watchdog: re-attach if camera switches or restarts (only when running local stream)
    const interval = setInterval(() => {
      if (!mounted) return;
      const stream = visionPipeline.getVideoStream();
      if (stream) {
        const liveTracks = stream.getVideoTracks().filter((t) => t.readyState === 'live');
        if (liveTracks.length > 0) {
          setHasStream(true);
          if (videoRef.current && videoRef.current.srcObject !== stream) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(() => {});
          }
        } else {
          setHasStream(false);
        }
      }
    }, 1500);

    return () => {
      mounted = false;
      onPreviewRequest?.(false);
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(interval);
      clearInterval(pingInterval);
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [attachStream, onPreviewRequest]);

  // Enumerate cameras on mount so camera dropdown is instantly populated
  useEffect(() => {
    onRefreshCameras?.();
  }, [onRefreshCameras]);

  // High-DPI Razor-Sharp Native Vector Skeleton & HUD Overlay Loop
  useEffect(() => {
    let animId: number;

    const renderOverlay = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        animId = requestAnimationFrame(renderOverlay);
        return;
      }

      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        animId = requestAnimationFrame(renderOverlay);
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      const targetW = Math.round(rect.width * dpr);
      const targetH = Math.round(rect.height * dpr);

      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        animId = requestAnimationFrame(renderOverlay);
        return;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      const width = rect.width;
      const height = rect.height;
      ctx.clearRect(0, 0, width, height);

      // Active landmarks from remote Duck window (Approach A preview) or local vision pipeline
      const activeLandmarks = landmarks || (hasStream ? visionPipeline.latestLandmarks : null);

      if (activeLandmarks && (hasStream || previewFrame) && !isCalibrating && cameraStatus !== 'CALIBRATING') {
        drawVectorHUD(ctx, width, height, activeLandmarks, isMirrored, state, strainIndex);
      }

      ctx.restore();
      animId = requestAnimationFrame(renderOverlay);
    };

    animId = requestAnimationFrame(renderOverlay);
    return () => cancelAnimationFrame(animId);
  }, [landmarks, hasStream, previewFrame, isCalibrating, cameraStatus, isMirrored, state, strainIndex]);

  const handleStartCalibration = () => {
    soundEffects.playPet();
    onRecalibrate();
  };

  // State styling badges
  const stateBadge =
    state === 'THRIVING'
      ? { label: 'Upright (Thriving)', bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' }
      : state === 'NEUTRAL'
      ? { label: 'Neutral Posture', bg: 'bg-blue-500/20 text-blue-300 border-blue-500/40' }
      : state === 'SLOUCHING'
      ? { label: 'Slouch Detected', bg: 'bg-amber-500/20 text-amber-300 border-amber-500/40' }
      : state === 'WILTED'
      ? { label: 'Severely Wilted', bg: 'bg-rose-500/20 text-rose-300 border-rose-500/40' }
      : { label: 'Away / No Face', bg: 'bg-slate-500/20 text-slate-300 border-slate-500/40' };

  const blinkOk = blinkRate >= 10;
  const strainPercent = Math.min(100, Math.max(0, Math.round(strainIndex * 100)));

  return (
    <div className={`${CARD} p-5 space-y-4 flex flex-col`}>
      {/* Title & Status Badges */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">📷</span>
          <div>
            <h3 className="text-sm font-bold tracking-tight">Camera Screen & Vision Diagnostics</h3>
            <p className={`text-[11px] ${MUTED}`}>Live feed and real-time biometric tracking test</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasStream || previewFrame ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Live Feed {!hasStream && previewFrame ? '(Shared Desktop Stream)' : ''}
            </span>
          ) : isConnecting ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
              <span className="w-2 h-2 rounded-full border border-cyan-400 border-t-transparent animate-spin" />
              Connecting...
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
              <span className="w-2 h-2 rounded-full bg-rose-400" />
              {cameraStatus === 'ERROR' ? 'Camera Error' : 'Camera Offline'}
            </span>
          )}

          {(videoDimensions || previewFrame) && (
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${PANEL} ${FAINT}`}>
              {videoDimensions ? `${videoDimensions.width}×${videoDimensions.height}` : '640×360'}
            </span>
          )}
        </div>
      </div>

      {/* Main Viewfinder Box */}
      <div className="relative w-full aspect-video bg-slate-950 rounded-2xl overflow-hidden border-2 border-[var(--line)] shadow-inner flex items-center justify-center">
        {hasStream && (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            onLoadedMetadata={() => {
              if (videoRef.current) {
                setVideoDimensions({
                  width: videoRef.current.videoWidth,
                  height: videoRef.current.videoHeight,
                });
              }
            }}
            className={`w-full h-full object-cover transition-transform duration-200 ${
              isMirrored ? '-scale-x-100' : 'scale-x-100'
            }`}
          />
        )}

        {!hasStream && previewFrame && (
          <img
            src={previewFrame}
            alt="Live Camera Feed"
            className={`w-full h-full object-cover select-none pointer-events-none transition-transform duration-200 ${
              isMirrored ? '-scale-x-100' : 'scale-x-100'
            }`}
          />
        )}

        {/* High-DPI Razor-Sharp Native Vector Skeleton & HUD Canvas */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none z-10"
        />

        {/* Camera Offline / Permission Prompt */}
        {!hasStream && !previewFrame && !isConnecting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-950/90 space-y-3 z-20">
            <span className="text-4xl">📷</span>
            <div className="max-w-xs space-y-1">
              <p className="text-xs font-semibold text-slate-200">
                {cameraStatus === 'ERROR' ? 'Camera Error' : 'Camera preview not active'}
              </p>
              <p className="text-[11px] text-slate-400">
                {cameraError || 'Ensure your webcam is connected and the desktop pet has camera access.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                onPreviewRequest?.(true);
                attachStream();
              }}
              className={`${BUTTON_PRIMARY} flex items-center gap-1.5`}
            >
              <span>🎥 Reconnect Preview</span>
            </button>
          </div>
        )}

        {/* Connecting Spinner */}
        {isConnecting && !hasStream && !previewFrame && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 space-y-2 z-20">
            <div className="w-8 h-8 rounded-full border-3 border-cyan-400 border-t-transparent animate-spin" />
            <span className="text-xs font-medium text-cyan-300">Initializing camera feed...</span>
          </div>
        )}

        {/* 5-Second Calibration Overlay */}
        {(isCalibrating || cameraStatus === 'CALIBRATING') && (
          <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center z-20">
            <div className="w-12 h-12 rounded-full border-4 border-yellow-400 border-t-transparent animate-spin mb-3" />
            <h4 className="text-sm font-bold text-white mb-1">Calibrating Upright Posture...</h4>
            <p className="text-xs text-slate-300 max-w-xs mb-3">
              Sit tall and face your monitor naturally while we capture your zero-point baseline.
            </p>
            <div className="w-48 bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-700">
              <div
                className="bg-yellow-400 h-full transition-all duration-150"
                style={{ width: `${calibrationProgress}%` }}
              />
            </div>
            <span className="text-xs font-mono text-yellow-300 mt-2 font-bold">{calibrationProgress}%</span>
          </div>
        )}

        {/* Top-Right HUD Pill: Tracking indicator */}
        {(hasStream || previewFrame) && !isCalibrating && cameraStatus !== 'CALIBRATING' && (
          <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5">
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border backdrop-blur-md ${
                isPresent
                  ? 'bg-emerald-950/70 text-emerald-300 border-emerald-500/50'
                  : 'bg-amber-950/70 text-amber-300 border-amber-500/50'
              }`}
            >
              {isPresent ? '👤 Face Tracked' : '⚠️ Searching for Face'}
            </span>
          </div>
        )}

        {/* Bottom-Left HUD Pill: Mirrored status */}
        {(hasStream || previewFrame) && !isCalibrating && cameraStatus !== 'CALIBRATING' && (
          <div className="absolute bottom-3 left-3 z-20">
            <button
              type="button"
              onClick={() => setIsMirrored(!isMirrored)}
              className="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-slate-900/80 hover:bg-slate-800/90 text-slate-200 border border-slate-700/80 backdrop-blur-md transition flex items-center gap-1 shadow"
              title="Toggle mirrored selfie view"
            >
              <span>🪞</span>
              <span>{isMirrored ? 'Mirrored (Selfie)' : 'Normal View'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Camera Selection & Quick Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        {cameras.length > 0 ? (
          <div className="flex items-center gap-2">
            <label className={`${LABEL} normal-case`}>Camera Device:</label>
            <select
              value={activeCameraId ?? ''}
              onChange={(e) => onSelectCamera?.(e.target.value)}
              title="Select camera for posture tracking"
              className={`${BUTTON_NEUTRAL} max-w-[220px] text-xs py-1.5 truncate`}
            >
              {cameras.map((cam) => (
                <option key={cam.deviceId} value={cam.deviceId}>
                  📷 {cam.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <button
            type="button"
            onClick={attachStream}
            className={`${BUTTON_NEUTRAL} text-xs py-1.5 flex items-center gap-1.5`}
          >
            <span>🔄 Reconnect Camera</span>
          </button>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleStartCalibration}
            disabled={isCalibrating}
            className={`${BUTTON_PRIMARY} text-xs py-1.5 flex items-center gap-1.5`}
            title="Sit upright and capture 5-second calibration baseline"
          >
            <span>🎯</span>
            <span>{isCalibrating ? 'Calibrating...' : 'Calibrate Baseline [C]'}</span>
          </button>
        </div>
      </div>

      {/* Real-time Biometric Diagnostic Meters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 pt-2">
        <div className={`${PANEL} p-3 space-y-1`}>
          <span className={LABEL}>Posture State</span>
          <div className="pt-0.5">
            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${stateBadge.bg}`}>
              {stateBadge.label}
            </span>
          </div>
        </div>

        <div className={`${PANEL} p-3 space-y-1`}>
          <div className="flex items-center justify-between">
            <span className={LABEL}>Spinal Strain</span>
            <span className="text-xs font-bold font-mono">{strainPercent}%</span>
          </div>
          <div className={`${TRACK} h-1.5 mt-1`}>
            <div
              className={`h-full transition-all duration-300 ${
                strainPercent >= 60 ? BAR_BAD : strainPercent >= 35 ? BAR_ACCENT : BAR_GOOD
              }`}
              style={{ width: `${strainPercent}%` }}
            />
          </div>
        </div>

        <div className={`${PANEL} p-3 space-y-1`}>
          <div className="flex items-center justify-between">
            <span className={LABEL}>Blink Rate</span>
            <span className={`text-xs font-bold font-mono ${blinkOk ? GOOD_TEXT : BAD_TEXT}`}>
              {blinkRate}/m
            </span>
          </div>
          <p className={`text-[10px] font-medium truncate ${blinkOk ? GOOD_TEXT : BAD_TEXT}`}>
            {blinkOk ? '✓ Healthy hydration' : '⚠️ Staring fatigue'}
          </p>
        </div>

        <div className={`${PANEL} p-3 space-y-1`}>
          <span className={LABEL}>Primary Signal</span>
          <p className="text-xs font-semibold truncate capitalize" title={worstSignal}>
            {worstSignal.replace(/_/g, ' ')}
          </p>
        </div>
      </div>

      {/* Privacy Guarantee Banner */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--surface)] border border-[var(--line)] text-[10px] text-[var(--muted)]">
        <span className="text-xs">🔒</span>
        <span>
          <strong>100% On-Device Privacy:</strong> MediaPipe vision executes purely in client memory. No video or frames are ever uploaded, recorded, or transmitted to any server.
        </span>
      </div>
    </div>
  );
};

/**
 * High-DPI Vector Canvas Renderer
 * Draws razor-sharp skeleton lines, joint halos, targeting reticle and telemetry text directly
 * in high-resolution vector coordinates so they never degrade or blur from video JPEG compression.
 */
function drawVectorHUD(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  lm: VisionLandmarks,
  isMirrored: boolean,
  state: PetState,
  strainIndex: number
) {
  const mapX = (x: number) => (isMirrored ? (1 - x) * width : x * width);
  const mapY = (y: number) => y * height;

  if (!lm.isPresent) {
    ctx.fillStyle = 'rgba(244, 63, 94, 0.9)';
    ctx.font = 'bold 11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SEARCHING FOR USER...', width / 2, height / 2);
    ctx.textAlign = 'left';
    return;
  }

  const isBadPosture = state === 'SLOUCHING' || state === 'WILTED' || strainIndex > 0.5;
  const statusColor = isBadPosture ? '#ef4444' : '#10b981';
  const glowColor = isBadPosture ? 'rgba(239, 68, 68, 0.5)' : 'rgba(16, 185, 129, 0.5)';
  const cyanGlow = 'rgba(6, 182, 212, 0.6)';

  // 1. Shoulders and Base Horizon
  if (lm.leftShoulder && lm.rightShoulder) {
    const lsX = mapX(lm.leftShoulder.x);
    const lsY = mapY(lm.leftShoulder.y);
    const rsX = mapX(lm.rightShoulder.x);
    const rsY = mapY(lm.rightShoulder.y);

    const isTilted = Math.abs(lm.rawT) > 6;
    const shoulderColor = isTilted ? '#f59e0b' : '#06b6d4';

    // Shoulder baseline vector line
    ctx.lineWidth = 3;
    ctx.strokeStyle = shoulderColor;
    ctx.shadowColor = isTilted ? 'rgba(245, 158, 11, 0.7)' : cyanGlow;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(lsX, lsY);
    ctx.lineTo(rsX, rsY);
    ctx.stroke();

    // Shoulder joints with halos
    [{ x: lsX, y: lsY }, { x: rsX, y: rsY }].forEach((pt) => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#22d3ee';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 12, 0, Math.PI * 2);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.4)';
      ctx.stroke();
    });

    const midShoulderX = (lsX + rsX) / 2;
    const midShoulderY = (lsY + rsY) / 2;

    // 2. Spine / Posture Alignment Vector
    let headAnchorX = midShoulderX;
    let headAnchorY = midShoulderY - 80;

    if (lm.nose) {
      headAnchorX = mapX(lm.nose.x);
      headAnchorY = mapY(lm.nose.y);
    } else if (lm.chin) {
      headAnchorX = mapX(lm.chin.x);
      headAnchorY = mapY(lm.chin.y);
    } else if (lm.leftEar && lm.rightEar) {
      headAnchorX = (mapX(lm.leftEar.x) + mapX(lm.rightEar.x)) / 2;
      headAnchorY = (mapY(lm.leftEar.y) + mapY(lm.rightEar.y)) / 2;
    }

    ctx.lineWidth = 3;
    ctx.strokeStyle = statusColor;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    if (isBadPosture) {
      ctx.setLineDash([6, 4]);
    } else {
      ctx.setLineDash([]);
    }
    ctx.moveTo(midShoulderX, midShoulderY);
    ctx.lineTo(headAnchorX, headAnchorY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Spine anchor center dot
    ctx.beginPath();
    ctx.arc(midShoulderX, midShoulderY, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }

  // 3. Ear Joints
  if (lm.leftEar && lm.rightEar) {
    const leX = mapX(lm.leftEar.x);
    const leY = mapY(lm.leftEar.y);
    const reX = mapX(lm.rightEar.x);
    const reY = mapY(lm.rightEar.y);

    [{ x: leX, y: leY }, { x: reX, y: reY }].forEach((pt) => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#c084fc';
      ctx.shadowColor = 'rgba(192, 132, 252, 0.6)';
      ctx.shadowBlur = 6;
      ctx.fill();
    });
  }

  // 4. Face Reticle Targeting Box
  if (lm.forehead && lm.chin && lm.faceLeft && lm.faceRight) {
    const fcX = (mapX(lm.faceLeft.x) + mapX(lm.faceRight.x)) / 2;
    const fcY = (mapY(lm.forehead.y) + mapY(lm.chin.y)) / 2;
    const fRadiusX = Math.max(20, Math.abs(mapX(lm.faceRight.x) - mapX(lm.faceLeft.x)) * 0.7);
    const fRadiusY = Math.max(25, Math.abs(mapY(lm.chin.y) - mapY(lm.forehead.y)) * 0.7);

    const bLen = Math.min(16, fRadiusX * 0.4);
    const left = fcX - fRadiusX;
    const right = fcX + fRadiusX;
    const top = fcY - fRadiusY;
    const bottom = fcY + fRadiusY;

    ctx.strokeStyle = isBadPosture ? '#f87171' : '#38bdf8';
    ctx.lineWidth = 2;
    ctx.shadowColor = isBadPosture ? 'rgba(248, 113, 113, 0.6)' : 'rgba(56, 189, 248, 0.6)';
    ctx.shadowBlur = 8;

    // 4 Corner Brackets
    ctx.beginPath();
    ctx.moveTo(left, top + bLen); ctx.lineTo(left, top); ctx.lineTo(left + bLen, top);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(right - bLen, top); ctx.lineTo(right, top); ctx.lineTo(right, top + bLen);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(left, bottom - bLen); ctx.lineTo(left, bottom); ctx.lineTo(left + bLen, bottom);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(right - bLen, bottom); ctx.lineTo(right, bottom); ctx.lineTo(right, bottom - bLen);
    ctx.stroke();
  }

  // 5. Nose targeting dot
  if (lm.nose) {
    const nX = mapX(lm.nose.x);
    const nY = mapY(lm.nose.y);
    ctx.beginPath();
    ctx.arc(nX, nY, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#fde047';
    ctx.shadowColor = 'rgba(253, 224, 71, 0.8)';
    ctx.shadowBlur = 6;
    ctx.fill();
  }

  // 6. Vector HUD Diagnostics readout pill (Bottom Right)
  const pillW = 150;
  const pillH = 50;
  const pillX = width - pillW - 12;
  const pillY = height - pillH - 12;

  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
  ctx.strokeStyle = 'rgba(51, 65, 85, 0.85)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (typeof (ctx as any).roundRect === 'function') {
    (ctx as any).roundRect(pillX, pillY, pillW, pillH, 8);
  } else {
    ctx.rect(pillX, pillY, pillW, pillH);
  }
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#cbd5e1';
  ctx.font = 'bold 9px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
  ctx.fillText(`PITCH: ${lm.rawPitch >= 0 ? '+' : ''}${lm.rawPitch.toFixed(1)}°`, pillX + 10, pillY + 15);
  ctx.fillText(`TILT : ${lm.rawT >= 0 ? '+' : ''}${lm.rawT.toFixed(1)}°`, pillX + 10, pillY + 30);
  ctx.fillText(`DIST : ${(lm.rawW * 100).toFixed(0)}%`, pillX + 10, pillY + 44);

  if (lm.blinkScore > 0.3) {
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('BLINK', pillX + 96, pillY + 15);
  }
}
