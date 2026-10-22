import { useLayoutEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { FeedbackCaptureProvider, useFeedbackCapture } from '../FeedbackCaptureProvider';
import { removeFeedbackScreenshot } from '../feedbackScreenshot';
import { useShakeFeedback } from '../useShakeFeedback';

jest.mock('@cherrystudio/ui/components', () => ({
  useOverlayNavigation: () => ({
    prepareForNavigation: jest.fn().mockResolvedValue(true),
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
let renderer: ReactTestRenderer;
function Probe() {
  const current = useFeedbackCapture();
  useLayoutEffect(() => {
    value = current;
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

test('manual entry has no image, and removal clears a captured attachment immediately', () => {
  expect(value.screenshot).toBeUndefined();
  expect(value.captureFailed).toBe(false);
  act(() => options().onCaptured({ id: 'capture', uri: 'file:///capture.png' }));
  act(() => value.clearScreenshot());
  expect(value.screenshot).toBeUndefined();
  expect(removeFeedbackScreenshot).toHaveBeenCalledTimes(1);
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
