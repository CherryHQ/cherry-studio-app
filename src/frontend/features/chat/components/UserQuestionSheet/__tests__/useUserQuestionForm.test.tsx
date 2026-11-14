import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import {
  type QuestionFormAnswer,
  type QuestionFormQuestion,
  useUserQuestionForm,
} from '../useUserQuestionForm';

const questions: readonly QuestionFormQuestion[] = [
  {
    id: 'city',
    question: 'Where?',
    selection: 'single',
    options: [
      { id: 'a', label: 'Hangzhou' },
      { id: 'b', label: 'Suzhou' },
    ],
  },
  {
    id: 'activities',
    question: 'What?',
    selection: 'multiple',
    options: [
      { id: 'a', label: 'Food' },
      { id: 'b', label: 'Nature' },
    ],
  },
  { id: 'notes', question: 'Anything else?', selection: 'single', options: [] },
];
let form: ReturnType<typeof useUserQuestionForm>;
let renderer: ReactTestRenderer;
let respond: jest.Mock<Promise<'applied' | 'pending'>, [QuestionFormAnswer[]]>;

function Harness({
  value = questions,
  allowSkip = true,
  disabled = false,
}: {
  value?: readonly QuestionFormQuestion[];
  allowSkip?: boolean;
  disabled?: boolean;
}) {
  const state = useUserQuestionForm({ questions: value, allowSkip, disabled, onRespond: respond });
  useEffect(() => {
    form = state;
  }, [state]);
  return null;
}

beforeEach(() => {
  respond = jest.fn<Promise<'applied' | 'pending'>, [QuestionFormAnswer[]]>(async () => 'applied');
  act(() => {
    renderer = create(<Harness />);
  });
});
afterEach(() => {
  act(() => renderer.unmount());
});

test('stays on a single choice, turns skip into next once answered, and submits on the last', async () => {
  expect(form.action).toBe('skip');
  act(() => form.select('a'));
  expect(form.index).toBe(0);
  expect(form.action).toBe('next');
  act(() => form.select('b'));
  expect(form.answer.selectedOptionIds).toEqual(['b']);
  act(() => form.advance());
  expect(form.index).toBe(1);
  expect(form.action).toBe('skip');
  act(() => {
    form.select('a');
    form.select('b');
  });
  expect(form.index).toBe(1);
  expect(form.action).toBe('next');
  act(() => form.advance());
  expect(form.index).toBe(2);
  expect(form.action).toBe('submit');
  act(() => form.setText(' No car '));
  expect(respond).not.toHaveBeenCalled();
  await act(async () => form.advance());
  expect(respond).toHaveBeenCalledWith([
    { questionId: 'city', selectedOptionIds: ['b'], text: '', skipped: false },
    { questionId: 'activities', selectedOptionIds: ['a', 'b'], text: '', skipped: false },
    { questionId: 'notes', selectedOptionIds: [], text: 'No car', skipped: false },
  ]);
});

test('skips the current question, clears skip when editing again, and skips the rest on submit', async () => {
  act(() => form.setText('discard this'));
  act(() => form.setText(''));
  act(() => form.advance());
  expect(form.index).toBe(1);
  act(() => form.navigate(0));
  expect(form.answer).toEqual({ selectedOptionIds: [], text: '', skipped: true });
  act(() => form.select('b'));
  expect(form.index).toBe(0);
  expect(form.answer).toEqual({ selectedOptionIds: ['b'], text: '', skipped: false });
  act(() => form.navigate(2));
  expect(form.isComplete).toBe(true);
  await act(async () => form.advance());
  expect(respond.mock.calls[0][0]).toEqual([
    { questionId: 'city', selectedOptionIds: ['b'], text: '', skipped: false },
    { questionId: 'activities', selectedOptionIds: [], text: '', skipped: true },
    { questionId: 'notes', selectedOptionIds: [], text: '', skipped: true },
  ]);
});

test('clears a selected single choice so the question can be skipped', async () => {
  act(() => form.select('a'));
  expect(form.action).toBe('next');
  act(() => form.select('a'));
  expect(form.answer.selectedOptionIds).toEqual([]);
  expect(form.action).toBe('skip');
  act(() => form.advance());
  act(() => form.navigate(2));
  await act(async () => form.advance());
  expect(respond.mock.calls[0][0][0]).toEqual({
    questionId: 'city',
    selectedOptionIds: [],
    text: '',
    skipped: true,
  });
});

test('clears a required single choice without losing free text or allowing an empty answer', async () => {
  act(() =>
    renderer.update(<Harness key="required-single" value={[questions[0]]} allowSkip={false} />),
  );
  act(() => form.select('a'));
  act(() => form.select('a'));
  expect(form.canAct).toBe(false);
  await act(async () => form.advance());
  expect(respond).not.toHaveBeenCalled();
  act(() => form.select('b'));
  act(() => form.setText('Another city'));
  act(() => form.select('b'));
  await act(async () => form.advance());
  expect(respond).toHaveBeenCalledWith([
    { questionId: 'city', selectedOptionIds: [], text: 'Another city', skipped: false },
  ]);
});

test('requires every answer when the request does not accept skips', async () => {
  act(() => {
    renderer.update(<Harness key="required" allowSkip={false} />);
  });
  expect(form.allowSkip).toBe(false);
  expect(form.action).toBe('next');
  expect(form.canAct).toBe(false);
  act(() => form.skip());
  act(() => form.advance());
  expect(form.index).toBe(0);
  expect(form.answer.skipped).toBe(false);
  act(() => form.select('a'));
  expect(form.canAct).toBe(true);
  act(() => form.advance());
  act(() => form.select('a'));
  act(() => form.advance());
  expect(form.action).toBe('submit');
  expect(form.isComplete).toBe(false);
  await act(async () => form.submit());
  expect(respond).not.toHaveBeenCalled();
  act(() => form.setText('Anything'));
  expect(form.isComplete).toBe(true);
  await act(async () => form.advance());
  expect(respond).toHaveBeenCalledTimes(1);
});

test('skips optional fields while requiring every required parameter before submission', async () => {
  const value: QuestionFormQuestion[] = [
    { ...questions[2], id: 'optional-first', required: false },
    { ...questions[2], id: 'required', required: true },
    { ...questions[2], id: 'optional-last', required: false },
  ];
  act(() => renderer.update(<Harness key="parameters" value={value} allowSkip={false} />));
  expect(form.action).toBe('skip');
  act(() => form.advance());
  expect(form.index).toBe(1);
  expect(form.canAct).toBe(false);
  act(() => form.skip());
  expect(form.index).toBe(1);
  act(() => form.navigate(2));
  expect(form.canAct).toBe(false);
  await act(async () => form.submit());
  expect(respond).not.toHaveBeenCalled();
  act(() => form.navigate(1));
  act(() => form.setText('Topic'));
  act(() => form.advance());
  expect(form.canAct).toBe(true);
  await act(async () => form.submit());
  expect(respond).toHaveBeenCalledWith([
    { questionId: 'optional-first', selectedOptionIds: [], text: '', skipped: true },
    { questionId: 'required', selectedOptionIds: [], text: 'Topic', skipped: false },
    { questionId: 'optional-last', selectedOptionIds: [], text: '', skipped: true },
  ]);
});

test('honors an explicit required field even when other questions may be skipped', async () => {
  act(() =>
    renderer.update(
      <Harness key="explicit-required" value={[{ ...questions[2], required: true }]} />,
    ),
  );
  expect(form.canAct).toBe(false);
  act(() => form.skip());
  expect(form.answer.skipped).toBe(false);
  await act(async () => form.submit());
  expect(respond).not.toHaveBeenCalled();
});

const review: QuestionFormQuestion = {
  id: 'review',
  question: 'Save these changes?',
  selection: 'single',
  options: [
    { id: 'adapt', label: 'Save and continue' },
    { id: 'keep', label: 'Keep unchanged' },
  ],
  textChanges: [{ before: 'Old instructions', after: 'New instructions', reason: 'Use on mobile' }],
};

test.each(['skip', 'text'] as const)(
  'preserves the %s answer to reviewed text alongside another question until submission',
  async (mode) => {
    act(() =>
      renderer.update(
        <Harness
          key={`mixed-review-${mode}`}
          value={[review, { ...questions[2], required: true }]}
        />,
      ),
    );
    if (mode === 'skip') {
      act(() => form.skip());
    } else {
      act(() => form.setText('Please revise this step'));
      act(() => form.advance());
    }
    expect(form.index).toBe(1);
    expect(respond).not.toHaveBeenCalled();
    act(() => form.navigate(0));
    expect(form.answer).toEqual({
      selectedOptionIds: [],
      text: mode === 'text' ? 'Please revise this step' : '',
      skipped: mode === 'skip',
    });
    act(() => form.navigate(1));
    act(() => form.setText('More context'));
    await act(async () => form.advance());
    expect(respond).toHaveBeenCalledTimes(1);
    expect(respond).toHaveBeenCalledWith([
      {
        questionId: 'review',
        selectedOptionIds: [],
        text: mode === 'text' ? 'Please revise this step' : '',
        skipped: mode === 'skip',
      },
      { questionId: 'notes', selectedOptionIds: [], text: 'More context', skipped: false },
    ]);
  },
);

test.each(['adapt', 'keep'])(
  'submits the %s review decision directly without a prior selection',
  async (id) => {
    act(() => renderer.update(<Harness key="review" value={[review]} />));
    await act(async () => form.submit());
    await act(async () => form.respondOption('missing'));
    expect(respond).not.toHaveBeenCalled();
    await act(async () => form.respondOption(id));
    expect(respond).toHaveBeenCalledWith([
      { questionId: 'review', selectedOptionIds: [id], text: '', skipped: false },
    ]);
  },
);

test('locks both review decisions during submission and permits a different decision after failure', async () => {
  act(() => renderer.update(<Harness key="review-retry" value={[review]} />));
  let reject!: (error: Error) => void;
  respond.mockImplementationOnce(
    () =>
      new Promise((_, rejectResponse) => {
        reject = rejectResponse;
      }),
  );
  let submission!: Promise<void>;
  act(() => {
    submission = form.respondOption('adapt');
  });
  expect(form.locked).toBe(true);
  await act(async () => form.respondOption('keep'));
  expect(respond).toHaveBeenCalledTimes(1);
  await act(async () => {
    reject(new Error('Failed'));
    await submission;
  });
  expect(form.locked).toBe(false);
  expect(form.failed).toBe(true);
  await act(async () => form.respondOption('keep'));
  expect(respond).toHaveBeenCalledTimes(2);
  expect(respond).toHaveBeenLastCalledWith([
    { questionId: 'review', selectedOptionIds: ['keep'], text: '', skipped: false },
  ]);
});

test('allows free text when a question shows changes without offering any choices', async () => {
  const question: QuestionFormQuestion = {
    ...questions[2],
    textChanges: [{ before: 'Before', after: 'After', reason: 'Explain the change' }],
  };
  act(() => renderer.update(<Harness key="change-comment" value={[question]} allowSkip={false} />));
  expect(form.isReview).toBe(false);
  act(() => form.setText('Please revise this step'));
  await act(async () => form.submit());
  expect(respond).toHaveBeenCalledWith([
    { questionId: 'notes', selectedOptionIds: [], text: 'Please revise this step', skipped: false },
  ]);
});

test('preserves protocol parameter whitespace when the field requests it', async () => {
  const value: QuestionFormQuestion[] = [
    { ...questions[2], input: { label: 'Code', preserveWhitespace: true } },
  ];
  act(() => renderer.update(<Harness key="literal-parameter" value={value} />));
  act(() => form.setText('  indented code\n'));
  await act(async () => form.submit());
  expect(respond.mock.calls[0][0][0].text).toBe('  indented code\n');
});

test('locks a pending submission, preserves answers on failure, and allows exactly one retry', async () => {
  act(() => form.navigate(2));
  let reject!: (error: Error) => void;
  respond.mockImplementationOnce(
    () =>
      new Promise((_, rejectResponse) => {
        reject = rejectResponse;
      }),
  );
  let submission!: Promise<void>;
  act(() => {
    submission = form.submit();
  });
  expect(form.locked).toBe(true);
  await act(async () => {
    await form.submit();
    form.setText('too late');
  });
  expect(respond).toHaveBeenCalledTimes(1);
  expect(form.answer.text).toBe('');
  await act(async () => {
    reject(new Error('Failed'));
    await submission;
  });
  expect(form.failed).toBe(true);
  expect(form.isComplete).toBe(true);
  await act(async () => form.submit());
  expect(respond).toHaveBeenCalledTimes(2);
  expect(form.locked).toBe(true);
});

test('unlocks drafts without a failure when the response is in flight without a receipt', async () => {
  act(() => form.select('a'));
  act(() => form.navigate(2));
  respond.mockResolvedValueOnce('pending');
  await act(async () => form.submit());
  expect(respond).toHaveBeenCalledTimes(1);
  expect(form.locked).toBe(false);
  expect(form.failed).toBe(false);
  expect(form.answer).toEqual({ selectedOptionIds: [], text: '', skipped: false });
  act(() => form.navigate(0));
  expect(form.answer.selectedOptionIds).toEqual(['a']);
  await act(async () => form.submit());
  expect(respond).toHaveBeenCalledTimes(2);
  expect(respond.mock.calls[1][0]).toEqual(respond.mock.calls[0][0]);
  expect(form.locked).toBe(true);
});

test('replacing a request resets its draft and invalidates its retained submit callback', async () => {
  act(() => form.select('a'));
  act(() => form.navigate(2));
  const staleSubmit = form.submit;
  act(() => {
    renderer.update(<Harness key="replacement" />);
  });
  expect(form.index).toBe(0);
  expect(form.answer.selectedOptionIds).toEqual([]);
  await act(async () => staleSubmit());
  expect(respond).not.toHaveBeenCalled();
});

test('does not edit or submit while the bound response is unavailable', async () => {
  act(() => {
    renderer.update(<Harness disabled />);
  });
  act(() => {
    form.select('a');
    form.setText('no');
    form.skip();
    form.navigate(1);
  });
  await act(async () => form.submit());
  expect(form.index).toBe(0);
  expect(form.answer).toEqual({ selectedOptionIds: [], text: '', skipped: false });
  expect(respond).not.toHaveBeenCalled();
});

test('treats arbitrary question IDs as independent drafts', async () => {
  const value: QuestionFormQuestion[] = ['__proto__', 'constructor'].map((id) => ({
    id,
    question: 'Notes?',
    selection: 'single',
    options: [],
  }));
  act(() => {
    renderer.update(<Harness key="ids" value={value} />);
  });
  act(() => form.setText('First'));
  act(() => form.navigate(1));
  expect(form.answer.text).toBe('');
  act(() => form.setText('Second'));
  await act(async () => form.submit());
  expect(respond).toHaveBeenCalledWith([
    { questionId: '__proto__', selectedOptionIds: [], text: 'First', skipped: false },
    { questionId: 'constructor', selectedOptionIds: [], text: 'Second', skipped: false },
  ]);
});
