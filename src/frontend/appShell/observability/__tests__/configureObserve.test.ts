import { readFileSync } from 'node:fs';

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
