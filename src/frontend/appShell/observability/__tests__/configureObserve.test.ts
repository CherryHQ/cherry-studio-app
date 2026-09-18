import { readFileSync } from 'node:fs';

import { configureObserve } from '../configureObserve';

const mockConfigure = jest.fn();
const mockPolicy = { environment: 'preview', enabled: false };
jest.mock('expo-observe', () => ({
  Observe: { configure: (...args: unknown[]) => mockConfigure(...args) },
}));
jest.mock('../reportingPolicy', () => ({ getReportingPolicy: () => mockPolicy }));

test('closes dispatch in preview while preserving local Router timing', () => {
  configureObserve();
  expect(mockConfigure).toHaveBeenCalledWith({
    environment: 'preview',
    dispatchingEnabled: false,
    dispatchInDebug: false,
    integrations: { 'expo-router': true },
  });
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
