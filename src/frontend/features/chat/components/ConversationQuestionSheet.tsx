import { BottomSheet, ContentState } from '@cherrystudio/ui/components';
import { useState } from 'react';
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
  UserQuestionSheet,
  type UserQuestionSheetProps,
} from './UserQuestionSheet';

type QuestionForm = {
  questions: readonly QuestionFormQuestion[];
  allowSkip: boolean;
  response(answers: QuestionFormAnswer[]): ConversationInteractionResponse;
};

type QuestionRequest = Omit<UserQuestionSheetProps, 'open' | 'disabled'> & { key: string };

const ignoreClose = () => undefined;

/**
 * Presents a pending question from either source in a sheet. Local tool calls arrive inline;
 * desktop question forms arrive as a deferred resource. Both answer through the interaction bound
 * to that exact request.
 */
export function ConversationQuestionSheet({ snapshot }: { snapshot: ConversationSnapshot }) {
  const { t } = useTranslation();
  const retired = snapshot.freshness.state === 'retired';
  const pending = snapshot.interactions.find(
    (item) => item.state === 'pending' && item.kind === 'question',
  );
  const interaction = retired ? undefined : pending;
  const input = useConversationResourceValue(interaction?.input, retired);
  // Approvals keep presentation priority; the question sheet stays mounted so its drafts survive.
  const open =
    Boolean(interaction) &&
    snapshot.interactions.find((item) => item.state === 'pending') === interaction;
  const canRespond = open && interaction?.respond?.availability.state === 'enabled';
  const form = interaction && input.data ? questionForm(input.data) : undefined;
  const request: QuestionRequest | undefined =
    interaction && form
      ? {
          key: `${interaction.execution ?? ''}:${interaction.id}:${
            interaction.input.kind === 'deferred' ? interaction.input.key : ''
          }`,
          questions: form.questions,
          allowSkip: form.allowSkip,
          onRespond: async (answers) => {
            if (!canRespond) throw new Error('Question is no longer available');
            const result = await interaction.respond!.execute(form.response(answers));
            if (result.state === 'rejected' || result.state === 'interrupted')
              throw new Error('Question response failed');
            return result.state === 'applied' ? 'applied' : 'pending';
          },
        }
      : undefined;
  // Keep the last request mounted during the sheet's close animation.
  const [lastRequest, setLastRequest] = useState(request);
  if (request && request.key !== lastRequest?.key) setLastRequest(request);
  const shown = request ?? lastRequest;

  return (
    <>
      {shown ? (
        <UserQuestionSheet
          key={shown.key}
          open={open && shown === request}
          questions={shown.questions}
          allowSkip={shown.allowSkip}
          disabled={!canRespond || shown !== request}
          onRespond={shown.onRespond}
        />
      ) : null}
      {open && !form && input.isError ? (
        <BottomSheet
          dismissible={false}
          onClose={ignoreClose}
          open
          size="compact"
          title={t('chat.question.title')}
        >
          <ContentState.Error
            title={t('remoteAgent.interactionUnavailable')}
            primaryAction={{ children: t('common.retry'), onPress: input.refetch }}
          />
        </BottomSheet>
      ) : null}
    </>
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
