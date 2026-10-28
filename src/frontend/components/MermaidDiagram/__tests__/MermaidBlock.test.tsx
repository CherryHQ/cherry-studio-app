import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { MermaidBlock } from '../components/MermaidBlock';
import { mermaidRenderer } from '../utils/mermaidRenderer';
import { readMermaidViewerHandoff } from '../utils/mermaidViewerHandoff';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({ router: { push: (href: unknown) => mockPush(href) } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'handoff-token' }));
jest.mock('uniwind', () => ({
  useUniwind: () => ({ theme: 'light' }),
  withUniwind: (component: unknown) => component,
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@cherrystudio/app-icons/icons/copy', () => () => null);
jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual('react');
  return {
    Button: (props: object) => createElement('Button', props),
    Spinner: (props: object) => createElement('Spinner', props),
    useToast: () => ({ toast: { show: jest.fn() } }),
  };
});

const fallback = <Text testID="code-block">source</Text>;

function settle(source: string, result: 'rendered' | 'failed') {
  const page = { send: jest.fn(), reset: jest.fn() };
  mermaidRenderer.attach(page);
  mermaidRenderer.receive(page, { type: 'ready' });
  void mermaidRenderer.render(source, false);
  const [{ id }] = page.send.mock.calls.at(-1)!;
  mermaidRenderer.receive(
    page,
    result === 'rendered'
      ? { type: 'rendered', id, svg: '<svg/>', width: 100, height: 50 }
      : { type: 'failed', id },
  );
  mermaidRenderer.detach(page);
}

function mount(source: string): ReactTestRenderer {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(<MermaidBlock fallback={fallback} source={source} />);
  });
  return renderer!;
}

describe('MermaidBlock', () => {
  // The shared renderer keeps its page for a minute after the last diagram.
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => jest.useRealTimers());

  test('mounts a known failure as its code block without a loading frame', () => {
    settle('flowchart LR\nA -->', 'failed');
    const renderer = mount('flowchart LR\nA -->');

    expect(renderer.root.findByProps({ testID: 'code-block' })).toBeTruthy();
    expect(renderer.root.findAllByType('Spinner')).toHaveLength(0);
    act(() => renderer.unmount());
  });

  test('mounts a known diagram directly in its fixed frame', () => {
    settle('flowchart LR\nA --> B', 'rendered');
    const renderer = mount('flowchart LR\nA --> B');

    expect(renderer.root.findAllByType('Spinner')).toHaveLength(0);
    expect(renderer.root.findByType('WebView').props.source.html).toContain('<svg/>');
    act(() => renderer.unmount());
  });

  test('switches from the loading frame to the result when rendering settles', () => {
    const renderer = mount('flowchart LR\nC --> D');
    expect(renderer.root.findAllByType('Spinner')).toHaveLength(1);

    act(() => settle('flowchart LR\nC --> D', 'failed'));

    expect(renderer.root.findByProps({ testID: 'code-block' })).toBeTruthy();
    act(() => renderer.unmount());
  });

  test('opens the viewer through a handoff instead of putting source in the route', () => {
    settle('flowchart LR\nE --> F', 'rendered');
    const renderer = mount('flowchart LR\nE --> F');

    act(() => renderer.root.findByProps({ accessibilityRole: 'button' }).props.onPress());

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/mermaid-diagram',
      params: { handoff: 'handoff-token' },
    });
    expect(readMermaidViewerHandoff('handoff-token')).toBe('flowchart LR\nE --> F');
    expect(readMermaidViewerHandoff('other')).toBeUndefined();
    act(() => renderer.unmount());
  });
});
