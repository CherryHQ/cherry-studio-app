import { LoggerService } from '../LoggerService';

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
