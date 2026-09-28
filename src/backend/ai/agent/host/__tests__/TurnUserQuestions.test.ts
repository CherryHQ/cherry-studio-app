import type { AgentUserQuestion } from '@/shared/contracts/agent';

import { TurnUserQuestions } from '../TurnUserQuestions';

const question: AgentUserQuestion = {
  id: 'focus',
  question: 'What should the agent focus on?',
  selection: 'single',
  options: [
    { id: 'writing', label: 'Writing' },
    { id: 'reading', label: 'Reading' },
  ],
};
const single = { questions: [question] };
const choice = { selectedOptionIds: ['writing'], text: '', skipped: false };
const reply = (fields: Partial<typeof choice> = {}) => ({
  answers: [{ ...choice, ...fields, questionId: 'focus' }],
});
const answer = reply();

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
      questions.respond('question-1', { answers: [{ ...choice, questionId: 'focus' }] }),
    ).toThrow();
    const response = {
      answers: [
        { ...choice, questionId: 'focus' },
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
    const next = questions.ask(single, call(new AbortController(), 'next-call'));
    expect(() =>
      questions.respond('question-1', {
        answers: [
          { ...choice, questionId: 'focus' },
          { ...choice, questionId: 'audience' },
        ],
      }),
    ).toThrow();
    questions.respond('next-call', answer);
    await expect(next).resolves.toEqual(answer);
  });

  test('rejects stale and malformed answers without consuming the live question', async () => {
    const questions = new TurnUserQuestions();
    const result = questions.ask(single, call());
    expect(() => questions.respond('old-question', answer)).toThrow();
    expect(() =>
      questions.respond('question-1', reply({ selectedOptionIds: ['unknown'] })),
    ).toThrow();
    expect(() =>
      questions.respond('question-1', reply({ selectedOptionIds: ['writing', 'reading'] })),
    ).toThrow();
    questions.respond('question-1', answer);
    await expect(result).resolves.toEqual(answer);
    expect(() => questions.respond('question-1', answer)).toThrow();
  });

  test('cancellation releases the waiter and invalidates late responses', async () => {
    const questions = new TurnUserQuestions();
    const controller = new AbortController();
    const result = questions.ask(single, call(controller));
    const rejected = expect(result).rejects.toThrow('Cancelled');
    controller.abort(new Error('Cancelled'));
    await rejected;
    expect(() => questions.respond('question-1', answer)).toThrow();
    const next = questions.ask(single, call(new AbortController(), 'question-2'));
    questions.respond('question-2', reply({ selectedOptionIds: [], skipped: true }));
    await expect(next).resolves.toMatchObject({ answers: [{ skipped: true }] });
  });

  test('allows multiple choices and supplementary text while preventing simultaneous questions', async () => {
    const questions = new TurnUserQuestions();
    const result = questions.ask({ questions: [{ ...question, selection: 'multiple' }] }, call());
    expect(() => questions.ask(single, call(new AbortController(), 'question-2'))).toThrow();
    const response = reply({ selectedOptionIds: ['writing', 'reading'], text: 'For beginners' });
    questions.respond('question-1', response);
    await expect(result).resolves.toEqual(response);
  });
});
