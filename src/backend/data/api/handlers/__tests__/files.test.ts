import { createFileHandlers } from '../files';

const entryId = '00000000-0000-7000-8000-000000000001';

describe('file Data API handlers', () => {
  it('validates the id before delegating the entry lookup', async () => {
    const entries = { getById: jest.fn(async () => ({ id: entryId })) };
    const handlers = createFileHandlers(entries as never);

    await expect(handlers['/files/entries/:id'].GET({ params: { id: entryId } })).resolves.toEqual({
      id: entryId,
    });
    expect(entries.getById).toHaveBeenCalledWith(entryId);

    expect(() => handlers['/files/entries/:id'].GET({ params: { id: 'not-a-uuid' } })).toThrow();
    expect(entries.getById).toHaveBeenCalledTimes(1);
  });
});
