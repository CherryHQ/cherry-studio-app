import { LifecycleState } from '@/backend/core/lifecycle';
import type { CacheService } from '@/backend/data/CacheService';

import { DbService } from '../DbService';

const mockOpenDatabaseSync = jest.fn();
const mockCloseSync = jest.fn();

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: (...args: unknown[]) => mockOpenDatabaseSync(...args),
}));
jest.mock('drizzle-orm/expo-sqlite/migrator', () => ({ migrate: jest.fn() }));
jest.mock('../seeding', () => ({ seedDatabase: jest.fn() }));
jest.mock('../customSql', () => ({ customSqlStatements: [] }));

describe('DbService connection lifecycle', () => {
  beforeEach(() => {
    mockOpenDatabaseSync.mockReset().mockReturnValue({
      closeSync: mockCloseSync,
      execSync: jest.fn(),
      getFirstSync: jest.fn(() => ({ value: JSON.stringify({ version: 'unused' }) })),
      runSync: jest.fn(),
    });
    mockCloseSync.mockReset();
  });

  test('opens without the pre-close finalize walk that double-frees FTS5 statements', async () => {
    const service = new DbService({} as CacheService);

    await service._doInit();

    expect(mockOpenDatabaseSync).toHaveBeenCalledWith(
      'cherry.db',
      expect.objectContaining({ finalizeUnusedStatementsBeforeClosing: false }),
    );
  });

  test('stops cleanly when SQLite refuses to close over unfinalized statements', async () => {
    mockCloseSync.mockImplementation(() => {
      throw new Error('unable to close due to unfinalized statements or unfinished backups');
    });
    const service = new DbService({} as CacheService);
    await service._doInit();

    await expect(service._doStop()).resolves.toBeUndefined();

    expect(mockCloseSync).toHaveBeenCalledTimes(1);
    expect(service.state).toBe(LifecycleState.Stopped);
    expect(() => service.getSqlite()).toThrow('Database service has been disposed');
  });
});
