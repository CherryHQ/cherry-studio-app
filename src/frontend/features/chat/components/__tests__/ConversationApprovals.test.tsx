import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ConversationSnapshot, ResourceValue } from '@/frontend/appShell/conversation';

import { ConversationApprovals } from '../ConversationApprovals';
import { ConversationQuestionComposer } from '../ConversationQuestionComposer';
import type { ToolApprovalRespondInput } from '../ToolApprovalSheet';
import type {
  QuestionFormAnswer,
  QuestionFormQuestion,
} from '../UserQuestionComposer/useUserQuestionForm';

let questionComposer:
  | {
      questions: readonly QuestionFormQuestion[];
      allowSkip: boolean;
      disabled: boolean;
      onRespond(answers: QuestionFormAnswer[]): Promise<'applied' | 'pending'>;
    }
  | undefined;
jest.mock('../UserQuestionComposer', () => ({
  UserQuestionComposer: (props: typeof questionComposer) => {
    questionComposer = props;
    return null;
  },
}));
const mockToast = jest.fn();
let sheet: {
  canRespond: boolean;
  onRespond(input: ToolApprovalRespondInput): Promise<void>;
  onCancel?(): Promise<void>;
  approvals: { approvalId: string; input: unknown }[];
};
jest.mock('@cherrystudio/ui/components', () => ({
  ContentState: { Loading: () => null, Error: () => null },
  useToast: () => ({ toast: { show: mockToast } }),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('../ToolApprovalSheet', () => ({
  ToolApprovalSheet: (props: typeof sheet) => {
    sheet = props;
    return null;
  },
}));

let renderer: ReactTestRenderer;
let queryClient: QueryClient;
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
function fixture() {
  const respond = jest.fn(async () => ({
    state: 'pending' as const,
    operationId: 'command' as never,
  }));
  const cancel = jest.fn(async () => ({ state: 'applied' as const, value: undefined }));
  const read = jest.fn(
    async (_signal: AbortSignal): Promise<ResourceValue> => ({
      kind: 'json' as const,
      complete: true as const,
      value: { path: '/approved' },
    }),
  );
  let snapshot: ConversationSnapshot = {
    title: '',
    freshness: { state: 'current' },
    liveMessages: [],
    interactions: [
      {
        id: 'decision',
        kind: 'decision',
        title: 'Write file',
        state: 'pending',
        input: { kind: 'deferred', key: 'input', read },
        respond: { availability: { state: 'enabled' }, execute: respond },
      },
    ],
    executions: [
      {
        id: 'execution',
        state: 'awaiting-approval',
        cancel: { availability: { state: 'enabled' }, execute: cancel },
      },
    ],
  };
  return {
    respond,
    cancel,
    read,
    get snapshot() {
      return snapshot;
    },
    update(next: ConversationSnapshot) {
      snapshot = next;
    },
  };
}
async function render(test: ReturnType<typeof fixture>) {
  await act(async () => {
    const tree = (
      <QueryClientProvider client={queryClient}>
        <ConversationApprovals snapshot={test.snapshot} />
        <ConversationQuestionComposer snapshot={test.snapshot} />
      </QueryClientProvider>
    );
    if (renderer) renderer.update(tree);
    else renderer = create(tree);
    await settle();
  });
  await act(settle);
}
beforeEach(() => {
  jest.clearAllMocks();
  questionComposer = undefined;
  sheet = undefined!;
  queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } });
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined!;
  queryClient.clear();
});

it('responds only to the bound loaded decision and treats an accepted pending receipt as pending', async () => {
  const test = fixture();
  await render(test);
  expect(sheet.canRespond).toBe(true);
  expect(sheet.approvals[0].input).toEqual({ path: '/approved' });
  await act(async () => sheet.onRespond({ approvalId: 'stale-decision', approved: true }));
  expect(test.respond).not.toHaveBeenCalled();
  await act(async () => sheet.onRespond({ approvalId: 'decision', approved: true }));
  expect(test.respond).toHaveBeenCalledWith({ kind: 'approve' });
  expect(mockToast).not.toHaveBeenCalled();
  await act(async () => sheet.onCancel!());
  expect(test.cancel).toHaveBeenCalledWith(undefined);
});

it('retirement removes sensitive resource values and cancels outstanding reads', async () => {
  const test = fixture();
  await render(test);
  expect(
    queryClient
      .getQueryCache()
      .findAll()
      .some((query) => query.state.data),
  ).toBe(true);
  await act(async () =>
    test.update({
      ...test.snapshot,
      freshness: { state: 'retired' },
      interactions: [],
      executions: [],
    }),
  );
  await render(test);
  expect(sheet.approvals).toEqual([]);
  expect(
    queryClient
      .getQueryCache()
      .findAll()
      .every((query) => !query.state.data),
  ).toBe(true);
});

it('cannot approve before the full input is read and aborts that read on release', async () => {
  const test = fixture();
  test.read.mockImplementation(() => new Promise(() => {}));
  await render(test);
  expect(sheet.canRespond).toBe(false);
  await act(async () => sheet.onRespond({ approvalId: 'decision', approved: false }));
  expect(test.respond).not.toHaveBeenCalled();
  const signal = test.read.mock.calls[0][0];
  await act(async () => renderer.unmount());
  renderer = undefined!;
  expect(signal.aborted).toBe(true);
});

it('cancels only the execution bound to the displayed approval', async () => {
  const test = fixture();
  const otherCancel = jest.fn();
  test.update({
    ...test.snapshot,
    interactions: test.snapshot.interactions.map((item) => ({
      ...item,
      execution: 'execution',
    })),
    executions: [
      ...test.snapshot.executions,
      {
        id: 'other',
        state: 'running',
        cancel: { availability: { state: 'enabled' }, execute: otherCancel },
      },
    ],
  });
  await render(test);
  await act(async () => sheet.onCancel!());
  expect(test.cancel).toHaveBeenCalledTimes(1);
  expect(otherCancel).not.toHaveBeenCalled();
});

it('presents a desktop question form in the composer and returns text-keyed answers', async () => {
  const test = fixture();
  const questions = [
    {
      question: '目录？',
      header: 'Workspace',
      multiple: true,
      options: [{ label: 'src', description: 'Sources' }, { label: 'docs' }],
    },
  ];
  test.read.mockResolvedValue({ kind: 'question', questions });
  test.update({
    ...test.snapshot,
    interactions: test.snapshot.interactions.map((item) => ({ ...item, kind: 'question' })),
  });
  await render(test);
  expect(sheet.approvals).toEqual([]);
  expect(questionComposer?.allowSkip).toBe(false);
  expect(questionComposer?.disabled).toBe(false);
  expect(questionComposer?.questions).toEqual([
    {
      id: '目录？',
      header: 'Workspace',
      question: '目录？',
      selection: 'multiple',
      options: [
        { id: 'src', label: 'src', description: 'Sources' },
        { id: 'docs', label: 'docs', description: undefined },
      ],
    },
  ]);
  await act(async () =>
    questionComposer!.onRespond([
      {
        questionId: '目录？',
        selectedOptionIds: ['src', 'docs'],
        text: 'and tests',
        skipped: false,
      },
    ]),
  );
  expect(test.respond).toHaveBeenCalledWith({
    kind: 'answer',
    answers: { '目录？': 'src, docs, and tests' },
  });
});

it('shows a retryable state while a deferred question form cannot be read', async () => {
  const test = fixture();
  test.read.mockRejectedValueOnce(new Error('offline'));
  test.update({
    ...test.snapshot,
    interactions: test.snapshot.interactions.map((item) => ({ ...item, kind: 'question' })),
  });
  await render(test);
  expect(questionComposer).toBeUndefined();
  expect(sheet.approvals).toEqual([]);
  expect(test.read).toHaveBeenCalledTimes(1);
});

it('preserves option IDs and skipping, and allows retry when a user answer is rejected', async () => {
  const test = fixture();
  const input: ResourceValue = {
    kind: 'user-question',
    question: {
      questions: [
        {
          id: 'choice',
          question: 'Choose',
          selection: 'single',
          options: [
            { id: 'a', label: 'Same label' },
            { id: 'b', label: 'Same label' },
          ],
        },
      ],
    },
  };
  test.update({
    ...test.snapshot,
    interactions: test.snapshot.interactions.map((item) => ({
      ...item,
      kind: 'question',
      input: { kind: 'inline', value: input },
    })),
  });
  await render(test);
  expect(test.read).not.toHaveBeenCalled();
  expect(questionComposer?.allowSkip).toBe(true);
  expect(questionComposer?.questions).toBe(input.question.questions);
  const answer = [{ questionId: 'choice', selectedOptionIds: [], text: '', skipped: true }];
  const edited = [
    { questionId: 'choice', selectedOptionIds: ['b'], text: 'extra', skipped: false },
  ];
  // The fixture's response has no receipt yet, so the form must stay editable for a resubmission.
  await expect(questionComposer!.onRespond(answer)).resolves.toBe('pending');
  expect(test.respond).toHaveBeenCalledWith({ kind: 'user-answer', answer: { answers: answer } });
  test.respond.mockResolvedValueOnce({ state: 'applied', value: undefined } as never);
  await expect(questionComposer!.onRespond(answer)).resolves.toBe('applied');
  test.respond.mockResolvedValueOnce({ state: 'rejected', failure: { code: 'conflict' } } as never);
  await expect(questionComposer!.onRespond(edited)).rejects.toThrow();
  expect(test.respond).toHaveBeenLastCalledWith({
    kind: 'user-answer',
    answer: { answers: edited },
  });
  expect(test.respond).toHaveBeenCalledTimes(3);
});

it('keeps the question visible but blocks responses while an approval takes priority', async () => {
  const test = fixture();
  const question = {
    ...test.snapshot.interactions[0],
    id: 'question',
    kind: 'question' as const,
    input: {
      kind: 'inline' as const,
      value: {
        kind: 'user-question' as const,
        question: {
          questions: [
            { id: 'notes', question: 'Notes?', selection: 'single' as const, options: [] },
          ],
        },
      },
    },
  };
  test.update({ ...test.snapshot, interactions: [question] });
  await render(test);
  const questions = questionComposer!.questions;
  expect(questionComposer?.disabled).toBe(false);
  expect(sheet.approvals).toEqual([]);
  const approval = {
    ...question,
    id: 'approval',
    kind: 'decision' as const,
    input: { kind: 'deferred' as const, key: 'approval', read: test.read },
  };
  test.update({ ...test.snapshot, interactions: [approval, question] });
  await render(test);
  expect(sheet.approvals.map((item) => item.approvalId)).toEqual(['approval']);
  expect(questionComposer?.questions).toBe(questions);
  expect(questionComposer?.disabled).toBe(true);
  await expect(
    questionComposer!.onRespond([
      { questionId: 'notes', selectedOptionIds: [], text: 'Answer', skipped: false },
    ]),
  ).rejects.toThrow();
  expect(test.respond).not.toHaveBeenCalled();
  test.update({ ...test.snapshot, interactions: [question] });
  await render(test);
  expect(questionComposer?.disabled).toBe(false);
});
