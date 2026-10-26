import { z } from 'zod';

import type { VertexAuthConfig } from '../types';

const projectSchema = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9:.-]*$/);
const locationSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9-]*$/);
const emailSchema = z.string().trim().email();
const privateKeySchema = z
  .string()
  .trim()
  .regex(/^-----BEGIN PRIVATE KEY-----\s+[A-Za-z0-9+/=\s]+\s+-----END PRIVATE KEY-----$/);
const serviceAccountSchema = z.object({
  type: z.literal('service_account'),
  project_id: projectSchema,
  client_email: emailSchema,
  private_key: privateKeySchema,
});

export type VertexAuthField = 'project' | 'location' | 'clientEmail' | 'privateKey' | 'json';

export const VERTEX_AUTH_LABELS = {
  project: 'settings.provider.vertex.project',
  location: 'settings.provider.vertex.location',
  clientEmail: 'settings.provider.vertex.email',
  privateKey: 'settings.provider.vertex.privateKey',
  json: 'settings.provider.vertex.importJson',
} as const;

const VERTEX_AUTH_ERRORS = {
  project: 'settings.provider.vertex.invalidProject',
  location: 'settings.provider.vertex.invalidLocation',
  clientEmail: 'settings.provider.vertex.invalidEmail',
  privateKey: 'settings.provider.vertex.invalidPrivateKey',
  json: 'settings.provider.vertex.invalidJson',
} as const;

/** The sheet accepts a Google key file, then persists only fields used by this provider. */
export function parseVertexAuthEdit(
  config: VertexAuthConfig,
  field: VertexAuthField,
  text: string,
): { config: VertexAuthConfig; error?: never } | { config?: never; error: string } {
  if (field === 'json') {
    try {
      const json: unknown = JSON.parse(text);
      const result = serviceAccountSchema.safeParse(json);
      if (!result.success) return { error: VERTEX_AUTH_ERRORS.json };
      return {
        config: {
          type: 'iam-gcp',
          project: result.data.project_id,
          location: config.location.trim() || 'global',
          credentials: {
            clientEmail: result.data.client_email,
            privateKey: result.data.private_key,
          },
        },
      };
    } catch {
      return { error: VERTEX_AUTH_ERRORS.json };
    }
  }
  const schemas = {
    project: projectSchema,
    location: locationSchema,
    clientEmail: emailSchema,
    privateKey: privateKeySchema,
  };
  const parsed = schemas[field].safeParse(text);
  if (!parsed.success) return { error: VERTEX_AUTH_ERRORS[field] };
  return {
    config:
      field === 'project' || field === 'location'
        ? { ...config, [field]: parsed.data }
        : { ...config, credentials: { ...config.credentials, [field]: parsed.data } },
  };
}

export function vertexAuthFieldValue(
  config: VertexAuthConfig,
  field: Exclude<VertexAuthField, 'json'>,
): string {
  const value =
    field === 'project' || field === 'location'
      ? config[field]
      : (config.credentials?.[field] ??
        config.credentials?.[field === 'clientEmail' ? 'client_email' : 'private_key']);
  return typeof value === 'string' ? value : '';
}

export function isVertexAuthConfigured(config: VertexAuthConfig): boolean {
  return (['project', 'location', 'clientEmail', 'privateKey'] as const).every(
    (field) => !parseVertexAuthEdit(config, field, vertexAuthFieldValue(config, field)).error,
  );
}
