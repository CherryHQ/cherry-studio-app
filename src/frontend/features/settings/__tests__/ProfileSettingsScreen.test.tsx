import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import ProfileSettingsScreen from '../ProfileSettingsScreen';

type HeaderAction = { key: string; onPress?: () => void };

const mockBack = jest.fn();
const mockSetAvatar = jest.fn();
const mockSetUserName = jest.fn();
let mockRightActions: readonly HeaderAction[] = [];

jest.mock('@expo/ui/community/menu', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return {
    MenuView: ({ children }: { children: React.ReactNode }) => <MockView>{children}</MockView>,
  };
});

jest.mock('@logger', () => ({
  loggerService: {
    withContext: () => ({ error: jest.fn() }),
  },
}));

jest.mock('expo-image-picker', () => ({
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
}));

jest.mock('heroui-native/hooks', () => ({
  useThemeColor: () => '#000000',
}));

jest.mock('heroui-native/input', () => {
  const React = jest.requireActual('react');
  const { TextInput: MockTextInput } = jest.requireActual('react-native');

  return {
    Input: React.forwardRef(function MockInput(
      props: React.ComponentProps<typeof MockTextInput>,
      ref: React.Ref<typeof MockTextInput>,
    ) {
      return <MockTextInput {...props} ref={ref} />;
    }),
  };
});

jest.mock('heroui-native/toast', () => ({
  useToast: () => ({ toast: { show: jest.fn() } }),
}));

jest.mock('lucide-uniwind/png', () => ({
  SaveIcon: () => null,
}));

jest.mock('@/frontend/components/headers', () => ({
  BackHeader: ({ rightActions }: { rightActions?: readonly HeaderAction[] }) => {
    mockRightActions = rightActions ?? [];
    return null;
  },
}));

jest.mock('@/frontend/components/ProfileAvatar', () => ({
  ProfileAvatarEditBadge: () => null,
  ProfileAvatarImage: () => null,
}));

jest.mock('@/frontend/data/hooks', () => ({
  usePreference: (key: string) =>
    key === 'app.user.name' ? ['Saved name', mockSetUserName] : [null, mockSetAvatar],
}));

jest.mock('@/backend/infrastructure/integrations/avatars/userAvatarStorage', () => ({
  replaceUserAvatar: jest.fn(),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'chat.media.camera': 'Camera',
        'chat.media.photos': 'Photos',
        'common.save': 'Save',
        'settings.profile.changeAvatar': 'Change avatar',
        'settings.profile.edit': 'Edit profile',
        'settings.profile.userName': 'Username',
      })[key] ?? key,
  }),
}));

describe('ProfileSettingsScreen', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRightActions = [];
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  it('keeps name edits local until the user saves', async () => {
    await act(async () => {
      renderer = create(<ProfileSettingsScreen />);
    });

    const nameInput = renderer?.root.findByProps({ accessibilityLabel: 'Username' });

    await act(async () => {
      nameInput?.props.onChangeText('槑');
      nameInput?.props.onChangeText('槑囿');
      nameInput?.props.onChangeText('槑囿脑袋');
    });

    expect(mockSetUserName).not.toHaveBeenCalled();
    expect(renderer?.root.findByProps({ accessibilityLabel: 'Username' }).props.value).toBe(
      '槑囿脑袋',
    );

    const saveAction = mockRightActions.find((action) => action.key === 'finish-profile-edit');
    saveAction?.onPress?.();

    expect(mockSetUserName).toHaveBeenCalledTimes(1);
    expect(mockSetUserName).toHaveBeenCalledWith('槑囿脑袋', { optimistic: true });
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
