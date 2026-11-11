import { createRef, type Ref, useImperativeHandle } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useSaveImagesToPhotos } from '../useSaveImageToPhotos';

const mockCreateAsset = jest.fn();
const mockToast = { show: jest.fn() };
const mockAlert = { confirm: jest.fn() };
const mockPermissions = {
  getStatuses: jest.fn(async () => ({
    'photos.write': { state: 'granted', canAskAgain: false },
  })),
};

jest.mock('@cherrystudio/ui/components', () => ({
  useAlert: () => ({ alert: mockAlert }),
  useToast: () => ({ toast: mockToast }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/frontend/data', () => ({ useBackendModule: () => mockPermissions }));
jest.mock('expo-media-library', () => ({
  Asset: { create: (uri: string) => mockCreateAsset(uri) },
}));
// An enabled sharing setting must never affect local Photos output.
jest.mock('../useExportWatermark', () => ({
  useExportWatermark: () => () => ({ kind: 'cherry' }),
}));
jest.mock('../prepareImageExport', () => ({
  prepareImageExport: async () => ({ uri: 'file:///signed.png', release() {} }),
}));

type SaveImages = ReturnType<typeof useSaveImagesToPhotos>;
function Probe({ ref }: { ref: Ref<SaveImages> }) {
  const save = useSaveImagesToPhotos();
  useImperativeHandle(ref, () => save, [save]);
  return null;
}

beforeEach(() => {
  jest.clearAllMocks();
  AppState.currentState = 'active';
});

test('saves each original image to Photos even when sharing watermark is enabled', async () => {
  const ref = createRef<SaveImages>();
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<Probe ref={ref} />);
  });
  try {
    await act(async () => {
      await ref.current!(async () => [
        { uri: 'file:///original.jpg' },
        { uri: 'file:///original.webp' },
      ]);
    });
    expect(mockCreateAsset.mock.calls).toEqual([
      ['file:///original.jpg'],
      ['file:///original.webp'],
    ]);
  } finally {
    act(() => renderer.unmount());
  }
});

test('waits for the foreground event before generating images after permission resolves', async () => {
  const ref = createRef<SaveImages>();
  const read = jest.fn(async () => [{ uri: 'file:///new.png' }]);
  const remove = jest.fn();
  let activate!: (state: AppStateStatus) => void;
  const subscribe = jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, listener) => {
      activate = listener as typeof activate;
      return { remove };
    });
  let renderer!: ReactTestRenderer;
  let saving!: Promise<void>;
  act(() => {
    renderer = create(<Probe ref={ref} />);
  });
  try {
    AppState.currentState = 'inactive';
    await act(async () => {
      saving = ref.current!(read);
    });
    expect(read).not.toHaveBeenCalled();
    expect(mockCreateAsset).not.toHaveBeenCalled();
    await act(async () => {
      AppState.currentState = 'active';
      activate('active');
      await saving;
    });
    expect(mockCreateAsset).toHaveBeenCalledWith('file:///new.png');
    expect(remove).toHaveBeenCalledTimes(1);
  } finally {
    act(() => renderer.unmount());
    subscribe.mockRestore();
  }
});

test('unmount cancels a save waiting for the foreground and never generates late images', async () => {
  const ref = createRef<SaveImages>();
  const read = jest.fn(async () => [{ uri: 'file:///late.png' }]);
  const remove = jest.fn();
  const subscribe = jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove });
  let renderer!: ReactTestRenderer;
  let saving!: Promise<void>;
  act(() => {
    renderer = create(<Probe ref={ref} />);
  });
  try {
    AppState.currentState = 'inactive';
    await act(async () => {
      saving = ref.current!(read);
    });
    act(() => renderer.unmount());
    await saving;
    expect(remove).toHaveBeenCalledTimes(1);
    expect(read).not.toHaveBeenCalled();
    expect(mockCreateAsset).not.toHaveBeenCalled();
  } finally {
    AppState.currentState = 'active';
    subscribe.mockRestore();
  }
});
