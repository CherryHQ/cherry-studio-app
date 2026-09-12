import { View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Surface } from '../surface';

jest.mock('../surface-frame', () => {
  const React = jest.requireActual('react');

  return {
    SurfaceFrame: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('SurfaceFrame', props, children),
  };
});

jest.mock('uniwind', () => ({
  useResolveClassNames: (className: string) => ({ backgroundColor: `resolved:${className}` }),
}));

describe('Surface', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test.each([
    ['circle', 'sidebar-accent', 'bg-sidebar-accent rounded-full', 9999],
    ['pill', 'sidebar-primary', 'bg-sidebar-primary rounded-full', 9999],
    ['rounded', 'default', 'bg-card rounded-2xl', 16],
  ] as const)(
    'maps %s and %s to one fallback and glass specification',
    (shape, tone, className, cornerRadius) => {
      act(() => {
        renderer = create(
          <Surface interactive shape={shape} testID="surface" tone={tone}>
            <View testID="content" />
          </Surface>,
        );
      });

      expect(renderer!.root.findByType('SurfaceFrame').props).toMatchObject({
        className,
        cornerRadius,
        interactive: true,
        testID: 'surface',
        tintColor: `resolved:${tone === 'default' ? 'bg-card' : `bg-${tone}`}`,
      });
      expect(renderer!.root.findByProps({ testID: 'content' })).toBeDefined();
    },
  );

  it('defaults to the rounded card surface', () => {
    act(() => {
      renderer = create(<Surface />);
    });

    expect(renderer!.root.findByType('SurfaceFrame').props).toMatchObject({
      className: 'bg-card rounded-2xl',
      cornerRadius: 16,
      tintColor: 'resolved:bg-card',
    });
  });
});
