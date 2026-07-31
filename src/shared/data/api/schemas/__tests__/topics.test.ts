import { CreateTopicSchema } from '../topics';

describe('topic api schemas', () => {
  test('rejects reference-style topic forks', () => {
    expect(CreateTopicSchema.safeParse({ sourceNodeId: 'message-1' }).success).toBe(false);
  });
});
