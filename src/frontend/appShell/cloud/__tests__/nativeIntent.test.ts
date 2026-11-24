import { cloudAmdReturn, redirectCloudAmdSystemPath } from '../nativeIntent';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { scheme: 'cherrystudio-dev' } },
}));

const path = 'cherrystudio-dev://navigate/settings/provider';

afterEach(() => {
  cloudAmdReturn.consume();
  cloudAmdReturn.consumeBrowserOpen();
});

test('opens chat and stages a refresh when the AMD link starts the app', () => {
  expect(redirectCloudAmdSystemPath({ path, initial: true })).toBe('/');
  expect(cloudAmdReturn.consume()).toBe(true);
  expect(cloudAmdReturn.consume()).toBe(false);
});

test('hands a warm AMD link to the app shell without replacing the current route', () => {
  const onReturn = jest.fn();
  const unsubscribe = cloudAmdReturn.subscribe(onReturn);
  expect(redirectCloudAmdSystemPath({ path, initial: false })).toBeNull();
  unsubscribe();
  expect(onReturn).toHaveBeenCalledTimes(1);
  expect(cloudAmdReturn.getSnapshot()).toBe(true);
});

test('leaves unrelated links to the rest of the native router', () => {
  expect(
    redirectCloudAmdSystemPath({ path: 'cherrystudio-dev://uu-remote/callback', initial: true }),
  ).toBeUndefined();
  expect(cloudAmdReturn.getSnapshot()).toBe(false);
});

test('a manual browser return remembers the activating account exactly once', () => {
  cloudAmdReturn.markBrowserOpened({ accountId: 'cloud-user', activating: true });
  expect(cloudAmdReturn.consumeBrowserOpen()).toEqual({
    accountId: 'cloud-user',
    activating: true,
  });
  expect(cloudAmdReturn.consumeBrowserOpen()).toBeUndefined();
  expect(cloudAmdReturn.getSnapshot()).toBe(false);
});
