import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { BackendProvider } from '@/frontend/data';
import type { Backend } from '@/shared/contracts';

import ProfileSettingsScreen from '../ProfileSettingsScreen';

type HeaderAction = { key: string; onPress?: () => void };

const mockBack = jest.fn();
const mockSetAvatar = jest.fn();
const mockSetUserName = jest.fn();
let mockRightActions: readonly HeaderAction[] = [];
const backend = {
  profile: {
    persistAvatar: jest.fn(async () => undefined),
    resolveAvatar: jest.fn(),
  },
} as unknown as Backend;

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

jest.mock('@cherrystudio/ui/components', () => {
  const React = jest.requireActual('react');
  const {
    Text: MockText,
    TextInput: MockTextInput,
    View: MockView,
  } = jest.requireActual('react-native');
  const component =
    (type: string) =>
    ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement(type, props, children);

  return {
    DropdownMenu: {
      Content: component('DropdownMenu.Content'),
      Item: component('DropdownMenu.Item'),
      ItemIcon: component('DropdownMenu.ItemIcon'),
      ItemTitle: component('DropdownMenu.ItemTitle'),
      Root: component('DropdownMenu.Root'),
      Trigger: component('DropdownMenu.Trigger'),
    },
    Input: React.forwardRef(function MockInput(
      props: React.ComponentProps<typeof MockTextInput>,
      ref: React.Ref<typeof MockTextInput>,
    ) {
      return <MockTextInput {...props} ref={ref} />;
    }),
    Label: MockText,
    TextField: MockView,
  };
});

jest.mock('@/frontend/components/AlertProvider', () => ({
  useAlert: () => ({ alert: { show: jest.fn() } }),
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
      renderer = create(
        <BackendProvider backend={backend}>
          <ProfileSettingsScreen />
        </BackendProvider>,
      );
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
