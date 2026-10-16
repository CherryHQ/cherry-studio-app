import type { ToastShowOptions } from '@cherrystudio/ui/components';
import { useLayoutEffect } from 'react';
import { AppState } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { FeedbackHintProvider, useFeedbackHint } from '../FeedbackHintProvider';
import { useShakeFeedbackPreference } from '../useShakeFeedbackPreference';

let mockPreference = { enabled: false, decision: 'unseen' };
const mockSet = jest.fn();
const mockToast = { show: jest.fn((_options: ToastShowOptions) => 'hint'), hide: jest.fn() };
let mockBlocked = false;
let mockOverlayListener: () => void;
const mockOverlays = {
  hasOverlays: () => mockBlocked,
  subscribe: (listener: () => void) => {
    mockOverlayListener = listener;
    return jest.fn();
  },
};
let mockPath = '/chat';
let mockSupported = true;
let mockConsentPending = false;
jest.mock('@cherrystudio/ui/components', () => ({
  useToast: () => ({ toast: mockToast }),
  useOverlayNavigation: () => mockOverlays,
}));
jest.mock('expo-router', () => ({ usePathname: () => mockPath }));
jest.mock('@/frontend/appShell/privacy', () => ({
  usePrivacyConsentPending: () => mockConsentPending,
}));
jest.mock('@/frontend/data/hooks', () => ({
  useMultiplePreferences: () => [mockPreference, mockSet],
}));
jest.mock('../../../../../modules/diagnostics', () => ({
  supportsDiagnosticMotion: () => mockSupported,
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

let hint: ReturnType<typeof useFeedbackHint>;
let preference: ReturnType<typeof useShakeFeedbackPreference>;
let renderer: ReactTestRenderer;
function Probe() {
  const current = useFeedbackHint();
  const settings = useShakeFeedbackPreference();
  useLayoutEffect(() => {
    hint = current;
    preference = settings;
  });
  return null;
}
const tree = () => (
  <FeedbackHintProvider>
    <Probe />
  </FeedbackHintProvider>
);
const options = () => mockToast.show.mock.calls.at(-1)![0];

beforeEach(() => {
  jest.clearAllMocks();
  mockPreference = { enabled: false, decision: 'unseen' };
  mockPath = '/chat';
  mockSupported = true;
  mockBlocked = false;
  mockConsentPending = false;
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  mockSet.mockReset().mockResolvedValue(undefined);
  act(() => {
    renderer = create(tree());
  });
});
afterEach(() => act(() => renderer.unmount()));

test('shows once per app session without changing the sensor preference', () => {
  act(() => {
    hint.show(120);
    hint.show(120);
  });
  expect(mockToast.show).toHaveBeenCalledTimes(1);
  expect(options()).toMatchObject({ placement: 'bottom', bottomOffset: 120, duration: 12000 });
  expect(mockSet).not.toHaveBeenCalled();
  mockPath = '/another-chat';
  act(() => renderer.update(tree()));
  act(() => hint.show(120));
  expect(mockToast.show).toHaveBeenCalledTimes(1);
  expect(mockToast.hide).toHaveBeenCalledWith('hint');
});

test.each([
  { enabled: true, decision: 'unseen' },
  { enabled: false, decision: 'accepted' },
  { enabled: false, decision: 'ignored' },
])('does not nudge a settled choice %j', (saved) => {
  mockPreference = saved;
  act(() => renderer.update(tree()));
  act(() => hint.show(0));
  expect(mockToast.show).not.toHaveBeenCalled();
});

test.each(['overlay', 'background', 'unsupported', 'consent'])(
  'suppresses %s without consuming discovery',
  (reason) => {
    mockBlocked = reason === 'overlay';
    mockSupported = reason !== 'unsupported';
    mockConsentPending = reason === 'consent';
    Object.defineProperty(AppState, 'currentState', {
      configurable: true,
      value: reason === 'background' ? 'background' : 'active',
    });
    act(() => renderer.update(tree()));
    act(() => hint.show(0));
    expect(mockToast.show).not.toHaveBeenCalled();
    mockBlocked = false;
    mockSupported = true;
    mockConsentPending = false;
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
    act(() => renderer.update(tree()));
    act(() => hint.show(0));
    expect(mockToast.show).toHaveBeenCalledTimes(1);
  },
);

test('new blocking UI dismisses the visible hint', () => {
  act(() => hint.show(0));
  mockBlocked = true;
  act(() => mockOverlayListener());
  expect(mockToast.hide).toHaveBeenCalledWith('hint');
});

test('enabling writes the opt-in and decision together, then confirms durable success', async () => {
  let finish!: () => void;
  mockSet.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  act(() => hint.show(0));
  act(() => options().actions![0].onPress());
  expect(mockSet).toHaveBeenCalledWith(
    { enabled: true, decision: 'accepted' },
    { optimistic: false },
  );
  expect(mockToast.show).toHaveBeenCalledTimes(1);
  await act(async () => finish());
  expect(options().label).toBe('feedback.shakeHint.enabled');
});

test('permanent ignore does not enable sensing and survives remount', async () => {
  act(() => hint.show(0));
  await act(async () => options().actions![1].onPress());
  expect(mockSet).toHaveBeenCalledWith({ decision: 'ignored' }, { optimistic: false });
  mockPreference = { enabled: false, decision: 'ignored' };
  act(() => renderer.unmount());
  mockToast.show.mockClear();
  act(() => {
    renderer = create(tree());
  });
  act(() => hint.show(0));
  expect(mockToast.show).not.toHaveBeenCalled();
});

test('a failed write reports failure without claiming the feature is enabled', async () => {
  mockSet.mockRejectedValueOnce(new Error('disk full'));
  act(() => hint.show(0));
  await act(async () => options().actions![0].onPress());
  expect(options()).toMatchObject({ label: 'settings.privacy.saveFailed', variant: 'danger' });
  expect(mockPreference.enabled).toBe(false);
});

test('manual disable also durably suppresses future hints', async () => {
  await act(async () => preference.setEnabled(false));
  expect(mockSet).toHaveBeenCalledWith(
    { enabled: false, decision: 'ignored' },
    { optimistic: false },
  );
});
