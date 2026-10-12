import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const androidSourceRoot = `${process.cwd()}/node_modules/react-native-screens/android/src/main/java/com/swmansion/rnscreens`;
const screenSource = readFileSync(`${androidSourceRoot}/Screen.kt`, 'utf8');
const stackSource = readFileSync(`${androidSourceRoot}/ScreenStack.kt`, 'utf8');
const headerSource = readFileSync(`${androidSourceRoot}/ScreenStackHeaderConfig.kt`, 'utf8');

describe('react-native-screens Android removal transition patch', () => {
  test('finishes retained children in reverse order and resists reentrant cleanup', () => {
    const startRemoval = screenSource
      .split('private fun startTransitionRecursive(parent: ViewGroup?) {')[1]
      ?.split('@SuppressLint("ClickableViewAccessibility")')[0];
    const endRemoval = screenSource
      .split('fun endRemovalTransition() {')[1]
      ?.split('private fun startTransitionRecursive(parent: ViewGroup?) {')[0];

    expect(screenSource).toContain(
      'private val removalTransitionViews = ArrayList<Pair<ViewGroup, View>>()',
    );
    expect(startRemoval).toContain(
      'it.startViewTransition(view)\n                        removalTransitionViews.add(it to view)',
    );
    expect(endRemoval).toContain('if (!isBeingRemoved || isEndingRemovalTransition)');
    expect(endRemoval).toContain('val viewsToFinish = removalTransitionViews.toList()');
    expect(endRemoval).toContain('removalTransitionViews.clear()');
    expect(endRemoval).toContain(
      'for ((parent, child) in viewsToFinish.asReversed()) {\n                parent.endViewTransition(child)',
    );
    expect(endRemoval).toContain('finally');
  });

  test('finishes descendants before the screen root detaches', () => {
    const endTransition = stackSource
      .split('override fun endViewTransition(view: View) {')[1]
      ?.split('internal fun onViewTransitionEnd')[0];
    const childCleanup =
      endTransition?.indexOf('view.fragment.screen.endRemovalTransition()') ?? -1;
    const rootCleanup = endTransition?.indexOf('super.endViewTransition(view)') ?? -1;

    expect(childCleanup).toBeGreaterThanOrEqual(0);
    expect(rootCleanup).toBeGreaterThan(childCleanup);
  });

  test('skips every header rebuild while an ancestor screen is being removed', () => {
    const removalGuard = headerSource
      .split('private fun isInRemovalTransition(): Boolean {')[1]
      ?.split('private val screenStack')[0];
    const update = headerSource.split('fun onUpdate() {')[1]?.split('val activity =')[0];

    expect(removalGuard).toContain('var ancestor: ViewParent? = parent');
    expect(removalGuard).toContain('ancestor is Screen && ancestor.isBeingRemoved');
    expect(removalGuard).toContain('ancestor = ancestor.parent');
    expect(update).toContain(
      'if (!isAttachedToWindow || !isTop || isDestroyed || isInRemovalTransition())',
    );
  });
});

// These guards cover the upstream backport and dependency wiring. Native device
// acceptance requires a new development client containing the C++ changes.
describe('react-native-screens Android mounting listener patch', () => {
  const nativeRoot = `${process.cwd()}/node_modules/react-native-screens`;
  const proxy = readFileSync(`${nativeRoot}/android/src/main/cpp/NativeProxy.cpp`, 'utf8');
  const listener = readFileSync(`${nativeRoot}/cpp/RNSScreenRemovalListener.cpp`, 'utf8');

  test('pins the backported native sources to the patch and lockfile', () => {
    const patchPath = 'patches/react-native-screens@4.26.2.patch';
    const hash = createHash('sha256').update(readFileSync(patchPath)).digest('hex');
    expect(readFileSync('pnpm-workspace.yaml', 'utf8')).toContain(
      `react-native-screens@4.26.2: ${patchPath}`,
    );
    expect(readFileSync('pnpm-lock.yaml', 'utf8')).toContain(
      `  react-native-screens@4.26.2: ${hash}\n`,
    );
  });

  test('registers one thread-safe listener instead of racing per-proxy shared pointer assignments', () => {
    expect(proxy).toContain('static const std::shared_ptr<RNSScreenRemovalListener> instance =');
    expect(proxy).toContain('coordinator->setMountingOverrideDelegate(removalListener());');
    expect(proxy).not.toContain('screenRemovalListener_');
    expect(proxy).toMatch(
      /std::lock_guard<std::mutex> lock\(installMutex_\);\s*removalListenerToken_ =\s*removalListener\(\)->setListener\(\[javaPart = javaPart_\]/,
    );
    expect(proxy).toMatch(
      /std::lock_guard<std::mutex> lock\(installMutex_\);\s*removalListener\(\)->clearListener\(removalListenerToken_\);\s*javaPart_ = nullptr;/,
    );
  });

  test('lets stale owners clear only their callback and invokes JNI outside the listener lock', () => {
    expect(listener).toMatch(
      /std::lock_guard<std::mutex> lock\(listenerMutex_\);\s*if \(token == currentToken_\) \{\s*listenerFunction_ = nullptr;/,
    );
    expect(listener).toMatch(
      /\{\s*std::lock_guard<std::mutex> lock\(listenerMutex_\);\s*listener = listenerFunction_;\s*\}\s*if \(!listener\)/,
    );
    expect(listener).toContain('listener(mutation.oldChildShadowView.tag);');
    expect(listener).not.toContain('listenerFunction_(mutation.oldChildShadowView.tag);');
  });
});
