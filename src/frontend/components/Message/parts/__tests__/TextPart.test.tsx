import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { CherryMessagePart } from '@/shared/data/types/message';

type TextMessagePart = Extract<CherryMessagePart, { type: 'text' }>;

import { TextPart } from '../TextPart';

jest.mock('@cherrystudio/ui/components', () => ({
  ContextMenuExclusion: (props: object) =>
    jest.requireActual('react').createElement('ContextMenuExclusion', props),
}));

jest.mock('@/frontend/hooks/useThemeColor', () => ({ useThemeColor: () => '#000000' }));

jest.mock('../PartMarkdown', () => ({
  PartMarkdown: (props: object) => jest.requireActual('react').createElement('PartMarkdown', props),
}));

const part: TextMessagePart = { state: 'done', text: 'Answer', type: 'text' };

describe('TextPart', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  // Native selection, links and block copy menus all live inside the rendered
  // text, so the region has to opt out of the ancestor message menu in both
  // render modes and while the answer is still streaming.
  test.each([
    ['markdown', 'PartMarkdown'],
    ['plainText', 'Text'],
  ] as const)('owns %s touches through one exclusion boundary', (renderMode, childType) => {
    act(() => {
      renderer = create(<TextPart isStreaming={false} part={part} renderMode={renderMode} />);
    });

    const exclusion = renderer?.root.findByType('ContextMenuExclusion');
    const child =
      childType === 'PartMarkdown'
        ? exclusion?.findByType('PartMarkdown')
        : exclusion?.findByType(Text);

    expect(child).toBeTruthy();
  });

  test('keeps the boundary mounted while the answer streams', () => {
    act(() => {
      renderer = create(<TextPart isStreaming part={part} />);
    });

    expect(renderer?.root.findAllByType('ContextMenuExclusion')).toHaveLength(1);
    expect(renderer?.root.findByType('PartMarkdown').props.isStreaming).toBe(true);
  });

  test('renders plain user text as selectable native text', () => {
    act(() => {
      renderer = create(<TextPart isStreaming={false} part={part} renderMode="plainText" />);
    });

    expect(
      renderer?.root.findByType('ContextMenuExclusion').findByType(Text).props.selectable,
    ).toBe(true);
  });
});
