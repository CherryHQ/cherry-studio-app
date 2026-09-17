import { Platform } from 'react-native';

import { KeepAliveCoordinator, type KeepAliveSource } from '../KeepAliveCoordinator';

type OnInterrupt = (reason: Error) => void | Promise<void>;

function createSource() {
  const release = jest.fn();
  const acquire = jest.fn((_tag: string, _onInterrupt?: OnInterrupt) => ({ release }));
  return { acquire, release, source: { acquire } satisfies KeepAliveSource };
}

describe('KeepAliveCoordinator', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('hands iOS leases to the audio source and Android leases to the foreground service', async () => {
    for (const [platform, selected] of [
      ['ios', 'audio'],
      ['android', 'android'],
    ] as const) {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: platform });
      const audio = createSource();
      const android = createSource();
      const coordinator = new KeepAliveCoordinator(audio.source, android.source);
      await coordinator._doInit();
      const onInterrupt = jest.fn();

      const lease = coordinator.acquire('job.painting.generate', onInterrupt);
      lease.release();

      const chosen = selected === 'audio' ? audio : android;
      const other = selected === 'audio' ? android : audio;
      expect(chosen.acquire).toHaveBeenCalledWith('job.painting.generate', onInterrupt);
      expect(chosen.release).toHaveBeenCalledTimes(1);
      expect(other.acquire).not.toHaveBeenCalled();
      await coordinator._doStop();
    }
  });

  test('no-ops on platforms without a mechanism', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    const audio = createSource();
    const android = createSource();
    const coordinator = new KeepAliveCoordinator(audio.source, android.source);
    await coordinator._doInit();

    coordinator.acquire('chat').release();

    expect(audio.acquire).not.toHaveBeenCalled();
    expect(android.acquire).not.toHaveBeenCalled();
    await coordinator._doStop();
  });

  test('no-ops after stop so a late consumer cannot reach a stopped source', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    const audio = createSource();
    const android = createSource();
    const coordinator = new KeepAliveCoordinator(audio.source, android.source);
    await coordinator._doInit();
    await coordinator._doStop();

    coordinator.acquire('late').release();

    expect(audio.acquire).not.toHaveBeenCalled();
  });
});
