import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const root = dirname(require.resolve('react-native-background-actions/package.json'));
const source = (name: string) =>
  readFileSync(join(root, 'android/src/main/java/com/asterinet/react/bgactions', name), 'utf8');
const service = source('RNBackgroundActionsTask.java');
const moduleSource = source('BackgroundActionsModule.java');

// Upgrade guards for the installed native implementation; these do not replace
// device acceptance of Android's service admission and notification delivery.
test('native visibility owns foreground promotion and removes the observer on destruction', () => {
  expect(service).toContain('getCurrentState().isAtLeast(Lifecycle.State.STARTED)');
  expect(service).toContain('getLifecycle().addObserver(this)');
  expect(service).toContain('getLifecycle().removeObserver(this)');
  expect(service).toMatch(/void onStop\([^)]*\)\s*\{[\s\S]*?updateForeground\(\)/);
  expect(service).toMatch(/if \(isAppVisible\(\)\)\s*\{[\s\S]*?STOP_FOREGROUND_REMOVE/);
  expect(moduleSource).not.toContain('startForegroundService(');
});

test('updates cannot post outside the visibility gate or launch another headless task', () => {
  expect(moduleSource).not.toContain('.notify(');
  expect(moduleSource).toContain('update.setAction(RNBackgroundActionsTask.ACTION_UPDATE)');
  expect(service).toContain('if (update && currentOptions == null)');
  expect(service).toContain('if (!update) super.onStartCommand(intent, flags, startId)');
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
