import { StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { PaintingCanvas } from '../PaintingCanvas';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@shopify/react-native-skia', () => ({
  useImage: () => null,
}));

jest.mock('lucide-uniwind/png', () => ({
  RotateCcwIcon: () => null,
}));

jest.mock('react-native-reanimated', () => ({
  runOnJS: (callback: (...args: unknown[]) => unknown) => callback,
  useSharedValue: (value: number) => ({ value }),
  withTiming: (value: number) => value,
}));

jest.mock('@/frontend/components/paintingSkeleton', () => ({
  PaintingSkeleton: () => null,
}));

describe('PaintingCanvas', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('uses the requested ratio for the loading and result frame', () => {
    act(() => {
      renderer = create(
        <PaintingCanvas
          aspectRatio={3 / 4}
          error={null}
          interruption={null}
          onRevealFinish={jest.fn()}
          outputs={[]}
          status="generating"
        />,
      );
    });

    const preview = renderer!.root.find(
      (node) => StyleSheet.flatten(node.props.style)?.aspectRatio !== undefined,
    );

    expect(StyleSheet.flatten(preview.props.style)?.aspectRatio).toBeCloseTo(3 / 4);
  });
});
