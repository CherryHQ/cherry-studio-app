const mockConfigureSentry = jest.fn().mockResolvedValue(undefined);
const mockConfigureObserve = jest.fn();
const mockObserveImported = jest.fn();
const mockWarn = jest.fn();
type Reporting = typeof import('../reportingRegistry');

jest.mock('@logger', () => ({ loggerService: { withContext: () => ({ warn: mockWarn }) } }));
jest.mock('../configureSentry', () => ({ configureSentry: mockConfigureSentry }));
jest.mock('../configureObserve', () => {
  mockObserveImported();
  return { configureObserve: mockConfigureObserve };
});

test('installs entry capture synchronously before importing Router-dependent reporting', () => {
  jest.clearAllMocks();
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- exercise entry module evaluation
    const { configureReporting } = require('../reportingRegistry') as Reporting;
    configureReporting('entry');
    expect(mockConfigureSentry).toHaveBeenCalledTimes(1);
    expect(mockObserveImported).not.toHaveBeenCalled();
    configureReporting('layout');
    expect(mockObserveImported).toHaveBeenCalledTimes(1);
    expect(mockConfigureObserve).toHaveBeenCalledTimes(1);
    expect(mockConfigureSentry).toHaveBeenCalledTimes(1);
  });
});

test('a reporting failure does not interrupt startup or the next phase', async () => {
  jest.clearAllMocks();
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- isolate registration state
    const { configureReporting } = require('../reportingRegistry') as Reporting;
    mockConfigureSentry.mockRejectedValueOnce(new Error('initialization failed'));
    expect(() => configureReporting('entry')).not.toThrow();
    mockConfigureObserve.mockImplementationOnce(() => {
      throw new Error('native unavailable');
    });
    expect(() => configureReporting('layout')).not.toThrow();
  });
  await Promise.resolve();
  expect(mockWarn).toHaveBeenCalledTimes(2);
});
