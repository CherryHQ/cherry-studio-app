import { chatHref, remoteChatHref } from '@/frontend/appShell/navigation/chat';

import { backgroundActivityHref } from '../backgroundActivityNavigation';

test('maps current and legacy task links to their owning routes', () => {
  const scheme = 'cherrystudio-dev';
  expect(backgroundActivityHref(`${scheme}:///?sessionId=s`, scheme)).toEqual(
    chatHref({ kind: 'session', sessionId: 's' }),
  );
  expect(backgroundActivityHref(`${scheme}://paintings/p`, scheme)).toEqual({
    pathname: '/paintings',
    params: { paintingId: 'p' },
  });
  expect(backgroundActivityHref(`${scheme}://paintings?paintingId=p`, scheme)).toEqual({
    pathname: '/paintings',
    params: { paintingId: 'p' },
  });
  expect(backgroundActivityHref(`${scheme}://remote?connectionId=pc&sessionId=s`, scheme)).toEqual(
    remoteChatHref({ connectionId: 'pc', sessionId: 's' }),
  );
  expect(backgroundActivityHref(`${scheme}://settings`, scheme)).toBeUndefined();
});
