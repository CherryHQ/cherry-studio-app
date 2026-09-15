import { createLogRecord, flushLogWriter, installLogWriter, LoggerService } from '../LoggerService';

describe('file log transport', () => {
  test('flushes the active writer on replacement and isolates flush failures', () => {
    const oldFlush = jest.fn();
    const disposeOld = installLogWriter(Object.assign(jest.fn(), { flush: oldFlush }));
    const flush = jest.fn(() => {
      throw new Error('disk full');
    });
    const dispose = installLogWriter(Object.assign(jest.fn(), { flush }));
    expect(oldFlush).toHaveBeenCalledTimes(1);
    disposeOld();
    expect(() => flushLogWriter()).not.toThrow();
    expect(flush).toHaveBeenCalledTimes(1);
    dispose();
  });
  test('preserves caller metadata while protecting log source fields', () => {
    const error = Object.assign(new Error('HTTP 401'), { requestBody: { prompt: 'raw prompt' } });
    const record = createLogRecord(
      'error',
      'Provider failed',
      'PiRuntime',
      { sessionId: 'session' },
      [error, { token: 'raw token' }],
    );
    expect(record).toMatchObject({
      level: 'error',
      message: 'Provider failed',
      module: 'PiRuntime',
      process: 'main',
      error,
      context: { sessionId: 'session' },
      data: [{ token: 'raw token' }],
    });
    expect(record.stack).toBeUndefined();
    expect(
      createLogRecord('warn', 'actual', 'actual module', {}, [
        { message: 'forged', process: 'renderer' },
      ]),
    ).toMatchObject({ message: 'actual', module: 'actual module', process: 'main' });
  });

  test('a replaced writer cannot be removed by the old owner and none suppresses writes', () => {
    const old = jest.fn();
    const current = jest.fn();
    const disposeOld = installLogWriter(old);
    const disposeCurrent = installLogWriter(current);
    disposeOld();
    const logger = new LoggerService();
    logger.setLevel('error');
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      logger.error('recorded');
      logger.setLevel('none');
      logger.error('suppressed');
      expect(old).not.toHaveBeenCalled();
      expect(current).toHaveBeenCalledTimes(1);
      expect(current.mock.calls[0][0].message).toBe('recorded');
    } finally {
      disposeCurrent();
      consoleError.mockRestore();
    }
  });
});
