import type { LegendListRenderItemProps } from '@legendapp/list/react-native';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { MessagePartTextBody } from '../components/message-part-text-body';

jest.mock(
  '@cherrystudio/app-icons/icons/circle-alert',
  () => jest.requireActual('react-native').View,
);

// Exercise every row's native text boundary. Viewport mounting and gesture arbitration belong
// to LegendList/native device acceptance, not this renderer substitute.
jest.mock('@legendapp/list/react-native', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return {
    LegendList: ({
      data,
      keyExtractor,
      renderItem,
      ...props
    }: {
      data: string[];
      keyExtractor: (item: string, index: number) => string;
      renderItem: (item: LegendListRenderItemProps<string>) => ReactNode;
    }) => (
      <MockView {...props} testID="text-viewport">
        {data.map((item, index) => (
          <MockView key={keyExtractor(item, index)}>
            {renderItem({ data, extraData: undefined, index, item, type: undefined })}
          </MockView>
        ))}
      </MockView>
    ),
  };
});

let renderer: ReactTestRenderer;
afterEach(() => act(() => renderer?.unmount()));

it('keeps short prose selectable at its natural height', () => {
  const value = 'First line\r\n第二行 😀';
  act(() => {
    renderer = create(<MessagePartTextBody value={value} />);
  });

  expect(renderedText()).toEqual([value]);
  expect(renderer.root.findAllByType(Text)[0].props.selectable).toBe(true);
  expect(renderer.root.findAllByProps({ testID: 'text-viewport' })).toHaveLength(0);
});

it('keeps thousands of lines out of a single native text view without losing the tail', () => {
  const value = `${'log entry\n'.repeat(5_000)}last line\n`;
  act(() => {
    renderer = create(<MessagePartTextBody value={value} />);
  });

  const blocks = renderedText();
  expect(blocks.length).toBeGreaterThan(1);
  expect(blocks.join('\n')).toBe(value);
  for (const block of blocks) {
    expect(block.length).toBeLessThanOrEqual(1000);
    expect(block.split('\n').length).toBeLessThanOrEqual(20);
  }
  const viewport = renderer.root
    .findAllByType(View)
    .find((view) => view.props.testID === 'text-viewport');
  expect(StyleSheet.flatten(viewport!.props.style).height).toBe(192);
});

it('bounds an unbroken result and replaces it with the current short value', () => {
  const value = `${'x'.repeat(999)}😀${'字'.repeat(5_000)}tail`;
  act(() => {
    renderer = create(<MessagePartTextBody value={value} />);
  });
  const blocks = renderedText();
  expect(blocks.every((block) => block.length <= 1000)).toBe(true);
  expect(blocks.join('')).toBe(value);

  act(() => renderer.update(<MessagePartTextBody value="Updated result" />));
  expect(renderedText()).toEqual(['Updated result']);
  expect(renderer.root.findAllByProps({ testID: 'text-viewport' })).toHaveLength(0);
});

function renderedText(): string[] {
  return renderer.root.findAllByType(Text).map((text) => text.props.children);
}
