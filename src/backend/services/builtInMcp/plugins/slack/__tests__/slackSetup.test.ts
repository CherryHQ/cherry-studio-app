import { getSlackApplicationSetupUrl, SLACK_USER_SCOPES } from '../slackSetup';

it('prefills user permissions for an internal app without OAuth callbacks or token rotation', () => {
  const url = new URL(getSlackApplicationSetupUrl());
  expect(url.origin + url.pathname).toBe('https://api.slack.com/apps');
  expect(url.searchParams.get('new_app')).toBe('1');
  const manifest = JSON.parse(url.searchParams.get('manifest_json')!);
  expect(manifest.oauth_config).toEqual({ scopes: { user: [...SLACK_USER_SCOPES] } });
  expect(manifest.settings.token_rotation_enabled).toBe(false);
  expect(SLACK_USER_SCOPES).toEqual(
    expect.arrayContaining(['search:read.public', 'chat:write', 'canvases:write', 'lists:write']),
  );
  expect(SLACK_USER_SCOPES).not.toContain('files:write');
});
