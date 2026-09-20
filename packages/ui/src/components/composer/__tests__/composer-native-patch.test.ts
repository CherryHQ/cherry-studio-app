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
  const inputRoot = `${process.cwd()}/node_modules/react-native-enriched-markdown/android/src/main/java/com/swmansion/enriched/markdown/input`;
  const input = readFileSync(`${inputRoot}/EnrichedMarkdownTextInputView.kt`, 'utf8');

  // Installed-source upgrade guards. Jest cannot execute Android Editor's reentrant
  // selection callbacks; these do not establish recovery on a device.
  test('APP-A consumes a cursor-update null pointer without catching unrelated touch failures', () => {
    const touch = input
      .split('override fun onTouchEvent(ev: MotionEvent): Boolean {')[1]
      ?.split('override fun performClick()')[0];

    expect(touch).toMatch(
      /return try\s*\{\s*super\.onTouchEvent\(ev\)\s*\} catch \(e: NullPointerException\)/,
    );
    expect(touch).toMatch(
      /val top = e\.stackTrace\.firstOrNull\(\)\s*if \(top == null \|\| top\.className != "android.widget.Editor" \|\| top\.methodName != "updateCursorPosition"\)\s*\{\s*throw e\s*\}/,
    );
    expect(touch).toMatch(/Log\.w\([^\n]+\)\s*\/\/[^\n]+\s*true\s*\}/);
  });

  test('APP-R and APP-G consume only the two known framework long-press null pointers', () => {
    const longPress = input
      .split('override fun performLongClick(): Boolean =')[1]
      ?.split('override fun scrollTo(')[0];

    expect(longPress).toMatch(
      /try\s*\{\s*super\.performLongClick\(\)\s*\} catch \(e: NullPointerException\)/,
    );
    expect(longPress).toMatch(
      /val top = e\.stackTrace\.firstOrNull\(\)\s*if \(top == null \|\| top\.className != "android.widget.Editor" \|\|\s*\(top\.methodName != "performLongClick" && top\.methodName != "selectCurrentWordAndStartDrag"\)\s*\)\s*\{\s*throw e\s*\}/,
    );
    // A handled long press must not dispatch an extra click on ACTION_UP.
    expect(longPress).toMatch(/Log\.w\([^\n]+\)\s*\/\/[^\n]+\s*true\s*\}/);
  });

  test('measures an immutable snapshot instead of the live Editable', () => {
    const measurement = readFileSync(`${inputRoot}/layout/InputMeasurementStore.kt`, 'utf8');
    expect(measurement).toContain('val text: SpannedString?,');
    expect(measurement).toContain('val textSnapshot = text?.let { SpannedString(it) }');
    expect(measurement).toContain('val size = measure(cachedWidth, textSnapshot, paint)');
    expect(measurement).toContain(
      'data.replace(id, value, MeasurementParams(width, size, value.text, value.paintParams))',
    );
  });
});
