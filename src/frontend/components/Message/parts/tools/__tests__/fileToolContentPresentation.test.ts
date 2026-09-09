import { getFileToolContent, splitFileToolContent } from '../fileToolContentPresentation';
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

test('preserves the full completed content beyond the streaming preview budget', () => {
  const text = 'body\n'.repeat(10_000);
  const content = getFileToolContent(
    tool({
      state: 'output-available',
      input: { filename: 'report.md', content: text },
    }),
  );
  expect(content).toMatchObject({ text, truncated: false, isCode: false, isStreaming: false });
});

test('keeps short completed content in one naturally sized block', () => {
  expect(splitFileToolContent('first\nsecond')).toEqual([{ offset: 0, text: 'first\nsecond' }]);
});

test.each([
  ['multiline', '  line\n'.repeat(10_000)],
  ['minified', 'const value = 1;'.repeat(10_000)],
  ['blank lines', '\n'.repeat(100)],
  ['Windows line endings', `${'x'.repeat(1_023)}\r\n`.repeat(10)],
  ['surrogate pairs', `${'x'.repeat(1_023)}🚀`.repeat(10)],
])('chunks %s without dropping or reordering content', (_name, text) => {
  const chunks = splitFileToolContent(text);
  expect(chunks.map((chunk) => chunk.text).join('')).toBe(text);
  let offset = 0;
  for (const chunk of chunks) {
    expect(chunk.offset).toBe(offset);
    expect(chunk.text.length).toBeGreaterThan(0);
    expect(chunk.text.length).toBeLessThanOrEqual(1_024);
    expect(chunk.text.match(/\n/g)?.length ?? 0).toBeLessThanOrEqual(16);
    expect(chunk.text).not.toMatch(/^[\uDC00-\uDFFF]/);
    expect(chunk.text).not.toMatch(/[\uD800-\uDBFF]$/);
    expect(chunk.text).not.toMatch(/\r$/);
    offset += chunk.text.length;
  }
});
