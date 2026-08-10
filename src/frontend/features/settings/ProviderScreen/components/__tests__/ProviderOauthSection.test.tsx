import type { Provider } from '@cherrystudio/universal/data/types/provider';
import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { CherryInOauth } from '../CherryInOauth';
import { ProviderOauthSectionView } from '../ProviderOauthSection';

const mockUseCherryInOauth = jest.fn();

jest.mock('@cherrystudio/ui/components', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  function MockSection({
    children,
    ...props
  }: {
    children?: ReactNode;
    contentClassName?: string;
  }) {
    return React.createElement('Section', props, children);
  }
  function MockSectionItem({ children }: { children?: ReactNode }) {
    return React.createElement('SectionItem', null, children);
  }
  function MockButton({
    children,
    icon: _icon,
    ...props
  }: {
    children?: ReactNode;
    icon?: ReactNode;
  }) {
    return React.createElement('Button', { ...props, hasIcon: _icon !== undefined }, children);
  }
  const Section = Object.assign(MockSection, { Item: MockSectionItem });
  return {
    Button: MockButton,
    Section,
  };
});
jest.mock('@cherrystudio/ui/icons/providers', () => ({
  resolveProviderIcon: () => ({ dark: 1, light: 1 }),
}));
jest.mock('lucide-uniwind/png', () => ({
  CircleAlertIcon: () => null,
  CircleDollarSignIcon: () => null,
  CopyIcon: () => null,
  ExternalLinkIcon: () => null,
  LogInIcon: () => null,
  LogOutIcon: () => null,
  ReceiptTextIcon: () => null,
  XIcon: () => null,
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en-US' },
    t: (key: string) => (key === 'settings.provider.oauth.login' ? 'Sign in' : key),
  }),
}));
jest.mock('uniwind', () => ({
  useResolveClassNames: () => ({}),
  useUniwind: () => ({ theme: 'light' }),
}));
jest.mock('@/frontend/components/AlertProvider', () => ({
  useAlert: () => ({ alert: { confirm: jest.fn(), show: jest.fn() } }),
}));
jest.mock('@/frontend/components/nativePrimitives', () => ({ Image: () => null }));
jest.mock('@/frontend/utils/openExternalUrl', () => ({ openExternalUrl: jest.fn() }));
jest.mock('../../hooks/useProviderOauth', () => ({
  UserCancelledError: class UserCancelledError extends Error {},
  useProviderOauth: jest.fn(),
}));
jest.mock('../../hooks/useCherryInOauth', () => ({
  useCherryInOauth: (...args: unknown[]) => mockUseCherryInOauth(...args),
}));

const provider = {
  id: 'openai-codex',
  name: 'OpenAI Codex',
  websites: { official: 'https://openai.com/codex' },
} as Provider;

function controller(overrides: Record<string, unknown> = {}) {
  return {
    cancelAuthorization: jest.fn(async () => undefined),
    deviceAuthorization: undefined,
    isLoggingIn: false,
    isLoggingOut: false,
    login: jest.fn(async () => undefined),
    logout: jest.fn(async () => undefined),
    status: {
      accountId: null,
      flowType: 'pkce-session',
      isAuthenticated: false,
      isConfigured: true,
      providerId: provider.id,
    },
    statusQuery: { isError: false, isPending: false },
    ...overrides,
  } as never;
}

describe('ProviderOauthSectionView', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('shows a visible mobile blocker for Codex and Grok login', () => {
    act(() => {
      renderer = create(
        <ProviderOauthSectionView
          oauth={controller({
            status: {
              accountId: null,
              flowType: 'blocked',
              isAuthenticated: false,
              isConfigured: false,
              providerId: provider.id,
            },
          })}
          provider={provider}
        />,
      );
    });

    expect(renderedText(renderer)).toContain('settings.provider.oauth.blockedMobile');
  });

  it('shows the Copilot device code while backend polling is active', () => {
    act(() => {
      renderer = create(
        <ProviderOauthSectionView
          oauth={controller({
            deviceAuthorization: {
              expiresAt: Date.now() + 60_000,
              flowId: 'flow',
              intervalSeconds: 5,
              providerId: 'copilot',
              type: 'device-code-session',
              userCode: 'ABCD-EFGH',
              verificationUri: 'https://github.com/login/device',
            },
          })}
          provider={{ ...provider, id: 'copilot', name: 'GitHub Copilot' } as Provider}
        />,
      );
    });

    expect(renderedText(renderer)).toContain('ABCD-EFGH');
    expect(renderedText(renderer)).toContain('settings.provider.oauth.openAuthorization');
  });

  it('matches the secondary button surface and foreground tokens', () => {
    act(() => {
      renderer = create(<ProviderOauthSectionView oauth={controller()} provider={provider} />);
    });

    expect(renderer!.root.findByProps({ contentClassName: 'bg-field' })).toBeDefined();
    expect(renderedText(renderer)).toContain('text-secondary-foreground');
    expect(renderedText(renderer)).toContain('text-base');
    expect(renderedText(renderer)).not.toContain('text-foreground-secondary');
    expect(renderedText(renderer)).not.toContain('openai.com/codex');
  });

  it('places a small text-only login action beside the provider identity', () => {
    act(() => {
      renderer = create(
        <ProviderOauthSectionView
          authenticatedContent={<Text>Top up</Text>}
          identityDetail={<Text>Balance: $10.22</Text>}
          oauth={controller()}
          provider={provider}
        />,
      );
    });

    const loginButton = renderer!.root.findByProps({ hasIcon: false });
    expect(loginButton.props.size).toBe('sm');
    expect(loginButton.props.variant).toBeUndefined();
    const output = renderedText(renderer);
    expect(output).toContain('Sign in');
    expect(output).not.toContain('Balance: $10.22');
    expect(output).not.toContain('Top up');
  });

  it('places a small text-only logout action beside the provider identity', () => {
    act(() => {
      renderer = create(
        <ProviderOauthSectionView
          authenticatedContent={<Text>Top up</Text>}
          identityDetail={<Text>Balance: $10.22</Text>}
          oauth={controller({
            status: {
              accountId: null,
              flowType: 'pkce-session',
              isAuthenticated: true,
              isConfigured: true,
              providerId: provider.id,
            },
          })}
          provider={provider}
        />,
      );
    });

    const logoutButton = renderer!.root.findByProps({ hasIcon: false, size: 'sm' });
    expect(logoutButton.props.variant).toBe('secondary');
    const output = renderedText(renderer);
    expect(output).toContain('settings.provider.oauth.logout');
    expect(output.indexOf(provider.name)).toBeLessThan(output.indexOf('Balance: $10.22'));
    expect(output.indexOf('Balance: $10.22')).toBeLessThan(output.indexOf('Top up'));
    expect(output.indexOf('Top up')).toBeLessThan(output.indexOf('settings.provider.oauth.logout'));
  });

  it('shows CherryIN balance with text-only top-up and logout actions after login', () => {
    mockUseCherryInOauth.mockReturnValue({
      ...(controller({
        status: {
          accountId: null,
          flowType: 'pkce-session',
          isAuthenticated: true,
          isConfigured: true,
          providerId: 'cherryin',
        },
      }) as unknown as object),
      balance: 10.22,
    });

    act(() => {
      renderer = create(
        <CherryInOauth provider={{ ...provider, id: 'cherryin', name: 'CherryIN' } as Provider} />,
      );
    });

    expect(renderedText(renderer)).toContain('text-sm text-secondary-foreground');
    expect(renderedText(renderer)).toContain('settings.provider.oauth.cherryIn.balance: $10.22');
    const actionButtons = renderer!.root.findAllByType('Button');
    expect(actionButtons).toHaveLength(2);
    expect(actionButtons[0].props).toMatchObject({ hasIcon: false, size: 'sm' });
    expect(actionButtons[0].props.variant).toBeUndefined();
    expect(actionButtons[1].props).toMatchObject({
      hasIcon: false,
      size: 'sm',
      variant: 'secondary',
    });
  });

  it('keeps hosted-provider billing actions after OAuth adds a key', () => {
    act(() => {
      renderer = create(
        <ProviderOauthSectionView
          oauth={controller({
            status: {
              accountId: null,
              flowType: 'webview-api-key',
              isAuthenticated: true,
              isConfigured: true,
              providerId: 'silicon',
            },
          })}
          provider={{ ...provider, id: 'silicon', name: 'SiliconFlow' } as Provider}
        />,
      );
    });

    expect(renderedText(renderer)).toContain('settings.provider.oauth.charge');
    expect(renderedText(renderer)).toContain('settings.provider.oauth.bills');
  });
});

function renderedText(renderer: ReactTestRenderer | undefined): string {
  return JSON.stringify(renderer?.toJSON() ?? '');
}
