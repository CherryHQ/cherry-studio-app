import { readFileSync } from 'node:fs';

import { configureObserve } from '../configureObserve';

const mockConfigure = jest.fn();
const mockGetObserve = jest.fn();
const mockPolicy = { environment: 'preview', enabled: false };
jest.mock('../getObserve', () => ({ getObserve: () => mockGetObserve() }));
jest.mock('../reportingPolicy', () => ({ getReportingPolicy: () => mockPolicy }));

beforeEach(() => {
  mockConfigure.mockClear();
  mockGetObserve.mockReturnValue({ Observe: { configure: mockConfigure } });
});

test('closes dispatch when JS configuration disables a linked SDK', () => {
  configureObserve();
  expect(mockConfigure).toHaveBeenCalledWith({
    environment: 'preview',
    dispatchingEnabled: false,
    dispatchInDebug: false,
    integrations: { 'expo-router': true },
  });
});

test('does not configure an SDK excluded from the binary', () => {
  mockGetObserve.mockReturnValue(null);
  configureObserve();
  expect(mockConfigure).not.toHaveBeenCalled();
});

// The Expo Router integration fetches the main session on every page focus.
describe('expo-app-metrics main session patch', () => {
  test('keeps one main session wrapper alive for the whole process', () => {
    const patch = readFileSync(`${process.cwd()}/patches/expo-app-metrics@57.0.17.patch`, 'utf8');

    expect(patch).toContain('+let mainSession: Session | undefined;');
    expect(patch).toContain(
      '+AppMetrics.getMainSession = () => (mainSession ??= getMainSession());',
    );
  });
});
