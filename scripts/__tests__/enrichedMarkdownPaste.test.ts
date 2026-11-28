import { readFileSync } from 'node:fs';

const editor = readFileSync(
  'node_modules/react-native-enriched-markdown/ios/input/EnrichedMarkdownTextInput.mm',
  'utf8',
);
const patch = readFileSync('patches/react-native-enriched-markdown@1.1.1.patch', 'utf8');
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
    expect(additions).toContain(
      'loadDataRepresentationForTypeIdentifier:kENRMMarkdownPasteboardType',
    );
    expect(additions).toContain('loadObjectOfClass:[NSString class]');
    expect(additions).toContain('dispatch_async(dispatch_get_main_queue()');
    expect(additions).not.toContain('valueForPasteboardType:');
    expect(additions).not.toContain('pasteboard.string');
  });

  // App-owned Markdown is stored as UTF-8 bytes; generic item loading can lose this representation.
  test('decodes custom Markdown data before falling back to plain text', () => {
    expect(additions).toContain('completionHandler:^(NSData *data, NSError *error)');
    expect(additions).toContain('initWithData:data encoding:NSUTF8StringEncoding');
    expect(additions).toMatch(
      /if \(markdown\.length > 0\)[\s\S]*completion\(markdown\)[\s\S]*else[\s\S]*ENRMLoadPlainPasteText\(providers, completion\)/,
    );
    expect(additions).not.toContain('loadItemForTypeIdentifier:');
  });

  test('ignores repeated taps while loading and drops reads made stale by caret moves or focus loss', () => {
    expect(additions).toContain('if (_pasteLoading || !self.isFirstResponder) return;');
    expect(additions).toContain('generation != textView->_pasteGeneration');
    expect(additions).toContain('NSEqualRanges(textView.selectedRange, textView->_pasteSelection)');
    expect(additions).toMatch(/resignFirstResponder[\s\S]*_pasteGeneration\+\+/);
    expect(additions).toContain('[textView.markdownTextInput pasteMarkdown:text]');
  });

  test('suspends smart punctuation only while inserting the parsed paste', () => {
    expect(additions).toMatch(
      /smartQuotesType = UITextSmartQuotesTypeNo;[\s\S]*smartDashesType = UITextSmartDashesTypeNo;[\s\S]*pasteMarkdown:text[\s\S]*@finally[\s\S]*smartQuotesType = quotes;[\s\S]*smartDashesType = dashes;/,
    );
  });

  test('preserves the programmatic edit phase across UIKit replacement callbacks', () => {
    const delegate = editor.split('shouldChangeTextInRange:(NSRange)range replacementText:')[1];
    expect(delegate).toMatch(
      /if \(_editSession.shouldSuppressFormatting\) return YES;[\s\S]*?emitOnKeyPress:text[\s\S]*?enterPhase:ENRMEditPhaseProcessing/,
    );
  });

  test('refreshes the empty list marker using the final pasted blocks and selection', () => {
    const replacement = editor.split('- (void)replaceTextInRange:(NSRange)selection')[1];
    expect(replacement).toMatch(
      /\[_blockStore setBlockType:[^;]*;[\s\S]*?_lastSelectedRange = _textView.selectedRange;[\s\S]*?\[self applyFormatting\];[\s\S]*?\[self updateEmptyBulletMarker\];[\s\S]*?\[self requestHeightUpdate\];/,
    );
  });

  // Pasting during IME composition worked before the asynchronous load and must keep working.
  test('does not skip paste while text is being composed', () => {
    const paste = inputPatch
      ?.split('- (void)paste:(id)sender')[1]
      ?.split('- (BOOL)canPerformAction:')[0];
    expect(paste).toBeDefined();
    expect(paste).not.toContain('markedTextRange');
  });
});
