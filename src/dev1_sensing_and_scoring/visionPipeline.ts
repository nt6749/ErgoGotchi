/**
 * Edge Biometrics & Vision Pipeline using MediaPipe Tasks Vision.
 * Computes baseline-calibrated differential posture signals and blendshape blink tracking.
 * Zero video egress: raw frames stay strictly in client memory.
 */

import { BaselineCalibration, BiometricSignals } from '../types';

// Must match the installed @mediapipe/tasks-vision version (JS and WASM must agree)
const MEDIAPIPE_VERSION = '0.10.35';
const MEDIAPIPE_TIMEOUT_MS = 30000;
const CAMERA_TIMEOUT_MS = 10000;

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${what} timed out after ${ms / 1000}s`)), ms)),
  ]);
}

/** localStorage key for the user's chosen camera (shared by the pet and dashboard windows). */
export const CAMERA_PREF_KEY = 'ergogotchi.cameraId';

export interface CameraOption {
  deviceId: string;
  label: string;
}

function readCameraPreference(): string | null {
  try {
    return localStorage.getItem(CAMERA_PREF_KEY);
  } catch {
    return null;
  }
}

export class VisionPipeline {
  /** deviceId of the camera currently in use; null when on fallback signals. */
  public activeCameraId: string | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private isRunning: boolean = false;
  private intervalId: any = null;

  // MediaPipe Vision task instances
  private faceLandmarker: any = null;
  private poseLandmarker: any = null;

  // Calibration state
  public isCalibrated: boolean = false;
  public isCalibrating: boolean = false;
  public calibrationProgress: number = 0; // 0 to 100
  private calibrationSamples: Array<{
    w: number;
    f: number;
    d: number;
    t: number;
    p: number;
    blinkScore: number;
  }> = [];

  public baseline: BaselineCalibration = {
    w0: 0.35,
    f0: 0.12,
    d0: 0.20,
    t0: 0.0,
    p0: 0.0,
    openEyeBlinkScore: 0.08,
    blinkThreshold: 0.34,
    calibratedAt: '',
  };

  // Blink state tracking
  private blinkTimestamps: number[] = [];
  private blinkTrackingStartedAt: number = Date.now();
  private eyeClosedStartTime: number | null = null;

  // Smoothing buffers (1-second median smoothing)
  private signalBuffer: BiometricSignals[] = [];
  private lastForwardHead: number = 0.0;

  // Callbacks
  public onSignalsComputed: ((signals: BiometricSignals, isPresent: boolean) => void) | null = null;
  public onCalibrationComplete: ((baseline: BaselineCalibration) => void) | null = null;
  public onDebugFrame: ((canvas: HTMLCanvasElement) => void) | null = null;

  constructor() {
    this.createHiddenVideoElement();
  }

  private createHiddenVideoElement() {
    this.videoElement = document.createElement('video');
    this.videoElement.width = 640;
    this.videoElement.height = 480;
    this.videoElement.autoplay = true;
    this.videoElement.muted = true;
    this.videoElement.playsInline = true;
    this.videoElement.style.display = 'none';
    document.body.appendChild(this.videoElement);
  }

  /** Initialize MediaPipe Tasks-Vision (with fallback) */
  public async initMediaPipe(): Promise<boolean> {
    try {
      return await withTimeout(this.loadMediaPipe(), MEDIAPIPE_TIMEOUT_MS, 'MediaPipe load');
    } catch (e) {
      console.warn('[ErgoGotchi Vision] MediaPipe unavailable, using fallback signals:', e);
      return false;
    }
  }

  private async loadMediaPipe(): Promise<boolean> {
    {
      // Dynamic import to support modern CDN / npm bundle
      const vision = await import('@mediapipe/tasks-vision');
      const FilesetResolver = vision.FilesetResolver;
      const FaceLandmarker = vision.FaceLandmarker;
      const PoseLandmarker = vision.PoseLandmarker;

      const wasmFileset = await FilesetResolver.forVisionTasks(
        `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`
      );

      this.faceLandmarker = await FaceLandmarker.createFromOptions(wasmFileset, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task',
          delegate: 'GPU',
        },
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        runningMode: 'VIDEO',
        numFaces: 1,
      });

      this.poseLandmarker = await PoseLandmarker.createFromOptions(wasmFileset, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numPoses: 1,
      });

      console.log('[ErgoGotchi Vision] MediaPipe Tasks-Vision loaded successfully.');
      return true;
    }
  }

  /** Start camera capture and frame loop */
  public async startCamera(): Promise<boolean> {
    if (!this.videoElement) return false;

    try {
      const video = this.videoElement;
      const size = { width: 640, height: 480 };
      const preferredId = readCameraPreference();
      const openStream = async (): Promise<MediaStream> => {
        try {
          // The user's saved choice wins; otherwise let the browser pick a front-facing camera
          const firstChoice = preferredId ? { deviceId: { exact: preferredId } } : { facingMode: 'user' };
          return await navigator.mediaDevices.getUserMedia({ video: { ...size, ...firstChoice }, audio: false });
        } catch (firstErr) {
          // The first choice can be unplugged, or a virtual camera whose source app isn't running
          // (e.g. OBS Virtual Camera). Try every other camera before giving up.
          const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
          for (const cam of cams) {
            if (cam.deviceId === preferredId) continue;
            try {
              const stream = await navigator.mediaDevices.getUserMedia({
                video: { ...size, deviceId: { exact: cam.deviceId } },
                audio: false,
              });
              console.log('[ErgoGotchi Vision] First-choice camera failed, using:', cam.label);
              return stream;
            } catch {
              // Try the next camera
            }
          }
          throw firstErr;
        }
      };
      const open = openStream()
        .then(async (stream) => {
          video.srcObject = stream;
          await video.play();
          this.activeCameraId = stream.getVideoTracks()[0]?.getSettings().deviceId ?? null;
          return stream;
        });
      // If the camera answers after we gave up, release it instead of leaking it
      open.catch(() => {});
      await withTimeout(open, CAMERA_TIMEOUT_MS, 'Camera start').catch((e) => {
        open.then((s) => s.getTracks().forEach((t) => t.stop())).catch(() => {});
        throw e;
      });

      this.isRunning = true;
      this.startFrameLoop();
      return true;
    } catch (err) {
      console.warn('[ErgoGotchi Vision] Camera unavailable, using fallback signals:', (err as Error)?.name, (err as Error)?.message);
      // Fallback: run simulated / test vision loop if camera is unavailable in test runner
      this.isRunning = true;
      this.startFallbackLoop();
      return false;
    }
  }

  /** Return active MediaStream so UI previews can share the camera stream without opening a second exclusive device lock */
  public getVideoStream(): MediaStream | null {
    return (this.videoElement?.srcObject as MediaStream) || null;
  }

  /** Cameras the user can pick from (labels need camera permission, which Electron grants). */
  public async listCameras(): Promise<CameraOption[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices
        .filter((d) => d.kind === 'videoinput' && d.deviceId)
        .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` }));
    } catch {
      return [];
    }
  }

  /** Remember the chosen camera and restart capture on it. Recalibrate afterwards. */
  public async switchCamera(deviceId: string): Promise<boolean> {
    // Probe the new camera first: if it can't start (unplugged, or a virtual camera whose
    // app is closed), leave the current one running untouched and report the failure.
    try {
      const probe = await withTimeout(
        navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId } }, audio: false }),
        CAMERA_TIMEOUT_MS,
        'Camera switch'
      );
      probe.getTracks().forEach((t) => t.stop());
    } catch (err) {
      console.warn('[ErgoGotchi Vision] Could not switch camera:', (err as Error)?.name, (err as Error)?.message);
      return false;
    }

    try {
      localStorage.setItem(CAMERA_PREF_KEY, deviceId);
    } catch {
      // Storage unavailable: the choice just won't persist
    }
    this.stopCamera();
    await this.startCamera();
    return this.activeCameraId === deviceId;
  }

  public stopCamera() {
    this.isRunning = false;
    this.activeCameraId = null;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.videoElement && this.videoElement.srcObject) {
      const stream = this.videoElement.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
    }
  }

  /** Start 5-second upright posture calibration */
  public startCalibration() {
    this.isCalibrating = true;
    this.calibrationProgress = 0;
    this.calibrationSamples = [];
    const startTime = Date.now();
    const DURATION_MS = 5000;

    const calibInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      this.calibrationProgress = Math.min(100, Math.round((elapsed / DURATION_MS) * 100));

      if (elapsed >= DURATION_MS) {
        clearInterval(calibInterval);
        this.finishCalibration();
      }
    }, 100);
  }

  private finishCalibration() {
    this.isCalibrating = false;
    if (this.calibrationSamples.length < 5) {
      console.warn('[ErgoGotchi Vision] Too few calibration samples. Using defaults.');
      this.isCalibrated = true;
      if (this.onCalibrationComplete) this.onCalibrationComplete(this.baseline);
      return;
    }

    // Compute medians
    const median = (arr: number[]) => {
      const s = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(s.length / 2);
      return s.length % 2 !== 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
    };

    const w0 = median(this.calibrationSamples.map((s) => s.w));
    const f0 = median(this.calibrationSamples.map((s) => s.f));
    const d0 = median(this.calibrationSamples.map((s) => s.d));
    const t0 = median(this.calibrationSamples.map((s) => s.t));
    const p0 = median(this.calibrationSamples.map((s) => s.p));
    const openEye = median(this.calibrationSamples.map((s) => s.blinkScore));

    this.baseline = {
      w0: Math.max(0.05, w0),
      f0: Math.max(0.03, f0),
      d0: Math.max(0.05, d0),
      t0,
      p0,
      openEyeBlinkScore: openEye,
      blinkThreshold: (openEye + 0.6) / 2, // Halfway between open eye score and 0.6
      calibratedAt: new Date().toISOString(),
    };

    this.isCalibrated = true;
    // New blink threshold -> restart the blink-rate window
    this.blinkTimestamps = [];
    this.blinkTrackingStartedAt = Date.now();
    console.log('[ErgoGotchi Vision] Calibration baseline locked:', this.baseline);
    if (this.onCalibrationComplete) {
      this.onCalibrationComplete(this.baseline);
    }
  }

  /** Frame processing loop driven by setInterval (safeguarded against background throttling) */
  private startFrameLoop() {
    let lastPoseTime = 0;
    const POSE_INTERVAL = 500; // Run pose twice a second

    this.intervalId = setInterval(() => {
      if (!this.isRunning || !this.videoElement || this.videoElement.readyState < 2) return;

      const now = performance.now();
      let isPresent = false;
      let rawW = this.baseline.w0;
      let rawF = this.baseline.f0;
      let rawD = this.baseline.d0;
      let rawT = this.baseline.t0;
      let rawPitch = this.baseline.p0;
      let rawYaw = 0;
      let blinkScore = 0.05;

      try {
        // 1. Process Face Landmarker (runs every frame >= 20fps for blink detection)
        if (this.faceLandmarker) {
          const faceResult = this.faceLandmarker.detectForVideo(this.videoElement, now);
          if (faceResult && faceResult.faceLandmarks && faceResult.faceLandmarks.length > 0) {
            isPresent = true;
            const facePoints = faceResult.faceLandmarks[0];

            // Estimate Face Width (F) between tragus/temples (landmarks 234 and 454)
            const pLeft = facePoints[234];
            const pRight = facePoints[454];
            if (pLeft && pRight) {
              rawF = Math.hypot(pRight.x - pLeft.x, pRight.y - pLeft.y);
            }

            // Extract Blink blendshapes
            if (faceResult.faceBlendshapes && faceResult.faceBlendshapes.length > 0) {
              const blendshapes = faceResult.faceBlendshapes[0].categories;
              const blinkL = blendshapes.find((c: any) => c.categoryName === 'eyeBlinkLeft')?.score || 0;
              const blinkR = blendshapes.find((c: any) => c.categoryName === 'eyeBlinkRight')?.score || 0;
              blinkScore = (blinkL + blinkR) / 2;
            }

            // Extract Pitch & Yaw from transformation matrix or vertical nose/chin orientation
            if (faceResult.facialTransformationMatrixes && faceResult.facialTransformationMatrixes.length > 0) {
              const m = faceResult.facialTransformationMatrixes[0].data;
              // Pitch (rotation around X) and Yaw (rotation around Y)
              rawPitch = Math.atan2(m[6], m[10]) * (180 / Math.PI);
              rawYaw = Math.atan2(-m[2], Math.sqrt(m[6] * m[6] + m[10] * m[10])) * (180 / Math.PI);
            }
          }
        }

        // 2. Process Pose Landmarker (runs ~2 Hz for shoulder tracking)
        if (this.poseLandmarker && now - lastPoseTime >= POSE_INTERVAL) {
          lastPoseTime = now;
          const poseResult = this.poseLandmarker.detectForVideo(this.videoElement, now);
          if (poseResult && poseResult.landmarks && poseResult.landmarks.length > 0) {
            const pose = poseResult.landmarks[0];
            const leftShoulder = pose[11];
            const rightShoulder = pose[12];
            const leftEar = pose[7];
            const rightEar = pose[8];

            if (leftShoulder && rightShoulder && leftShoulder.visibility > 0.5 && rightShoulder.visibility > 0.5) {
              rawW = Math.hypot(rightShoulder.x - leftShoulder.x, rightShoulder.y - leftShoulder.y);
              rawT = Math.atan2(rightShoulder.y - leftShoulder.y, rightShoulder.x - leftShoulder.x) * (180 / Math.PI);

              if (leftEar && rightEar) {
                const earMidY = (leftEar.y + rightEar.y) / 2;
                const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;
                rawD = Math.max(0.01, shoulderMidY - earMidY);
              }
            }
          }
        }
      } catch (err) {
        // Landmarker frame error
      }

      // Collect calibration sample
      if (this.isCalibrating && isPresent) {
        this.calibrationSamples.push({
          w: rawW,
          f: rawF,
          d: rawD,
          t: rawT,
          p: rawPitch,
          blinkScore,
        });
      }

      // Process Blink detection logic
      this.processBlink(blinkScore, rawPitch - this.baseline.p0);

      // Compute relative posture signals
      const signals = this.computeSignals(rawW, rawF, rawD, rawT, rawPitch, rawYaw);

      if (this.onSignalsComputed) {
        this.onSignalsComputed(signals, isPresent);
      }
    }, 40); // 25 fps
  }

  /** Blink detection with blendshape threshold and closure duration validation */
  private processBlink(blinkScore: number, relativePitch: number) {
    const now = Date.now();

    // Guard: Pitch > 20 deg below baseline pauses blink counting (eyelids narrow when looking down at keyboard)
    if (relativePitch > 20) {
      this.eyeClosedStartTime = null;
      return;
    }

    if (blinkScore >= this.baseline.blinkThreshold) {
      if (this.eyeClosedStartTime === null) {
        this.eyeClosedStartTime = now;
      }
    } else {
      if (this.eyeClosedStartTime !== null) {
        const closureDuration = now - this.eyeClosedStartTime;
        // Valid blink: score rising above threshold and falling back within 400ms
        if (closureDuration >= 50 && closureDuration <= 400) {
          this.blinkTimestamps.push(now);
        }
        this.eyeClosedStartTime = null;
      }
    }

    // Prune blink timestamps older than 60 seconds
    const cutoff = now - 60000;
    while (this.blinkTimestamps.length > 0 && this.blinkTimestamps[0] < cutoff) {
      this.blinkTimestamps.shift();
    }
  }

  /**
   * Blinks per minute. The raw count only covers the last 60s, so right after start-up it reads ~0,
   * which used to look like severe eye strain. Report a normal rate for the first 20s, then extrapolate.
   */
  private currentBlinkRate(): number {
    const elapsedMs = Date.now() - this.blinkTrackingStartedAt;
    if (elapsedMs >= 60000) return this.blinkTimestamps.length;
    if (elapsedMs < 20000) return 15;
    return Math.round((this.blinkTimestamps.length * 60000) / elapsedMs);
  }

  /** Compute normalized signals relative to calibrated baseline */
  private computeSignals(
    w: number,
    f: number,
    d: number,
    t: number,
    p: number,
    y: number
  ): BiometricSignals {
    const b = this.baseline;

    const fwRatio = f / Math.max(0.01, w);
    const fw0Ratio = b.f0 / Math.max(0.01, b.w0);

    const dwRatio = d / Math.max(0.01, w);
    const dw0Ratio = b.d0 / Math.max(0.01, b.w0);

    let forwardHead = fwRatio / Math.max(0.01, fw0Ratio) - 1;

    // Guard: Yaw > 20 deg either way holds last forward_head value (multi-monitor guard)
    if (Math.abs(y) > 20) {
      forwardHead = this.lastForwardHead;
    } else {
      this.lastForwardHead = forwardHead;
    }

    const headDrop = 1 - dwRatio / Math.max(0.01, dw0Ratio);
    const leanIn = w / Math.max(0.01, b.w0) - 1;
    const tilt = Math.abs(t - b.t0);
    const headPitch = p - b.p0;

    const rawSignal: BiometricSignals = {
      forward_head: forwardHead,
      head_drop: headDrop,
      head_pitch_deg: headPitch,
      lean_in: leanIn,
      shoulder_tilt_deg: tilt,
      blink_rate_1m: this.currentBlinkRate(),
      head_yaw_deg: y,
    };

    // 1-second median smoothing
    this.signalBuffer.push(rawSignal);
    if (this.signalBuffer.length > 25) {
      this.signalBuffer.shift();
    }

    return this.smoothSignals();
  }

  private smoothSignals(): BiometricSignals {
    if (this.signalBuffer.length === 0) {
      return {
        forward_head: 0,
        head_drop: 0,
        head_pitch_deg: 0,
        lean_in: 0,
        shoulder_tilt_deg: 0,
        blink_rate_1m: 14,
        head_yaw_deg: 0,
      };
    }

    const median = (arr: number[]) => {
      const s = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(s.length / 2);
      return s.length % 2 !== 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
    };

    return {
      forward_head: median(this.signalBuffer.map((s) => s.forward_head)),
      head_drop: median(this.signalBuffer.map((s) => s.head_drop)),
      head_pitch_deg: median(this.signalBuffer.map((s) => s.head_pitch_deg)),
      lean_in: median(this.signalBuffer.map((s) => s.lean_in)),
      shoulder_tilt_deg: median(this.signalBuffer.map((s) => s.shoulder_tilt_deg)),
      blink_rate_1m: this.signalBuffer[this.signalBuffer.length - 1].blink_rate_1m,
      head_yaw_deg: median(this.signalBuffer.map((s) => s.head_yaw_deg)),
    };
  }

  /** Fallback loop for simulated testing when camera is unavailable */
  private startFallbackLoop() {
    this.intervalId = setInterval(() => {
      if (!this.isRunning) return;
      const s: BiometricSignals = {
        forward_head: 0.02,
        head_drop: 0.02,
        head_pitch_deg: 2.0,
        lean_in: 0.02,
        shoulder_tilt_deg: 1.0,
        blink_rate_1m: 14,
        head_yaw_deg: 0.0,
      };
      if (this.onSignalsComputed) {
        this.onSignalsComputed(s, true);
      }
    }, 1000);
  }
}

export const visionPipeline = new VisionPipeline();
