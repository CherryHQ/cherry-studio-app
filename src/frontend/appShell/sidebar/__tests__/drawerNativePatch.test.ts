import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const drawerPackageRoot = dirname(
  require.resolve('react-native-drawer-layout/package.json', {
    paths: [dirname(require.resolve('expo-router/package.json'))],
  }),
);

// Guard the installed dependency's source and compiled entry. Animating aria-hidden
// must not let Fabric flatten/unflatten the parent of the native chat screen, and
// slide physics / pan offset patches keep opening and dragging smooth on both platforms.
describe('drawer native content patch', () => {
  test.each([
    [
      'src/views/Drawer.native.tsx',
      /<Animated\.View\s+collapsable=\{false\}\s+animatedProps=\{contentAnimatedProps\}/,
      /stiffness:\s*360,\s*damping:\s*38,\s*mass:\s*1,\s*overshootClamping:\s*true,\s*reduceMotion:\s*ReduceMotion\.System/,
      /startOffsetX\.value = event\.translationX/,
      /removeClippedSubviews=\{false\}/,
    ],
    [
      'lib/module/views/Drawer.native.js',
      /_jsx\(Animated\.View, \{\s+collapsable: false,\s+animatedProps: contentAnimatedProps/,
      /stiffness:\s*360,\s*damping:\s*38,\s*mass:\s*1,\s*overshootClamping:\s*true,\s*reduceMotion:\s*ReduceMotion\.System/,
      /startOffsetX\.value = event\.translationX/,
      /removeClippedSubviews: false/,
    ],
  ])(
    'keeps the native content parent stable and applies smooth slide patches in %s',
    (file, contentWrapper, springConfig, panOffset, clipConfig) => {
      const source = readFileSync(join(drawerPackageRoot, file), 'utf8');
      expect(source).toMatch(contentWrapper);
      expect(source).toMatch(springConfig);
      expect(source).toMatch(panOffset);
      expect(source).toMatch(clipConfig);
    },
  );
});
