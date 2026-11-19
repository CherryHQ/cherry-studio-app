import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ComposerSendPayload } from '@/frontend/components/Composer';
import type { PaintingInputSubmission } from '@/frontend/components/PaintingInput';
import { PolicyScope } from '@/frontend/components/Policy';
import type { QuoteFields } from '@/shared/contracts/agent';
import type { AgentSessionEntity } from '@/shared/data/api/schemas/agentSessions';
import { agentPolicy } from '@/shared/data/managedPolicy';
import type { UniqueModelId } from '@/shared/data/types/model';

import { createQuoteMention, readQuoteMentions } from '../../../quotes/quoteMentions';
import { ChatInput } from '../ChatInput';
import { createPluginMentionUrl } from '../utils/pluginMentions';
import { createSelectionMention } from '../utils/selectionMentions';
import { createSkillMentionUrl } from '../utils/skillMentions';
import { createSshMention } from '../utils/sshMentions';
let mockEditing: { messageId: string; initialText: string; attachmentCount: number } | null = null;
let mockDraft = '';
const mockCommitEdit = jest.fn();
const mockBeginEditSend = jest.fn();
const mockSettleEditSend = jest.fn(() => true);
const mockEditMessage = jest.fn();
jest.mock('@cherrystudio/ui/components', () => ({
  Button: (props: object) => jest.requireActual('react').createElement('Button', props),
}));
jest.mock('../hooks/useChatEditDraft', () => ({
  useChatEditDraft: () => ({
    beginEditSend: mockBeginEditSend,
    editing: mockEditing,
    cancelEdit: jest.fn(),
    commitEdit: mockCommitEdit,
    settleEditSend: mockSettleEditSend,
  }),
}));

let mockImageMode = false;
let mockFields: QuoteFields;
let mockAgentModel: UniqueModelId | null | undefined;
let mockHasLoadedCatalog = false;
let mockCatalogModels = new Set<string>(['p::m']);
let mockSession: Pick<AgentSessionEntity, 'model' | 'updatedAt'>;
const mockUpdateAgentSession = jest.fn(
  async (_id: string, patch: Pick<AgentSessionEntity, 'model'>) => ({
    ...mockSession,
    ...patch,
    updatedAt: '2026-11-18T00:00:00.001Z',
  }),
);
let mockPickerApi: {
  replyModels: readonly UniqueModelId[] | null;
  selectedModelId: UniqueModelId | null;
  selectModel: (modelId: UniqueModelId) => void;
  setReplyModels: (models: readonly UniqueModelId[] | null) => void;
};
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
const mockSshProfile = {
  id: '11111111-1111-4111-8111-111111111111',
  revision: '22222222-2222-4222-8222-222222222222',
};
let mockSshAvailable = false;
let mockSshStatus = 'idle';
let mockSshTarget: { profile: typeof mockSshProfile } | null = null;

jest.mock('../../../quotes/ChatQuoteContext', () => ({
  useChatQuoteActions: () => mockQuoteActions,
}));
jest.mock('../../../runtime', () => ({ useAgentChatImageResult: () => undefined }));
jest.mock('@/frontend/data', () => ({
  useApiClient: () => ({}),
  useBackendModule: () => ({
    isAvailable: () => mockSshAvailable,
    getTarget: () => mockSshTarget,
    getTargetStatus: () => mockSshStatus,
    subscribeTargets: () => () => {},
  }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ setParams: mockNoop }),
  useLocalSearchParams: () => ({}),
  useIsFocused: () => true,
}));
jest.mock('@/frontend/appShell/navigation', () => ({ useOpenProviderSetup: () => mockNoop }));
jest.mock('@/frontend/appShell/navigation/chat', () => ({
  chatReturnToHref: () => '/chat',
  parseChatRoute: () => ({ status: 'empty' }),
}));
jest.mock('@/frontend/hooks/agent', () => ({
  useAgentApiById: (id?: string) => ({
    agent: {
      id: id ?? 'a',
      mode: 'standard',
      ...(mockAgentModel !== undefined ? { model: mockAgentModel } : {}),
    },
  }),
  useAgentSession: (id?: string) => ({ data: id ? mockSession : undefined }),
  useAgentSessionMutations: () => ({ updateAgentSession: mockUpdateAgentSession }),
}));
jest.mock('@/frontend/hooks/plugin', () => ({
  usePluginCatalog: () => ({}),
  usePluginConnections: () => ({}),
}));
jest.mock('@/frontend/hooks/ssh', () => ({ sshErrorLabel: () => 'ssh.error.connection' }));
jest.mock('@/frontend/components/Composer', () => ({
  ComposerAttachments: () => null,
  useComposerActions: () => ({ setDraft: mockNoop }),
  useComposerPresentationActions: () => ({ runInputReplacement: mockNoop }),
  useComposerState: () => ({ draft: mockDraft, attachments: [] }),
}));
jest.mock('@/frontend/components/McpApp', () => ({
  useMcpAppConversation: () => undefined,
  McpAppContextNotice: () => null,
}));
jest.mock('@/frontend/components/ModelPicker', () => ({
  useModelPickerData: () => ({
    hasLoadedCatalog: mockHasLoadedCatalog,
    getModelItem: (id: string | null) =>
      id && (!mockHasLoadedCatalog || mockCatalogModels.has(id))
        ? { ...mockModelItem, modelId: id, model: { id } }
        : undefined,
  }),
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
jest.mock('../hooks/useChatInputMcpPrompts', () => ({ useChatInputMcpPrompts: () => [] }));
jest.mock('../hooks/useChatInputReasoningEfforts', () => ({
  useChatInputReasoningEfforts: () => [],
}));
jest.mock('../hooks/useChatInputReasoningEffortSelection', () => ({
  useChatInputReasoningEffortSelection: () => ({ selectReasoningEffort: mockNoop }),
}));
jest.mock('../hooks/useChatInputModelPicker', () => ({
  useChatInputModelPicker: (props: typeof mockPickerApi) => {
    mockPickerApi = props;
    return { close: mockNoop, open: mockNoop, isOpen: false };
  },
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
  mockAgentModel = undefined;
  mockSession = { model: 'p::m', updatedAt: '2026-11-18T00:00:00.000Z' };
  mockHasLoadedCatalog = false;
  mockCatalogModels = new Set(['p::m']);
  mockEditing = null;
  mockSshTarget = null;
  mockSshAvailable = false;
  mockSshStatus = 'idle';
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
  // A cached Session model must not be sent as a per-turn override.
  expect(mockSend.mock.calls[0][0]).not.toHaveProperty('modelId');
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

test('sending mixed mentions preserves SSH labels and all ranges after removing link syntax', async () => {
  mockSshTarget = { profile: mockSshProfile };
  const skillId = '00000000-0000-4000-8000-000000000002';
  const selection = {
    file_entry_id: '00000000-0000-7000-8000-000000000003',
    anchor: { format: 'docx' as const, paragraph: 0 },
    excerpt: 'Selected paragraph',
  };
  const ssh = createSshMention('SSH · guoxu', mockSshProfile);
  const draft = `📄 ${createQuoteMention(fields.quotes![0])} ${ssh} [飞书](${createPluginMentionUrl(mockSshProfile.id, 'feishu')}) [notes](${createSkillMentionUrl(skillId)}) ${createSelectionMention('a.docx · ¶1', selection)} ${ssh}`;
  const text = '📄 “Original snapshot” SSH · guoxu 飞书 notes a.docx · ¶1 SSH · guoxu';
  await mount();
  await act(async () => {
    await renderer.root
      .findByType('TextComposer' as never)
      .props.onSend({ text: draft, attachments: [] });
  });
  expect(mockSend.mock.calls[0][0].parts).toEqual([
    {
      type: 'text',
      text,
      quoteAuthor: fields.quoteAuthor,
      quotes: [{ ...fields.quotes![0], reference: { label: '“Original snapshot”', offset: 3 } }],
      pluginReferences: [
        { type: 'plugin', pluginId: 'feishu', label: '飞书', offset: text.indexOf('飞书') },
      ],
      skillReferences: [{ type: 'skill', skillId, label: 'notes', offset: text.indexOf('notes') }],
      selectionReferences: [
        { type: 'selection', selection, label: 'a.docx · ¶1', offset: text.indexOf('a.docx') },
      ],
      sshReferences: [
        { type: 'ssh', label: 'SSH · guoxu', offset: text.indexOf('SSH · guoxu') },
        { type: 'ssh', label: 'SSH · guoxu', offset: text.lastIndexOf('SSH · guoxu') },
      ],
    },
  ]);
});

test('a stale SSH mention is rejected before sending its display snapshot', async () => {
  mockSshTarget = {
    profile: { ...mockSshProfile, revision: '33333333-3333-4333-8333-333333333333' },
  };
  await mount();
  await expect(
    renderer.root.findByType('TextComposer' as never).props.onSend({
      text: createSshMention('SSH · guoxu', mockSshProfile),
      attachments: [],
    }),
  ).rejects.toThrow();
  expect(mockSend).not.toHaveBeenCalled();
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

test('entering question edit removes the tools menu and restores it on cancel', async () => {
  await mount();
  const surface = () => renderer.root.findByType('TextSurface' as never);
  expect(surface().props.leadingAction).not.toBeNull();
  mockEditing = { messageId: 'question', initialText: 'Original question', attachmentCount: 0 };
  await act(async () =>
    renderer.update(<ChatInput agentId="a" sessionId="s" controls={mockControls as never} />),
  );
  expect(surface().props.leadingAction).toBeNull();
  mockEditing = null;
  await act(async () =>
    renderer.update(<ChatInput agentId="a" sessionId="s" controls={mockControls as never} />),
  );
  expect(surface().props.leadingAction).not.toBeNull();
});

test('keeps the first reply model and saves a later draft pick after the Session handoff', async () => {
  mockAgentModel = 'p::default';
  mockFields = {};
  let finish!: () => void;
  mockSend.mockReturnValueOnce(new Promise<void>((resolve) => (finish = resolve)));
  await act(async () => {
    renderer = create(<ChatInput agentId="a" controls={mockControls as never} />);
  });
  await act(async () => mockPickerApi.selectModel('p::m'));
  let sending!: Promise<unknown>;
  act(() => {
    sending = renderer.root.findByType('TextComposer' as never).props.onSend({
      text: 'First question',
      attachments: [],
    } satisfies ComposerSendPayload);
  });
  expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ sessionModelId: 'p::m' }));

  await act(async () => mockPickerApi.selectModel('p::next'));
  expect(mockUpdateAgentSession).not.toHaveBeenCalled();
  await act(async () => {
    renderer.update(<ChatInput agentId="a" sessionId="s" controls={mockControls as never} />);
    finish();
    await sending;
  });

  expect(mockUpdateAgentSession).toHaveBeenCalledTimes(1);
  expect(mockUpdateAgentSession).toHaveBeenCalledWith('s', { model: 'p::next' });
  expect(mockPickerApi.selectedModelId).toBe('p::next');
});

test('falls back from removed or disallowed draftModel to agent.model and clears replyModels on Agent switch', async () => {
  const defaultModel = 'p::default' as UniqueModelId;
  const customModel = 'p::custom' as UniqueModelId;
  const thirdModel = 'p::third' as UniqueModelId;
  mockAgentModel = defaultModel;
  mockHasLoadedCatalog = true;
  mockCatalogModels = new Set([defaultModel, customModel, thirdModel]);
  const renderDraft = (agentId: string, allowedModelIds: UniqueModelId[] | null = null) => (
    <PolicyScope
      policy={agentPolicy(
        allowedModelIds ? { isManaged: true, allowedModelIds } : { isManaged: false },
      )}
    >
      <ChatInput agentId={agentId} controls={mockControls as never} />
    </PolicyScope>
  );

  await act(async () => {
    renderer = create(renderDraft('agent-a', [defaultModel, customModel, thirdModel]));
  });
  await act(async () => {
    mockPickerApi.selectModel(customModel);
    mockPickerApi.setReplyModels([customModel, thirdModel]);
  });
  expect(mockPickerApi.selectedModelId).toBe(customModel);
  expect(mockPickerApi.replyModels).toEqual([customModel, thirdModel]);

  // Deleting customModel from the catalog returns the draft to agent.model and clears parallel mode.
  mockCatalogModels = new Set([defaultModel, thirdModel]);
  await act(async () =>
    renderer.update(renderDraft('agent-a', [defaultModel, customModel, thirdModel])),
  );
  expect(mockPickerApi.selectedModelId).toBe(defaultModel);
  expect(mockPickerApi.replyModels).toBeNull();

  // Withdrawing customModel from allowedModelIds also returns the draft to agent.model.
  mockCatalogModels = new Set([defaultModel, customModel, thirdModel]);
  await act(async () =>
    renderer.update(renderDraft('agent-a', [defaultModel, customModel, thirdModel])),
  );
  await act(async () => {
    mockPickerApi.selectModel(customModel);
    mockPickerApi.setReplyModels([customModel, thirdModel]);
  });
  await act(async () => renderer.update(renderDraft('agent-a', [defaultModel])));
  expect(mockPickerApi.selectedModelId).toBe(defaultModel);
  expect(mockPickerApi.replyModels).toBeNull();

  // Switching Agents inside a draft clears parallel replyModels from the previous Agent.
  await act(async () =>
    renderer.update(renderDraft('agent-a', [defaultModel, customModel, thirdModel])),
  );
  await act(async () => mockPickerApi.setReplyModels([customModel, thirdModel]));
  expect(mockPickerApi.replyModels).toEqual([customModel, thirdModel]);
  await act(async () =>
    renderer.update(renderDraft('agent-b', [defaultModel, customModel, thirdModel])),
  );
  expect(mockPickerApi.replyModels).toBeNull();
});

test('shows disconnected SSH status without disabling send', async () => {
  mockSshAvailable = true;
  mockSshStatus = 'disconnected';
  await mount();
  expect(renderer.root.findByType('TextComposer' as never).props.canSend).toBe(true);
  expect(
    renderer.root.findAll((node) => node.props.children === 'ssh.disconnectedReconnect'),
  ).not.toHaveLength(0);
});
