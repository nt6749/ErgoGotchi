/**
 * Web Audio API Procedural Synthesizer for ErgoGotchi retro sound effects.
 * Zero external audio files required.
 */

class SoundEffectsEngine {
  private ctx: AudioContext | null = null;
  public enabled: boolean = true;

  private initCtx() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public playPet() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    // Sweet cheerful major third chime
    const now = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();

    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(523.25, now); // C5
    osc1.frequency.exponentialRampToValueAtTime(659.25, now + 0.12); // E5

    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

    osc1.connect(gain1);
    gain1.connect(this.ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.25);
  }

  public playRevive() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    // Uplifting victory arpeggio: C5 -> E5 -> G5 -> C6
    const notes = [523.25, 659.25, 783.99, 1046.50];
    const now = this.ctx.currentTime;

    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      const startTime = now + idx * 0.08;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.18, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.35);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.35);
    });
  }

  public playWarning() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    // Gentle two-tone warning nudge
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now); // A4
    osc.frequency.setValueAtTime(370, now + 0.1); // F#4

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.3);
  }

  /** Plays a run of short notes, one after another. */
  private playNotes(notes: number[], step: number, type: OscillatorType, volume: number) {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + idx * step;
      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + step * 2.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + step * 2.2);
    });
  }

  /** Eating corn: quick crunchy nibbles. */
  public playEat() {
    this.playNotes([330, 262, 330, 262, 392], 0.07, 'square', 0.06);
  }

  /** Not enough corn: a short low "nope". */
  public playRefuse() {
    this.playNotes([196, 147], 0.11, 'triangle', 0.12);
  }

  /** Level up: bright rising fanfare. */
  public playLevelUp() {
    this.playNotes([523.25, 659.25, 783.99, 1046.5, 1318.51], 0.09, 'square', 0.07);
  }

  /** Hatching: a few shell taps, then a happy chirp. */
  public playHatch() {
    this.playNotes([180, 220, 180, 260, 880, 1174.66, 1567.98], 0.16, 'triangle', 0.12);
  }

  public playSlouchMelt() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    // Cartoonish squishy slide down
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.35);

    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.35);
  }
}

export const soundEffects = new SoundEffectsEngine();
