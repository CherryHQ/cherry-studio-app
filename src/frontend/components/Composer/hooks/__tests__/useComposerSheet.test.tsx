import { useEffect } from 'react';
import { KeyboardController } from 'react-native-keyboard-controller';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ComposerProvider, useComposerPresentationState } from '../../context/ComposerProvider';
import { useComposerSheet } from '../useComposerSheet';

jest.mock('@cherrystudio/ui/components', () => ({
  useToast: () => ({ toast: { show: jest.fn() } }),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

let sheet: ReturnType<typeof useComposerSheet>;
let tracking = true;
let renderer: ReactTestRenderer | undefined;
let frames: FrameRequestCallback[];
let frameSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  (KeyboardController.dismiss as jest.Mock).mockResolvedValue(undefined);
  frames = [];
  frameSpy = jest.spyOn(global, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  act(() => {
    renderer = create(
      <ComposerProvider>
        <Harness />
      </ComposerProvider>,
    );
  });
});

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
  frameSpy.mockRestore();
});

test('keeps replacement ownership through the open sheet and allows reopening after close', async () => {
  act(() => {
    sheet.open();
    sheet.open();
  });
  expect(sheet.isOpen).toBe(false);
  expect(tracking).toBe(false);
  await act(flushFrame);
  expect(sheet.isOpen).toBe(true);
  expect(tracking).toBe(false);
  expect(KeyboardController.dismiss).toHaveBeenCalledTimes(1);

  act(() => {
    void sheet.close();
  });
  expect(sheet.isOpen).toBe(false);
  expect(tracking).toBe(false);
  await act(flushFrame);
  expect(tracking).toBe(true);
  act(() => sheet.open());
  await act(flushFrame);
  expect(sheet.isOpen).toBe(true);
  expect(KeyboardController.dismiss).toHaveBeenCalledTimes(2);
});

test('leaving before dismissal finishes prevents the delayed sheet from opening', async () => {
  let dismiss!: () => void;
  (KeyboardController.dismiss as jest.Mock).mockReturnValueOnce(
    new Promise<void>((resolve) => {
      dismiss = resolve;
    }),
  );
  act(() => sheet.open());
  act(() => {
    renderer?.unmount();
    renderer = undefined;
  });
  await act(async () => {
    dismiss();
    await flushFrame();
  });
  expect(sheet.isOpen).toBe(false);
});

function Harness() {
  const current = useComposerSheet();
  const state = useComposerPresentationState();
  useEffect(() => {
    sheet = current;
    tracking = state.isKeyboardTrackingEnabled;
  }, [current, state]);
  return null;
}

async function flushFrame() {
  await Promise.resolve();
  const pending = frames;
  frames = [];
  pending.forEach((callback) => callback(0));
  await Promise.resolve();
}
