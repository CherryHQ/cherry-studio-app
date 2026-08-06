import type { ReactElement } from 'react';
import { View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import preview from '../preview';

jest.mock('../../src/frontend/styles/global.css', () => ({}));

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
  });
});
