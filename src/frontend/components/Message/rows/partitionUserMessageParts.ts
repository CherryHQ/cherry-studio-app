import type { CherryMessagePart } from '@/shared/data/types/message';
import { readCherryMeta } from '@/shared/data/types/uiParts';

import type { MessageListItem } from '../types';

type FilePart = Extract<CherryMessagePart, { type: 'file' }>;

export type UserMessageAttachmentPart = {
  index: number;
  part: FilePart;
};

export type PartitionedUserMessageParts = {
  attachments: readonly UserMessageAttachmentPart[];
  bodyMessage?: MessageListItem;
};

export function partitionUserMessageParts(message: MessageListItem): PartitionedUserMessageParts {
  const parts = message.data.parts;
  if (!parts?.length) {
    return { attachments: [] };
  }

  const attachments: UserMessageAttachmentPart[] = [];
  const bodyParts: CherryMessagePart[] = [];
  const bodyPartKeys: string[] = [];

  parts.forEach((part, index) => {
    if (part.type !== 'file') {
      bodyParts.push(part);
      if (message.data.partKeys) {
        bodyPartKeys.push(message.data.partKeys[index] ?? `${message.id}-${part.type}-${index}`);
      }
      return;
    }

    if (readCherryMeta(part as FilePart)?.fileEntryId) {
      attachments.push({ index, part });
    }
  });

  if (bodyParts.length === 0) {
    return { attachments };
  }

  return {
    attachments,
    bodyMessage:
      bodyParts.length === parts.length
        ? message
        : {
            ...message,
            data: {
              ...message.data,
              ...(message.data.partKeys ? { partKeys: bodyPartKeys } : {}),
              parts: bodyParts,
            },
          },
  };
}
