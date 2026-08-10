import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
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

jest.mock('@cherrystudio/ui/components', () => {
  const React = jest.requireActual('react');
  const {
    Pressable: MockPressable,
    Text: MockText,
    View: MockView,
  } = jest.requireActual('react-native');

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

  let requestClose: (reason?: string) => void = () => undefined;
  function MockBottomSheet({
    children,
    onClose,
    testID,
    title,
  }: {
    children?: ReactNode;
    onClose: (reason: string) => void;
    testID?: string;
    title?: ReactNode;
  }) {
    const [index, setIndex] = React.useState(1);
    const reasonRef = React.useRef('dismiss');
    const closedRef = React.useRef(false);
    requestClose = (reason = 'dismiss') => {
      reasonRef.current = reason;
      setIndex(0);
    };
    mockBottomSheetProps = {
      detents: [0, 'content'],
      index,
      onIndexChange: (nextIndex: number) => {
        reasonRef.current = 'dismiss';
        setIndex(nextIndex);
      },
      onSettle: (nextIndex: number) => {
        if (nextIndex === 0 && !closedRef.current) {
          closedRef.current = true;
          onClose(reasonRef.current);
        }
      },
    };

    return (
      <MockView testID={testID ? `${testID}-sheet` : undefined}>
        <MockPressable
          onPress={() => requestClose('dismiss')}
          testID={testID ? `${testID}-close` : undefined}
        />
        {title}
        {children}
      </MockView>
    );
  }

  return {
    BottomSheet: MockBottomSheet,
    Button: MockButton,
    useBottomSheet: () => ({
      geometry: {
        bottomCornerRadius: 28,
        insets: { bottom: 34, left: 0, right: 0, top: 59 },
        outerInset: 4,
        sheetWidth: 382,
        topCornerRadius: 28,
      },
      isClosing: false,
      requestClose,
    }),
  };
});

jest.mock('lucide-uniwind/png', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return { XIcon: MockView };
});

jest.mock('@/frontend/components/nativePrimitives', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return { Image: MockView };
});

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
    expect(renderer?.root.findByProps({ testID: 'painting-template-author' }).props.children).toBe(
      '@0x00_Krypt',
    );
    expect(renderer?.root.findByProps({ testID: 'painting-template-prompt' }).props.children).toBe(
      paintingTemplates[0].prompt,
    );

    expect(renderer?.root.findByProps({ testID: 'painting-template-close' })).toBeTruthy();
    expect(renderer?.root.findByProps({ testID: 'painting-template-try' })).toBeTruthy();
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
