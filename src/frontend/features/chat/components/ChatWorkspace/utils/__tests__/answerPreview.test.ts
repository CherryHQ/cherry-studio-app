import { ANSWER_PREVIEW_LENGTH, answerPreview } from '../answerPreview';

describe('answerPreview', () => {
  test('joins the text parts and counts the characters a reader sees', () => {
    expect(
      answerPreview([
        { state: 'done', text: '第一段 text', type: 'text' },
        { state: 'done', text: '  ', type: 'text' },
        { state: 'done', text: '思考', type: 'reasoning' },
        { state: 'done', text: '第二段', type: 'text' },
      ]),
    ).toEqual({ isTruncated: false, length: 10, text: '第一段 text\n\n第二段' });
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

  test('has no text before an answer writes any', () => {
    expect(answerPreview(undefined)).toEqual({ isTruncated: false, length: 0, text: '' });
  });
});
