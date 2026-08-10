import { isProviderOauthNavigationAllowed } from '../providerOauthNavigation';

describe('isProviderOauthNavigationAllowed', () => {
  const allowed = ['https://dash.302.ai', 'https://302.ai'];

  it('allows only the exact configured HTTPS origin', () => {
    expect(isProviderOauthNavigationAllowed('https://dash.302.ai/sso/login', allowed)).toBe(true);
    expect(isProviderOauthNavigationAllowed('https://302.ai/sso/login', allowed)).toBe(true);
    expect(
      isProviderOauthNavigationAllowed('https://dash.302.ai.attacker.example/callback', allowed),
    ).toBe(false);
    expect(isProviderOauthNavigationAllowed('http://dash.302.ai/sso/login', allowed)).toBe(false);
  });

  it('allows the WebView bootstrap document and rejects invalid URLs', () => {
    expect(isProviderOauthNavigationAllowed('about:blank', allowed)).toBe(true);
    expect(isProviderOauthNavigationAllowed('not-a-url', allowed)).toBe(false);
  });

  it('allows AIOnly official origins without trusting sibling or lookalike domains', () => {
    const aiOnlyOrigins = ['https://maas.aiionly.com', 'https://aiionly.com'];

    expect(
      isProviderOauthNavigationAllowed(
        'https://aiionly.com/invitationLogin?inviteCode=invite',
        aiOnlyOrigins,
      ),
    ).toBe(true);
    expect(
      isProviderOauthNavigationAllowed('https://aionly.com/invitationLogin', aiOnlyOrigins),
    ).toBe(false);
    expect(
      isProviderOauthNavigationAllowed('https://aiionly.com.attacker.example', aiOnlyOrigins),
    ).toBe(false);
  });
});
