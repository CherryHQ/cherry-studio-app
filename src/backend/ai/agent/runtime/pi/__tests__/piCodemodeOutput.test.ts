import { MAX_TEXT_ATTACHMENT_BYTES } from '@/shared/utils/fileAttachmentPolicy';

import { fitPiCodemodeOutput, piCodemodeFailureCode } from '../piCodemodeOutput';

const bytes = (text: string) => new TextEncoder().encode(text).byteLength;

test('output that read_file can read back is saved whole', () => {
  const ascii = 'x'.repeat(MAX_TEXT_ATTACHMENT_BYTES);
  expect(fitPiCodemodeOutput(ascii)).toBe(ascii);
  const image = new Uint8Array(MAX_TEXT_ATTACHMENT_BYTES + 1);
  expect(fitPiCodemodeOutput(image)).toBe(image);
});

test.each([
  ['ascii', 'x'.repeat(MAX_TEXT_ATTACHMENT_BYTES + 1)],
  // Three-byte characters followed by surrogate pairs, so the cut lands inside a pair.
  ['unicode', '中'.repeat(Math.floor(MAX_TEXT_ATTACHMENT_BYTES / 3) - 200) + '🍒'.repeat(400_000)],
])('oversized %s output keeps a readable start and says it was cut', (_kind, text) => {
  const saved = fitPiCodemodeOutput(text) as string;
  expect(bytes(saved)).toBeLessThanOrEqual(MAX_TEXT_ATTACHMENT_BYTES);
  const [kept, note] = saved.split('\n[Saved output cut: ');
  expect(text.startsWith(kept!)).toBe(true);
  expect(note).toBe(`the first ${kept!.length} of ${text.length} characters are kept.]`);
  // A split surrogate pair would encode as a replacement character.
  expect(saved).not.toContain('�');
  expect(/[\uD800-\uDBFF]$/.test(kept!)).toBe(false);
});

// The failure text pi-durable's Code Mode formats for the model: header, output, then the error.
const failed = (error: string, statuses: string[] = []) => ({
  isError: true,
  output: [
    { type: 'text' as const, text: 'Script failed\nWall time 0.1 seconds\nOutput:\n' },
    { type: 'text' as const, text: `partial\nScript error:\n${error}\n\nNo tool calls were made.` },
  ],
  details: {
    calls: statuses.map((status, id) => ({ id, name: 'read_file', args: '{}', status })),
  },
});

test.each([
  ['a timeout', failed('Script timed out: stopped: budget', ['error']), 'script_timeout'],
  ['an abort', failed('Script aborted: cancelled'), 'script_aborted'],
  ['a sandbox failure', failed('Script sandbox failed: bridge closed'), 'sandbox_failed'],
  [
    'an exception after a nested call failed',
    failed('Error: not found', ['ok', 'error']),
    'script_error',
  ],
  [
    'a script exception after a caught child failure',
    failed('SyntaxError: unexpected token\n    at JSON.parse (<anonymous>)', ['error', 'ok']),
    'script_error',
  ],
  ['a script exception', failed('SyntaxError: unexpected token', ['ok']), 'script_error'],
  [
    'output cut before its error',
    { isError: true, output: [{ type: 'text' as const, text: 'Script failed' }] },
    'script_failed',
  ],
])('records %s as its failure cause', (_case, result, code) => {
  expect(piCodemodeFailureCode(result)).toBe(code);
});
