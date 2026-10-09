import { getReportingPolicy } from '../reportingPolicy';
import services from '../reportingServices.json';

const mockExtra: Record<string, unknown> = {};
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      get extra() {
        return mockExtra;
      },
    },
  },
}));

describe('outbound reporting policy', () => {
  const originalDev = __DEV__;
  const originalStorybook = process.env.EXPO_PUBLIC_STORYBOOK_ENABLED;

  beforeEach(() => {
    Object.defineProperty(globalThis, '__DEV__', { value: false, configurable: true });
    process.env.EXPO_PUBLIC_STORYBOOK_ENABLED = 'false';
    mockExtra.reporting = {
      environment: 'production',
      services: { sentry: true, observe: true, insights: true },
    };
  });

  afterEach(() => {
    Object.defineProperty(globalThis, '__DEV__', { value: originalDev });
    if (originalStorybook === undefined) delete process.env.EXPO_PUBLIC_STORYBOOK_ENABLED;
    else process.env.EXPO_PUBLIC_STORYBOOK_ENABLED = originalStorybook;
    delete mockExtra.sentryEnvironment;
  });

  test.each(Object.keys(services) as (keyof typeof services)[])(
    'allows %s only with an explicit production service flag',
    (service) => {
      expect(getReportingPolicy(service)).toEqual({
        environment: 'production',
        enabled: true,
      });
      mockExtra.reporting = { environment: 'production', services: { [service]: false } };
      expect(getReportingPolicy(service).enabled).toBe(false);
      mockExtra.reporting = { environment: 'production' };
      expect(getReportingPolicy(service).enabled).toBe(false);
    },
  );

  test.each(['development', 'preview', 'unknown', undefined])(
    'denies all services for %s even with a production JS bundle',
    (environment) => {
      mockExtra.reporting = {
        environment,
        services: { sentry: true, observe: true, insights: true },
      };
      for (const service of Object.keys(services) as (keyof typeof services)[]) {
        expect(getReportingPolicy(service).enabled).toBe(false);
      }
    },
  );

  test('does not fall back to the legacy Sentry environment when policy is missing', () => {
    delete mockExtra.reporting;
    mockExtra.sentryEnvironment = 'production';
    expect(getReportingPolicy('sentry').enabled).toBe(false);
  });

  test('debug bundles and Storybook cannot open a production configuration', () => {
    Object.defineProperty(globalThis, '__DEV__', { value: true });
    expect(getReportingPolicy('observe').enabled).toBe(false);
    Object.defineProperty(globalThis, '__DEV__', { value: false });
    process.env.EXPO_PUBLIC_STORYBOOK_ENABLED = 'true';
    for (const service of Object.keys(services) as (keyof typeof services)[]) {
      expect(getReportingPolicy(service).enabled).toBe(false);
    }
  });
});
