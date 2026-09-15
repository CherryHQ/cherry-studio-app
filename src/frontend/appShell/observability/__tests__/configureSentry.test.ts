import type { CrashReportingStatus } from '../../../../../modules/crash-reporting';

const mockStatus = { enabled: false, active: false };
const mockNative = {
  configure: jest.fn(() => mockStatus),
  getStatus: jest.fn(() => mockStatus),
  setConsent: jest.fn<Promise<CrashReportingStatus>, [boolean]>(),
};
const mockOptions = { enabled: true };
const mockClient = { getOptions: () => mockOptions, on: jest.fn() };
const mockInit = jest.fn();
const mockRemoveReporter = jest.fn();
const mockSetReporter = jest.fn(() => mockRemoveReporter);
let mockBeforeSend: ((event: unknown, hint: unknown) => unknown) | undefined;

jest.mock('../../../../../modules/crash-reporting', () => ({
  getCrashReporting: () => mockNative,
}));
jest.mock('@logger', () => ({ loggerService: { setErrorReporter: mockSetReporter } }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { sentryEnvironment: 'production' } } },
}));
jest.mock('@sentry/react-native', () => ({
  init: (options: { beforeSend: typeof mockBeforeSend }) => {
    mockBeforeSend = options.beforeSend;
    mockInit(options);
  },
  getClient: () => mockClient,
  captureException: jest.fn(),
  reactNativeErrorHandlersIntegration: jest.fn(),
  nativeLinkedErrorsIntegration: jest.fn(),
  inboundFiltersIntegration: jest.fn(),
  functionToStringIntegration: jest.fn(),
  dedupeIntegration: jest.fn(),
  nativeReleaseIntegration: jest.fn(),
  deviceContextIntegration: jest.fn(),
  sdkInfoIntegration: jest.fn(),
  createReactNativeRewriteFrames: jest.fn(),
}));

describe('Sentry consent lifecycle', () => {
  const originalDev = __DEV__;
  const originalDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    Object.defineProperty(globalThis, '__DEV__', {
      value: false,
      configurable: true,
      writable: true,
    });
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://public@example.com/1';
    mockStatus.enabled = false;
    mockStatus.active = false;
    mockOptions.enabled = true;
    mockNative.configure.mockImplementation(() => mockStatus);
  });

  afterEach(() => {
    Object.defineProperty(globalThis, '__DEV__', { value: originalDev });
    if (originalDsn === undefined) delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    else process.env.EXPO_PUBLIC_SENTRY_DSN = originalDsn;
  });

  test('does not initialize capture until the native owner confirms an active grant', async () => {
    const reporting = await import('../configureSentry');
    reporting.configureSentry();
    expect(mockInit).not.toHaveBeenCalled();
    mockNative.setConsent.mockResolvedValue({ enabled: true, active: false });
    await reporting.setSentryConsent(true);
    expect(reporting.getSentryConsentStatus()).toEqual({
      enabled: true,
      active: false,
      available: true,
    });
    expect(mockInit).not.toHaveBeenCalled();
  });

  test('closes the JS gate before native revocation finishes and stays closed after a new grant', async () => {
    mockStatus.enabled = true;
    mockStatus.active = true;
    const reporting = await import('../configureSentry');
    reporting.configureSentry();
    const event = { exception: { values: [{ type: 'TypeError', value: 'private response' }] } };
    expect(mockBeforeSend?.(event, {})).not.toBeNull();
    let finish: (status: CrashReportingStatus) => void = () => {};
    mockNative.setConsent.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const disabling = reporting.setSentryConsent(false);
    expect(mockOptions.enabled).toBe(false);
    expect(mockRemoveReporter).toHaveBeenCalled();
    expect(mockBeforeSend?.(event, {})).toBeNull();
    finish({ enabled: false, active: false });
    await disabling;
    mockNative.setConsent.mockResolvedValue({ enabled: true, active: false });
    await reporting.setSentryConsent(true);
    expect(mockBeforeSend?.(event, {})).toBeNull();
    expect(mockInit).toHaveBeenCalledTimes(1);
  });

  test('fails closed when reading native consent or cleaning old reports fails', async () => {
    mockNative.configure.mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    const reporting = await import('../configureSentry');
    expect(() => reporting.configureSentry()).not.toThrow();
    expect(mockInit).not.toHaveBeenCalled();
    expect(reporting.getSentryConsentStatus().active).toBe(false);
  });

  test('does not capture in development even if a native owner returns stale active state', async () => {
    Object.defineProperty(globalThis, '__DEV__', { value: true });
    mockStatus.enabled = true;
    mockStatus.active = true;
    const reporting = await import('../configureSentry');
    reporting.configureSentry();
    expect(mockInit).not.toHaveBeenCalled();
    expect(mockOptions.enabled).toBe(false);
    expect(reporting.getSentryConsentStatus().active).toBe(false);
  });

  test('keeps the JS gate closed if native revocation rejects', async () => {
    mockStatus.enabled = true;
    mockStatus.active = true;
    const reporting = await import('../configureSentry');
    reporting.configureSentry();
    mockNative.setConsent.mockRejectedValue(new Error('bridge failure'));
    await expect(reporting.setSentryConsent(false)).rejects.toThrow('bridge failure');
    // Restore the last saved choice so the settings switch can retry the disable request.
    expect(reporting.getSentryConsentStatus().enabled).toBe(true);
    expect(reporting.getSentryConsentStatus().active).toBe(false);
    expect(mockBeforeSend?.({ exception: { values: [{ type: 'Error' }] } }, {})).toBeNull();
  });

  test('excludes attachment and telemetry items from outgoing JS envelopes', async () => {
    mockStatus.enabled = true;
    mockStatus.active = true;
    const reporting = await import('../configureSentry');
    reporting.configureSentry();
    const filterEnvelope = mockClient.on.mock.calls.find(
      ([name]) => name === 'beforeEnvelope',
    )?.[1];
    const eventItem = [{ type: 'event' }, { exception: { values: [{ type: 'Error' }] } }];
    const envelope = [
      {},
      [eventItem, [{ type: 'attachment' }, 'private bytes'], [{ type: 'session' }, {}]],
    ];
    expect(filterEnvelope).toBeDefined();
    filterEnvelope(envelope);
    expect(envelope[1]).toEqual([eventItem]);
  });
});
