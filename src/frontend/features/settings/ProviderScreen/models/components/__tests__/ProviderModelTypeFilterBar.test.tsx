import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ProviderModelTypeFilterBar } from '../ProviderModelTypeFilterBar';

jest.mock('@cherrystudio/ui/components', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');

  return {
    Tabs: ({ items, ...props }: { items: ReactNode }) =>
      React.createElement(View, { ...props, items }),
  };
});

jest.mock('heroui-native/utils', () => {
  const { twMerge } = require('tailwind-merge');

  return {
    cn: (...values: unknown[]) => twMerge(values.filter(Boolean).join(' ')),
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('lucide-uniwind/png', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  const Icon = (props: object) => React.createElement(View, props);

  return {
    ArrowUpDownIcon: Icon,
    AudioLinesIcon: Icon,
    BoxesIcon: Icon,
    ImageIcon: Icon,
    MicIcon: Icon,
    SpeechIcon: Icon,
    TypeIcon: Icon,
    VideoIcon: Icon,
  };
});

const counts = {
  all: 13,
  audio: 1,
  embedding: 2,
  image: 3,
  rerank: 4,
  speech: 5,
  text: 6,
  transcription: 7,
  video: 8,
};

describe('ProviderModelTypeFilterBar', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('maps every model filter and count to Cherry UI Tabs', () => {
    const onSelect = jest.fn();

    act(() => {
      renderer = create(
        <ProviderModelTypeFilterBar counts={counts} onSelect={onSelect} selectedFilter="text" />,
      );
    });

    if (!renderer) {
      throw new Error('Provider model type filter renderer was not created.');
    }

    const tabs = renderer.root.find(
      (node) => node.type === View && node.props.testID === 'provider-model-type-tabs',
    );

    expect(tabs.props.value).toBe('text');
    expect(StyleSheet.flatten(tabs.props.style)).toEqual({ width: 864 });
    expect(tabs.props.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          children: expect.any(Object),
          label: 'models.all',
          value: 'all',
        }),
        expect.objectContaining({
          children: expect.any(Object),
          label: 'models.type.text',
          value: 'text',
        }),
        expect.objectContaining({
          children: expect.any(Object),
          label: 'models.type.transcription',
          value: 'transcription',
        }),
      ]),
    );

    const textItem = tabs.props.items.find((item: { value: string }) => item.value === 'text');
    let contentRenderer: ReactTestRenderer | undefined;
    act(() => {
      contentRenderer = create(textItem.children);
    });

    expect(contentRenderer?.root.findAllByType(Text).map((node) => node.props.children)).toEqual([
      'models.type.text',
      6,
    ]);
    act(() => contentRenderer?.unmount());

    act(() => tabs.props.onValueChange('image'));
    expect(onSelect).toHaveBeenCalledWith('image');
  });
});
