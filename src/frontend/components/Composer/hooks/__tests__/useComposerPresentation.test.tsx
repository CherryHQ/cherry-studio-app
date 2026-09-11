import type { ComposerInputHandle } from '@cherrystudio/ui/components';
import { useEffect } from 'react';
import { KeyboardController, KeyboardEvents } from 'react-native-keyboard-controller';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useComposerPresentation } from '../useComposerPresentation';

const blur = jest.fn();
const focus = jest.fn();
const dismiss = KeyboardController.dismiss as jest.MockedFunction<
  typeof KeyboardController.dismiss
>;
const listen = KeyboardEvents.addListener as jest.MockedFunction<typeof KeyboardEvents.addListener>;
const inputRef = { current: { blur, focus } as unknown as ComposerInputHandle };
let presentation: ReturnType<typeof useComposerPresentation>;
let renderer: ReactTestRenderer | undefined;
let frames: FrameRequestCallback[];
let frameSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  dismiss.mockResolvedValue(undefined);
  frames = [];
  frameSpy = jest.spyOn(global, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  act(() => {
    renderer = create(<Harness />);
  });
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
  frameSpy.mockRestore();
});

test.each([true, false])(
  'keyboard hide notifications do not request text focus changes (visible: %s)',
  (visible) => {
    (KeyboardController.isVisible as jest.Mock).mockReturnValue(visible);
    act(() => {
      for (const [event, listener] of listen.mock.calls) {
        if (event === 'keyboardWillHide') listener(KeyboardController.state());
      }
    });
    expect(blur).not.toHaveBeenCalled();
    expect(focus).not.toHaveBeenCalled();
    expect(dismiss).not.toHaveBeenCalled();
    expect(presentation.state.isKeyboardTrackingEnabled).toBe(true);
  },
);

test.each(['selected', 'cancelled', 'failed'] as const)(
  'releases a %s picker without refocusing',
  async (result) => {
    const picker = deferred<string>();
    const present = jest.fn(() => picker.promise);
    let operation!: Promise<unknown>;
    act(() => {
      operation = presentation.actions.runInputReplacement(present).catch(() => 'failed');
    });
    expect(present).not.toHaveBeenCalled();
    expect(presentation.state.isKeyboardTrackingEnabled).toBe(false);
    await act(flushPresentation);
    expect(present).toHaveBeenCalledTimes(1);
    expect(presentation.state.isKeyboardTrackingEnabled).toBe(false);
    await act(async () => {
      if (result === 'failed') picker.reject(new Error('picker failed'));
      else picker.resolve(result);
      expect(await operation).toBe(result);
    });
    expect(presentation.state.isKeyboardTrackingEnabled).toBe(true);
    expect(blur).toHaveBeenCalledTimes(1);
    expect(focus).not.toHaveBeenCalled();
  },
);

test('ignores a competing picker until the active replacement has closed', async () => {
  const sheet = deferred<void>();
  const nextPicker = jest.fn(async () => 'selected');
  let first!: Promise<unknown>;
  act(() => {
    first = presentation.actions.runInputReplacement(() => sheet.promise);
  });
  await act(flushPresentation);
  await act(async () => {
    await presentation.actions.runInputReplacement(nextPicker);
  });
  expect(nextPicker).not.toHaveBeenCalled();
  expect(dismiss).toHaveBeenCalledTimes(1);
  expect(presentation.state.isKeyboardTrackingEnabled).toBe(false);
  await act(async () => {
    sheet.resolve();
    await first;
  });
  expect(presentation.state.isKeyboardTrackingEnabled).toBe(true);
  let next!: Promise<unknown>;
  act(() => {
    next = presentation.actions.runInputReplacement(nextPicker);
  });
  await act(async () => {
    await flushPresentation();
    await next;
  });
  expect(nextPicker).toHaveBeenCalledTimes(1);
  expect(focus).not.toHaveBeenCalled();
});

test('does not present a late picker after leaving the composer', async () => {
  const hidden = deferred<void>();
  dismiss.mockReturnValueOnce(hidden.promise);
  const present = jest.fn(async () => undefined);
  let operation!: Promise<unknown>;
  act(() => {
    operation = presentation.actions.runInputReplacement(present);
  });
  act(() => {
    renderer?.unmount();
    renderer = undefined;
  });
  await act(async () => {
    hidden.resolve();
    await flushPresentation();
    await operation;
  });
  expect(present).not.toHaveBeenCalled();
  expect(focus).not.toHaveBeenCalled();
});

function Harness() {
  const current = useComposerPresentation(inputRef);
  useEffect(() => {
    presentation = current;
  }, [current]);
  return null;
}
async function flushPresentation() {
  await Promise.resolve();
  const pending = frames;
  frames = [];
  pending.forEach((callback) => callback(0));
  await Promise.resolve();
}
function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
