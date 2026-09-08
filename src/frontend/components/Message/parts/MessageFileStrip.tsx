import { View } from 'react-native';

import type { CherryMessagePart } from '@/shared/data/types/message';

import { FilePart } from './FilePart';

type MessageFilePart = Extract<CherryMessagePart, { type: 'file' }>;

/**
 * User attachments wrap inside the message column so every card stays visible.
 * The container owns row spacing; cards keep their intrinsic size.
 */
export function MessageFileStrip({ parts }: { parts: readonly MessageFilePart[] }) {
  return (
    <View className="w-full flex-row flex-wrap justify-end gap-2">
      {/* The URL carries the entry id, and every import or tool write mints a
          fresh one, so it identifies the card without falling back to position. */}
      {parts.map((part) => (
        <FilePart key={part.url} part={part} />
      ))}
    </View>
  );
}
