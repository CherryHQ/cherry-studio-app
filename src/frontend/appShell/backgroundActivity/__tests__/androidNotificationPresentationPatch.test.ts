import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const root = dirname(require.resolve('expo-notifications/package.json'));
const source = (path: string) => readFileSync(join(root, path), 'utf8');
const androidRoot = 'android/src/main/java/expo/modules/notifications';

const mockAddListener = jest.fn();
jest.mock('expo-notifications/build/NotificationsEmitterModule', () => ({
  __esModule: true,
  default: { addListener: mockAddListener },
}));

test('Android builds the patched notification sources instead of the bundled unpatched AAR', () => {
  const config = JSON.parse(readFileSync(join(__dirname, '../../../../../package.json'), 'utf8'));
  expect(config.expo.autolinking.android.buildFromSource).toContain('expo-notifications');
});

// Installed-package guards protect the native/JS event seam; device delivery
// still needs acceptance in a development client containing this patch.
test('presentation emits its own event after notify, even when background receipt skips JS', () => {
  const presentation = source(`${androidRoot}/service/delegates/ExpoPresentationDelegate.kt`);
  expect(presentation).toMatch(
    /\.notify\([\s\S]*?withContext\(Dispatchers.Main\)[\s\S]*?onNotificationPresented\(notification\)/,
  );
  expect(source(`${androidRoot}/notifications/NotificationManager.kt`)).toContain(
    'listener.onNotificationPresented(notification)',
  );
  expect(source(`${androidRoot}/notifications/emitting/NotificationsEmitter.kt`)).toContain(
    'sendEvent("onDidPresentNotification", NotificationSerializer.toBundle(notification))',
  );
});

test('both shipped JavaScript and TypeScript expose the presentation subscription', () => {
  for (const path of ['src/NotificationsEmitter.ts', 'build/NotificationsEmitter.js']) {
    expect(source(path)).toContain("didPresentNotificationEventName = 'onDidPresentNotification'");
    expect(source(path)).toContain('export function addNotificationPresentedListener(');
  }
  expect(source('build/NotificationsEmitter.d.ts')).toContain(
    'export declare function addNotificationPresentedListener(',
  );
});

test('presentation subscriptions use the native event emitter and return its cleanup handle', () => {
  const { addNotificationPresentedListener } = jest.requireActual<
    typeof import('expo-notifications')
  >('expo-notifications/build/NotificationsEmitter');
  const subscription = { remove: jest.fn() };
  mockAddListener.mockReturnValueOnce(subscription);

  const result = addNotificationPresentedListener(jest.fn());

  expect(mockAddListener).toHaveBeenCalledWith('onDidPresentNotification', expect.any(Function));
  expect(result).toBe(subscription);
  result.remove();
  expect(subscription.remove).toHaveBeenCalledTimes(1);
});
