import type { ComposerInputHandle } from '@cherrystudio/ui/components';
import { Composer } from '@cherrystudio/ui/components';
import { type ReactNode, useEffect } from 'react';
import { KeyboardController } from 'react-native-keyboard-controller';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import {
  ComposerProvider,
  useComposerMeta,
  useComposerState,
} from '../../context/ComposerProvider';
import { ComposerDock } from '../ComposerDock';
import { ComposerMenu } from '../ComposerMenu';

type MockMenuItemProps = {
  label: string;
  onPress: () => void;
};

type MockDockProps = {
  children?: ReactNode;
  keyboardTrackingEnabled?: boolean;
};

const mockBlur = jest.fn();
const mockFocus = jest.fn();
const mockLaunchCamera = jest.fn();
const mockLaunchImageLibrary = jest.fn();
const mockPickDocument = jest.fn();
const mockRequestCameraPermission = jest.fn();
const mockKeyboardDismiss = KeyboardController.dismiss as jest.MockedFunction<
  typeof KeyboardController.dismiss
>;
let mockComposerState: ReturnType<typeof useComposerState> | undefined;
let mockDockProps: MockDockProps | undefined;

jest.mock('@cherrystudio/app-icons/icons/camera', () => () => null);
jest.mock('@cherrystudio/app-icons/icons/file', () => () => null);
jest.mock('@cherrystudio/app-icons/icons/images', () => () => null);

jest.mock('@cherrystudio/ui/components', () => {
  const React = jest.requireActual('react');
  const { Pressable, View } = jest.requireActual('react-native');

  function MockMenu({ children }: { children?: ReactNode }) {
    return React.createElement(View, null, children);
  }

  function MockMenuItem(props: MockMenuItemProps) {
    return React.createElement(Pressable, {
      accessibilityLabel: props.label,
      onPress: props.onPress,
    });
  }

  function MockDock(props: MockDockProps) {
    mockDockProps = props;
    return React.createElement(View, null, props.children);
  }

  return { Composer: { Dock: MockDock, Menu: Object.assign(MockMenu, { Item: MockMenuItem }) } };
});

jest.mock('expo-image-picker', () => ({
  UIImagePickerPreferredAssetRepresentationMode: { Compatible: 'compatible' },
  launchCameraAsync: (...args: unknown[]) => mockLaunchCamera(...args),
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunchImageLibrary(...args),
  requestCameraPermissionsAsync: (...args: unknown[]) => mockRequestCameraPermission(...args),
}));

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: (...args: unknown[]) => mockPickDocument(...args),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/shared/core/logger/LoggerService', () => ({
  loggerService: {
    withContext: () => ({ warn: jest.fn() }),
  },
}));

describe('ComposerMenu', () => {
  let renderer: ReactTestRenderer | undefined;
  let frameCallbacks: FrameRequestCallback[];
  let requestAnimationFrameSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockComposerState = undefined;
    mockDockProps = undefined;
    frameCallbacks = [];
    requestAnimationFrameSpy = jest
      .spyOn(global, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        frameCallbacks.push(callback);
        return frameCallbacks.length;
      });
    mockKeyboardDismiss.mockResolvedValue(undefined);
    mockRequestCameraPermission.mockResolvedValue({ granted: true });
    mockLaunchCamera.mockResolvedValue({ canceled: true });
    mockLaunchImageLibrary.mockResolvedValue({ canceled: true });
    mockPickDocument.mockResolvedValue({ canceled: true });
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    requestAnimationFrameSpy.mockRestore();
  });

  it('waits for field dismissal before opening the photo picker', async () => {
    const dismissal = deferred<void>();
    mockKeyboardDismiss.mockReturnValue(dismissal.promise);
    render();

    act(() => press('chat.media.photos'));

    expect(mockKeyboardDismiss).toHaveBeenCalledTimes(1);
    expect(mockBlur).toHaveBeenCalledTimes(1);
    expect(mockDockProps?.keyboardTrackingEnabled).toBe(false);
    expect(mockLaunchImageLibrary).not.toHaveBeenCalled();

    await act(async () => {
      dismissal.resolve();
      await dismissal.promise;
      await flushPromises();
      flushAnimationFrames();
      await flushPromises();
    });

    expect(mockLaunchImageLibrary).toHaveBeenCalledTimes(1);
    expect(mockComposerState?.attachments).toEqual([]);
    expect(mockFocus).not.toHaveBeenCalled();
  });

  it('waits for field dismissal before opening the camera and document pickers', async () => {
    const cameraDismissal = deferred<void>();
    const documentDismissal = deferred<void>();
    mockKeyboardDismiss
      .mockReturnValueOnce(cameraDismissal.promise)
      .mockReturnValueOnce(documentDismissal.promise);
    render();

    act(() => press('chat.media.camera'));
    expect(mockRequestCameraPermission).not.toHaveBeenCalled();
    expect(mockLaunchCamera).not.toHaveBeenCalled();

    await act(async () => {
      cameraDismissal.resolve();
      await cameraDismissal.promise;
      await flushPromises();
      flushAnimationFrames();
      await flushPromises();
    });
    expect(mockRequestCameraPermission).toHaveBeenCalledTimes(1);
    expect(mockLaunchCamera).toHaveBeenCalledTimes(1);

    act(() => press('chat.media.file'));
    expect(mockPickDocument).not.toHaveBeenCalled();

    await act(async () => {
      documentDismissal.resolve();
      await documentDismissal.promise;
      await flushPromises();
      flushAnimationFrames();
      await flushPromises();
    });
    expect(mockPickDocument).toHaveBeenCalledTimes(1);
    expect(mockBlur).toHaveBeenCalledTimes(2);
    expect(mockFocus).not.toHaveBeenCalled();
  });

  it('keeps the field blurred after a document is selected', async () => {
    mockPickDocument.mockResolvedValue({
      assets: [
        {
          mimeType: 'application/pdf',
          name: 'notes.pdf',
          size: 512,
          uri: 'file:///source/notes.pdf',
        },
      ],
      canceled: false,
    });
    render();

    act(() => press('chat.media.file'));
    await act(flushInputReplacement);

    expect(mockComposerState?.attachments).toEqual([
      expect.objectContaining({
        kind: 'file',
        name: 'notes.pdf',
        size: 512,
        uri: 'file:///source/notes.pdf',
      }),
    ]);
    expect(mockBlur).toHaveBeenCalledTimes(1);
    expect(mockFocus).not.toHaveBeenCalled();
    expect(mockDockProps?.keyboardTrackingEnabled).toBe(false);
  });

  it('does not dismiss the field when a caller-owned tool is selected', () => {
    const onToolPress = jest.fn();
    render(<Composer.Menu.Item label="Web search" onPress={onToolPress} />);

    act(() => press('Web search'));

    expect(onToolPress).toHaveBeenCalledTimes(1);
    expect(mockKeyboardDismiss).not.toHaveBeenCalled();
    expect(mockBlur).not.toHaveBeenCalled();
    expect(mockLaunchCamera).not.toHaveBeenCalled();
    expect(mockLaunchImageLibrary).not.toHaveBeenCalled();
    expect(mockPickDocument).not.toHaveBeenCalled();
  });

  function render(children?: ReactNode) {
    act(() => {
      renderer = create(
        <ComposerProvider>
          <ComposerDock onHeightChange={jest.fn()} />
          <FieldProbe />
          <ComposerMenu>{children}</ComposerMenu>
        </ComposerProvider>,
      );
    });
  }

  function press(label: string) {
    const item = renderer?.root
      .findAllByProps({ accessibilityLabel: label })
      .find((node) => typeof node.props.onPress === 'function');

    if (!item) throw new Error(`Missing menu item: ${label}`);
    item.props.onPress();
  }

  function flushAnimationFrames() {
    const callbacks = frameCallbacks;
    frameCallbacks = [];
    callbacks.forEach((callback) => callback(0));
  }

  async function flushInputReplacement() {
    await flushPromises();
    flushAnimationFrames();
    await flushPromises();
  }
});

function FieldProbe() {
  const { inputRef } = useComposerMeta();
  const composerState = useComposerState();

  useEffect(() => {
    mockComposerState = composerState;
    inputRef.current = { blur: mockBlur, focus: mockFocus } as unknown as ComposerInputHandle;
    return () => {
      inputRef.current = null;
    };
  }, [composerState, inputRef]);

  return null;
}

function deferred<TValue>() {
  let resolve!: (value: TValue) => void;
  const promise = new Promise<TValue>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}
