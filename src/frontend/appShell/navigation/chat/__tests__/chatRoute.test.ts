import {
  chatHref,
  chatReturnToHref,
  chatRouteParams,
  parseChatPreviewSource,
  parseChatRoute,
} from '../chatRoute';

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

  test('carries a composer handoff on a draft and drops it on a Session', () => {
    const target = { agentId: 'agent-1', kind: 'draft' as const, composerHandoff: 'share-1' };
    expect(parseChatRoute(chatRouteParams(target))).toEqual({ status: 'ready', target });
    expect(chatRouteParams({ kind: 'session', sessionId: 'session-1' })).toHaveProperty(
      'composerHandoff',
      undefined,
    );
    expect(parseChatRoute({ composerHandoff: 'share-1', sessionId: 'session-1' })).toEqual({
      status: 'ready',
      target: { kind: 'session', sessionId: 'session-1' },
    });
  });

  test('serializes complete chat identity for return navigation', () => {
    expect(chatReturnToHref({ kind: 'session', sessionId: 'session / 1' })).toBe(
      '/?sessionId=session%20%2F%201',
    );
    expect(chatReturnToHref({ agentId: 'agent-1', kind: 'draft' })).toBe('/?agentId=agent-1');
  });

  test('carries an unsent workspace selection only with its draft', () => {
    const workspaceDraftId = '00000000-0000-7000-8000-000000000001';
    const target = { kind: 'draft' as const, agentId: 'agent-1', workspaceDraftId };
    expect(parseChatRoute(chatRouteParams(target))).toEqual({ status: 'ready', target });
    expect(chatRouteParams({ kind: 'draft', agentId: 'agent-1' }).workspaceDraftId).toBeUndefined();
    expect(
      chatRouteParams({ kind: 'session', sessionId: 'session-1' }).workspaceDraftId,
    ).toBeUndefined();
    expect(parseChatRoute({ sessionId: 'session-1', workspaceDraftId })).toEqual({
      status: 'ready',
      target: { kind: 'session', sessionId: 'session-1' },
    });
  });

  test('carries an SSH selection only with its draft and rejects malformed identities', () => {
    const sshDraftId = '00000000-0000-7000-8000-000000000001';
    const target = { kind: 'draft' as const, agentId: 'agent-1', sshDraftId };
    expect(parseChatRoute(chatRouteParams(target))).toEqual({ status: 'ready', target });
    expect(chatRouteParams({ kind: 'session', sessionId: 'session-1' }).sshDraftId).toBeUndefined();
    expect(parseChatRoute({ sessionId: 'session-1', sshDraftId })).toEqual({
      status: 'ready',
      target: { kind: 'session', sessionId: 'session-1' },
    });
    expect(parseChatRoute({ agentId: 'agent-1', sshDraftId: 'invalid' }).status).toBe('invalid');
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

  test.each([
    { kind: 'session' as const, sessionId: 'session-1' },
    { kind: 'draft' as const, agentId: 'agent-1', composerHandoff: 'seed-1' },
  ])('round-trips a preview selection without replacing the $kind identity', (source) => {
    const target = { ...source, selectionHandoff: 'selection-1' };
    const params = chatRouteParams(target);
    expect(parseChatRoute(params)).toEqual({ status: 'ready', target });
    expect(parseChatPreviewSource(JSON.stringify(params))).toEqual(target);
    expect(chatRouteParams(source).selectionHandoff).toBeUndefined();
  });

  test.each([undefined, '', '{', 'null', '[]', '{"sessionId": 123}', '{"draft": "private"}'])(
    'rejects an invalid preview source: %s',
    (source) => {
      expect(parseChatPreviewSource(source)).toBeUndefined();
    },
  );
});
