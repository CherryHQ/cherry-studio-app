import { type ReactNode } from 'react';
import { View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { Provider } from '@/shared/data/types/provider';

import type { ModelPickerFastScrollAnchor } from '../../utils/modelPickerFastScroll';
import { ModelPickerFastScroller } from '../ModelPickerFastScroller';

type TapHandlers = {
  onBegin?: (event: { y: number }) => void;
  onEnd?: (event: object, success: boolean) => void;
  onFinalize?: () => void;
};
type ScrollHandlers = {
  onScroll: (event: { contentOffset: { y: number } }) => void;
  onBeginDrag: () => void;
  onEndDrag: () => void;
  onMomentumBegin: () => void;
  onMomentumEnd: () => void;
};

let mockTapHandlers: TapHandlers;
let mockScrollHandlers: ScrollHandlers;

jest.mock('@/frontend/components/Avatar', () => ({ ProviderAvatar: () => null }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn().mockResolvedValue(undefined) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('react-native-gesture-handler', () => {
  const chain = (handlers: object = {}) => {
    const gesture: object = new Proxy(
      {},
      {
        get: (_target, name: string) => (value: unknown) => {
          if (name.startsWith('on')) Object.assign(handlers, { [name]: value });
          return gesture;
        },
      },
    );
    return gesture;
  };
  return {
    Gesture: {
      Native: () => chain(),
      LongPress: () => chain(),
      Tap: () => {
        mockTapHandlers = {};
        return chain(mockTapHandlers);
      },
      Simultaneous: (...gestures: object[]) => gestures,
    },
    GestureDetector: ({ children }: { children: ReactNode }) => children,
  };
});
jest.mock('react-native-reanimated', () => {
  const { useRef } = jest.requireActual('react');
  const { ScrollView } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { ScrollView },
    runOnJS: (callback: unknown) => callback,
    useSharedValue: (initial: unknown) => {
      const ref = useRef(initial);
      const shared = useRef({
        get: () => ref.current,
        set: (value: unknown) => {
          ref.current = value;
        },
      });
      return shared.current;
    },
    useAnimatedScrollHandler: (handlers: ScrollHandlers) => {
      mockScrollHandlers = handlers;
      return () => undefined;
    },
  };
});

const anchors: ModelPickerFastScrollAnchor[] = Array.from({ length: 20 }, (_, index) => ({
  key: `provider-${index}`,
  label: `Provider ${index + 1}`,
  listIndex: index * 2,
  provider: { id: `provider-${index}`, name: `Provider ${index + 1}` } as Provider,
}));

describe('ModelPickerFastScroller interactions', () => {
  let renderer: ReactTestRenderer;
  let onNavigate: jest.Mock;
  const preview = () =>
    renderer.root.findAll(
      (node) => node.type === View && node.props.testID === 'model-picker-provider-preview',
    );
  const beginTap = (y = 32) => act(() => mockTapHandlers.onBegin?.({ y }));
  const finishTap = (success = true) =>
    act(() => {
      mockTapHandlers.onEnd?.({}, success);
      mockTapHandlers.onFinalize?.();
    });

  beforeEach(() => {
    onNavigate = jest.fn();
    act(() => {
      renderer = create(
        <ModelPickerFastScroller activeIndex={0} anchors={anchors} onNavigate={onNavigate} />,
      );
    });
  });
  afterEach(() => act(() => renderer.unmount()));

  test('previews on press and navigates only after a completed release', () => {
    beginTap(80);
    expect(onNavigate).not.toHaveBeenCalled();
    expect(preview()).toHaveLength(1);
    expect(preview()[0]!.findByProps({ children: 'Provider 2' })).toBeDefined();

    finishTap();
    expect(onNavigate).toHaveBeenCalledWith(1);
    expect(preview()).toHaveLength(0);
  });

  test('uses the current native scroll offset to resolve the pressed provider', () => {
    act(() => mockScrollHandlers.onScroll({ contentOffset: { y: 432 } }));
    beginTap();
    finishTap();
    expect(onNavigate).toHaveBeenCalledWith(9);
  });

  test('scrolling cancels the preview and pending navigation without disabling the next tap', () => {
    beginTap();
    act(() => mockScrollHandlers.onBeginDrag());
    expect(preview()).toHaveLength(0);
    act(() => mockScrollHandlers.onEndDrag());
    finishTap();
    expect(onNavigate).not.toHaveBeenCalled();

    beginTap();
    finishTap();
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith(0);
  });

  test('a cancelled touch clears the preview without navigating', () => {
    beginTap();
    finishTap(false);
    expect(onNavigate).not.toHaveBeenCalled();
    expect(preview()).toHaveLength(0);
  });

  test('a touch that stops momentum does not navigate even after momentum ends', () => {
    act(() => mockScrollHandlers.onMomentumBegin());
    beginTap();
    expect(preview()).toHaveLength(0);
    act(() => mockScrollHandlers.onMomentumEnd());
    finishTap();
    expect(onNavigate).not.toHaveBeenCalled();

    beginTap();
    finishTap();
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});
