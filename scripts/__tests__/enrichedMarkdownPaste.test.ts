import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const dependency = 'react-native-enriched-markdown@1.0.1';
const patchPath = `patches/${dependency}.patch`;
const patch = readFileSync(patchPath, 'utf8');
const inputPatch = patch
  .split('+++ b/ios/input/ENRMInputTextView.mm\n')[1]
  ?.split('diff --git ')[0];
const additions = inputPatch
  ?.split('\n')
  .filter((line) => line.startsWith('+'))
  .join('\n');

// Source guards cover the maintained patch; paste ordering, undo and selection need iOS acceptance.
describe('iOS asynchronous editor paste patch', () => {
  test('registers the patch with its current lockfile hash', () => {
    const hash = createHash('sha256').update(patch).digest('hex');
    expect(readFileSync('pnpm-workspace.yaml', 'utf8')).toContain(`${dependency}: ${patchPath}`);
    expect(readFileSync('pnpm-lock.yaml', 'utf8')).toContain(`  ${dependency}: ${hash}\n`);
  });

  test('loads Markdown and plain text from item providers instead of synchronous pasteboard getters', () => {
    expect(inputPatch).toContain('-  id markdownValue = [pasteboard valueForPasteboardType:');
    expect(inputPatch).toContain('-  NSString *plainText = pasteboard.string;');
    expect(additions).toContain('loadItemForTypeIdentifier:kENRMMarkdownPasteboardType');
    expect(additions).toContain('loadObjectOfClass:[NSString class]');
    expect(additions).toContain('dispatch_async(dispatch_get_main_queue()');
    expect(additions).not.toContain('valueForPasteboardType:');
    expect(additions).not.toContain('pasteboard.string');
  });

  test('queues paste actions and keeps the existing Markdown insertion path', () => {
    expect(additions).toContain('ENRMLoadPasteText(_pendingPastes.firstObject');
    expect(additions).toContain('[textView->_pendingPastes removeObjectAtIndex:0]');
    expect(additions).toContain('[textView.markdownTextInput pasteMarkdown:text]');
    expect(additions).toContain('[textView loadNextPaste]');
    expect(additions).toContain('ENRMLoadPlainPasteText(providers, completion)');
  });

  test('rejects stale reads after edits, focus loss, detachment or selection changes', () => {
    expect(additions).toContain('__weak ENRMInputTextView *weakSelf = self');
    expect(additions).toContain('generation != textView->_pasteGeneration');
    expect(additions).toContain('NSTextStorageDidProcessEditingNotification');
    expect(additions).toContain('if (resigned) [self cancelPendingPastes]');
    expect(additions).toContain('if (self.window == nil) [self cancelPendingPastes]');
    expect(additions).toContain('self.markdownTextInput == _pasteOwner');
    expect(additions).toContain('NSEqualRanges(self.selectedRange, _pasteSelection)');
  });
});
