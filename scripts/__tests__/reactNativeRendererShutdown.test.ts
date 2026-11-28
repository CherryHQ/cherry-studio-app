import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const root = dirname(require.resolve('react-native/package.json'));
const appleRuntime = 'ReactCommon/react/runtime/platform/ios';

// Verify installed-source delivery. Runtime teardown is exercised by the upstream native tests.
test('keeps the iOS renderer scheduler until JS cleanup and removes its observer on main', () => {
  const instance = readFileSync(join(root, appleRuntime, 'ReactCommon/RCTInstance.mm'), 'utf8');
  const invalidate = instance.split('- (void)invalidate\n')[1].split('\n- (')[0];
  const [suspend, teardown] = invalidate.split('RCTExecuteOnMainQueue(^{');
  expect(suspend).toMatch(
    /__block RCTScheduler \*scheduler = _surfacePresenter\.scheduler;\s*\[_surfacePresenter suspend\];/,
  );
  const [mainQueue, jsCleanup] = teardown.split('[self->_jsThreadManager dispatchToJSThread:^{');
  expect(mainQueue).toContain('[scheduler stopObservingLayoutAnimations];');
  expect(jsCleanup).toMatch(/scheduler = nil;\s*self->_reactInstance = nullptr;/);
  const scheduler = readFileSync(join(root, 'React/Fabric/RCTScheduler.mm'), 'utf8');
  expect(scheduler).toMatch(
    /- \(void\)stopObservingLayoutAnimations\s*\{\s*RCTAssertMainQueue\(\);\s*_uiRunLoopObserver\.reset\(\);/,
  );
  const presenter = readFileSync(join(root, 'React/Fabric/RCTSurfacePresenter.mm'), 'utf8');
  expect(presenter).toMatch(
    /\[self _stopAllSurfacesWithScheduler:scheduler\];\s*scheduler\.delegate = nil;/,
  );
});
