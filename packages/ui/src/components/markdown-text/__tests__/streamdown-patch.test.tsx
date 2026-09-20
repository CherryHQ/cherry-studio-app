import { StreamdownText } from 'react-native-streamdown';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockWorklets: (() => void)[] = [];
const mockRepairedText = new Map<string, string>();
let mockRepairFails = false;

jest.mock('react-native-worklets', () => ({
  createWorkletRuntime: () => ({}),
  scheduleOnRuntime: (_runtime: unknown, work: () => void) => mockWorklets.push(work),
  scheduleOnRN: (callback: (text: string) => void, text: string) => callback(text),
}));

jest.mock('remend', () => ({
  __esModule: true,
  default: (text: string) => {
    if (mockRepairFails) throw new Error('Repair failed');
    return mockRepairedText.get(text) ?? `repaired:${text}`;
  },
}));

jest.mock('react-native-enriched-markdown', () => {
  const { createElement } = jest.requireActual('react');
  return { EnrichedMarkdownText: (props: object) => createElement('NativeMarkdown', props) };
});

// Exercise the installed package, so removing or failing to apply the pnpm patch
// brings back the unbounded queue and latest-version starvation regressions.
describe('streamdown processing patch', () => {
  let renderer: ReactTestRenderer;
  const update = (markdown: string, streamingAnimation = true) => {
    act(() =>
      renderer.update(
        <StreamdownText markdown={markdown} streamingAnimation={streamingAnimation} />,
      ),
    );
  };
  const displayed = () => renderer.root.findByType('NativeMarkdown').props.markdown;
  const finish = () => act(() => mockWorklets.shift()!());

  beforeEach(() => {
    mockWorklets.length = 0;
    mockRepairedText.clear();
    mockRepairFails = false;
    act(() => {
      renderer = create(<StreamdownText markdown="a" />);
    });
  });
  afterEach(() => {
    act(() => renderer.unmount());
  });

  test('bounds work and displays completed prefixes while input keeps growing', () => {
    update('ab');
    update('abc');
    expect(mockWorklets).toHaveLength(1);
    finish();
    expect(displayed()).toBe('repaired:a');
    expect(mockWorklets).toHaveLength(1);
    update('abcd', false);
    finish();
    expect(displayed()).toBe('repaired:abc');
    finish();
    expect(displayed()).toBe('repaired:abcd');
    expect(mockWorklets).toHaveLength(0);
    expect(renderer.root.findByType('NativeMarkdown').props.selectable).toBe(true);
  });

  test('does not restore a cleared or replaced message from an old completion', () => {
    update('');
    finish();
    expect(displayed()).toBe('');
    update('new');
    update('replacement');
    finish();
    expect(displayed()).toBe('');
    finish();
    expect(displayed()).toBe('repaired:replacement');
  });

  test('keeps one native generation when repair rewrites an appended Markdown suffix', () => {
    // remend closes the unfinished bold span in each snapshot. The repaired
    // snapshots are not string prefixes, although the raw source only appends.
    mockRepairedText.set('**a', '**a**');
    mockRepairedText.set('**ab', '**ab**');
    mockRepairedText.set('**abc', '**abc**');
    update('**a');
    finish(); // Discard the initial "a" request from the previous generation.
    finish();
    const native = renderer.root.findByType('NativeMarkdown');
    expect(displayed()).toBe('**a**');

    update('**ab');
    update('**abc');
    finish();
    expect(displayed()).toBe('**ab**');
    expect(renderer.root.findByType('NativeMarkdown')).toBe(native);
    finish();
    expect(displayed()).toBe('**abc**');
    expect(renderer.root.findByType('NativeMarkdown')).toBe(native);

    // Finalize without another text delta: keep the native view so its status
    // setter, rather than a remount, releases the streaming filters.
    update('**abc', false);
    expect(renderer.root.findByType('NativeMarkdown')).toBe(native);
    expect(native.props.streamingAnimation).toBe(false);
    expect(mockWorklets).toHaveLength(0);
  });

  test('remounts replaced native content and rejects an old prefix after a clear', () => {
    const initialNative = renderer.root.findByType('NativeMarkdown');
    update('');
    const clearedNative = renderer.root.findByType('NativeMarkdown');
    expect(clearedNative).not.toBe(initialNative);
    update('ab');
    finish(); // "a" is a prefix again, but belongs to the generation before clear.
    expect(displayed()).toBe('');
    finish();
    expect(displayed()).toBe('repaired:ab');
    expect(renderer.root.findByType('NativeMarkdown')).toBe(clearedNative);

    update('replacement');
    expect(renderer.root.findByType('NativeMarkdown')).not.toBe(clearedNative);
    expect(displayed()).toBe('');
    finish();
    expect(displayed()).toBe('repaired:replacement');
  });

  test('abandons pending work when collapsed instead of scheduling it after unmount', () => {
    update('ab');
    act(() => renderer.unmount());
    finish();
    expect(mockWorklets).toHaveLength(0);
  });

  test('keeps the pipeline moving when Markdown repair fails', () => {
    mockRepairFails = true;
    update('ab');
    finish();
    expect(displayed()).toBe('a');
    mockRepairFails = false;
    finish();
    expect(displayed()).toBe('repaired:ab');
  });
});
