import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type {
  ComposerAttachmentReady,
  ComposerAttachmentSource,
  ComposerInitialAttachment,
} from '@/frontend/components/Composer/utils/composerAttachments';
import { type FileEntryId, FileEntrySchema } from '@/shared/data/types/file';

import { useManagedComposerAttachments } from '../useManagedComposerAttachments';

const mockCreateInternalEntry = jest.fn();
const mockDeleteEntry = jest.fn(async () => true);
const mockToastShow = jest.fn();
const mockLoggerWarn = jest.fn();
const mockFileModule = {
  createInternalEntry: mockCreateInternalEntry,
  delete: mockDeleteEntry,
  getUri: jest.fn(),
};

jest.mock('@/frontend/data', () => ({
  useBackendModule: () => mockFileModule,
}));

jest.mock('@cherrystudio/ui/components', () => ({
  useToast: () => ({ toast: { show: mockToastShow } }),
}));

jest.mock('@/shared/core/logger/LoggerService', () => ({
  loggerService: {
    withContext: () => ({
      warn: (...args: unknown[]) => mockLoggerWarn(...args),
    }),
  },
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { count?: number }) =>
      values?.count === undefined ? key : `${key}:${values.count}`,
  }),
}));

let renderer: ReactTestRenderer | undefined;
let snapshot: ReturnType<typeof useManagedComposerAttachments> | undefined;

describe('useManagedComposerAttachments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    snapshot = undefined;
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
    jest.restoreAllMocks();
  });

  it('preserves source order and keeps successful imports when one item fails', async () => {
    const first = deferred<ReturnType<typeof resolvedFile>>();
    const second = deferred<ReturnType<typeof resolvedFile>>();
    mockCreateInternalEntry.mockImplementation(({ name }: { name: string }) =>
      name === 'first.pdf' ? first.promise : second.promise,
    );
    await renderHook();

    await act(async () => {
      snapshot?.addAttachments([source('first.pdf'), source('second.pdf')]);
    });
    expect(snapshot?.attachments.map(({ name, status }) => ({ name, status }))).toEqual([
      { name: 'first.pdf', status: 'importing' },
      { name: 'second.pdf', status: 'importing' },
    ]);

    await act(async () => {
      second.resolve(resolvedFile('00000000-0000-7000-8000-000000000002', 'second.pdf'));
      await second.promise;
    });
    await act(async () => {
      first.reject(new Error('copy failed at file:///source/first.pdf'));
      await flushPromises();
    });

    expect(snapshot?.attachments).toEqual([
      expect.objectContaining({
        fileEntryId: '00000000-0000-7000-8000-000000000002',
        name: 'second.pdf',
        status: 'ready',
      }),
    ]);
    expect(mockToastShow).toHaveBeenCalledWith({
      label: 'chat.attachments.importFailed:1',
      variant: 'danger',
    });
    expect(JSON.stringify(mockLoggerWarn.mock.calls)).not.toContain('file:///');
  });

  it('keeps a completed import in the library after its placeholder was removed', async () => {
    const pending = deferred<ReturnType<typeof resolvedFile>>();
    mockCreateInternalEntry.mockReturnValue(pending.promise);
    await renderHook();

    await act(async () => snapshot?.addAttachments([source('removed.pdf')]));
    await act(async () => snapshot?.removeAttachment('source:removed.pdf'));
    await act(async () => {
      pending.resolve(resolvedFile('00000000-0000-7000-8000-000000000003', 'removed.pdf'));
      await pending.promise;
    });

    expect(snapshot?.attachments).toEqual([]);
    expect(mockDeleteEntry).not.toHaveBeenCalled();
  });

  it('detaches a borrowed ready attachment without deleting its file entry', async () => {
    const ready = readyAttachment('00000000-0000-7000-8000-000000000004', 'ready.pdf');
    await renderHook([ready]);

    await act(async () => snapshot?.removeAttachment(ready.id));

    expect(snapshot?.attachments).toEqual([]);
    expect(mockDeleteEntry).not.toHaveBeenCalled();
    expect(mockCreateInternalEntry).not.toHaveBeenCalled();
  });

  it('keeps an imported file when the user removes its draft reference', async () => {
    mockCreateInternalEntry.mockResolvedValue(
      resolvedFile('00000000-0000-7000-8000-000000000016', 'owned.pdf'),
    );
    await renderHook();

    await act(async () => snapshot?.addAttachments([source('owned.pdf')]));
    await act(flushPromises);
    await act(async () => snapshot?.removeAttachment('source:owned.pdf'));

    expect(snapshot?.attachments).toEqual([]);
    expect(mockDeleteEntry).not.toHaveBeenCalled();
  });

  it('keeps an import that finishes after the composer unmounts', async () => {
    const pending = deferred<ReturnType<typeof resolvedFile>>();
    mockCreateInternalEntry.mockReturnValue(pending.promise);
    await renderHook();

    await act(async () => snapshot?.addAttachments([source('abandoned.pdf')]));
    await act(async () => renderer?.unmount());
    renderer = undefined;
    await act(async () => {
      pending.resolve(resolvedFile('00000000-0000-7000-8000-000000000017', 'abandoned.pdf'));
      await pending.promise;
    });

    expect(mockDeleteEntry).not.toHaveBeenCalled();
  });

  it('keeps a completed import when its draft unmounts', async () => {
    mockCreateInternalEntry.mockResolvedValue(
      resolvedFile('00000000-0000-7000-8000-000000000021', 'abandoned-ready.pdf'),
    );
    await renderHook();
    await act(async () => snapshot?.addAttachments([source('abandoned-ready.pdf')]));
    await act(flushPromises);

    await act(async () => renderer?.unmount());
    renderer = undefined;

    expect(mockDeleteEntry).not.toHaveBeenCalled();
  });

  it('hands attachments to the sender without deleting them when cleared', async () => {
    const ready = readyAttachment('00000000-0000-7000-8000-000000000014', 'sent.pdf');
    await renderHook([ready]);

    await act(async () => snapshot?.clearAttachments());

    expect(snapshot?.attachments).toEqual([]);
    expect(mockDeleteEntry).not.toHaveBeenCalled();
  });

  it('can reattach a sent library reference without copying or deleting it', async () => {
    mockCreateInternalEntry.mockResolvedValue(
      resolvedFile('00000000-0000-7000-8000-000000000019', 'sent.pdf'),
    );
    await renderHook();
    await act(async () => snapshot?.addAttachments([source('sent.pdf')]));
    await act(flushPromises);
    const sent = snapshot?.attachments[0];
    if (!sent || sent.status !== 'ready') throw new Error('missing ready attachment');

    await act(async () => snapshot?.clearAttachments());
    await act(async () => snapshot?.addAttachments([sent]));
    await act(async () => snapshot?.removeAttachment(sent.id));

    expect(mockDeleteEntry).not.toHaveBeenCalled();
  });

  it('restores a failed-send reference only once when the same file was reselected from the library', async () => {
    mockCreateInternalEntry.mockResolvedValue(
      resolvedFile('00000000-0000-7000-8000-000000000020', 'retry.pdf'),
    );
    await renderHook();
    await act(async () => snapshot?.addAttachments([source('retry.pdf')]));
    await act(flushPromises);
    const restored = snapshot?.attachments[0];
    if (!restored || restored.status !== 'ready') throw new Error('missing ready attachment');
    const reselected = { ...restored, id: `file-entry:${restored.fileEntryId}` };

    await act(async () => snapshot?.clearAttachments());
    await act(async () => snapshot?.addAttachments([reselected]));
    await act(async () => snapshot?.addAttachments([restored]));

    expect(snapshot?.attachments).toEqual([reselected]);
    expect(mockCreateInternalEntry).toHaveBeenCalledTimes(1);
    await act(async () => snapshot?.removeAttachment(reselected.id));
    expect(snapshot?.attachments).toEqual([]);
    expect(mockDeleteEntry).not.toHaveBeenCalled();
  });

  it('keeps files when a failed send finishes after draft unmount', async () => {
    mockCreateInternalEntry.mockResolvedValue(
      resolvedFile('00000000-0000-7000-8000-000000000022', 'abandoned-retry.pdf'),
    );
    await renderHook();
    await act(async () => snapshot?.addAttachments([source('abandoned-retry.pdf')]));
    await act(flushPromises);
    const restored = snapshot?.attachments[0];
    if (!restored || restored.status !== 'ready') throw new Error('missing ready attachment');

    await act(async () => snapshot?.clearAttachments());
    await act(async () => renderer?.unmount());
    renderer = undefined;
    await act(async () => snapshot?.setAttachments([restored]));

    expect(mockDeleteEntry).not.toHaveBeenCalled();
  });

  it('imports transient initial attachments but mounts managed ones as ready', async () => {
    mockCreateInternalEntry.mockResolvedValue(
      resolvedFile('00000000-0000-7000-8000-000000000005', 'source.pdf'),
    );
    const ready = readyAttachment('00000000-0000-7000-8000-000000000006', 'ready.pdf');

    await renderHook([source('source.pdf'), ready]);
    await act(flushPromises);

    expect(mockCreateInternalEntry).toHaveBeenCalledTimes(1);
    expect(snapshot?.attachments.map(({ name, status }) => ({ name, status }))).toEqual([
      { name: 'source.pdf', status: 'ready' },
      { name: 'ready.pdf', status: 'ready' },
    ]);
  });

  it('uses managed entry metadata after importing a transient source', async () => {
    mockCreateInternalEntry.mockResolvedValue({
      ...resolvedFile('00000000-0000-7000-8000-000000000018', 'managed-name.md'),
      entry: {
        ...resolvedFile('00000000-0000-7000-8000-000000000018', 'managed-name.md').entry,
        mediaType: 'text/markdown',
      },
    });
    await renderHook();

    await act(async () => snapshot?.addAttachments([source('picker-name.pdf')]));
    await act(flushPromises);

    expect(snapshot?.attachments).toEqual([
      expect.objectContaining({
        fileEntryId: '00000000-0000-7000-8000-000000000018',
        mediaType: 'text/markdown',
        name: 'managed-name.md',
        status: 'ready',
      }),
    ]);
  });

  it('imports image formats before any send suitability check', async () => {
    mockCreateInternalEntry.mockImplementation(
      async ({ name, mediaType }: { name: string; mediaType: string }) => {
        const resolved = resolvedFile(
          name.endsWith('heic')
            ? '00000000-0000-7000-8000-000000000035'
            : '00000000-0000-7000-8000-000000000036',
          name,
        );
        return { ...resolved, entry: { ...resolved.entry, mediaType } };
      },
    );
    await renderHook([imageSource('initial.heic', 'image/heic')]);
    await act(async () => snapshot?.addAttachments([imageSource('file.avif', 'image/avif')]));
    await act(flushPromises);
    expect(snapshot?.attachments.map(({ name, status }) => ({ name, status }))).toEqual([
      { name: 'initial.heic', status: 'ready' },
      { name: 'file.avif', status: 'ready' },
    ]);
    expect(mockCreateInternalEntry).toHaveBeenCalledTimes(2);
    expect(mockToastShow).not.toHaveBeenCalled();
  });

  it('does not let a removed import replace a newly added attachment with the same source id', async () => {
    const first = deferred<ReturnType<typeof resolvedFile>>();
    mockCreateInternalEntry
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(resolvedFile('00000000-0000-7000-8000-000000000038', 'same.pdf'));
    await renderHook();
    await act(async () => snapshot?.addAttachments([source('same.pdf')]));
    await act(async () => snapshot?.removeAttachment('source:same.pdf'));
    await act(async () => snapshot?.addAttachments([source('same.pdf')]));
    await act(async () => {
      first.resolve(resolvedFile('00000000-0000-7000-8000-000000000037', 'same.pdf'));
      await first.promise;
    });
    expect(snapshot?.attachments).toEqual([
      expect.objectContaining({
        fileEntryId: '00000000-0000-7000-8000-000000000038',
        status: 'ready',
      }),
    ]);
    expect(mockDeleteEntry).not.toHaveBeenCalled();
  });
});

function Probe({
  initialAttachments,
}: {
  initialAttachments: readonly ComposerInitialAttachment[];
}) {
  const store = useManagedComposerAttachments(initialAttachments);

  useEffect(() => {
    snapshot = store;
  }, [store]);
  return null;
}

async function renderHook(initialAttachments: readonly ComposerInitialAttachment[] = []) {
  await act(async () => {
    renderer = create(<Probe initialAttachments={initialAttachments} />);
  });
}

function source(name: string): ComposerAttachmentSource {
  return {
    id: `source:${name}`,
    kind: 'file',
    mediaType: 'application/pdf',
    name,
    uri: `file:///source/${name}`,
  };
}

function imageSource(name: string, mediaType: string): ComposerAttachmentSource {
  return {
    id: `image:${name}`,
    kind: 'image',
    mediaType,
    name,
    uri: `file:///source/${name}`,
  };
}

function readyAttachment(entryId: FileEntryId, name: string): ComposerAttachmentReady {
  return {
    ...source(name),
    fileEntryId: entryId,
    status: 'ready',
    uri: `file:///managed/${name}`,
  };
}

function resolvedFile(entryId: FileEntryId, name: string) {
  return {
    entry: FileEntrySchema.parse({
      createdAt: 1_754_611_200_000,
      filename: name,
      id: entryId,
      mediaType: 'application/pdf',
      provenance: 'imported',
      size: 128,
      updatedAt: 1_754_611_200_000,
    }),
    uri: `file:///managed/${name}`,
  };
}

function deferred<TValue>() {
  let resolve!: (value: TValue) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<TValue>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}
