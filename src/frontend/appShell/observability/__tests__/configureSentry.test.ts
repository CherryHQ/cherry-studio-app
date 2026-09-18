import type { CrashReportingStatus } from '../../../../../modules/crash-reporting';

type Reporting = typeof import('../configureSentry');

const mockStatus = { enabled: false, active: false };
const mockNative = {
  configure: jest.fn<Promise<CrashReportingStatus>, [string, boolean, string]>(),
  getStatus: jest.fn(() => mockStatus),
  setConsent: jest.fn<Promise<CrashReportingStatus>, [boolean]>(),
};
const mockOptions = { enabled: true };
const mockClient = {
  getOptions: () => mockOptions,
  on: jest.fn(),
};
const mockClearBreadcrumbs = jest.fn();
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
  default: {
    expoConfig: { extra: { reporting: { environment: 'production', services: { sentry: true } } } },
  },
}));
jest.mock('@sentry/react-native', () => ({
  init: (options: { beforeSend: typeof mockBeforeSend; enabled: boolean }) => {
    mockBeforeSend = options.beforeSend;
    mockInit(options);
    mockOptions.enabled = options.enabled;
  },
  getClient: () => mockClient,
  getCurrentScope: () => ({ clearBreadcrumbs: mockClearBreadcrumbs }),
  getIsolationScope: () => ({ clearBreadcrumbs: mockClearBreadcrumbs }),
  addBreadcrumb: jest.fn(),
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

// Each test needs fresh module state; the repository's Jest runs CommonJS, so reload via require.
function loadReporting(): Reporting {
  let reporting: Reporting | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- reload module state per test
    reporting = require('../configureSentry') as Reporting;
  });
  if (!reporting) throw new Error('configureSentry did not load');
  return reporting;
}

describe('Sentry consent lifecycle', () => {
  const originalDev = __DEV__;
  const originalDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  const event = { exception: { values: [{ type: 'TypeError', value: 'private response' }] } };

  beforeEach(() => {
    jest.clearAllMocks();
    mockBeforeSend = undefined;
    Object.defineProperty(globalThis, '__DEV__', {
      value: false,
      configurable: true,
      writable: true,
    });
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://public@example.com/1';
    mockStatus.enabled = false;
    mockStatus.active = false;
    mockOptions.enabled = true;
    mockNative.getStatus.mockImplementation(() => mockStatus);
    mockInit.mockReset();
    mockNative.configure.mockImplementation(() => Promise.resolve(mockStatus));
  });

  afterEach(() => {
    Object.defineProperty(globalThis, '__DEV__', { value: originalDev });
    if (originalDsn === undefined) delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    else process.env.EXPO_PUBLIC_SENTRY_DSN = originalDsn;
  });

  test('starts JavaScript reporting as soon as a production grant is active', async () => {
    const reporting = loadReporting();
    await reporting.configureSentry();
    expect(mockInit).not.toHaveBeenCalled();
    mockNative.setConsent.mockResolvedValue({ enabled: true, active: true });
    await reporting.setSentryConsent(true);
    expect(reporting.getSentryConsentStatus()).toEqual({
      enabled: true,
      active: true,
      available: true,
    });
    expect(mockInit).toHaveBeenCalledTimes(1);
    expect(mockSetReporter).toHaveBeenCalledTimes(1);
    expect(mockBeforeSend?.(event, {})).not.toBeNull();
  });

  test('records consent without starting capture when the native owner stays inactive', async () => {
    const reporting = loadReporting();
    await reporting.configureSentry();
    mockNative.setConsent.mockResolvedValue({ enabled: true, active: false });
    await reporting.setSentryConsent(true);
    expect(reporting.getSentryConsentStatus()).toEqual({
      enabled: true,
      active: false,
      available: true,
    });
    expect(mockInit).not.toHaveBeenCalled();
  });

  test('keeps settings unavailable until the native owner has answered', async () => {
    let answer: (status: CrashReportingStatus) => void = () => {};
    mockNative.configure.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    const reporting = loadReporting();
    const configuring = reporting.configureSentry();
    expect(reporting.getSentryConsentStatus().available).toBe(false);
    await expect(reporting.setSentryConsent(true)).rejects.toThrow('unavailable');
    answer({ enabled: true, active: true });
    await configuring;
    expect(reporting.getSentryConsentStatus()).toEqual({
      enabled: true,
      active: true,
      available: true,
    });
    expect(mockInit).toHaveBeenCalledTimes(1);
  });

  test('closes the JS gate before native revocation finishes and reopens it on a new grant', async () => {
    mockStatus.enabled = true;
    mockStatus.active = true;
    const reporting = loadReporting();
    await reporting.configureSentry();
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
    mockNative.setConsent.mockResolvedValue({ enabled: true, active: true });
    await reporting.setSentryConsent(true);
    expect(mockOptions.enabled).toBe(true);
    expect(mockBeforeSend?.(event, {})).not.toBeNull();
    // The existing client is reused; the logger reporter is attached again.
    expect(mockInit).toHaveBeenCalledTimes(1);
    expect(mockSetReporter).toHaveBeenCalledTimes(2);
  });

  test('fails closed when reading native consent or cleaning old reports fails', async () => {
    mockNative.configure.mockRejectedValue(new Error('storage unavailable'));
    const reporting = loadReporting();
    await expect(reporting.configureSentry()).resolves.toBeUndefined();
    expect(mockInit).not.toHaveBeenCalled();
    expect(reporting.getSentryConsentStatus()).toEqual({
      enabled: false,
      active: false,
      available: false,
    });
    await expect(reporting.setSentryConsent(true)).rejects.toThrow('unavailable');
  });

  test('does not capture in development even if a native owner returns stale active state', async () => {
    Object.defineProperty(globalThis, '__DEV__', { value: true });
    mockStatus.enabled = true;
    mockStatus.active = true;
    const reporting = loadReporting();
    await reporting.configureSentry();
    expect(mockInit).not.toHaveBeenCalled();
    expect(mockOptions.enabled).toBe(false);
    expect(reporting.getSentryConsentStatus()).toEqual({
      enabled: true,
      active: false,
      available: true,
    });
  });

  test('keeps the JS gate closed if native revocation rejects', async () => {
    mockStatus.enabled = true;
    mockStatus.active = true;
    const reporting = loadReporting();
    await reporting.configureSentry();
    mockNative.setConsent.mockRejectedValue(new Error('bridge failure'));
    await expect(reporting.setSentryConsent(false)).rejects.toThrow('bridge failure');
    // Restore the last saved choice so the settings switch can retry the disable request.
    expect(reporting.getSentryConsentStatus().enabled).toBe(true);
    expect(reporting.getSentryConsentStatus().active).toBe(false);
    expect(mockBeforeSend?.(event, {})).toBeNull();
  });

  test('ignores a stale native answer after a newer configuration started', async () => {
    let answerFirst: (status: CrashReportingStatus) => void = () => {};
    mockNative.configure.mockReturnValueOnce(
      new Promise((resolve) => {
        answerFirst = resolve;
      }),
    );
    const reporting = loadReporting();
    const first = reporting.configureSentry();
    mockStatus.enabled = false;
    mockStatus.active = false;
    await reporting.configureSentry();
    answerFirst({ enabled: true, active: true });
    await first;
    expect(mockInit).not.toHaveBeenCalled();
    expect(reporting.getSentryConsentStatus().active).toBe(false);
  });

  test('excludes attachment and telemetry items from outgoing JS envelopes', async () => {
    mockStatus.enabled = true;
    mockStatus.active = true;
    const reporting = loadReporting();
    await reporting.configureSentry();
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

  test('installs JS capture before returning from entry for the existing 20260915 grant', async () => {
    const reporting = loadReporting();
    mockNative.getStatus.mockReturnValue({
      enabled: true,
      active: true,
      consentVersion: '20260915',
      initialization: 'ready',
    } as CrashReportingStatus);
    mockNative.configure.mockResolvedValue({ enabled: true, active: true });
    const configuring = reporting.configureSentry();
    expect(mockInit).toHaveBeenCalledTimes(1);
    expect(mockBeforeSend?.(event, {})).not.toBeNull();
    await configuring;
    expect(mockInit).toHaveBeenCalledTimes(1);
  });

  test('does not trust a native grant for a different disclosure', async () => {
    mockNative.getStatus.mockReturnValue({
      enabled: true,
      active: true,
      consentVersion: 'old',
      initialization: 'ready',
    } as CrashReportingStatus);
    const reporting = loadReporting();
    const configuring = reporting.configureSentry();
    expect(mockInit).not.toHaveBeenCalled();
    await configuring;
    expect(mockInit).not.toHaveBeenCalled();
  });

  test('pauses JS reporting after initialization failure and retries after a new grant', async () => {
    mockStatus.enabled = true;
    mockStatus.active = true;
    mockInit.mockImplementationOnce(() => {
      throw new Error('private initialization detail');
    });
    const reporting = loadReporting();
    await reporting.configureSentry();
    expect(mockOptions.enabled).toBe(false);
    expect(mockSetReporter).not.toHaveBeenCalled();
    mockNative.setConsent.mockResolvedValue({ enabled: true, active: true });
    await reporting.setSentryConsent(true);
    expect(mockInit).toHaveBeenCalledTimes(2);
    expect(mockOptions.enabled).toBe(true);
    expect(mockSetReporter).toHaveBeenCalledTimes(1);
    expect(mockBeforeSend?.(event, {})).not.toBeNull();
  });

  test('drops all envelope items after revocation and clears breadcrumbs', async () => {
    mockStatus.enabled = true;
    mockStatus.active = true;
    const reporting = loadReporting();
    await reporting.configureSentry();
    const filterEnvelope = mockClient.on.mock.calls.find(
      ([name]) => name === 'beforeEnvelope',
    )?.[1];
    mockNative.setConsent.mockResolvedValue({ enabled: false, active: false });
    await reporting.setSentryConsent(false);
    const envelope = [{}, [[{ type: 'event' }, event]]];
    expect(filterEnvelope).toBeDefined();
    filterEnvelope(envelope);
    expect(envelope[1]).toEqual([]);
    expect(mockClearBreadcrumbs).toHaveBeenCalled();
  });
});
