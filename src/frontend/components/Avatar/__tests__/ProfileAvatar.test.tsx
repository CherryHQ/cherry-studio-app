import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ProfileAvatarImage, ProfileEditableAvatar } from '..';

const mockAvatar = jest.fn(({ children }: { children?: React.ReactNode }) => children);
const mockAvatarBadge = jest.fn(({ children }: { children?: React.ReactNode }) => children);
const mockAvatarImage = jest.fn((_props: unknown) => null);
const mockCameraIcon = jest.fn((_props: unknown) => null);
const mockPencilIcon = jest.fn((_props: unknown) => null);
const mockUseAvatar = jest.fn(() => 'profile-avatar-source');

jest.mock('@cherrystudio/app-icons/icons/camera', () => (props: unknown) => mockCameraIcon(props));
jest.mock('@cherrystudio/app-icons/icons/pencil', () => (props: unknown) => mockPencilIcon(props));

jest.mock('@cherrystudio/ui/components', () => {
  const Avatar = Object.assign((props: { children?: React.ReactNode }) => mockAvatar(props), {
    Badge: (props: { children?: React.ReactNode }) => mockAvatarBadge(props),
    Image: (props: unknown) => mockAvatarImage(props),
  });

  return { Avatar };
});

jest.mock('@/frontend/hooks/useAvatar', () => ({
  useAvatar: () => mockUseAvatar(),
}));

jest.mock('@/frontend/hooks/useThemeColor', () => ({
  useThemeColor: () => '#123456',
}));

describe('ProfileAvatar', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => jest.clearAllMocks());

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('renders the stored profile image through CherryUI Avatar', () => {
    render(<ProfileAvatarImage accessibilityLabel="Profile avatar" size={36} />);

    expect(mockAvatar).toHaveBeenCalledWith(
      expect.objectContaining({ accessibilityLabel: 'Profile avatar', size: 36 }),
    );
    expect(mockAvatarImage).toHaveBeenCalledWith(
      expect.objectContaining({
        cachePolicy: 'memory-disk',
        contentFit: 'cover',
        source: 'profile-avatar-source',
      }),
    );
    expect(mockAvatarBadge).not.toHaveBeenCalled();
  });

  test.each([
    ['camera', mockCameraIcon, mockPencilIcon],
    ['pencil', mockPencilIcon, mockCameraIcon],
  ] as const)('composes the %s edit badge outside the avatar face', (icon, expected, other) => {
    render(<ProfileEditableAvatar accessibilityLabel="Change avatar" icon={icon} size={100} />);

    expect(mockAvatarBadge).toHaveBeenCalledWith(
      expect.objectContaining({
        className: 'right-0 bottom-0 border border-border bg-card',
        placement: 'bottom-end',
        style: { borderRadius: 16, height: 32, width: 32 },
      }),
    );
    expect(expected).toHaveBeenCalledWith({ color: '#123456', size: 16 });
    expect(other).not.toHaveBeenCalled();
  });

  function render(element: React.ReactElement) {
    act(() => {
      renderer = create(element);
    });
  }
});
