import type { LucideIcon as LucideNativeIcon, LucideProps } from 'lucide-react-native';
import { createElement, forwardRef } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useResolveClassNames } from 'uniwind';

import { createIcon } from '../create-icon';

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
