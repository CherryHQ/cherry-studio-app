import { createRef, type Ref, useImperativeHandle } from 'react';
import { act, create } from 'react-test-renderer';

import { ComposerTestProvider } from '@/frontend/components/Composer/components/__tests__/_composerTestProvider';
import { useComposerState } from '@/frontend/components/Composer/context/ComposerProvider';
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

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

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
  ReturnType<typeof useChatEditing> & { draft: string; attachmentCount: number };

function Probe({ ref }: { ref: Ref<ProbeHandle> }) {
  const editDraft = useChatEditDraft();
  const editing = useChatEditing();
  const { attachments, draft } = useComposerState();
  useImperativeHandle(
    ref,
    () => ({ ...editDraft, ...editing, attachmentCount: attachments.length, draft }),
    [editDraft, editing, attachments.length, draft],
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
  test('beginning an edit stashes the draft and attachments and loads the question', () => {
    const { probeRef, renderer } = render('Interrupted draft');
    expect(probeRef.current?.draft).toBe('Interrupted draft');

    act(() => probeRef.current?.beginEdit(target));
    expect(probeRef.current?.draft).toBe('Original question');
    expect(probeRef.current?.attachmentCount).toBe(0);

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

  test('committing clears the stash so a later edit starts from the live draft', () => {
    const { probeRef, renderer } = render('Interrupted draft');
    act(() => probeRef.current?.beginEdit(target));
    act(() => probeRef.current?.commitEdit());
    expect(probeRef.current?.editing).toBeNull();
    // The submitted edit leaves the composer holding the edited text.
    expect(probeRef.current?.draft).toBe('Original question');

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
