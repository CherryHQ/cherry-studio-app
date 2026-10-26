import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const dependency = 'react-native-enriched-markdown@1.0.1';
const patchPath = `patches/${dependency}.patch`;
const patch = readFileSync(patchPath, 'utf8');

// Source guards cannot replace TalkBack acceptance on API 27 and API 28+ devices.
describe('Android table accessibility compatibility patch', () => {
  test('registers the patch with its current lockfile hash', () => {
    const hash = createHash('sha256').update(patch).digest('hex');
    expect(readFileSync('pnpm-workspace.yaml', 'utf8')).toContain(`${dependency}: ${patchPath}`);
    expect(readFileSync('pnpm-lock.yaml', 'utf8')).toContain(`  ${dependency}: ${hash}\n`);
  });

  test('uses AndroidX for the API 28 screen-reader property on table row overlays', () => {
    const tablePatch = patch
      .split(
        '+++ b/android/src/main/java/com/swmansion/enriched/markdown/views/TableContainerView.kt\n',
      )[1]
      ?.split('diff --git ')[0];
    expect(tablePatch).toContain('-        isScreenReaderFocusable = true');
    expect(tablePatch).toContain('+        ViewCompat.setScreenReaderFocusable(this, true)');
    expect(tablePatch).toContain('         contentDescription = description');
  });
});
