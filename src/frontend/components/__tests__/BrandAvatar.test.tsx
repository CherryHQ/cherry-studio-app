import { Text, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { BrandAvatar, BrandAvatarIcon, BrandAvatarPhoto } from '../BrandAvatar';

const mockImage = jest.fn((_props: unknown) => null);

jest.mock('@/frontend/components/nativePrimitives', () => ({
  Image: (props: unknown) => mockImage(props),
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

    expect(frame().props.style).toEqual({ borderRadius: 6, height: 26, width: 26 });
    expect(renderer?.root.findAllByType(View)[1].props.style).toEqual({
      backgroundColor: '#46429b',
      borderRadius: 5,
      height: 26 * 0.8125,
      width: 26 * 0.8125,
    });
    expect(renderer?.root.findByType(Text).props.children).toBe('c');
  });

  it('leaves the frame unpainted when content is supplied', () => {
    render(
      <BrandAvatar label="codex">
        <Text>{'…'}</Text>
      </BrandAvatar>,
    );

    expect(frame().props.style).toEqual({ borderRadius: 6, height: 26, width: 26 });
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
    expect(frame().props.style).toEqual({ borderRadius: 32 * (6 / 26), height: 32, width: 32 });
    expect(mockImage).toHaveBeenCalledWith(
      expect.objectContaining({
        contentFit: 'contain',
        source: 'anthropic-light',
        style: { borderRadius: 5, height: 32 * (5 / 7), width: 32 * (5 / 7) },
      }),
    );
  });

  it('uses the untrimmed default scale for logos without their own tile', () => {
    render(
      <BrandAvatar label="OpenAI">
        <BrandAvatarIcon iconId="openai" source="openai-light" />
      </BrandAvatar>,
    );

    expect(mockImage).toHaveBeenCalledWith(
      expect.objectContaining({
        style: { borderRadius: undefined, height: 26 * 0.8125, width: 26 * 0.8125 },
      }),
    );
  });

  it('crops a user photo to fill the whole frame', () => {
    render(
      <BrandAvatar label="Custom" size={32}>
        <BrandAvatarPhoto uri="file:///avatar.png" />
      </BrandAvatar>,
    );

    expect(mockImage).toHaveBeenCalledWith(
      expect.objectContaining({
        contentFit: 'cover',
        source: { uri: 'file:///avatar.png' },
        style: { height: 32, width: 32 },
      }),
    );
  });

  function render(element: React.ReactElement) {
    act(() => {
      renderer = create(element);
    });
  }

  function frame() {
    return renderer!.root.findByType(View);
  }
});
