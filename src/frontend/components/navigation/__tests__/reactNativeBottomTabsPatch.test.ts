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
  it('mirrors the upstream layoutHolder reporting fix for issue 557', () => {
    expect(androidTabViewSource).toContain('private fun reportLayoutHolderSizeIfChanged()');
    expect(androidTabViewSource).toMatch(
      /addOnLayoutChangeListener\s*\{[^}]*onTabBarMeasuredListener[^}]*reportLayoutHolderSizeIfChanged\(\)/,
    );
    expect(androidTabViewSource).toMatch(
      /layoutHolder\.addOnLayoutChangeListener\s*\{[^}]*reportLayoutHolderSizeIfChanged\(\)/,
    );
    expect(androidTabViewSource).toContain('val newWidth = layoutHolder.width');
    expect(androidTabViewSource).toContain('val newHeight = layoutHolder.height');
  });

  it('relies on Android visibility changes to request layout', () => {
    const setTabBarHiddenSource = androidTabViewSource.match(
      /fun setTabBarHidden\(isHidden: Boolean\) \{[\s\S]*?\n  \}/,
    )?.[0];

    expect(setTabBarHiddenSource).toBeDefined();
    expect(setTabBarHiddenSource).not.toContain('requestLayout()');
    expect(setTabBarHiddenSource).toContain('bottomNavigation.visibility = GONE');
    expect(setTabBarHiddenSource).toContain('bottomNavigation.visibility = VISIBLE');
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
