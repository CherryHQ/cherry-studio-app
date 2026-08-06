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

jest.mock('@cherrystudio/ui/components', () => {
  const { Pressable: MockPressable, Text: MockText } = jest.requireActual('react-native');

  const MockButton = ({
    children,
    disabled,
    ...props
  }: {
    children?: ReactNode;
    disabled?: boolean;
  }) => (
    <MockPressable disabled={disabled} {...props}>
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

jest.mock('@/frontend/components/nativePrimitives', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return { Image: MockView };
});

jest.mock('@/frontend/utils/constants', () => ({
  bottomSheet: { cornerRadius: 28, headerHeight: 60, headerSideWidth: 44, outerInset: 4 },
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
    // No native screen radius under jest, so both corner pairs rest at 28 — the
    // concentric bottom radius is covered in the BottomSheet suite itself.
    expect(StyleSheet.flatten(surface?.props.style)).toMatchObject({
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      bottom: 0,
      left: 0,
      right: 0,
    });
    const sheet = renderer?.root.findByProps({ testID: 'painting-template-sheet' });
    expect(StyleSheet.flatten(sheet?.props.style)).toMatchObject({
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      overflow: 'hidden',
      width: Dimensions.get('window').width - 8,
    });
    const bottomGap = renderer?.root.findByProps({ testID: 'painting-template-sheet-bottom-gap' });
    expect(StyleSheet.flatten(bottomGap?.props.style).height).toBe(4);

    const header = renderer?.root.findByProps({ testID: 'painting-template-header' });
    expect(StyleSheet.flatten(header?.props.style)).toMatchObject({
      height: 60,
      paddingHorizontal: 6,
      paddingTop: 6,
    });
  });

  test('truncates the prompt and keeps the button clear of the safe area', () => {
    openSheet();

    const prompt = renderer?.root.findByProps({ testID: 'painting-template-prompt' });
    expect(prompt?.props.ellipsizeMode).toBe('tail');
    expect(prompt?.props.numberOfLines).toBe(2);

    // The button now sits below the panel, so the body's own bottom padding is
    // what lifts it off the home indicator: insets.bottom (34) - outerInset (4).
    const body = renderer?.root.findByProps({ testID: 'painting-template-sheet-body' });
    expect(StyleSheet.flatten(body?.props.style).paddingBottom).toBe(30);

    // The panel touches no card edge, so its radius is a flat utility class
    // rather than anything derived from the card — asserted on className
    // because uniwind does not resolve classes to styles under jest.
    const panel = renderer?.root.findByProps({ testID: 'painting-template-prompt-panel' });
    expect(panel?.props.className).toContain('rounded-xl');
    expect(StyleSheet.flatten(panel?.props.style).borderRadius).toBeUndefined();
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
