import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ComposerSendPayload } from '@/frontend/components/Composer';
import type { PaintingInputSubmission } from '@/frontend/components/PaintingInput';
import type { QuoteFields } from '@/shared/contracts/agent';

import { createQuoteMention, readQuoteMentions } from '../../../quotes/quoteMentions';
import { ChatInput } from '../ChatInput';
let mockEditing: { messageId: string; initialText: string; attachmentCount: number } | null = null;
let mockDraft = '';
const mockCommitEdit = jest.fn();
const mockEditMessage = jest.fn();
jest.mock('@cherrystudio/ui/components', () => ({
  Button: (props: object) => jest.requireActual('react').createElement('Button', props),
}));
jest.mock('../hooks/useChatEditDraft', () => ({
  useChatEditDraft: () => ({
    editing: mockEditing,
    cancelEdit: jest.fn(),
    commitEdit: mockCommitEdit,
  }),
}));

let mockImageMode = false;
let mockFields: QuoteFields;
const mockFinish = jest.fn();
const mockCapture = jest.fn(() => ({ fields: mockFields, finish: mockFinish }));
const mockQuoteActions = { capture: mockCapture };
const mockSend = jest.fn();
const mockNoop = jest.fn();
const mockControls = {
  editMessage: mockEditMessage,
  sendMessage: mockSend,
  canSend: true,
  isBusy: false,
  cancel: mockNoop,
};
const mockModelItem = { modelId: 'p::m', model: { id: 'p::m' } };

jest.mock('../../../quotes/ChatQuoteContext', () => ({
  useChatQuoteActions: () => mockQuoteActions,
}));
jest.mock('../../../runtime', () => ({ useAgentChatImageResult: () => undefined }));
jest.mock('@/frontend/data', () => ({ useApiClient: () => ({}) }));
jest.mock('@/frontend/appShell/navigation', () => ({ useOpenProviderSetup: () => mockNoop }));
jest.mock('@/frontend/appShell/navigation/chat', () => ({ chatReturnToHref: () => '/chat' }));
jest.mock('@/frontend/hooks/agent', () => ({
  useAgentApiById: () => ({ agent: { id: 'a', mode: 'standard' } }),
  useAgentMutations: () => ({ updateAgent: mockNoop }),
}));
jest.mock('@/frontend/hooks/plugin', () => ({
  usePluginCatalog: () => ({}),
  usePluginConnections: () => ({}),
}));
jest.mock('@/frontend/components/Composer', () => ({
  ComposerAttachments: () => null,
  useComposerActions: () => ({ setDraft: mockNoop }),
  useComposerState: () => ({ draft: mockDraft, attachments: [] }),
}));
jest.mock('@/frontend/components/McpApp', () => ({
  useMcpAppConversation: () => undefined,
  McpAppContextNotice: () => null,
}));
jest.mock('@/frontend/components/ModelPicker', () => ({
  useModelPickerData: () => ({ getModelItem: () => mockModelItem }),
  ModelPickerDrawer: () => null,
}));
jest.mock('@/shared/utils/modelPurpose', () => ({
  isImageGenerationModel: () => mockImageMode,
  isTextGenerationModel: () => !mockImageMode,
}));
jest.mock('@/frontend/components/PaintingInput', () => ({
  PaintingInputProvider: ({ children }: { children: ReactNode }) => children,
  PaintingInput: (props: object) =>
    jest.requireActual('react').createElement('PaintingInput', props),
}));
jest.mock('uniwind', () => ({ useResolveClassNames: () => ({ fontSize: 16 }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('../ChatInputSurface', () => ({
  ChatInputAccessories: ({ children }: { children: ReactNode }) => children,
  ChatInputComposer: (props: object) =>
    jest.requireActual('react').createElement('TextComposer', props),
  ChatInputSurface: (props: object) =>
    jest.requireActual('react').createElement('TextSurface', props),
}));
jest.mock('../components/AudioAttachmentNotice', () => ({ AudioAttachmentNotice: () => null }));
jest.mock('../components/ChatInputEffortOverlay', () => ({
  ChatInputEffortOverlay: ({ children }: { children: (value?: undefined) => ReactNode }) =>
    children(),
}));
jest.mock('../components/ChatInputMenu', () => ({ ChatInputMenu: () => null }));
jest.mock('../components/ChatInputModelPill', () => ({ ChatInputModelPill: () => null }));
jest.mock('../components/ChatInputQueue', () => ({ ChatInputQueue: () => null }));
jest.mock('../components/ChatInputPluginPopover', () => ({
  ChatInputPluginPopover: ({ children, ...props }: { children: ReactNode }) =>
    jest.requireActual('react').createElement('PluginPopover', props, children),
}));
jest.mock('../components/ChatInputPromptPopover', () => ({
  ChatInputPromptPopover: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('../components/ChatInputSkillPopover', () => ({
  ChatInputSkillPopover: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('../hooks/useChatInputAgentModelSelection', () => ({
  useChatInputAgentModelSelection: () => ({ selectModel: mockNoop, selectedModelId: 'p::m' }),
}));
jest.mock('../hooks/useChatInputMcpPrompts', () => ({ useChatInputMcpPrompts: () => [] }));
jest.mock('../hooks/useChatInputReasoningEfforts', () => ({
  useChatInputReasoningEfforts: () => [],
}));
jest.mock('../hooks/useChatInputReasoningEffortSelection', () => ({
  useChatInputReasoningEffortSelection: () => ({ selectReasoningEffort: mockNoop }),
}));
jest.mock('../hooks/useChatInputModelPicker', () => ({
  useChatInputModelPicker: () => ({ close: mockNoop, open: mockNoop, isOpen: false }),
}));
jest.mock('../hooks/useChatSelectionHandoff', () => ({ useChatSelectionHandoff: () => undefined }));
jest.mock('../utils/chatInputPlugins', () => ({ getConnectedChatInputPlugins: () => [] }));

const fields: QuoteFields = {
  quotes: [
    {
      id: 'quote',
      sourceMessageId: '00000000-0000-7000-8000-000000000001',
      text: 'Original snapshot',
    },
  ],
  quoteAuthor: { role: 'assistant', name: 'Original Agent' },
};
let renderer: ReactTestRenderer;
beforeEach(() => {
  jest.clearAllMocks();
  mockImageMode = false;
  mockEditing = null;
  mockDraft = '';
  mockControls.isBusy = false;
  mockEditMessage.mockResolvedValue(undefined);
  mockFields = fields;
  mockSend.mockResolvedValue(undefined);
});
afterEach(() => act(() => renderer.unmount()));
const mount = async () => {
  await act(async () => {
    renderer = create(<ChatInput agentId="a" sessionId="s" controls={mockControls as never} />);
  });
};

test('text send captures one attempt, sends the primary quote, and clears only after admission', async () => {
  let admit!: () => void;
  mockSend.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      admit = resolve;
    }),
  );
  await mount();
  let pending!: Promise<unknown>;
  act(() => {
    pending = renderer.root.findByType('TextComposer' as never).props.onSend({
      text: `${createQuoteMention(fields.quotes![0])} My request`,
      attachments: [],
    } satisfies ComposerSendPayload);
  });
  expect(mockCapture).toHaveBeenCalledTimes(1);
  expect(mockSend.mock.calls[0][0].parts).toEqual([
    {
      type: 'text',
      text: '“Original snapshot” My request',
      ...fields,
      quotes: readQuoteMentions(
        `${createQuoteMention(fields.quotes![0])} My request`,
        fields.quotes,
      ).quotes,
    },
  ]);
  expect(mockFinish).not.toHaveBeenCalled();
  mockFields = {};
  await act(async () => {
    admit();
    await pending;
  });
  expect(mockFinish.mock.calls).toEqual([[true], [false]]);
});

test('image send captures before attachment preparation and consumes that attempt after an await', async () => {
  mockImageMode = true;
  await mount();
  const painting = renderer.root.findByType('PaintingInput' as never);
  expect(painting.props.preparePrompt('Draw it', [])).toBe('Draw it');
  expect(mockCapture).toHaveBeenCalledTimes(1);
  await Promise.resolve();
  mockFields = {};
  await act(async () => {
    await painting.props.onGenerate({
      prompt: 'Draw it',
      attachments: [],
      mode: 'generate',
      paramValues: {},
      modelId: 'p::m',
      modelName: 'Model',
    } satisfies PaintingInputSubmission);
  });
  expect(mockSend.mock.calls[0][0].parts).toEqual([{ type: 'text', text: 'Draw it', ...fields }]);
  expect(mockCapture).toHaveBeenCalledTimes(1);
  expect(mockFinish.mock.calls).toEqual([[true], [false]]);
});

test('image preparation failure releases its attempt without admitting or clearing the quote', async () => {
  mockImageMode = true;
  await mount();
  const painting = renderer.root.findByType('PaintingInput' as never);
  painting.props.preparePrompt('Draw it', []);
  painting.props.onSubmissionSettled();
  expect(mockCapture).toHaveBeenCalledTimes(1);
  expect(mockFinish.mock.calls).toEqual([[false]]);
  expect(mockFields).toBe(fields);
  expect(mockSend).not.toHaveBeenCalled();
});

test.each(['Original question', '   '])(
  'disables unchanged or blank question edits: %s',
  async (draft) => {
    mockEditing = { messageId: 'question', initialText: 'Original question', attachmentCount: 2 };
    mockDraft = draft;
    await mount();
    const composer = renderer.root.findByType('TextComposer' as never);
    expect(composer.props.canSend).toBe(false);
    await expect(composer.props.onSend({ text: draft, attachments: [] })).rejects.toMatchObject({
      view: { code: 'MESSAGE_CONFLICT' },
    });
    expect(mockEditMessage).not.toHaveBeenCalled();
    expect(mockCommitEdit).not.toHaveBeenCalled();
  },
);

test('editing hides attachment actions but keeps model controls and sends changed text', async () => {
  mockEditing = { messageId: 'question', initialText: 'Original question', attachmentCount: 2 };
  mockDraft = 'Changed question';
  await mount();
  const surface = renderer.root.findByType('TextSurface' as never);
  expect(surface.props.leadingAction).toBeNull();
  expect(surface.props.attachmentMode).toBe('text-only');
  expect(surface.props.secondaryAction).toBeDefined();
  const composer = renderer.root.findByType('TextComposer' as never);
  expect(composer.props.canSend).toBe(true);
  await act(async () => composer.props.onSend({ text: 'Changed question', attachments: [] }));
  expect(mockEditMessage).toHaveBeenCalledWith(
    expect.objectContaining({ messageId: 'question', text: 'Changed question' }),
  );
  expect(mockCommitEdit).toHaveBeenCalledTimes(1);
});

test('busy question edit cannot be sent even when its text changed', async () => {
  mockEditing = { messageId: 'question', initialText: 'Original question', attachmentCount: 0 };
  mockDraft = 'Changed question';
  mockControls.isBusy = true;
  await mount();
  const composer = renderer.root.findByType('TextComposer' as never);
  expect(composer.props.canSend).toBe(false);
  await expect(
    composer.props.onSend({ text: 'Changed question', attachments: [] }),
  ).rejects.toMatchObject({ view: { code: 'SESSION_BUSY' } });
  expect(mockEditMessage).not.toHaveBeenCalled();
});

test('failed edit admission retains editing state and does not restore the interrupted draft yet', async () => {
  mockEditing = { messageId: 'question', initialText: 'Original question', attachmentCount: 2 };
  mockDraft = 'Changed question';
  mockEditMessage.mockRejectedValueOnce(new Error('Admission rejected'));
  await mount();
  await expect(
    renderer.root
      .findByType('TextComposer' as never)
      .props.onSend({ text: 'Changed question', attachments: [] }),
  ).rejects.toThrow('Admission rejected');
  expect(mockCommitEdit).not.toHaveBeenCalled();
  expect(mockEditing?.messageId).toBe('question');
});

test('entering question edit closes the plugin picker and does not reopen it on cancel', async () => {
  await mount();
  const surface = renderer.root.findByType('TextSurface' as never);
  await act(async () => surface.props.leadingAction.props.onPickPlugins());
  expect(renderer.root.findByType('PluginPopover' as never).props.open).toBe(true);
  mockEditing = { messageId: 'question', initialText: 'Original question', attachmentCount: 0 };
  await act(async () =>
    renderer.update(<ChatInput agentId="a" sessionId="s" controls={mockControls as never} />),
  );
  expect(renderer.root.findByType('PluginPopover' as never).props.open).toBe(false);
  mockEditing = null;
  await act(async () =>
    renderer.update(<ChatInput agentId="a" sessionId="s" controls={mockControls as never} />),
  );
  expect(renderer.root.findByType('PluginPopover' as never).props.open).toBe(false);
});
