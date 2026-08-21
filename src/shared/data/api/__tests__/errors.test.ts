import * as z from 'zod';

import {
  DataApiError,
  DataApiErrorFactory,
  ErrorCode,
  isDataApiError,
  toDataApiError,
} from '../errors';

describe('DataApiError contract', () => {
  test('every factory produces an instance of the single DataApiError class', () => {
    const errors = [
      DataApiErrorFactory.create(ErrorCode.BAD_REQUEST, 'bad request'),
      DataApiErrorFactory.conflict('name taken', 'Assistant'),
      DataApiErrorFactory.internal(new Error('boom'), 'test'),
      DataApiErrorFactory.invalidOperation('delete root', 'root is virtual'),
      DataApiErrorFactory.notFound('Topic', 'abc123'),
      DataApiErrorFactory.validation({ name: ['required'] }),
    ];

    for (const error of errors) {
      expect(error).toBeInstanceOf(DataApiError);
      expect(isDataApiError(error)).toBe(true);
    }
  });

  test('status derives from the error code', () => {
    expect(DataApiErrorFactory.notFound('Topic').status).toBe(404);
    expect(DataApiErrorFactory.validation({}).status).toBe(422);
    expect(DataApiErrorFactory.conflict('duplicate').status).toBe(409);
    expect(DataApiErrorFactory.invalidOperation('op').status).toBe(400);
    expect(DataApiErrorFactory.internal(new Error('boom')).status).toBe(500);
    expect(new DataApiError(ErrorCode.METHOD_NOT_ALLOWED, 'nope').status).toBe(405);
  });

  test('toDataApiError passes an existing DataApiError through unchanged', () => {
    const original = DataApiErrorFactory.notFound('Message', 'm1');
    expect(toDataApiError(original)).toBe(original);
  });

  test('toDataApiError converts zod failures to a 422 with field errors', () => {
    const schema = z.strictObject({ name: z.string() });
    const result = schema.safeParse({ name: 42 });
    if (result.success) throw new Error('expected parse failure');

    const error = toDataApiError(result.error, 'assistant create');

    expect(error).toBeInstanceOf(DataApiError);
    expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(error.status).toBe(422);
    expect(error.message).toBe('Validation failed in assistant create');
    expect(error.details).toEqual({ fieldErrors: { name: [expect.any(String)] } });
  });

  test('toDataApiError wraps plain and unknown errors as 500', () => {
    const fromError = toDataApiError(new Error('disk full'), 'file write');
    expect(fromError.code).toBe(ErrorCode.INTERNAL_SERVER_ERROR);
    expect(fromError.status).toBe(500);
    expect(fromError.message).toBe('Internal error in file write: disk full');

    const fromValue = toDataApiError('exploded');
    expect(fromValue.code).toBe(ErrorCode.INTERNAL_SERVER_ERROR);
    expect(fromValue.message).toBe('Unknown error: exploded');
  });
});
