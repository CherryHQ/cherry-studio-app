import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const root = dirname(require.resolve('expo-observe/package.json'));
const source = (name: string) =>
  readFileSync(join(root, 'android/src/main/java/expo/modules/observe', name), 'utf8');
const worker = source('ObservabilityBackgroundWorker.kt');
const observeModule = source('ObserveModule.kt');
const manager = source('ObservabilityManager.kt');

const scheduleBody = worker.slice(
  worker.indexOf('fun scheduleBackgroundDispatch('),
  worker.indexOf('private fun enqueueBackgroundDispatch('),
);

// Upgrade guards for the installed native implementation; these do not replace device
// acceptance of the background transition or of WorkManager admission.
test('Android builds the patched observe sources instead of the bundled unpatched AAR', () => {
  const config = JSON.parse(readFileSync(join(__dirname, '../../../../../package.json'), 'utf8'));
  expect(config.expo.autolinking.android.buildFromSource).toContain('expo-observe');
});

test('the background transition hands scheduling to a worker thread', () => {
  expect(observeModule).toMatch(
    /OnActivityEntersBackground \{[\s\S]*?scheduleBackgroundDispatch\(\)/,
  );
  expect(worker).toContain('CoroutineScope(SupervisorJob() + Dispatchers.IO)');
  expect(scheduleBody).toContain('schedulingScope.launch');
});

test('nothing initializes WorkManager on the calling thread', () => {
  expect(scheduleBody).not.toContain('WorkManager');
  expect(scheduleBody).not.toContain('OneTimeWorkRequestBuilder');
  expect(scheduleBody).not.toContain('Constraints');
});

test('a failed scheduling attempt does not escalate into a crash', () => {
  expect(scheduleBody).toMatch(/catch \(e: Exception\)[\s\S]*?Log\.e\(OBSERVE_TAG/);
});

test('the enqueued request keeps its unique name and in-flight dispatch', () => {
  expect(worker).toContain('ExistingWorkPolicy.KEEP');
  expect(worker).toContain('private const val WORK_NAME = "eas-observe-dispatch"');
});

// Scheduling stays unconditional on purpose: the worker is what clears the pending tables
// once dispatching is disabled, so gating the enqueue would let them grow without bound.
test('the dispatch gate stays inside the worker', () => {
  expect(scheduleBody).not.toContain('ObservePreferences');
  expect(manager).toMatch(/if \(!shouldDispatch\(\)\)[\s\S]*?removeAllPendingMetrics\(\)/);
  expect(manager).toContain('val dispatchingEnabled = config?.dispatchingEnabled ?: true');
});
