import { readFileSync } from 'node:fs';

describe('react-native-enriched-markdown iOS patch', () => {
  test('keeps native inline icon bytes in the public, normalized, and generated prop contracts', () => {
    const patch = readFileSync(
      `${process.cwd()}/patches/react-native-enriched-markdown@1.0.1.patch`,
      'utf8',
    );
    expect(patch).toContain('icon?: string;');
    expect(patch).toContain("icon: override.icon ?? ''");
    expect(patch).toContain('iconTint: boolean;');
    expect(patch).toContain('newVariant.icon != oldVariant.icon');
    expect(patch).toContain('variant.getString("icon")');
  });

  test.each([
    'ios/generated/ReactCodegen/EnrichedMarkdownTextSpec/Props.h',
    'android/generated/jni/react/renderer/components/EnrichedMarkdownTextSpec/Props.h',
  ])('ships inline icon fields and serialization in %s', (headerPath) => {
    const header = readFileSync(
      `${process.cwd()}/node_modules/react-native-enriched-markdown/${headerPath}`,
      'utf8',
    );
    const linkVariant = header
      .split('struct EnrichedMarkdownTextInputMarkdownStyleLinkVariantsStruct {')[1]
      ?.split('struct EnrichedMarkdownTextInputMarkdownStyle')[0];

    expect(linkVariant).toContain('std::string icon{};');
    expect(linkVariant).toContain('bool iconTint{false};');
    expect(linkVariant).toContain('result["icon"] = icon;');
    expect(linkVariant).toContain('result["iconTint"] = iconTint;');
    expect(linkVariant).toContain('fromRawValue(context, tmp_icon->second, result.icon);');
    expect(linkVariant).toContain('fromRawValue(context, tmp_iconTint->second, result.iconTint);');
  });

  test('limits attachments to the leading object character and clears their old formatting', () => {
    const patch = readFileSync(
      `${process.cwd()}/patches/react-native-enriched-markdown@1.0.1.patch`,
      'utf8',
    );
    expect(patch).toContain('[storage.string characterAtIndex:iconIndex] == 0xFFFC');
    expect(patch).toContain('value:attachment range:NSMakeRange(iconIndex, 1)');
    expect(patch).toContain(
      '[textStorage removeAttribute:NSAttachmentAttributeName range:scopeRange]',
    );
    expect(patch).toContain("spannable[range.start] != '\\uFFFC'");
    expect(patch).toContain('if (span is InputLinkIconSpan) range.start + 1 else range.end');
    expect(patch).toContain('InputLinkIconSpan::class.java');
  });
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

describe('react-native-enriched-markdown Android input patch', () => {
  const patch = readFileSync(
    `${process.cwd()}/patches/react-native-enriched-markdown@1.0.1.patch`,
    'utf8',
  );

  test('absorbs only the framework long-press cursor-controller null pointer', () => {
    expect(patch).toContain('+  override fun performLongClick(): Boolean =');
    expect(patch).toContain(
      '!top.className.startsWith("android.widget.Editor") || top.methodName != "performLongClick"',
    );
    expect(patch).toContain('+        throw e');
  });

  test('measures an immutable snapshot instead of the live Editable', () => {
    expect(patch).toContain('+    val text: SpannedString?,');
    expect(patch).toContain('+    val textSnapshot = text?.let { SpannedString(it) }');
    expect(patch).toContain('+    val size = measure(cachedWidth, textSnapshot, paint)');
    expect(patch).toContain(
      '+    data.replace(id, value, MeasurementParams(width, size, value.text, value.paintParams))',
    );
  });
});
