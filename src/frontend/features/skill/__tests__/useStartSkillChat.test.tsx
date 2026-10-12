import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useStartSkillChat } from '../useStartSkillChat';

const mockRefetch = jest.fn();
const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockToast = jest.fn();
const mockHandoff = jest.fn((_value: unknown) => 'handoff');

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
  useAgentsApi: () => ({ refetch: mockRefetch, agents: [] }),
  useAgentSession: () => ({}),
}));
jest.mock('@/frontend/appShell/navigation/chat', () => ({
  parseChatRoute: () => ({ status: 'ready', target: { kind: 'draft', agentId: 'current' } }),
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
  beforeEach(() => {
    jest.clearAllMocks();
    act(() => {
      renderer = create(<Probe />);
    });
  });
  afterEach(() => {
    act(() => renderer.unmount());
  });

  test('keeps the current standard Agent when opening the installation draft', async () => {
    mockRefetch.mockResolvedValue({
      data: {
        items: [
          { id: 'other', mode: 'standard' },
          { id: 'current', mode: 'standard' },
        ],
      },
    });
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

  test('switches away from a minimal Agent before handing off installation intent', async () => {
    mockRefetch.mockResolvedValue({
      data: {
        items: [
          { id: 'current', mode: 'minimal' },
          { id: 'standard', mode: 'standard' },
        ],
      },
    });
    await act(async () => {
      await skillChat.open();
    });
    expect(mockReplace).toHaveBeenCalledWith({
      kind: 'draft',
      agentId: 'standard',
      composerHandoff: 'handoff',
    });
  });

  test('opens Agent setup with guidance when every Agent is minimal', async () => {
    mockRefetch.mockResolvedValue({ data: { items: [{ id: 'current', mode: 'minimal' }] } });
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
