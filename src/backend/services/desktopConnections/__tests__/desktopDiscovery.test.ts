import { requireOptionalNativeModule } from 'expo';

import { DesktopDiscovery } from '../desktopDiscovery';

jest.mock('expo', () => ({ requireOptionalNativeModule: jest.fn() }));

it('shares one browser, stops at the last subscriber and discards events from a previous foreground lifetime', () => {
  let listener: (event: unknown) => void = () => {};
  let generation = 0;
  let browsing = false;
  const native = {
    addListener: (_event: string, receive: typeof listener) => {
      listener = receive;
      return { remove() {} };
    },
    start: (next: number) => {
      generation = next;
    },
    setBrowsing: (value: boolean) => {
      browsing = value;
    },
    stop: () => {
      browsing = false;
    },
  };
  jest.mocked(requireOptionalNativeModule).mockReturnValue(native as never);
  const received: unknown[] = [];
  const discovery = new DesktopDiscovery((event) => received.push(event));
  discovery.setActive(true);
  const first = discovery.browse();
  const second = discovery.browse();
  first();
  expect(browsing).toBe(true);
  const previous = generation;
  const oldListener = listener;
  discovery.setActive(false);
  expect(browsing).toBe(false);
  discovery.setActive(true);
  listener({ type: 'network', generation: previous });
  oldListener({ type: 'network', generation: previous });
  expect(received).toEqual([]);
  listener({ type: 'network', generation });
  expect(received).toEqual([{ type: 'network', generation }]);
  expect(browsing).toBe(true);
  second();
  second();
  expect(browsing).toBe(false);
  discovery.setActive(false);
});

it('reports an old native client as unavailable without throwing or opening a browser', () => {
  jest.mocked(requireOptionalNativeModule).mockReturnValue(null);
  const received: unknown[] = [];
  const discovery = new DesktopDiscovery((event) => received.push(event));
  discovery.setActive(true);
  const stop = discovery.browse();
  expect(received).toEqual([{ type: 'unavailable' }]);
  stop();
  discovery.setActive(false);
});
