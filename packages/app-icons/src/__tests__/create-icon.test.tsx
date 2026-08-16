import { Text, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { createIcon } from '../createIcon';
import { IconGlyph as AndroidIconGlyph } from '../icon-glyph/icon-glyph.android';

// The global stub renders nothing; here the SymbolView props are the behavior under test.
jest.mock('expo-symbols', () => {
  const react = jest.requireActual('react');
  const { View: MockView } = jest.requireActual('react-native');
  return {
    SymbolView: (props: object) =>
      react.createElement(MockView, { ...props, testID: 'symbol-view' }),
  };
});

const iconConfig = { displayName: 'CheckIcon', sf: 'checkmark', glyph: '' } as const;
const CheckIcon = createIcon(iconConfig);

describe('createIcon', () => {
  let renderer: ReactTestRenderer | undefined;

  async function render(element: React.ReactElement) {
    await act(async () => {
      renderer = create(element);
    });
  }

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  test('resolves explicit dimensions and color for the iOS glyph', async () => {
    await render(<CheckIcon color="#ff0000" height={24} width={32} />);

    expect(renderer?.root.findByProps({ testID: 'symbol-view' }).props).toMatchObject({
      size: 24,
      style: { height: 24, width: 32 },
      tintColor: '#ff0000',
    });
  });

  test('falls back to the shared 24pt size', async () => {
    await render(<CheckIcon />);

    expect(renderer?.root.findByProps({ testID: 'symbol-view' }).props.size).toBe(24);
  });

  test('hides the native iOS symbol subtree', async () => {
    await render(<CheckIcon />);

    expect(renderer?.root.findByType(View).props.accessibilityElementsHidden).toBe(true);
  });

  test('renders the bundled Material glyph on Android', async () => {
    await render(<AndroidIconGlyph color="#00ff00" config={iconConfig} height={28} width={28} />);

    if (!renderer) {
      throw new Error('Renderer was not created');
    }
    const text = renderer.root.findByType(Text);
    expect(text.props.children).toBe('');
    expect(text.props.allowFontScaling).toBe(false);
    expect(text.props.style[0]).toMatchObject({
      color: '#00ff00',
      fontFamily: 'MaterialSymbols',
      fontSize: 28,
      lineHeight: 28,
    });
  });
});
