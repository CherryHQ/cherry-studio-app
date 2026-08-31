import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type {
  ComposerAttachmentReady,
  ComposerAttachmentSource,
  ComposerInitialAttachment,
} from '@/frontend/components/composer/utils/composerAttachments';
import type { FileEntryId } from '@/shared/data/types/file';

import { useManagedComposerAttachments } from '../useManagedComposerAttachments';

const mockCreateInternalEntry = jest.fn();
const mockDeleteEntry = jest.fn(async () => true);
const mockAlertShow = jest.fn();
const mockLoggerDebug = jest.fn();
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
  useAlert: () => ({ alert: { show: mockAlertShow } }),
}));

jest.mock('@/shared/core/logger/LoggerService', () => ({
  loggerService: {
    withContext: () => ({
      debug: (...args: unknown[]) => mockLoggerDebug(...args),
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
    expect(mockAlertShow).toHaveBeenCalledWith({
      title: 'chat.attachments.importFailed:1',
    });
    expect(JSON.stringify(mockLoggerWarn.mock.calls)).not.toContain('file:///');
  });

  it('deletes an import that finishes after its placeholder was removed', async () => {
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
    expect(mockDeleteEntry).toHaveBeenCalledWith('00000000-0000-7000-8000-000000000003');
  });

  it('detaches a borrowed ready attachment without deleting its file entry', async () => {
    const ready = readyAttachment('00000000-0000-7000-8000-000000000004', 'ready.pdf');
    await renderHook([ready]);

    await act(async () => snapshot?.removeAttachment(ready.id));

    expect(snapshot?.attachments).toEqual([]);
    expect(mockDeleteEntry).not.toHaveBeenCalled();
    expect(mockCreateInternalEntry).not.toHaveBeenCalled();
  });

  it('deletes a composer-owned ready attachment when the user removes it', async () => {
    mockCreateInternalEntry.mockResolvedValue(
      resolvedFile('00000000-0000-7000-8000-000000000016', 'owned.pdf'),
    );
    await renderHook();

    await act(async () => snapshot?.addAttachments([source('owned.pdf')]));
    await act(flushPromises);
    await act(async () => snapshot?.removeAttachment('source:owned.pdf'));

    expect(snapshot?.attachments).toEqual([]);
    expect(mockDeleteEntry).toHaveBeenCalledWith('00000000-0000-7000-8000-000000000016');
  });

  it('deletes an import that finishes after the composer unmounts', async () => {
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

    expect(mockDeleteEntry).toHaveBeenCalledWith('00000000-0000-7000-8000-000000000017');
  });

  it('deletes a composer-owned ready attachment when its Draft unmounts', async () => {
    mockCreateInternalEntry.mockResolvedValue(
      resolvedFile('00000000-0000-7000-8000-000000000021', 'abandoned-ready.pdf'),
    );
    await renderHook();
    await act(async () => snapshot?.addAttachments([source('abandoned-ready.pdf')]));
    await act(flushPromises);

    await act(async () => renderer?.unmount());
    renderer = undefined;

    expect(mockDeleteEntry).toHaveBeenCalledWith('00000000-0000-7000-8000-000000000021');
  });

  it('hands attachments to the sender without deleting them when cleared', async () => {
    const ready = readyAttachment('00000000-0000-7000-8000-000000000014', 'sent.pdf');
    await renderHook([ready]);

    await act(async () => snapshot?.clearAttachments());

    expect(snapshot?.attachments).toEqual([]);
    expect(mockDeleteEntry).not.toHaveBeenCalled();
  });

  it('relinquishes temporary ownership after a successful send clears the draft', async () => {
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

  it('restores temporary ownership when a failed send restores the draft', async () => {
    mockCreateInternalEntry.mockResolvedValue(
      resolvedFile('00000000-0000-7000-8000-000000000020', 'retry.pdf'),
    );
    await renderHook();
    await act(async () => snapshot?.addAttachments([source('retry.pdf')]));
    await act(flushPromises);
    const restored = snapshot?.attachments[0];
    if (!restored || restored.status !== 'ready') throw new Error('missing ready attachment');

    await act(async () => snapshot?.clearAttachments());
    await act(async () => snapshot?.setAttachments([restored]));
    await act(async () => snapshot?.removeAttachment(restored.id));

    expect(mockDeleteEntry).toHaveBeenCalledWith('00000000-0000-7000-8000-000000000020');
  });

  it('deletes restored ownership when a failed send finishes after Draft unmount', async () => {
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

    expect(mockDeleteEntry).toHaveBeenCalledWith('00000000-0000-7000-8000-000000000022');
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

  it('logs import duration without file identity or location', async () => {
    const pending = deferred<ReturnType<typeof resolvedFile>>();
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    mockCreateInternalEntry.mockReturnValue(pending.promise);
    await renderHook();

    await act(async () => snapshot?.addAttachments([source('private.pdf')]));
    now.mockReturnValue(1_830);
    await act(async () => {
      pending.resolve(resolvedFile('00000000-0000-7000-8000-000000000015', 'private.pdf'));
      await pending.promise;
    });

    expect(mockLoggerDebug).toHaveBeenCalledWith('Attachment import finished', {
      durationMs: 830,
      kind: 'file',
      result: 'ready',
      size: 128,
    });
  });

  it('rejects unsupported images before importing them', async () => {
    await renderHook([imageSource('initial.heic', 'image/heic')]);

    await act(async () => snapshot?.addAttachments([imageSource('file.avif', 'image/avif')]));

    expect(snapshot?.attachments).toEqual([]);
    expect(mockCreateInternalEntry).not.toHaveBeenCalled();
    expect(mockAlertShow).toHaveBeenCalledWith({
      title: 'chat.attachments.unsupportedImageFormat',
    });
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
    entry: {
      createdAt: 1_754_611_200_000,
      filename: name,
      id: entryId,
      mediaType: 'application/pdf',
      size: 128,
      updatedAt: 1_754_611_200_000,
    },
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
