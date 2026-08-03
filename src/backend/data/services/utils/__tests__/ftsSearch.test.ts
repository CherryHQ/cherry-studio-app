import { searchWithCursor } from '../ftsSearch';

type Row = { createdAt: number; id: string; searchableText: string };

const options = (fetchRows: jest.Mock) => ({
  buildSnippet: (text: string) => text,
  cursorConfig: { errorMessage: 'Invalid search cursor', fieldMessage: 'invalid cursor' },
  fetchRows,
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
      .mockResolvedValueOnce([{ createdAt: 300, id: 'rejected', searchableText: 'haystack' }])
      .mockResolvedValueOnce([
        { createdAt: 200, id: 'accepted', searchableText: 'needle appears here' },
      ])
      .mockResolvedValueOnce([]);

    const result = await searchWithCursor<Row, Row & { snippet: string }>(options(fetchRows));

    expect(fetchRows.mock.calls.slice(0, 2).map(([context]) => context.offset)).toEqual([0, 1]);
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
});
