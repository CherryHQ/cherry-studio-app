import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useIsScreenReaderEnabled } from '../useIsScreenReaderEnabled';

const mockAddEventListener = jest.fn();
const mockIsScreenReaderEnabled = jest.fn();

jest.mock('react-native', () => {
  const native = jest.requireActual('react-native');
  return Object.defineProperty(Object.create(native), 'AccessibilityInfo', {
    value: {
      addEventListener: (name: string, listener: (enabled: boolean) => void) =>
        mockAddEventListener(name, listener),
      isScreenReaderEnabled: () => mockIsScreenReaderEnabled(),
    },
  });
});

describe('useIsScreenReaderEnabled', () => {
  let renderer: ReactTestRenderer | undefined;
  let current: boolean;
  let onChange: (enabled: boolean) => void;
  let resolveInitial: (enabled: boolean) => void;
  let rejectInitial: (error: Error) => void;
  const remove = jest.fn();

  function Probe() {
    current = useIsScreenReaderEnabled();
    return null;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockAddEventListener.mockImplementation((_name, listener) => {
      onChange = listener;
      return { remove };
    });
    mockIsScreenReaderEnabled.mockImplementation(
      () =>
        new Promise<boolean>((resolve, reject) => {
          resolveInitial = resolve;
          rejectInitial = reject;
        }),
    );
    act(() => {
      renderer = create(<Probe />);
    });
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.restoreAllMocks();
  });

  test('reads the initial setting and responds to changes while chat stays open', async () => {
    expect(mockAddEventListener).toHaveBeenCalledWith('screenReaderChanged', expect.any(Function));
    await act(async () => resolveInitial(true));
    expect(current).toBe(true);
    act(() => onChange(false));
    expect(current).toBe(false);
    act(() => onChange(true));
    expect(current).toBe(true);
  });

  test('does not overwrite a newer change with the initial native query', async () => {
    act(() => onChange(true));
    await act(async () => resolveInitial(false));
    expect(current).toBe(true);
  });

  test('keeps the explicit actions available if reading the native setting fails', async () => {
    await act(async () => rejectInitial(new Error('Native status unavailable')));
    expect(current).toBe(true);
  });

  test('removes the native listener and ignores a result after leaving chat', async () => {
    act(() => renderer?.unmount());
    renderer = undefined;
    expect(remove).toHaveBeenCalledTimes(1);
    await act(async () => resolveInitial(true));
    expect(current).toBe(false);
  });
});
