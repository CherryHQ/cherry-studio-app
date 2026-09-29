import { fitLiveActivityProps } from '../liveActivityPayload';

const deepLinkUrl = 'cherrystudio://background-task?kind=painting&paintingId=painting-1';

// Match the native static attributes and expo-widgets ContentState, including
// Foundation's possible slash escaping. Assert Apple's limit, not the helper's budget.
function nativeBytes(props: object, url = deepLinkUrl): number {
  const attributes = JSON.stringify({ url });
  const content = JSON.stringify({ name: 'PaintingActivity', props: JSON.stringify(props) });
  return Buffer.byteLength(`${attributes}${content}`.replaceAll('/', '\\/'), 'utf8');
}

describe('Live Activity payload budget', () => {
  test('preserves content that already fits', () => {
    const props = { preview: 'A small painting', startedAtEpochMs: 100, title: 'Painting' };
    expect(fitLiveActivityProps(props, deepLinkUrl)).toEqual(props);
  });

  test.each(['long prompt ', '中文提示词', '🌸🚀', '"\\/\n\u0000'])(
    'fits long %j content without corrupting Unicode or changing the source',
    (text) => {
      const props = {
        detail: 'Generating',
        phase: 'generating',
        preview: text.repeat(2_000),
        startedAtEpochMs: 100,
        title: 'Painting',
      };
      const bounded = fitLiveActivityProps(props, deepLinkUrl);

      expect(nativeBytes(bounded)).toBeLessThanOrEqual(4 * 1024);
      expect(bounded.preview.endsWith('…')).toBe(true);
      expect(props.preview.startsWith(bounded.preview.slice(0, -1))).toBe(true);
      expect(
        Array.from(bounded.preview).some((character) => /^[\uD800-\uDFFF]$/.test(character)),
      ).toBe(false);
      expect(bounded).toMatchObject({
        detail: 'Generating',
        phase: 'generating',
        startedAtEpochMs: 100,
        title: 'Painting',
      });
      expect(props.preview).toBe(text.repeat(2_000));
    },
  );

  test('bounds long titles and attribution as well as previews, preserving final state', () => {
    const props = {
      attribution: 'Assistant '.repeat(1_000),
      compactLabel: 'Completed',
      detail: 'Reply completed',
      finishedAtEpochMs: 200,
      phase: 'completed',
      preview: 'reply '.repeat(1_000),
      startedAtEpochMs: 100,
      title: 'Conversation '.repeat(1_000),
    };
    const bounded = fitLiveActivityProps(props, deepLinkUrl);

    expect(nativeBytes(bounded)).toBeLessThanOrEqual(4 * 1024);
    expect(bounded).toMatchObject({
      compactLabel: 'Completed',
      detail: 'Reply completed',
      finishedAtEpochMs: 200,
      phase: 'completed',
      startedAtEpochMs: 100,
    });
    expect(bounded.title.endsWith('…')).toBe(true);
    expect(props.title).toBe('Conversation '.repeat(1_000));
  });

  test('rejects oversized fixed metadata instead of corrupting a deep link or identifier', () => {
    expect(() =>
      fitLiveActivityProps({ startedAtEpochMs: 100 }, `cherrystudio://${'a'.repeat(4_096)}`),
    ).toThrow(RangeError);
    expect(() =>
      fitLiveActivityProps({
        identifier: 'a'.repeat(4_096),
        preview: 'short',
        startedAtEpochMs: 100,
      }),
    ).toThrow(RangeError);
  });
});
