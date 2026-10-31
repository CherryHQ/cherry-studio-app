import { speakableText, splitSpeechText } from '../speechText';

test('reads prose and skips code, images and link targets', () => {
  const markdown = [
    '## 结论',
    '',
    '先看 **重点**：[文档](https://example.com/doc) 与 `npm test`。',
    '',
    '```bash',
    'rm -rf build',
    '```',
    '',
    '![diagram](https://example.com/d.png)',
    '',
    '| 名称 | 值 |',
    '| --- | --- |',
    '| a | 1 |',
    '',
    '- one',
    '- two',
  ].join('\n');
  expect(speakableText(markdown)).toBe(
    ['结论', '先看 重点：文档 与 npm test。', '名称 值', 'a 1', 'one', 'two'].join('\n'),
  );
});

test('packs sentences into utterances without exceeding the limit', () => {
  const text = 'First sentence. Second one! 第三句。第四句？\nNew line here.';
  const chunks = splitSpeechText(text, 30);
  expect(chunks.every((chunk) => chunk.length <= 30)).toBe(true);
  expect(chunks).toEqual(['First sentence. Second one!', '第三句。 第四句？\nNew line here.']);
  // A single sentence longer than the limit is cut rather than dropped.
  expect(splitSpeechText('x'.repeat(25), 10)).toEqual([
    'x'.repeat(10),
    'x'.repeat(10),
    'x'.repeat(5),
  ]);
});
