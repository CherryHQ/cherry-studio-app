import { BaseService } from '../../lifecycle/BaseService';
import { DependsOn, Injectable, ServicePhase } from '../../lifecycle/decorators';
import { SERVICE_TEARDOWN_TIMEOUT_MS } from '../../lifecycle/LifecycleManager';
import { Phase } from '../../lifecycle/types';
import { application } from '../Application';
import { ApplicationHost } from '../ApplicationHost';

jest.mock('@logger', () => ({
  loggerService: {
    withContext: () => ({ debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
  },
}));

let journal: string[] = [];

@Injectable('Connection')
class Connection extends BaseService {
  open = false;

  protected onInit(): void {
    this.open = true;
    journal.push('Connection:open');
  }

  protected onStop(): void {
    this.open = false;
    journal.push('Connection:close');
  }
}

@Injectable('LateWork')
@ServicePhase(Phase.PostReady)
class LateWork extends BaseService {
  protected onInit(): void {
    journal.push('LateWork:init');
  }
}

@Injectable('ResolveOnStop')
@DependsOn(['Connection'])
class ResolveOnStop extends BaseService {
  constructor(_connection: Connection) {
    super();
  }

  protected onStop(): void {
    const connection = application.get('Connection' as never) as Connection;
    journal.push(`ResolveOnStop:${connection.open ? 'open' : 'closed'}`);
  }
}

/** Resolves only when the test releases it, so overlap is observable. */
class SlowClose extends BaseService {
  static release: (() => void) | undefined;

  protected onStop(): Promise<void> {
    journal.push('SlowClose:closing');
    return new Promise<void>((resolve) => {
      SlowClose.release = () => {
        journal.push('SlowClose:closed');
        resolve();
      };
    });
  }
}
Injectable('SlowClose')(SlowClose);

beforeEach(() => {
  journal = [];
  SlowClose.release = undefined;
});

afterEach(async () => {
  await application.uninstall();
});

describe('ApplicationHost construction', () => {
  it('claims nothing until start', async () => {
    const host = new ApplicationHost({ services: [Connection] });

    expect(host.state).toBe('created');
    expect(host.container.peek('Connection')).toBeUndefined();
    expect(journal).toEqual([]);

    await host.start();

    expect(host.state).toBe('ready');
    expect(host.container.peek<Connection>('Connection')?.open).toBe(true);
  });

  it('refuses to start twice', async () => {
    const host = new ApplicationHost({ services: [Connection] });
    await host.start();

    await expect(host.start()).rejects.toThrow(/Cannot start a host in state 'ready'/);
  });

  it('leaves post-ready services alone until runPostReady', async () => {
    const host = new ApplicationHost({ services: [Connection, LateWork] });

    await host.start();
    expect(journal).toEqual(['Connection:open']);

    host.runPostReady();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(journal).toEqual(['Connection:open', 'LateWork:init']);
    await host.dispose();
  });

  it('waits for in-progress post-ready initialization before stopping it', async () => {
    let finishInitialization!: () => void;
    let markInitializationStarted!: () => void;
    const initializationStarted = new Promise<void>((resolve) => {
      markInitializationStarted = resolve;
    });
    const initializationGate = new Promise<void>((resolve) => {
      finishInitialization = resolve;
    });

    @Injectable('SlowPostReady')
    @ServicePhase(Phase.PostReady)
    class SlowPostReady extends BaseService {
      protected async onInit(): Promise<void> {
        journal.push('SlowPostReady:init-started');
        markInitializationStarted();
        await initializationGate;
        journal.push('SlowPostReady:init-finished');
      }

      protected onStop(): void {
        journal.push('SlowPostReady:stop');
      }
    }

    const host = new ApplicationHost({ services: [SlowPostReady] });
    await host.start();
    host.runPostReady();
    await initializationStarted;

    let disposalSettled = false;
    const disposal = host.dispose().then((summary) => {
      disposalSettled = true;
      return summary;
    });
    await Promise.resolve();
    const settledBeforeInitialization = disposalSettled;

    finishInitialization();
    await disposal;

    expect(settledBeforeInitialization).toBe(false);
    expect(journal).toEqual([
      'SlowPostReady:init-started',
      'SlowPostReady:init-finished',
      'SlowPostReady:stop',
    ]);
  });

  it('continues disposal and a queued install when post-ready never settles', async () => {
    jest.useFakeTimers();
    try {
      let markInitializationStarted!: () => void;
      const initializationStarted = new Promise<void>((resolve) => {
        markInitializationStarted = resolve;
      });

      @Injectable('NeverPostReady')
      @ServicePhase(Phase.PostReady)
      class NeverPostReady extends BaseService {
        protected async onInit(): Promise<void> {
          journal.push('NeverPostReady:init');
          markInitializationStarted();
          await new Promise<void>(() => {});
        }
      }

      const outgoing = new ApplicationHost({ services: [Connection, NeverPostReady] });
      await application.install(outgoing);
      outgoing.runPostReady();
      await initializationStarted;

      const incoming = new ApplicationHost({ services: [Connection] });
      const replacing = application.install(incoming);
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(SERVICE_TEARDOWN_TIMEOUT_MS);
      await expect(replacing).resolves.toBeUndefined();

      expect(outgoing.state).toBe('disposed');
      expect(incoming.state).toBe('ready');
      expect(journal).toEqual([
        'Connection:open',
        'NeverPostReady:init',
        'Connection:close',
        'Connection:open',
      ]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('shares one promise across repeated disposals', async () => {
    const host = new ApplicationHost({ services: [Connection] });
    await host.start();

    const first = host.dispose();
    const second = host.dispose();

    expect(first).toBe(second);
    await first;
    expect(host.state).toBe('disposed');
    expect(journal.filter((entry) => entry === 'Connection:close')).toHaveLength(1);
  });

  it('passes overrides through to consumers without managing them', async () => {
    const fake = { open: true } as Connection;
    const host = new ApplicationHost({
      overrides: { Connection: fake },
      services: [Connection],
    });

    await host.start();

    expect(host.container.get('Connection')).toBe(fake);
    // The fake never received onInit, so nothing was journalled for it.
    expect(journal).toEqual([]);
  });
});

describe('application.get', () => {
  it('throws when no host is installed', () => {
    expect(() => application.get('Connection' as never)).toThrow(/no ApplicationHost is installed/);
  });

  it('resolves from the installed host', async () => {
    await application.install(new ApplicationHost({ services: [Connection] }));

    expect(application.get('Connection' as never)).toBeInstanceOf(Connection);
  });

  it('throws again after uninstall', async () => {
    await application.install(new ApplicationHost({ services: [Connection] }));
    await application.uninstall();

    expect(() => application.get('Connection' as never)).toThrow(/no ApplicationHost is installed/);
    expect(application.hasHost).toBe(false);
  });
});

describe('application.install', () => {
  it('resolves services from inside a starting service', async () => {
    // The real case is `DbService.onInit` seeding through data-service module
    // singletons, which reach `DbService` via `application`. If the host were
    // only installed after `start()` resolved, first launch would throw.
    let resolvedDuringInit: unknown;

    @Injectable('SelfResolving')
    class SelfResolving extends BaseService {
      protected onInit(): void {
        resolvedDuringInit = application.get('Connection' as never);
      }
    }

    await application.install(
      new ApplicationHost({ services: [Connection, SelfResolving] as never }),
    );

    expect(resolvedDuringInit).toBeInstanceOf(Connection);
  });

  it('installs nothing when the incoming host fails to start', async () => {
    @Injectable('Exploding')
    class Exploding extends BaseService {
      protected onInit(): void {
        throw new Error('cannot start');
      }
    }

    await expect(
      application.install(new ApplicationHost({ services: [Exploding] as never })),
    ).rejects.toThrow(/cannot start/);

    // A half-started graph must not stay reachable behind `get()`.
    expect(application.hasHost).toBe(false);
  });

  it('disposes the outgoing host before starting the incoming one', async () => {
    await application.install(new ApplicationHost({ services: [SlowClose] }));

    const incoming = new ApplicationHost({ services: [Connection] });
    const installing = application.install(incoming);
    await new Promise((resolve) => setTimeout(resolve, 0));

    // The replacement must not have opened anything while the old host is
    // still closing — that overlap is what would let two generations hold the
    // same SQLite connection or job claim.
    expect(journal).toEqual(['SlowClose:closing']);
    expect(incoming.state).toBe('created');

    SlowClose.release?.();
    await installing;

    expect(journal).toEqual(['SlowClose:closing', 'SlowClose:closed', 'Connection:open']);
    expect(incoming.state).toBe('ready');
  });

  it('serializes concurrent installs', async () => {
    const first = new ApplicationHost({ services: [Connection] });
    const second = new ApplicationHost({ services: [Connection] });

    await Promise.all([application.install(first), application.install(second)]);

    expect(application.current).toBe(second);
    expect(first.state).toBe('disposed');
    expect(journal).toEqual(['Connection:open', 'Connection:close', 'Connection:open']);
  });

  it('installs no host when startup fails', async () => {
    @Injectable('FailsToStart')
    class FailsToStart extends BaseService {
      protected onInit(): void {
        throw new Error('migration failed');
      }
    }

    await expect(
      application.install(new ApplicationHost({ services: [FailsToStart] })),
    ).rejects.toThrow(/migration failed/);

    expect(application.hasHost).toBe(false);
  });

  it('keeps accepting installs after a failed one', async () => {
    @Injectable('AlsoFails')
    class AlsoFails extends BaseService {
      protected onInit(): void {
        throw new Error('nope');
      }
    }

    await expect(
      application.install(new ApplicationHost({ services: [AlsoFails] })),
    ).rejects.toThrow();

    await application.install(new ApplicationHost({ services: [Connection] }));

    expect(application.get('Connection' as never)).toBeInstanceOf(Connection);
  });
});

describe('application.uninstall', () => {
  it('reports a clean teardown', async () => {
    await application.install(new ApplicationHost({ services: [Connection] }));

    expect(await application.uninstall()).toEqual({ failed: [], timedOut: [] });
  });

  it('is safe with no host installed', async () => {
    expect(await application.uninstall()).toEqual({ failed: [], timedOut: [] });
  });

  it('leaves a replacement alone when an old runtime uninstalls out of order', async () => {
    const outgoing = new ApplicationHost({ services: [Connection] });
    const incoming = new ApplicationHost({ services: [Connection] });
    await application.install(outgoing);

    const replacing = application.install(incoming);
    const staleCleanup = application.uninstall(outgoing);
    await Promise.all([replacing, staleCleanup]);

    expect(application.current).toBe(incoming);
    expect(incoming.state).toBe('ready');
  });

  it('keeps the outgoing host resolvable while its services stop', async () => {
    await application.install(
      new ApplicationHost({ services: [Connection, ResolveOnStop] as never }),
    );

    await application.uninstall();

    expect(journal).toEqual(['Connection:open', 'ResolveOnStop:open', 'Connection:close']);
  });
});
