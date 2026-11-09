import { createRef, type Ref, useImperativeHandle } from 'react';
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
