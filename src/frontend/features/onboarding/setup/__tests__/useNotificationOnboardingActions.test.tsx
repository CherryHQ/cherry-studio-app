import { getPermissionsAsync, requestPermissionsAsync } from 'expo-notifications';
import { useState } from 'react';
import { act } from 'react-test-renderer';

import { usePreference } from '@/frontend/data/hooks/usePreference';
import type { NotificationPermissionStatusLike } from '@/shared/notifications/notificationPermission';

import { useNotificationOnboardingActions } from '../useNotificationOnboardingActions';
import { useOnboardingProgress } from '../useOnboardingProgress';
import { createPreferenceClient, deferred, mountHook } from './_onboardingTestUtils';

let mockFocused = true;
const mockToast = jest.fn();
const mockSetPermission = jest.fn();
jest.mock('@cherrystudio/ui/components', () => ({
  useToast: () => ({ toast: { show: mockToast } }),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/frontend/data', () => jest.requireActual('@/frontend/data/hooks/usePreference'));
jest.mock('expo-router/react-navigation', () => ({ useIsFocused: () => mockFocused }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useFocusEffect: (effect: () => (() => void) | undefined) => {
    const { useEffect } = jest.requireActual('react');
    const isFocused = mockFocused;
    useEffect(() => (isFocused ? effect() : undefined), [effect, isFocused]);
  },
}));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
}));
const getPermissions = jest.mocked(getPermissionsAsync);
const requestPermissions = jest.mocked(requestPermissionsAsync);
const permission = (status: 'granted' | 'denied' | 'undetermined') =>
  ({ status, granted: status === 'granted', canAskAgain: true, expires: 'never' }) as Awaited<
    ReturnType<typeof getPermissionsAsync>
  >;

function useActions() {
  const progress = useOnboardingProgress();
  const [notifications, setNotifications] = usePreference('chat.completion_notifications.enabled');
  const [, setLiveActivity] = usePreference('chat.background_reply.enabled');
  const [currentPermission, setPermission] = useState<NotificationPermissionStatusLike | null>(
    null,
  );
  const actions = useNotificationOnboardingActions({
    progress,
    notifications,
    setPermission: (value) => {
      mockSetPermission(value);
      setPermission(value);
    },
  });
  return { ...actions, progress, permission: currentPermission, setNotifications, setLiveActivity };
}

beforeEach(() => {
  mockFocused = true;
  jest.clearAllMocks();
  getPermissions.mockReset().mockResolvedValue(permission('granted'));
  requestPermissions.mockReset().mockResolvedValue(permission('denied'));
});

it.each([
  ['get', 'resolve'],
  ['get', 'reject'],
  ['request', 'resolve'],
  ['request', 'reject'],
] as const)('skips during a pending %s and ignores its late %s', async (stage, outcome) => {
  const pending = deferred<Awaited<ReturnType<typeof getPermissionsAsync>>>();
  if (stage === 'get') getPermissions.mockReturnValueOnce(pending.promise);
  else {
    getPermissions.mockResolvedValueOnce(permission('undetermined'));
    requestPermissions.mockReturnValueOnce(pending.promise);
  }
  const client = createPreferenceClient({ 'chat.completion_notifications.enabled': true });
  const hook = await mountHook(useActions, client);
  let continued!: Promise<void>;
  await act(async () => {
    continued = hook.current.continue();
    await hook.current.continue();
  });
  expect(hook.current.isActing).toBe(true);
  expect(getPermissions).toHaveBeenCalledTimes(1);
  await act(async () => hook.current.skip());
  expect(hook.current.isActing).toBe(false);
  expect(hook.current.progress.status).toBe('login');
  expect(client.getCachedValue('app.background_run_guidance.seen')).toBe(true);
  expect(client.setMultiple).toHaveBeenCalledTimes(1);
  await act(async () => {
    if (outcome === 'resolve') pending.resolve(permission('undetermined'));
    else pending.reject(new Error('late permission failure'));
    await continued;
  });
  expect(client.setMultiple).toHaveBeenCalledTimes(1);
  expect(requestPermissions).toHaveBeenCalledTimes(stage === 'request' ? 1 : 0);
  expect(hook.current.permission).toBeNull();
  expect(mockSetPermission).not.toHaveBeenCalled();
  expect(mockToast).not.toHaveBeenCalled();
  await hook.unmount();
});

it('persists login and guidance when skipping an unfocused notification step', async () => {
  mockFocused = false;
  const hook = await mountHook(useActions);
  await act(async () => hook.current.skip());
  expect(hook.current.progress.status).toBe('login');
  expect(hook.client.getCachedValue('app.background_run_guidance.seen')).toBe(true);
  expect(hook.client.setMultiple).toHaveBeenCalledWith(
    { 'app.onboarding.status': 'login', 'app.background_run_guidance.seen': true },
    { optimistic: false },
  );
  expect(getPermissions).not.toHaveBeenCalled();
  expect(requestPermissions).not.toHaveBeenCalled();
  await hook.unmount();
});

it.each(['setNotifications', 'setLiveActivity'] as const)(
  'reports a pending %s save failure once after skip',
  async (setter) => {
    const client = createPreferenceClient();
    const write = deferred<void>();
    client.set.mockReturnValueOnce(write.promise);
    const hook = await mountHook(useActions, client);
    let saving!: Promise<void>;
    await act(async () => {
      saving = hook.current.act(() => hook.current[setter](true, { optimistic: false }));
    });
    expect(hook.current.isActing).toBe(true);
    await act(async () => hook.current.skip());
    expect(hook.current.progress.status).toBe('login');
    await act(async () => {
      write.reject(new Error('preference save failed'));
      await saving;
    });
    expect(mockToast).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith({ label: 'onboarding.saveFailed', variant: 'danger' });
    expect(hook.current.isActing).toBe(false);
    await hook.unmount();
  },
);

it.each(['setNotifications', 'setLiveActivity'] as const)(
  'does not report a pending %s save failure after unmount',
  async (setter) => {
    const client = createPreferenceClient();
    const write = deferred<void>();
    client.set.mockReturnValueOnce(write.promise);
    const hook = await mountHook(useActions, client);
    let saving!: Promise<void>;
    await act(async () => {
      saving = hook.current.act(() => hook.current[setter](true, { optimistic: false }));
    });
    await hook.unmount();
    await act(async () => {
      write.reject(new Error('late preference save failure'));
      await saving;
    });
    expect(mockToast).not.toHaveBeenCalled();
  },
);

it('ignores repeated actions while work is pending and allows another after it settles', async () => {
  const pending = deferred<void>();
  const work = jest.fn(() => pending.promise);
  const hook = await mountHook(useActions);
  let saving!: Promise<void>;
  let repeated!: Promise<void>;
  await act(async () => {
    saving = hook.current.act(work);
    repeated = hook.current.act(work);
  });
  expect(work).toHaveBeenCalledTimes(1);
  expect(hook.current.isActing).toBe(true);
  await act(async () => {
    pending.resolve();
    await Promise.all([saving, repeated]);
  });
  await act(async () => hook.current.act(work));
  expect(work).toHaveBeenCalledTimes(2);
  expect(hook.current.isActing).toBe(false);
  await hook.unmount();
});

it('uses the saved notification setting when continuing after a pending change', async () => {
  const client = createPreferenceClient({ 'chat.completion_notifications.enabled': true });
  const write = deferred<void>();
  const save = client.set.getMockImplementation()!;
  client.set.mockImplementationOnce(async (...args) => {
    await write.promise;
    await save(...args);
  });
  getPermissions.mockResolvedValue(permission('undetermined'));
  const hook = await mountHook(useActions, client);
  let saving!: Promise<void>;
  await act(async () => {
    saving = hook.current.act(() => hook.current.setNotifications(false, { optimistic: false }));
    await hook.current.continue();
  });
  expect(hook.current.isActing).toBe(true);
  expect(getPermissions).not.toHaveBeenCalled();
  expect(hook.current.progress.status).not.toBe('login');
  await act(async () => {
    write.resolve();
    await saving;
  });
  expect(hook.current.isActing).toBe(false);
  expect(client.getCachedValue('chat.completion_notifications.enabled')).toBe(false);
  await act(async () => hook.current.continue());
  expect(getPermissions).not.toHaveBeenCalled();
  expect(requestPermissions).not.toHaveBeenCalled();
  expect(hook.current.progress.status).toBe('login');
  await hook.unmount();
});

it.each([true, false])(
  'skip leaves notification preferences unchanged (%s) without permission APIs',
  async (enabled) => {
    const client = createPreferenceClient({
      'chat.completion_notifications.enabled': enabled,
      'chat.background_reply.enabled': !enabled,
    });
    const hook = await mountHook(useActions, client);
    await act(async () => hook.current.skip());
    expect(getPermissions).not.toHaveBeenCalled();
    expect(requestPermissions).not.toHaveBeenCalled();
    expect(mockSetPermission).not.toHaveBeenCalled();
    expect(client.set).not.toHaveBeenCalled();
    expect(client.setMultiple).toHaveBeenCalledWith(
      { 'app.onboarding.status': 'login', 'app.background_run_guidance.seen': true },
      { optimistic: false },
    );
    expect(client.getCachedValue('chat.completion_notifications.enabled')).toBe(enabled);
    expect(client.getCachedValue('chat.background_reply.enabled')).toBe(!enabled);
    await hook.unmount();
  },
);

it.each(['get', 'request'] as const)(
  'reports a %s permission failure once and permits retry',
  async (stage) => {
    if (stage === 'get') getPermissions.mockRejectedValueOnce(new Error('permission failure'));
    else {
      getPermissions.mockResolvedValueOnce(permission('undetermined'));
      requestPermissions.mockRejectedValueOnce(new Error('permission failure'));
    }
    const hook = await mountHook(
      useActions,
      createPreferenceClient({ 'chat.completion_notifications.enabled': true }),
    );
    await act(async () => hook.current.continue());
    expect(hook.current.isActing).toBe(false);
    expect(hook.client.setMultiple).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith({ label: 'onboarding.saveFailed', variant: 'danger' });
    await act(async () => hook.current.continue());
    expect(hook.current.progress.status).toBe('login');
    expect(mockToast).toHaveBeenCalledTimes(1);
    await hook.unmount();
  },
);

it.each(['resolve', 'reject'] as const)(
  'ignores a permission promise that settles after unmount: %s',
  async (outcome) => {
    const pending = deferred<Awaited<ReturnType<typeof getPermissionsAsync>>>();
    getPermissions.mockReturnValueOnce(pending.promise);
    const hook = await mountHook(
      useActions,
      createPreferenceClient({ 'chat.completion_notifications.enabled': true }),
    );
    let continued!: Promise<void>;
    await act(async () => {
      continued = hook.current.continue();
    });
    await hook.unmount();
    await act(async () => {
      if (outcome === 'resolve') pending.resolve(permission('undetermined'));
      else pending.reject(new Error('late permission failure'));
      await continued;
    });
    expect(hook.client.setMultiple).not.toHaveBeenCalled();
    expect(requestPermissions).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  },
);

it.each(['granted', 'denied', 'undetermined'] as const)(
  'continues after %s permission, including a denied request',
  async (status) => {
    getPermissions.mockResolvedValueOnce(permission(status));
    const hook = await mountHook(
      useActions,
      createPreferenceClient({ 'chat.completion_notifications.enabled': true }),
    );
    await act(async () => hook.current.continue());
    expect(hook.current.progress.status).toBe('login');
    expect(requestPermissions).toHaveBeenCalledTimes(status === 'undetermined' ? 1 : 0);
    expect(hook.current.permission).toEqual(
      permission(status === 'undetermined' ? 'denied' : status),
    );
    await hook.unmount();
  },
);

it('continues with notifications disabled without consulting permissions', async () => {
  const hook = await mountHook(
    useActions,
    createPreferenceClient({ 'chat.completion_notifications.enabled': false }),
  );
  await act(async () => hook.current.continue());
  expect(hook.current.progress.status).toBe('login');
  expect(getPermissions).not.toHaveBeenCalled();
  expect(requestPermissions).not.toHaveBeenCalled();
  await hook.unmount();
});

it('does not skip during a progress save', async () => {
  const client = createPreferenceClient();
  const write = deferred<void>();
  client.setMultiple.mockImplementationOnce(() => write.promise);
  const hook = await mountHook(useActions, client);
  let saving!: Promise<boolean>;
  await act(async () => {
    saving = hook.current.progress.advance('permissions');
  });
  await act(async () => hook.current.skip());
  expect(client.setMultiple).toHaveBeenCalledTimes(1);
  await act(async () => write.resolve());
  await saving;
  await hook.unmount();
});
