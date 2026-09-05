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

  test('anchors list markers to complete grapheme clusters', () => {
    const patch = readFileSync(
      `${process.cwd()}/patches/react-native-enriched-markdown@1.0.1.patch`,
      'utf8',
    );

    expect(patch).toContain(
      'const NSRange anchorRange = [string rangeOfComposedCharacterSequenceAtIndex:anchorLocation];',
    );
    expect(patch).toContain(
      '[output addAttribute:ListItemMarkerStartAttribute value:markers range:anchorRange];',
    );
  });

  test('uses text font metrics for list markers that follow emoji', () => {
    const patch = readFileSync(
      `${process.cwd()}/patches/react-native-enriched-markdown@1.0.1.patch`,
      'utf8',
    );

    expect(patch).toContain('static NSString *const kAppleColorEmojiFontName');
    expect(patch).toContain(
      'if (!font || [font.fontName isEqualToString:kAppleColorEmojiFontName])',
    );
  });
});
