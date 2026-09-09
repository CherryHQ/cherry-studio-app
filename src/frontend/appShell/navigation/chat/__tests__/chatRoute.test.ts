import { chatHref, chatReturnToHref, chatRouteParams, parseChatRoute } from '../chatRoute';

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

  test('serializes complete chat identity for return navigation', () => {
    expect(chatReturnToHref({ kind: 'session', sessionId: 'session / 1' })).toBe(
      '/?sessionId=session%20%2F%201',
    );
    expect(chatReturnToHref({ agentId: 'agent-1', kind: 'draft' })).toBe('/?agentId=agent-1');
  });

  test('preserves a message destination and repeated-navigation identity', () => {
    const target = {
      kind: 'session' as const,
      sessionId: 'session',
      messageId: 'message',
      messageRequestId: 'second-visit',
    };
    expect(parseChatRoute(chatRouteParams(target))).toEqual({ status: 'ready', target });
    expect(chatRouteParams({ kind: 'session', sessionId: 'another' })).toHaveProperty(
      'messageId',
      undefined,
    );
    expect(chatRouteParams({ kind: 'draft', agentId: 'agent' })).toHaveProperty(
      'messageRequestId',
      undefined,
    );
  });
});
