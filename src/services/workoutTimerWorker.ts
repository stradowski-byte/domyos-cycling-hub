/**
 * Web Worker + Wall-Clock Delta Timer (`Date.now()`) for Workout Mode.
 * Prevents Android Chrome background tab throttling when switching to Spotify/messages
 * during a workout and guarantees accurate 1Hz FTMS ramp execution.
 */
export class AccurateWorkoutTimer {
  private worker: Worker | null = null;
  private fallbackIntervalId: number | null = null;
  private lastTickMs: number = 0;
  private accumulatedMs: number = 0;
  private running: boolean = false;

  public start(onSecondTick: (secondsDelta: number) => void): void {
    this.stop();
    this.running = true;
    this.lastTickMs = Date.now();
    this.accumulatedMs = 0;

    const handleCheck = () => {
      if (!this.running) return;
      const now = Date.now();
      const deltaMs = Math.max(0, now - this.lastTickMs);
      this.lastTickMs = now;
      this.accumulatedMs += deltaMs;

      if (this.accumulatedMs >= 1000) {
        const wholeSeconds = Math.min(30, Math.floor(this.accumulatedMs / 1000));
        this.accumulatedMs -= wholeSeconds * 1000;
        if (wholeSeconds > 0) {
          onSecondTick(wholeSeconds);
        }
      }
    };

    try {
      const workerCode = `
        let timer = null;
        self.onmessage = function(e) {
          if (e.data === 'start') {
            if (timer) clearInterval(timer);
            timer = setInterval(function() {
              self.postMessage('tick');
            }, 250);
          } else if (e.data === 'stop') {
            if (timer) clearInterval(timer);
            timer = null;
          }
        };
      `;
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      this.worker = new Worker(url);
      this.worker.onmessage = () => handleCheck();
      this.worker.postMessage('start');
    } catch {
      this.fallbackIntervalId = window.setInterval(handleCheck, 250);
    }
  }

  public stop(): void {
    this.running = false;
    if (this.worker) {
      try {
        this.worker.postMessage('stop');
        this.worker.terminate();
      } catch {
        // ignore
      }
      this.worker = null;
    }
    if (this.fallbackIntervalId !== null) {
      window.clearInterval(this.fallbackIntervalId);
      this.fallbackIntervalId = null;
    }
  }
}
