import { BackHandler } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { FileEntryId } from '@/shared/data/types/file';

import type { FilePane } from '../FilePaneProvider';
import { useFilePaneBackPress } from '../useFilePaneBackPress';

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

const pane: FilePane = {
  close: jest.fn(),
  closeFile: jest.fn(),
  file: null,
  isAvailable: true,
  isCarried: false,
  isExpanded: false,
  isOpen: true,
  open: jest.fn(),
  openFile: jest.fn(),
  recordTouch: jest.fn(),
  setExpanded: jest.fn(),
};

function Probe({ value }: { value: FilePane }) {
  useFilePaneBackPress(value, true);
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

test('steps back through an expanded preview, the preview, and then the pane', () => {
  const file = { entryId: 'file-1' as FileEntryId };
  act(() => {
    renderer = create(<Probe value={{ ...pane, file, isExpanded: true }} />);
  });
  pressBack();
  expect(pane.setExpanded).toHaveBeenCalledWith(false);

  act(() => renderer?.update(<Probe value={{ ...pane, file }} />));
  pressBack();
  expect(pane.closeFile).toHaveBeenCalledTimes(1);

  act(() => renderer?.update(<Probe value={pane} />));
  pressBack();
  expect(pane.close).toHaveBeenCalledTimes(1);
});

test('leaves back to a route pushed over the chat, such as the trash opened from the pane', () => {
  const navigatorBack = jest.fn(() => true);
  backListeners.push(navigatorBack);
  act(() => {
    renderer = create(<Probe value={pane} />);
  });

  mockFocused = false;
  act(() => renderer?.update(<Probe value={pane} />));
  pressBack();
  expect(navigatorBack).toHaveBeenCalledTimes(1);
  expect(pane.close).not.toHaveBeenCalled();
});
