import { RemoteAgentError } from '../RemoteAgentError';
import { RemoteReadCoordinator } from '../RemoteReadCoordinator';
import { RemoteTaskCatalog } from '../RemoteTaskCatalog';

const signal = () => new AbortController().signal;
const session = {
  sessionId: 's',
  agentId: 'a',
  workspaceId: 'w',
  title: 'Report',
  updatedAt: '2026-11-12T01:00:00.000Z',
  historyRevision: '1',
};

it('projects task metadata without exposing task configuration or conversation commands', async () => {
  const request = jest.fn(async () => ({
    items: [
      {
        taskId: 'task',
        agentId: 'a',
        name: 'Daily',
        trigger: { kind: 'interval', ms: 60_000, anchor: 'createdAt' },
        prompt: 'Private task configuration',
      },
    ],
    nextCursor: 'next',
  }));
  const catalog = new RemoteTaskCatalog(new RemoteReadCoordinator(), request as never);
  const caller = signal();
  expect(await catalog.list('current', caller)).toEqual({
    items: [{ id: 'task', agentId: 'a', name: 'Daily', trigger: { kind: 'interval', ms: 60_000 } }],
    next: 'next',
  });
  expect(request).toHaveBeenCalledWith('agent.tasks.list', { cursor: 'current' }, caller);
});

it('opens only conversations found in the selected task, including later pages', async () => {
  const request = jest.fn(async (_method: string, params: Record<string, string>) =>
    params.cursor ? { items: [session], nextCursor: null } : { items: [], nextCursor: 'next' },
  );
  const catalog = new RemoteTaskCatalog(new RemoteReadCoordinator(), request as never);
  const caller = signal();
  await expect(catalog.readSession('task', 's', caller)).resolves.toMatchObject({ id: 's' });
  await expect(catalog.readSession('task', 'foreign-session', caller)).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
  expect(
    request.mock.calls.every(
      ([method, params]) => method === 'agent.sessions.list' && params.taskId === 'task',
    ),
  ).toBe(true);
});

it('rejects a repeated task-session cursor instead of looping indefinitely', async () => {
  const request = jest.fn(async () => ({ items: [], nextCursor: 'repeated' }));
  const catalog = new RemoteTaskCatalog(new RemoteReadCoordinator(), request as never);
  await expect(catalog.readSession('task', 'missing', signal())).rejects.toMatchObject({
    code: 'PROTOCOL_ERROR',
  });
  expect(request).toHaveBeenCalledTimes(2);
});

it('identifies fresh and reused task conversations across both cursor lists without run records', async () => {
  const request = jest.fn(async (method: string, params: Record<string, string>) => {
    if (method === 'agent.tasks.list')
      return params.cursor
        ? { items: [{ taskId: 'second', agentId: 'a' }], nextCursor: null }
        : { items: [{ taskId: 'first', agentId: 'a' }], nextCursor: 'more-tasks' };
    expect(params.agentId).toBe('a');
    return params.taskId === 'first'
      ? params.cursor
        ? { items: [{ sessionId: 'reused', agentId: 'a' }], nextCursor: null }
        : { items: [{ sessionId: 'fresh', agentId: 'a' }], nextCursor: 'more-sessions' }
      : { items: [{ sessionId: 'another', agentId: 'a' }], nextCursor: null };
  });
  const catalog = new RemoteTaskCatalog(new RemoteReadCoordinator(), request as never);
  const result = await catalog.identify('a', ['fresh', 'reused', 'ordinary'], signal());
  expect([...result]).toEqual([
    ['fresh', 'first'],
    ['reused', 'first'],
    ['another', 'second'],
  ]);
  expect(result.has('ordinary')).toBe(false);
});

it('reuses a known catalog but resolves a newly created result before the metadata cache expires', async () => {
  const ids = ['existing'];
  const request = jest.fn(async (method: string) =>
    method === 'agent.tasks.list'
      ? { items: [{ taskId: 'task', agentId: 'a' }], nextCursor: null }
      : { items: ids.map((sessionId) => ({ sessionId, agentId: 'a' })), nextCursor: null },
  );
  const catalog = new RemoteTaskCatalog(new RemoteReadCoordinator(), request as never);
  await catalog.identify('a', ['existing', 'ordinary'], signal());
  await catalog.identify('a', ['ordinary'], signal());
  expect(request).toHaveBeenCalledTimes(2);
  ids.push('new-result');
  expect((await catalog.identify('a', ['new-result'], signal())).get('new-result')).toBe('task');
  expect(request).toHaveBeenCalledTimes(4);
  await catalog.identify('a', ['ordinary'], signal());
  expect(request).toHaveBeenCalledTimes(4);
});

it('leaves old desktops usable and retries task discovery after a reconnect', async () => {
  const request = jest.fn(async () => {
    throw new RemoteAgentError('UPGRADE_REQUIRED');
  });
  const catalog = new RemoteTaskCatalog(new RemoteReadCoordinator(), request as never);
  expect((await catalog.identify('a', ['ordinary'], signal())).size).toBe(0);
  await catalog.identify('a', ['ordinary'], signal());
  expect(request).toHaveBeenCalledTimes(1);
  catalog.reset();
  await catalog.identify('a', ['ordinary'], signal());
  expect(request).toHaveBeenCalledTimes(2);
});

it("does not treat authorization failures or another Agent's Sessions as ordinary conversations", async () => {
  const request = jest.fn(async (method: string): Promise<unknown> => {
    if (method === 'agent.tasks.list')
      return { items: [{ taskId: 'task', agentId: 'a' }], nextCursor: null };
    throw new RemoteAgentError('FORBIDDEN');
  });
  const catalog = new RemoteTaskCatalog(new RemoteReadCoordinator(), request as never);
  await expect(catalog.identify('a', ['s'], signal())).rejects.toMatchObject({ code: 'FORBIDDEN' });
  request.mockImplementation(async (method: string) =>
    method === 'agent.tasks.list'
      ? { items: [{ taskId: 'task', agentId: 'a' }], nextCursor: null }
      : { items: [{ sessionId: 's', agentId: 'another-agent' }], nextCursor: null },
  );
  await expect(catalog.identify('a', ['s'], signal())).rejects.toMatchObject({
    code: 'PROTOCOL_ERROR',
  });
});
