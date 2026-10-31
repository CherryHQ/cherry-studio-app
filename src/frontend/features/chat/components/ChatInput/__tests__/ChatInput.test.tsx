import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ComposerSendPayload } from '@/frontend/components/Composer';
import type { PaintingInputSubmission } from '@/frontend/components/PaintingInput';
import type { QuoteFields } from '@/shared/contracts/agent';

import { ChatInput } from '../ChatInput';

let mockImageMode = false;
let mockFields: QuoteFields;
const mockFinish = jest.fn();
const mockCapture = jest.fn(() => ({ fields: mockFields, finish: mockFinish }));
const mockQuoteActions = { capture: mockCapture };
const mockSend = jest.fn();
const mockNoop = jest.fn();
const mockControls = { sendMessage: mockSend, canSend: true, isBusy: false, cancel: mockNoop };
const mockModelItem = { modelId: 'p::m', model: { id: 'p::m' } };

jest.mock('../../../quotes/ChatQuoteContext', () => ({
  useChatQuoteActions: () => mockQuoteActions,
}));
jest.mock('../../../quotes/MessageQuotePreview', () => ({ DraftMessageQuotePreview: () => null }));
jest.mock('../../../runtime', () => ({ useAgentChatImageResult: () => undefined }));
jest.mock('@/frontend/data', () => ({
  useApiClient: () => ({}),
  useBackendModule: () => ({ isAvailable: () => false }),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ setParams: mockNoop }) }));
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
  useComposerPresentationActions: () => ({ runInputReplacement: mockNoop }),
  useComposerState: () => ({ draft: '' }),
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
  ChatInputSurface: () => null,
}));
jest.mock('../components/ChatInputEffortOverlay', () => ({
  ChatInputEffortOverlay: ({ children }: { children: (value?: undefined) => ReactNode }) =>
    children(),
}));
jest.mock('../components/ChatInputMenu', () => ({ ChatInputMenu: () => null }));
jest.mock('../components/ChatInputModelPill', () => ({ ChatInputModelPill: () => null }));
jest.mock('../components/ChatInputQueue', () => ({ ChatInputQueue: () => null }));
jest.mock('../components/ChatInputSsh', () => ({
  ChatInputSshSheet: () => null,
  ChatInputSshTarget: () => null,
}));
jest.mock('../components/ChatInputPluginPopover', () => ({
  ChatInputPluginPopover: ({ children }: { children: ReactNode }) => children,
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
    pending = renderer.root
      .findByType('TextComposer' as never)
      .props.onSend({ text: 'My request', attachments: [] } satisfies ComposerSendPayload);
  });
  expect(mockCapture).toHaveBeenCalledTimes(1);
  expect(mockSend.mock.calls[0][0].parts).toEqual([
    { type: 'text', text: 'My request', ...fields },
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
