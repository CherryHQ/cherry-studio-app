import { TraceIdSchema } from '../trace';

describe('TraceIdSchema', () => {
  test('accepts a 32-character lowercase hex trace id', () => {
    expect(TraceIdSchema.safeParse('000102030405060708090a0b0c0d0e0f').success).toBe(true);
    expect(TraceIdSchema.safeParse('000102030405060708090A0B0C0D0E0F').success).toBe(false);
    expect(TraceIdSchema.safeParse('short').success).toBe(false);
  });
});
