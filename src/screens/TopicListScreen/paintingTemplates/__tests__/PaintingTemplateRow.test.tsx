import type { ReactNode } from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { PaintingTemplateRow } from '../PaintingTemplateRow';
import { paintingTemplates } from '../paintingTemplates';

let mockBottomSheetProps: Record<string, unknown> = {};

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { title?: string }) =>
      values?.title ? `${key}:${values.title}` : key,
  }),
}));

jest.mock('@swmansion/react-native-bottom-sheet', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return {
    ModalBottomSheet: (props: { children: ReactNode; surface?: ReactNode }) => {
      mockBottomSheetProps = props;
      return (
        <MockView testID="modal-bottom-sheet">
          {props.surface}
          {props.children}
        </MockView>
      );
    },
  };
});

jest.mock('expo-glass-effect', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return {
    GlassView: MockView,
  };
});

jest.mock('heroui-native/button', () => {
  const { Pressable: MockPressable, Text: MockText } = jest.requireActual('react-native');

  const MockButton = ({
    children,
    isDisabled,
    ...props
  }: {
    children?: ReactNode;
    isDisabled?: boolean;
  }) => (
    <MockPressable disabled={isDisabled} {...props}>
      {children}
    </MockPressable>
  );
  function MockButtonLabel({ children, ...props }: { children?: ReactNode }) {
    return <MockText {...props}>{children}</MockText>;
  }
  MockButton.Label = MockButtonLabel;

  return { Button: MockButton };
});

jest.mock('lucide-uniwind/png', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return { XIcon: MockView };
});

jest.mock('@/components/nativePrimitives', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return { Image: MockView };
});

jest.mock('@/config/constants', () => ({
  isLiquidGlassAvailable: true,
  paintingSheetOuterInset: 8,
  sheetScrimColor: '#00000066',
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 34, left: 0, right: 0, top: 59 }),
}));

describe('PaintingTemplateRow', () => {
  let renderer: ReactTestRenderer | undefined;
  let onUseTemplate: jest.Mock;

  beforeEach(() => {
    mockBottomSheetProps = {};
    onUseTemplate = jest.fn();
  });

  afterEach(() => {
    act(() => renderer?.unmount());
  });

  function renderRow() {
    act(() => {
      renderer = create(<PaintingTemplateRow onUseTemplate={onUseTemplate} />);
    });
  }

  function openSheet() {
    renderRow();
    act(() => {
      renderer?.root
        .findByProps({ testID: `painting-template-card-${paintingTemplates[0].id}` })
        .props.onPress();
    });
  }

  test('renders every local template card', () => {
    renderRow();

    for (const template of paintingTemplates) {
      expect(
        renderer?.root.findAllByProps({ testID: `painting-template-card-${template.id}` }),
      ).not.toHaveLength(0);
    }
    expect(renderer?.root.findAllByProps({ testID: 'painting-template-sheet' })).toHaveLength(0);
  });

  test('opens a content-sized sheet with the author and localized prompt', () => {
    openSheet();

    expect(mockBottomSheetProps.detents).toEqual([0, 'content']);
    expect(mockBottomSheetProps.index).toBe(1);
    expect(mockBottomSheetProps.surface).toBeUndefined();
    expect(renderer?.root.findByProps({ testID: 'painting-template-author' }).props.children).toBe(
      '@0x00_Krypt',
    );
    expect(
      renderer?.root.findByProps({ testID: 'painting-template-header-right-slot' }).props
        .accessibilityRole,
    ).toBeUndefined();
    expect(renderer?.root.findByProps({ testID: 'painting-template-prompt' }).props.children).toBe(
      paintingTemplates[0].prompt,
    );

    expect(renderer?.root.findByProps({ testID: 'painting-template-close' })).toBeTruthy();
    expect(renderer?.root.findByProps({ testID: 'painting-template-close-glass' })).toBeTruthy();
    expect(renderer?.root.findByProps({ testID: 'painting-template-try' })).toBeTruthy();

    const surface = renderer?.root.findByProps({ testID: 'painting-template-sheet-surface' });
    expect(StyleSheet.flatten(surface?.props.style)).toMatchObject({
      borderBottomLeftRadius: 42,
      borderBottomRightRadius: 42,
      borderTopLeftRadius: 34,
      borderTopRightRadius: 34,
      bottom: 0,
      left: 0,
      right: 0,
    });
    const sheet = renderer?.root.findByProps({ testID: 'painting-template-sheet' });
    expect(StyleSheet.flatten(sheet?.props.style)).toMatchObject({
      borderBottomLeftRadius: 42,
      borderBottomRightRadius: 42,
      borderTopLeftRadius: 34,
      borderTopRightRadius: 34,
      overflow: 'hidden',
      width: Dimensions.get('window').width - 16,
    });
    const bottomGap = renderer?.root.findByProps({ testID: 'painting-template-sheet-bottom-gap' });
    expect(StyleSheet.flatten(bottomGap?.props.style).height).toBe(8);

    const header = renderer?.root.findByProps({ testID: 'painting-template-header' });
    expect(StyleSheet.flatten(header?.props.style)).toMatchObject({
      height: 60,
      paddingHorizontal: 12,
      paddingTop: 12,
    });
  });

  test('truncates the prompt and keeps equal outer panel spacing above the safe area', () => {
    openSheet();

    const prompt = renderer?.root.findByProps({ testID: 'painting-template-prompt' });
    expect(prompt?.props.ellipsizeMode).toBe('tail');
    expect(prompt?.props.numberOfLines).toBe(2);

    const body = renderer?.root.findByProps({ testID: 'painting-template-sheet-body' });
    expect(StyleSheet.flatten(body?.props.style).paddingBottom).toBe(8);

    const panel = renderer?.root.findByProps({ testID: 'painting-template-prompt-panel' });
    expect(StyleSheet.flatten(panel?.props.style).borderRadius).toBe(34);
    expect(StyleSheet.flatten(panel?.props.style).paddingBottom).toBe(18);
  });

  test('dismisses with the close button after the sheet settles', () => {
    openSheet();

    act(() => {
      renderer?.root.findByProps({ testID: 'painting-template-close' }).props.onPress();
    });
    expect(mockBottomSheetProps.index).toBe(0);

    act(() => {
      (mockBottomSheetProps.onSettle as (index: number) => void)(0);
    });

    expect(renderer?.root.findAllByProps({ testID: 'painting-template-sheet' })).toHaveLength(0);
    expect(onUseTemplate).not.toHaveBeenCalled();
  });

  test('dismisses after a user-driven scrim or drag collapse', () => {
    openSheet();

    act(() => {
      (mockBottomSheetProps.onIndexChange as (index: number) => void)(0);
    });
    expect(mockBottomSheetProps.index).toBe(0);

    act(() => {
      (mockBottomSheetProps.onSettle as (index: number) => void)(0);
    });

    expect(renderer?.root.findAllByProps({ testID: 'painting-template-sheet' })).toHaveLength(0);
    expect(onUseTemplate).not.toHaveBeenCalled();
  });

  test('uses the template once only after the closing animation settles', () => {
    openSheet();

    act(() => {
      renderer?.root.findByProps({ testID: 'painting-template-try' }).props.onPress();
    });
    expect(mockBottomSheetProps.index).toBe(0);
    expect(onUseTemplate).not.toHaveBeenCalled();

    const settle = mockBottomSheetProps.onSettle as (index: number) => void;
    act(() => {
      settle(0);
      settle(0);
    });

    expect(onUseTemplate).toHaveBeenCalledTimes(1);
    expect(onUseTemplate).toHaveBeenCalledWith(paintingTemplates[0]);
  });
});
