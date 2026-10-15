import type { AssistantProjection } from '@cherrystudio/remote-protocol/assistant';

import type { DesktopNotification } from '@/backend/services/desktopConnections/DesktopSession';

import type { AssistantRequest } from '../assistantRequest';
import { TopicSync } from '../TopicSync';
import { checkpoint, projection } from './_checkpointFixture';

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
function setup(state = projection()) {
  let notify: (event: DesktopNotification) => void = () => {};
  let subscription = 0;
  const fixture = checkpoint(state);
  const order: string[] = [];
  const request = jest.fn(async (method, params) => {
    order.push(method);
    switch (method) {
      case 'assistant.topics.subscribe':
        return {
          subscriptionId: `sub-${++subscription}`,
          mode: 'checkpoint',
          checkpoint: fixture.descriptor,
        };
      case 'assistant.checkpoints.read':
        return fixture.page;
      case 'assistant.subscriptions.activate':
        return { subscriptionId: params.subscriptionId, status: 'active' };
      case 'assistant.subscriptions.ack':
        return { acknowledged: params.cursor };
      case 'assistant.subscriptions.close':
        return { closed: true };
      case 'assistant.interactions.list':
        return { items: [], nextCursor: null };
      default:
        throw new Error(method);
    }
  });
  const publish = jest.fn((value: AssistantProjection, current: boolean) => {
    order.push(`publish:${value.cursor.seq}:${current}`);
  });
  const failed = jest.fn();
  const sync = new TopicSync(
    'topic',
    {
      request: request as AssistantRequest,
      readContent: jest.fn(),
      onNotification: (listener) => {
        notify = listener;
        return () => {
          notify = () => {};
        };
      },
    },
    publish,
    failed,
  );
  return {
    sync,
    request,
    publish,
    failed,
    order,
    fixture,
    notify: (event: DesktopNotification) => notify(event),
  };
}
it('installs the checkpoint before activation and accepts a fast terminal batch', async () => {
  const test = setup();
  await test.sync.start();
  expect(test.order.indexOf('publish:0:false')).toBeLessThan(
    test.order.indexOf('assistant.subscriptions.activate'),
  );
  expect(test.order.indexOf('assistant.subscriptions.activate')).toBeLessThan(
    test.order.indexOf('publish:0:true'),
  );
  test.notify({
    method: 'assistant.events',
    params: {
      subscriptionId: 'sub-1',
      topicId: 'topic',
      streamEpoch: 'epoch',
      events: [
        {
          kind: 'message.updated',
          seq: '1',
          message: {
            messageId: 'answer',
            parentId: 'user',
            revision: '1',
            role: 'assistant',
            status: 'success',
            partIds: [],
            model: { modelId: 'm', providerId: 'p', name: 'Model' },
          },
        },
        {
          kind: 'part.updated',
          seq: '2',
          messageId: 'answer',
          afterPartId: null,
          part: {
            kind: 'text',
            partId: 'text',
            revision: '1',
            state: 'completed',
            content: { text: 'Done' },
          },
        },
        {
          kind: 'topic.updated',
          seq: '3',
          topic: { ...projection().topic, parentAnchorId: 'answer', historyRevision: '1' },
        },
      ],
    },
  });
  await settle();
  expect(test.sync.current?.cursor.seq).toBe('3');
  expect(test.publish.mock.calls.at(-1)).toMatchObject([
    {
      messages: { answer: { status: 'success', partIds: ['text'] } },
      parts: { text: { content: { text: 'Done' } } },
    },
    true,
  ]);
  expect(test.request).toHaveBeenCalledWith(
    'assistant.subscriptions.ack',
    { subscriptionId: 'sub-1', cursor: { topicId: 'topic', streamEpoch: 'epoch', seq: '3' } },
    expect.anything(),
  );
  test.sync.stop();
  await test.sync.drain();
  expect(test.failed).not.toHaveBeenCalled();
});
it('presents a late tool result beside its input when another tool input arrived first', async () => {
  const state = projection();
  state.messages.answer = {
    messageId: 'answer',
    parentId: 'user',
    revision: '1',
    role: 'assistant',
    status: 'pending',
    partIds: ['input-a', 'input-b'],
  };
  for (const id of ['a', 'b'])
    state.parts[`input-${id}`] = {
      partId: `input-${id}`,
      revision: '1',
      kind: 'tool-input',
      toolName: 'echo_test',
      toolCallId: id,
      state: 'completed',
      content: { text: '{}' },
    };
  const test = setup(state);
  await test.sync.start();
  test.notify({
    method: 'assistant.events',
    params: {
      subscriptionId: 'sub-1',
      topicId: 'topic',
      streamEpoch: 'epoch',
      events: [
        {
          kind: 'part.updated',
          seq: '1',
          messageId: 'answer',
          afterPartId: 'input-a',
          part: {
            partId: 'output-a',
            revision: '2',
            kind: 'tool-output',
            toolName: 'echo_test',
            toolCallId: 'a',
            state: 'completed',
            content: { text: 'A completed' },
          },
        },
      ],
    },
  });
  await settle();
  expect(test.sync.current?.messages.answer.partIds).toEqual(['input-a', 'output-a', 'input-b']);
  expect(test.publish.mock.calls.at(-1)).toMatchObject([
    { messages: { answer: { partIds: ['input-a', 'output-a', 'input-b'] } } },
    true,
  ]);
  expect(test.failed).not.toHaveBeenCalled();
  test.sync.stop();
  await test.sync.drain();
});
it('rebuilds after an event gap without granting actions from the incomplete projection', async () => {
  const test = setup();
  await test.sync.start();
  test.publish.mockClear();
  test.notify({
    method: 'assistant.events',
    params: {
      subscriptionId: 'sub-1',
      topicId: 'topic',
      streamEpoch: 'epoch',
      events: [
        {
          kind: 'topic.updated',
          seq: '2',
          topic: { ...projection().topic, title: 'Must not install' },
        },
      ],
    },
  });
  await settle();
  expect(
    test.request.mock.calls.filter(([method]) => method === 'assistant.topics.subscribe'),
  ).toHaveLength(2);
  expect(test.publish.mock.calls.every(([value]) => value.topic.title !== 'Must not install')).toBe(
    true,
  );
  test.sync.stop();
  await test.sync.drain();
});
it('does not activate corrupt checkpoint bytes', async () => {
  const test = setup();
  test.fixture.page.pageDigest = 'f'.repeat(64);
  await expect(test.sync.start()).rejects.toThrow('PROTOCOL_ERROR');
  expect(
    test.request.mock.calls.some(([method]) => method === 'assistant.subscriptions.activate'),
  ).toBe(false);
  test.sync.stop();
  await test.sync.drain();
});

it('closes a subscription allocated after observation stops, without activating it', async () => {
  const test = setup();
  let deliver!: (value: unknown) => void;
  const request = test.request.getMockImplementation()!;
  test.request.mockImplementation((method, params) =>
    method === 'assistant.topics.subscribe'
      ? (new Promise((resolve) => {
          deliver = resolve;
        }) as never)
      : request(method, params),
  );
  const started = test.sync.start();
  const rejection = expect(started).rejects.toThrow();
  await settle();
  test.sync.stop();
  deliver({ subscriptionId: 'late', mode: 'checkpoint', checkpoint: test.fixture.descriptor });
  await rejection;
  await test.sync.drain();
  expect(
    test.request.mock.calls.filter(([method]) => method === 'assistant.subscriptions.close'),
  ).toEqual([['assistant.subscriptions.close', { subscriptionId: 'late' }]]);
  expect(
    test.request.mock.calls.some(([method]) => method === 'assistant.subscriptions.activate'),
  ).toBe(false);
  expect(test.publish).not.toHaveBeenCalled();
  expect(test.failed).not.toHaveBeenCalled();
});
