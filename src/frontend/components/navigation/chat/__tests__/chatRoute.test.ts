import { chatHref, parseChatRoute } from '../chatRoute';

describe('shared chat route contract', () => {
  test('uses the Session id as the complete existing-chat identity', () => {
    expect(parseChatRoute({ sessionId: 'session-1' })).toEqual({
      status: 'ready',
      target: { kind: 'session', sessionId: 'session-1' },
    });
    expect(parseChatRoute({ agentId: 'agent-1', sessionId: 'session-1' })).toEqual({
      status: 'ready',
      target: { kind: 'session', sessionId: 'session-1' },
    });
  });

  test('clears the Session parameter for a draft target', () => {
    expect(chatHref({ agentId: 'agent-1', kind: 'draft' })).toEqual({
      params: { agentId: 'agent-1', sessionId: undefined },
      pathname: '/',
    });
  });

  test('clears the Agent parameter for a Session target', () => {
    expect(chatHref({ kind: 'session', sessionId: 'session-1' })).toEqual({
      params: { agentId: undefined, sessionId: 'session-1' },
      pathname: '/',
    });
  });
});
