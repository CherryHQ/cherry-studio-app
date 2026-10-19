import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useStartSkillChat } from '../useStartSkillChat';

const mockRefetch = jest.fn();
const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockToast = jest.fn();
const mockHandoff = jest.fn((_value: unknown) => 'handoff');
let mockRoute: unknown = { status: 'ready', target: { kind: 'draft', agentId: 'current' } };
let mockCurrentAgent: { id: string; mode: string } | undefined;
let mockSessionAgentId: string | undefined;

jest.mock('@cherrystudio/ui/components', () => ({
  useToast: () => ({ toast: { show: mockToast } }),
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ canDismiss: () => false, replace: mockReplace, push: mockPush }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/frontend/hooks/agent', () => ({
  useAgentApiById: (id: string | undefined) => ({
    agent: id && mockCurrentAgent?.id === id ? mockCurrentAgent : undefined,
  }),
  useAgentsApi: () => ({ refetch: mockRefetch, agents: [] }),
  useAgentSession: (sessionId: string | undefined) => ({
    data: sessionId && mockSessionAgentId ? { agentId: mockSessionAgentId } : undefined,
  }),
}));
jest.mock('@/frontend/appShell/navigation/chat', () => ({
  parseChatRoute: () => mockRoute,
  createChatComposerHandoff: (value: unknown) => mockHandoff(value),
  chatHref: (value: unknown) => value,
}));

describe('Skill installation chat', () => {
  let renderer: ReactTestRenderer;
  let skillChat: ReturnType<typeof useStartSkillChat>;
  function Probe() {
    skillChat = useStartSkillChat();
    return null;
  }
  function render() {
    act(() => {
      renderer = create(<Probe />);
    });
  }
  beforeEach(() => {
    jest.clearAllMocks();
    mockRoute = { status: 'ready', target: { kind: 'draft', agentId: 'current' } };
    mockCurrentAgent = { id: 'current', mode: 'standard' };
    mockSessionAgentId = undefined;
  });
  afterEach(() => {
    act(() => renderer.unmount());
  });

  test('keeps the existing conversation Agent instead of the first available Agent', async () => {
    mockRoute = { status: 'ready', target: { kind: 'session', sessionId: 'session-1' } };
    mockSessionAgentId = 'current';
    mockRefetch.mockResolvedValue({
      data: {
        items: [
          { id: 'default', mode: 'standard' },
          { id: 'current', mode: 'standard' },
        ],
      },
    });
    render();

    await act(async () => {
      await skillChat.open();
    });

    expect(mockReplace).toHaveBeenCalledWith({
      kind: 'draft',
      agentId: 'current',
      composerHandoff: 'handoff',
    });
  });

  test('does not fall back to another Agent while the source conversation is loading', async () => {
    mockRoute = { status: 'ready', target: { kind: 'session', sessionId: 'session-1' } };
    render();

    expect(skillChat.isAvailable).toBe(false);
    await act(async () => {
      await skillChat.open();
    });

    expect(mockRefetch).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockHandoff).not.toHaveBeenCalled();
  });

  test('keeps the current standard Agent when opening the installation draft', async () => {
    render();
    mockRefetch.mockResolvedValue({
      data: {
        items: [
          { id: 'other', mode: 'standard' },
          { id: 'current', mode: 'standard' },
        ],
      },
    });
    expect(skillChat.isAvailable).toBe(true);
    await act(async () => {
      await skillChat.open();
    });
    expect(mockReplace).toHaveBeenCalledWith({
      kind: 'draft',
      agentId: 'current',
      composerHandoff: 'handoff',
    });
    expect(mockHandoff).toHaveBeenCalledWith({
      attachments: [],
      draft: '',
      skillAction: 'find-and-install',
    });
  });

  test('offers no installation entry for a minimal current Agent and never switches Agents', async () => {
    mockCurrentAgent = { id: 'current', mode: 'minimal' };
    render();
    mockRefetch.mockResolvedValue({
      data: {
        items: [
          { id: 'current', mode: 'minimal' },
          { id: 'standard', mode: 'standard' },
        ],
      },
    });
    expect(skillChat.isAvailable).toBe(false);
    await act(async () => {
      await skillChat.open();
    });
    expect(mockRefetch).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  });

  test('uses a standard Agent when there is no current Agent', async () => {
    mockRoute = { status: 'empty' };
    mockCurrentAgent = undefined;
    render();
    mockRefetch.mockResolvedValue({
      data: {
        items: [
          { id: 'minimal', mode: 'minimal' },
          { id: 'standard', mode: 'standard' },
        ],
      },
    });
    expect(skillChat.isAvailable).toBe(true);
    await act(async () => {
      await skillChat.open();
    });
    expect(mockReplace).toHaveBeenCalledWith({
      kind: 'draft',
      agentId: 'standard',
      composerHandoff: 'handoff',
    });
  });

  test('opens Agent setup with guidance when no standard Agent exists', async () => {
    mockRoute = { status: 'empty' };
    mockCurrentAgent = undefined;
    render();
    mockRefetch.mockResolvedValue({ data: { items: [{ id: 'minimal', mode: 'minimal' }] } });
    await act(async () => {
      await skillChat.open();
    });
    expect(mockToast).toHaveBeenCalledWith({
      label: 'skills.chatRequiresStandardAgent',
      variant: 'danger',
    });
    expect(mockPush).toHaveBeenCalledWith('/agents');
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockHandoff).not.toHaveBeenCalled();
  });
});
