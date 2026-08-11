import { BaseService } from '../BaseService';
import { DependsOn, Injectable, Priority, ServicePhase } from '../decorators';
import { ServiceContainer } from '../ServiceContainer';
import { Phase } from '../types';

const mockLoggerWarn = jest.fn();

jest.mock('@logger', () => ({
  loggerService: {
    withContext: () => ({
      debug: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      warn: (...args: unknown[]) => mockLoggerWarn(...args),
    }),
  },
}));

@Injectable('Database')
class Database extends BaseService {
  readonly rows: string[] = [];
}

@Injectable('Chat')
@DependsOn(['Database'])
class Chat extends BaseService {
  constructor(readonly database: Database) {
    super();
  }
}

@Injectable('Sneaky')
class Sneaky extends BaseService {
  resolved: Database | null = null;

  constructor(private readonly container: ServiceContainer) {
    super();
  }

  protected onInit(): void {
    // Resolving something it never declared — legal at runtime, reportable here.
    this.resolved = this.container.get<Database>('Database');
  }
}

beforeEach(() => {
  mockLoggerWarn.mockClear();
});

describe('ServiceContainer resolution', () => {
  it('returns the same instance on every resolution', () => {
    const container = new ServiceContainer();
    container.register(Database);

    expect(container.get('Database')).toBe(container.get('Database'));
  });

  it('injects declared dependencies through the constructor', () => {
    const container = new ServiceContainer();
    container.registerAll([Database, Chat]);

    const chat = container.get<Chat>('Chat');

    expect(chat.database).toBe(container.get('Database'));
  });

  it('throws for an unregistered service', () => {
    expect(() => new ServiceContainer().get('Missing')).toThrow(/not registered/);
  });

  it('names the dependent when a declared dependency is missing', () => {
    const container = new ServiceContainer();
    container.register(Chat);

    expect(() => container.get('Chat')).toThrow(/'Database'.+'Chat'/);
  });

  it('does not construct anything until first resolution', () => {
    const container = new ServiceContainer();
    container.register(Database);

    expect(container.peek('Database')).toBeUndefined();
    container.get('Database');
    expect(container.peek('Database')).toBeDefined();
  });

  it('reads metadata from decorators', () => {
    const container = new ServiceContainer();
    container.registerAll([Database, Chat]);

    expect(container.getMetadata('Chat')).toEqual({
      appStatePolicy: 'not-applicable',
      dependencies: ['Database'],
      errorStrategy: 'fail-fast',
      name: 'Chat',
      phase: Phase.Gate,
      priority: 100,
    });
  });

  it('ignores a duplicate registration rather than replacing the first', () => {
    const container = new ServiceContainer();
    container.register(Database);
    const first = container.get('Database');

    container.register(Database);

    expect(container.get('Database')).toBe(first);
    expect(mockLoggerWarn).toHaveBeenCalledWith(expect.stringContaining('already registered'));
  });
});

describe('ServiceContainer overrides', () => {
  it('returns the override instead of constructing the real service', () => {
    const fake = { rows: ['fake'] };
    const container = new ServiceContainer({ Database: fake });
    container.register(Database);

    expect(container.get('Database')).toBe(fake);
  });

  it('injects an override into a dependent', () => {
    const fake = { rows: ['fake'] };
    const container = new ServiceContainer({ Database: fake });
    container.registerAll([Database, Chat]);

    expect(container.get<Chat>('Chat').database).toBe(fake);
  });

  it('excludes overridden services from lifecycle management', () => {
    // A duck-typed fake does not extend BaseService, so driving it through
    // init/stop would crash. It is the test's own responsibility.
    const container = new ServiceContainer({ Database: { rows: [] } });
    container.registerAll([Database, Chat]);

    expect(container.getManagedNames()).toEqual(['Chat']);
    expect(container.buildDependencyGraph().map((n) => n.name)).toEqual(['Chat']);
    expect(container.isOverridden('Database')).toBe(true);
  });

  it('reports an override as present', () => {
    const container = new ServiceContainer({ Database: { rows: [] } });

    expect(container.has('Database')).toBe(true);
  });
});

describe('ServiceContainer undeclared dependency detection', () => {
  it('warns when a service resolves something it did not declare during init', async () => {
    const container = new ServiceContainer();
    container.register(Database);
    container.register(Sneaky);
    // Sneaky takes the container itself, which is not a registered service.
    const sneaky = new Sneaky(container);

    container.beginInitWindow('Sneaky');
    await sneaky._doInit();
    container.endInitWindow();

    expect(sneaky.resolved).toBeDefined();
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.stringContaining("resolved 'Database' during initialization without declaring it"),
    );
  });

  it('stays quiet for a declared dependency', () => {
    const container = new ServiceContainer();
    container.registerAll([Database, Chat]);

    container.beginInitWindow('Chat');
    container.get('Database');
    container.endInitWindow();

    expect(mockLoggerWarn).not.toHaveBeenCalled();
  });

  it('stays quiet for constructor injection of a transitive dependency', () => {
    // Constructing Chat resolves Database. That is declared ordering, not an
    // escape, and must not be reported while Chat's own init window is open.
    const container = new ServiceContainer();
    container.registerAll([Database, Chat]);

    container.beginInitWindow('Chat');
    container.get('Chat');
    container.endInitWindow();

    expect(mockLoggerWarn).not.toHaveBeenCalled();
  });

  it('stays quiet outside an init window', () => {
    const container = new ServiceContainer();
    container.registerAll([Database, Chat]);

    container.get('Database');

    expect(mockLoggerWarn).not.toHaveBeenCalled();
  });
});

describe('ServiceContainer dependency graph', () => {
  @Injectable('LateService')
  @ServicePhase(Phase.PostReady)
  @Priority(5)
  class LateService extends BaseService {}

  it('filters by phase and carries decorator metadata into nodes', () => {
    const container = new ServiceContainer();
    container.registerAll([Database, LateService]);

    expect(container.buildDependencyGraph(Phase.PostReady)).toEqual([
      { dependencies: [], name: 'LateService', phase: Phase.PostReady, priority: 5 },
    ]);
    expect(container.buildDependencyGraph(Phase.Gate).map((n) => n.name)).toEqual(['Database']);
  });

  it('applies a phase update', () => {
    const container = new ServiceContainer();
    container.register(LateService);

    container.updatePhase('LateService', Phase.Gate);

    expect(container.getMetadata('LateService')?.phase).toBe(Phase.Gate);
  });
});
