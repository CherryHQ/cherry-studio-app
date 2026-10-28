import { BackHandler } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useFocusedBackPress } from '../useFocusedBackPress';

let mockFocused = true;
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    const isFocused = mockFocused;
    useEffect(() => (isFocused ? effect() : undefined), [effect, isFocused]);
  },
}));

// The latest subscription runs first, as on Android.
type BackListener = Parameters<typeof BackHandler.addEventListener>[1];
const backListeners: BackListener[] = [];
function pressBack() {
  act(() => {
    backListeners
      .toReversed()
      .some((listener) => listener({ timeStamp: 0, type: 'hardwareBackPress' }));
  });
}

const onBack = jest.fn();
function Probe({ enabled }: { enabled: boolean }) {
  useFocusedBackPress(onBack, enabled);
  return null;
}

let renderer: ReactTestRenderer | undefined;
beforeEach(() => {
  mockFocused = true;
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, listener) => {
    backListeners.push(listener);
    return { remove: () => backListeners.splice(backListeners.indexOf(listener), 1) };
  });
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
  backListeners.length = 0;
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

test('takes back while its route is focused and the layer is enabled', () => {
  const navigatorBack = jest.fn(() => true);
  backListeners.push(navigatorBack);
  act(() => {
    renderer = create(<Probe enabled />);
  });

  pressBack();
  expect(onBack).toHaveBeenCalledTimes(1);
  expect(navigatorBack).not.toHaveBeenCalled();

  act(() => renderer?.update(<Probe enabled={false} />));
  pressBack();
  expect(onBack).toHaveBeenCalledTimes(1);
  expect(navigatorBack).toHaveBeenCalledTimes(1);
});

test('leaves back to a route pushed over the layer', () => {
  const navigatorBack = jest.fn(() => true);
  backListeners.push(navigatorBack);
  act(() => {
    renderer = create(<Probe enabled />);
  });

  mockFocused = false;
  act(() => renderer?.update(<Probe enabled />));
  pressBack();
  expect(navigatorBack).toHaveBeenCalledTimes(1);
  expect(onBack).not.toHaveBeenCalled();
});
