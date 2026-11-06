import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { FileTextBody } from '../FileTextBody';

jest.mock('heroui-native/utils', () => ({
  cn: (...values: unknown[]) => values.filter(Boolean).join(' '),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 34, left: 0, right: 0, top: 0 }),
}));
jest.mock('@/frontend/components/MarkdownText', () => ({ MarkdownText: () => null }));
jest.mock('@legendapp/list/react-native', () => {
  const React = jest.requireActual('react');
  return { LegendList: (props: object) => React.createElement('LegendList', props) };
});

let renderer: ReactTestRenderer;
afterEach(() => act(() => renderer.unmount()));

function bottomPadding(element: React.ReactElement, type: 'LegendList' | 'RCTScrollView') {
  act(() => {
    renderer = create(element);
  });
  const [node] = renderer.root.findAll(
    (candidate) =>
      (candidate.type as unknown) === type && 'contentContainerStyle' in candidate.props,
  );
  return node!.props.contentContainerStyle.paddingBottom;
}

it.each([
  ['markdown', 'RCTScrollView'],
  ['text', 'LegendList'],
  ['source', 'LegendList'],
] as const)('keeps %s clear of the bottom safe area unless a footer owns it', (variant, type) => {
  expect(bottomPadding(<FileTextBody text="Body" variant={variant} />, type)).toBe(50);
  act(() => renderer.unmount());
  expect(bottomPadding(<FileTextBody bottomInset={0} text="Body" variant={variant} />, type)).toBe(
    16,
  );
});
