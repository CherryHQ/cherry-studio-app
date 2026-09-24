import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { MessageListLiveTailProvider } from '../../list/MessageListLiveTailContext';
import { PartMarkdown } from '../PartMarkdown';

jest.mock('@/frontend/components/MarkdownText', () => ({
  MarkdownText: (props: object) => jest.requireActual('react').createElement('MarkdownText', props),
}));

describe('PartMarkdown', () => {
  let renderer: ReactTestRenderer | undefined;
  const render = (markdown: string, isStreaming: boolean, isVisible: boolean) => {
    const element = (
      <MessageListLiveTailProvider isVisible={isVisible}>
        <PartMarkdown isStreaming={isStreaming} markdown={markdown} />
      </MessageListLiveTailProvider>
    );
    act(() => {
      if (renderer) renderer.update(element);
      else renderer = create(element);
    });
  };
  const shown = () => renderer!.root.findByType('MarkdownText' as never).props.markdown;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  // Re-rendering a long streaming part re-lays out all of it natively, so text
  // growing below the viewport must not reach the renderer until it is seen.
  test('holds streaming text while the list end is off screen and catches up on return', () => {
    render('a', true, true);
    render('ab', true, true);
    expect(shown()).toBe('ab');

    render('abc', true, false);
    render('abcd', true, false);
    expect(shown()).toBe('ab');

    render('abcde', true, true);
    expect(shown()).toBe('abcde');
  });

  test('shows the full text once the part finishes, even off screen', () => {
    render('a', true, false);
    render('ab', true, false);
    expect(shown()).toBe('a');

    render('abc', false, false);
    expect(shown()).toBe('abc');
  });

  test('always shows current text outside a message list', () => {
    act(() => {
      renderer = create(<PartMarkdown isStreaming markdown="a" />);
    });
    act(() => renderer!.update(<PartMarkdown isStreaming markdown="ab" />));
    expect(shown()).toBe('ab');
  });
});
