import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const root = dirname(require.resolve('react-native-background-actions/package.json'));
const source = (name: string) =>
  readFileSync(join(root, 'android/src/main/java/com/asterinet/react/bgactions', name), 'utf8');
const service = source('RNBackgroundActionsTask.java');
const moduleSource = source('BackgroundActionsModule.java');

// Upgrade guards for the installed native implementation; these do not replace
// device acceptance of Android's service admission and notification delivery.
test('native admission stays foreground across visibility changes and removes its observer on destruction', () => {
  expect(service).toContain('getCurrentState().isAtLeast(Lifecycle.State.STARTED)');
  expect(service).toContain('getLifecycle().addObserver(this)');
  expect(service).toContain('getLifecycle().removeObserver(this)');
  expect(service).toMatch(/void onStop\([^)]*\)\s*\{[\s\S]*?updateForeground\(\)/);
  expect(service).not.toMatch(/if \(isAppVisible\(\)\)/);
  expect(service).toContain('currentOptions.getNotificationId()');
  expect(service).toContain('ServiceCompat.STOP_FOREGROUND_DETACH');
  expect(moduleSource).not.toContain('startForegroundService(');
});

test('a finished result survives service teardown and identity handoff', () => {
  // Android cancels the foreground notification inside stopService() and when
  // startForeground() switches identity; detaching must happen first.
  const stop = moduleSource.slice(moduleSource.indexOf('public void stop('));
  expect(stop.indexOf('RNBackgroundActionsTask.prepareStop()')).toBeGreaterThan(-1);
  expect(stop.indexOf('RNBackgroundActionsTask.prepareStop()')).toBeLessThan(
    stop.indexOf('reactContext.stopService('),
  );
  const promotion = service.slice(service.indexOf('private void updateForeground()'));
  expect(promotion.indexOf('detachFinishedResult();')).toBeGreaterThan(-1);
  expect(promotion.indexOf('detachFinishedResult();')).toBeLessThan(
    promotion.indexOf('ServiceCompat.startForeground('),
  );
  // Detaching resets Android's foreground allowance; a hidden app could not re-promote.
  const deferred = promotion.indexOf('else if (foreground && !anchorOngoing && !isAppVisible())');
  expect(deferred).toBeGreaterThan(-1);
  expect(deferred).toBeLessThan(promotion.indexOf('detachFinishedResult();'));
  expect(service).toContain('final boolean retainResult = !anchorOngoing;');
});

test('updates cannot revive a stopped service or launch another headless task', () => {
  expect(moduleSource).not.toContain('.notify(');
  expect(moduleSource).toContain('RNBackgroundActionsTask.updateNotification(bgOptions)');
  expect(service).toContain('if (instance == null || instance.taskName == null)');
  expect(service).toContain('super.onStartCommand(intent, flags, startId)');
  expect(service).not.toContain('START_REDELIVER_INTENT');
});

test('ongoing notification updates stay silent and route taps to the existing application', () => {
  expect(service).toContain('.setOnlyAlertOnce(true)');
  expect(service).toContain('.setSilent(true)');
  expect(service).toContain('notificationIntent.setPackage(context.getPackageName())');
  expect(service).toContain('Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP');
});

test('native destruction reports the admitted task name instead of changing notification options', () => {
  expect(service).toContain('taskName = extras.getString("taskName")');
  expect(service).toMatch(/void onDestroy\(\)[\s\S]*?\.emit\("stopped", taskName\)/);
});

test('a refused foreground promotion keeps the started service and its task', () => {
  const promotion = service.slice(
    service.indexOf('private void updateForeground()'),
    service.indexOf('public void onTimeout('),
  );
  expect(promotion).toContain('ForegroundServiceStartNotAllowedException');
  expect(promotion).not.toContain('stopSelf');
});

test('the service channel takes a fixed name instead of task content', () => {
  const js = readFileSync(join(root, 'src/index.js'), 'utf8');
  expect(js).toContain('channelName: options.channelName');
  expect(service).toContain('createNotificationChannel(currentOptions.getChannelName())');
  expect(service).not.toContain('channel.setDescription(');
});

test('notification identity is forwarded by JS and checked against the admitted native generation', () => {
  const js = readFileSync(join(root, 'src/index.js'), 'utf8');
  expect(js).toContain('notificationId: options.notificationId');
  expect(js).toContain('taskOngoing: options.taskOngoing');
  expect(js).toContain('taskName: this._currentOptions.taskName');
  expect(service).toContain('instance.taskName.equals(options.getExtras().getString("taskName"))');
});

test('native task identities survive restart and cold acknowledgement only removes terminal notices', () => {
  const notifications = readFileSync(
    join(
      __dirname,
      '../../../../../modules/system-integration/android/src/main/java/expo/modules/systemintegration/BackgroundExecution.kt',
    ),
    'utf8',
  );
  expect(notifications).toContain('getSharedPreferences("background-task-notifications"');
  expect(notifications).toContain('putInt(key, id).putInt("next-id", id + 1).commit()');
  expect(notifications).toContain('it.id == id && it.notification.extras.getBoolean("terminal")');
  expect(notifications).toContain('!entry.notification.extras.getBoolean("terminal")');
});
