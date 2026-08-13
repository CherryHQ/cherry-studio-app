import { Platform, Text, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { createIcon } from '../createIcon';

// The global stub renders nothing; here the SymbolView props ARE the behavior
// under test, so give the suite an inspectable stand-in.
jest.mock('expo-symbols', () => {
  const react = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    SymbolView: (props: object) => react.createElement(View, { ...props, testID: 'symbol-view' }),
  };
});

const CheckIcon = createIcon({ displayName: 'CheckIcon', sf: 'checkmark', glyph: '' });

const originalPlatform = Platform.OS;

function setPlatform(platform: string) {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: platform });
}

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
    setPlatform(originalPlatform);
  });

  // className-driven sizing (`size-5` → 20pt) is resolved by uniwind's stylesheet, which Jest
  // does not load, so these assert the explicit-prop side of the contract only.
  it('renders the SF Symbol on iOS with explicit size and color', async () => {
    setPlatform('ios');
    await render(<CheckIcon color="#ff0000" size={20} />);

    const symbol = renderer?.root.findByProps({ testID: 'symbol-view' });
    expect(symbol?.props.name).toBe('checkmark');
    expect(symbol?.props.size).toBe(20);
    expect(symbol?.props.tintColor).toBe('#ff0000');
    expect(symbol?.props.style).toEqual({ height: 20, width: 20 });
  });

  // Verified on device: without the hidden wrapper, an icon-only button announces "checkmark".
  it('hides the iOS symbol subtree from the accessibility tree', async () => {
    setPlatform('ios');
    await render(<CheckIcon />);

    const wrapper = renderer?.root.findByType(View);
    expect(wrapper?.props.accessibilityElementsHidden).toBe(true);
  });

  it('lets explicit size win over className on iOS', async () => {
    setPlatform('ios');
    await render(<CheckIcon className="size-5" size={32} />);

    expect(renderer?.root.findByProps({ testID: 'symbol-view' }).props.size).toBe(32);
  });

  it('renders the Material glyph as a bundled-font Text on Android', async () => {
    setPlatform('android');
    await render(<CheckIcon color="#00ff00" size={28} />);

    const text = renderer?.root.findByType(Text);
    expect(text?.props.children).toBe('');
    expect(text?.props.allowFontScaling).toBe(false);

    const style = text?.props.style[0];
    expect(style.fontFamily).toBe('MaterialSymbols');
    expect(style.fontSize).toBe(28);
    expect(style.lineHeight).toBe(28);
    expect(style.color).toBe('#00ff00');
  });

  it('falls back to the 24pt default when nothing sets a size', async () => {
    setPlatform('android');
    await render(<CheckIcon />);

    expect(renderer?.root.findByType(Text).props.style[0].fontSize).toBe(24);
  });
});
