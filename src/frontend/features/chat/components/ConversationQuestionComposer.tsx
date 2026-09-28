import { ContentState } from '@cherrystudio/ui/components';
import type { PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';

import type {
  ConversationInteractionResponse,
  ConversationSnapshot,
  ResourceValue,
} from '@/frontend/appShell/conversation';
import type { InteractionQuestion } from '@/shared/contracts/interaction';

import { useConversationResourceValue } from '../hooks/useConversationResourceValue';
import {
  type QuestionFormAnswer,
  type QuestionFormQuestion,
  UserQuestionComposer,
} from './UserQuestionComposer';

type QuestionForm = {
  questions: readonly QuestionFormQuestion[];
  allowSkip: boolean;
  response(answers: QuestionFormAnswer[]): ConversationInteractionResponse;
};

/**
 * A pending question replaces the ordinary composer. Local tool calls arrive inline; desktop
 * question forms arrive as a deferred resource. Both answer through the interaction bound to
 * that exact request.
 */
export function ConversationQuestionComposer({
  snapshot,
  children,
}: PropsWithChildren<{ snapshot: ConversationSnapshot }>) {
  const { t } = useTranslation();
  const retired = snapshot.freshness.state === 'retired';
  const interaction = snapshot.interactions.find(
    (item) => item.state === 'pending' && item.kind === 'question',
  );
  const input = useConversationResourceValue(interaction?.input, retired);
  if (!interaction || retired) return children;
  // Approvals keep presentation priority; the form stays mounted so its drafts survive.
  const canRespond =
    snapshot.interactions.find((item) => item.state === 'pending') === interaction &&
    interaction.respond?.availability.state === 'enabled';
  const form = input.data ? questionForm(input.data) : undefined;
  if (!form) {
    if (input.isError)
      return (
        <ContentState.Error
          title={t('remoteAgent.interactionUnavailable')}
          primaryAction={{ children: t('common.retry'), onPress: input.refetch }}
        />
      );
    if (input.isPending) return <ContentState.Loading title={t('remoteAgent.loading')} />;
    return children;
  }
  const requestKey = `${interaction.execution ?? ''}:${interaction.id}:${
    interaction.input.kind === 'deferred' ? interaction.input.key : ''
  }`;
  return (
    <UserQuestionComposer
      key={requestKey}
      questions={form.questions}
      allowSkip={form.allowSkip}
      disabled={!canRespond}
      onRespond={async (answers) => {
        if (!canRespond) throw new Error('Question is no longer available');
        const result = await interaction.respond!.execute(form.response(answers));
        if (result.state === 'rejected' || result.state === 'interrupted')
          throw new Error('Question response failed');
        return result.state === 'applied' ? 'applied' : 'pending';
      }}
    />
  );
}

function questionForm(value: ResourceValue): QuestionForm | undefined {
  if (value.kind === 'user-question')
    return {
      questions: value.question.questions,
      allowSkip: true,
      response: (answers) => ({ kind: 'user-answer', answer: { answers } }),
    };
  if (value.kind === 'question')
    return {
      questions: value.questions.map(desktopQuestion),
      allowSkip: false,
      response: (answers) => ({
        kind: 'answer',
        answers: Object.fromEntries(
          answers.map((answer) => [
            answer.questionId,
            [...answer.selectedOptionIds, ...(answer.text ? [answer.text] : [])].join(', '),
          ]),
        ),
      }),
    };
  return undefined;
}

/** Desktop questions and options carry no ids; their text is the key the desktop expects back. */
function desktopQuestion(question: InteractionQuestion): QuestionFormQuestion {
  return {
    id: question.question,
    header: question.header,
    question: question.question,
    selection: question.multiple ? 'multiple' : 'single',
    options: question.options.map((option) => ({
      id: option.label,
      label: option.label,
      description: option.description,
    })),
  };
}
