import { partitionMessageParts } from '@/frontend/components/Message/parts/partitionMessageParts';
import {
  isToolMessagePart,
  type ToolMessagePart,
} from '@/frontend/components/Message/parts/tools/toolPartState';
import type { AgentMessageView } from '@/shared/contracts/agent';
import type { CherryMessagePart } from '@/shared/data/types/message';
import { editableReplyParts } from '@/shared/utils/assistantReply';

import { toAgentMessageListItem } from '../runtime/agentMessageProjection';

export type ReplyEditorText = { kind: 'text'; key: string; text: string };
export type ReplyEditorItem =
  | ReplyEditorText
  | { kind: 'reasoning'; key: string; part: CherryMessagePart }
  | { kind: 'tools'; key: string; tools: ToolMessagePart[] };

/**
 * The answer in transcript order, split exactly as the message shows it: prose between tool calls
 * belongs to the process, the last text is the result. Text keeps its source part id for the edit.
 */
export function replyEditorItems(message: AgentMessageView) {
  const item = toAgentMessageListItem(message);
  const parts = item?.data.parts ?? [];
  // Display parts and their source part ids are index-aligned.
  const keys = item?.data.partKeys ?? [];
  const editable = new Map(editableReplyParts(message.parts).map((part) => [part.id, part.text]));
  const textAt = (index: number): ReplyEditorText | undefined => {
    const key = keys[index]!;
    const text = editable.get(key);
    return text === undefined ? undefined : { kind: 'text', key, text };
  };
  const { body, process: processParts } = partitionMessageParts(parts);
  const process: ReplyEditorItem[] = [];
  for (const { index, part } of processParts) {
    const previous = process.at(-1);
    const key = keys[index]!;
    // The projection already joins adjacent reasoning into one part.
    if (part.type === 'reasoning') process.push({ kind: 'reasoning', key, part });
    else if (isToolMessagePart(part)) {
      if (previous?.kind === 'tools') previous.tools.push(part);
      else process.push({ kind: 'tools', key, tools: [part] });
    } else if (part.type === 'text') {
      const text = textAt(index);
      if (text) process.push(text);
    }
  }
  const answer = body.flatMap(({ index, part }) => {
    const text = part.type === 'text' ? textAt(index) : undefined;
    return text ? [text] : [];
  });
  return { answer, parts, process, stats: item?.stats };
}
