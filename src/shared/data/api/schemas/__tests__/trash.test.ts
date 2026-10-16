import { TrashQuerySchema } from '../trash';

test('file trash queries have bounded pagination', () => {
  expect(TrashQuerySchema.parse({})).toEqual({ limit: 30 });
  expect(TrashQuerySchema.parse({ limit: '10' })).toEqual({
    limit: 10,
  });
  expect(TrashQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
  expect(TrashQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
  expect(TrashQuerySchema.safeParse({ kind: 'session' }).success).toBe(false);
  expect(TrashQuerySchema.safeParse({ arbitrary: true }).success).toBe(false);
});
