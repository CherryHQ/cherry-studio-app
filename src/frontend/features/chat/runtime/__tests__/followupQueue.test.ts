import { createUniqueModelId } from '@/shared/data/types/model';

import {
  claimFollowup,
  clearFollowupQueue,
  enqueueFollowup,
  type FollowupQueueItem,
  holdFollowupQueue,
  readFollowupQueue,
  removeFollowup,
  settleFollowup,
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

test('stopping retains existing drafts for manual sending without holding later drafts', () => {
  const items = [queuedItem('B'), queuedItem('C')];
  for (const item of items) enqueueFollowup(item, null);
  holdFollowupQueue('queue-test');
  const heldItems = items.map((item) => ({ ...item, isManualSendRequired: true }));
  expect(readFollowupQueue('queue-test').items).toEqual(heldItems);
  const heldState = readFollowupQueue('queue-test');
  holdFollowupQueue('queue-test');
  expect(readFollowupQueue('queue-test')).toBe(heldState);
  const d = queuedItem('D');
  enqueueFollowup(d, null);
  expect(readFollowupQueue('queue-test').items).toEqual([...heldItems, d]);
});

test('pending admission stays exclusive and is removed only after acceptance', () => {
  const b = queuedItem('B');
  const c = queuedItem('C');
  enqueueFollowup(b, null);
  enqueueFollowup(c, null);
  expect(claimFollowup('queue-test', b.id)).toEqual(b);
  expect(claimFollowup('queue-test', b.id)).toBeUndefined();
  expect(removeFollowup('queue-test', b.id)).toBeUndefined();
  expect(readFollowupQueue('queue-test').items).toEqual([b, c]);
  settleFollowup('queue-test', b.id, true, 'A-completed');
  expect(readFollowupQueue('queue-test')).toMatchObject({
    items: [c],
    pendingId: null,
    consumedCompletionId: 'A-completed',
  });
});

test('unaccepted admission retains the drafts for manual retry', () => {
  const b = queuedItem('B');
  const c = queuedItem('C');
  enqueueFollowup(b, null);
  enqueueFollowup(c, null);
  claimFollowup('queue-test', b.id);
  settleFollowup('queue-test', b.id, false, 'A-completed');
  expect(readFollowupQueue('queue-test')).toMatchObject({
    items: [b, c].map((item) => ({ ...item, isManualSendRequired: true })),
    consumedCompletionId: 'A-completed',
  });
  expect(claimFollowup('queue-test', b.id)).toEqual({ ...b, isManualSendRequired: true });
  settleFollowup('queue-test', b.id, true, 'A-completed');
  expect(readFollowupQueue('queue-test').items).toEqual([{ ...c, isManualSendRequired: true }]);
});

test('take-back preserves the held payload and late acceptance cannot resurrect deleted sessions', () => {
  const b = queuedItem('B');
  const c = queuedItem('C');
  enqueueFollowup(b, null);
  enqueueFollowup(c, null);
  holdFollowupQueue('queue-test');
  expect(removeFollowup('queue-test', c.id)).toEqual({ ...c, isManualSendRequired: true });
  expect(readFollowupQueue('queue-test').items).toEqual([{ ...b, isManualSendRequired: true }]);
  claimFollowup('queue-test', b.id);
  clearFollowupQueue('queue-test');
  settleFollowup('queue-test', b.id, true, 'old');
  expect(readFollowupQueue('queue-test').items).toEqual([]);
});
