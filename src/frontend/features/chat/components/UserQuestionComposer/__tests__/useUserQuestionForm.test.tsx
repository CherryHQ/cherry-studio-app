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

test('keeps single-choice, multi-choice and text drafts editable until explicit batch submission', async () => {
  act(() => form.select('a'));
  expect(form.index).toBe(0);
  await act(async () => form.submit());
  expect(respond).not.toHaveBeenCalled();
  act(() => form.navigate(1));
  act(() => {
    form.select('a');
    form.select('b');
  });
  act(() => form.navigate(2));
  act(() => form.setText(' No car '));
  act(() => form.navigate(0));
  expect(form.answer.selectedOptionIds).toEqual(['a']);
  act(() => form.select('b'));
  act(() => form.navigate(1));
  expect(form.answer.selectedOptionIds).toEqual(['a', 'b']);
  expect(form.isComplete).toBe(true);
  expect(respond).not.toHaveBeenCalled();
  await act(async () => form.submit());
  expect(respond).toHaveBeenCalledWith([
    { questionId: 'city', selectedOptionIds: ['b'], text: '', skipped: false },
    { questionId: 'activities', selectedOptionIds: ['a', 'b'], text: '', skipped: false },
    { questionId: 'notes', selectedOptionIds: [], text: 'No car', skipped: false },
  ]);
});

test('skips only the current question, never auto-submits, and clears skip when editing again', async () => {
  act(() => form.select('a'));
  act(() => form.setText('discard this'));
  act(() => form.skip());
  expect(form.index).toBe(1);
  act(() => form.skip());
  act(() => form.skip());
  expect(form.index).toBe(2);
  expect(form.isComplete).toBe(true);
  expect(respond).not.toHaveBeenCalled();
  act(() => form.navigate(0));
  expect(form.answer).toEqual({ selectedOptionIds: [], text: '', skipped: true });
  act(() => form.select('b'));
  expect(form.answer.skipped).toBe(false);
  await act(async () => form.submit());
  expect(respond.mock.calls[0][0]).toMatchObject([
    { questionId: 'city', skipped: false },
    { questionId: 'activities', skipped: true },
    { questionId: 'notes', skipped: true },
  ]);
});

test('ignores skip when the request requires every answer', async () => {
  act(() => {
    renderer.update(<Harness key="required" allowSkip={false} />);
  });
  expect(form.allowSkip).toBe(false);
  act(() => form.skip());
  expect(form.index).toBe(0);
  expect(form.answer.skipped).toBe(false);
  expect(form.isComplete).toBe(false);
  await act(async () => form.submit());
  expect(respond).not.toHaveBeenCalled();
});

test('locks a pending submission, preserves answers on failure, and allows exactly one retry', async () => {
  act(() => form.skip());
  act(() => form.skip());
  act(() => form.skip());
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
  act(() => form.navigate(1));
  act(() => form.skip());
  act(() => form.skip());
  respond.mockResolvedValueOnce('pending');
  await act(async () => form.submit());
  expect(respond).toHaveBeenCalledTimes(1);
  expect(form.locked).toBe(false);
  expect(form.failed).toBe(false);
  expect(form.answer).toEqual({ selectedOptionIds: [], text: '', skipped: true });
  act(() => form.navigate(0));
  expect(form.answer.selectedOptionIds).toEqual(['a']);
  await act(async () => form.submit());
  expect(respond).toHaveBeenCalledTimes(2);
  expect(respond.mock.calls[1][0]).toEqual(respond.mock.calls[0][0]);
  expect(form.locked).toBe(true);
});

test('replacing a request resets its draft and invalidates its retained submit callback', async () => {
  act(() => form.skip());
  act(() => form.skip());
  act(() => form.skip());
  const staleSubmit = form.submit;
  act(() => {
    renderer.update(<Harness key="replacement" />);
  });
  expect(form.index).toBe(0);
  expect(form.isComplete).toBe(false);
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
