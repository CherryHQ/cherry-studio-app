import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import {
  createChatComposerHandoff,
  createChatSelectionHandoff,
  getChatComposerHandoff,
} from '@/frontend/appShell/navigation/chat';
import {
  appendComposerAttachments,
  type ComposerAttachmentDraft,
  createReadyAttachmentDraft,
} from '@/frontend/components/Composer/utils/composerAttachments';
import { FileEntrySchema } from '@/shared/data/types/file';

import { readSelectionMentions } from '../../utils/selectionMentions';
import { useChatSelectionHandoff } from '../useChatSelectionHandoff';

let mockFocus: (() => void) | undefined;
let mockDraft = '';
let mockCaret = 0;
let mockAttachments: ComposerAttachmentDraft[] = [];
const mockInput = {
  insertText(text: string) {
    mockDraft = mockDraft.slice(0, mockCaret) + text + mockDraft.slice(mockCaret);
    mockCaret += text.length;
  },
  insertLink(label: string, url: string) {
    this.insertText(`[${label}](${url})`);
  },
};
const mockInputRef: { current: typeof mockInput | null } = { current: mockInput };
const mockAddAttachments = (next: ComposerAttachmentDraft[]) => {
  mockAttachments = appendComposerAttachments(mockAttachments, next);
};

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => {
    mockFocus = callback;
  },
}));
jest.mock('@/frontend/components/Composer', () => ({
  useComposerMeta: () => ({ inputRef: mockInputRef }),
  useComposerActions: () => ({ addAttachments: mockAddAttachments }),
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

function Probe({ token }: { token: string }) {
  useChatSelectionHandoff(token);
  return null;
}

beforeEach(() => {
  mockDraft = 'Keep before and after';
  mockCaret = 'Keep before '.length;
  mockAttachments = [];
  mockInputRef.current = mockInput;
});
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
});

it('inserts once at the retained caret without replacing draft text, attachments or its seed', () => {
  const seed = createChatComposerHandoff({ attachments: [], draft: 'Original seed' });
  const existing = createReadyAttachmentDraft(
    { ...file, entry: { ...file.entry, id: '00000000-0000-7000-8000-000000000002' } },
    'existing',
  );
  mockAttachments = [existing];
  const token = createChatSelectionHandoff({ attachment, selection });
  act(() => {
    renderer = create(<Probe token={token} />);
  });
  expect(mockDraft).toBe('Keep before and after');

  act(() => mockFocus?.());
  expect(readSelectionMentions(mockDraft)).toMatchObject({
    text: 'Keep before report.docx · ¶1 and after',
    selectionReferences: [{ ...selection, type: 'selection', offset: 'Keep before '.length }],
  });
  expect(mockAttachments).toEqual([existing, attachment]);
  expect(getChatComposerHandoff(seed)?.draft).toBe('Original seed');

  const inserted = mockDraft;
  act(() => mockFocus?.());
  act(() => {
    renderer?.unmount();
    renderer = create(<Probe token={token} />);
  });
  act(() => mockFocus?.());
  expect(mockDraft).toBe(inserted);
  expect(mockAttachments).toEqual([existing, attachment]);
});

it('keeps the pending reference until the input is available and deduplicates its attachment', () => {
  const token = createChatSelectionHandoff({ attachment, selection });
  mockAttachments = [attachment];
  mockInputRef.current = null;
  act(() => {
    renderer = create(<Probe token={token} />);
  });
  act(() => mockFocus?.());
  expect(mockDraft).toBe('Keep before and after');
  mockInputRef.current = mockInput;
  act(() => mockFocus?.());
  expect(readSelectionMentions(mockDraft).selectionReferences).toHaveLength(1);
  expect(mockAttachments).toEqual([attachment]);
});

it('does not deliver a superseded selection to an older route', () => {
  const stale = createChatSelectionHandoff({ attachment, selection });
  const latest = createChatSelectionHandoff({ attachment, selection });
  act(() => {
    renderer = create(<Probe token={stale} />);
  });
  act(() => mockFocus?.());
  expect(mockDraft).toBe('Keep before and after');
  expect(mockAttachments).toEqual([]);
  act(() => renderer?.update(<Probe token={latest} />));
  act(() => mockFocus?.());
  expect(readSelectionMentions(mockDraft).selectionReferences).toHaveLength(1);
});
