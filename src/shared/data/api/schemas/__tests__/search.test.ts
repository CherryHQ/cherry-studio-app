import { ContentSearchQuerySchema, EntitySearchQuerySchema } from '../search';

describe('search api schemas', () => {
  test('accepts Agent and Session entity targets and rejects retired chat types', () => {
    expect(EntitySearchQuerySchema.parse({ q: 'needle', types: ['agent', 'session'] })).toEqual({
      q: 'needle',
      types: ['agent', 'session'],
    });
    expect(EntitySearchQuerySchema.safeParse({ q: 'needle', types: ['assistant'] }).success).toBe(
      false,
    );
  });

  test('scopes content search by session and rejects the retired topic field', () => {
    expect(ContentSearchQuerySchema.parse({ q: 'needle', sessionId: 'session-1' })).toEqual({
      q: 'needle',
      sessionId: 'session-1',
    });
    expect(ContentSearchQuerySchema.safeParse({ q: 'needle', topicId: 'topic-1' }).success).toBe(
      false,
    );
  });
});
