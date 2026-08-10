import type { ReactElement } from 'react';
import { View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import preview from '../preview';

jest.mock('../../src/frontend/styles/global.css', () => ({}));

jest.mock('@swmansion/react-native-bottom-sheet', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    BottomSheetProvider: ({ children }: { children?: unknown }) =>
      React.createElement(View, { testID: 'bottom-sheet-provider' }, children),
  };
});

jest.mock('heroui-native/provider', () => {
  const React = require('react');
  const { View } = require('react-native');

  function HeroUINativeProvider({ children, config }: { children?: unknown; config?: unknown }) {
    return React.createElement(View, { config, testID: 'hero-ui-provider' }, children);
  }

  return { HeroUINativeProvider };
});

describe('Storybook preview', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('provides the HeroUI runtime required by shared components', () => {
    const decorator = preview.decorators?.[0];
    if (!decorator) {
      throw new Error('Storybook preview decorator is missing.');
    }

    const Story = () => <View testID="story" />;
    const decoratedStory = decorator(Story as never, {} as never) as ReactElement;

    act(() => {
      renderer = create(decoratedStory);
    });

    expect(renderer?.root.findByProps({ testID: 'hero-ui-provider' }).props.config).toEqual({
      devInfo: { stylingPrinciples: false },
    });
    expect(renderer?.root.findByProps({ testID: 'bottom-sheet-provider' })).toBeDefined();
  });
});
