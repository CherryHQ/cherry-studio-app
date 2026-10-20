import type { MessageListItem } from '../../types';
import { isMessageListLiveTailInView, messageKeyExtractor } from '../messageListLayout';

describe('isMessageListLiveTailInView', () => {
  const viewport = 800;
  const bottomInset = 100;
  const content = 5000;
  const offsetAtEnd = content - viewport;

  test('treats the end as visible at the bottom and hidden far above it', () => {
    expect(isMessageListLiveTailInView(offsetAtEnd, content, viewport, bottomInset, false)).toBe(
      true,
    );
    expect(isMessageListLiveTailInView(0, content, viewport, bottomInset, true)).toBe(false);
  });

  // Growth while the end sits at the edge must not flip visibility back and
  // forth: revealing needs a closer end than staying visible does.
  test('reveals earlier than it hides', () => {
    const between = offsetAtEnd - bottomInset - 240;

    expect(isMessageListLiveTailInView(between, content, viewport, bottomInset, false)).toBe(false);
    expect(isMessageListLiveTailInView(between, content, viewport, bottomInset, true)).toBe(true);
  });
});

test('keeps one row for the answers to a question, so switching updates it in place', () => {
  const answer = (id: string): MessageListItem => ({
    branch: { key: 'answers:q1', siblings: [] },
    data: {},
    id,
    role: 'assistant',
    status: 'success',
  });
  expect(messageKeyExtractor(answer('a1'))).toBe(messageKeyExtractor(answer('a2')));
  expect(messageKeyExtractor({ data: {}, id: 'q1', role: 'user', status: 'success' })).toBe('q1');
});
