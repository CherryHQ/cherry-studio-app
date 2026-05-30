import type { DbService } from '../../DbService';
import type { DatabaseSeeder } from '../types';

jest.mock('@logger', () => ({
  loggerService: {
    withContext: () => ({
      debug: jest.fn(),
      info: jest.fn(),
    }),
  },
}));

jest.mock('@/data/db/schema/appState', () => ({
  appStateTable: {
    description: 'description',
    key: 'key',
    updatedAt: 'updatedAt',
    value: 'value',
  },
}));

const { SeedRunner } = jest.requireActual('../SeedRunner') as typeof import('../SeedRunner');

type JournalRow = {
  description?: string;
  key: string;
  value: unknown;
};
type FakeDbService = DbService & {
  journals: Map<string, JournalRow>;
};

describe('SeedRunner', () => {
  test('runs a new seeder and writes its journal', async () => {
    const dbService = createFakeDbService();
    let runCount = 0;
    const seeder = createSeeder('test-seed', 'v1', async () => {
      runCount += 1;
    });

    await new SeedRunner(dbService).runAll([seeder]);

    expect(runCount).toBe(1);
    expect(dbService.journals.get('seed:test-seed')).toMatchObject({
      description: 'Test seed description',
      key: 'seed:test-seed',
      value: { version: 'v1' },
    });
  });

  test('skips a seeder when the recorded version matches', async () => {
    const dbService = createFakeDbService();
    let runCount = 0;
    const seeder = createSeeder('test-seed', 'v1', async () => {
      runCount += 1;
    });
    const runner = new SeedRunner(dbService);

    await runner.runAll([seeder]);
    await runner.runAll([seeder]);

    expect(runCount).toBe(1);
  });

  test('reruns a seeder when the version changes', async () => {
    const dbService = createFakeDbService();
    let runCount = 0;
    const runner = new SeedRunner(dbService);

    await runner.runAll([
      createSeeder('test-seed', 'v1', async () => {
        runCount += 1;
      }),
    ]);
    await runner.runAll([
      createSeeder('test-seed', 'v2', async () => {
        runCount += 1;
      }),
    ]);

    expect(runCount).toBe(2);
    expect(dbService.journals.get('seed:test-seed')?.value).toEqual({ version: 'v2' });
  });
});

function createSeeder(
  name: string,
  version: string,
  run: (dbService: FakeDbService) => Promise<void>,
): DatabaseSeeder {
  return {
    description: 'Test seed description',
    name,
    run: async (dbService) => run(dbService as FakeDbService),
    version,
  };
}

function createFakeDbService() {
  const journals = new Map<string, JournalRow>();

  const db = {
    journals,
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(Array.from(journals.values())),
      }),
    }),
    insert: () => ({
      values: (row: JournalRow) => ({
        onConflictDoUpdate: ({ set }: { set: Partial<JournalRow> }) => {
          journals.set(row.key, {
            ...row,
            ...set,
            key: row.key,
          });

          return Promise.resolve();
        },
      }),
    }),
  };

  return {
    journals,
    getDb: () => db,
    withWriteTx: (callback: (tx: typeof db) => Promise<unknown>) => callback(db),
  } as unknown as FakeDbService;
}
