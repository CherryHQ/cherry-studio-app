import { createUniqueModelId } from '@/shared/data/types/model';

import {
  claimFollowup,
  clearFollowupQueue,
  enqueueFollowup,
  type FollowupQueueItem,
  readFollowupQueue,
  removeFollowup,
  reorderFollowups,
  setFollowupQueuePaused,
  settleFollowup,
  stopFollowupAdvance,
  subscribeFollowupQueue,
} from '../followupQueue';

function queuedItem(id: string, sessionId = 'queue-test'): FollowupQueueItem {
  return {
    id,
    request: {
      sessionId,
      userMessageId: `user-${id}`,
      assistantMessageId: `answer-${id}`,
      modelId: createUniqueModelId('provider', 'model'),
      parts: [{ type: 'text', text: id }],
    },
    draft: { text: id, attachments: [], quote: {} },
  };
}

beforeEach(() => {
  clearFollowupQueue('queue-test');
  clearFollowupQueue('queue-other');
});

test('retains drafts and selections across subscribers, isolated by session', () => {
  const b = queuedItem('B');
  const unsubscribe = subscribeFollowupQueue('queue-test', () => {});
  enqueueFollowup(b, 'previous');
  unsubscribe();
  expect(readFollowupQueue('queue-test').items).toEqual([b]);
  expect(readFollowupQueue('queue-test').items[0].request.modelId).toBe(b.request.modelId);
  expect(readFollowupQueue('queue-other').items).toEqual([]);
});

test('stopping an answer leaves both queue membership and pause choice intact', () => {
  const items = [queuedItem('B'), queuedItem('C')];
  for (const item of items) enqueueFollowup(item, null);
  stopFollowupAdvance('queue-test', 'A');
  expect(readFollowupQueue('queue-test')).toMatchObject({
    items,
    isPaused: false,
    stoppedTurnId: 'A',
  });
  setFollowupQueuePaused('queue-test', true);
  stopFollowupAdvance('queue-test', 'D');
  expect(readFollowupQueue('queue-test')).toMatchObject({
    items,
    isPaused: true,
    stoppedTurnId: 'D',
  });
});

test('pending admission stays exclusive and is removed only after acceptance', () => {
  const b = queuedItem('B');
  const c = queuedItem('C');
  enqueueFollowup(b, null);
  enqueueFollowup(c, null);
  expect(claimFollowup('queue-test', b.id)).toEqual(b);
  expect(claimFollowup('queue-test', b.id)).toBeUndefined();
  expect(removeFollowup('queue-test', b.id)).toBeUndefined();
  reorderFollowups('queue-test', [c, b]);
  expect(readFollowupQueue('queue-test').items).toEqual([b, c]);
  settleFollowup('queue-test', b.id, 'accepted', 'A-completed');
  expect(readFollowupQueue('queue-test')).toMatchObject({
    items: [c],
    pendingId: null,
    consumedCompletionId: 'A-completed',
  });
});

test('a failed submission keeps the draft, pauses advancement and permits retry', () => {
  const b = queuedItem('B');
  enqueueFollowup(b, null);
  claimFollowup('queue-test', b.id);
  settleFollowup('queue-test', b.id, 'failed', 'A-completed');
  expect(readFollowupQueue('queue-test')).toMatchObject({
    items: [b],
    isPaused: true,
    hasFailedSend: true,
    consumedCompletionId: null,
  });
  setFollowupQueuePaused('queue-test', false);
  expect(claimFollowup('queue-test', b.id)).toEqual(b);
});

test('reordering and take-back preserve original payloads and do not resurrect deleted sessions', () => {
  const b = queuedItem('B');
  const c = queuedItem('C');
  enqueueFollowup(b, null);
  enqueueFollowup(c, null);
  reorderFollowups('queue-test', [c, b]);
  expect(removeFollowup('queue-test', c.id)).toEqual(c);
  expect(readFollowupQueue('queue-test').items).toEqual([b]);
  claimFollowup('queue-test', b.id);
  clearFollowupQueue('queue-test');
  settleFollowup('queue-test', b.id, 'accepted', 'old');
  expect(readFollowupQueue('queue-test').items).toEqual([]);
});
