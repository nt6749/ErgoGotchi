/**
 * Resilient WebSocket client for ErgoGotchi Telemetry & Gemini Interventions.
 * Implements Contract 1 (Telemetry Ingestion) and Contracts 2 & 3 (Interventions).
 * Fails safely: if server or Wi-Fi is offline, pet reacts with local canned lines.
 */

import { 
  InterventionMessage, 
  InterventionRequestMessage, 
  PetState, 
  TelemetryMessage, 
  TriggerReason 
} from '../types';

export const CANNED_LINES_FALLBACK: Record<string, string[]> = {
  CHIN_TUCK: [
    "You're folding like a lawn chair. Retract that chin!",
    "Your head is drifting into your monitor. Pull it back.",
    "I'm melting into a puddle down here. Sit tall!",
    "Turtle mode detected! Give those vertebrae a rest."
  ],
  SHOULDER_ROLL: [
    "Your shoulders are trying to eat your ears. Roll them down.",
    "Hunch alert! Roll your shoulders back and take a deep breath.",
    "Shoulders up, HP down. Roll 'em back 5 times.",
    "Relax those traps before both of us turn into stone."
  ],
  SIT_BACK: [
    "You're inching into the screen. Slide your hips to the back.",
    "Gravity is winning. Reclaim your chair backrest.",
    "Leaning tower of programmer. Push yourself back.",
    "Sit back into your chair, we're losing altitude down here."
  ],
  LOOK_AWAY: [
    "Your eyes haven't blinked in forever. Look at a distant wall.",
    "Blink check! Look 20 feet away for 20 seconds.",
    "Retina recharge time. Glance out a window.",
    "Screen stare overload. Rest your eyes for 20 seconds."
  ],
  STAND_UP: [
    "Marathon session detected! Stand up and stretch your legs.",
    "Desk hibernation time is up. Stand up and walk a minute.",
    "My pixels are cramping. Stand up and shake it out.",
    "Time for a lap around the room. Stand and stretch!"
  ],
  NONE: [
    "Flawless spine alignment. We're cruising now!",
    "Upright and thriving! Keep this posture going.",
    "Pure ergonomic perfection. I feel unstoppable!"
  ]
};

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private serverUrl: string;
  private token: string;
  private sessionId: string;
  private reconnectDelay: number = 1000;
  private isConnecting: boolean = false;
  private pendingRequests: Map<string, { timeoutId: any; reason: TriggerReason }> = new Map();

  public onInterventionReceived: ((msg: InterventionMessage) => void) | null = null;
  public onConnectionChange: ((connected: boolean) => void) | null = null;

  constructor(serverUrl: string = 'ws://localhost:8000/ws', token: string = 'ergogotchi_sunhacks_2026_secret') {
    this.serverUrl = serverUrl;
    this.token = token;
    this.sessionId = this.getOrCreateSessionId();
  }

  private getOrCreateSessionId(): string {
    let sid = localStorage.getItem('ergogotchi_session_id');
    if (!sid) {
      sid = crypto.randomUUID();
      localStorage.setItem('ergogotchi_session_id', sid);
    }
    return sid;
  }

  public getSessionId(): string {
    return this.sessionId;
  }

  public connect() {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) return;

    this.isConnecting = true;
    const fullUrl = `${this.serverUrl}?token=${encodeURIComponent(this.token)}`;

    try {
      this.ws = new WebSocket(fullUrl);

      this.ws.onopen = () => {
        this.isConnecting = false;
        this.reconnectDelay = 1000;
        console.log('[ErgoGotchi Net] Connected to Telemetry server.');
        if (this.onConnectionChange) this.onConnectionChange(true);
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'intervention') {
            const req = this.pendingRequests.get(msg.request_id);
            if (req) {
              clearTimeout(req.timeoutId);
              this.pendingRequests.delete(msg.request_id);
            }
            if (this.onInterventionReceived) {
              this.onInterventionReceived(msg as InterventionMessage);
            }
          }
        } catch (e) {
          console.error('[ErgoGotchi Net] Message parse error:', e);
        }
      };

      this.ws.onclose = () => {
        this.isConnecting = false;
        if (this.onConnectionChange) this.onConnectionChange(false);
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.isConnecting = false;
        if (this.ws) this.ws.close();
      };
    } catch (e) {
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    setTimeout(() => {
      this.reconnectDelay = Math.min(30000, this.reconnectDelay * 1.5);
      this.connect();
    }, this.reconnectDelay);
  }

  /** Send 1 Hz Contract 1 Telemetry */
  public sendTelemetry(payload: {
    present: boolean;
    calibrated: boolean;
    forward_head: number | null;
    head_drop: number | null;
    head_pitch_deg: number | null;
    lean_in: number | null;
    shoulder_tilt_deg: number | null;
    blink_rate_1m: number | null;
    strain_index: number;
    hp: number;
    state: PetState;
  }) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return; // Drop telemetry while disconnected; pet operates locally
    }

    const msg: TelemetryMessage = {
      type: 'telemetry',
      v: 1,
      session_id: this.sessionId,
      ts: new Date().toISOString(),
      ...payload,
    };

    try {
      this.ws.send(JSON.stringify(msg));
    } catch (e) {
      // Disconnected during write
    }
  }

  /** Send Contract 2 Intervention Request with 2-second canned fallback timer */
  public requestIntervention(
    reason: TriggerReason,
    context: {
      minutes_in_session: number;
      worst_signal: string;
      strain_index: number;
      blink_rate_1m: number;
      hp: number;
    }
  ) {
    const requestId = 'req_' + Math.random().toString(36).substring(2, 9);

    // 2-second timeout fallback: if no server response in 2s, display canned line
    const timeoutId = setTimeout(() => {
      this.triggerLocalFallback(requestId, reason, context);
      this.pendingRequests.delete(requestId);
    }, 2000);

    this.pendingRequests.set(requestId, { timeoutId, reason });

    const msg: InterventionRequestMessage = {
      type: 'intervention_request',
      v: 1,
      request_id: requestId,
      session_id: this.sessionId,
      reason,
      context,
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(msg));
        return;
      } catch (e) {
        // Fall through to immediate local fallback
      }
    }

    // If offline, trigger local fallback immediately
    clearTimeout(timeoutId);
    this.triggerLocalFallback(requestId, reason, context);
    this.pendingRequests.delete(requestId);
  }

  private triggerLocalFallback(
    requestId: string,
    reason: TriggerReason,
    context: { worst_signal: string; hp: number }
  ) {
    let cue = 'CHIN_TUCK';
    if (reason === 'LOW_BLINK') cue = 'LOOK_AWAY';
    else if (reason === 'LONG_SESSION') cue = 'STAND_UP';
    else if (context.worst_signal === 'head_drop' || context.worst_signal === 'head_pitch') cue = 'SHOULDER_ROLL';
    else if (context.worst_signal === 'lean_in' || context.worst_signal === 'tilt') cue = 'SIT_BACK';

    const pool = CANNED_LINES_FALLBACK[cue] || CANNED_LINES_FALLBACK.CHIN_TUCK;
    const text = pool[Math.floor(Math.random() * pool.length)];

    const fallbackMsg: InterventionMessage = {
      type: 'intervention',
      v: 1,
      request_id: requestId,
      text,
      cue: cue as any,
      severity: context.hp < 50 ? 'WARNING' : 'NUDGE',
      source: 'canned',
    };

    if (this.onInterventionReceived) {
      this.onInterventionReceived(fallbackMsg);
    }
  }
}

export const wsClient = new WebSocketClient();
