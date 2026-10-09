import type { Api, Message, Model } from '@earendil-works/pi-ai';
import {
  AssistantEntry,
  CompactionEntry,
  type EntryDraft,
  SystemEntry,
  ToolResultEntry,
  UserEntry,
} from '@earendil-works/pi-durable';

import type { RuntimeExecutionRequest } from '../types';
import { toPiConversation } from './modelMessages';
import { parseCheckpointPayload } from './piLegacyCheckpoint';

/**
 * One-time handoff of already resolved legacy history. Imported entries create no tasks and never
 * execute old tools. The Host must validate the checkpoint anchor before passing a trimmed tail.
 */
export function createLegacyPiEntries(
  request: RuntimeExecutionRequest,
  model: Model<Api>,
): EntryDraft[] {
  const conversation = toPiConversation(request, model);
  const checkpoint = request.contextCheckpoint;
  const payload = parseCheckpointPayload(checkpoint?.payload);
  if (checkpoint && !payload)
    throw new Error('A trimmed legacy history needs a valid Pi summary before migration.');

  let turns = conversation.historyTurns;
  if (payload?.resume) {
    const resume = payload.resume;
    const index = turns.findIndex((turn) => turn.turnId === resume.turnId);
    if (index < 0)
      throw new Error('The legacy summary split point is missing from the retained history.');
    turns = turns.slice(index);
    const first = turns[0]!;
    // A native replay offset cannot address a reconstructed display projection. Retain that whole
    // turn in that case; repeating a summarized prefix is preferable to silently losing its tail.
    const offset =
      first.replayKind === resume.replayKind && resume.messageOffset <= first.messages.length
        ? resume.messageOffset
        : 0;
    turns = [{ ...first, messages: first.messages.slice(offset) }, ...turns.slice(1)];
  }

  return [
    ...(payload
      ? [
          {
            kind: CompactionEntry.kind,
            head: 'self' as const,
            data: { reason: 'manual' as const },
            model: [
              {
                role: 'user' as const,
                content: `The earlier conversation was summarized before migration. Continue from this summary and the following original messages.\n\n<conversation-summary>\n${payload.summary}\n</conversation-summary>`,
                timestamp: 0,
              },
            ],
          },
        ]
      : []),
    ...turns.flatMap((turn) => turn.messages.map(legacyEntry)),
  ];
}

function legacyEntry(message: Message): EntryDraft {
  switch (message.role) {
    case 'user':
      return { kind: UserEntry.kind, model: [message] };
    case 'assistant':
      return { kind: AssistantEntry.kind, model: [message] };
    case 'toolResult':
      return { kind: ToolResultEntry.kind, model: [message], data: { diagnostics: [] } };
    case 'system':
      return { kind: SystemEntry.kind, model: [message] };
  }
}
