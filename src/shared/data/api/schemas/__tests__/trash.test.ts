import { TrashFilterSchema, TrashKindSchema, TrashQuerySchema } from '../trash';

test('trash queries have bounded pagination and explicit categories', () => {
  expect(TrashQuerySchema.parse({})).toEqual({ kind: 'all', limit: 30 });
  expect(TrashQuerySchema.parse({ kind: 'session', limit: '10' })).toEqual({
    kind: 'session',
    limit: 10,
  });
  expect(TrashQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
  expect(TrashQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
  expect(TrashQuerySchema.safeParse({ kind: 'unknown' }).success).toBe(false);
  expect(TrashQuerySchema.safeParse({ arbitrary: true }).success).toBe(false);
});

test('all is a list/empty scope and never an individual item kind', () => {
  expect(TrashFilterSchema.safeParse('all').success).toBe(true);
  expect(TrashKindSchema.safeParse('all').success).toBe(false);
});
