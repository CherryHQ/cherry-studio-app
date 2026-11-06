import { type ReactNode, useEffect } from 'react';
import type { EnrichedMarkdownTextInputInstance } from 'react-native-enriched-markdown';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ComposerTestProvider } from '@/frontend/components/Composer/components/__tests__/_composerTestProvider';
import {
  useComposerActions,
  useComposerMeta,
  useComposerState,
} from '@/frontend/components/Composer/context/ComposerProvider';
import type { ComposerAttachmentReady } from '@/frontend/components/Composer/utils/composerAttachments';
import type { AgentQueuedInput, QuoteFields } from '@/shared/contracts/agent';
import { FileEntrySchema } from '@/shared/data/types/file';

import { ChatInputComposer, ChatInputSurface } from '../../ChatInputSurface';
import { toAgentInputParts } from '../../utils/agentInputParts';
import { ChatInputQueue } from '../ChatInputQueue';

const mockToast = jest.fn();
const mockCancel = jest.fn();
const mockSubmit = jest.fn();
const mockStop = jest.fn();
const mockOpenFile = jest.fn();
let mockEnterToSend = true;
let mockInputs: AgentQueuedInput[];
let composer: ReturnType<typeof useComposerState>;
let actions: ReturnType<typeof useComposerActions>;
const mockFile = {
  entry: FileEntrySchema.parse({
    id: '00000000-0000-4000-8000-000000000001',
    filename: 'photo.png',
    mediaType: 'image/png',
    size: 123,
    provenance: 'imported',
    createdAt: 0,
    updatedAt: 0,
  }),
  uri: 'file:///photo.png',
};
const existingAttachment: ComposerAttachmentReady = {
  id: 'existing',
  kind: 'image',
  mediaType: 'image/png',
  name: 'existing.png',
  fileEntryId: 'existing-entry',
  status: 'ready',
  uri: 'file:///existing.png',
};

jest.mock('expo-router', () => ({ useIsFocused: () => true }));
const mockRestoreQuote = jest.fn();
let mockQuoteFields: QuoteFields = {};
jest.mock('../../../../quotes/ChatQuoteContext', () => ({
  useChatQuoteActions: () => ({ restoreQuote: mockRestoreQuote }),
  useChatQuoteState: () => ({ fields: mockQuoteFields, isBusy: false }),
}));
jest.mock('../../../../runtime', () => ({
  useAgentChatClient: () => ({ client: { cancelQueuedInput: mockCancel } }),
  useAgentQueuedInputs: () => mockInputs,
}));
jest.mock('@/frontend/components/Composer', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    ...jest.requireActual('@/frontend/components/Composer/context/ComposerProvider'),
    ...jest.requireActual('@/frontend/components/Composer/components/ComposerSurface'),
    // The editor is the native input boundary; the queue test exercises the
    // actual ChatInputSurface callbacks, preferences and submission owner.
    ComposerEditor: ({ children, ...props }: { children?: ReactNode }) =>
      React.createElement('ChatEditor', props, children),
    ComposerEditorAccessories: ({ children }: { children?: ReactNode }) => children,
  };
});
jest.mock('@/frontend/data/hooks', () => ({
  usePreference: () => [mockEnterToSend, jest.fn()],
}));
jest.mock('../../../../voice/ChatInputPrimaryAction', () => ({
  ChatInputPrimaryAction: () => null,
}));
jest.mock('../../../../voice/DictationCancelAction', () => ({
  DictationCancelAction: () => null,
}));
jest.mock('../../../../voice/DictationStatus', () => ({ DictationStatus: () => null }));
jest.mock('../../../../voice/useDictation', () => ({ useDictation: jest.fn() }));
jest.mock('../../../../voice/useDictationAvailability', () => ({
  useDictationAvailability: jest.fn(),
}));
jest.mock('@/frontend/components/Composer/hooks/useComposerPresentation', () => ({
  useComposerPresentation: () => ({
    state: { isEditing: true },
    actions: { dismissInput: jest.fn() },
  }),
}));
jest.mock('@/frontend/components/Composer/hooks/useComposerSendError', () => ({
  useComposerSendError: () => jest.fn(),
}));
jest.mock('@/frontend/components/FileEntryPreview', () => ({
  ...jest.requireActual('@/frontend/components/FileEntryPreview/FileEntryPreview'),
  ...jest.requireMock('@/frontend/components/FileEntryPreview/hooks/useResolvedFile'),
  ...jest.requireMock('@/frontend/components/FileEntryPreview/hooks/useOpenFileEntry'),
}));
jest.mock('@/frontend/components/FileEntryPreview/hooks/useResolvedFile', () => ({
  useResolvedFile: () => ({ data: mockFile, isLoading: false }),
}));
jest.mock('@/frontend/components/FileEntryPreview/hooks/useOpenFileEntry', () => ({
  useOpenFileEntry: () => ({ openFileEntry: mockOpenFile }),
}));
jest.mock('@/frontend/components/FileEntryPreview/FileEntryImage', () => ({
  FileEntryImage: () => null,
}));
jest.mock('@/frontend/components/FileEntryPreview/FileEntrySkeleton', () => ({
  FileEntrySkeleton: () => null,
  FileEntryAttachmentSkeleton: () => null,
}));
jest.mock('@cherrystudio/ui/components', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const host = (name: string) =>
    function MockControl({ children, ...props }: { children?: ReactNode }) {
      return React.createElement(name, props, children);
    };
  return {
    Alert: host('QueueAlert'),
    Button: host('QueueButton'),
    Surface: host('Surface'),
    Composer: Object.assign(host('NormalComposer'), {
      Action: host('ComposerAction'),
      Send: host('ComposerSend'),
      EditorSecondary: host('EditorSecondary'),
    }),
    FilePreview: host('FilePreview'),
    BottomSheet: ({ children, footer, ...props }: { children?: ReactNode; footer?: ReactNode }) =>
      React.createElement('Sheet', props, children, footer),
    useToast: () => ({ toast: { show: mockToast } }),
    useComposerExpansion: () => null,
  };
});
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const catalog = jest.requireActual<Record<string, string>>(
        '@/frontend/i18n/locales/en-us.json',
      );
      return (
        catalog[key]?.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(options?.[name])) ?? key
      );
    },
  }),
}));

const longText = `${'Full queued text. '.repeat(300)}TAIL_SENTINEL`;
function input(turnId = 'turn-1'): AgentQueuedInput {
  return {
    turnId,
    assistantMessageId: `assistant-${turnId}`,
    userMessage: {
      id: `user-${turnId}`,
      sessionId: 'session-1',
      parentId: null,
      turnId,
      role: 'user',
      status: 'pending',
      modelId: null,
      inferenceSnapshot: null,
      stats: null,
      createdAt: '2026-10-27T00:00:00.000Z',
      updatedAt: '2026-10-27T00:00:00.000Z',
      parts: [
        { id: 'text-1', type: 'text', text: longText, state: 'done' },
        {
          id: 'file-1',
          type: 'file',
          fileEntryId: mockFile.entry.id,
          mediaType: 'image/png',
          filename: 'photo.png',
          purpose: 'input-attachment',
        },
        { id: 'text-2', type: 'text', text: ' After attachment\n  whitespace ', state: 'done' },
      ],
    },
  };
}
const restoredText = `${longText}\n After attachment\n  whitespace `;
let tree: ReactTestRenderer;
function createInputHandle(): EnrichedMarkdownTextInputInstance {
  return {
    focus: jest.fn(),
    blur: jest.fn(),
    measure: jest.fn(),
    measureInWindow: jest.fn(),
    measureLayout: jest.fn(),
    setValue: jest.fn(),
    setSelection: jest.fn(),
    toggleBold: jest.fn(),
    toggleItalic: jest.fn(),
    toggleUnderline: jest.fn(),
    toggleStrikethrough: jest.fn(),
    toggleSpoiler: jest.fn(),
    toggleHeading: jest.fn(),
    toggleUnorderedList: jest.fn(),
    toggleOrderedList: jest.fn(),
    indentList: jest.fn(),
    outdentList: jest.fn(),
    setLink: jest.fn(),
    insertLink: jest.fn(),
    insertText: jest.fn(),
    insertMention: jest.fn(),
    startMention: jest.fn(),
    removeLink: jest.fn(),
    copyToClipboard: jest.fn(),
    getMarkdown: jest.fn(() => Promise.resolve('')),
    getCaretRect: jest.fn(() => Promise.resolve({ x: 0, y: 0, width: 0, height: 0 })),
  };
}
function Probe() {
  const state = useComposerState();
  const composerActions = useComposerActions();
  const { inputRef } = useComposerMeta();
  useEffect(() => {
    composer = state;
    actions = composerActions;
  }, [state, composerActions]);
  useEffect(() => {
    inputRef.current = createInputHandle();
    return () => {
      inputRef.current = null;
    };
  }, [inputRef]);
  return null;
}
const NO_ATTACHMENTS: ComposerAttachmentReady[] = [];
function Harness({
  initialDraft = '',
  initialAttachments = NO_ATTACHMENTS,
}: {
  initialDraft?: string;
  initialAttachments?: ComposerAttachmentReady[];
}) {
  return (
    <ComposerTestProvider initialDraft={initialDraft} initialAttachments={initialAttachments}>
      <Probe />
      <ChatInputQueue sessionId="session-1" />
      <ChatInputComposer
        streaming
        onStop={mockStop}
        onSend={async (payload) => {
          await mockSubmit(toAgentInputParts(payload));
          mockInputs = [
            ...mockInputs,
            {
              ...input('resent'),
              userMessage: {
                ...input('resent').userMessage,
                parts: [{ id: 'resent-text', type: 'text', state: 'done', text: payload.text }],
              },
            },
          ];
        }}
      >
        <ChatInputSurface streaming onStop={mockStop} />
      </ChatInputComposer>
    </ComposerTestProvider>
  );
}
function render(initialDraft = '', initialAttachments: ComposerAttachmentReady[] = []) {
  act(() => {
    tree = create(<Harness initialDraft={initialDraft} initialAttachments={initialAttachments} />);
  });
}
function open() {
  act(() => tree.root.findByProps({ testID: 'queue-preview-turn-1' }).props.onPress());
}
async function press(testID: string) {
  await act(async () => tree.root.findByProps({ testID }).props.onPress());
}
function alert() {
  return tree.root.findByType('QueueAlert' as never);
}
function text() {
  return tree.root
    .findAll((node) => typeof node.props.children === 'string')
    .map((node) => node.props.children as string)
    .join('\n');
}
function queueCount() {
  const rows = tree.root
    .findAll(
      (node) =>
        typeof node.props.testID === 'string' && node.props.testID.startsWith('queue-preview-'),
    )
    .map((node) => node.props.testID as string);
  return String(new Set(rows).size);
}
function refresh() {
  act(() => tree.update(<Harness />));
}
beforeEach(() => {
  jest.clearAllMocks();
  mockQuoteFields = {};
  mockEnterToSend = true;
  mockInputs = [input(), input('turn-2')];
  mockCancel.mockImplementation(async (_sessionId: string, turnId: string) => {
    mockInputs = mockInputs.filter((queued) => queued.turnId !== turnId);
    return 'withdrawn';
  });
});
afterEach(() => {
  act(() => tree?.unmount());
});

it('opens all full text without changing count, positions or queue, and closing changes nothing', () => {
  render();
  const before = JSON.stringify(mockInputs);
  expect(queueCount()).toBe('2');
  expect(text()).not.toContain('TAIL_SENTINEL');
  open();
  expect(text()).toContain(longText);
  expect(text()).toContain(' After attachment\n  whitespace ');
  for (const position of [1, 2]) {
    expect(
      tree.root.findByProps({ accessibilityLabel: `Preview queued message ${position}` }),
    ).toBeTruthy();
  }
  expect(queueCount()).toBe('2');
  act(() => tree.root.findByType('Sheet' as never).props.onClose());
  expect(queueCount()).toBe('2');
  expect(JSON.stringify(mockInputs)).toBe(before);
  expect(mockCancel).not.toHaveBeenCalled();
  expect(mockSubmit).not.toHaveBeenCalled();
});

it('opens a supported attachment through the existing FileEntryPreview path without withdrawing or sending', () => {
  render();
  open();
  const before = JSON.stringify(mockInputs);
  act(() =>
    tree.root.findByProps({ testID: `queue-attachment-${mockFile.entry.id}` }).props.onPress(),
  );
  expect(mockOpenFile).toHaveBeenCalledWith(mockFile);
  expect(JSON.stringify(mockInputs)).toBe(before);
  expect(mockCancel).not.toHaveBeenCalled();
  expect(mockSubmit).not.toHaveBeenCalled();
});

it.each(['chat-input-queue-remove-turn-1', 'queue-detail-remove'])(
  'preserves Remove via %s',
  async (testID) => {
    render();
    if (testID === 'queue-detail-remove') open();
    await press(testID);
    expect(mockCancel).toHaveBeenCalledWith('session-1', 'turn-1');
    expect(mockInputs.map((queued) => queued.turnId)).toEqual(['turn-2']);
    refresh();
    expect(queueCount()).toBe('1');
    expect(composer.draft).toBe('');
    expect(composer.attachments).toEqual([]);
  },
);

it('restores text and ready attachment references only after confirmed withdrawal', async () => {
  render();
  open();
  let finish!: (value: string) => void;
  mockCancel.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await press('queue-take-back');
  expect(composer.draft).toBe('');
  expect(composer.attachments).toEqual([]);
  await act(async () => {
    mockInputs = mockInputs.slice(1);
    finish('withdrawn');
  });
  expect(mockCancel).toHaveBeenCalledTimes(1);
  expect(composer.draft).toBe(restoredText);
  expect(composer.attachments).toEqual([
    expect.objectContaining({
      id: 'file-1',
      fileEntryId: mockFile.entry.id,
      status: 'ready',
      kind: 'image',
    }),
  ]);
  expect(mockInputs.map((queued) => queued.turnId)).toEqual(['turn-2']);
  expect(tree.root.findAllByType('Sheet' as never)).toHaveLength(0);
  expect(mockSubmit).not.toHaveBeenCalled();
  expect(mockStop).not.toHaveBeenCalled();
});

it.each(['text', 'attachments', 'both'])(
  'keeps %s byte-identical when conflict is cancelled or dismissed',
  async (content) => {
    render(
      content === 'attachments' ? '' : '  Existing\n draft ',
      content === 'text' ? [] : [existingAttachment],
    );
    open();
    const before = JSON.stringify({ composer, inputs: mockInputs });
    for (const choice of [1, 'dismiss'] as const) {
      await press('queue-take-back');
      expect(alert().props.isOpen).toBe(true);
      expect(alert().props.actions.map((action: { label: string }) => action.label)).toEqual([
        'Replace composer content',
        'Cancel take-back',
      ]);
      act(() => {
        if (choice === 'dismiss') alert().props.onOpenChange(false);
        else alert().props.actions[choice].onPress();
      });
      expect(JSON.stringify({ composer, inputs: mockInputs })).toBe(before);
      expect(mockCancel).not.toHaveBeenCalled();
    }
  },
);

it('resolves replacement before withdrawing and replaces both text and attachments', async () => {
  render('existing', [existingAttachment]);
  open();
  await press('queue-take-back');
  expect(mockCancel).not.toHaveBeenCalled();
  await act(async () => alert().props.actions[0].onPress());
  expect(mockCancel).toHaveBeenCalledTimes(1);
  expect(composer.draft).toBe(restoredText);
  expect(composer.attachments.map((attachment) => attachment.id)).toEqual(['file-1']);
});

it.each([
  ['already-started', 'This message has already started.'],
  ['not-found', 'This message is no longer in the queue.'],
])(
  'preserves the composer for %s and explains the result without success',
  async (result, label) => {
    render('existing', [existingAttachment]);
    open();
    const before = JSON.stringify(composer);
    mockCancel.mockResolvedValue(result);
    await press('queue-take-back');
    await act(async () => alert().props.actions[0].onPress());
    expect(JSON.stringify(composer)).toBe(before);
    expect(mockToast).toHaveBeenCalledWith({ label });
    expect(mockToast.mock.calls.some(([feedback]) => feedback.variant === 'success')).toBe(false);
    expect(mockStop).not.toHaveBeenCalled();
  },
);

it('preserves the composer and explains a rejected withdrawal', async () => {
  render('existing', [existingAttachment]);
  open();
  const before = JSON.stringify(composer);
  mockCancel.mockRejectedValue(new Error('private diagnostic'));
  await press('queue-take-back');
  await act(async () => alert().props.actions[0].onPress());
  expect(JSON.stringify(composer)).toBe(before);
  expect(mockToast).toHaveBeenCalledWith({
    label: "Couldn't take back the queued message. Your draft is unchanged.",
    variant: 'danger',
  });
});

it('allows one in-flight cancellation for repeated take-back and Remove taps', async () => {
  render();
  open();
  let finish!: (value: string) => void;
  mockCancel.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const takeBack = tree.root.findByProps({ testID: 'queue-take-back' }).props.onPress;
  const remove = tree.root.findByProps({ testID: 'chat-input-queue-remove-turn-1' }).props.onPress;
  act(() => {
    takeBack();
    takeBack();
    remove();
  });
  expect(mockCancel).toHaveBeenCalledTimes(1);
  expect(tree.root.findByProps({ testID: 'queue-take-back' }).props.disabled).toBe(true);
  await act(async () => finish('withdrawn'));
  act(() => {
    takeBack();
    remove();
  });
  expect(mockCancel).toHaveBeenCalledTimes(1);
});

it('resends through the normal composer send path and appends after waiting messages', async () => {
  render();
  open();
  await press('queue-take-back');
  expect(mockSubmit).not.toHaveBeenCalled();
  act(() => actions.setDraft('Edited in the normal composer'));
  await act(async () => tree.root.findByType('NormalComposer' as never).props.onSend());
  refresh();
  expect(mockSubmit).toHaveBeenCalledTimes(1);
  expect(mockSubmit.mock.calls[0][0]).toEqual([
    { type: 'text', text: 'Edited in the normal composer' },
    { type: 'file', fileEntryId: mockFile.entry.id, mediaType: 'image/png', filename: 'photo.png' },
  ]);
  expect(mockInputs.map((queued) => queued.turnId)).toEqual(['turn-2', 'resent']);
  expect(composer.draft).toBe('');
  expect(composer.attachments).toEqual([]);
  expect(mockStop).not.toHaveBeenCalled();
});

it('submits Return during streaming through the send path after waiting messages', async () => {
  render('Follow up while streaming', [existingAttachment]);
  expect(tree.root.findByType('ChatEditor' as never).props.submitOnReturn).toBe(true);
  await act(async () =>
    tree.root.findByType('ChatEditor' as never).props.onReturnSubmit('Follow up while streaming'),
  );
  refresh();

  expect(mockSubmit).toHaveBeenCalledTimes(1);
  expect(mockSubmit).toHaveBeenCalledWith([
    { type: 'text', text: 'Follow up while streaming' },
    {
      type: 'file',
      fileEntryId: existingAttachment.fileEntryId,
      mediaType: existingAttachment.mediaType,
      filename: existingAttachment.name,
    },
  ]);
  expect(mockInputs.map((queued) => queued.turnId)).toEqual(['turn-1', 'turn-2', 'resent']);
  expect(composer.draft).toBe('');
  expect(composer.attachments).toEqual([]);
  expect(mockStop).not.toHaveBeenCalled();
});

it('ignores repeated Return while submission is pending and preserves a newer draft', async () => {
  render('First follow-up');
  let finish!: () => void;
  mockSubmit.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  const submit = tree.root.findByType('ChatEditor' as never).props.onReturnSubmit;
  let sending!: Promise<void>;
  act(() => {
    sending = submit('First follow-up');
    void submit('First follow-up');
  });
  act(() => actions.setDraft('Newer follow-up'));
  await act(async () => submit('Newer follow-up'));
  expect(mockSubmit).toHaveBeenCalledTimes(1);
  expect(composer.draft).toBe('Newer follow-up');
  await act(async () => {
    finish();
    await sending;
  });
  expect(composer.draft).toBe('Newer follow-up');
  expect(mockStop).not.toHaveBeenCalled();
});

it('uses the latest native text even before the controlled draft catches up', async () => {
  render('Older draft');
  await act(async () =>
    tree.root.findByType('ChatEditor' as never).props.onReturnSubmit('Latest native draft'),
  );
  expect(mockSubmit).toHaveBeenCalledWith([{ type: 'text', text: 'Latest native draft' }]);
});

it('ignores a whitespace-only keyboard submission', async () => {
  render('');
  await act(async () => tree.root.findByType('ChatEditor' as never).props.onReturnSubmit(' \n '));
  expect(mockSubmit).not.toHaveBeenCalled();
  expect(mockStop).not.toHaveBeenCalled();
});

it('keeps native Return as editing when the preference is off', () => {
  mockEnterToSend = false;
  render('Use keyboard newlines');
  expect(tree.root.findByType('ChatEditor' as never).props.submitOnReturn).toBe(false);
});

it('closes the detail sheet when the existing preview opens beside chat', () => {
  render();
  open();
  mockOpenFile.mockReturnValueOnce('pane');
  const before = JSON.stringify(mockInputs);
  act(() =>
    tree.root.findByProps({ testID: `queue-attachment-${mockFile.entry.id}` }).props.onPress(),
  );
  expect(tree.root.findAllByType('Sheet' as never)).toHaveLength(0);
  expect(JSON.stringify(mockInputs)).toBe(before);
  expect(mockCancel).not.toHaveBeenCalled();
});

it('preserves newer composer content during withdrawal and can restore later without another cancel', async () => {
  render();
  open();
  let finish!: (value: string) => void;
  mockCancel.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await press('queue-take-back');
  act(() => actions.setDraft('Newer draft'));
  await act(async () => {
    mockInputs = mockInputs.slice(1);
    finish('withdrawn');
  });
  expect(composer.draft).toBe('Newer draft');
  expect(mockToast).toHaveBeenCalledWith({
    label: expect.stringContaining('your draft changed'),
    variant: 'danger',
  });
  await press('queue-take-back');
  expect(alert().props.isOpen).toBe(true);
  await act(async () => alert().props.actions[0].onPress());
  expect(composer.draft).toBe(restoredText);
  expect(mockCancel).toHaveBeenCalledTimes(1);
});

it('numbers rows in sending order and joins attachments and the quote in one quiet line', () => {
  const quoted = input();
  quoted.userMessage.parts = [
    {
      id: 'text-1',
      type: 'text',
      text: 'Make it work offline',
      state: 'done',
      quotes: [
        {
          id: 'q',
          sourceMessageId: '00000000-0000-7000-8000-000000000001',
          text: 'Store **records** in the browser',
        },
      ],
      quoteAuthor: { role: 'assistant', name: 'Cherry' },
    },
    ...quoted.userMessage.parts.filter((part) => part.type === 'file'),
  ];
  mockInputs = [quoted, input('turn-2')];
  render();
  const row = tree.root.findByProps({ testID: 'queue-preview-turn-1' });
  const strings = (nodes: { props: { children?: unknown } }[]) => [
    ...new Set(nodes.map((node) => String(node.props.children))),
  ];
  expect(strings(row.findAll((node) => typeof node.props.children === 'string'))).toEqual([
    'Make it work offline',
    'photo.png · Cherry: Store records in the browser',
  ]);
  expect(
    strings(tree.root.findAll((node) => node.props.className?.includes?.('tabular-nums'))),
  ).toEqual(['1', '2']);
});

it('taking back a queued message puts its quote back in the composer, or clears it', async () => {
  const quote = {
    id: 'q',
    sourceMessageId: '00000000-0000-7000-8000-000000000001',
    text: 'Passage',
  };
  const quoted = input();
  quoted.userMessage.parts = [
    {
      id: 'text-1',
      type: 'text',
      text: 'Offline please',
      state: 'done',
      quotes: [quote],
      quoteAuthor: { role: 'assistant', name: 'Cherry' },
    },
  ];
  mockInputs = [quoted, input('turn-2')];
  render();
  open();
  expect(text()).toContain('Cherry: Passage');
  await press('queue-take-back');
  expect(composer.draft).toBe('Offline please');
  expect(mockRestoreQuote).toHaveBeenCalledWith(
    expect.objectContaining({
      quotes: [quote],
      quoteAuthor: { role: 'assistant', name: 'Cherry' },
    }),
  );
  act(() => actions.setDraft(''));
  act(() => tree.root.findByProps({ testID: 'queue-preview-turn-2' }).props.onPress());
  await press('queue-take-back');
  expect(mockRestoreQuote).toHaveBeenLastCalledWith({});
});

it('asks before replacing a quote the composer already holds', async () => {
  mockQuoteFields = {
    quotes: [{ id: 'q', sourceMessageId: '00000000-0000-7000-8000-000000000001', text: 'Held' }],
    quoteAuthor: { role: 'assistant' },
  };
  render();
  open();
  await press('queue-take-back');
  expect(alert().props.isOpen).toBe(true);
  act(() => alert().props.onOpenChange(false));
  expect(mockCancel).not.toHaveBeenCalled();
  expect(mockRestoreQuote).not.toHaveBeenCalled();
});
