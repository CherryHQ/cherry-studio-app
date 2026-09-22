import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type {
  ConversationSession,
  ConversationSnapshot,
  ResourceRef,
} from '@/frontend/appShell/conversation';

import { ConversationApprovals } from '../ConversationApprovals';
import type { ToolApprovalRespondInput } from '../ToolApprovalSheet';

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
  const read = jest.fn(async (_ref: ResourceRef, _signal: AbortSignal) => ({
    kind: 'json' as const,
    complete: true as const,
    value: { path: '/approved' },
  }));
  let snapshot: ConversationSnapshot = {
    title: '',
    freshness: { state: 'current' },
    liveMessages: [],
    actions: {
      inputPolicy: { attachments: false, modelSelection: false, pluginReferences: false },
    },
    interactions: [
      {
        ref: 'decision' as never,
        kind: 'decision',
        title: 'Write file',
        state: 'pending',
        input: 'input' as ResourceRef,
        respond: { availability: { state: 'enabled' }, execute: respond },
      },
    ],
    executions: [
      {
        ref: 'execution' as never,
        state: 'awaiting-approval',
        cancel: { availability: { state: 'enabled' }, execute: cancel },
      },
    ],
  };
  const listeners = new Set<() => void>();
  const session = {
    scope: 'scope',
    ref: { source: { kind: 'desktop', connectionId: 'desktop' }, sessionId: 'session' },
    state: {
      getSnapshot: () => snapshot,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    resources: { read },
  } as unknown as ConversationSession;
  return {
    session,
    respond,
    cancel,
    read,
    get snapshot() {
      return snapshot;
    },
    update(next: ConversationSnapshot) {
      snapshot = next;
      for (const listener of listeners) listener();
    },
  };
}
async function render(test: ReturnType<typeof fixture>) {
  await act(async () => {
    const tree = (
      <QueryClientProvider client={queryClient}>
        <ConversationApprovals session={test.session} snapshot={test.snapshot} />
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
  expect(test.respond).toHaveBeenCalledWith('approve');
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
  const signal = test.read.mock.calls[0][1];
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
      execution: 'execution' as never,
    })),
    executions: [
      ...test.snapshot.executions,
      {
        ref: 'other' as never,
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
