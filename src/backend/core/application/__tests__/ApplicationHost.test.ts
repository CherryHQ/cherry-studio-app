import { BaseService } from '../../lifecycle/BaseService';
import { Injectable, ServicePhase } from '../../lifecycle/decorators';
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
});
