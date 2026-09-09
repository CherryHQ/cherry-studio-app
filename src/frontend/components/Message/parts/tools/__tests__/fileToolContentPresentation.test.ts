import { getFileToolContent } from '../fileToolContentPresentation';
import type { ToolMessagePart } from '../toolPartState';

function tool(input: Partial<ToolMessagePart> = {}): ToolMessagePart {
  return {
    type: 'dynamic-tool',
    toolName: 'write_file',
    toolCallId: 'call',
    state: 'input-streaming',
    ...input,
  } as ToolMessagePart;
}

test('displays partial content without requiring executable input', () => {
  expect(
    getFileToolContent(tool(), { text: '<html>', name: 'page.html', truncated: false }),
  ).toMatchObject({
    text: '<html>',
    isCode: true,
    isStreaming: true,
  });
});

test('uses authoritative final input instead of a stale live preview', () => {
  expect(
    getFileToolContent(
      tool({
        state: 'input-available',
        input: { filename: 'report.md', content: '# Complete' },
      }),
      { text: '# Incomplete', truncated: false },
    ),
  ).toMatchObject({
    text: '# Complete',
    isCode: false,
    isStreaming: false,
  });
});

test('shows replacement text, not the old text or serialized edit arguments', () => {
  expect(
    getFileToolContent(
      tool({
        toolName: 'edit_file',
        state: 'input-available',
        input: { old_string: 'before', new_string: 'after', file_entry_id: 'private-id' },
      }),
    ),
  ).toMatchObject({ text: 'after' });
});

test('retains the visible partial content after an interrupted call', () => {
  expect(
    getFileToolContent(
      tool({
        state: 'output-error',
        errorText: '',
        inputPreview: { text: 'partial', truncated: false },
      }),
    ),
  ).toMatchObject({ text: 'partial', isStreaming: false });
});

test('bounds final/history content and classifies Markdown as prose', () => {
  const content = getFileToolContent(
    tool({
      state: 'input-available',
      input: { filename: 'report.md', content: 'body\n'.repeat(10_000) },
    }),
  );
  expect(content).toMatchObject({ truncated: true, isCode: false });
  expect(content?.text.length).toBeLessThanOrEqual(8_192);
});
