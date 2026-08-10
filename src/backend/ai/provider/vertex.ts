const VERTEX_MAAS_MODEL_ID_PATTERN = /^[^/]+\/[^/]+-maas$/i;

export function isVertexMaasModelId(modelId: string): boolean {
  return VERTEX_MAAS_MODEL_ID_PATTERN.test(modelId);
}

export function normalizeVertexCredentials(credentials: Record<string, unknown> | undefined): {
  clientEmail?: string;
  privateKey?: string;
} {
  if (!credentials) return {};

  const privateKey = (credentials.privateKey ?? credentials.private_key) as string | undefined;
  const clientEmail = (credentials.clientEmail ?? credentials.client_email) as string | undefined;
  return {
    ...(clientEmail !== undefined && { clientEmail }),
    ...(privateKey !== undefined && { privateKey }),
  };
}
