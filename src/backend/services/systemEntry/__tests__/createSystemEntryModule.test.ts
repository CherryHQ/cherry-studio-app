import type {
  AgentMessageView,
  AgentSessionObservation,
  AgentSessionStatus,
  AgentSessionView,
  AgentStartSessionInput,
} from '@/shared/contracts/agent';

import type {
  NativeSystemEntry,
  SystemIntegrationNativeModule,
} from '../../../../../modules/system-integration';
import { createSystemEntryModule } from '../createSystemEntryModule';

const id = '42f7f701-37d6-4731-b7a8-8e7f3040be55';
const view: AgentSessionView = {
  id,
  agentId: 'agent',
  executionTarget: { kind: 'local' },
  title: 'Share',
  titleIsManual: false,
  forkBoundaryMessageId: null,
  forkedFromSessionId: null,
  createdAt: '2026-09-16T00:00:00.000Z',
  updatedAt: '2026-09-16T00:00:00.000Z',
};

function setup(kind: 'share.receive' | 'chat.ask' = 'share.receive') {
  let committed: AgentSessionView | null = null;
  const callbacks = new Map<string, (event: { id: string }) => void>();
  const entry: NativeSystemEntry = {
    version: 1,
    id,
    createdAt: Date.now(),
    kind,
    text: 'hello',
    ...(kind === 'share.receive' ? { files: [] } : { replyExpected: true }),
  };
  const native = {
    claimNextEntry: jest.fn(async () => entry),
    completeEntry: jest.fn(async () => {}),
    releaseEntry: jest.fn(async () => {}),
    finishIntent: jest.fn(async () => {}),
    publishAgents: jest.fn(async () => {}),
    addListener: jest.fn((name: string, callback: (event: { id: string }) => void) => {
      callbacks.set(name, callback);
      return { remove: () => callbacks.delete(name) };
    }),
  };
  const dependencies = {
    native: native as unknown as SystemIntegrationNativeModule,
    ensureReady: jest.fn(async (_signal: AbortSignal) => {}),
    getAgent: jest.fn(async () => ({ id: 'agent', name: 'Agent' })),
    listAgents: jest.fn(async () => [{ id: 'agent', name: 'Agent' }]),
    findSession: jest.fn(async () => committed),
    readMessage: jest.fn(async (): Promise<AgentMessageView | null> => null),
    imports: {
      import: jest.fn(async () => []),
      discard: jest.fn(async () => {}),
      forget: jest.fn(),
      cleanExpired: jest.fn(async () => {}),
    },
    agent: {
      startSession: jest.fn(
        async (_input: AgentStartSessionInput, _options?: { signal?: AbortSignal }) => {
          committed = view;
          return view;
        },
      ),
      getSessionStatus: jest.fn((): AgentSessionStatus | null => null),
      cancelTurn: jest.fn(async () => {}),
      observeSession: jest.fn(
        async (): Promise<AgentSessionObservation> => ({
          snapshot: {
            activeTurn: null,
            streamingMessage: null,
          } as AgentSessionObservation['snapshot'],
          unsubscribe: jest.fn(),
        }),
      ),
    },
  };
  const runtime = createSystemEntryModule(dependencies);
  return {
    runtime,
    dependencies,
    native,
    callbacks,
    commit: () => {
      committed = view;
    },
  };
}

test('a share never imports or sends before explicit confirmation, and repeated confirmation creates one chat', async () => {
  const { runtime, dependencies, native } = setup();
  const session = (await runtime.module.claimNext())!;
  expect(dependencies.agent.startSession).not.toHaveBeenCalled();
  expect(dependencies.imports.import).not.toHaveBeenCalled();
  const first = session.submit('agent');
  const second = session.submit('agent');
  expect(second).toBe(first);
  await first;
  expect(dependencies.agent.startSession).toHaveBeenCalledTimes(1);
  expect(native.completeEntry).toHaveBeenCalledWith(id);
  await session.settled;
  await runtime.dispose();
});

test('a lost native acknowledgement recovers the committed chat without importing or sending again', async () => {
  const { runtime, dependencies, native, commit } = setup();
  commit();
  const session = (await runtime.module.claimNext())!;
  expect(await session.submit('agent')).toEqual({ sessionId: id });
  expect(dependencies.agent.startSession).not.toHaveBeenCalled();
  expect(dependencies.imports.import).not.toHaveBeenCalled();
  expect(native.completeEntry).toHaveBeenCalledWith(id);
  await runtime.dispose();
});

test('an invalid entry does not block the next valid share in the same foreground pass', async () => {
  const { runtime, native } = setup();
  const rejectedId = '6720369c-029e-42f1-9d41-89f2873dbe5a';
  native.claimNextEntry.mockResolvedValueOnce({
    version: 1,
    id: rejectedId,
    createdAt: Date.now(),
    kind: 'share.receive',
    text: '',
    files: [],
  });
  const session = await runtime.module.claimNext();
  expect(session?.action).toMatchObject({ kind: 'share.receive', text: 'hello' });
  expect(native.completeEntry).toHaveBeenCalledWith(rejectedId);
  await runtime.dispose();
});

test('native cancellation aborts an ask before admission without ever starting a turn', async () => {
  const { runtime, dependencies, callbacks } = setup('chat.ask');
  let ready!: () => void;
  const waiting = new Promise<void>((resolve) => {
    ready = resolve;
  });
  dependencies.ensureReady.mockImplementation(async (signal) => {
    ready();
    await new Promise<void>((_resolve, reject) =>
      signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }),
    );
  });
  const session = (await runtime.module.claimNext())!;
  const submission = session.submit('agent');
  const rejection = expect(submission).rejects.toThrow('System entry submission failed');
  await waiting;
  callbacks.get('onIntentCancelled')!({ id });
  await rejection;
  expect(dependencies.agent.startSession).not.toHaveBeenCalled();
  await runtime.dispose();
});

test('a response completed before observation is still returned to the native caller', async () => {
  const { runtime, dependencies, native } = setup('chat.ask');
  dependencies.agent.getSessionStatus.mockReturnValue({ turnId: 'turn', status: 'completed' });
  dependencies.readMessage.mockResolvedValue({
    role: 'assistant',
    parts: [{ type: 'text', id: 'part', text: 'Answer' }],
  } as AgentMessageView);
  const session = (await runtime.module.claimNext())!;
  await session.submit('agent');
  await session.settled;
  expect(native.finishIntent).toHaveBeenCalledWith(id, { status: 'succeeded', text: 'Answer' });
  await runtime.dispose();
});
