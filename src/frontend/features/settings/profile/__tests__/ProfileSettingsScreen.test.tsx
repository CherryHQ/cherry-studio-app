import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { AccountState } from '@/shared/contracts/account';

import ProfileSettingsScreen from '../ProfileSettingsScreen';

let mockState: AccountState;
const mockSignIn = jest.fn(async () => true);
const mockPush = jest.fn();

jest.mock('@logger', () => ({
  loggerService: { withContext: () => ({ error: jest.fn() }) },
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@cherrystudio/app-icons/icons/building-2', () => () => null);
jest.mock('@cherrystudio/app-icons/icons/server', () => () => null);
jest.mock('@cherrystudio/ui/components', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const host =
    (name: string) =>
    ({ children, ...props }: { children?: ReactNode }) =>
      createElement(name, props, children);
  return {
    Button: host('Button'),
    Image: host('Image'),
    Section: Object.assign(host('Section'), { Item: host('SectionItem') }),
    useAlert: () => ({ alert: { confirm: jest.fn() } }),
    useToast: () => ({ toast: { show: jest.fn() } }),
  };
});
jest.mock('@/frontend/appShell/account', () => ({
  ACCOUNT_ERROR_KEYS: {},
  organizationLabel: jest.requireActual('@/frontend/appShell/account/organizationLabel')
    .organizationLabel,
  useAccount: () => ({ account: { signIn: mockSignIn, signOut: jest.fn() }, state: mockState }),
}));
jest.mock('@/frontend/components/Avatar', () => ({
  AvatarImagePicker: ({ children }: { children: ReactNode }) => children,
  ProfileEditableAvatar: () => null,
}));
jest.mock('@/frontend/data', () => ({ useBackendModule: () => ({ persistAvatar: jest.fn() }) }));
jest.mock('@/frontend/data/hooks', () => ({ usePreference: () => ['Ada', jest.fn()] }));
jest.mock('@/frontend/hooks/useThemeColor', () => ({ useThemeColor: () => '#888' }));
jest.mock('../../components/SettingsScrollPage', () => ({
  SettingsScrollPage: ({ children }: { children: ReactNode }) => children,
}));

const base: AccountState = {
  isCloudSignInAvailable: true,
  isSignedIn: false,
  isEnterprise: false,
  isRestoringSession: false,
  needsSignIn: false,
  hasPrompted: true,
  isBusy: false,
};

function render(state: AccountState) {
  mockState = state;
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<ProfileSettingsScreen />);
  });
  const [card, signOut] = renderer.root.findAllByType('SectionItem' as never);
  const sections = renderer.root.findAllByType('Section' as never);
  return {
    card: card.props as { label: string; description?: string; trailing: { props: object } },
    signOut,
    footer: (sections[1]?.props as { footer?: string } | undefined)?.footer,
  };
}

describe('ProfileSettingsScreen account card', () => {
  beforeEach(() => jest.clearAllMocks());

  test('offers sign-in without a sign-out row when no account is signed in', () => {
    const { card, signOut } = render(base);
    expect(card).toMatchObject({
      label: 'account.notSignedIn',
      description: 'account.signInDescription',
    });
    expect(card.trailing.props).toMatchObject({
      children: 'account.login.signIn',
      variant: 'default',
    });
    (card.trailing.props as { onPress: () => void }).onPress();
    expect(mockPush).toHaveBeenCalledWith('/login');
    expect(signOut).toBeUndefined();
  });

  test('names a private deployment by its host and user, and switches through sign-in', () => {
    const { card, footer } = render({
      ...base,
      isEnterprise: true,
      isSignedIn: true,
      name: 'alice',
      privateAddress: 'https://ai.acme.internal/api',
    });
    expect(card).toMatchObject({
      label: 'ai.acme.internal',
      description: 'alice · account.kind.private',
    });
    (card.trailing.props as { onPress: () => void }).onPress();
    expect(mockPush).toHaveBeenCalledWith('/login');
    expect(footer).toBe('account.signOutConfirm.description');
  });

  test('names a cloud organization and switches through the portal', () => {
    const { card } = render({
      ...base,
      isEnterprise: true,
      isSignedIn: true,
      name: 'Ada Zhang',
      organizationName: 'Acme',
    });
    expect(card).toMatchObject({
      label: 'Acme',
      description: 'Ada Zhang · account.kind.organization',
    });
    (card.trailing.props as { onPress: () => void }).onPress();
    expect(mockSignIn).toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  test('keeps a community sign-out without the organization footer', () => {
    const { card, signOut, footer } = render({ ...base, isSignedIn: true, name: 'ada@cherry.ai' });
    expect(card).toMatchObject({ label: 'account.cloudAccount', description: 'ada@cherry.ai' });
    expect(signOut).toBeDefined();
    expect(footer).toBeUndefined();
  });
});
