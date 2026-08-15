import { readFileSync } from 'node:fs';
import path from 'node:path';

const androidTabViewSource = readFileSync(
  path.join(
    process.cwd(),
    'node_modules/react-native-bottom-tabs/android/src/main/java/com/rcttabview/RCTTabView.kt',
  ),
  'utf8',
);

// Guards patches/react-native-bottom-tabs@1.4.0.patch. The patch keeps the
// holder scene size synchronized and excludes the hidden Material bottom bar
// from React Native touch target traversal.
describe('patched react-native-bottom-tabs Android hidden bar behavior', () => {
  it('reports layoutHolder changes instead of deduplicating on the unchanged root view', () => {
    expect(androidTabViewSource).toContain('private fun reportLayoutHolderSize');
    expect(androidTabViewSource).toContain('layoutHolder.addOnLayoutChangeListener');
    expect(androidTabViewSource).toContain('reportLayoutHolderSize(right - left, bottom - top)');
    expect(androidTabViewSource).toContain('val newSize = Size(width, height)');
  });

  it('requests a layout only when hidden visibility actually changes', () => {
    expect(androidTabViewSource).toContain('if (bottomNavigation.visibility == targetVisibility)');
    expect(androidTabViewSource).toMatch(
      /bottomNavigation\.visibility = targetVisibility\s+requestLayout\(\)/,
    );
  });

  it('removes the hidden native tab bar from React Native touch target traversal', () => {
    expect(androidTabViewSource).toMatch(
      /class ExtendedBottomNavigationView\(context: Context\)\s*:\s*BottomNavigationView\(context\), ReactPointerEventsView/,
    );
    expect(androidTabViewSource).toContain('override val pointerEvents: PointerEvents');
    expect(androidTabViewSource).toContain(
      'get() = if (visibility == VISIBLE) PointerEvents.AUTO else PointerEvents.NONE',
    );
  });
});
