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

describe('LoggerService error reporting', () => {
  const originalDev = __DEV__;

  beforeEach(() => {
    Object.defineProperty(globalThis, '__DEV__', {
      value: false,
      configurable: true,
      writable: true,
    });
  });
  afterEach(() => {
    Object.defineProperty(globalThis, '__DEV__', { value: originalDev });
    jest.restoreAllMocks();
  });

  test('reports production errors from existing child loggers without forwarding arbitrary log data', () => {
    const root = new LoggerService();
    const child = root.withContext('JobRuntime', { sessionId: 'private-session' });
    const reporter = jest.fn();
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const dispose = root.setErrorReporter(reporter);
    const error = new Error('failure');

    child.error('private log text', error, {
      operation: 'job.recover',
      responseBody: 'private-response',
    });
    expect(reporter).toHaveBeenCalledWith(error, {
      module: 'JobRuntime',
      operation: 'job.recover',
    });
    expect(consoleError).not.toHaveBeenCalled();
    child.error('context only', { error, operation: 'job.recover', responseBody: 'private' });
    child.warn('warning', error, { operation: 'job.recover' });
    expect(reporter).toHaveBeenCalledTimes(1);

    dispose();
    child.error('after disposal', error, { operation: 'job.recover' });
    expect(reporter).toHaveBeenCalledTimes(1);
  });

  test.each(['writer', 'reporter'])(
    'isolates a failing %s from the other error sink',
    (failure) => {
      const root = new LoggerService();
      const writer = jest.fn(() => {
        if (failure === 'writer') throw new Error('disk full');
      });
      const reporter = jest.fn(() => {
        if (failure === 'reporter') throw new Error('reporting unavailable');
      });
      const removeWriter = installLogWriter(writer);
      const removeReporter = root.setErrorReporter(reporter);
      const error = new Error('failure');
      try {
        expect(() =>
          root.error('boot failed', error, { operation: 'app.initialize' }),
        ).not.toThrow();
        expect(writer).toHaveBeenCalledTimes(1);
        expect(reporter).toHaveBeenCalledWith(error, { module: '', operation: 'app.initialize' });
        root.setLevel('none');
        root.error('suppressed', error, { operation: 'app.initialize' });
        expect(writer).toHaveBeenCalledTimes(1);
        expect(reporter).toHaveBeenCalledTimes(1);
      } finally {
        removeReporter();
        removeWriter();
      }
    },
  );

  test('keeps error logs local unless the call site names a fixed operation', () => {
    const root = new LoggerService();
    const reporter = jest.fn();
    root.setErrorReporter(reporter);
    const error = new Error('provider request failed');

    root.withContext('ProviderClient').error('request failed', error);
    root.withContext('ProviderClient').error('request failed', error, { status: 500 });
    root.withContext('ProviderClient').error('request failed', error, { operation: 42 });
    expect(reporter).not.toHaveBeenCalled();

    root.withContext('Startup', { operation: 'app.initialize' }).error('boot failed', error);
    expect(reporter).toHaveBeenCalledWith(error, {
      module: 'Startup',
      operation: 'app.initialize',
    });
  });

  test('isolates reporting failures and prevents recursive reporting', () => {
    const root = new LoggerService();
    const context = { operation: 'job.finalize.persist' };
    const reporter = jest.fn(() => {
      root.error('reporter failed', new Error('nested error'), context);
      throw new Error('reporting failed');
    });
    root.setErrorReporter(reporter);
    expect(() =>
      root.error('original operation', new Error('original error'), context),
    ).not.toThrow();
    expect(reporter).toHaveBeenCalledTimes(1);
    root.error('next operation', new Error('next error'), context);
    expect(reporter).toHaveBeenCalledTimes(2);
  });
});
