import type { ReactNode } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ResolvedImageGenerationMode } from '../../utils/imageGenerationParams';
import { PaintingSettingsBottomSheet } from '../PaintingSettingsBottomSheet';

let mockBottomSheetProps: Record<string, unknown> = {};

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@swmansion/react-native-bottom-sheet', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return {
    ModalBottomSheet: (props: { children: ReactNode }) => {
      mockBottomSheetProps = props;
      return <MockView testID="modal-bottom-sheet">{props.children}</MockView>;
    },
  };
});

jest.mock('expo-glass-effect', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return { GlassView: MockView };
});

jest.mock('heroui-native/input', () => {
  const { TextInput: MockTextInput } = jest.requireActual('react-native');

  return { Input: MockTextInput };
});

jest.mock('heroui-native/switch', () => {
  const { Pressable: MockPressable } = jest.requireActual('react-native');

  return { Switch: (props: Record<string, unknown>) => <MockPressable {...props} /> };
});

jest.mock('heroui-native/slider', () => {
  const { View: MockView } = jest.requireActual('react-native');

  function MockSlider({ children, ...props }: { children?: ReactNode }) {
    return <MockView {...props}>{children}</MockView>;
  }
  MockSlider.Track = ({ children }: { children?: ReactNode }) => <MockView>{children}</MockView>;
  MockSlider.Fill = MockView;
  MockSlider.Thumb = MockView;

  return { Slider: MockSlider };
});

jest.mock('heroui-native/select', () => {
  const { View: MockView } = jest.requireActual('react-native');

  function MockSelect({ children, ...props }: { children?: ReactNode }) {
    return (
      <MockView testID="mock-select" {...props}>
        {children}
      </MockView>
    );
  }
  MockSelect.Trigger = MockView;
  MockSelect.Value = MockView;
  MockSelect.Portal = MockView;
  MockSelect.Overlay = MockView;
  MockSelect.Content = MockView;
  MockSelect.Item = MockView;
  MockSelect.ItemLabel = MockView;
  MockSelect.ItemIndicator = MockView;

  return { Select: MockSelect };
});

jest.mock('lucide-uniwind/png', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return { ChevronDownIcon: MockView, XIcon: MockView };
});

jest.mock('@/config/constants', () => ({
  isLiquidGlassAvailable: false,
  paintingSheetOuterInset: 8,
  sheetScrimColor: '#00000066',
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 34, left: 0, right: 0, top: 59 }),
}));

const resolvedMode = {
  definition: {
    supports: {
      size: {
        default: '1024x1024',
        options: ['1024x1024', '1024x768'],
        render: 'chips',
        type: 'enum',
      },
      customSize: {
        maxSide: 2048,
        minSide: 512,
        pairedEnumKey: 'size',
        type: 'size',
      },
      numImages: { default: 1, max: 4, min: 1, type: 'range' },
      quality: { default: 'high', options: ['low', 'high'], type: 'enum' },
      promptEnhancement: { default: true, type: 'switch' },
      negativePrompt: { multiline: true, type: 'text' },
    },
  },
  mode: 'generate',
} satisfies ResolvedImageGenerationMode;

describe('PaintingSettingsBottomSheet', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
  });

  it('writes every Registry field type and dismisses after closing', () => {
    const onDismiss = jest.fn();
    const onValueChange = jest.fn();

    act(() => {
      renderer = create(
        <PaintingSettingsBottomSheet
          onDismiss={onDismiss}
          onValueChange={onValueChange}
          resolvedMode={resolvedMode}
          values={{
            customSize_height: '768',
            customSize_width: '1024',
            negativePrompt: '',
            numImages: 1,
            promptEnhancement: true,
            quality: 'high',
            size: 'custom',
          }}
        />,
      );
    });

    if (!renderer) {
      throw new Error('PaintingSettingsBottomSheet test renderer was not created.');
    }

    expect(mockBottomSheetProps.detents).toEqual([0, 'content']);
    expect(
      StyleSheet.flatten(
        renderer.root.findByProps({ testID: 'painting-settings-sheet' }).props.style,
      ),
    ).toMatchObject({ borderBottomLeftRadius: 42, borderTopLeftRadius: 34 });
    expect(
      StyleSheet.flatten(
        renderer.root.findByProps({ testID: 'painting-settings-sheet-bottom-gap' }).props.style,
      ).height,
    ).toBe(8);
    expect(
      StyleSheet.flatten(
        renderer.root.findByProps({ testID: 'painting-settings-header' }).props.style,
      ),
    ).toMatchObject({ height: 60, paddingHorizontal: 12, paddingTop: 12 });

    act(() =>
      renderer?.root
        .findByProps({ accessibilityLabel: 'painting.settings.param.promptEnhancement' })
        .props.onSelectedChange(false),
    );
    act(() =>
      renderer?.root
        .findByProps({ accessibilityLabel: 'painting.settings.param.numImages' })
        .props.onChange([3]),
    );
    act(() =>
      renderer?.root
        .findByProps({ accessibilityLabel: 'painting.settings.param.negativePrompt' })
        .props.onChangeText('no blur'),
    );
    act(() =>
      renderer?.root.findByProps({ testID: 'mock-select' }).props.onValueChange({ value: 'low' }),
    );
    const squareChip = renderer.root.findAll(
      (node) =>
        typeof node.props.onPress === 'function' &&
        node.props.accessibilityState?.selected === false,
    )[0];
    act(() => squareChip.props.onPress());
    act(() =>
      renderer?.root
        .findByProps({ accessibilityLabel: 'painting.settings.width' })
        .props.onChangeText('1536'),
    );
    act(() =>
      renderer?.root
        .findByProps({ accessibilityLabel: 'painting.settings.height' })
        .props.onChangeText('1024'),
    );

    expect(onValueChange.mock.calls).toEqual(
      expect.arrayContaining([
        ['promptEnhancement', false],
        ['numImages', 3],
        ['negativePrompt', 'no blur'],
        ['quality', 'low'],
        ['size', '1024x1024'],
        ['customSize_width', '1536'],
        ['customSize_height', '1024'],
      ]),
    );

    act(() => renderer?.root.findByProps({ testID: 'painting-settings-close' }).props.onPress());
    expect(mockBottomSheetProps.index).toBe(0);
    act(() => (mockBottomSheetProps.onSettle as (index: number) => void)(0));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('hides custom dimensions until the paired enum selects custom', () => {
    act(() => {
      renderer = create(
        <PaintingSettingsBottomSheet
          onDismiss={jest.fn()}
          onValueChange={jest.fn()}
          resolvedMode={resolvedMode}
          values={{ size: '1024x1024' }}
        />,
      );
    });

    expect(
      renderer?.root
        .findAllByType(TextInput)
        .filter((input) => input.props.accessibilityLabel === 'painting.settings.width'),
    ).toHaveLength(0);
  });
});
