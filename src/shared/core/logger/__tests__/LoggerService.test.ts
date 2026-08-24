import { Platform } from 'react-native';

import { LoggerService } from '../LoggerService';

describe('LoggerService', () => {
  const originalDevelopment = global.__DEV__;
  const originalPlatform = Platform.OS;
  let debugSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  let infoSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    infoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    global.__DEV__ = originalDevelopment;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
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

  it('preserves error and warning severity in web development', () => {
    global.__DEV__ = true;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    const logger = new LoggerService();

    logger.error('Response failed');
    logger.warn('Background task failed');

    expect(errorSpy).toHaveBeenCalledWith('<error> Response failed');
    expect(warnSpy).toHaveBeenCalledWith('<warn> Background task failed');
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it('suppresses production logging', () => {
    global.__DEV__ = false;
    const logger = new LoggerService();
    logger.setLevel('info');

    logger.error('Response failed');
    logger.warn('Background task failed');
    logger.info('Runtime ready');
    logger.debug('Hidden detail');

    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(debugSpy).not.toHaveBeenCalled();
  });

  it('suppresses every log level when disabled', () => {
    global.__DEV__ = true;
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
