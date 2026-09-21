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
