import { ScrollView, StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { PaintingCanvas } from '../PaintingCanvas';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@cherrystudio/ui/components', () => {
  const { View } = jest.requireActual('react-native');

  return { ImageGenerationLoader: (props: { testID?: string }) => <View {...props} /> };
});

jest.mock('lucide-uniwind/png', () => ({
  RotateCcwIcon: () => null,
}));

jest.mock('@/frontend/components/nativePrimitives', () => {
  const { View } = jest.requireActual('react-native');

  return { Image: (props: { testID?: string }) => <View {...props} /> };
});

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
          outputs={[]}
          prompt="draw a cherry orchard"
          resolution={'1536 \u00d7 1024'}
          status="generating"
        />,
      );
    });

    const preview = renderer!.root.find(
      (node) => StyleSheet.flatten(node.props.style)?.aspectRatio !== undefined,
    );

    const previewStyle = StyleSheet.flatten(preview.props.style);
    expect(previewStyle?.aspectRatio).toBeCloseTo(3 / 4);
    expect(previewStyle).toMatchObject({ width: '100%' });
    expect(previewStyle?.height).toBeUndefined();
    expect(previewStyle?.maxWidth).toBeUndefined();

    act(() => {
      preview.props.onLayout({ nativeEvent: { layout: { height: 300, width: 240 } } });
    });
    const loader = renderer!.root.findByProps({ testID: 'painting-generation-loader' });
    expect(loader.props).toMatchObject({
      height: 300,
      label: 'painting.status.generating',
      prompt: 'draw a cherry orchard',
      resolution: '1536 \u00d7 1024',
      width: 240,
    });
  });

  it('calculates a landscape frame from the available width', () => {
    act(() => {
      renderer = create(
        <PaintingCanvas
          aspectRatio={1664 / 928}
          error={null}
          interruption={null}
          outputs={[]}
          prompt="draw a miniature city"
          resolution={'1664 \u00d7 928'}
          status="generating"
        />,
      );
    });

    const preview = renderer!.root.find(
      (node) => StyleSheet.flatten(node.props.style)?.aspectRatio !== undefined,
    );
    const previewStyle = StyleSheet.flatten(preview.props.style);

    expect(previewStyle?.aspectRatio).toBeCloseTo(1664 / 928);
    expect(previewStyle).toMatchObject({ width: '100%' });
    expect(previewStyle?.height).toBeUndefined();
    expect(previewStyle?.maxWidth).toBeUndefined();
  });

  it('shows the first generated image in a bordered fixed frame', () => {
    act(() => {
      renderer = create(
        <PaintingCanvas
          aspectRatio={1}
          error={null}
          interruption={null}
          outputs={[{ fileEntryId: 'output-1', uri: 'file:///output.png' }]}
          prompt="draw a cherry orchard"
          resolution={'1024 \u00d7 1024'}
          status="idle"
        />,
      );
    });

    const frame = renderer!.root.findByProps({ testID: 'painting-output-frame' });
    const border = renderer!.root.find(
      (node) =>
        node.props.pointerEvents === 'none' &&
        node.props.className?.includes('border border-border'),
    );
    const image = renderer!.root.findByProps({ testID: 'painting-output-output-1' });

    expect(frame.props.className).toContain('relative h-full w-full overflow-hidden');
    expect(border.props.className).toContain('absolute inset-0');
    expect(border.props.className).toContain('border border-border');
    expect(renderer!.root.findAllByType(ScrollView)).toHaveLength(0);
    expect(image.props.accessibilityLabel).toBe('painting.output');
  });

  it('keeps the first output fixed until multi-image presentation is implemented', () => {
    act(() => {
      renderer = create(
        <PaintingCanvas
          aspectRatio={1}
          error={null}
          interruption={null}
          outputs={[
            { fileEntryId: 'output-1', uri: 'file:///output-1.png' },
            { fileEntryId: 'output-2', uri: 'file:///output-2.png' },
          ]}
          prompt="draw a cherry orchard"
          resolution={'1024 \u00d7 1024'}
          status="idle"
        />,
      );
    });

    expect(renderer!.root.findByProps({ testID: 'painting-output-output-1' })).toBeDefined();
    expect(renderer!.root.findAllByProps({ testID: 'painting-output-output-2' })).toHaveLength(0);
    expect(renderer!.root.findAllByType(ScrollView)).toHaveLength(0);
  });
});
