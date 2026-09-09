import { searchWithCursor } from '../ftsSearch';

type Row = { createdAt: number; id: string; searchableText: string };

const options = (fetchRows: jest.Mock) => ({
  buildSnippet: (text: string) => text,
  cursorConfig: { errorMessage: 'Invalid search cursor', fieldMessage: 'invalid cursor' },
  fetchRows,
  getCursor: (row: Row) => ({ createdAt: row.createdAt, id: row.id }),
  getSearchableText: (row: Row) => row.searchableText,
  mapRow: (row: Row, { snippet }: { snippet: string }) => ({
    item: { ...row, snippet },
    sort: { createdAt: row.createdAt, id: row.id },
  }),
  q: 'needle',
});

describe('searchWithCursor', () => {
  test('continues into later chunks after regex-rejected FTS candidates', async () => {
    const fetchRows = jest
      .fn()
      .mockResolvedValueOnce(
        Array.from({ length: 200 }, (_, index) => ({
          createdAt: 500 - index,
          id: `rejected-${index}`,
          searchableText: 'haystack',
        })),
      )
      .mockResolvedValueOnce([
        { createdAt: 200, id: 'accepted', searchableText: 'needle appears here' },
      ])
      .mockResolvedValueOnce([]);

    const result = await searchWithCursor<Row, Row & { snippet: string }>(options(fetchRows));

    expect(fetchRows.mock.calls.slice(0, 2).map(([context]) => context.cursor)).toEqual([
      undefined,
      { createdAt: 301, id: 'rejected-199' },
    ]);
    expect(result.items.map((item) => item.id)).toEqual(['accepted']);
  });

  test('uses the last returned item as a limit-plus-one cursor boundary', async () => {
    const fetchRows = jest.fn().mockResolvedValueOnce([
      { createdAt: 300, id: 'c', searchableText: 'needle newest' },
      { createdAt: 200, id: 'b', searchableText: 'needle middle' },
      { createdAt: 100, id: 'a', searchableText: 'needle oldest' },
    ]);

    const result = await searchWithCursor<Row, Row & { snippet: string }>({
      ...options(fetchRows),
      limit: 2,
    });

    expect(result.items.map((item) => item.id)).toEqual(['c', 'b']);
    expect(result.nextCursor).toBe('200:b');
  });

  test('rejects a malformed cursor before fetching', async () => {
    const fetchRows = jest.fn();
    await expect(
      searchWithCursor<Row, Row & { snippet: string }>({
        ...options(fetchRows),
        cursor: '',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(fetchRows).not.toHaveBeenCalled();
  });

  test('returns a continuation after exhausting the scan budget without any matches', async () => {
    const fetchRows = jest
      .fn()
      .mockResolvedValueOnce([
        { createdAt: 300, id: 'c', searchableText: '[link](needle)' },
        { createdAt: 200, id: 'b', searchableText: '[link](needle)' },
      ])
      .mockResolvedValueOnce([{ createdAt: 100, id: 'a', searchableText: 'needle found' }]);
    const first = await searchWithCursor({ ...options(fetchRows), maxCandidates: 2 });
    expect(first.items).toEqual([]);
    expect(first.nextCursor).toBe('200:b');
    const second = await searchWithCursor({
      ...options(fetchRows),
      cursor: first.nextCursor,
      maxCandidates: 2,
    });
    expect(second.items.map((item) => item.id)).toEqual(['a']);
    expect(second.nextCursor).toBeUndefined();
    expect(fetchRows.mock.calls[1][0].cursor).toEqual({ createdAt: 200, id: 'b' });
  });

  test.each(['计划', '%', '_', '100%_'])('uses bounded literal scanning for %s', async (q) => {
    const fetchRows = jest.fn().mockResolvedValue([]);
    await searchWithCursor({ ...options(fetchRows), q });
    expect(fetchRows.mock.calls[0][0].ftsConditions).toEqual([]);
  });

  test('stops processing and scanning when cancelled during a read', async () => {
    const controller = new AbortController();
    const fetchRows = jest.fn(async () => {
      controller.abort();
      return [{ createdAt: 100, id: 'a', searchableText: 'needle found' }];
    });
    const buildSnippet = jest.fn();
    await expect(
      searchWithCursor({
        ...options(fetchRows),
        buildSnippet,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchRows).toHaveBeenCalledTimes(1);
    expect(buildSnippet).not.toHaveBeenCalled();
  });
});
