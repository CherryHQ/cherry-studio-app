import { storeMcpResultFiles } from '../mcpResultFiles';

const mockCreateInternalEntry = jest.fn();
const mockDiscardInternalEntries = jest.fn(async (..._args: unknown[]) => undefined);

jest.mock('@/backend/data/services/FileEntryService', () => ({ fileEntryService: {} }));
jest.mock('@/backend/services/file/fileStorage', () => ({
  createInternalEntry: (...args: unknown[]) => mockCreateInternalEntry(...args),
  discardInternalEntries: (...args: unknown[]) => mockDiscardInternalEntries(...args),
}));

const fullTextEntry = {
  id: '00000000-0000-4000-8000-0000000000f1',
  filename: 'mcp-result.txt',
  mediaType: 'text/plain',
};
const signal = () => new AbortController().signal;

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateInternalEntry.mockResolvedValue(fullTextEntry);
});

describe('MCP result retention', () => {
  it('saves model text over its budget as a readable file and leaves short results alone', async () => {
    const text = 'x'.repeat(70_000);
    await expect(
      storeMcpResultFiles({ content: [{ type: 'text', text }] }, signal()),
    ).resolves.toMatchObject({
      artifacts: [{ ref: { kind: 'managed-file', fileEntryId: fullTextEntry.id } }],
      fullTextFileEntryId: fullTextEntry.id,
    });
    expect(mockCreateInternalEntry).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ source: 'text', data: text, mediaType: 'text/plain' }),
      expect.any(AbortSignal),
    );

    mockCreateInternalEntry.mockClear();
    await expect(
      storeMcpResultFiles({ content: [{ type: 'text', text: 'short' }] }, signal()),
    ).resolves.toEqual({
      value: { content: [{ type: 'text', text: 'short' }] },
      images: [],
      artifacts: [],
    });
    expect(mockCreateInternalEntry).not.toHaveBeenCalled();
  });

  it('keeps the result when the full text cannot be saved or is too large to read back', async () => {
    mockCreateInternalEntry.mockRejectedValue(new Error('disk full'));
    const failed = await storeMcpResultFiles(
      { content: [{ type: 'text', text: 'x'.repeat(70_000) }] },
      signal(),
    );
    expect(failed).toMatchObject({ artifacts: [] });
    expect(failed.fullTextFileEntryId).toBeUndefined();

    mockCreateInternalEntry.mockClear();
    const oversized = await storeMcpResultFiles(
      { content: [{ type: 'text', text: 'x'.repeat(5 * 1024 * 1024 + 1) }] },
      signal(),
    );
    expect(oversized.fullTextFileEntryId).toBeUndefined();
    expect(mockCreateInternalEntry).not.toHaveBeenCalled();
  });
});
