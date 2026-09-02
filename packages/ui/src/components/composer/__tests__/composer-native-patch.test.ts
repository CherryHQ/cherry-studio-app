import { readFileSync } from 'node:fs';

describe('react-native-enriched-markdown iOS patch', () => {
  test('updates placeholder visibility while text is composing', () => {
    const patch = readFileSync(
      `${process.cwd()}/patches/react-native-enriched-markdown@1.0.1.patch`,
      'utf8',
    );

    expect(patch).toContain(
      'if (_editSession.isComposing) {\n+    [self updatePlaceholderVisibility];\n     return;',
    );
  });
});
