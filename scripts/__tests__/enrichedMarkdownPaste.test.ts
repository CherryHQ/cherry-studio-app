import { readFileSync } from 'node:fs';

const patch = readFileSync('patches/react-native-enriched-markdown@1.0.1.patch', 'utf8');
const inputPatch = patch
  .split('+++ b/ios/input/ENRMInputTextView.mm\n')[1]
  ?.split('diff --git ')[0];
const additions = inputPatch
  ?.split('\n')
  .filter((line) => line.startsWith('+'))
  .join('\n');

// Source guards cover the maintained patch; paste timing, undo and selection need iOS acceptance.
// enrichedMarkdownAtomicLinks.test.ts pins the shared patch hash.
describe('iOS asynchronous editor paste patch', () => {
  test('loads Markdown and plain text from item providers instead of synchronous pasteboard getters', () => {
    expect(inputPatch).toContain('-  id markdownValue = [pasteboard valueForPasteboardType:');
    expect(inputPatch).toContain('-  NSString *plainText = pasteboard.string;');
    expect(additions).toContain('loadItemForTypeIdentifier:kENRMMarkdownPasteboardType');
    expect(additions).toContain('loadObjectOfClass:[NSString class]');
    expect(additions).toContain('dispatch_async(dispatch_get_main_queue()');
    expect(additions).not.toContain('valueForPasteboardType:');
    expect(additions).not.toContain('pasteboard.string');
  });

  test('ignores repeated taps while loading and drops reads made stale by caret moves or focus loss', () => {
    expect(additions).toContain('if (_pasteLoading || !self.isFirstResponder) return;');
    expect(additions).toContain('generation != textView->_pasteGeneration');
    expect(additions).toContain('NSEqualRanges(textView.selectedRange, textView->_pasteSelection)');
    expect(additions).toMatch(/resignFirstResponder[\s\S]*_pasteGeneration\+\+/);
    expect(additions).toContain('[textView.markdownTextInput pasteMarkdown:text]');
  });

  // Pasting during IME composition worked before the asynchronous load and must keep working.
  test('does not skip paste while text is being composed', () => {
    expect(additions).not.toContain('markedTextRange');
  });
});
