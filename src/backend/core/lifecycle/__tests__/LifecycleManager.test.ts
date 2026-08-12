import { BaseService } from '../BaseService';
import { DependsOn, ErrorHandling, Injectable, ServicePhase } from '../decorators';
import { LifecycleManager, SERVICE_TEARDOWN_TIMEOUT_MS } from '../LifecycleManager';
import { ServiceContainer } from '../ServiceContainer';
import { Phase, ServiceInitError } from '../types';

jest.mock('@logger', () => ({
  loggerService: {
    withContext: () => ({ debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
  },
}));

/** Shared across service instances within one test, so ordering is observable. */
let journal: string[] = [];

@Injectable('Storage')
class Storage extends BaseService {
  protected onInit(): void {
    journal.push('Storage:init');
  }

  protected onStop(): void {
    journal.push('Storage:stop');
  }

  protected onDestroy(): void {
    journal.push('Storage:destroy');
  }
}

@Injectable('Writer')
@DependsOn(['Storage'])
class Writer extends BaseService {
  constructor(readonly storage: Storage) {
    super();
  }

  protected onInit(): void {
    journal.push('Writer:init');
  }

  protected onStop(): void {
    journal.push('Writer:stop');
  }

  protected onDestroy(): void {
    journal.push('Writer:destroy');
  }
}

@Injectable('Reporter')
@ServicePhase(Phase.PostReady)
class Reporter extends BaseService {
  protected onInit(): void {
    journal.push('Reporter:init');
  }

  protected onAllReady(): void {
    journal.push('Reporter:allReady');
  }
}

const build = (services: readonly (new (...args: never[]) => BaseService)[]) => {
  const container = new ServiceContainer();
  container.registerAll(services);
  return { container, manager: new LifecycleManager(container) };
};

beforeEach(() => {
  journal = [];
});

describe('LifecycleManager.startPhase', () => {
  it('initializes dependencies before dependents', async () => {
    const { manager } = build([Writer, Storage]);

    await manager.startPhase(Phase.Gate);

    expect(journal).toEqual(['Storage:init', 'Writer:init']);
  });

  it('only starts services belonging to the phase', async () => {
    const { manager } = build([Storage, Reporter]);

    await manager.startPhase(Phase.Gate);
    expect(journal).toEqual(['Storage:init']);

    await manager.startPhase(Phase.PostReady);
    expect(journal).toEqual(['Storage:init', 'Reporter:init']);
  });

  it('runs peers in the same layer concurrently', async () => {
    const started: string[] = [];
    const makeSlowPeer = (name: string) => {
      @Injectable(name)
      class Peer extends BaseService {
        protected async onInit(): Promise<void> {
          started.push(`${name}:enter`);
          await new Promise((resolve) => setTimeout(resolve, 0));
          started.push(`${name}:exit`);
        }
      }
      return Peer;
    };

    const { manager } = build([makeSlowPeer('PeerA'), makeSlowPeer('PeerB')]);

    await manager.startPhase(Phase.Gate);

    // Both enter before either exits — sequential execution would interleave
    // as enter/exit/enter/exit.
    expect(started).toEqual(['PeerA:enter', 'PeerB:enter', 'PeerA:exit', 'PeerB:exit']);
  });

  it('aborts the phase when a fail-fast service throws', async () => {
    @Injectable('Broken')
    class Broken extends BaseService {
      protected onInit(): void {
        throw new Error('cannot open database');
      }
    }

    const { manager } = build([Broken]);

    await expect(manager.startPhase(Phase.Gate)).rejects.toThrow(ServiceInitError);
    await expect(manager.startPhase(Phase.Gate)).rejects.toThrow(/cannot open database/);
  });

  it('continues past a graceful failure', async () => {
    @Injectable('BestEffort')
    @ErrorHandling('graceful')
    class BestEffort extends BaseService {
      protected onInit(): void {
        throw new Error('optional warmup failed');
      }
    }

    const { manager } = build([BestEffort, Storage]);

    await expect(manager.startPhase(Phase.Gate)).resolves.toBeUndefined();
    expect(journal).toEqual(['Storage:init']);
  });

  it('treats post-ready failures as graceful by default', async () => {
    @Injectable('LateBroken')
    @ServicePhase(Phase.PostReady)
    class LateBroken extends BaseService {
      protected onInit(): void {
        throw new Error('prewarm failed');
      }
    }

    const { manager } = build([LateBroken]);

    await expect(manager.startPhase(Phase.PostReady)).resolves.toBeUndefined();
  });

  it('promotes a post-ready service that a gate service depends on', async () => {
    @Injectable('LateDependency')
    @ServicePhase(Phase.PostReady)
    class LateDependency extends BaseService {
      protected onInit(): void {
        journal.push('LateDependency:init');
      }
    }

    @Injectable('GateConsumer')
    @DependsOn(['LateDependency'])
    class GateConsumer extends BaseService {
      constructor(readonly dependency: LateDependency) {
        super();
      }

      protected onInit(): void {
        journal.push('GateConsumer:init');
      }
    }

    const { manager } = build([GateConsumer, LateDependency]);

    await manager.startPhase(Phase.Gate);

    expect(journal).toEqual(['LateDependency:init', 'GateConsumer:init']);
  });
});

describe('LifecycleManager.runAllReady', () => {
  it('runs after every phase and survives a failing hook', async () => {
    @Injectable('NoisyAllReady')
    class NoisyAllReady extends BaseService {
      protected onAllReady(): void {
        throw new Error('scheduling failed');
      }
    }

    const { manager } = build([NoisyAllReady, Reporter]);
    await manager.startPhase(Phase.Gate);
    await manager.startPhase(Phase.PostReady);

    await expect(manager.runAllReady()).resolves.toBeUndefined();
    expect(journal).toContain('Reporter:allReady');
  });
});

describe('LifecycleManager teardown', () => {
  it('stops and destroys in reverse initialization order', async () => {
    const { manager } = build([Writer, Storage]);
    await manager.startPhase(Phase.Gate);
    journal = [];

    const stopped = await manager.stopAll();
    const destroyed = await manager.destroyAll();

    expect(journal).toEqual(['Writer:stop', 'Storage:stop', 'Writer:destroy', 'Storage:destroy']);
    expect(stopped).toEqual({ failed: [], timedOut: [] });
    expect(destroyed).toEqual({ failed: [], timedOut: [] });
  });

  it('records a throwing onStop as failed without stopping the pass', async () => {
    @Injectable('FailingStop')
    class FailingStop extends BaseService {
      protected onStop(): void {
        throw new Error('stop exploded');
      }
    }

    const { manager } = build([FailingStop, Storage]);
    await manager.startPhase(Phase.Gate);
    journal = [];

    const summary = await manager.stopAll();

    expect(summary.failed).toEqual(['FailingStop']);
    expect(journal).toContain('Storage:stop');
  });

  it('abandons a hanging stop at the ceiling and moves on', async () => {
    @Injectable('Hanging')
    class Hanging extends BaseService {
      protected onStop(): Promise<void> {
        return new Promise<void>(() => {});
      }
    }

    const { manager } = build([Hanging, Storage]);
    await manager.startPhase(Phase.Gate);
    journal = [];

    jest.useFakeTimers();
    const stopping = manager.stopAll();
    await jest.advanceTimersByTimeAsync(SERVICE_TEARDOWN_TIMEOUT_MS);
    const summary = await stopping;
    jest.useRealTimers();

    expect(summary.timedOut).toEqual(['Hanging']);
    // The service behind the stuck one still got its turn.
    expect(journal).toContain('Storage:stop');
  });

  it('reports a skipped destroy as failed rather than completed', async () => {
    // `_doDestroy` skips itself while a stop is still in flight, so a resolved
    // promise does not prove the service was destroyed.
    @Injectable('StuckStop')
    class StuckStop extends BaseService {
      protected onStop(): Promise<void> {
        return new Promise<void>(() => {});
      }
    }

    const { manager } = build([StuckStop]);
    await manager.startPhase(Phase.Gate);

    jest.useFakeTimers();
    const stopping = manager.stopAll();
    await jest.advanceTimersByTimeAsync(SERVICE_TEARDOWN_TIMEOUT_MS);
    await stopping;

    const destroying = manager.destroyAll();
    await jest.advanceTimersByTimeAsync(SERVICE_TEARDOWN_TIMEOUT_MS);
    const summary = await destroying;
    jest.useRealTimers();

    expect(summary.failed).toEqual(['StuckStop']);
  });

  it('records per-service initialization timings', async () => {
    const { manager } = build([Storage]);
    await manager.startPhase(Phase.Gate);

    expect(manager.getTimings().has('Storage')).toBe(true);
  });
});
