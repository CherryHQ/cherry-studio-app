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
    child.error('context only', { error, responseBody: 'private-response' });
    child.warn('warning', error);
    expect(reporter).toHaveBeenCalledTimes(1);

    dispose();
    child.error('after disposal', error);
    expect(reporter).toHaveBeenCalledTimes(1);
  });

  test('isolates reporting failures and prevents recursive reporting', () => {
    const root = new LoggerService();
    const reporter = jest.fn(() => {
      root.error('reporter failed', new Error('nested error'));
      throw new Error('reporting failed');
    });
    root.setErrorReporter(reporter);
    expect(() => root.error('original operation', new Error('original error'))).not.toThrow();
    expect(reporter).toHaveBeenCalledTimes(1);
    root.error('next operation', new Error('next error'));
    expect(reporter).toHaveBeenCalledTimes(2);
  });
});
