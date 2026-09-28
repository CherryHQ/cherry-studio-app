import type { ConversationOperation } from '@/frontend/appShell/conversation/remote';

import { visibleRemoteOperations } from '../visibleRemoteOperations';

const conversation = {
  source: { kind: 'desktop', connectionId: 'desktop' },
  sessionId: 's',
} as const;
const operation = (value: Partial<Omit<ConversationOperation, 'id'>> & { id?: string }) =>
  ({ id: 'op', kind: 'send', state: 'pending', ...value }) as ConversationOperation;

it('hides the pending card of the submission still in flight, and shows it once uncertain', () => {
  const pending = operation({ conversation });
  expect(visibleRemoteOperations([], [pending], { sessionId: 's', submitting: true })).toEqual([]);
  expect(visibleRemoteOperations([], [pending], { sessionId: 's', submitting: false })).toEqual([
    pending,
  ]);
});

it('hides a start the current draft is about to hand off, but keeps other drafts reachable', () => {
  const handingOff = operation({ kind: 'start', state: 'applied', draftId: 'draft' as never });
  const other = operation({ id: 'other', kind: 'start', state: 'applied', draftId: 'x' as never });
  expect(
    visibleRemoteOperations([handingOff, other], [], { draftId: 'draft', submitting: false }),
  ).toEqual([other]);
});
