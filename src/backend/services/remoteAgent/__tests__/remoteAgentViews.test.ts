import type { AgentProjection } from '@cherrystudio/remote-protocol/agent';

import { createMessageViewCache, projectMessage, projectSnapshot } from '../remoteAgentViews';

const issueResource = () => 'opaque-resource';
const message = {
  messageId: 'm',
  revision: '1',
  role: 'assistant' as const,
  status: 'success' as const,
  partIds: ['input', 'output', 'answer'],
};
it('distinguishes completed tool arguments from a completed invocation and keeps tool failure local to the part', () => {
  const input = {
    partId: 'input',
    revision: '1',
    kind: 'tool-input' as const,
    toolName: 'read',
    toolCallId: 'call',
    content: { text: '{}' },
    state: 'completed' as const,
  };
  expect(projectMessage('s', message, [input], issueResource).parts[0]).toMatchObject({
    kind: 'tool',
    state: 'input-ready',
  });
  const projected = projectMessage(
    's',
    message,
    [
      input,
      {
        ...input,
        partId: 'output',
        kind: 'tool-output',
        state: 'failed',
        content: { text: 'missing file' },
      },
      {
        partId: 'answer',
        revision: '1',
        kind: 'text',
        content: { text: 'The file was not found.' },
        state: 'completed',
      },
    ],
    issueResource,
  );
  expect(projected.parts[0]).toMatchObject({
    kind: 'tool',
    state: 'failed',
    input: expect.any(String),
    output: expect.any(String),
  });
  expect(projected.state).toBe('success');
});
it('exposes desktop data-file parts as metadata without claiming downloadable bytes', () => {
  const projected = projectMessage(
    's',
    message,
    [
      {
        partId: 'file',
        revision: '1',
        kind: 'data',
        name: 'file',
        content: { text: JSON.stringify({ filename: 'report.pdf', mediaType: 'application/pdf' }) },
      },
    ],
    issueResource,
  );
  expect(projected.parts[0]).toMatchObject({
    kind: 'file',
    name: 'report.pdf',
    mediaType: 'application/pdf',
  });
  expect(projected.parts[0]).not.toHaveProperty('url');
});

it('preserves usage and measured zero without issuing a content resource', () => {
  const usage = { totalTokens: 25, outputTokens: 0, cacheReadTokens: 10, durationMs: 200 };
  expect(projectMessage('s', { ...message, usage }, [], issueResource).usage).toEqual(usage);
  expect(projectMessage('s', message, [], issueResource).usage).toBeUndefined();
});

it('keeps the remote message model snapshot without consulting the mobile model catalog', () => {
  const model = { modelId: 'model', providerId: 'desktop-provider', name: 'Historical model' };
  expect(projectMessage('s', { ...message, model }, [], issueResource).model).toEqual(model);
  expect(projectMessage('s', message, [], issueResource).model).toBeUndefined();
});

it('reuses message views until the message or one of its parts is replaced', () => {
  const text = (partId: string, value: string) => ({
    partId,
    revision: '1',
    kind: 'text' as const,
    content: { text: value },
    state: 'streaming' as const,
  });
  const settled = { ...message, messageId: 'settled', partIds: ['a'] };
  const streaming = { ...message, messageId: 'streaming', partIds: ['b'] };
  const projection: AgentProjection = {
    cursor: { sessionId: 's', streamEpoch: 'epoch', seq: '0' },
    session: {
      sessionId: 's',
      agentId: 'a',
      workspaceId: 'w',
      title: 'Session',
      updatedAt: '2026-09-22T00:00:00.000Z',
      historyRevision: '1',
    },
    messages: { settled, streaming },
    parts: { a: text('a', 'done'), b: text('b', 'grow') },
    executions: {},
    interactions: {},
    tombstones: [],
  };
  const issue = jest.fn(issueResource);
  const views = createMessageViewCache();
  const first = projectSnapshot('scope', projection, true, issue, views).messages;
  const next = projectSnapshot(
    'scope',
    { ...projection, parts: { ...projection.parts, b: text('b', 'growing') } },
    true,
    issue,
    views,
  ).messages;
  expect(next[0]).toBe(first[0]);
  expect(next[1]).not.toBe(first[1]);
  expect(next[1].parts[0]).toMatchObject({ text: 'growing' });
});

it('reuses unchanged part views and reports each text part state while its message streams', () => {
  const answer = {
    partId: 'answer',
    revision: '1',
    kind: 'text' as const,
    content: { text: 'Reading the file.' },
    state: 'completed' as const,
  };
  const input = {
    partId: 'input',
    revision: '1',
    kind: 'tool-input' as const,
    toolName: 'read',
    toolCallId: 'call',
    content: { text: '{}' },
    state: 'completed' as const,
  };
  const tail = (text: string) => ({
    partId: 'tail',
    revision: '1',
    kind: 'text' as const,
    content: { text },
    state: 'streaming' as const,
  });
  const streaming = { ...message, status: 'pending' as const };
  const cache = createMessageViewCache().parts;
  const first = projectMessage('s', streaming, [answer, input, tail('Fo')], issueResource, cache);
  const output = { ...input, partId: 'output', kind: 'tool-output' as const };
  const next = projectMessage(
    's',
    streaming,
    [answer, input, output, tail('Found')],
    issueResource,
    cache,
  );

  expect(first.parts[0]).toMatchObject({ state: 'completed' });
  expect(first.parts[2]).toMatchObject({ state: 'streaming' });
  expect(next.parts[0]).toBe(first.parts[0]);
  expect(next.parts[1]).not.toBe(first.parts[1]);
  expect(next.parts[1]).toMatchObject({
    kind: 'tool',
    state: 'completed',
    output: expect.any(String),
  });
  expect(next.parts[2]).toMatchObject({ text: 'Found' });
  expect(
    projectMessage('s', streaming, [answer, input, output], issueResource, cache).parts[1],
  ).toBe(next.parts[1]);
});
