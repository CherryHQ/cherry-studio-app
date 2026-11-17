import { MODEL_CAPABILITY } from '@cherrystudio/provider-registry';
import { type ReactElement, type ReactNode, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { Model } from '@/shared/data/types/model';

import type { useProviderModelOrder } from '../../hooks/useProviderModelOrder';
import type { ProviderModelListItem } from '../../utils/providerModelListItems';
import { ProviderModelReorderList } from '../ProviderModelReorderList';

const mockMove = jest.fn();
const mockDragChange = jest.fn();
const mockHiddenIds = new Set<string>();
const mockNavigation = { addListener: () => () => undefined };
jest.mock('react-native', () => {
  const React = jest.requireActual('react');
  const actual = jest.requireActual('react-native');
  const MockView = React.forwardRef(function MockView(props: object, ref: React.Ref<unknown>) {
    return React.createElement('ReorderView', { ...props, ref });
  });
  return Object.defineProperties(Object.create(actual), {
    View: { value: MockView },
    findNodeHandle: { value: (view: { _nativeTag: number }) => view._nativeTag },
  });
});
jest.mock('expo-router', () => ({ useNavigation: () => mockNavigation }));
jest.mock('@/frontend/components/Selection', () => ({ useListBottomInset: () => 0 }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { position?: number; total?: number; model?: string }) =>
      key.endsWith('.step')
        ? `${values?.position} of ${values?.total}`
        : `${key}:${values?.model ?? ''}`,
  }),
}));
jest.mock('@cherrystudio/ui/components', () => {
  const React = jest.requireActual('react');
  return {
    Button: (props: object) => React.createElement('mock-button', props),
    ScrollInteractionBoundary: ({ children }: { children: (handlers: object) => ReactNode }) =>
      children({}),
  };
});
jest.mock('../ProviderModelRow', () => {
  const React = jest.requireActual('react');
  return {
    ProviderModelRow: ({ model, children }: { model: Model; children: ReactNode }) =>
      React.createElement('mock-row', { id: model.id }, children),
    providerModelRowEstimatedHeights: { management: 50 },
  };
});
jest.mock('@legendapp/list/react-native', () => {
  const React = jest.requireActual('react');
  return {
    LegendList: (props: {
      data: ProviderModelListItem[];
      renderItem: (args: { item: ProviderModelListItem }) => ReactNode;
    }) => {
      const [, rerender] = React.useReducer((value: number) => value + 1, 0);
      return React.createElement(
        'mock-list',
        { ...props, onVisibilityChange: rerender },
        props.data.map((item) =>
          item.type === 'model' && mockHiddenIds.has(item.model.id)
            ? null
            : React.createElement(React.Fragment, { key: item.key }, props.renderItem({ item })),
        ),
      );
    },
  };
});
jest.mock('react-native-gesture-handler', () => {
  const React = jest.requireActual('react');
  return {
    GestureDetector: (props: object) => React.createElement('mock-gesture', props),
    Gesture: {
      Pan: () => {
        const gesture: Record<string, unknown> = {};
        for (const name of [
          'enabled',
          'maxPointers',
          'runOnJS',
          'onStart',
          'onUpdate',
          'onEnd',
          'onFinalize',
        ]) {
          gesture[name] = (value: unknown) => {
            gesture[name + 'Value'] = value;
            return gesture;
          };
        }
        return gesture;
      },
    },
  };
});
jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual('react');
  return {
    __esModule: true,
    default: { View: (props: object) => React.createElement('mock-overlay', props) },
    useSharedValue: (value: number) => React.useRef({ value }).current,
    useAnimatedStyle: () => ({}),
  };
});

const baseline = ['A', 'B', 'C', 'P'].map((name) => ({
  id: `p::${name}`,
  name,
  capabilities: name === 'P' ? [MODEL_CAPABILITY.IMAGE_GENERATION] : [],
})) as Model[];
type Order = ReturnType<typeof useProviderModelOrder>;
function Harness() {
  const [ids, setIds] = useState<string[]>(baseline.map(({ id }) => id));
  const positionOf = (id: string) => {
    const group = ids.filter((other) => (other === 'p::P') === (id === 'p::P'));
    return { position: group.indexOf(id) + 1, total: group.length };
  };
  const move = (id: string, target: { before?: string; after?: string }) => {
    mockMove(id, target);
    const next = ids.filter((other) => other !== id);
    next.splice(next.indexOf((target.before ?? target.after)!) + (target.after ? 1 : 0), 0, id);
    setIds(next);
  };
  const order: Order = {
    canReorder: true,
    isReordering: true,
    start: () => undefined,
    cancel: () => undefined,
    commit: async () => true,
    draftIds: ids,
    isSaving: false,
    positionOf,
    canMoveUp: (id: string) => positionOf(id).position > 1,
    canMoveDown: (id: string) => positionOf(id).position < positionOf(id).total,
    moveModel: move,
    moveUp: (id: string) => move(id, { before: ids[ids.indexOf(id) - 1] }),
    moveDown: (id: string) => move(id, { after: ids[ids.indexOf(id) + 1] }),
  };
  return (
    <ProviderModelReorderList
      models={ids.map((id) => baseline.find((model) => model.id === id)!)}
      provider={undefined}
      order={order}
      onDragChange={mockDragChange}
    />
  );
}
type Frame = { x: number; y: number; width: number; height: number };
let renderer: ReactTestRenderer;
const geometry = new Map<string, Frame>();
const nativeViews = new Map<
  string,
  { _nativeTag: number; measureInWindow: (callback: (...args: number[]) => void) => void }
>();
function row(id: string) {
  return renderer.root.findAllByType('mock-row').find((node) => node.props.id === id)!;
}
function layoutRow(id: string, change: Partial<Frame> = {}) {
  const frame = { ...geometry.get(id)!, ...change };
  geometry.set(id, frame);
  let container = row(id).parent!;
  while (!container.props.onLayout) container = container.parent!;
  container.props.onLayout({ nativeEvent: { layout: frame } });
}
function gesture(id = 'p::A') {
  return row(id).findByType('mock-gesture').props.gesture;
}
function beginDrag() {
  const current = gesture();
  act(() => current.onStartValue());
  expect(mockDragChange).toHaveBeenLastCalledWith(true);
  act(() => current.onUpdateValue({ absoluteY: 125, translationY: 125 }));
  return current;
}
function release(current: ReturnType<typeof gesture>) {
  act(() => {
    current.onEndValue({}, true);
    current.onFinalizeValue({}, true);
  });
}
beforeEach(() => {
  jest.clearAllMocks();
  mockHiddenIds.clear();
  nativeViews.clear();
  geometry.clear();
  geometry.set('viewport', { x: 0, y: 0, width: 300, height: 500 });
  baseline.forEach((model, index) =>
    geometry.set(model.id, { x: 0, y: index * 50, width: 300, height: 50 }),
  );
  act(() => {
    const createWithNodes = create as unknown as (
      element: ReactElement,
      options: {
        createNodeMock: (
          element: ReactElement<{
            accessibilityRole?: string;
            accessibilityLabel?: string;
            onLayout?: unknown;
            children?: ReactElement<{ model?: Model }>;
          }>,
        ) => unknown;
      },
    ) => ReactTestRenderer;
    renderer = createWithNodes(<Harness />, {
      createNodeMock: (element) => {
        const id =
          element.props.accessibilityRole === 'adjustable'
            ? `handle:${element.props.accessibilityLabel}`
            : element.props.onLayout
              ? (element.props.children?.props?.model?.id ?? 'viewport')
              : undefined;
        if (!id) return null;
        if (!nativeViews.has(id))
          nativeViews.set(id, {
            _nativeTag: nativeViews.size + 1,
            measureInWindow: (callback) => {
              const { x, y, width, height } = geometry.get(id)!;
              callback(x, y, width, height);
            },
          });
        return nativeViews.get(id);
      },
    });
  });
  act(() => baseline.forEach((model) => layoutRow(model.id)));
});
afterEach(() => act(() => renderer.unmount()));

it('cancels when a captured destination unregisters while the source stays mounted', () => {
  const current = beginDrag();
  mockHiddenIds.add('p::C');
  // Virtualization unmounts the candidate without changing the query or draft inventory.
  act(() => renderer.root.findByType('mock-list').props.onVisibilityChange());
  release(current);
  expect(mockMove).not.toHaveBeenCalled();
  expect(mockDragChange).toHaveBeenLastCalledWith(false);
});
it.each(['x', 'y', 'width', 'height'] as const)(
  'cancels when a candidate layout changes its %s',
  (dimension) => {
    const current = beginDrag();
    act(() => layoutRow('p::C', { [dimension]: geometry.get('p::C')![dimension] + 1 }));
    release(current);
    expect(mockMove).not.toHaveBeenCalled();
  },
);
it('revalidates window measurements when a cell wrapper moves without an onLayout event', () => {
  const current = beginDrag();
  geometry.get('p::C')!.y += 10;
  release(current);
  expect(mockMove).not.toHaveBeenCalled();
});
it('cancels when the content scrolls after capturing candidates', () => {
  const current = beginDrag();
  act(() =>
    renderer.root
      .findByType('mock-list')
      .props.onScroll({ nativeEvent: { contentOffset: { y: 10 } } }),
  );
  release(current);
  expect(mockMove).not.toHaveBeenCalled();
});
it('accepts a valid measured drop exactly once, including finalization', () => {
  release(beginDrag());
  expect(mockMove).toHaveBeenCalledTimes(1);
  expect(mockMove).toHaveBeenCalledWith('p::A', { after: 'p::C' });
});
it('waits for asynchronous drop measurements across finalization before moving once', () => {
  const current = beginDrag();
  const candidate = nativeViews.get('p::C')!;
  const measure = candidate.measureInWindow;
  let finish!: () => void;
  candidate.measureInWindow = (callback) => {
    finish = () => measure(callback);
  };
  release(current);
  expect(mockMove).not.toHaveBeenCalled();
  expect(mockDragChange).toHaveBeenLastCalledWith(true);
  act(() => finish());
  expect(mockMove).toHaveBeenCalledTimes(1);
  expect(mockDragChange).toHaveBeenLastCalledWith(false);
});
it('keeps singleton arrows disabled and omits its handle and adjustable actions', () => {
  const singleton = row('p::P');
  expect(singleton.findAllByType('mock-button').every((node) => node.props.disabled)).toBe(true);
  expect(singleton.findAllByProps({ accessibilityRole: 'adjustable' })).toHaveLength(0);
});
it('updates group position feedback, boundary arrows, and focus after an arrow move', () => {
  const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus');
  const initial = row('p::A');
  expect(initial.findAllByType('mock-button').map((node) => node.props.disabled)).toEqual([
    true,
    false,
  ]);
  expect(
    initial.findByProps({ accessibilityRole: 'adjustable' }).props.accessibilityValue.text,
  ).toBe('1 of 3');
  act(() => initial.findAllByType('mock-button')[1]!.props.onPress());
  const moved = row('p::A');
  expect(moved.findAllByType('mock-button').map((node) => node.props.disabled)).toEqual([
    false,
    false,
  ]);
  for (const control of [
    ...moved.findAllByType('mock-button'),
    moved.findByProps({ accessibilityRole: 'adjustable' }),
  ]) {
    expect(control.props.accessibilityValue.text).toBe('2 of 3');
  }
  expect(focus).toHaveBeenCalledWith(
    nativeViews.get('handle:settings.provider.models.reorder.dragHandle:A')!._nativeTag,
  );
  focus.mockRestore();
});
