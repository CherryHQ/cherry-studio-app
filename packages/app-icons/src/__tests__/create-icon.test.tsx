import type { LucideIcon as LucideNativeIcon, LucideProps } from 'lucide-react-native';
import { createElement, forwardRef } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useResolveClassNames } from 'uniwind';

import { createFilledIcon } from '../create-filled-icon';
import { createIcon } from '../create-icon';
import SparkPenIcon from '../icons/spark-pen';

jest.mock('react-native-svg', () => {
  const { createElement: createReactElement, forwardRef: forwardReactRef } =
    jest.requireActual('react');
  const mockSvgNode = (name: string) =>
    forwardReactRef(function MockSvgNode(props: object, ref: unknown) {
      return createReactElement(name, { ...props, ref });
    });

  return {
    Circle: mockSvgNode('SvgCircle'),
    Ellipse: mockSvgNode('SvgEllipse'),
    G: mockSvgNode('SvgG'),
    Line: mockSvgNode('SvgLine'),
    Path: mockSvgNode('SvgPath'),
    Polygon: mockSvgNode('SvgPolygon'),
    Polyline: mockSvgNode('SvgPolyline'),
    Rect: mockSvgNode('SvgRect'),
    Svg: mockSvgNode('SvgRoot'),
  };
});

jest.mock('uniwind', () => ({
  useResolveClassNames: jest.fn(),
}));

const MockBaseIcon = forwardRef(function MockBaseIcon(props: LucideProps, _ref) {
  return createElement('lucide-icon', props);
}) as LucideNativeIcon;
const TestIcon = createIcon(MockBaseIcon, 'TestIcon');
const mockUseResolveClassNames = jest.mocked(useResolveClassNames);

describe('createIcon', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    mockUseResolveClassNames.mockReturnValue({});
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.clearAllMocks();
  });

  function render(element: React.ReactElement) {
    act(() => {
      renderer = create(element);
    });
    return renderer!.root.findByType('lucide-icon').props;
  }

  test('uses the shared defaults and hides decorative icons from accessibility', () => {
    const props = render(<TestIcon />);

    expect(props).toMatchObject({ accessible: false, height: 24, width: 24 });
    expect(TestIcon.displayName).toBe('TestIcon');
  });

  test('resolves dimensions and color from className', () => {
    mockUseResolveClassNames.mockReturnValue({ color: '#336699', height: 18, width: 20 });
    const style = { opacity: 0.5 };

    const props = render(<TestIcon className="size-5 text-primary" style={style} />);

    expect(mockUseResolveClassNames).toHaveBeenCalledWith('size-5 text-primary');
    expect(props).toMatchObject({ color: '#336699', height: 18, style, width: 20 });
  });

  test('uses size for both dimensions when width and height are omitted', () => {
    const props = render(<TestIcon size={30} />);

    expect(props).toMatchObject({ height: 30, width: 30 });
  });

  test('gives explicit props precedence over className values', () => {
    mockUseResolveClassNames.mockReturnValue({ color: '#336699', height: 18, width: 20 });

    const props = render(
      <TestIcon accessible color="#ff0000" height={28} size={26} strokeWidth={1.5} width={32} />,
    );

    expect(props).toMatchObject({
      accessible: true,
      color: '#ff0000',
      height: 28,
      strokeWidth: 1.5,
      width: 32,
    });
  });
});

describe('createFilledIcon', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    mockUseResolveClassNames.mockReturnValue({});
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.clearAllMocks();
  });

  test('resolves currentColor fills/strokes and honors wrapped createIcon dimensions', () => {
    const Base = createFilledIcon([
      [
        'path',
        {
          d: 'M0 0h24v24H0z',
          fill: 'currentColor',
          fillOpacity: 0.24,
          key: 'bg',
          stroke: 'currentColor',
        },
      ],
      ['rect', { fill: 'currentColor', height: 6, key: 'box', rx: 1, width: 6, x: 2, y: 2 }],
    ] as const);
    const Wrapped = createIcon(Base, 'TestFilledIcon');

    mockUseResolveClassNames.mockReturnValue({ color: '#112233', height: 22, width: 22 });
    act(() => {
      renderer = create(<Wrapped className="text-foreground size-5" strokeWidth={1.85} />);
    });

    const svg = renderer!.root.findByType('SvgRoot' as never);
    expect(svg.props).toMatchObject({ height: 22, width: 22 });

    const path = renderer!.root.findByType('SvgPath' as never);
    expect(path.props).toMatchObject({
      fill: '#112233',
      fillOpacity: 0.24,
      stroke: '#112233',
      strokeWidth: 1.85,
    });

    const rect = renderer!.root.findByType('SvgRect' as never);
    expect(rect.props).toMatchObject({
      fill: '#112233',
      stroke: 'none',
    });
  });

  test('renders SparkPenIcon with filled spark and stroked stylus using resolved token color', () => {
    mockUseResolveClassNames.mockReturnValue({ color: '#6b7280' });
    act(() => {
      renderer = create(
        <SparkPenIcon className="text-muted-foreground" size={20} strokeWidth={1.8} />,
      );
    });

    const svg = renderer!.root.findByType('SvgRoot' as never);
    expect(svg.props).toMatchObject({ accessible: false, height: 20, width: 20 });
    expect(SparkPenIcon.displayName).toBe('SparkPenIcon');

    const paths = renderer!.root.findAllByType('SvgPath' as never);
    expect(paths).toHaveLength(2);
    expect(paths[0].props).toMatchObject({
      fill: '#6b7280',
      stroke: 'none',
    });
    expect(paths[1].props).toMatchObject({
      fill: 'none',
      stroke: '#6b7280',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      strokeWidth: 1.8,
    });
  });
});
