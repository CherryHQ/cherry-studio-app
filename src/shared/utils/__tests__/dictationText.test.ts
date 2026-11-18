import { appendUtterance } from '../dictationText';

test('utterances join with a space only between spaced scripts', () => {
  expect(appendUtterance('', ' hello ')).toBe('hello');
  expect(appendUtterance('hello', ' world')).toBe('hello world');
  expect(appendUtterance('今天天气', ' 很好')).toBe('今天天气很好');
  expect(appendUtterance('会议纪要：', 'Q3 plan')).toBe('会议纪要：Q3 plan');
  expect(appendUtterance('draft', '  ')).toBe('draft');
});
