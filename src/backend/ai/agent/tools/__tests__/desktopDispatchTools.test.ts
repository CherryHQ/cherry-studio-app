import type {
  RemoteAgentSource,
  RemoteSessionSnapshot,
  RemoteSourceState,
} from '@/shared/contracts/remoteAgent';
import type { DesktopConnection } from '@/shared/data/types/desktopConnection';
import {
  DESKTOP_DISPATCH_MAX_ATTACHMENTS,
  DESKTOP_DISPATCH_MAX_TEXT_LENGTH,
  DesktopDispatchApprovalInputSchema,
  DesktopDispatchResultSchema,
  type DesktopDispatchSessionRef,
} from '@/shared/data/types/desktopDispatchTool';
import { FileEntryIdSchema, FileEntrySchema } from '@/shared/data/types/file';

import type { ManagedFileFact, ManagedFileResolver } from '../../resources/managedFileResolver';
import type { RuntimeJsonValue } from '../../runtime';
import { createDesktopDispatchTools, type DesktopDispatchAccess } from '../desktopDispatchTools';
import { WorkspaceFileAccess } from '../workspaceFileAccess';

const TARGET = {
  connectionId: 'pc',
  agentId: 'agent',
  workspace: { kind: 'registered', id: 'repo' },
} as const;
const INPUT = {
  connection_id: TARGET.connectionId,
  agent_id: TARGET.agentId,
  workspace: { ...TARGET.workspace, name: 'Unverified name' },
  title: ' Review notes ',
  text: ' Read the report. ',
};
const FILE_IDS = Array.from({ length: DESKTOP_DISPATCH_MAX_ATTACHMENTS + 1 }, (_, index) =>
  FileEntryIdSchema.parse(`00000000-0000-7000-8000-00000000000${index + 1}`),
);
const SPILL_ID = FILE_IDS.at(-1)!;
const CONNECTION: DesktopConnection = {
  id: 'pc',
  name: 'Work desktop',
  defaultName: 'Mac',
  status: 'paired',
  capabilities: ['agent'],
  alias: 'Work desktop',
  configuredEndpoints: [],
  lastFetchedAt: null,
};
const SESSION = {
  id: 'session',
  agentId: 'agent',
  workspaceId: 'repo',
  title: 'Review notes',
  updatedAt: '',
  historyVersion: 'rev',
};
const LIVE_SNAPSHOT: RemoteSessionSnapshot = {
  current: true,
  session: SESSION,
  messages: [
    {
      id: 'reply',
      version: '1',
      role: 'assistant',
      state: 'streaming',
      parts: [
        {
          id: 'text',
          kind: 'text',
          text: '',
          complete: false,
          state: 'streaming',
          resource: 'reply-text',
        },
        { id: 'tool', kind: 'tool', name: 'inspect', callId: 'call', state: 'input-ready' },
      ],
    },
  ],
  executions: [{ id: 'run', messageId: 'reply', state: 'awaiting-approval' }],
  interactions: [
    { id: 'approval', title: 'Read project', state: 'pending', input: 'approval-input' },
  ],
};

function fixture(initialDispatchedSessions: DesktopDispatchSessionRef[] = []) {
  const list = jest.fn(async () => ({ items: [CONNECTION], total: 1 }));
  const getById = jest.fn(async (_id: string) => CONNECTION);
  const get = jest.fn().mockResolvedValue(TARGET);
  const set = jest.fn().mockResolvedValue(undefined);
  const createTextArtifact = jest.fn(
    async ({ name, data, mediaType }: { name: string; data: string; mediaType: string }) =>
      FileEntrySchema.parse({
        id: SPILL_ID,
        filename: name,
        size: data.length,
        mediaType,
        provenance: 'generated',
        createdAt: 1,
        updatedAt: 1,
      }),
  );
  const unobserve = jest.fn();
  const source = {
    getState: jest.fn((): RemoteSourceState => ({ status: 'ready', attachments: true })),
    listAgents: jest.fn(
      async (): ReturnType<RemoteAgentSource['listAgents']> => ({
        items: [
          {
            id: 'agent',
            name: 'Desktop Agent',
            emoji: '🍒',
            model: { modelId: 'model', providerId: 'provider', name: 'Model' },
          },
        ],
        next: 'agent-next',
      }),
    ),
    listWorkspaces: jest.fn(async () => ({
      items: [{ id: 'repo', name: 'Repository' }],
      systemWorkspace: true,
      next: 'workspace-next',
    })),
    start: jest.fn(
      async (
        input: Parameters<RemoteAgentSource['start']>[0],
      ): ReturnType<RemoteAgentSource['start']> => ({
        ...input,
        id: 'operation',
        sessionId: 'session',
        status: 'applied',
      }),
    ),
    readSession: jest.fn(async () => SESSION),
    history: jest.fn(async (): ReturnType<RemoteAgentSource['history']> => ({ items: [] })),
    readResource: jest.fn(
      async (): ReturnType<RemoteAgentSource['readResource']> => ({
        kind: 'text',
        text: `prefix ${'x'.repeat(2000)}`,
      }),
    ),
    observe: jest.fn((_id: string, listener: (snapshot: RemoteSessionSnapshot) => void) => {
      listener(LIVE_SNAPSHOT);
      return unobserve;
    }),
    getStarts: () => [],
    getDispatch: jest.fn<
      ReturnType<RemoteAgentSource['getDispatch']>,
      Parameters<RemoteAgentSource['getDispatch']>
    >(() => undefined),
    getCommands: () => [],
    dispose: jest.fn(),
  };
  const open = jest.fn(async () => source as unknown as RemoteAgentSource);
  const access: DesktopDispatchAccess = {
    connections: { list, getById },
    preference: { get, set },
    remoteAgent: { open },
    createTextArtifact,
  };
  const availableFiles = new Map<string, ManagedFileFact>(
    FILE_IDS.slice(0, 8).map((id, index) => [
      id,
      {
        fileEntryId: id,
        mediaType: 'text/plain',
        name: `notes-${index + 1}.txt`,
        revision: 1,
        size: 1,
      },
    ]),
  );
  const turnResources = {
    availableFiles,
    fileEntryIds: new Set(availableFiles.keys()),
    draftFileEntryIds: new Set<string>(),
    grantFile: jest.fn(),
  };
  const fileAccess = new WorkspaceFileAccess(null, turnResources);
  const resolveAvailable = jest.fn(async () => availableFiles);
  const files: ManagedFileResolver = {
    resolveAvailable,
    readAsBytes: jest.fn(),
    readAsDataUrl: jest.fn(),
    readDocumentText: jest.fn(),
    readImageText: jest.fn(),
  };
  const tools = createDesktopDispatchTools(access, fileAccess, files, initialDispatchedSessions, {
    availableFiles,
    localSessionId: 'local-session',
  });
  const tool = (id: string) => tools.find((item) => item.providerName === `desktop_${id}`)!;
  const run = (id: string, input: RuntimeJsonValue = {}) =>
    tool(id).execute({
      input,
      signal: new AbortController().signal,
      toolCallId: 'tool',
      turnId: 'turn',
    });
  return {
    run,
    tool,
    list,
    getById,
    get,
    set,
    createTextArtifact,
    source,
    open,
    resolveAvailable,
    unobserve,
  };
}

it('publishes readback parameters as a strict object schema', () => {
  expect(fixture().tool('read_session').inputSchema).toEqual({
    type: 'object',
    properties: {
      connection_id: { type: 'string', minLength: 1 },
      session_id: { type: 'string', minLength: 1 },
      draft_id: { type: 'string', minLength: 1 },
    },
    required: ['connection_id'],
    additionalProperties: false,
  });
});

it('rejects malformed readback parameters before looking up a device or dialing', async () => {
  const test = fixture([
    { connectionId: 'pc', sessionId: 'session' },
    { connectionId: 'pc', draftId: 'draft', operationId: 'operation' },
  ]);
  const inputs: RuntimeJsonValue[] = [
    { connection_id: 'pc' },
    { connection_id: 'pc', session_id: 'session', draft_id: 'draft' },
    { connection_id: 'pc', session_id: '' },
    { connection_id: 'pc', draft_id: '' },
    { session_id: 'session' },
    { connection_id: 'pc', session_id: 'session', operation_id: 'operation' },
  ];
  for (const input of inputs) {
    expect((await test.run('read_session', input)).value).toMatchObject({
      status: 'error',
      error: 'INVALID_INPUT',
    });
  }
  expect(test.getById).not.toHaveBeenCalled();
  expect(test.open).not.toHaveBeenCalled();
});

it('reuses the approved call identity and reads an exact draft receipt before and after Session creation', async () => {
  const test = fixture();
  test.source.start.mockImplementationOnce(async (input) => ({
    ...input,
    id: 'operation',
    status: 'pending',
  }));
  const pending = DesktopDispatchResultSchema.parse((await test.run('dispatch_task', INPUT)).value);
  expect(pending).toMatchObject({
    status: 'pending_confirmation',
    localSessionId: 'local-session',
  });
  const draftId = pending.draftId!;
  const receipt = { id: 'operation', draftId, status: 'pending' as const };
  test.source.getDispatch.mockReturnValue(receipt);
  expect((await test.run('dispatch_task', INPUT)).value).toMatchObject({
    draftId,
    operationId: 'operation',
  });
  expect(test.source.start).toHaveBeenCalledTimes(1);

  const nextTurn = fixture([{ connectionId: 'pc', draftId, operationId: 'operation' }]);
  nextTurn.source.getDispatch.mockReturnValue(receipt);
  expect(
    (await nextTurn.run('read_session', { connection_id: 'pc', draft_id: 'other' })).value,
  ).toMatchObject({ status: 'forbidden' });
  expect(nextTurn.open).not.toHaveBeenCalled();
  expect(
    (await nextTurn.run('read_session', { connection_id: 'pc', draft_id: draftId })).value,
  ).toMatchObject({ status: 'pending_confirmation', draftId });
  expect(nextTurn.source.getDispatch).toHaveBeenCalledWith(draftId, 'operation');
  expect(nextTurn.source.observe).not.toHaveBeenCalled();

  nextTurn.source.getDispatch.mockReturnValue({
    ...receipt,
    status: 'applied',
    sessionId: 'session',
  });
  expect(
    (await nextTurn.run('read_session', { connection_id: 'pc', draft_id: draftId })).value,
  ).toMatchObject({ status: 'ok', sessionId: 'session' });
  expect(nextTurn.source.observe).toHaveBeenCalledWith('session', expect.any(Function));
});

it('lists paired Agent devices and the validated last target using only local metadata', async () => {
  const test = fixture();
  test.list.mockResolvedValue({
    items: [
      CONNECTION,
      { ...CONNECTION, id: 'unpaired', status: 'needs-repair' },
      { ...CONNECTION, id: 'no-agent', capabilities: ['configuration'] },
    ],
    total: 3,
  });
  expect((await test.run('list_devices')).value).toEqual({
    devices: [
      {
        connectionId: 'pc',
        name: 'Work desktop',
        defaultName: 'Mac',
        capabilities: ['agent'],
        isLastTarget: true,
      },
    ],
    lastTarget: TARGET,
  });
  test.get.mockResolvedValueOnce({ ...TARGET, agentId: '' });
  expect((await test.run('list_devices')).value).toMatchObject({
    lastTarget: null,
    devices: [{ isLastTarget: false }],
  });
  expect(test.open).not.toHaveBeenCalled();
});

it('paginates Agent and workspace discovery and disposes sources even when a request fails', async () => {
  const test = fixture();
  expect(
    (await test.run('list_agents', { connection_id: 'pc', cursor: 'agents' })).value,
  ).toMatchObject({
    agents: [{ id: 'agent', emoji: '🍒', modelName: 'Model' }],
    nextCursor: 'agent-next',
  });
  expect(test.source.listAgents).toHaveBeenCalledWith('agents', expect.any(AbortSignal));
  expect(
    (
      await test.run('list_workspaces', {
        connection_id: 'pc',
        agent_id: 'agent',
        cursor: 'workspaces',
      })
    ).value,
  ).toMatchObject({
    workspaces: [{ id: 'repo', name: 'Repository' }],
    nextCursor: 'workspace-next',
    supportsSystemWorkspace: true,
  });
  expect(test.source.listWorkspaces).toHaveBeenCalledWith(
    'agent',
    'workspaces',
    expect.any(AbortSignal),
  );
  test.source.listAgents.mockRejectedValueOnce(
    Object.assign(new Error('unreachable'), { code: 'CONNECTION_LOST' }),
  );
  expect((await test.run('list_agents', { connection_id: 'pc' })).value).toMatchObject({
    status: 'error',
    error: 'CONNECTION_LOST',
  });
  expect(test.source.dispose).toHaveBeenCalledTimes(3);
});

it('rejects stale or missing Agent grants before opening any connection', async () => {
  const test = fixture();
  test.getById.mockResolvedValue({ ...CONNECTION, capabilities: ['configuration'] });
  expect(
    (await test.run('list_workspaces', { connection_id: 'pc', agent_id: 'agent' })).value,
  ).toMatchObject({ status: 'error', error: 'DESKTOP_NOT_PAIRED' });
  expect((await test.run('dispatch_task', INPUT)).value).toMatchObject({
    status: 'rejected',
    error: 'DESKTOP_NOT_PAIRED',
  });
  expect(test.open).not.toHaveBeenCalled();
});

it('validates input and attachment scope before dialing', async () => {
  const test = fixture();
  for (const input of [
    { ...INPUT, title: '  ' },
    { ...INPUT, text: ' ' },
    { ...INPUT, title: 'x'.repeat(201) },
    { ...INPUT, file_entry_ids: FILE_IDS },
    { ...INPUT, file_entry_ids: ['invalid-id'] },
    { ...INPUT, workspace: { kind: 'system', id: 'repo' } },
  ]) {
    expect((await test.run('dispatch_task', input)).value).toMatchObject({
      status: 'error',
      error: 'INVALID_INPUT',
    });
  }
  expect(
    (await test.run('dispatch_task', { ...INPUT, file_entry_ids: [SPILL_ID] })).value,
  ).toMatchObject({ status: 'rejected', error: 'ATTACHMENT_UNAVAILABLE' });
  test.resolveAvailable.mockResolvedValueOnce(new Map());
  expect(
    (await test.run('dispatch_task', { ...INPUT, file_entry_ids: [FILE_IDS[0]] })).value,
  ).toMatchObject({ status: 'rejected', error: 'ATTACHMENT_UNAVAILABLE' });
  expect(test.open).not.toHaveBeenCalled();
});

it('shows synchronous approval details based on discovery and turn file facts', async () => {
  const test = fixture();
  await test.run('list_agents', { connection_id: 'pc' });
  await test.run('list_workspaces', { connection_id: 'pc', agent_id: 'agent' });
  const dispatch = test.tool('dispatch_task');
  const approval = dispatch.approvalInput!({
    ...INPUT,
    file_entry_ids: [FILE_IDS[0], FILE_IDS[0]],
  });
  expect(DesktopDispatchApprovalInputSchema.parse(approval)).toEqual({
    ...TARGET,
    workspace: INPUT.workspace,
    connectionName: 'Work desktop',
    agentName: 'Desktop Agent',
    workspaceName: 'Repository',
    title: 'Review notes',
    text: 'Read the report.',
    textCharLength: 16,
    attachments: [{ fileEntryId: FILE_IDS[0], name: 'notes-1.txt', mediaType: 'text/plain' }],
  });
  expect(dispatch.inputPreview).toEqual({ textField: 'title', nameField: 'connection_id' });
  expect(dispatch).toMatchObject({
    approval: 'ask',
    autoApprovalEligible: false,
    deferred: true,
    effect: 'write',
  });
});

it('spills the complete oversized UTF-16 brief after negotiating attachments', async () => {
  const test = fixture();
  test.source.getState
    .mockReturnValueOnce({ status: 'ready' })
    .mockReturnValueOnce({ status: 'ready' });
  const text = '🍒'.repeat(DESKTOP_DISPATCH_MAX_TEXT_LENGTH / 2 + 1);
  const output = await test.run('dispatch_task', {
    ...INPUT,
    text,
    file_entry_ids: [FILE_IDS[0], FILE_IDS[0]],
  });
  expect(test.source.listAgents).toHaveBeenCalledWith(undefined, expect.any(AbortSignal));
  expect(test.resolveAvailable).toHaveBeenCalledWith([FILE_IDS[0]]);
  expect(test.createTextArtifact).toHaveBeenCalledWith(
    { name: 'task-brief.md', data: text, mediaType: 'text/markdown' },
    expect.any(AbortSignal),
  );
  const [sent] = test.source.start.mock.calls[0];
  expect(sent).toMatchObject({
    workspace: TARGET.workspace,
    title: 'Review notes',
    attachments: [{ fileEntryId: FILE_IDS[0] }, { fileEntryId: SPILL_ID }],
  });
  expect(sent.text).toContain('task-brief.md');
  expect(sent.text.length).toBeLessThanOrEqual(DESKTOP_DISPATCH_MAX_TEXT_LENGTH);
  expect(DesktopDispatchResultSchema.parse(output.value)).toMatchObject({
    status: 'dispatched',
    sessionId: 'session',
  });
  expect(output.artifacts).toEqual([
    {
      ref: { kind: 'managed-file', fileEntryId: SPILL_ID },
      name: 'task-brief.md',
      mediaType: 'text/markdown',
      kind: 'created',
    },
  ]);
  expect(test.set).toHaveBeenCalledWith('desktop.dispatch.last_target', TARGET);
  expect(test.source.dispose).toHaveBeenCalledTimes(1);
});

it.each(['unsupported', 'full'])(
  'rejects overflowing briefs when attachments are %s',
  async (reason) => {
    const test = fixture();
    test.source.getState.mockReturnValue({ status: 'ready', attachments: reason === 'full' });
    const file_entry_ids = reason === 'full' ? FILE_IDS.slice(0, 8) : [];
    expect(
      (
        await test.run('dispatch_task', {
          ...INPUT,
          text: 'x'.repeat(DESKTOP_DISPATCH_MAX_TEXT_LENGTH + 1),
          file_entry_ids,
        })
      ).value,
    ).toMatchObject({ status: 'rejected', error: 'REMOTE_TEXT_TOO_LONG' });
    expect(test.source.start).not.toHaveBeenCalled();
    expect(test.createTextArtifact).not.toHaveBeenCalled();
    expect(test.source.dispose).toHaveBeenCalledTimes(1);
  },
);

it.each(['offline', 'suspended'] as const)(
  'returns a dispatch receipt for %s connections',
  async (status) => {
    const test = fixture();
    test.source.getState.mockReturnValue({ status });
    expect(
      DesktopDispatchResultSchema.parse((await test.run('dispatch_task', INPUT)).value),
    ).toMatchObject({ status: 'desktop_offline' });
    expect(test.source.start).not.toHaveBeenCalled();
    expect(test.set).not.toHaveBeenCalled();
    expect(test.source.dispose).toHaveBeenCalledTimes(1);
  },
);

it('persists pending targets on a best effort basis and accepts eight attachments at the text limit', async () => {
  const test = fixture();
  test.set.mockRejectedValueOnce(new Error('unavailable'));
  test.source.start.mockResolvedValueOnce({
    id: 'op',
    agentId: 'agent',
    draftId: 'draft',
    workspace: TARGET.workspace,
    sessionId: 'session',
    status: 'pending',
    text: 'pending',
  });
  const text = 'x'.repeat(DESKTOP_DISPATCH_MAX_TEXT_LENGTH);
  const receipt = DesktopDispatchResultSchema.parse(
    (await test.run('dispatch_task', { ...INPUT, text, file_entry_ids: FILE_IDS.slice(0, 8) }))
      .value,
  );
  expect(receipt).toMatchObject({
    status: 'pending_confirmation',
    operationId: 'op',
    sessionId: 'session',
  });
  expect(receipt.attachments).toHaveLength(8);
  expect(test.source.start.mock.calls[0][0].text).toBe(text);
  expect(test.set).toHaveBeenCalledWith('desktop.dispatch.last_target', TARGET);
  expect(test.createTextArtifact).not.toHaveBeenCalled();
});

it('refuses foreign desktop session pairs before opening and reads the same-turn dispatch', async () => {
  const test = fixture();
  const request = { connection_id: 'pc', session_id: 'session' };
  expect((await test.run('read_session', request)).value).toMatchObject({
    status: 'forbidden',
    error: 'SESSION_NOT_IN_SCOPE',
  });
  expect(test.open).not.toHaveBeenCalled();
  await test.run('dispatch_task', INPUT);
  expect(
    (await test.run('read_session', { ...request, connection_id: 'other' })).value,
  ).toMatchObject({ status: 'forbidden' });
  expect(test.open).toHaveBeenCalledTimes(1);
  expect((await test.run('read_session', request)).value).toEqual({
    status: 'ok',
    connectionId: 'pc',
    sessionId: 'session',
    sessionTitle: 'Review notes',
    executionStatus: 'awaiting-approval',
    pendingApprovalTitle: 'Read project',
    latestReply: 'x'.repeat(2000),
    recentTools: [{ name: 'inspect', state: 'input-ready' }],
  });
  expect(test.source.readResource).toHaveBeenCalledWith('reply-text', expect.any(AbortSignal));
  expect(test.unobserve).toHaveBeenCalledTimes(1);
  expect(test.source.dispose).toHaveBeenCalledTimes(2);
});

it('keeps a pending remote question out of the approval field', async () => {
  const test = fixture([{ connectionId: 'pc', sessionId: 'session' }]);
  test.source.observe.mockImplementationOnce((_id, listener) => {
    listener({
      ...LIVE_SNAPSHOT,
      interactions: [
        {
          id: 'question',
          kind: 'question',
          title: 'Choose a directory',
          state: 'pending',
          input: 'question-input',
        },
      ],
    });
    return test.unobserve;
  });

  const { value } = await test.run('read_session', { connection_id: 'pc', session_id: 'session' });
  expect(value).toMatchObject({ status: 'ok', executionStatus: 'awaiting-approval' });
  expect(value).not.toHaveProperty('pendingApprovalTitle');
});

it('uses newest persisted assistant history for an authorized session with no live checkpoint', async () => {
  jest.useFakeTimers();
  try {
    const test = fixture([{ connectionId: 'pc', sessionId: 'session' }]);
    test.source.observe.mockImplementationOnce(() => test.unobserve);
    test.source.history.mockResolvedValueOnce({
      items: [
        { id: 'user', version: '1', role: 'user', state: 'success', parts: [] },
        {
          id: 'recent',
          version: '1',
          role: 'assistant',
          state: 'success',
          parts: [
            {
              id: 'text',
              kind: 'text',
              text: 'A completed reply.',
              complete: true,
              state: 'completed',
            },
          ],
        },
        { id: 'older', version: '1', role: 'assistant', state: 'error', parts: [] },
      ],
    });
    const output = test.run('read_session', { connection_id: 'pc', session_id: 'session' });
    await jest.advanceTimersByTimeAsync(1000);
    expect((await output).value).toMatchObject({
      latestReply: 'A completed reply.',
      executionStatus: 'completed',
    });
    expect(test.source.history).toHaveBeenCalledWith(
      'session',
      'rev',
      undefined,
      expect.any(AbortSignal),
    );
    expect(test.unobserve).toHaveBeenCalledTimes(1);
    expect(test.source.dispose).toHaveBeenCalledTimes(1);
  } finally {
    jest.useRealTimers();
  }
});
