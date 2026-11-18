import { act } from 'react-test-renderer';

import { useOnboardingProgress } from '../useOnboardingProgress';
import { createPreferenceClient, deferred, mountHook } from './_onboardingTestUtils';

let mockFocused = true;
const mockToast = jest.fn();
const mockReplace = jest.fn();
jest.mock('@cherrystudio/ui/components', () => ({
  useToast: () => ({ toast: { show: mockToast } }),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/frontend/data', () => jest.requireActual('@/frontend/data/hooks/usePreference'));
jest.mock('expo-router/react-navigation', () => ({ useIsFocused: () => mockFocused }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useFocusEffect: (effect: () => (() => void) | undefined) => {
    const { useEffect } = jest.requireActual('react');
    const isFocused = mockFocused;
    useEffect(() => (isFocused ? effect() : undefined), [effect, isFocused]);
  },
}));

beforeEach(() => {
  mockFocused = true;
  jest.clearAllMocks();
});

it('returns true for a committed save even when focus is lost while waiting', async () => {
  const client = createPreferenceClient();
  const write = deferred<void>();
  const save = client.setMultiple.getMockImplementation()!;
  client.setMultiple.mockImplementationOnce(async (...args) => {
    await write.promise;
    await save(...args);
  });
  const hook = await mountHook(useOnboardingProgress, client);
  let result!: Promise<boolean>;
  await act(async () => {
    result = hook.current.advance('login');
  });
  mockFocused = false;
  await hook.rerender();
  await act(async () => write.resolve());
  expect(await result).toBe(true);
  expect(client.getCachedValue('app.onboarding.status')).toBe('login');
  await hook.unmount();
});

it('writes and commits even when the screen is unfocused at press time', async () => {
  mockFocused = false;
  const hook = await mountHook(useOnboardingProgress);
  await act(async () => expect(await hook.current.advance('login')).toBe(true));
  expect(hook.client.setMultiple).toHaveBeenCalledTimes(1);
  expect(hook.client.setMultiple).toHaveBeenCalledWith(
    { 'app.onboarding.status': 'login', 'app.background_run_guidance.seen': true },
    { optimistic: false },
  );
  expect(hook.current.status).toBe('login');
  expect(hook.current.saveFailed).toBe(false);
  expect(mockToast).not.toHaveBeenCalled();
  await hook.unmount();
});

it('does not start a concurrent write or repeat feedback for a busy advance', async () => {
  const client = createPreferenceClient();
  const write = deferred<void>();
  client.setMultiple.mockImplementationOnce(() => write.promise);
  const hook = await mountHook(useOnboardingProgress, client);
  let first!: Promise<boolean>;
  await act(async () => {
    first = hook.current.advance('login');
    expect(await hook.current.advance('pending')).toBe(false);
  });
  expect(hook.current.isSaving).toBe(true);
  expect(client.setMultiple).toHaveBeenCalledTimes(1);
  expect(mockToast).not.toHaveBeenCalled();
  await act(async () => write.resolve());
  expect(await first).toBe(true);
  await hook.unmount();
});

it('reports one failed save after blur, releases busy, and permits a successful retry', async () => {
  const client = createPreferenceClient();
  const write = deferred<void>();
  client.setMultiple.mockImplementationOnce(() => write.promise);
  const hook = await mountHook(useOnboardingProgress, client);
  let first!: Promise<boolean>;
  await act(async () => {
    first = hook.current.advance('login');
  });
  mockFocused = false;
  await hook.rerender();
  await act(async () => write.reject(new Error('storage failed')));
  expect(await first).toBe(false);
  expect(hook.current.saveFailed).toBe(true);
  expect(hook.current.isSaving).toBe(false);
  expect(mockToast).toHaveBeenCalledTimes(1);
  mockFocused = true;
  await hook.rerender();
  await act(async () => expect(await hook.current.advance('login')).toBe(true));
  expect(hook.current.saveFailed).toBe(false);
  expect(hook.current.status).toBe('login');
  expect(client.setMultiple).toHaveBeenCalledTimes(2);
  expect(mockToast).toHaveBeenCalledTimes(1);
  await hook.unmount();
});

it('commits login and background guidance together without optimistic updates', async () => {
  const hook = await mountHook(useOnboardingProgress);
  await act(async () => expect(await hook.current.advance('login')).toBe(true));
  expect(hook.client.setMultiple).toHaveBeenCalledWith(
    { 'app.onboarding.status': 'login', 'app.background_run_guidance.seen': true },
    { optimistic: false },
  );
  expect(hook.client.getCachedValue('app.background_run_guidance.seen')).toBe(true);
  await hook.unmount();
});

it.each(['resolve', 'reject'] as const)(
  'settles a save after unmount: %s, without feedback',
  async (outcome) => {
    const client = createPreferenceClient();
    const write = deferred<void>();
    client.setMultiple.mockImplementationOnce(() => write.promise);
    const hook = await mountHook(useOnboardingProgress, client);
    let result!: Promise<boolean>;
    await act(async () => {
      result = hook.current.advance('login');
    });
    await hook.unmount();
    await act(async () => {
      if (outcome === 'resolve') write.resolve();
      else write.reject(new Error('late failure'));
    });
    expect(await result).toBe(outcome === 'resolve');
    expect(mockToast).not.toHaveBeenCalled();
  },
);

it('keeps whole-onboarding skip persisted but navigates only while still focused', async () => {
  const client = createPreferenceClient();
  const write = deferred<void>();
  const save = client.setMultiple.getMockImplementation()!;
  client.setMultiple.mockImplementationOnce(async (...args) => {
    await write.promise;
    await save(...args);
  });
  const hook = await mountHook(useOnboardingProgress, client);
  let result!: Promise<void>;
  await act(async () => {
    result = hook.current.skip();
  });
  mockFocused = false;
  await hook.rerender();
  await act(async () => write.resolve());
  await result;
  expect(hook.current.status).toBe('skipped');
  expect(client.getCachedValue('app.onboarding.status')).toBe('skipped');
  expect(client.setMultiple).toHaveBeenCalledWith(
    { 'app.onboarding.status': 'skipped' },
    { optimistic: false },
  );
  expect(mockReplace).not.toHaveBeenCalled();
  mockFocused = true;
  await hook.rerender();
  await act(async () => hook.current.skip());
  expect(hook.current.status).toBe('skipped');
  expect(mockReplace).toHaveBeenCalledWith('/');
  await hook.unmount();
});
