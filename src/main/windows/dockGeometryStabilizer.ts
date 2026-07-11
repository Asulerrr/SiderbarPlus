export interface DockGeometryTarget {
  isAtExpectedBounds: () => boolean;
  applyExpectedBounds: () => void;
  finish: () => void;
}

export interface DockGeometryClock {
  now: () => number;
  schedule: (callback: () => void, delayMs: number) => unknown;
  cancel: (handle: unknown) => void;
}

export interface DockGeometryStabilizerOptions {
  pollIntervalMs: number;
  minimumHiddenMs: number;
  quietPeriodMs: number;
  maximumHiddenMs: number;
}

const DEFAULT_OPTIONS: DockGeometryStabilizerOptions = {
  pollIntervalMs: 16,
  minimumHiddenMs: 160,
  quietPeriodMs: 64,
  maximumHiddenMs: 500
};

const DEFAULT_CLOCK: DockGeometryClock = {
  now: Date.now,
  schedule: (callback, delayMs) => setTimeout(callback, delayMs),
  cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)
};

/** Keeps geometry corrections hidden and ignores callbacks from superseded relocations. */
export class DockGeometryStabilizer {
  private generation = 0;
  private timer: unknown = null;
  private readonly options: DockGeometryStabilizerOptions;
  private readonly clock: DockGeometryClock;

  constructor(
    options: DockGeometryStabilizerOptions = DEFAULT_OPTIONS,
    clock: DockGeometryClock = DEFAULT_CLOCK
  ) {
    this.options = options;
    this.clock = clock;
  }

  start(target: DockGeometryTarget): number {
    this.cancelTimer();
    const generation = ++this.generation;
    const startedAt = this.clock.now();
    let stableSince = startedAt;

    target.applyExpectedBounds();

    const poll = (): void => {
      if (generation !== this.generation) return;

      const now = this.clock.now();
      if (!target.isAtExpectedBounds()) {
        target.applyExpectedBounds();
        stableSince = now;
      }

      const hiddenLongEnough = now - startedAt >= this.options.minimumHiddenMs;
      const quietLongEnough = now - stableSince >= this.options.quietPeriodMs;
      const timedOut = now - startedAt >= this.options.maximumHiddenMs;

      if ((hiddenLongEnough && quietLongEnough) || timedOut) {
        this.timer = null;
        target.applyExpectedBounds();
        if (generation === this.generation) {
          target.finish();
        }
        return;
      }

      this.timer = this.clock.schedule(poll, this.options.pollIntervalMs);
    };

    this.timer = this.clock.schedule(poll, this.options.pollIntervalMs);
    return generation;
  }

  cancel(): void {
    this.cancelTimer();
    ++this.generation;
  }

  private cancelTimer(): void {
    if (this.timer !== null) {
      this.clock.cancel(this.timer);
      this.timer = null;
    }
  }
}
