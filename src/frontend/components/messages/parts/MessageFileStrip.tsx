import { ScrollView, StyleSheet } from 'react-native';

import type { CherryMessagePart } from '@/shared/data/types/message';

import { FilePart } from './FilePart';

type MessageFilePart = Extract<CherryMessagePart, { type: 'file' }>;

/** One file card tall, matching `FilePreview`'s own default size. */
const FILE_CARD_SIZE = 112;

/**
 * A run of managed files laid out as one horizontally scrolling row.
 *
 * Files are the one part type that arrives several at a time, and stacking
 * full-size cards down a phone screen buries the rest of the message. The row
 * carries no heading: whether a file was attached or produced follows from the
 * message it sits in, so labelling it here would only restate the role.
 */
export function MessageFileStrip({ parts }: { parts: readonly MessageFilePart[] }) {
  return (
    <ScrollView
      alwaysBounceHorizontal={false}
      className="max-w-full"
      contentContainerClassName="gap-2"
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.strip}
    >
      {/* The URL carries the entry id, and every import or tool write mints a
          fresh one, so it identifies the card without falling back to position. */}
      {parts.map((part) => (
        <FilePart key={part.url} part={part} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  strip: {
    height: FILE_CARD_SIZE,
  },
});
