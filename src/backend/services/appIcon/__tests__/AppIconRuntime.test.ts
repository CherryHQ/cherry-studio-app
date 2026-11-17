import type { AppIcon } from '@/shared/contracts/appIcon';

import { AppIconRuntime } from '../AppIconRuntime';

function fixture(followsAccount = false) {
  let stored = followsAccount;
  let isEnterprise = true;
  let isActive = true;
  let icon: AppIcon | null = 'community';
  let isSupported = true;
  let onForeground: (() => void) | undefined;
  const native = {
    getAppIcon: jest.fn(async () => ({ isSupported, icon })),
    setAppIcon: jest.fn(async (next: AppIcon) => {
      icon = next;
    }),
  };
  const settings = {
    read: () => stored,
    write: (next: boolean) => {
      stored = next;
    },
  };
  const runtime = new AppIconRuntime({
    native,
    settings,
    isEnterprise: () => isEnterprise,
    foreground: {
      isActive: () => isActive,
      subscribe(listener) {
        onForeground = listener;
        return () => {
          onForeground = undefined;
        };
      },
    },
  });
  return {
    runtime,
    native,
    settings,
    get icon() {
      return icon;
    },
    get stored() {
      return stored;
    },
    selectEnterprise(next: boolean) {
      isEnterprise = next;
    },
    setActive(next: boolean) {
      isActive = next;
      if (next) onForeground?.();
    },
    setSupported(next: boolean) {
      isSupported = next;
    },
    setIcon(next: AppIcon | null) {
      icon = next;
    },
  };
}

test('an enterprise profile does not change the launcher before the user opts in', async () => {
  const f = fixture();
  await f.runtime.synchronize();
  expect(f.icon).toBe('community');
  expect(f.stored).toBe(false);
  await f.runtime.setFollowAccount(true);
  expect(f.icon).toBe('enterprise');
  expect(f.stored).toBe(true);
});

test('consent survives returning to community and re-entering an enterprise space', async () => {
  const f = fixture(true);
  await f.runtime.synchronize();
  expect(f.icon).toBe('enterprise');
  f.selectEnterprise(false);
  await f.runtime.synchronize();
  expect(f.icon).toBe('community');
  f.selectEnterprise(true);
  await f.runtime.synchronize();
  expect(f.icon).toBe('enterprise');
  expect(f.stored).toBe(true);
});

test('disabling in an enterprise space restores community artwork and stops following spaces', async () => {
  const f = fixture(true);
  f.setIcon('enterprise');
  await f.runtime.setFollowAccount(false);
  await f.runtime.synchronize();
  expect(f.icon).toBe('community');
  expect(f.stored).toBe(false);
  expect(f.runtime.getState().followsAccount).toBe(false);
});

test('an unchanged enterprise profile does not repeat the system icon-change notice', async () => {
  const f = fixture(true);
  f.setIcon('enterprise');
  await f.runtime.synchronize();
  await f.runtime.synchronize();
  expect(f.native.setAppIcon).not.toHaveBeenCalled();
});

test('a rejected native change leaves the choice unchanged and does not poison the retry queue', async () => {
  const f = fixture();
  f.native.setAppIcon.mockRejectedValueOnce(new Error('OS refused'));
  await expect(f.runtime.setFollowAccount(true)).rejects.toThrow('OS refused');
  expect(f.stored).toBe(false);
  expect(f.runtime.getState()).toMatchObject({ followsAccount: false, isBusy: false });
  await f.runtime.setFollowAccount(true);
  expect(f.icon).toBe('enterprise');
  expect(f.stored).toBe(true);
});

test('unsupported distributions cannot record opt-in or change icons', async () => {
  const f = fixture();
  f.setSupported(false);
  await expect(f.runtime.setFollowAccount(true)).rejects.toThrow('unavailable');
  expect(f.stored).toBe(false);
  expect(f.runtime.getState().isSupported).toBe(false);
  expect(f.native.setAppIcon).not.toHaveBeenCalled();
});

test('foreground return repairs a deferred change, while stopping removes automatic observation', async () => {
  const f = fixture(true);
  f.setActive(false);
  f.runtime.start();
  await f.runtime.synchronize();
  expect(f.icon).toBe('community');
  f.setActive(true);
  await f.runtime.synchronize();
  expect(f.icon).toBe('enterprise');
  f.runtime.stop();
  f.selectEnterprise(false);
  f.setActive(false);
  f.setActive(true);
  expect(f.icon).toBe('enterprise');
});

test('a profile change during the native operation settles on the latest selected profile', async () => {
  const f = fixture(true);
  let finish!: () => void;
  let started!: () => void;
  const nativeStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  f.native.setAppIcon.mockImplementationOnce(async (next) => {
    started();
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    f.setIcon(next);
  });
  const pending = f.runtime.synchronize();
  await nativeStarted;
  f.selectEnterprise(false);
  finish();
  await pending;
  expect(f.icon).toBe('community');
});

test('successive on/off choices serialize and retain the last choice', async () => {
  const f = fixture();
  await Promise.all([f.runtime.setFollowAccount(true), f.runtime.setFollowAccount(false)]);
  expect(f.icon).toBe('community');
  expect(f.stored).toBe(false);
  expect(f.runtime.getState().isBusy).toBe(false);
});

test('an inconsistent native launcher state is normalized even if a previous change was interrupted', async () => {
  const f = fixture(true);
  f.setIcon(null);
  await f.runtime.synchronize();
  expect(f.icon).toBe('enterprise');
});
