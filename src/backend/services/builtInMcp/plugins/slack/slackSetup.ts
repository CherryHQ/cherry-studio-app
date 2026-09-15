// User scopes supported by https://mcp.slack.com/.well-known/oauth-authorization-server
export const SLACK_USER_SCOPES = [
  'search:read.public',
  'search:read.private',
  'search:read.im',
  'search:read.mpim',
  'search:read.files',
  'search:read.users',
  'channels:read',
  'channels:history',
  'channels:write',
  'groups:read',
  'groups:history',
  'groups:write',
  'im:read',
  'im:history',
  'im:write',
  'mpim:read',
  'mpim:history',
  'mpim:write',
  'users:read',
  'users:read.email',
  'files:read',
  'chat:write',
  'emoji:read',
  'reactions:read',
  'reactions:write',
  'canvases:read',
  'canvases:write',
  'lists:read',
  'lists:write',
] as const;

/** Prefills an internal app with user scopes for the admitted tools, without browser callbacks. */
export function getSlackApplicationSetupUrl() {
  const url = new URL('https://api.slack.com/apps');
  url.searchParams.set('new_app', '1');
  url.searchParams.set(
    'manifest_json',
    JSON.stringify({
      display_information: {
        name: 'Cherry Studio for Slack',
        description: 'Search and collaborate in Slack from Cherry Studio',
      },
      oauth_config: { scopes: { user: SLACK_USER_SCOPES } },
      settings: { token_rotation_enabled: false },
    }),
  );
  return url.href;
}
