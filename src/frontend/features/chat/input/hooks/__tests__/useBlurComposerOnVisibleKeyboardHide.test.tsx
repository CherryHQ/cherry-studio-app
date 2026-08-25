import { KeyboardController, KeyboardEvents } from 'react-native-keyboard-controller';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useBlurComposerOnVisibleKeyboardHide } from '../useBlurComposerOnVisibleKeyboardHide';

const mockBlur = jest.fn();
const mockRemove = jest.fn();
const mockIsKeyboardVisible = KeyboardController.isVisible as jest.MockedFunction<
  typeof KeyboardController.isVisible
>;
const mockAddKeyboardListener = KeyboardEvents.addListener as jest.MockedFunction<
  typeof KeyboardEvents.addListener
>;
let handleKeyboardWillHide: (() => void) | undefined;
let renderer: ReactTestRenderer | undefined;

describe('useBlurComposerOnVisibleKeyboardHide', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    handleKeyboardWillHide = undefined;
    mockAddKeyboardListener.mockImplementation((event, listener) => {
      if (event === 'keyboardWillHide') {
        handleKeyboardWillHide = () => listener(KeyboardController.state());
      }

      return { remove: mockRemove } as unknown as ReturnType<typeof KeyboardEvents.addListener>;
    });

    act(() => {
      renderer = create(<Harness />);
    });
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('ignores an unmatched hide event while iOS focus is being established', () => {
    mockIsKeyboardVisible.mockReturnValue(false);

    act(() => handleKeyboardWillHide?.());

    expect(mockBlur).not.toHaveBeenCalled();
  });

  test('blurs when a visible keyboard begins hiding', () => {
    mockIsKeyboardVisible.mockReturnValue(true);

    act(() => handleKeyboardWillHide?.());

    expect(mockBlur).toHaveBeenCalledTimes(1);
  });

  test('removes the keyboard listener on unmount', () => {
    act(() => renderer?.unmount());
    renderer = undefined;

    expect(mockRemove).toHaveBeenCalledTimes(1);
  });
});

function Harness() {
  const inputRef = { current: { blur: mockBlur } } as unknown as Parameters<
    typeof useBlurComposerOnVisibleKeyboardHide
  >[0];

  useBlurComposerOnVisibleKeyboardHide(inputRef);

  return null;
}
