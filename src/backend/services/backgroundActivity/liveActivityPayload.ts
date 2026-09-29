// ActivityKit allows 4 KB for static attributes and dynamic content together.
// Include the URL and expo-widgets' nested JSON string, leaving 1 KB for the
// activity name and native encoding/envelope overhead.
const PAYLOAD_BUDGET_BYTES = 3 * 1024;
const TRUNCATABLE_FIELDS = ['preview', 'attribution', 'title', 'detail', 'compactLabel'] as const;

/** Bounds display copy at the native boundary without changing the domain's content. */
export function fitLiveActivityProps<Props extends object>(
  props: Props,
  deepLinkUrl?: string,
): Props {
  const encoder = new TextEncoder();
  const byteLength = (value: object) =>
    encoder.encode(
      // Foundation may escape slashes too. Count them conservatively, including
      // slashes inside the already-serialized props string.
      JSON.stringify({ url: deepLinkUrl, props: JSON.stringify(value) }).replaceAll('/', '\\/'),
    ).byteLength;

  if (byteLength(props) <= PAYLOAD_BUDGET_BYTES) return props;

  const bounded = { ...props } as Record<string, unknown>;
  for (const field of TRUNCATABLE_FIELDS) {
    const value = bounded[field];
    if (typeof value !== 'string' || value.length === 0) continue;
    bounded[field] = '';
    if (byteLength(bounded) > PAYLOAD_BUDGET_BYTES) continue;

    // Search code points, not UTF-16 units, so truncation cannot split an emoji.
    const characters = Array.from(value);
    let low = 0;
    let high = characters.length - 1;
    let fitting = '';
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      bounded[field] = `${characters.slice(0, middle).join('')}…`;
      if (byteLength(bounded) <= PAYLOAD_BUDGET_BYTES) {
        fitting = bounded[field] as string;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    bounded[field] = fitting;
    return bounded as Props;
  }

  // Never send an oversized payload or truncate identifiers, links, or state.
  throw new RangeError('Live Activity metadata exceeds its payload budget');
}
