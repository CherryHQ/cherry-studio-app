import { piCodemodeFailureCode } from '../piCodemodeOutput';

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
