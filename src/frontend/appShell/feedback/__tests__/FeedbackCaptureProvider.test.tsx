import { useLayoutEffect } from 'react';
import { AppState } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import {
  FeedbackCaptureProvider,
  useFeedbackActions,
  useFeedbackCapture,
} from '../FeedbackCaptureProvider';
import { removeFeedbackScreenshot } from '../feedbackScreenshot';
import { useShakeFeedback } from '../useShakeFeedback';

const mockPrepare = jest.fn();
jest.mock('@cherrystudio/ui/components', () => ({
  useOverlayNavigation: () => ({
    prepareForNavigation: mockPrepare,
    canNavigate: () => true,
  }),
}));

let mockPath = '/home';
let mockConsentPending = false;
let mockShakeEnabled = true;
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  usePathname: () => mockPath,
  useRouter: () => ({ push: mockPush }),
}));
jest.mock('@/frontend/appShell/privacy', () => ({
  usePrivacyConsentPending: () => mockConsentPending,
}));
jest.mock('@/frontend/data/hooks', () => ({ usePreference: () => [mockShakeEnabled, jest.fn()] }));
jest.mock('../useShakeFeedback', () => ({ useShakeFeedback: jest.fn() }));
jest.mock('../feedbackScreenshot', () => ({ removeFeedbackScreenshot: jest.fn() }));

let value: ReturnType<typeof useFeedbackCapture>;
let actions: ReturnType<typeof useFeedbackActions>;
let renderer: ReactTestRenderer;
function Probe() {
  const current = useFeedbackCapture();
  const currentActions = useFeedbackActions();
  useLayoutEffect(() => {
    value = current;
    actions = currentActions;
  });
  return null;
}
function tree() {
  return (
    <FeedbackCaptureProvider>
      <Probe />
    </FeedbackCaptureProvider>
  );
}
function options() {
  return jest.mocked(useShakeFeedback).mock.calls.at(-1)![0];
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPath = '/home';
  mockConsentPending = false;
  mockShakeEnabled = true;
  mockPrepare.mockResolvedValue(true);
  AppState.currentState = 'active';
  act(() => {
    renderer = create(tree());
  });
});
afterEach(() => act(() => renderer.unmount()));

test('hands off a captured image and deletes it on leaving the form', () => {
  const image = { id: 'capture', uri: 'file:///capture.png' };
  act(() => options().onCaptured(image));
  expect(value.screenshot).toEqual(image);
  expect(mockPush).toHaveBeenCalledWith('/settings/about/feedback/new');
  mockPath = '/settings/about/feedback/new';
  act(() => renderer.update(tree()));
  expect(options().enabled).toBe(false);
  expect(removeFeedbackScreenshot).not.toHaveBeenCalled();
  mockPath = '/home';
  act(() => renderer.update(tree()));
  expect(removeFeedbackScreenshot).toHaveBeenCalledWith(image);
  expect(value.screenshot).toBeUndefined();
});

test('manual entry has no image', () => {
  expect(value.screenshot).toBeUndefined();
  expect(value.captureFailed).toBe(false);
});

test('keeps shake capture out of onboarding and the privacy disclosure', () => {
  mockConsentPending = true;
  act(() => renderer.update(tree()));
  expect(options().enabled).toBe(false);
  mockConsentPending = false;
  mockPath = '/onboarding/welcome';
  act(() => renderer.update(tree()));
  expect(options().enabled).toBe(false);
});

test('observes the persisted shake preference without disabling manual feedback', () => {
  mockShakeEnabled = false;
  act(() => renderer.update(tree()));
  expect(options().enabled).toBe(false);
  expect(value.screenshot).toBeUndefined();
  expect(value.captureFailed).toBe(false);
  mockShakeEnabled = true;
  act(() => renderer.update(tree()));
  expect(options().enabled).toBe(true);
  mockShakeEnabled = false;
  act(() => renderer.update(tree()));
  expect(options().enabled).toBe(false);
});

test('sensitive routes retain text feedback without claiming that capture failed', () => {
  mockPath = '/plugins/mcp/server';
  act(() => renderer.update(tree()));
  expect(options().enabled).toBe(true);
  expect(options().captureScreenshot).toBe(false);
  act(() => options().onCaptured(undefined));
  expect(mockPush).toHaveBeenCalledWith('/settings/about/feedback/new');
  expect(value.screenshot).toBeUndefined();
  expect(value.captureFailed).toBe(false);
});

test('freezes context before screenshot capture and removes it when the form is left', () => {
  let source = {
    feature: 'chat' as const,
    executionSource: 'desktop' as const,
    sessionId: 'first-session',
  };
  actions.registerSource(mockPath, () => source);
  const finish = options().onCaptureStarted?.();
  source = { ...source, sessionId: 'next-session' };
  act(() => options().onCaptured(undefined));
  finish?.();
  expect(value.context).toMatchObject({
    entry: 'shake',
    executionSource: 'desktop',
    sessionId: 'first-session',
  });
  expect(options().canStart()).toBe(false);
  mockPath = '/settings/about/feedback/new';
  act(() => renderer.update(tree()));
  expect(value.context?.sessionId).toBe('first-session');
  mockPath = '/home';
  act(() => renderer.update(tree()));
  expect(value.context).toBeUndefined();
});

test('a cancelled capture releases feedback entry without retaining its context', async () => {
  const finish = options().onCaptureStarted?.();
  expect(options().canStart()).toBe(false);
  finish?.();
  expect(options().canStart()).toBe(true);
  await act(async () => actions.openFeedback({ feature: 'chat', messageId: 'chosen-message' }));
  expect(value.context).toMatchObject({ entry: 'error', messageId: 'chosen-message' });
  expect(mockPush).toHaveBeenCalledTimes(1);
  await act(async () => actions.openFeedback({ feature: 'chat', messageId: 'other-message' }));
  expect(mockPush).toHaveBeenCalledTimes(1);
  expect(value.context?.messageId).toBe('chosen-message');
});

test('route changes cancel a pending error handoff and do not leave a stale draft', async () => {
  let release!: (ready: boolean) => void;
  mockPrepare.mockImplementationOnce(
    () =>
      new Promise<boolean>((resolve) => {
        release = resolve;
      }),
  );
  let pending!: Promise<void>;
  act(() => {
    pending = actions.openFeedback({ feature: 'chat', sessionId: 'old-session' });
  });
  mockPath = '/settings';
  act(() => renderer.update(tree()));
  await act(async () => {
    release(true);
    await pending;
  });
  expect(mockPush).not.toHaveBeenCalled();
  expect(value.context).toBeUndefined();
  await act(async () => actions.openFeedback({ feature: 'other' }));
  expect(mockPush).toHaveBeenCalledTimes(1);
  expect(value.context).not.toHaveProperty('sessionId');
});
