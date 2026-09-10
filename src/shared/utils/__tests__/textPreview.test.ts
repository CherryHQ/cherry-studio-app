import { createTextPreview, TEXT_PREVIEW_MAX_CHARACTERS } from '../textPreview';

describe('createTextPreview', () => {
  test.each(['', '\n', '  leading\ntrailing\n', '正文😀'])(
    'preserves short content exactly: %p',
    (text) => {
      expect(createTextPreview(text)).toEqual({ text, truncated: false });
    },
  );

  test('bounds a minified file while continuing to show its newest content', () => {
    const text = 'x'.repeat(1_000_000) + 'latest';
    const preview = createTextPreview(text);
    expect(preview.text).toHaveLength(TEXT_PREVIEW_MAX_CHARACTERS);
    expect(preview.text.endsWith('latest')).toBe(true);
    expect(preview.truncated).toBe(true);
  });

  test.each(['', '\n'])('bounds many short lines, including a trailing newline: %p', (ending) => {
    const lines = Array.from({ length: 120 }, (_, index) => `line ${index}`);
    expect(createTextPreview(lines.join('\n') + ending)).toEqual({
      text: lines.slice(60).join('\n') + ending,
      truncated: true,
    });
  });

  test('never begins with half of a surrogate pair', () => {
    const tail = 'x'.repeat(TEXT_PREVIEW_MAX_CHARACTERS - 1);
    expect(createTextPreview(`prefix😀${tail}`)).toEqual({ text: tail, truncated: true });
  });
});
