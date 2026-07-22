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
        .findByProps({ testID: 'painting-template-card-cherry-twilight' })
        .props.onPress();
    });
  }

  test('renders the single local template card', () => {
    renderRow();

    expect(
      renderer?.root.findAllByProps({ testID: 'painting-template-card-cherry-twilight' }),
    ).not.toHaveLength(0);
    expect(renderer?.root.findAllByProps({ testID: 'painting-template-sheet' })).toHaveLength(0);
  });

  test('opens a content-sized sheet with blank author and no right action', () => {
    openSheet();

    expect(mockBottomSheetProps.detents).toEqual([0, 'content']);
    expect(mockBottomSheetProps.index).toBe(1);
    expect(mockBottomSheetProps.surface).toBeUndefined();
    expect(renderer?.root.findByProps({ testID: 'painting-template-author' }).props.children).toBe(
      '',
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
      borderBottomLeftRadius: 34,
      borderBottomRightRadius: 34,
      borderRadius: 28,
      bottom: 0,
      left: 0,
      right: 0,
    });
    const sheet = renderer?.root.findByProps({ testID: 'painting-template-sheet' });
    expect(StyleSheet.flatten(sheet?.props.style)).toMatchObject({
      borderBottomLeftRadius: 34,
      borderBottomRightRadius: 34,
      borderRadius: 28,
      overflow: 'hidden',
      width: Dimensions.get('window').width - 16,
    });
    const bottomGap = renderer?.root.findByProps({ testID: 'painting-template-sheet-bottom-gap' });
    expect(StyleSheet.flatten(bottomGap?.props.style).height).toBe(8);

    const header = renderer?.root.findByProps({ testID: 'painting-template-header' });
    expect(header?.props.className).toContain('px-2');
    expect(StyleSheet.flatten(header?.props.style).paddingTop).toBe(8);
  });

  test('truncates the prompt and keeps equal outer panel spacing above the safe area', () => {
    openSheet();

    const prompt = renderer?.root.findByProps({ testID: 'painting-template-prompt' });
    expect(prompt?.props.ellipsizeMode).toBe('tail');
    expect(prompt?.props.numberOfLines).toBe(2);

    const body = renderer?.root.findByProps({ testID: 'painting-template-sheet-body' });
    expect(StyleSheet.flatten(body?.props.style).paddingBottom).toBe(8);

    const panel = renderer?.root.findByProps({ testID: 'painting-template-prompt-panel' });
    expect(StyleSheet.flatten(panel?.props.style).borderRadius).toBe(26);
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
