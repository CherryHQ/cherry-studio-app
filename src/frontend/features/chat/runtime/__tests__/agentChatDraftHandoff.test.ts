import { createAgentChatDraftHandoffState } from '../agentChatDraftHandoff';

describe('AgentChatDraftHandoff', () => {
  it('publishes the matching handoff before opening its Session and consumes it once', () => {
    const state = createAgentChatDraftHandoffState();
    const handoff = { agentId: 'agent-1', sessionId: 'session-1' };
    let handoffAtNavigation: typeof handoff | undefined;

    state.handoffToSession(handoff, (sessionId) => {
      handoffAtNavigation = state.get(sessionId);
    });

    expect(handoffAtNavigation).toEqual(handoff);
    expect(state.get('session-2')).toBeUndefined();
    expect(state.get('session-1')).toEqual(handoff);

    state.complete('session-2');
    expect(state.get('session-1')).toEqual(handoff);

    state.complete('session-1');
    expect(state.get('session-1')).toBeUndefined();
  });
});
