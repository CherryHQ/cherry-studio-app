import { Text, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ProviderAvatar } from '../ProviderAvatar';

const mockResolveProviderIcon = jest.fn();
const mockResolveAvatar = jest.fn();
const mockImage = jest.fn((_props: unknown) => null);

jest.mock('@cherrystudio/ui/icons', () => ({
  resolveProviderIcon: (...args: unknown[]) => mockResolveProviderIcon(...args),
}));

jest.mock('@/frontend/components/nativePrimitives', () => ({
  Image: (props: unknown) => mockImage(props),
}));

jest.mock('@/frontend/data', () => ({
  useBackendModule: () => ({ resolveAvatar: mockResolveAvatar }),
}));

jest.mock('uniwind', () => ({
  useUniwind: () => ({ theme: 'dark' }),
}));

describe('ProviderAvatar', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveAvatar.mockReturnValue(undefined);
  });

  afterEach(() => {
    if (renderer) {
      act(() => renderer?.unmount());
      renderer = undefined;
    }
  });

  it('renders a contained desktop-style provider logo in the list frame', () => {
    mockResolveProviderIcon.mockReturnValue({ dark: 'cherryin-dark', light: 'cherryin-light' });

    act(() => {
      renderer = create(
        <ProviderAvatar providerId="custom" presetProviderId="cherryin" providerName="CherryIN" />,
      );
    });

    expect(renderer?.root.findByType(View).props).toEqual(
      expect.objectContaining({
        className:
          'items-center justify-center overflow-hidden border border-border border-continuous',
        style: { borderRadius: 6, height: 26, width: 26 },
      }),
    );
    expect(mockImage).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'cherryin-dark',
        style: {
          borderRadius: 5,
          height: 26 * (5 / 7),
          width: 26 * (5 / 7),
        },
      }),
    );
  });

  it('renders the desktop generated-color fallback when no logo exists', () => {
    mockResolveProviderIcon.mockReturnValue(undefined);

    act(() => {
      renderer = create(<ProviderAvatar providerId="codex" providerName="codex" />);
    });

    expect(renderer?.root.findByType(View).props.style).toEqual({
      backgroundColor: '#46429b',
      borderRadius: 6,
      height: 26,
      width: 26,
    });
    expect(renderer?.root.findByType(Text).props).toEqual(
      expect.objectContaining({
        children: 'c',
        style: { color: '#FFFFFF', fontSize: 14 },
      }),
    );
  });
});
