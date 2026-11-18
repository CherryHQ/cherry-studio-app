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
      extraData,
      keyExtractor,
      renderItem,
      ...props
    }: {
      data: string[];
      extraData?: unknown;
      keyExtractor: (item: string, index: number) => string;
      renderItem: (item: LegendListRenderItemProps<string>) => ReactNode;
    }) => (
      <MockView {...props} testID="text-viewport">
        {data.map((item, index) => (
          <MockView key={keyExtractor(item, index)}>
            {renderItem({ data, extraData, index, item, type: undefined })}
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

it('keeps even a short preview in a non-selectable viewport and restores ordinary reading', () => {
  const value = 'Thinking line';
  act(() => {
    renderer = create(<MessagePartTextBody value={value} variant="preview" />);
  });
  expect(renderer.root.findAllByProps({ testID: 'text-viewport' }).length).toBeGreaterThan(0);
  expect(renderer.root.findAllByType(Text).every((text) => text.props.selectable === false)).toBe(
    true,
  );
  act(() => renderer.update(<MessagePartTextBody value={value} />));
  expect(renderer.root.findAllByProps({ testID: 'text-viewport' })).toHaveLength(0);
  expect(renderer.root.findAllByType(Text).every((text) => text.props.selectable === true)).toBe(
    true,
  );
});

it('disables selection on every block of a long preview', () => {
  act(() => {
    renderer = create(
      <MessagePartTextBody value={'Thinking line\n'.repeat(100)} variant="preview" />,
    );
  });
  const text = renderer.root.findAllByType(Text);
  expect(text.length).toBeGreaterThan(1);
  expect(text.every((block) => block.props.selectable === false)).toBe(true);
});

function renderedText(): string[] {
  return renderer.root.findAllByType(Text).map((text) => text.props.children);
}
