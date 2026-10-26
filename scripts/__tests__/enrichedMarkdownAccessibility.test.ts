import { readFileSync } from 'node:fs';

const patch = readFileSync('patches/react-native-enriched-markdown@1.0.1.patch', 'utf8');
const filePatch = (file: string) => patch.split(`+++ b/${file}\n`)[1]?.split('diff --git ')[0];

// Source guards cannot replace TalkBack acceptance on API 27 and API 28+ devices.
// enrichedMarkdownAtomicLinks.test.ts pins the shared patch hash.
describe('Android API 27 screen-reader compatibility patch', () => {
  test.each([
    ['table row overlays', 'main/java/com/swmansion/enriched/markdown/views/TableContainerView.kt'],
    ['math blocks', 'math/java/com/swmansion/enriched/markdown/views/MathContainerView.kt'],
  ])('uses AndroidX for the API 28 screen-reader property on %s', (_, file) => {
    const source = filePatch(`android/src/${file}`);
    expect(source).toMatch(/^-\s+isScreenReaderFocusable = true$/m);
    expect(source).toMatch(/^\+\s+ViewCompat\.setScreenReaderFocusable\(this, true\)$/m);
  });
});
