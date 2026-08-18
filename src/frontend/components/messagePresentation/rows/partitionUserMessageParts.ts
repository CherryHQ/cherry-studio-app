import type { CherryMessagePart } from '@cherrystudio/universal/data/types/message';
import { readCherryMeta } from '@cherrystudio/universal/data/types/uiParts';

import type { MessagePresentationItem } from '../types';

type FilePart = Extract<CherryMessagePart, { type: 'file' }>;

export type UserMessageAttachmentPart = {
  index: number;
  part: FilePart;
};

export type PartitionedUserMessageParts = {
  attachments: readonly UserMessageAttachmentPart[];
  bodyMessage?: MessagePresentationItem;
};

export function partitionUserMessageParts(
  message: MessagePresentationItem,
): PartitionedUserMessageParts {
  const parts = message.data.parts;
  if (!parts?.length) {
    return { attachments: [] };
  }

  const attachments: UserMessageAttachmentPart[] = [];
  const bodyParts: CherryMessagePart[] = [];

  parts.forEach((part, index) => {
    if (part.type !== 'file') {
      bodyParts.push(part);
      return;
    }

    if (readCherryMeta(part)?.fileEntryId) {
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
            data: { ...message.data, parts: bodyParts },
          },
  };
}
