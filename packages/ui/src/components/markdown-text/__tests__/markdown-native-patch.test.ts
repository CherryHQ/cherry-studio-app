import { readFileSync } from 'node:fs';

const patch = readFileSync(
  `${process.cwd()}/patches/react-native-enriched-markdown@1.0.1.patch`,
  'utf8',
);

// Native-source patch guards; rendering and gestures still need device acceptance.
describe('native Markdown code-block menu patch', () => {
  test('cancels ancestor recognizers before either code target presents its menu', () => {
    const codeBlockPatch = patch
      .split(
        '+++ b/android/src/main/java/com/swmansion/enriched/markdown/views/CodeBlockContainerView.kt',
      )[1]
      ?.split('diff --git ')[0];
    expect(codeBlockPatch).toMatch(
      /private fun showContextMenu\(anchor: View\): Boolean \{\n     if \(pending\) return false\n(?:\+[^\n]*\n)*\+    anchor\.parent\?\.requestDisallowInterceptTouchEvent\(true\)\n     ContextMenuPopup\.show\(anchor, this\)/,
    );
  });
});

describe('native Markdown table interaction patch', () => {
  test('preserves the upstream iOS table copy menu and restricts link gestures to links', () => {
    expect(patch).not.toContain('-  [_gridContainer addInteraction:contextMenu];');
    expect(patch).toContain('+  return [self linkURLAtPoint:[touch locationInView:self]] != nil;');
  });

  test('preserves the upstream Android table copy-menu long presses', () => {
    expect(patch).not.toMatch(/^-\s+showContextMenu\(view\)$/m);
  });

  test('keeps overflowing iOS tables out of the branch that resets their scroll offset', () => {
    expect(patch).toContain(
      '-  BOOL tableOverflows = (overhang > 0 && _totalTableWidth > containerWidth);',
    );
    expect(patch).toContain('+  BOOL tableOverflows = (_totalTableWidth > containerWidth);');
  });

  test('reveals native horizontal scroll indicators for overflowing tables', () => {
    expect(patch).toContain('+  _scrollView.showsHorizontalScrollIndicator = tableOverflows;');
    expect(patch).toContain('+    [_scrollView flashScrollIndicators];');
    expect(patch).toContain('+      isScrollbarFadingEnabled = false');
  });
});

describe('native Markdown code-block height patch', () => {
  test('caps both iOS measurement paths at 192 points', () => {
    expect(patch).toContain('+static const CGFloat kENRMCodeBlockMaxHeight = 192;');
    expect(patch).toContain(
      '+  return MIN(_codeSize.height + inset * 2 + [self headerHeight], kENRMCodeBlockMaxHeight);',
    );
    expect(patch).toContain(
      '+  return MIN(ENRMCodeBlockCodeSize(code).height + inset * 2 + headerH, kENRMCodeBlockMaxHeight);',
    );
  });

  test('preserves the full iOS code extent inside the capped scroll viewport', () => {
    expect(patch).toContain(
      '+  CGFloat contentHeight = MAX(_codeSize.height + inset * 2 - borderW, frame.size.height);',
    );
    expect(patch).toContain(
      '+  _scrollView.contentSize = CGSizeMake(contentWidth, contentHeight);',
    );
    expect(patch).toContain(
      '+  _scrollView.scrollEnabled = contentWidth > frame.size.width || contentHeight > frame.size.height;',
    );
  });

  test('caps Android layout and shadow measurement with the same density-aware limit', () => {
    expect(patch).toContain('+    private const val MAX_HEIGHT_DP = 192f');
    expect(patch).toContain(
      '+      (MAX_HEIGHT_DP * context.resources.displayMetrics.density).toInt()',
    );
    expect(patch).toContain(
      '+      MeasureSpec.makeMeasureSpec((maxHeight - headerH).coerceAtLeast(0), MeasureSpec.AT_MOST),',
    );
    expect(patch).toContain(
      '+    setMeasuredDimension(measuredWidth, (headerH + verticalScrollView.measuredHeight).coerceAtMost(maxHeight))',
    );
    expect(patch).toContain(
      '+      return (layout.height.toFloat() + inset * 2 + headerH).coerceAtMost(maxHeightPx(context).toFloat())',
    );
  });

  test('nests Android horizontal code scrolling inside a vertical native viewport', () => {
    expect(patch).toContain('+    object : ScrollView(context) {');
    expect(patch).toContain(
      '+      addView(scrollView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))',
    );
    expect(patch).toContain('+          parent?.requestDisallowInterceptTouchEvent(true)');
    expect(patch).toContain('+          parent?.requestDisallowInterceptTouchEvent(false)');
  });
});

describe('native Markdown code-block divider patch', () => {
  test('keeps the iOS divider above the code viewport', () => {
    expect(patch).toContain(
      '+    CGRect dividerRect = CGRectMake(borderWidth, headerH - 1, self.bounds.size.width - borderWidth * 2, 1);',
    );
  });

  test('keeps the full Android divider stroke above the code viewport', () => {
    expect(patch).toContain('+    val y = headerH - dividerPaint.strokeWidth / 2f');
  });
});
