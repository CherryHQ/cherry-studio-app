import { conversationShareHref } from '@/frontend/appShell/navigation/chat/conversationRoute';

import { createChatShareHandoff, getChatShareHandoff } from '../chatShareHandoff';
jest.mock('expo-router', () => ({}));

const translations = {
  answer: { sourceHash: 'a'.repeat(64), language: 'zh-CN' as const, content: '译文' },
};

test('a share token contains no message text and cannot resolve in a different Session', () => {
  const token = createChatShareHandoff('session', translations)!;
  expect(token).not.toContain('译文');
  const route = conversationShareHref(
    { source: { kind: 'local' }, sessionId: 'session' },
    'answer',
    undefined,
    token,
  );
  expect(route.params).toMatchObject({
    sessionId: 'session',
    messageId: 'answer',
    translationHandoff: token,
  });
  expect(JSON.stringify(route)).not.toContain('译文');
  expect(getChatShareHandoff(token, 'session')).toEqual(translations);
  expect(getChatShareHandoff(token, 'other')).toBeUndefined();
  expect(getChatShareHandoff(undefined, 'session')).toBeUndefined();
  expect(getChatShareHandoff('unknown', 'session')).toBeUndefined();
});

test('the newest share entry replaces the earlier expansion snapshot', () => {
  const first = createChatShareHandoff('session', translations)!;
  const second = createChatShareHandoff('session', translations)!;
  expect(second).not.toBe(first);
  expect(getChatShareHandoff(first, 'session')).toBeUndefined();
  expect(getChatShareHandoff(second, 'session')).toEqual(translations);
  expect(createChatShareHandoff('session', {})).toBeUndefined();
  expect(getChatShareHandoff(second, 'session')).toBeUndefined();
});
