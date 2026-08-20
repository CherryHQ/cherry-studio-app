import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { BrandAvatar, BrandAvatarIcon, BrandAvatarPhoto } from '..';

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

describe('BrandAvatar', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => jest.clearAllMocks());

  afterEach(() => {
    if (renderer) {
      act(() => renderer?.unmount());
      renderer = undefined;
    }
  });

  it('falls back to the generated initial when given no content', () => {
    render(<BrandAvatar label="codex" />);

    // At the default size the ratios resolve to the plain constants they replaced.
    expect(mockAvatar).toHaveBeenCalledWith(
      expect.objectContaining({
        accessibilityLabel: 'codex',
        radius: 6,
        shape: 'rounded',
        size: 26,
      }),
    );
    expect(mockAvatarFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        children: 'c',
        scale: 0.8125,
        style: { backgroundColor: '#46429b', borderRadius: 5 },
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

  it('scales an inset logo against the frame size it is nested in', () => {
    render(
      <BrandAvatar label="Anthropic" size={32}>
        <BrandAvatarIcon iconId="anthropic" source="anthropic-light" />
      </BrandAvatar>,
    );

    // The frame's own radius is a ratio of the default size, not a constant:
    // the same avatar is rendered at 26 in lists and near 100 in the provider
    // form, where a fixed 6 would read as a square.
    expect(mockAvatar).toHaveBeenCalledWith(
      expect.objectContaining({ radius: 32 * (6 / 26), size: 32 }),
    );
    expect(mockAvatarImage).toHaveBeenCalledWith(
      expect.objectContaining({
        contentFit: 'contain',
        scale: 5 / 7,
        source: 'anthropic-light',
        style: { borderRadius: 5 },
      }),
    );
  });

  it('uses the untrimmed default scale for logos without their own tile', () => {
    render(
      <BrandAvatar label="OpenAI">
        <BrandAvatarIcon iconId="openai" source="openai-light" />
      </BrandAvatar>,
    );

    expect(mockAvatarImage).toHaveBeenCalledWith(
      expect.objectContaining({
        scale: 0.8125,
        style: { borderRadius: undefined },
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

  function render(element: React.ReactElement) {
    act(() => {
      renderer = create(element);
    });
  }
});
