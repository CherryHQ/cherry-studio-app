import type { Provider } from '@cherrystudio/universal/data/types/provider';
import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('@cherrystudio/ui/components', () => {
  const React = require('react');
  const { Pressable, Text, View } = require('react-native');
  function MockSection({ children, footer }: { children?: ReactNode; footer?: ReactNode }) {
    return React.createElement(View, null, children, footer);
  }
  function MockSectionItem({ children }: { children?: ReactNode }) {
    return React.createElement(View, null, children);
  }
  function MockButton({
    children,
    icon: _icon,
    ...props
  }: {
    children?: ReactNode;
    icon?: ReactNode;
  }) {
    return React.createElement(Pressable, props, React.createElement(Text, null, children));
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
  useTranslation: () => ({ i18n: { language: 'en-US' }, t: (key: string) => key }),
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

import { ProviderOauthSectionView } from '../ProviderOauthSection';

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

  it('uses an OAuth-only description when manual API keys are unavailable', () => {
    act(() => {
      renderer = create(
        <ProviderOauthSectionView
          oauth={controller()}
          provider={{
            ...provider,
            authMethods: ['oauth'],
            id: 'copilot',
            name: 'GitHub Copilot',
          }}
        />,
      );
    });

    expect(renderedText(renderer)).toContain('settings.provider.oauth.descriptionOAuthOnly');
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
