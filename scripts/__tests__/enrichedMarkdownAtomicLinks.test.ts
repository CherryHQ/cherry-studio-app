import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const patchPath = 'patches/react-native-enriched-markdown@1.0.1.patch';
const patch = readFileSync(patchPath, 'utf8');
const filePatch = (file: string) => patch.split(`+++ b/${file}\n`)[1]?.split('diff --git ')[0];

// Patch guards protect native source wiring; editing behavior needs device acceptance.
describe('Enriched Markdown atomic link patch', () => {
  test('pins the patch with a current lockfile hash', () => {
    const hash = createHash('sha256').update(patch).digest('hex');

    expect(readFileSync('pnpm-workspace.yaml', 'utf8')).toContain(
      `react-native-enriched-markdown@1.0.1: ${patchPath}`,
    );
    expect(readFileSync('pnpm-lock.yaml', 'utf8')).toContain(
      `  react-native-enriched-markdown@1.0.1: ${hash}\n`,
    );
  });

  // A chip inserted right before another must keep both URLs instead of absorbing its neighbour.
  test('replaces only overlapping links on Android', () => {
    const store = filePatch(
      'android/src/main/java/com/swmansion/enriched/markdown/input/formatting/FormattingStore.kt',
    );
    expect(store).toContain('+    val isLink = newRange.type == StyleType.LINK');
    expect(store).toContain(
      '+        if (existing.start < newRange.end && existing.end > newRange.start) mergeIndexes.add(idx)',
    );
  });

  test('replaces only overlapping links on iOS', () => {
    const store = filePatch('ios/input/ENRMFormattingStore.mm');
    expect(store).toContain('+  BOOL isLink = newRange.type == ENRMInputStyleTypeLink;');
    expect(store).toContain(
      '+      if (existing.range.location < NSMaxRange(newRange.range) && existingEnd > newRange.range.location)',
    );
  });
});
