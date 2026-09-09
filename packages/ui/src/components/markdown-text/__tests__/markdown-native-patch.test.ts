import { readFileSync } from 'node:fs';

const patch = readFileSync(
  `${process.cwd()}/patches/react-native-enriched-markdown@1.0.1.patch`,
  'utf8',
);

// Native-source patch guards; gesture behavior still needs device acceptance.
describe('native Markdown table interaction patch', () => {
  test('removes the iOS table copy menu recognizer', () => {
    expect(patch).toContain('-  [_gridContainer addInteraction:contextMenu];');
    expect(patch).toContain('+  return [self linkURLAtPoint:[touch locationInView:self]] != nil;');
  });

  test('removes Android copy-menu long presses from both cell targets', () => {
    expect(patch.match(/^-\s+showContextMenu\(view\)$/gm)).toHaveLength(2);
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
