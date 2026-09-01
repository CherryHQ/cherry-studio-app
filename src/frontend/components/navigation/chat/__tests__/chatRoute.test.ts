import { chatHref, parseChatRoute, parseStoredChatTarget, serializeChatTarget } from '../chatRoute';

describe('shared chat route contract', () => {
  test('requires both identities for a Session target', () => {
    expect(parseChatRoute({ agentId: 'agent-1', sessionId: 'session-1' })).toEqual({
      status: 'ready',
      target: { agentId: 'agent-1', kind: 'session', sessionId: 'session-1' },
    });
    expect(parseChatRoute({ sessionId: 'session-1' })).toEqual({
      sessionId: 'session-1',
      status: 'partial-session',
    });
  });

  test('clears the Session parameter for a draft target', () => {
    expect(chatHref({ agentId: 'agent-1', kind: 'draft' })).toEqual({
      params: { agentId: 'agent-1', sessionId: undefined },
      pathname: '/',
    });
  });

  test('round-trips a stored target and rejects malformed stored values', () => {
    const target = { agentId: 'agent-1', kind: 'session', sessionId: 'session-1' } as const;

    expect(parseStoredChatTarget(serializeChatTarget(target))).toEqual(target);
    expect(parseStoredChatTarget('{bad json')).toBeUndefined();
    expect(parseStoredChatTarget(JSON.stringify({ agentId: 'agent-1' }))).toBeUndefined();
  });
});
