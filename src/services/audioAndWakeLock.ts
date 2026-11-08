/**
 * Web Audio API synthesizer for interval countdown cues (3-2-1-GO!)
 * Does not interrupt Spotify or background audio on mobile devices.
 */
class WorkoutAudioAndWakeLockService {
  private audioCtx: AudioContext | null = null;
  private wakeLockSentinel: any = null;
  private soundEnabled: boolean = true;

  public setSoundEnabled(enabled: boolean) {
    this.soundEnabled = enabled;
  }

  public isSoundEnabled(): boolean {
    return this.soundEnabled;
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioCtx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.audioCtx = new AudioCtx();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  /**
   * Plays short countdown beep (at 3s, 2s, 1s remaining) or high transition tone (at 0s / new block)
   */
  public playCountdownBeep(secondsRemaining: number) {
    if (!this.soundEnabled) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      if (secondsRemaining > 0) {
        // 3, 2, 1 short tactical beep (880 Hz)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc.start(now);
        osc.stop(now + 0.15);
      } else {
        // 0s — New interval transition tone (1320 Hz -> 1760 Hz)
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1320, now);
        osc.frequency.setValueAtTime(1760, now + 0.12);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
        osc.start(now);
        osc.stop(now + 0.38);
      }
    } catch {
      // ignore audio errors
    }
  }

  public async requestWakeLock(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
      return false;
    }
    try {
      this.wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
      return true;
    } catch {
      return false;
    }
  }

  public async releaseWakeLock(): Promise<void> {
    try {
      if (this.wakeLockSentinel) {
        await this.wakeLockSentinel.release();
        this.wakeLockSentinel = null;
      }
    } catch {
      // ignore
    }
  }

  public isWakeLockActive(): boolean {
    return !!this.wakeLockSentinel && !this.wakeLockSentinel.released;
  }
}

export const audioAndWakeLock = new WorkoutAudioAndWakeLockService();
