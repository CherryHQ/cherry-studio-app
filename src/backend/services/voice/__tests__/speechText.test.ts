import { splitSpeechText } from '../speechText';

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

test('uses the first limit only for the first utterance and prefers sentence boundaries', () => {
  expect(splitSpeechText('Start. Second. Third. Last.', 20, 12)).toEqual([
    'Start.',
    'Second. Third. Last.',
  ]);
  expect(splitSpeechText('x'.repeat(28), 12, 4).map((chunk) => chunk.length)).toEqual([4, 12, 12]);
});

test('keeps supplementary characters intact at both hard-cut boundaries', () => {
  const chunks = splitSpeechText('ab🙂c🙂def🙂', 4, 3);
  expect(chunks).toEqual(['ab', '🙂c', '🙂de', 'f🙂']);
  expect(chunks.join('')).toBe('ab🙂c🙂def🙂');
});

test('handles impossible and invalid unit limits without emitting lone surrogates', () => {
  expect(splitSpeechText('🙂a\ud800', 1)).toEqual(['�', 'a', '�']);
  expect(splitSpeechText('hi', 0)).toEqual([]);
  expect(splitSpeechText('hi', 10, 0)).toEqual([]);
});
