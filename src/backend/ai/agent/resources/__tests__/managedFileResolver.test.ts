import { FileEntryIdSchema, FileEntrySchema } from '@/shared/data/types/file';

import { createManagedFileResolver, createTurnResourceLedger } from '../managedFileResolver';

const AVAILABLE_ID = FileEntryIdSchema.parse('00000000-0000-7000-8000-000000000001');
const MISSING_BLOB_ID = FileEntryIdSchema.parse('00000000-0000-7000-8000-000000000002');
const GENERATED_ID = FileEntryIdSchema.parse('00000000-0000-7000-8000-000000000003');

describe('managedFileResolver', () => {
  test('returns authoritative facts only when both the live row and managed blob exist', async () => {
    const available = entry(AVAILABLE_ID, 'available.png');
    const missingBlob = entry(MISSING_BLOB_ID, 'missing.png');
    const findAvailableByIds = jest.fn(async () => [missingBlob, available]);
    const getUri = jest.fn((candidate: { filename: string; id: string }) =>
      candidate.id === AVAILABLE_ID ? 'file:///private/managed/available.png' : undefined,
    );
    const readDataUrl = jest.fn(async () => 'data:image/png;base64,AAAA');
    const readBytes = jest.fn(async () => Uint8Array.from([116, 101, 120, 116]));
    const resolver = createManagedFileResolver(
      { findAvailableByIds },
      getUri,
      readDataUrl,
      readBytes,
    );

    const facts = await resolver.resolveAvailable([AVAILABLE_ID, AVAILABLE_ID, MISSING_BLOB_ID]);

    expect(findAvailableByIds).toHaveBeenCalledWith([AVAILABLE_ID, MISSING_BLOB_ID]);
    expect(facts).toEqual(
      new Map([
        [
          AVAILABLE_ID,
          {
            fileEntryId: AVAILABLE_ID,
            mediaType: 'image/png',
            name: 'available.png',
            size: 128,
          },
        ],
      ]),
    );
    expect(JSON.stringify([...facts.values()])).not.toContain('file:///');

    const signal = new AbortController().signal;
    await expect(resolver.readAsDataUrl(facts.get(AVAILABLE_ID)!, signal)).resolves.toBe(
      'data:image/png;base64,AAAA',
    );
    expect(readDataUrl).toHaveBeenCalledWith(
      'file:///private/managed/available.png',
      'image/png',
      signal,
    );
    await expect(resolver.readAsBytes(facts.get(AVAILABLE_ID)!, signal)).resolves.toEqual(
      Uint8Array.from([116, 101, 120, 116]),
    );
    expect(readBytes).toHaveBeenCalledWith('file:///private/managed/available.png', signal);
  });

  test('drops a late image read after cancellation', async () => {
    const available = entry(AVAILABLE_ID, 'available.png');
    const controller = new AbortController();
    let resolveRead!: (value: string) => void;
    const read = new Promise<string>((resolve) => {
      resolveRead = resolve;
    });
    const resolver = createManagedFileResolver(
      { findAvailableByIds: async () => [available] },
      () => 'file:///private/managed/available.png',
      async () => read,
      async () => Uint8Array.from([]),
    );

    const pending = resolver.readAsDataUrl(availableFact(), controller.signal);
    controller.abort(new Error('cancelled'));

    await expect(pending).rejects.toThrow('cancelled');
    resolveRead('data:image/png;base64,LATE');
  });

  test('keeps historical managed ids in the ledger without requiring them to resolve', () => {
    const inputFiles = new Map([
      [
        AVAILABLE_ID,
        {
          fileEntryId: AVAILABLE_ID,
          mediaType: 'image/png',
          name: 'available.png',
          size: 128,
        },
      ],
    ]);

    const ledger = createTurnResourceLedger(inputFiles, [MISSING_BLOB_ID]);
    ledger.grantFile(GENERATED_ID);

    expect([...ledger.fileEntryIds]).toEqual([AVAILABLE_ID, MISSING_BLOB_ID, GENERATED_ID]);
    expect(ledger.inputFiles).toBe(inputFiles);
  });
});

function entry(id: string, filename: string) {
  return FileEntrySchema.parse({
    createdAt: 1,
    filename,
    id,
    mediaType: 'image/png',
    provenance: 'imported',
    size: 128,
    updatedAt: 1,
  });
}

function availableFact() {
  return {
    fileEntryId: AVAILABLE_ID,
    mediaType: 'image/png',
    name: 'available.png',
    size: 128,
  };
}
