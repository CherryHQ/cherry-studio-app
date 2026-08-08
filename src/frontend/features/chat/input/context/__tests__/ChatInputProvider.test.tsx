import type { FileEntryId } from '@cherrystudio/universal/data/types/file';
import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type {
  ChatInputAttachmentReady,
  ChatInputAttachmentSource,
} from '../../utils/chatInputAttachments';
import { ChatInputProvider, useChatInputActions, useChatInputState } from '../ChatInputProvider';

const mockImportFile = jest.fn();
const mockDiscardFile = jest.fn(async () => true);
const mockToastShow = jest.fn();
const mockFileModule = {
  createInternalEntry: mockImportFile,
  deleteIfUnreferenced: mockDiscardFile,
  getUri: jest.fn(),
};

jest.mock('@/frontend/data', () => ({
  useBackendModule: () => mockFileModule,
}));

jest.mock('heroui-native/toast', () => ({
  useToast: () => ({ toast: { show: mockToastShow } }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { count?: number }) =>
      values?.count === undefined ? key : `${key}:${values.count}`,
  }),
}));

jest.mock('../../hooks/useChatInputPhotoPicker', () => ({
  useChatInputPhotoPicker: () => ({}),
}));

type ProviderSnapshot = {
  actions: ReturnType<typeof useChatInputActions>;
  attachments: ReturnType<typeof useChatInputState>['attachments'];
};

let renderer: ReactTestRenderer | undefined;
let snapshot: ProviderSnapshot | undefined;

describe('ChatInputProvider attachment imports', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    snapshot = undefined;
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  it('preserves source order and keeps successful imports when one item fails', async () => {
    const first = deferred<ReturnType<typeof resolvedFile>>();
    const second = deferred<ReturnType<typeof resolvedFile>>();
    mockImportFile.mockImplementation(({ name }: { name: string }) =>
      name === 'first.pdf' ? first.promise : second.promise,
    );
    await renderProvider();

    await act(async () => {
      snapshot?.actions.addAttachments([source('first.pdf'), source('second.pdf')]);
    });

    expect(snapshot?.attachments.map(({ name, status }) => ({ name, status }))).toEqual([
      { name: 'first.pdf', status: 'importing' },
      { name: 'second.pdf', status: 'importing' },
    ]);

    await act(async () => {
      second.resolve(resolvedFile('00000000-0000-7000-8000-000000000002', 'second.pdf'));
      await second.promise;
    });
    expect(snapshot?.attachments.map(({ name, status }) => ({ name, status }))).toEqual([
      { name: 'first.pdf', status: 'importing' },
      { name: 'second.pdf', status: 'ready' },
    ]);

    await act(async () => {
      first.reject(new Error('copy failed'));
      await flushPromises();
    });

    expect(snapshot?.attachments).toEqual([
      expect.objectContaining({
        fileEntryId: '00000000-0000-7000-8000-000000000002',
        name: 'second.pdf',
        status: 'ready',
      }),
    ]);
    expect(mockToastShow).toHaveBeenCalledTimes(1);
    expect(mockToastShow).toHaveBeenCalledWith({
      label: 'chat.attachments.importFailed:1',
      variant: 'danger',
    });
  });

  it('discards an import that finishes after its placeholder was removed', async () => {
    const pending = deferred<ReturnType<typeof resolvedFile>>();
    mockImportFile.mockReturnValue(pending.promise);
    await renderProvider();

    await act(async () => {
      snapshot?.actions.addAttachments([source('removed.pdf')]);
    });
    await act(async () => {
      snapshot?.actions.removeAttachment('source:removed.pdf');
    });
    await act(async () => {
      pending.resolve(resolvedFile('00000000-0000-7000-8000-000000000003', 'removed.pdf'));
      await pending.promise;
    });

    expect(snapshot?.attachments).toEqual([]);
    expect(mockDiscardFile).toHaveBeenCalledWith('00000000-0000-7000-8000-000000000003');
  });

  it('tries safe deletion when a ready attachment is removed', async () => {
    const ready = readyAttachment('00000000-0000-7000-8000-000000000004', 'ready.pdf');
    await renderProvider([ready]);

    await act(async () => {
      snapshot?.actions.removeAttachment(ready.id);
    });

    expect(snapshot?.attachments).toEqual([]);
    expect(mockDiscardFile).toHaveBeenCalledWith(ready.fileEntryId);
    expect(mockImportFile).not.toHaveBeenCalled();
  });

  it('hands ready attachments to the sender without deleting them when cleared', async () => {
    const ready = readyAttachment('00000000-0000-7000-8000-000000000014', 'sent.pdf');
    await renderProvider([ready]);

    await act(async () => {
      snapshot?.actions.clearAttachments();
    });

    expect(snapshot?.attachments).toEqual([]);
    expect(mockDiscardFile).not.toHaveBeenCalled();
  });

  it('imports transient initial attachments but mounts managed ones as ready', async () => {
    mockImportFile.mockResolvedValue(
      resolvedFile('00000000-0000-7000-8000-000000000005', 'source.pdf'),
    );
    const ready = readyAttachment('00000000-0000-7000-8000-000000000006', 'ready.pdf');

    await renderProvider([source('source.pdf'), ready]);
    await act(flushPromises);

    expect(mockImportFile).toHaveBeenCalledTimes(1);
    expect(snapshot?.attachments.map(({ name, status }) => ({ name, status }))).toEqual([
      { name: 'source.pdf', status: 'ready' },
      { name: 'ready.pdf', status: 'ready' },
    ]);
  });
});

function Probe() {
  const actions = useChatInputActions();
  const { attachments } = useChatInputState();

  useEffect(() => {
    snapshot = { actions, attachments };
  }, [actions, attachments]);

  return null;
}

async function renderProvider(
  initialAttachments: Parameters<typeof ChatInputProvider>[0]['initialAttachments'] = [],
) {
  await act(async () => {
    renderer = create(
      <ChatInputProvider initialAttachments={initialAttachments}>
        <Probe />
      </ChatInputProvider>,
    );
  });
}

function source(name: string): ChatInputAttachmentSource {
  return {
    id: `source:${name}`,
    kind: 'file',
    mediaType: 'application/pdf',
    name,
    uri: `file:///source/${name}`,
  };
}

function readyAttachment(entryId: FileEntryId, name: string): ChatInputAttachmentReady {
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
      cleanupPolicy: 'delete_when_unreferenced' as const,
      contentHash: null,
      createdAt: '2026-08-08T00:00:00.000Z',
      ext: 'pdf',
      id: entryId,
      name,
      origin: 'internal' as const,
      size: 128,
      updatedAt: '2026-08-08T00:00:00.000Z',
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
