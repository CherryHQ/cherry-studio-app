import type { AgentUserQuestion } from '@/shared/contracts/agent';

import { TurnUserQuestions } from '../TurnUserQuestions';

const question: AgentUserQuestion = {
  question: 'What should the agent focus on?',
  selection: 'single',
  options: [
    { id: 'writing', label: 'Writing', description: '' },
    { id: 'reading', label: 'Reading', description: '' },
  ],
};
const answer = { selectedOptionIds: ['writing'], text: '', skipped: false };

function call(controller = new AbortController(), toolCallId = 'question-1') {
  return { input: {}, signal: controller.signal, toolCallId, turnId: 'turn-1' };
}

describe('TurnUserQuestions', () => {
  test('collects a batch atomically and preserves the pending batch after an incomplete response', async () => {
    const questions = new TurnUserQuestions();
    const batch = {
      questions: [
        { ...question, id: 'focus' },
        { ...question, id: 'audience' },
      ],
    };
    const result = questions.ask(batch, call());
    expect(() =>
      questions.respond('question-1', { answers: [{ ...answer, questionId: 'focus' }] }),
    ).toThrow();
    const response = {
      answers: [
        { ...answer, questionId: 'focus' },
        { questionId: 'audience', selectedOptionIds: [], text: '', skipped: true },
      ],
    };
    questions.respond('question-1', response);
    await expect(result).resolves.toEqual(response);
    expect(() => questions.respond('question-1', response)).toThrow();
  });

  test('cancels an entire batch without letting a late answer resolve the next call', async () => {
    const questions = new TurnUserQuestions();
    const batch = {
      questions: [
        { ...question, id: 'focus' },
        { ...question, id: 'audience' },
      ],
    };
    const controller = new AbortController();
    const result = questions.ask(batch, call(controller));
    const rejected = expect(result).rejects.toThrow('Cancelled');
    controller.abort(new Error('Cancelled'));
    await rejected;
    const next = questions.ask(question, call(new AbortController(), 'next-call'));
    expect(() =>
      questions.respond('question-1', {
        answers: [
          { ...answer, questionId: 'focus' },
          { ...answer, questionId: 'audience' },
        ],
      }),
    ).toThrow();
    questions.respond('next-call', answer);
    await expect(next).resolves.toEqual(answer);
  });

  test('rejects stale and malformed answers without consuming the live question', async () => {
    const questions = new TurnUserQuestions();
    const result = questions.ask(question, call());
    expect(() => questions.respond('old-question', answer)).toThrow();
    expect(() =>
      questions.respond('question-1', { ...answer, selectedOptionIds: ['unknown'] }),
    ).toThrow();
    expect(() =>
      questions.respond('question-1', { ...answer, selectedOptionIds: ['writing', 'reading'] }),
    ).toThrow();
    questions.respond('question-1', answer);
    await expect(result).resolves.toEqual(answer);
    expect(() => questions.respond('question-1', answer)).toThrow();
  });

  test('cancellation releases the waiter and invalidates late responses', async () => {
    const questions = new TurnUserQuestions();
    const controller = new AbortController();
    const result = questions.ask(question, call(controller));
    const rejected = expect(result).rejects.toThrow('Cancelled');
    controller.abort(new Error('Cancelled'));
    await rejected;
    expect(() => questions.respond('question-1', answer)).toThrow();
    const next = questions.ask(question, call(new AbortController(), 'question-2'));
    questions.respond('question-2', { selectedOptionIds: [], text: '', skipped: true });
    await expect(next).resolves.toMatchObject({ skipped: true });
  });

  test('allows multiple choices and supplementary text while preventing simultaneous questions', async () => {
    const questions = new TurnUserQuestions();
    const result = questions.ask({ ...question, selection: 'multiple' }, call());
    expect(() => questions.ask(question, call(new AbortController(), 'question-2'))).toThrow();
    const response = {
      selectedOptionIds: ['writing', 'reading'],
      text: 'For beginners',
      skipped: false,
    };
    questions.respond('question-1', response);
    await expect(result).resolves.toEqual(response);
  });
});
