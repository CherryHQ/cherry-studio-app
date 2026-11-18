import { act, create } from 'react-test-renderer';

import type { ChatTarget } from '@/frontend/appShell/navigation/chat';

import { useSelectionSourceChat } from '../useSelectionSourceChat';

const mockUseAgentSession = jest.fn();
const mockUseAgentApiById = jest.fn();

jest.mock('@/frontend/hooks/agent', () => ({
  useAgentApiById: (id: string | undefined) => mockUseAgentApiById(id),
  useAgentSession: (id: string | undefined) => mockUseAgentSession(id),
}));

const agents = {
  'agent-minimal': { id: 'agent-minimal', mode: 'minimal' },
  'agent-standard': { id: 'agent-standard', mode: 'standard' },
} as const;

describe('useSelectionSourceChat', () => {
  beforeEach(() => {
    mockUseAgentSession.mockImplementation((id?: string) => ({
      data: id
        ? { agentId: id === 'session-minimal' ? 'agent-minimal' : 'agent-standard' }
        : undefined,
      isLoading: false,
    }));
    mockUseAgentApiById.mockImplementation((id?: keyof typeof agents) => ({
      agent: id ? agents[id] : undefined,
      isLoading: false,
    }));
  });

  it('returns to a source chat whose Agent can use the reference', () => {
    expect(read({ kind: 'session', sessionId: 'session-standard' })).toEqual({
      isResolving: false,
      returnsToSourceChat: true,
    });
    expect(read({ agentId: 'agent-standard', kind: 'draft' }).returnsToSourceChat).toBe(true);
  });

  it('chooses another Agent when the source chat is minimal, since it rejects documents', () => {
    expect(read({ kind: 'session', sessionId: 'session-minimal' }).returnsToSourceChat).toBe(false);
    expect(read({ agentId: 'agent-minimal', kind: 'draft' }).returnsToSourceChat).toBe(false);
  });

  it('chooses another Agent when the source chat Agent no longer exists', () => {
    expect(read({ agentId: 'agent-deleted', kind: 'draft' }).returnsToSourceChat).toBe(false);
  });

  it('holds the source chat action while its Agent resolves', () => {
    mockUseAgentSession.mockReturnValue({ data: undefined, isLoading: true });
    mockUseAgentApiById.mockReturnValue({ agent: undefined, isLoading: false });

    expect(read({ kind: 'session', sessionId: 'session-minimal' })).toEqual({
      isResolving: true,
      returnsToSourceChat: true,
    });
  });

  it('chooses an Agent for a preview opened outside chat', () => {
    expect(read(undefined)).toEqual({ isResolving: false, returnsToSourceChat: false });
  });
});

function read(sourceChat: ChatTarget | undefined) {
  let result: ReturnType<typeof useSelectionSourceChat> | undefined;
  function Probe() {
    result = useSelectionSourceChat(sourceChat);
    return null;
  }
  act(() => {
    create(<Probe />);
  });
  if (!result) throw new Error('Hook did not render');
  return result;
}
