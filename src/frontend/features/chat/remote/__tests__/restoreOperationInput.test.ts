import { restoreOperationInput } from '../restoreOperationInput';

const input = { parts: [{ type: 'text' as const, text: 'hello' }] };

it('puts a rejected input above the current draft', () => {
  expect(restoreOperationInput('', input)).toBe('hello');
  expect(restoreOperationInput('later', input)).toBe('hello\nlater');
});

it('does not duplicate text the composer already restored after an immediate rejection', () => {
  expect(restoreOperationInput('hello', input)).toBe('hello');
});
