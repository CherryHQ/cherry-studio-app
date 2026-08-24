import { LoggerService } from '../LoggerService';

describe('LoggerService', () => {
  const originalDevelopment = global.__DEV__;
  let debugSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  let infoSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    infoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    global.__DEV__ = originalDevelopment;
    jest.restoreAllMocks();
  });

  it('keeps handled development errors and warnings out of React Native LogBox', () => {
    global.__DEV__ = true;
    const error = new Error('provider failed');
    const logger = new LoggerService().withContext('chat', { topicId: 'topic-1' });

    logger.error('Response failed', error);
    logger.warn('Background task failed', error);

    expect(infoSpy).toHaveBeenNthCalledWith(
      1,
      '<error> [chat] Response failed',
      { topicId: 'topic-1' },
      error,
    );
    expect(infoSpy).toHaveBeenNthCalledWith(
      2,
      '<warn> [chat] Background task failed',
      { topicId: 'topic-1' },
      error,
    );
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('preserves production logging at the configured level', () => {
    global.__DEV__ = false;
    const logger = new LoggerService();
    logger.setLevel('info');

    logger.error('Response failed');
    logger.warn('Background task failed');
    logger.info('Runtime ready');
    logger.debug('Hidden detail');

    expect(errorSpy).toHaveBeenCalledWith('<error> Response failed');
    expect(warnSpy).toHaveBeenCalledWith('<warn> Background task failed');
    expect(infoSpy).toHaveBeenCalledWith('<info> Runtime ready');
    expect(debugSpy).not.toHaveBeenCalled();
  });

  it('suppresses every log level when disabled', () => {
    const logger = new LoggerService();
    logger.setLevel('none');

    logger.error('Hidden error');
    logger.warn('Hidden warning');
    logger.info('Hidden info');

    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
  });
});
