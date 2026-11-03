import { isReturnSubmission } from '../is-return-submission';

describe('isReturnSubmission', () => {
  it.each<[string, string, boolean, boolean]>([
    ['abc', 'abc\n', true, true],
    ['abc', 'abc\n', false, false],
    ['', '\n', true, false],
    ['abc', 'abc\n\n', true, false],
    ['abc', 'ab\nc', true, false],
    ['abc', 'abc\n-', true, false],
    ['abc\n', 'abc\n\n', true, true],
    ['  \n', '  \n\n', true, false],
    ['abc', 'abc\npasted text', true, false],
    ['abc', 'abc候选', true, false],
    ['abc', 'abc', true, false],
  ])('%j → %j (enabled: %s) returns %s', (previous, next, enabled, expected) => {
    expect(isReturnSubmission(previous, next, enabled)).toBe(expected);
  });
});
