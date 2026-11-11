import { createRef, type Ref, useImperativeHandle } from 'react';
import { act, create } from 'react-test-renderer';

import { ComposerTestProvider } from '@/frontend/components/Composer/components/__tests__/_composerTestProvider';
import {
  useComposerActions,
  useComposerMeta,
  useComposerState,
} from '@/frontend/components/Composer/context/ComposerProvider';
import {
  createReadyAttachmentDraft,
  type ComposerAttachmentReady,
} from '@/frontend/components/Composer/utils/composerAttachments';
import { FileEntrySchema } from '@/shared/data/types/file';

import {
  ChatEditingProvider,
  type ChatEditingTarget,
  useChatEditing,
} from '../../../../context/ChatEditingProvider';
import { useChatEditDraft } from '../useChatEditDraft';
jest.mock('react-native-reanimated', () =>
  jest.requireActual('@/frontend/components/Composer/components/__tests__/_sharedValueMock'),
);

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mockFocus = jest.fn();

const attachment = createReadyAttachmentDraft(
  {
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
  },
  'file-entry:report',
) as ComposerAttachmentReady;

type ProbeHandle = ReturnType<typeof useChatEditDraft> &
  ReturnType<typeof useChatEditing> &
  ReturnType<typeof useComposerActions> & { draft: string; attachmentCount: number };

function Probe({ ref }: { ref: Ref<ProbeHandle> }) {
  const { inputRef } = useComposerMeta();
  inputRef.current = { focus: mockFocus } as never;
  const editDraft = useChatEditDraft();
  const editing = useChatEditing();
  const composerActions = useComposerActions();
  const { attachments, draft } = useComposerState();
  useImperativeHandle(
    ref,
    () => ({
      ...editDraft,
      ...editing,
      ...composerActions,
      attachmentCount: attachments.length,
      draft,
    }),
    [editDraft, editing, composerActions, attachments.length, draft],
  );
  return null;
}

function render(initialDraft: string) {
  const probeRef = createRef<ProbeHandle>();
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      <ComposerTestProvider initialAttachments={[attachment]} initialDraft={initialDraft}>
        <ChatEditingProvider>
          <Probe ref={probeRef} />
        </ChatEditingProvider>
      </ComposerTestProvider>,
    );
  });
  return { probeRef, renderer };
}

const target: ChatEditingTarget = { messageId: 'user-1', initialText: 'Original question' };

describe('useChatEditDraft', () => {
  beforeEach(() => mockFocus.mockClear());
  test('beginning an edit stashes the draft and attachments and loads the question', () => {
    const { probeRef, renderer } = render('Interrupted draft');
    expect(probeRef.current?.draft).toBe('Interrupted draft');

    act(() => probeRef.current?.beginEdit(target));
    expect(probeRef.current?.draft).toBe('Original question');
    expect(probeRef.current?.attachmentCount).toBe(0);
    expect(mockFocus).toHaveBeenCalledTimes(1);

    act(() => renderer.unmount());
  });

  test('cancelling restores the interrupted draft and attachments exactly once', () => {
    const { probeRef, renderer } = render('Interrupted draft');
    act(() => probeRef.current?.beginEdit(target));

    act(() => probeRef.current?.cancelEdit());
    expect(probeRef.current?.draft).toBe('Interrupted draft');
    expect(probeRef.current?.attachmentCount).toBe(1);
    expect(probeRef.current?.editing).toBeNull();

    // The stash is spent: the next edit starts from the live composer state.
    act(() => probeRef.current?.beginEdit(target));
    expect(probeRef.current?.draft).toBe('Original question');
    expect(probeRef.current?.attachmentCount).toBe(0);

    act(() => renderer.unmount());
  });

  test('successful admission restores the interrupted draft and attachments', () => {
    const { probeRef, renderer } = render('Interrupted draft');
    act(() => probeRef.current?.beginEdit(target));
    act(() => probeRef.current?.setDraft(''));
    act(() => probeRef.current?.commitEdit());
    expect(probeRef.current?.editing).toBeNull();
    expect(probeRef.current?.draft).toBe('Interrupted draft');
    expect(probeRef.current?.attachmentCount).toBe(1);
    act(() => probeRef.current?.beginEdit(target));
    expect(probeRef.current?.draft).toBe('Original question');
    expect(probeRef.current?.attachmentCount).toBe(0);
    act(() => probeRef.current?.cancelEdit());
    expect(probeRef.current?.draft).toBe('Interrupted draft');
    expect(probeRef.current?.attachmentCount).toBe(1);

    act(() => renderer.unmount());
  });

  test('successful admission preserves text and attachments added while awaiting it', () => {
    const { probeRef, renderer } = render('Interrupted draft');
    act(() => probeRef.current?.beginEdit(target));
    act(() => {
      probeRef.current?.setDraft('New text typed during admission');
      probeRef.current?.addAttachments([
        {
          ...attachment,
          id: 'new-attachment',
          fileEntryId: '00000000-0000-7000-8000-000000000002',
        },
      ]);
    });
    act(() => probeRef.current?.commitEdit());
    expect(probeRef.current?.draft).toBe('Interrupted draft\nNew text typed during admission');
    expect(probeRef.current?.attachmentCount).toBe(2);
    expect(probeRef.current?.editing).toBeNull();
    act(() => renderer.unmount());
  });

  test('cancel without an edit session is a no-op', () => {
    const { probeRef, renderer } = render('Interrupted draft');
    act(() => probeRef.current?.cancelEdit());
    expect(probeRef.current?.draft).toBe('Interrupted draft');
    expect(probeRef.current?.attachmentCount).toBe(1);

    act(() => renderer.unmount());
  });
});
