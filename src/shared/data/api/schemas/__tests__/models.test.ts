import { CreateModelSchema, ReorderModelsRequestSchema, UpdateModelSchema } from '../models';

describe('model limit overrides', () => {
  it('allows updates to reset each token limit without touching other fields', () => {
    expect(
      UpdateModelSchema.parse({ contextWindow: null, maxInputTokens: null, maxOutputTokens: null }),
    ).toEqual({ contextWindow: null, maxInputTokens: null, maxOutputTokens: null });
    expect(UpdateModelSchema.parse({ name: 'My model' })).toEqual({ name: 'My model' });
  });

  it('keeps creation limits optional and rejects invalid nonempty limits', () => {
    expect(
      CreateModelSchema.safeParse({ providerId: 'custom', modelId: 'model', contextWindow: null })
        .success,
    ).toBe(false);
    for (const value of [0, -1, 1.5, Infinity]) {
      expect(UpdateModelSchema.safeParse({ maxOutputTokens: value }).success).toBe(false);
    }
  });
});

describe('model reorder request', () => {
  it.each([
    { before: 'p::org/模型::variant' },
    { after: 'p::org/模型::variant' },
    { position: 'first' },
    { position: 'last' },
  ])('accepts a singleton with anchor %j', (anchor) => {
    const body = { moves: [{ id: 'p::org/模型::target', anchor }] };
    expect(ReorderModelsRequestSchema.parse(body)).toEqual(body);
  });

  it('accepts multiple distinct targets in request order', () => {
    const body = {
      moves: [
        { id: 'p::a', anchor: { after: 'p::b' } },
        { id: 'p::b', anchor: { position: 'last' } },
      ],
    };
    expect(ReorderModelsRequestSchema.parse(body)).toEqual(body);
  });

  it.each([
    undefined,
    null,
    {},
    { moves: [] },
    { moves: [{ id: 'p::a', anchor: { position: 'first' } }], extra: true },
    { moves: [{ id: 'p::a', anchor: { position: 'first' }, extra: true }] },
    ...[
      {},
      { before: 'p::b', after: 'p::c' },
      { before: 'p::b', position: 'first' },
      { after: 'p::b', position: 'last' },
      { position: 'middle' },
      { position: 'first', extra: true },
    ].map((anchor) => ({ moves: [{ id: 'p::a', anchor }] })),
  ])('rejects malformed or non-strict input %j', (body) => {
    expect(ReorderModelsRequestSchema.safeParse(body).success).toBe(false);
  });

  it.each(['', 'raw-id', '::model', 'p::', 'p::m?q', 'p::m#fragment', 42, null])(
    'rejects invalid target and relative anchor identity %j',
    (id) => {
      for (const move of [
        { id, anchor: { position: 'first' } },
        { id: 'p::a', anchor: { before: id } },
        { id: 'p::a', anchor: { after: id } },
      ]) {
        expect(ReorderModelsRequestSchema.safeParse({ moves: [move] }).success).toBe(false);
      }
    },
  );

  it('rejects duplicate targets at the repeated id path', () => {
    const result = ReorderModelsRequestSchema.safeParse({
      moves: [
        { id: 'p::a', anchor: { position: 'first' } },
        { id: 'p::a', anchor: { position: 'last' } },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({ path: ['moves', 1, 'id'] }),
      );
    }
  });

  it('keeps fractional keys private to persistence', () => {
    expect(
      CreateModelSchema.safeParse({ providerId: 'p', modelId: 'a', orderKey: 'a0' }).success,
    ).toBe(false);
    expect(UpdateModelSchema.safeParse({ name: 'A', orderKey: 'a0' }).success).toBe(false);
  });
});
