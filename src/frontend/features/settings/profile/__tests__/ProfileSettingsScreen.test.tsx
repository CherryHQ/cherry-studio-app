import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { AccountState } from '@/shared/contracts/account';

import ProfileSettingsScreen from '../ProfileSettingsScreen';

let mockState: AccountState;
const mockSignIn = jest.fn(async () => true);
const mockSwitchSpace = jest.fn(async () => true);
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
  useAccount: () => ({
    account: { signIn: mockSignIn, signOut: jest.fn(), switchSpace: mockSwitchSpace },
    state: mockState,
  }),
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
  const [card, ...rows] = renderer.root.findAllByType('SectionItem' as never);
  const sections = renderer.root.findAllByType('Section' as never);
  const row = (label: string) =>
    rows.find((item) => (item.props as { label: string }).label === label)?.props as
      | { onPress: () => void }
      | undefined;
  return {
    card: card.props as { label: string; description?: string; trailing: { props: object } },
    press: () =>
      (card.props as { trailing: { props: { onPress: () => void } } }).trailing.props.onPress(),
    switchAccount: row('account.switch'),
    signOut: row('account.signOut'),
    footer: (sections[1]?.props as { footer?: string } | undefined)?.footer,
  };
}

describe('ProfileSettingsScreen account card', () => {
  beforeEach(() => jest.clearAllMocks());

  test('offers sign-in without a sign-out row when no account is signed in', () => {
    const { card, press, signOut } = render(base);
    expect(card).toMatchObject({
      label: 'account.notSignedIn',
      description: 'account.signInDescription',
    });
    expect(card.trailing.props).toMatchObject({
      children: 'account.login.signIn',
      variant: 'default',
    });
    press();
    expect(mockPush).toHaveBeenCalledWith('/login');
    expect(signOut).toBeUndefined();
  });

  test('names a private deployment by its host and user, and switches through sign-in', () => {
    const { card, press, switchAccount, footer } = render({
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
    // A private deployment has no portal choice; its card switches accounts directly.
    expect(card.trailing.props).toMatchObject({ children: 'account.switch' });
    expect(switchAccount).toBeUndefined();
    press();
    expect(mockPush).toHaveBeenCalledWith('/login');
    expect(footer).toBe('account.signOutConfirm.description');
  });

  test('switches a cloud organization through the portal and accounts through its login', () => {
    const { card, press, switchAccount } = render({
      ...base,
      isEnterprise: true,
      isSignedIn: true,
      maskedIdentifier: 'ad***@acme.com',
      organizationName: 'Acme',
    });
    expect(card).toMatchObject({
      label: 'Acme',
      description: 'ad***@acme.com · account.kind.organization',
    });
    expect(card.trailing.props).toMatchObject({ children: 'account.switchOrganization' });
    press();
    expect(mockSwitchSpace).toHaveBeenCalled();
    switchAccount!.onPress();
    expect(mockSignIn).toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  test('keeps a community sign-out without the organization footer', () => {
    const { card, switchAccount, signOut, footer } = render({
      ...base,
      isSignedIn: true,
      name: 'Ada',
    });
    expect(card).toMatchObject({ label: 'account.cloudAccount', description: 'Ada' });
    expect(card.trailing.props).toMatchObject({ children: 'account.switchOrganization' });
    switchAccount!.onPress();
    expect(mockPush).toHaveBeenCalledWith('/login');
    expect(signOut).toBeDefined();
    expect(footer).toBeUndefined();
  });
});
