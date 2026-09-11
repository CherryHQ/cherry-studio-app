import type { ComposerInputHandle } from '@cherrystudio/ui/components';
import { Composer } from '@cherrystudio/ui/components';
import { type ReactNode, useEffect } from 'react';
import { KeyboardController } from 'react-native-keyboard-controller';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { BackendProvider } from '@/frontend/data';
import type { Backend } from '@/shared/contracts';

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
const mockGetCameraPermission = jest.fn();
const mockAlertConfirm = jest.fn();
const mockToastShow = jest.fn();
const backend = {
  permissions: {
    getStatuses: mockGetCameraPermission,
    request: mockRequestCameraPermission,
  },
} as unknown as Backend;
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

  return {
    Composer: { Dock: MockDock, Menu: Object.assign(MockMenu, { Item: MockMenuItem }) },
    useAlert: () => ({ alert: { confirm: mockAlertConfirm } }),
    useToast: () => ({ toast: { show: mockToastShow } }),
  };
});

jest.mock('expo-image-picker', () => ({
  UIImagePickerPreferredAssetRepresentationMode: { Compatible: 'compatible' },
  launchCameraAsync: (...args: unknown[]) => mockLaunchCamera(...args),
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunchImageLibrary(...args),
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
    mockGetCameraPermission.mockResolvedValue({
      'camera.read': { state: 'undetermined', canAskAgain: true },
    });
    mockRequestCameraPermission.mockResolvedValue({
      'camera.read': { state: 'granted', canAskAgain: false },
    });
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
    expect(mockDockProps?.keyboardTrackingEnabled).toBe(true);
  });

  it('does not open the camera after a denial that can still be requested again', async () => {
    mockRequestCameraPermission.mockResolvedValue({
      'camera.read': { state: 'denied', canAskAgain: true },
    });
    render();
    act(() => press('chat.media.camera'));
    await act(flushInputReplacement);

    expect(mockLaunchCamera).not.toHaveBeenCalled();
    expect(mockToastShow).toHaveBeenCalledWith({
      label: 'settings.permissions.camera.notAllowed',
      variant: 'danger',
    });
    expect(mockAlertConfirm).not.toHaveBeenCalled();
  });

  it('offers Settings instead of prompting again after a permanent camera denial', async () => {
    mockGetCameraPermission.mockResolvedValue({
      'camera.read': { state: 'denied', canAskAgain: false },
    });
    render();
    act(() => press('chat.media.camera'));
    await act(flushInputReplacement);

    expect(mockRequestCameraPermission).not.toHaveBeenCalled();
    expect(mockLaunchCamera).not.toHaveBeenCalled();
    expect(mockAlertConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmLabel: 'settings.permissions.openSystemSettings',
        description: 'settings.permissions.camera.denied',
      }),
    );
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

  it('explains native picker failure and releases the dock without requesting focus', async () => {
    mockLaunchImageLibrary.mockRejectedValueOnce(new Error('presentation failed'));
    render();
    act(() => press('chat.media.photos'));
    await act(flushInputReplacement);
    expect(mockToastShow).toHaveBeenCalledWith({
      label: 'chat.input.pickerFailed',
      variant: 'danger',
    });
    expect(mockDockProps?.keyboardTrackingEnabled).toBe(true);
    expect(mockFocus).not.toHaveBeenCalled();
    expect(mockComposerState?.attachments).toEqual([]);
  });

  it('does not offer documents when the caller accepts images only', () => {
    render(undefined, 'images');

    expect(findMenuItem('chat.media.camera')).toBeDefined();
    expect(findMenuItem('chat.media.photos')).toBeDefined();
    expect(findMenuItem('chat.media.file')).toBeUndefined();
  });

  function render(children?: ReactNode, media: 'all' | 'images' = 'all') {
    act(() => {
      renderer = create(
        <BackendProvider backend={backend}>
          <ComposerProvider>
            <ComposerDock onHeightChange={jest.fn()} />
            <FieldProbe />
            <ComposerMenu media={media}>{children}</ComposerMenu>
          </ComposerProvider>
        </BackendProvider>,
      );
    });
  }

  function press(label: string) {
    const item = findMenuItem(label);

    if (!item) throw new Error(`Missing menu item: ${label}`);
    item.props.onPress();
  }

  function findMenuItem(label: string) {
    return renderer?.root
      .findAllByProps({ accessibilityLabel: label })
      .find((node) => typeof node.props.onPress === 'function');
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
