import { canCaptureFeedbackRoute } from '../feedbackCapturePolicy';

test.each([
  '/settings/provider',
  '/settings/provider/new',
  '/settings/provider/openai',
  '/settings/device-connections/pair',
  '/settings/device-connections/scan',
  '/plugins',
  '/plugins/mcp/server',
  '/plugins/tools/web-search',
  '/plugins/tools/fetch-urls',
  '/plugins/feishu/connect',
  '/plugins/feishu/callback',
  '/oauth/callback',
  '/uu-remote/callback',
])('does not capture credential and pairing routes: %s', (route) => {
  expect(canCaptureFeedbackRoute(route)).toBe(false);
});

test.each(['/home', '/chat/session', '/settings/about', '/settings/privacy', '/plugins-other'])(
  'allows ordinary pages: %s',
  (route) => {
    expect(canCaptureFeedbackRoute(route)).toBe(true);
  },
);
