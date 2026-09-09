import { sql } from 'drizzle-orm';

import { readSqliteRows } from '../readSqliteRows';

describe('asynchronous search reads', () => {
  test('passes bound values to the native async reader', async () => {
    const getAllAsync = jest.fn().mockResolvedValue([{ id: 'message-1' }]);
    await expect(
      readSqliteRows({ getAllAsync }, sql`SELECT id FROM messages WHERE text = ${"a'b"}`),
    ).resolves.toEqual([{ id: 'message-1' }]);
    expect(getAllAsync).toHaveBeenCalledWith('SELECT id FROM messages WHERE text = ?', ["a'b"]);
  });

  test('does not issue a cancelled read', async () => {
    const controller = new AbortController();
    const getAllAsync = jest.fn();
    controller.abort();
    await expect(
      readSqliteRows({ getAllAsync }, sql`SELECT 1`, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(getAllAsync).not.toHaveBeenCalled();
  });

  test('discards a result cancelled while the native statement was running', async () => {
    const controller = new AbortController();
    const getAllAsync = jest.fn(async () => {
      controller.abort();
      return [];
    });
    await expect(
      readSqliteRows({ getAllAsync }, sql`SELECT 1`, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
