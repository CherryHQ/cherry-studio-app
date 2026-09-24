import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ConversationSnapshot, ResourceValue } from '@/frontend/appShell/conversation';
import type { AgentPendingQuestion, AgentUserAnswer } from '@/shared/contracts/agent';

import { ConversationApprovals } from '../ConversationApprovals';
import type { ToolApprovalRespondInput } from '../ToolApprovalSheet';

let questionSheet: {
  request: AgentPendingQuestion | null;
  isOpen: boolean;
  onRespond(id: string, answer: AgentUserAnswer): Promise<void>;
  onCancel(): Promise<void>;
};
jest.mock('../UserQuestionSheet', () => ({
  UserQuestionSheet: (props: typeof questionSheet) => {
    questionSheet = props;
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

it('submits complete question answers through the bound response without reducing them to approval', async () => {
  const test = fixture();
  const questions = [{ question: '目录？', multiple: false, options: [{ label: 'src' }] }];
  test.read.mockResolvedValue({ kind: 'question', questions });
  test.update({
    ...test.snapshot,
    interactions: test.snapshot.interactions.map((item) => ({ ...item, kind: 'question' })),
  });
  await render(test);
  expect(sheet.canRespond).toBe(true);
  await act(async () =>
    sheet.onRespond({ approvalId: 'decision', approved: true, answers: { '目录？': 'src' } }),
  );
  expect(test.respond).toHaveBeenCalledWith({ kind: 'answer', answers: { '目录？': 'src' } });
});

it('preserves option IDs and skipping, and allows retry when a user answer is rejected', async () => {
  const test = fixture();
  test.read.mockResolvedValue({
    kind: 'user-question',
    question: {
      question: 'Choose',
      selection: 'single',
      options: [
        { id: 'a', label: 'Same label', description: '' },
        { id: 'b', label: 'Same label', description: '' },
      ],
    },
  });
  test.update({
    ...test.snapshot,
    interactions: test.snapshot.interactions.map((item) => ({ ...item, kind: 'question' })),
  });
  await render(test);
  const answer = { selectedOptionIds: [], text: '', skipped: true };
  await act(async () => questionSheet.onRespond('decision', answer));
  expect(test.respond).toHaveBeenCalledWith({ kind: 'user-answer', answer });
  test.respond.mockResolvedValueOnce({ state: 'rejected', failure: { code: 'conflict' } } as never);
  await expect(
    questionSheet.onRespond('decision', {
      selectedOptionIds: ['b'],
      text: 'extra',
      skipped: false,
    }),
  ).rejects.toThrow();
  expect(test.respond).toHaveBeenLastCalledWith({
    kind: 'user-answer',
    answer: { selectedOptionIds: ['b'], text: 'extra', skipped: false },
  });
  await expect(questionSheet.onRespond('stale-question', answer)).rejects.toThrow();
  expect(test.respond).toHaveBeenCalledTimes(2);
  test.cancel.mockResolvedValueOnce({ state: 'rejected', failure: { code: 'conflict' } } as never);
  await expect(questionSheet.onCancel()).rejects.toThrow();
});
