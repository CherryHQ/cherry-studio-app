import { v7 as uuidv7 } from 'uuid';

import {
  BACKGROUND_REPLY_ACTION,
  type BackgroundActivityActions,
  type BackgroundActivityActionResponse,
} from '@/shared/backgroundActivity/actions';
import { validateUserAnswers } from '@/shared/contracts/agent';

import type { BackgroundReplyInteraction } from './backgroundReplyTypes';
import type { BackgroundReplyTranslate } from './deriveBackgroundReplyContent';

export function createBackgroundReplyActions(
  interaction: BackgroundReplyInteraction,
  t: BackgroundReplyTranslate,
): BackgroundActivityActions | undefined {
  if (interaction.kind === 'approval')
    return {
      token: uuidv7(),
      prompt: interaction.title,
      buttons: [
        { id: 'approve', label: t('chat.tool.approval.allow') },
        { id: 'deny', label: t('chat.tool.approval.deny') },
      ],
    };
  const [question] = interaction.question.questions;
  if (
    interaction.question.questions.length !== 1 ||
    !question ||
    question.selection !== 'single' ||
    question.textChanges?.length
  )
    return undefined;
  return {
    token: uuidv7(),
    prompt: question.question,
    // Reserve the third notification action for the system's text reply UI.
    buttons: question.options
      .slice(0, 2)
      .map((option) => ({ id: `option:${option.id}`, label: option.label })),
    reply: {
      label: t('chat.question.submit'),
      placeholder: t('chat.question.custom'),
      choices: question.options.map((option) => option.label),
    },
  };
}

export async function respondBackgroundReplyInteraction(
  interaction: BackgroundReplyInteraction,
  response: BackgroundActivityActionResponse,
): Promise<boolean> {
  if (interaction.kind === 'approval') {
    if (response.actionId !== 'approve' && response.actionId !== 'deny') return false;
    await interaction.respond(response.actionId);
    return true;
  }
  const [question] = interaction.question.questions;
  if (
    interaction.question.questions.length !== 1 ||
    !question ||
    question.selection !== 'single' ||
    question.textChanges?.length
  )
    return false;
  const text = response.actionId === BACKGROUND_REPLY_ACTION ? (response.text?.trim() ?? '') : '';
  const matching = question.options.filter((item) => item.label === text);
  const option =
    response.actionId === BACKGROUND_REPLY_ACTION
      ? matching.length === 1
        ? matching[0]
        : undefined
      : question.options.find((item) => response.actionId === `option:${item.id}`);
  if (!option && !text) return false;
  const answer = {
    answers: [
      {
        questionId: question.id,
        selectedOptionIds: option ? [option.id] : [],
        text: option ? '' : text,
        skipped: false,
      },
    ],
  };
  validateUserAnswers(interaction.question, answer);
  await interaction.respond(answer);
  return true;
}
