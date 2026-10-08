import { isMessageListLiveTailInView } from '../messageListLayout';

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
