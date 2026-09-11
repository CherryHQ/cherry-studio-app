import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const root = dirname(require.resolve('expo-notifications/package.json'));
const source = (path: string) => readFileSync(join(root, path), 'utf8');
const androidRoot = 'android/src/main/java/expo/modules/notifications';

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
