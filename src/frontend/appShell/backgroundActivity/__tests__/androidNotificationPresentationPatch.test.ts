import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { EventEmitter } from 'expo';
import type { Notification } from 'expo-notifications';

const root = dirname(require.resolve('expo-notifications/package.json'));
const source = (path: string) => readFileSync(join(root, path), 'utf8');
const androidRoot = 'android/src/main/java/expo/modules/notifications';

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

test.each(['build/NotificationsEmitter.js', 'src/NotificationsEmitter.ts'])(
  '%s delivers mapped presentation events until the subscription is removed',
  (path) => {
    const nativeEmitter = new EventEmitter<{
      onDidPresentNotification: (notification: Notification) => void;
    }>();
    // Keep the installed subscription and mapper real; replace only the native event source.
    jest.doMock(join(root, dirname(path), 'NotificationsEmitterModule'), () => ({
      __esModule: true,
      default: nativeEmitter,
    }));
    const { addNotificationPresentedListener } = jest.requireActual<
      typeof import('expo-notifications')
    >(join(root, path));
    const listener = jest.fn();
    const subscription = addNotificationPresentedListener(listener);
    const data = {
      owner: 'background-activity',
      terminal: true,
      url: 'cherrystudio:///?sessionId=s',
    };
    const content = {
      title: 'Reply completed',
      subtitle: null,
      body: null,
      categoryIdentifier: null,
      threadIdentifier: null,
      sound: null,
      dataString: JSON.stringify(data),
    };
    const notification: Notification = {
      date: 123,
      request: { identifier: 'reply-s', trigger: null, content },
    };

    nativeEmitter.emit('onDidPresentNotification', notification);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toMatchObject({
      date: 123,
      request: { identifier: 'reply-s', content: { title: 'Reply completed', data } },
    });

    subscription.remove();
    nativeEmitter.emit('onDidPresentNotification', notification);

    expect(listener).toHaveBeenCalledTimes(1);
  },
);
