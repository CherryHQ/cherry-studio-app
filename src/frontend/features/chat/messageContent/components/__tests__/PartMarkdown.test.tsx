import type { ReactElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { PartMarkdown } from '../PartMarkdown';

const mockHandleLinkPress = jest.fn();

jest.mock('@/frontend/hooks/useThemeColor', () => ({
  useThemeColor: () => [
    'foreground',
    'background',
    'muted-foreground',
    'link',
    'primary',
    'border',
    'secondary',
  ],
}));

jest.mock('react-native-enriched-markdown', () => {
  const { createElement } = jest.requireActual('react');

  return {
    EnrichedMarkdownText: (props: object) => createElement('EnrichedMarkdownText', props),
  };
});

jest.mock('react-native-streamdown', () => {
  const { createElement } = jest.requireActual('react');

  return {
    StreamdownText: (props: object) => createElement('StreamdownText', props),
  };
});

jest.mock('../../hooks/useMarkdownLinkPress', () => ({
  useMarkdownLinkPress: () => ({ handleLinkPress: mockHandleLinkPress }),
}));

describe('PartMarkdown', () => {
  test.each([
    [true, 'StreamdownText', 'EnrichedMarkdownText'],
    [false, 'EnrichedMarkdownText', 'StreamdownText'],
  ] as const)('isStreaming=%p uses %s renderer', (isStreaming, expectedRenderer, excludedRenderer) => {
    const renderer = render(<PartMarkdown isStreaming={isStreaming} markdown="Hello" />);

    expect(renderer.root.findByType(expectedRenderer).props).toEqual(
      expect.objectContaining({
        allowTrailingMargin: false,
        flavor: 'github',
        markdown: 'Hello',
        md4cFlags: { latexMath: true, underline: false },
        onLinkPress: mockHandleLinkPress,
        selectable: true,
      }),
    );
    expect(renderer.root.findAllByType(excludedRenderer)).toHaveLength(0);
  });
});

function render(element: ReactElement): ReactTestRenderer {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(element);
  });
  if (!renderer) {
    throw new Error('Renderer was not created');
  }
  return renderer;
}
