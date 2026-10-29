import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { createCodeBlockMarkdown } from '../../../markdown';
import { CodeBlock } from '../components/code-block';

jest.mock('@cherrystudio/app-icons/icons/copy', () => jest.requireActual('react-native').View);
jest.mock('../../button', () => {
  const { createElement } = jest.requireActual('react');
  return { Button: (props: object) => createElement('Button', props) };
});
jest.mock('../../message-part/components/message-part-sections', () => {
  const { createElement } = jest.requireActual('react');
  return {
    MessagePartSection: ({ action, children }: { action: unknown; children: unknown }) =>
      createElement('Section', null, action, children),
  };
});
jest.mock('react-native-enriched-markdown', () => {
  const { createElement } = jest.requireActual('react');
  return { EnrichedMarkdownText: (props: object) => createElement('NativeMarkdown', props) };
});
jest.mock('react-native-streamdown', () => ({ StreamdownText: () => null }));

let mockTheme = 'light';
jest.mock('uniwind', () => ({
  useCSSVariable: (names: string[]) => names.map((name) => name),
  useUniwind: () => ({ theme: mockTheme }),
}));

test.each(['light', 'dark'])('%s: renders and copies the complete original code', (theme) => {
  mockTheme = theme;
  const code = `${'const value = 1;\n'.repeat(1_000)}// 尾部😀\n\n\`\`\`\n\n`;
  const onCopy = jest.fn();
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      <CodeBlock
        code={code}
        copyLabel="Copy full text"
        fontSizeStep={0}
        language="javascript"
        onCopy={onCopy}
        title="Result"
      />,
    );
  });

  const native = renderer.root.findByType('NativeMarkdown');
  expect(native.props.markdown).toBe(createCodeBlockMarkdown(code, 'javascript'));
  expect(native.props.markdownStyle.codeBlock.externalControls).toBe(true);
  expect(renderer.root.findAllByType('Button')).toHaveLength(1);
  expect(onCopy).not.toHaveBeenCalled();

  act(() => renderer.root.findByType('Button').props.onPress());
  expect(onCopy).toHaveBeenCalledTimes(1);
  expect(onCopy).toHaveBeenCalledWith(code);
  act(() => renderer.unmount());
});
