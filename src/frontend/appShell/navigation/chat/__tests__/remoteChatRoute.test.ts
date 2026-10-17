import { parseRemoteChatRoute, remoteChatHref } from '../remoteChatRoute';

test('legacy remote links retain their Agent destination', () => {
  expect(parseRemoteChatRoute({ connectionId: 'pc', sessionId: 'session' })).toMatchObject({
    domain: 'agent',
    connectionId: 'pc',
    sessionId: 'session',
  });
});

test('Assistant links preserve their domain even when ids match an Agent session', () => {
  const target = { domain: 'assistant' as const, connectionId: 'pc', sessionId: 'same-id' };
  expect(parseRemoteChatRoute(remoteChatHref(target).params)).toMatchObject(target);
  expect(parseRemoteChatRoute({ domain: ['assistant'], sessionId: ['same-id'] })).toMatchObject({
    domain: 'assistant',
    sessionId: 'same-id',
  });
});

test.each(['unknown', '', 'Agent'])('does not reinterpret domain %j as Agent access', (domain) => {
  expect(parseRemoteChatRoute({ domain, connectionId: 'pc' })).toBeUndefined();
});
