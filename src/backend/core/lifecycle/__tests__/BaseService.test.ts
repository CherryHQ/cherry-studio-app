import { AppState } from 'react-native';

import { BaseService } from '../BaseService';
import { Injectable } from '../decorators';
import { Emitter } from '../event';
import { type Activatable, LifecycleState } from '../types';

jest.mock('@logger', () => ({
  loggerService: {
    withContext: () => ({ debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
  },
}));

@Injectable('Recorder')
class Recorder extends BaseService {
  readonly calls: string[] = [];

  protected onInit(): void {
    this.calls.push('onInit');
  }

  protected onReady(): void {
    this.calls.push('onReady');
  }

  protected onAllReady(): void {
    this.calls.push('onAllReady');
  }

  protected onStop(): void {
    this.calls.push('onStop');
  }

  protected onDestroy(): void {
    this.calls.push('onDestroy');
  }

  track(cleanup: () => void): void {
    this.registerDisposable(cleanup);
  }

  trackInterval(callback: () => void, ms: number): void {
    this.registerInterval(callback, ms);
  }

  trackAppState(listener: () => void): void {
    this.registerAppStateListener(listener);
  }
}

describe('BaseService lifecycle', () => {
  it('runs onInit then onReady and lands in Ready', async () => {
    const service = new Recorder();
    expect(service.state).toBe(LifecycleState.Created);

    await service._doInit();

    expect(service.calls).toEqual(['onInit', 'onReady']);
    expect(service.isReady).toBe(true);
  });

  it('runs onAllReady at most once', async () => {
    const service = new Recorder();
    await service._doInit();

    await service._doAllReady();
    await service._doAllReady();

    expect(service.calls.filter((call) => call === 'onAllReady')).toHaveLength(1);
  });

  it('stops then destroys', async () => {
    const service = new Recorder();
    await service._doInit();

    await service._doStop();
    expect(service.isStopped).toBe(true);

    await service._doDestroy();
    expect(service.isDestroyed).toBe(true);
    expect(service.calls).toEqual(['onInit', 'onReady', 'onStop', 'onDestroy']);
  });

  it('ignores a repeated destroy', async () => {
    const service = new Recorder();
    await service._doInit();
    await service._doDestroy();
    await service._doDestroy();

    expect(service.calls.filter((call) => call === 'onDestroy')).toHaveLength(1);
  });
});

describe('BaseService disposables', () => {
  it('releases registered cleanups after onStop', async () => {
    const service = new Recorder();
    const cleanup = jest.fn();
    service.track(cleanup);

    await service._doInit();
    expect(cleanup).not.toHaveBeenCalled();

    await service._doStop();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('releases them even when onStop throws', async () => {
    @Injectable('Exploding')
    class Exploding extends BaseService {
      protected onStop(): void {
        throw new Error('boom');
      }

      track(cleanup: () => void): void {
        this.registerDisposable(cleanup);
      }
    }

    const service = new Exploding();
    const cleanup = jest.fn();
    service.track(cleanup);

    await expect(service._doStop()).rejects.toThrow('boom');
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('keeps releasing after one disposable throws', async () => {
    const service = new Recorder();
    const survivor = jest.fn();
    service.track(() => {
      throw new Error('bad cleanup');
    });
    service.track(survivor);

    await service._doStop();

    expect(survivor).toHaveBeenCalledTimes(1);
  });

  it('clears an interval on stop', async () => {
    jest.useFakeTimers();
    const service = new Recorder();
    const tick = jest.fn();
    service.trackInterval(tick, 1000);

    jest.advanceTimersByTime(2000);
    expect(tick).toHaveBeenCalledTimes(2);

    await service._doStop();
    jest.advanceTimersByTime(5000);
    expect(tick).toHaveBeenCalledTimes(2);

    jest.useRealTimers();
  });

  it('removes an AppState subscription on stop', async () => {
    const remove = jest.fn();
    const addEventListener = jest
      .spyOn(AppState, 'addEventListener')
      .mockReturnValue({ remove } as never);

    const service = new Recorder();
    service.trackAppState(jest.fn());
    expect(addEventListener).toHaveBeenCalledWith('change', expect.any(Function));

    await service._doStop();
    expect(remove).toHaveBeenCalledTimes(1);

    addEventListener.mockRestore();
  });

  it('disposes an Emitter registered as a disposable', async () => {
    const service = new Recorder();
    const emitter = new Emitter<string>();
    service.track(() => emitter.dispose());

    await service._doStop();

    expect(emitter.isDisposed).toBe(true);
  });
});

describe('BaseService destroy under an in-flight stop', () => {
  it('skips destroy so it cannot tear down resources live work still uses', async () => {
    let releaseStop: (() => void) | undefined;

    @Injectable('SlowStop')
    class SlowStop extends BaseService {
      destroyed = false;

      protected onStop(): Promise<void> {
        return new Promise<void>((resolve) => {
          releaseStop = resolve;
        });
      }

      protected onDestroy(): void {
        this.destroyed = true;
      }
    }

    const service = new SlowStop();
    const stopping = service._doStop();
    await Promise.resolve();

    await service._doDestroy();
    expect(service.destroyed).toBe(false);
    expect(service.state).not.toBe(LifecycleState.Destroyed);

    releaseStop?.();
    await stopping;

    // Once the stop settles, destroy is allowed again.
    await service._doDestroy();
    expect(service.destroyed).toBe(true);
  });

  it('still destroys after a rejected stop, which has already settled and released', async () => {
    @Injectable('RejectingStop')
    class RejectingStop extends BaseService {
      destroyed = false;

      protected onStop(): Promise<void> {
        return Promise.reject(new Error('stop failed'));
      }

      protected onDestroy(): void {
        this.destroyed = true;
      }
    }

    const service = new RejectingStop();
    await expect(service._doStop()).rejects.toThrow('stop failed');

    await service._doDestroy();

    expect(service.destroyed).toBe(true);
  });
});

describe('BaseService activation', () => {
  @Injectable('Heavy')
  class Heavy extends BaseService implements Activatable {
    activations = 0;
    deactivations = 0;

    onActivate(): void {
      this.activations += 1;
    }

    onDeactivate(): void {
      this.deactivations += 1;
    }
  }

  it('activates only when Ready and is idempotent', async () => {
    const service = new Heavy();

    expect(await service._doActivate()).toBe(false);

    await service._doInit();
    expect(await service._doActivate()).toBe(true);
    await service._doActivate();

    expect(service.activations).toBe(1);
    expect(service.isActivated).toBe(true);
  });

  it('auto-deactivates on stop', async () => {
    const service = new Heavy();
    await service._doInit();
    await service._doActivate();

    await service._doStop();

    expect(service.deactivations).toBe(1);
    expect(service.isActivated).toBe(false);
  });

  it('waits for an in-progress activation and deactivates it before stopping', async () => {
    let finishActivation!: () => void;
    let markActivationStarted!: () => void;
    const activationStarted = new Promise<void>((resolve) => {
      markActivationStarted = resolve;
    });
    const activationGate = new Promise<void>((resolve) => {
      finishActivation = resolve;
    });

    @Injectable('SlowActivation')
    class SlowActivation extends BaseService implements Activatable {
      readonly calls: string[] = [];

      async onActivate(): Promise<void> {
        this.calls.push('activate:start');
        markActivationStarted();
        await activationGate;
        this.calls.push('activate:end');
      }

      onDeactivate(): void {
        this.calls.push('deactivate');
      }

      protected onStop(): void {
        this.calls.push('stop');
      }
    }

    const service = new SlowActivation();
    await service._doInit();
    const activation = service._doActivate();
    await activationStarted;

    let stopSettled = false;
    const stopping = service._doStop().then(() => {
      stopSettled = true;
    });
    await Promise.resolve();
    expect(stopSettled).toBe(false);

    finishActivation();
    await Promise.all([activation, stopping]);

    expect(service.calls).toEqual(['activate:start', 'activate:end', 'deactivate', 'stop']);
    expect(service.isActivated).toBe(false);
  });

  it('does not re-enter deactivation when a change arrives during stop', async () => {
    let finishDeactivation!: () => void;
    let markDeactivationStarted!: () => void;
    const deactivationStarted = new Promise<void>((resolve) => {
      markDeactivationStarted = resolve;
    });
    const deactivationGate = new Promise<void>((resolve) => {
      finishDeactivation = resolve;
    });

    @Injectable('SlowDeactivation')
    class SlowDeactivation extends BaseService implements Activatable {
      deactivations = 0;

      onActivate(): void {}

      async onDeactivate(): Promise<void> {
        this.deactivations += 1;
        markDeactivationStarted();
        await deactivationGate;
      }
    }

    const service = new SlowDeactivation();
    await service._doInit();
    await service._doActivate();

    const stopping = service._doStop();
    await deactivationStarted;
    const lateDeactivation = service._doDeactivate();
    await Promise.resolve();

    expect(service.deactivations).toBe(1);
    finishDeactivation();
    await Promise.all([stopping, lateDeactivation]);
    expect(service.deactivations).toBe(1);
  });

  it('reports false for a service that is not activatable', async () => {
    const service = new Recorder();
    await service._doInit();

    expect(await service._doActivate()).toBe(false);
    expect(service.isActivated).toBe(false);
  });
});
