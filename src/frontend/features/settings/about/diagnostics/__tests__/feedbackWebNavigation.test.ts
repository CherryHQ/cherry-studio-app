import { diagnosticStatusPageUrl } from '@/shared/contracts/diagnostics';

import { feedbackWebNavigationAction } from '../feedbackWebNavigation';

const id = '550e8400-e29b-41d4-a716-446655440000';
test('the report and its anchors stay embedded while associated GitHub links open separately', () => {
  expect(feedbackWebNavigationAction('about:blank', id)).toBe('allow');
  expect(feedbackWebNavigationAction(diagnosticStatusPageUrl(id), id)).toBe('allow');
  expect(feedbackWebNavigationAction(`${diagnosticStatusPageUrl(id)}#reply`, id)).toBe('allow');
  expect(
    feedbackWebNavigationAction('https://github.com/CherryHQ/cherry-studio/issues/1', id),
  ).toBe('external');
});
test.each([
  'file:///etc/passwd',
  'javascript:alert(1)',
  'http://github.com/test',
  'https://github.com.evil.test',
  'https://token@github.com/test',
  'https://github.com:8443/test',
  'https://api.cherry-ai.com/diagnostics/other',
  'https://evil.test',
  'not a URL',
])('blocks navigation outside the status-page contract: %s', (url) => {
  expect(feedbackWebNavigationAction(url, id)).toBe('block');
});
