import { nativeCallbackUrl } from '@/backend/utils/oauth';

function origin(value?: string): string | undefined {
  if (!value) return undefined;
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !['', '/'].includes(url.pathname)
  )
    throw new Error('configuration');
  return url.origin;
}

export function cherryAccountConfig() {
  const issuer = origin(process.env.EXPO_PUBLIC_CHERRY_LOGIN_ISSUER);
  const portal = origin(process.env.EXPO_PUBLIC_CHERRY_LOGIN_ORIGIN);
  const cloud = origin(process.env.EXPO_PUBLIC_CHERRY_LOGIN_CLOUD_ORIGIN);
  const enterprise = origin(process.env.EXPO_PUBLIC_CHERRY_LOGIN_ENTERPRISE_ORIGIN);
  const clientId = process.env.EXPO_PUBLIC_CHERRY_LOGIN_CLIENT_ID;
  const redirectUri = nativeCallbackUrl('auth/cherry-callback');
  const projects = (process.env.EXPO_PUBLIC_CHERRY_LOGIN_PROJECT_IDS as string | undefined)
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (!issuer || !portal || !cloud || !enterprise || !clientId || !redirectUri || !projects?.length)
    return null;
  return {
    issuer,
    portal,
    cloud,
    enterprise,
    clientId,
    redirectUri,
    scopes: projects.map((id) => `urn:zitadel:iam:org:project:id:${id}:aud`),
  };
}
