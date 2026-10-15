import {
  conversationHref,
  conversationRefFromRoute,
  conversationShareHref,
} from '../conversationRoute';

test.each(['agent', 'assistant'] as const)(
  'conversation and share links retain the %s domain',
  (domain) => {
    const ref = {
      source: { kind: 'desktop' as const, connectionId: 'pc', domain },
      sessionId: 'same-id',
    };
    expect(conversationHref(ref).params).toMatchObject({
      connectionId: 'pc',
      domain,
      sessionId: 'same-id',
    });
    const { params } = conversationShareHref(ref, 'message', 'grant-scope');
    expect(conversationRefFromRoute(params.sessionId, params.connectionId, params.domain)).toEqual(
      ref,
    );
    expect(params).toMatchObject({ messageId: 'message', scope: 'grant-scope' });
  },
);

test('legacy sharing addresses stay local or use the Agent domain', () => {
  expect(conversationRefFromRoute('session')).toEqual({
    source: { kind: 'local' },
    sessionId: 'session',
  });
  expect(conversationRefFromRoute('session', 'pc')).toEqual({
    source: { kind: 'desktop', connectionId: 'pc', domain: 'agent' },
    sessionId: 'session',
  });
});

test('invalid remote sharing addresses cannot fall back to local or Agent history', () => {
  expect(conversationRefFromRoute('topic', 'pc', 'unknown')).toBeUndefined();
  expect(conversationRefFromRoute('topic', undefined, 'assistant')).toBeUndefined();
});
