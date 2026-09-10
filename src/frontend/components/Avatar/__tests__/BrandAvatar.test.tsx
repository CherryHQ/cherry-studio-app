import { resolveProviderIcon } from '@cherrystudio/ui/icons';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { BrandAvatar, BrandAvatarIcon, BrandAvatarPhoto, ProviderBrandAvatar } from '..';

const mockAvatar = jest.fn(({ children }: { children?: React.ReactNode }) => children);
const mockAvatarFallback = jest.fn((_props: unknown) => null);
const mockAvatarImage = jest.fn((_props: unknown) => null);

jest.mock('@cherrystudio/ui/components', () => {
  const Avatar = Object.assign((props: { children?: React.ReactNode }) => mockAvatar(props), {
    Fallback: (props: unknown) => mockAvatarFallback(props),
    Image: (props: unknown) => mockAvatarImage(props),
  });

  return { Avatar, Image: () => null };
});

jest.mock('@/frontend/hooks/useAvatar', () => ({
  useAvatar: () => 'profile-avatar-source',
}));

jest.mock('@cherrystudio/ui/icons', () => {
  const actual = jest.requireActual('@cherrystudio/ui/icons');
  return { ...actual, resolveProviderIcon: jest.fn(actual.resolveProviderIcon) };
});

jest.mock('uniwind', () => ({
  useUniwind: () => ({ theme: 'light' }),
  useResolveClassNames: () => ({ borderRadius: 6.4 }),
}));

const mockResolveProviderIcon = jest.mocked(resolveProviderIcon);

describe('BrandAvatar', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveProviderIcon.mockImplementation(
      jest.requireActual('@cherrystudio/ui/icons').resolveProviderIcon,
    );
  });

  afterEach(() => {
    if (renderer) {
      act(() => renderer?.unmount());
      renderer = undefined;
    }
  });

  it('falls back to the generated initial when given no content', () => {
    render(<BrandAvatar label="codex" />);

    expect(mockAvatar).toHaveBeenCalledWith(
      expect.objectContaining({
        accessibilityLabel: 'codex',
        radius: 6.4,
        shape: 'rounded',
        size: 26,
      }),
    );
    expect(mockAvatarFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        children: 'c',
        style: { backgroundColor: '#46429b' },
        textProps: { style: { color: '#FFFFFF', fontSize: 14 } },
      }),
    );
  });

  it('leaves the frame unpainted when content is supplied', () => {
    render(
      <BrandAvatar label="codex">
        <Text>{'…'}</Text>
      </BrandAvatar>,
    );

    expect(mockAvatar).toHaveBeenCalledWith(
      expect.objectContaining({ accessibilityLabel: 'codex', shape: 'rounded', size: 26 }),
    );
    expect(mockAvatarFallback).not.toHaveBeenCalled();
    expect(renderer?.root.findByType(Text).props.children).toBe('…');
  });

  it('lets the shared frame clip a logo that already has a brand background', () => {
    const source = resolveProviderIcon('anthropic')!;
    render(
      <BrandAvatar label="Anthropic" size={32}>
        <BrandAvatarIcon displayContext="provider" source={source} />
      </BrandAvatar>,
    );

    expect(mockAvatar).toHaveBeenCalledWith(expect.objectContaining({ radius: 6.4, size: 32 }));
    expect(mockAvatarImage).toHaveBeenCalledWith(
      expect.objectContaining({
        contentFit: 'contain',
        scale: 1,
        source: source.light,
      }),
    );
  });

  it('uses the untrimmed default scale for logos without their own tile', () => {
    render(
      <BrandAvatar label="OpenAI">
        <BrandAvatarIcon source={{ dark: 2, light: 1 }} />
      </BrandAvatar>,
    );

    expect(mockAvatarImage).toHaveBeenCalledWith(
      expect.objectContaining({
        scale: 1,
      }),
    );
  });

  it('crops a user photo to fill the whole frame', () => {
    render(
      <BrandAvatar label="Custom" size={32}>
        <BrandAvatarPhoto uri="file:///avatar.png" />
      </BrandAvatar>,
    );

    expect(mockAvatarImage).toHaveBeenCalledWith(
      expect.objectContaining({
        contentFit: 'cover',
        source: { uri: 'file:///avatar.png' },
      }),
    );
  });

  it('resolves a preset provider logo through the shared provider adapter', () => {
    mockResolveProviderIcon.mockReturnValue({
      dark: 'openai-dark',
      light: 'openai-light',
    } as never);

    render(
      <ProviderBrandAvatar
        presetProviderId="openai"
        providerId="custom-openai"
        providerName="Custom OpenAI"
        size={32}
        testID="provider-avatar"
      />,
    );

    expect(mockResolveProviderIcon).toHaveBeenCalledWith('openai');
    expect(mockAvatar).toHaveBeenCalledWith(
      expect.objectContaining({
        accessibilityLabel: 'Custom OpenAI',
        size: 32,
        testID: 'provider-avatar',
      }),
    );
    expect(mockAvatarImage).toHaveBeenCalledWith(
      expect.objectContaining({
        recyclingKey: 'custom-openai',
        scale: 0.8125,
        source: 'openai-light',
      }),
    );
  });

  it('keeps the generated-initial fallback when a provider has no built-in logo', () => {
    mockResolveProviderIcon.mockReturnValue(undefined);

    render(<ProviderBrandAvatar providerId="custom-provider" providerName="Custom Provider" />);

    expect(mockResolveProviderIcon).toHaveBeenCalledWith('custom-provider');
    expect(mockAvatarFallback).toHaveBeenCalledWith(expect.objectContaining({ children: 'C' }));
  });

  function render(element: React.ReactElement) {
    act(() => {
      renderer = create(element);
    });
  }
});
