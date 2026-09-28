import type { PropsWithChildren } from 'react';

import type { ConversationSnapshot } from '@/frontend/appShell/conversation';

import { UserQuestionComposer } from './UserQuestionComposer';

/** Local questions carry inline input and a response bound to that exact request. */
export function ConversationQuestionComposer({
  snapshot,
  children,
}: PropsWithChildren<{ snapshot: ConversationSnapshot }>) {
  const interaction = snapshot.interactions.find(
    (item) =>
      item.state === 'pending' &&
      item.input.kind === 'inline' &&
      item.input.value.kind === 'user-question',
  );
  const input = interaction?.input.kind === 'inline' ? interaction.input.value : undefined;
  if (!interaction || input?.kind !== 'user-question' || snapshot.freshness.state === 'retired')
    return children;
  const request = {
    toolCallId: interaction.id,
    turnId: interaction.execution ?? interaction.id,
    question: input.question,
  };
  // Keep this form mounted beneath a concurrent approval so its answers survive.
  const canRespond =
    snapshot.interactions.find((item) => item.state === 'pending') === interaction &&
    interaction.respond?.availability.state === 'enabled';
  return (
    <UserQuestionComposer
      key={JSON.stringify(request)}
      request={request}
      disabled={!canRespond}
      onRespond={async (id, answer) => {
        if (!canRespond || id !== interaction.id)
          throw new Error('Question is no longer available');
        const result = await interaction.respond!.execute({ kind: 'user-answer', answer });
        if (result.state === 'rejected' || result.state === 'interrupted')
          throw new Error('Question response failed');
      }}
    />
  );
}
