import { TextInput, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ComposerEditor, useComposerEditorInput } from '../components/composer-editor';

const mockTiming = jest.fn((target: number, _motion: object) => target);

jest.mock('@cherrystudio/app-icons/icons/maximize-2', () => () => null);
jest.mock('@cherrystudio/app-icons/icons/minimize-2', () => () => null);
jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { View },
    Easing: { bezier: () => 'settle' },
    Extrapolation: { CLAMP: 'clamp' },
    ReduceMotion: { System: 'system' },
    interpolate: (value: number, _input: number[], [from, to]: [number, number]) =>
      from + (to - from) * value,
    useDerivedValue: (read: () => unknown) => ({ get: read }),
    useAnimatedStyle: (read: () => object) => ({ read }),
    useSharedValue: (initial: number) => {
      const cell = React.useRef(initial);
      return {
        get: () => cell.current,
        set: (next: number) => {
          cell.current = next;
        },
      };
    },
    withTiming: (target: number, motion: object) => mockTiming(target, motion),
  };
});

jest.mock('../components/composer-expansion', () => ({
  ComposerExpansionMeasure: ({ children }: { children: unknown }) => children,
  useComposerExpansion: () => null,
}));

function Field() {
  return <TextInput style={useComposerEditorInput()?.style} />;
}

describe('Composer.Editor', () => {
  let renderer: ReactTestRenderer;
  let visible: boolean;
  const keyboard = { get: () => visible } as SharedValue<boolean>;
  const renderEditor = (active: boolean, restingTrailingActionCount = 1) => (
    <ComposerEditor
      active={active}
      activeSignal={keyboard}
      expandLabel="Expand"
      field={<Field />}
      restingTrailingActionCount={restingTrailingActionCount}
    />
  );
  const fieldFrame = () =>
    renderer.root
      .findAllByType(View)
      .map((view) => view.props.style?.read?.())
      .find((style) => style?.left !== undefined && style?.right !== undefined);
  beforeEach(() => {
    visible = false;
    mockTiming.mockClear();
    act(() => {
      renderer = create(renderEditor(false));
    });
  });
  afterEach(() => act(() => renderer.unmount()));

  it('bounds the native text field to a single row only while compact', () => {
    const nativeHeightLimit = () => renderer.root.findByType(TextInput).props.style?.maxHeight;
    expect(nativeHeightLimit()).toBe(24);
    act(() => renderer.update(renderEditor(true)));
    expect(nativeHeightLimit()).toBeUndefined();
    act(() => renderer.update(renderEditor(false)));
    expect(nativeHeightLimit()).toBe(24);
  });

  it('keeps the resting field clear of both trailing actions without adding a leading slot', () => {
    expect(fieldFrame()).toMatchObject({ left: 40, right: 40 });
    act(() => renderer.update(renderEditor(false, 2)));
    expect(fieldFrame()).toMatchObject({ left: 40, right: 80 });
  });

  it('opens and closes from the keyboard even while React still renders the previous state', () => {
    visible = true;
    expect(fieldFrame()).toMatchObject({ left: 0, right: 0 });
    act(() => renderer.update(renderEditor(true)));
    visible = false;
    expect(fieldFrame()).toMatchObject({ left: 40, right: 40 });
    visible = true;
    expect(fieldFrame()).toMatchObject({ left: 0, right: 0 });
  });

  it('retargets wrapped text height on the settle curve and keeps a long draft one row when closed', () => {
    const measure = (height: number) => {
      const field = renderer.root.findAllByType(View).find((view) => view.props.onLayout);
      act(() => field!.props.onLayout({ nativeEvent: { layout: { height } } }));
    };
    measure(130);
    expect(fieldFrame().height).toBe(32);
    visible = true;
    expect(fieldFrame().height).toBe(130);
    measure(80);
    expect(fieldFrame().height).toBe(80);
    expect(mockTiming).toHaveBeenCalledWith(80, {
      duration: 90,
      easing: 'settle',
      reduceMotion: 'system',
    });
    visible = false;
    measure(130);
    expect(fieldFrame().height).toBe(32);
  });
});
