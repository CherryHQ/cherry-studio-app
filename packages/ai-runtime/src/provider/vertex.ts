import { getProviderBaseUrlIssue } from '@cherrystudio/universal/utils/url';

const VERTEX_MAAS_MODEL_ID_PATTERN = /^[^/]+\/[^/]+-maas$/i;

export function isVertexMaasModelId(modelId: string): boolean {
  return VERTEX_MAAS_MODEL_ID_PATTERN.test(modelId);
}

/**
 * Vertex service-account credentials may arrive with either camelCase
 * (`privateKey`/`clientEmail`) or snake_case (`private_key`/`client_email`)
 * keys depending on how the JSON key file was stored. Normalize both shapes to
 * the camelCase form the Vertex SDK expects.
 */
export function normalizeVertexCredentials(credentials: Record<string, unknown> | undefined): {
  privateKey?: string;
  clientEmail?: string;
} {
  if (!credentials) return {};
  const privateKey = credentials.privateKey ?? credentials.private_key;
  const clientEmail = credentials.clientEmail ?? credentials.client_email;
  return {
    ...(typeof privateKey === 'string' && { privateKey: privateKey.trim() }),
    ...(typeof clientEmail === 'string' && { clientEmail: clientEmail.trim() }),
  };
}

/** A host override may name the service or the configured project collection, never an action. */
export function resolveVertexUrls(baseUrl: string, project: string, location: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9:.-]*$/.test(project) || !/^[a-z][a-z0-9-]*$/.test(location)) {
    throw new Error('Vertex project or location is invalid.');
  }
  const defaultOrigin =
    location === 'global'
      ? 'https://aiplatform.googleapis.com'
      : location === 'us' || location === 'eu'
        ? `https://aiplatform.${location}.rep.googleapis.com`
        : `https://${location}-aiplatform.googleapis.com`;
  if (baseUrl.trim() && getProviderBaseUrlIssue(baseUrl))
    throw new Error('Vertex base URL is invalid.');
  const url = new URL(baseUrl.trim() || defaultOrigin);
  const resourcePath = `/projects/${encodeURIComponent(project)}/locations/${location}`;
  const path = url.pathname.replace(/\/+$/, '');
  const collection = /^(.*)\/(v1(?:beta1)?)(\/projects\/[^/]+\/locations\/[^/]+)$/.exec(path);
  if (collection && collection[3] !== resourcePath) {
    throw new Error('Vertex base URL does not match the configured project and location.');
  }
  if (
    !collection &&
    /\/projects\/|\/publishers\/|\/models\/|\/endpoints\/|:generateContent|:streamGenerateContent|:streamRawPredict/.test(
      path,
    )
  ) {
    throw new Error('Vertex base URL must name a service or project collection.');
  }
  const servicePath = collection ? collection[1] : path.replace(/\/v1(?:beta1)?$/, '');
  const officialHost =
    (/^(?:[a-z0-9-]+-)?aiplatform\.googleapis\.com$/.test(url.hostname) ||
      /^aiplatform\.(?:us|eu)\.rep\.googleapis\.com$/.test(url.hostname)) &&
    !url.port;
  const origin = officialHost && !servicePath ? defaultOrigin : url.origin;
  const serviceUrl = `${origin}${servicePath}`;
  const apiVersion =
    collection?.[2] ??
    /\/(v1(?:beta1)?)$/.exec(path)?.[1] ??
    (baseUrl.trim().endsWith('#') ? '' : 'v1');
  const apiUrl = `${serviceUrl}${apiVersion ? `/${apiVersion}` : ''}`;
  return { serviceUrl, apiUrl, resourceUrl: `${apiUrl}${resourcePath}` };
}
