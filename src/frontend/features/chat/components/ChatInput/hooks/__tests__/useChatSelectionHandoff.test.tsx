import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import {
  createChatComposerHandoff,
  createChatSelectionHandoff,
  getChatComposerHandoff,
} from '@/frontend/appShell/navigation/chat';
import {
  ComposerProvider,
  useComposerState,
} from '@/frontend/components/Composer/context/ComposerProvider';
import { useManagedComposerAttachments } from '@/frontend/components/Composer/hooks/useManagedComposerAttachments';
import {
  type ComposerInitialAttachment,
  createReadyAttachmentDraft,
} from '@/frontend/components/Composer/utils/composerAttachments';
import type { ResolvedFile } from '@/shared/contracts/file';
import { FileEntrySchema } from '@/shared/data/types/file';

import { readSelectionMentions } from '../../utils/selectionMentions';
import { useChatSelectionHandoff } from '../useChatSelectionHandoff';

let mockFocused = false;
let mockReplayFocus = false;
let mockInitialDraft = '';
let mockDraft = '';
let mockAttachmentStore: ReturnType<typeof useManagedComposerAttachments>;
const mockPrepareWorkspaceAttachment = jest.fn();
const mockToastShow = jest.fn();
const mockFileModule = { prepareWorkspaceAttachment: mockPrepareWorkspaceAttachment };

jest.mock('react-native-reanimated', () =>
  jest.requireActual('@/frontend/components/Composer/components/__tests__/_sharedValueMock'),
);

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    const focused = mockFocused;
    const replay = mockReplayFocus;
    useEffect(() => {
      if (focused) {
        callback();
        if (replay) callback();
      }
    }, [callback, focused, replay]);
  },
}));
jest.mock('@/frontend/components/Composer', () =>
  jest.requireActual('@/frontend/components/Composer/context/ComposerProvider'),
);
jest.mock('@/frontend/data', () => ({
  useBackendModule: () => mockFileModule,
}));
jest.mock('@cherrystudio/ui/components', () => ({
  useToast: () => ({ toast: { show: mockToastShow } }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/shared/core/logger/LoggerService', () => ({
  loggerService: { withContext: () => ({ warn: jest.fn() }) },
}));

const file = {
  entry: FileEntrySchema.parse({
    id: '00000000-0000-7000-8000-000000000001',
    filename: 'report.docx',
    mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    size: 10,
    provenance: 'generated',
    createdAt: 1,
    updatedAt: 1,
  }),
  uri: 'file:///managed/report.docx',
};
const attachment = createReadyAttachmentDraft(file, 'file-entry:report');
const selection = {
  label: 'report.docx · ¶1',
  selection: {
    file_entry_id: file.entry.id,
    anchor: { format: 'docx' as const, paragraph: 0 },
    excerpt: 'Selected text',
  },
};
let renderer: ReactTestRenderer | undefined;

type ProbeProps = {
  token?: string;
  initialAttachments?: readonly ComposerInitialAttachment[];
  workspaceSessionId?: string;
  workspaceFolderId?: string;
};
let props: ProbeProps;

function Probe({ token, initialAttachments, workspaceSessionId, workspaceFolderId }: ProbeProps) {
  const store = useManagedComposerAttachments(
    initialAttachments,
    workspaceSessionId,
    workspaceFolderId,
  );
  useEffect(() => {
    mockAttachmentStore = store;
  }, [store]);
  return (
    <ComposerProvider attachmentStore={store} initialDraft={mockInitialDraft}>
      <SelectionProbe token={token} />
    </ComposerProvider>
  );
}

function SelectionProbe({ token }: Pick<ProbeProps, 'token'>) {
  const { draft } = useComposerState();
  useEffect(() => {
    mockDraft = draft;
  }, [draft]);
  useChatSelectionHandoff(token);
  return null;
}

function render(next: ProbeProps) {
  props = next;
  act(() => {
    if (renderer) renderer.update(<Probe {...props} />);
    else renderer = create(<Probe {...props} />);
  });
}

function focus(focused = true) {
  mockFocused = focused;
  render(props);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFocused = false;
  mockReplayFocus = false;
  mockInitialDraft = 'Keep before and after';
  mockPrepareWorkspaceAttachment.mockResolvedValue(file);
});
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
});

it('appends once after the draft without replacing its text, attachments or seed', () => {
  const seed = createChatComposerHandoff({ attachments: [], draft: 'Original seed' });
  const existing = createReadyAttachmentDraft(
    { ...file, entry: { ...file.entry, id: '00000000-0000-7000-8000-000000000002' } },
    'existing',
  );
  const token = createChatSelectionHandoff({ attachment, selection });
  render({ token, initialAttachments: [existing] });
  expect(mockDraft).toBe('Keep before and after');

  focus();
  expect(readSelectionMentions(mockDraft)).toMatchObject({
    text: 'Keep before and after report.docx · ¶1 ',
    selectionReferences: [
      { ...selection, type: 'selection', offset: 'Keep before and after '.length },
    ],
  });
  expect(mockAttachmentStore.attachments).toEqual([existing, attachment]);
  expect(getChatComposerHandoff(seed)?.draft).toBe('Original seed');

  const inserted = mockDraft;
  focus(false);
  focus();
  expect(mockDraft).toBe(inserted);
  act(() => renderer?.unmount());
  renderer = undefined;
  mockInitialDraft = inserted;
  render({ token, initialAttachments: [existing, attachment] });
  focus();
  expect(mockDraft).toBe(inserted);
  expect(mockAttachmentStore.attachments).toEqual([existing, attachment]);
});

it('places the first reference of an empty draft without a leading space', () => {
  mockInitialDraft = '';
  render({ token: createChatSelectionHandoff({ attachment, selection }) });
  focus();
  expect(mockDraft.startsWith('[')).toBe(true);
  expect(readSelectionMentions(mockDraft).text).toBe('report.docx · ¶1 ');
});

it('keeps an earlier reference intact when appending after it', () => {
  const earlier = createChatSelectionHandoff({ attachment, selection });
  mockInitialDraft = '';
  render({ token: earlier });
  focus();
  focus(false);
  const second = { ...selection, label: 'report.docx · ¶2' };
  render({ token: createChatSelectionHandoff({ attachment, selection: second }) });
  focus();
  expect(readSelectionMentions(mockDraft).selectionReferences.map((ref) => ref.label)).toEqual([
    selection.label,
    second.label,
  ]);
});

it('adds a whole file once without touching the draft text', () => {
  const token = createChatSelectionHandoff({ attachment });
  render({ token });
  focus();
  expect(mockDraft).toBe('Keep before and after');
  expect(mockAttachmentStore.attachments).toEqual([attachment]);

  render({ token: createChatSelectionHandoff({ attachment: { ...attachment, id: 'again' } }) });
  expect(mockAttachmentStore.attachments).toEqual([attachment]);
  expect(mockDraft).toBe('Keep before and after');
});

it('deduplicates its attachment', () => {
  const token = createChatSelectionHandoff({ attachment, selection });
  const existing = { ...attachment, id: 'from-picker' };
  render({ token, initialAttachments: [existing] });
  focus();
  expect(readSelectionMentions(mockDraft).selectionReferences).toHaveLength(1);
  expect(mockAttachmentStore.attachments).toEqual([existing]);
  expect(mockPrepareWorkspaceAttachment).not.toHaveBeenCalled();
});

it('does not deliver a superseded selection to an older route', () => {
  const stale = createChatSelectionHandoff({ attachment, selection });
  const latest = createChatSelectionHandoff({ attachment, selection });
  render({ token: stale });
  focus();
  expect(mockDraft).toBe('Keep before and after');
  expect(mockAttachmentStore.attachments).toEqual([]);
  render({ token: latest });
  expect(readSelectionMentions(mockDraft).selectionReferences).toHaveLength(1);
});

it.each([
  { workspaceSessionId: 'session-1' },
  { workspaceFolderId: '00000000-0000-7000-8000-000000000003' },
])('references the prepared workspace copy for %j', async (workspace) => {
  const prepared = Promise.withResolvers<ResolvedFile>();
  mockPrepareWorkspaceAttachment.mockReturnValue(prepared.promise);
  const token = createChatSelectionHandoff({ attachment, selection });
  render({ token, ...workspace });
  focus();

  expect(mockDraft).toBe('Keep before and after');
  expect(mockAttachmentStore.attachments[0].status).toBe('importing');
  expect(mockPrepareWorkspaceAttachment).toHaveBeenCalledWith({
    fileEntryId: file.entry.id,
    ...('workspaceSessionId' in workspace
      ? { sessionId: workspace.workspaceSessionId }
      : { folderId: workspace.workspaceFolderId }),
  });

  const copy = {
    ...file,
    entry: { ...file.entry, id: '00000000-0000-7000-8000-000000000004' },
    uri: 'file:///workspace/report.docx',
  };
  await act(async () => prepared.resolve(copy));
  expect(readSelectionMentions(mockDraft)).toMatchObject({
    text: 'Keep before and after report.docx · ¶1 ',
    selectionReferences: [
      { ...selection, selection: { ...selection.selection, file_entry_id: copy.entry.id } },
    ],
  });
  expect(mockAttachmentStore.attachments).toEqual([
    createReadyAttachmentDraft(copy, attachment.id),
  ]);
  focus(false);
  focus();
  expect(readSelectionMentions(mockDraft).selectionReferences).toHaveLength(1);
});

it('waits for the chat to regain focus when workspace preparation finishes in the background', async () => {
  const prepared = Promise.withResolvers<ResolvedFile>();
  mockPrepareWorkspaceAttachment.mockReturnValue(prepared.promise);
  render({
    token: createChatSelectionHandoff({ attachment, selection }),
    workspaceSessionId: 'session-1',
  });
  focus();
  focus(false);
  await act(async () => prepared.resolve(file));
  expect(mockDraft).toBe('Keep before and after');
  focus();
  expect(readSelectionMentions(mockDraft).selectionReferences).toHaveLength(1);
});

it('retains the pending selection when the focus effect replays before attachments commit', async () => {
  const prepared = Promise.withResolvers<ResolvedFile>();
  mockPrepareWorkspaceAttachment.mockReturnValue(prepared.promise);
  mockReplayFocus = true;
  render({
    token: createChatSelectionHandoff({ attachment, selection }),
    workspaceSessionId: 'session-1',
  });
  focus();
  await act(async () => prepared.resolve(file));
  expect(readSelectionMentions(mockDraft).selectionReferences).toHaveLength(1);
  expect(mockPrepareWorkspaceAttachment).toHaveBeenCalledTimes(1);
});

it('does not insert a reference when workspace preparation fails', async () => {
  const prepared = Promise.withResolvers<ResolvedFile>();
  mockPrepareWorkspaceAttachment.mockReturnValue(prepared.promise);
  render({
    token: createChatSelectionHandoff({ attachment, selection }),
    workspaceSessionId: 'session-1',
  });
  focus();
  await act(async () => {
    prepared.reject(new Error('Workspace copy failed'));
  });
  expect(mockDraft).toBe('Keep before and after');
  expect(mockAttachmentStore.attachments).toEqual([]);
  expect(mockToastShow).toHaveBeenCalledWith({
    label: 'chat.attachments.importFailed',
    variant: 'danger',
  });
  focus(false);
  focus();
  expect(mockPrepareWorkspaceAttachment).toHaveBeenCalledTimes(1);
});

it('discards the waiting reference when its attachment is removed', async () => {
  const prepared = Promise.withResolvers<ResolvedFile>();
  mockPrepareWorkspaceAttachment.mockReturnValue(prepared.promise);
  render({
    token: createChatSelectionHandoff({ attachment, selection }),
    workspaceSessionId: 'session-1',
  });
  focus();
  act(() => mockAttachmentStore.removeAttachment(attachment.id));
  await act(async () => prepared.resolve(file));
  // Re-adding the same source later must not resurrect the cancelled selection.
  act(() => mockAttachmentStore.setAttachments([attachment]));
  expect(mockDraft).toBe('Keep before and after');
});

it('discards the waiting reference when its route token changes', async () => {
  const prepared = Promise.withResolvers<ResolvedFile>();
  mockPrepareWorkspaceAttachment.mockReturnValue(prepared.promise);
  render({
    token: createChatSelectionHandoff({ attachment, selection }),
    workspaceSessionId: 'session-1',
  });
  focus();
  render({ workspaceSessionId: 'session-1' });
  await act(async () => prepared.resolve(file));
  expect(mockDraft).toBe('Keep before and after');
});
