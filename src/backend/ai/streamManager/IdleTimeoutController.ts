export interface IdleTimeoutHandle {
  cleanup(): void;
  reset(durationMs?: number): void;
}

export class IdleTimeoutController implements IdleTimeoutHandle {
  private readonly controller = new AbortController();
  private timerId: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly timeoutMs: number) {
    this.startTimer(timeoutMs);
  }

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  reset = (durationMs = this.timeoutMs): void => {
    if (this.controller.signal.aborted) return;
    this.clearTimer();
    this.startTimer(durationMs);
  };

  cleanup = (): void => {
    this.clearTimer();
  };

  private startTimer(durationMs: number): void {
    this.timerId = setTimeout(() => {
      this.controller.abort(new DOMException('Idle timeout exceeded', 'TimeoutError'));
    }, durationMs);
  }

  private clearTimer(): void {
    if (this.timerId !== undefined) {
      clearTimeout(this.timerId);
      this.timerId = undefined;
    }
  }
}
