import { getInteractiveConnectProgress } from '../interactiveConnectProgress';

const idle = {
  state: { status: 'idle' as const },
  connected: false,
  operation: null,
  checking: false,
  error: null,
};

it('keeps a committed connection visible after the runtime has cleared the authorization attempt', () => {
  expect(getInteractiveConnectProgress({ ...idle, connected: true })).toBe('connected');
});

it('keeps a failed completion visible instead of returning to a loading state on resume', () => {
  expect(
    getInteractiveConnectProgress({
      ...idle,
      state: { status: 'ready', attemptId: 'failed' },
      error: 'storage',
    }),
  ).toBeNull();
});

it('shows progress while receiving a callback even while the last snapshot still waits for the browser', () => {
  const state = {
    status: 'callback' as const,
    attemptId: 'attempt',
    stage: 'user',
    authorizationUrl: 'https://example.com/authorize',
    redirectUrl: 'cherrystudio://plugins/github/callback',
    expiresAt: 1000,
  };
  expect(getInteractiveConnectProgress({ ...idle, state, operation: 'receiving' })).toBe(
    'receiving',
  );
  expect(getInteractiveConnectProgress({ ...idle, state })).toBeNull();
});

it('shows an explicit check without making the entire browser wait a loading state', () => {
  expect(getInteractiveConnectProgress({ ...idle, checking: true })).toBe('checking');
  expect(getInteractiveConnectProgress(idle)).toBeNull();
});
