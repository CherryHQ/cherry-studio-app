import { createLogRecord, installLogWriter, LoggerService } from '../LoggerService';

describe('file log transport', () => {
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
      message: 'Provider failed HTTP 401',
      module: 'PiRuntime',
      process: 'main',
      requestBody: { prompt: 'raw prompt' },
      context: { sessionId: 'session' },
      data: [{ token: 'raw token' }],
    });
    expect(record.stack).toContain('HTTP 401');
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
