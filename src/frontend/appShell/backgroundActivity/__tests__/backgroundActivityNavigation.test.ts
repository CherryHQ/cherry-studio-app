import { chatHref } from '@/frontend/appShell/navigation/chat';

import { backgroundActivityHref } from '../backgroundActivityNavigation';

test.each(['cherrystudio', 'cherrystudio-dev', 'cherrystudio-preview'])(
  'routes task links for the %s variant and opens nothing for other destinations',
  (scheme) => {
    expect(backgroundActivityHref(`${scheme}:///?agentId=a&sessionId=s`, scheme)).toEqual(
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
    expect(backgroundActivityHref('https://example.com/paintings/p', scheme)).toBeUndefined();
    expect(backgroundActivityHref(`${scheme}://settings`, scheme)).toBeUndefined();
    expect(backgroundActivityHref(`${scheme}:///?agentId=a`, scheme)).toBeUndefined();
    expect(backgroundActivityHref(`${scheme}://paintings/%E0%A4`, scheme)).toBeUndefined();
  },
);
