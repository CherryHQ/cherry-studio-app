import { ANSWER_PREVIEW_LENGTH, answerPreview } from '../answerPreview';

describe('answerPreview', () => {
  test('previews the result text the full answer shows, not narration left in its process', () => {
    expect(
      answerPreview([
        { state: 'done', text: '先写的草稿', type: 'text' },
        { state: 'done', text: '思考', type: 'reasoning' },
        { state: 'done', text: '最终 answer', type: 'text' },
        { state: 'done', text: '  ', type: 'text' },
      ]),
    ).toEqual({ isTruncated: false, length: 8, text: '最终 answer' });
  });

  test('cuts a long answer on a character boundary', () => {
    const preview = answerPreview([
      { state: 'done', text: '😀'.repeat(ANSWER_PREVIEW_LENGTH + 1), type: 'text' },
    ]);

    expect(preview.isTruncated).toBe(true);
    expect(Array.from(preview.text)).toHaveLength(ANSWER_PREVIEW_LENGTH);
    expect(preview.text.endsWith('😀')).toBe(true);
    expect(preview.length).toBe(ANSWER_PREVIEW_LENGTH + 1);
  });

  test.each(['', '尾'])(
    'keeps mixed Unicode and whitespace at the exact preview boundary (%s)',
    (tail) => {
      const opening = ` \t\n\u00a0${'中'.repeat(ANSWER_PREVIEW_LENGTH - 5)}😀`;
      expect(answerPreview([{ state: 'streaming', text: opening + tail, type: 'text' }])).toEqual({
        isTruncated: tail.length > 0,
        length: ANSWER_PREVIEW_LENGTH - 4 + tail.length,
        text: opening,
      });
    },
  );

  test('shows citation markers the way the full answer does', () => {
    expect(
      answerPreview([
        { sourceId: 's1', title: 'Expo', type: 'source-url', url: 'https://expo.dev' },
        { state: 'done', text: '见 [cite:s1] 与 [cite:none]', type: 'text' },
      ]),
    ).toEqual({
      isTruncated: false,
      length: 16,
      text: '见 [❶](cite:https%3A%2F%2Fexpo.dev) 与 [cite:none]',
    });
  });

  test('has no text before an answer writes any', () => {
    expect(answerPreview(undefined)).toEqual({ isTruncated: false, length: 0, text: '' });
  });
});
