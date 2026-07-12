import { ENDPOINT_TYPE, type EndpointType } from '@cherrystudio/provider-registry';
import * as Crypto from 'expo-crypto';
import * as z from 'zod';
import type { CreateProviderInput } from '@/data/services/ProviderService';

const endpointValues = Object.values(ENDPOINT_TYPE) as [string, ...string[]];

export const CreateCustomProviderSchema = z.strictObject({
  providerId: z.string().min(1),
  name: z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(1)),
  defaultChatEndpoint: z.enum(endpointValues),
  presetProviderId: z.string().optional(),
});

export type CreateCustomProviderDto = z.infer<typeof CreateCustomProviderSchema>;

export type CreateCustomProviderPayloadParams = {
  defaultChatEndpoint: EndpointType;
  name: string;
  presetProviderId?: string;
  providerId?: string;
};

export function buildCreateCustomProviderPayload({
  defaultChatEndpoint,
  name,
  presetProviderId,
  providerId,
}: CreateCustomProviderPayloadParams): CreateProviderInput {
  return CreateCustomProviderSchema.parse({
    defaultChatEndpoint,
    name,
    presetProviderId,
    providerId: providerId ?? Crypto.randomUUID(),
  });
}
