import { AppIconRuntime } from '../AppIconRuntime';

type AppIcon = 'community' | 'enterprise';

function fixture() {
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
  const runtime = new AppIconRuntime({
    native,
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
    get icon() {
      return icon;
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

test('an enterprise profile automatically selects the enterprise launcher without a setting', async () => {
  const f = fixture();
  await f.runtime.synchronize();
  expect(f.icon).toBe('enterprise');
});

test('returning to community restores its icon, and re-entering enterprise changes it again', async () => {
  const f = fixture();
  await f.runtime.synchronize();
  expect(f.icon).toBe('enterprise');
  f.selectEnterprise(false);
  await f.runtime.synchronize();
  expect(f.icon).toBe('community');
  f.selectEnterprise(true);
  await f.runtime.synchronize();
  expect(f.icon).toBe('enterprise');
});

test('a community profile keeps the community icon without a native change', async () => {
  const f = fixture();
  f.selectEnterprise(false);
  await f.runtime.synchronize();
  expect(f.icon).toBe('community');
  expect(f.native.setAppIcon).not.toHaveBeenCalled();
});

test('an unchanged enterprise profile does not repeat the system icon-change notice', async () => {
  const f = fixture();
  f.setIcon('enterprise');
  await f.runtime.synchronize();
  await f.runtime.synchronize();
  expect(f.native.setAppIcon).not.toHaveBeenCalled();
});

test('a rejected native change does not poison automatic synchronization retries', async () => {
  const f = fixture();
  f.native.setAppIcon.mockRejectedValueOnce(new Error('OS refused'));
  await expect(f.runtime.synchronize()).rejects.toThrow('OS refused');
  expect(f.icon).toBe('community');
  await f.runtime.synchronize();
  expect(f.icon).toBe('enterprise');
});

test('unsupported distributions skip native changes without blocking synchronization', async () => {
  const f = fixture();
  f.setSupported(false);
  await expect(f.runtime.synchronize()).resolves.toBeUndefined();
  expect(f.native.setAppIcon).not.toHaveBeenCalled();
});

test.each([null, {}])('older clients without icon methods are skipped: %j', async (native) => {
  const runtime = new AppIconRuntime({
    native,
    isEnterprise: () => true,
    foreground: { isActive: () => true, subscribe: () => () => {} },
  });
  await expect(runtime.synchronize()).resolves.toBeUndefined();
});

test('foreground return repairs a deferred change, while stopping removes automatic observation', async () => {
  const f = fixture();
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
  const f = fixture();
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

test('queued synchronization reads the selected profile when the work executes', async () => {
  const f = fixture();
  const first = f.runtime.synchronize();
  f.selectEnterprise(false);
  await Promise.all([first, f.runtime.synchronize()]);
  expect(f.icon).toBe('community');
  expect(f.native.setAppIcon).not.toHaveBeenCalled();
});

test('an inconsistent native launcher state is normalized even if a previous change was interrupted', async () => {
  const f = fixture();
  f.setIcon(null);
  await f.runtime.synchronize();
  expect(f.icon).toBe('enterprise');
});
