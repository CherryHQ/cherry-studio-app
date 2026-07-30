import { getRequestContext } from '../context';

describe('getRequestContext', () => {
  test('returns a valid request context', () => {
    const context = { chatId: 'topic-1', requestId: 'request-1' };
    expect(
      getRequestContext({ experimental_context: context, messages: [], toolCallId: 'call-1' }),
    ).toBe(context);
  });

  test('fails when the Agent did not provide request context', () => {
    expect(() => getRequestContext({ messages: [], toolCallId: 'call-1' })).toThrow(
      'valid RequestContext',
    );
  });
});
