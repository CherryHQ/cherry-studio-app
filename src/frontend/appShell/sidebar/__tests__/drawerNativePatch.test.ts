import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const drawerPackageRoot = dirname(
  require.resolve('react-native-drawer-layout/package.json', {
    paths: [dirname(require.resolve('expo-router/package.json'))],
  }),
);

// Guard the installed dependency's source and compiled entry. Animating aria-hidden
// must not let Fabric flatten/unflatten the parent of the native chat screen.
describe('drawer native content patch', () => {
  test.each([
    [
      'src/views/Drawer.native.tsx',
      /<Animated\.View\s+collapsable=\{false\}\s+animatedProps=\{contentAnimatedProps\}/,
    ],
    [
      'lib/module/views/Drawer.native.js',
      /_jsx\(Animated\.View, \{\s+collapsable: false,\s+animatedProps: contentAnimatedProps/,
    ],
  ])('keeps the native content parent stable in %s', (file, contentWrapper) => {
    expect(readFileSync(join(drawerPackageRoot, file), 'utf8')).toMatch(contentWrapper);
  });
});
