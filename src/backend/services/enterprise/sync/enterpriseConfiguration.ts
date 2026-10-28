import * as z from 'zod';

import { normalizeEnterpriseAddress } from '@/shared/contracts/account';
import type { EnterpriseDefaultModels } from '@/shared/data/preference';
import {
  createUniqueModelId,
  ENDPOINT_TYPE,
  endpointImpliedCapability,
  type EndpointType,
  MODEL_CAPABILITY,
  type ModelCapability,
  type UniqueModelId,
} from '@/shared/data/types/model';

/**
 * Enterprise `/configurations` and `/agents/:id/setup` responses, reduced to what Mobile can run.
 * Identifiable unsupported items keep their remote presence, without a runnable projection.
 * Invalid identity inventories reject the snapshot: absence must mean server deletion.
 */

const ProviderSchema = z.object({
  provider_id: z.string().min(1),
  type: z.string().min(1),
  name: z.string().min(1),
  apiHost: z.string().min(1),
  anthropicApiHost: z.string().nullish(),
});
const ModelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  provider: z.string().min(1),
  endpoint_type: z.string().nullish(),
  supported_endpoint_types: z.array(z.string()).nullish(),
  capabilities: z.array(z.string()).nullish(),
  input_price: z.number().finite().nonnegative().nullish(),
  output_price: z.number().finite().nonnegative().nullish(),
  currency: z.enum(['USD', 'CNY']).nullish(),
});
const ModelIdentitySchema = ModelSchema.pick({ id: true, provider: true });
const McpServerSchema = z.object({
  name: z.string().min(1),
  type: z.string().nullish(),
  baseUrl: z.string().nullish(),
  headers: z.record(z.string(), z.string()).nullish(),
  disabledTools: z.array(z.string()).nullish(),
  isActive: z.boolean().nullish(),
});
const AgentModelSchema = z.object({
  model_id: z.string().min(1),
  provider: z.object({ provider_id: z.string().min(1) }),
});
const AgentSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  instructions: z.string().nullish(),
  model: AgentModelSchema.nullish(),
  models: z.array(AgentModelSchema).nullish(),
  configuration: z
    .object({
      avatar: z.string().nullish(),
      default_permission_mode: z.string().nullish(),
    })
    .nullish(),
  libraryItems: z.array(
    z.object({ id: z.number().int().positive(), type: z.string(), status: z.string() }),
  ),
  mcpServers: z.array(z.object({ key: z.string().min(1), config: McpServerSchema })),
});
const SetupSchema = z.object({
  agent: AgentSchema,
  tasks: z.array(
    z.object({
      libraryItemId: z.number().int().positive(),
      type: z.string(),
      updatedAt: z.string().min(1),
    }),
  ),
});
const ConfigurationSchema = z.object({
  serverUniqueId: z.string().min(1),
  apiKey: z.string().nullish(),
  providers: z.array(z.unknown()),
  models: z.array(z.unknown()),
  agents: z.array(z.object({ id: z.number().int().positive() }).loose()),
  mcpServers: z.array(z.unknown()),
  defaultAssistantModel: z.unknown().optional(),
  defaultTopicNamingModel: z.unknown().optional(),
  defaultTranslationModel: z.unknown().optional(),
  settings: z.array(z.object({ key: z.string(), value: z.unknown() })).nullish(),
});

const SERVER_ENDPOINTS: Readonly<Record<string, EndpointType>> = {
  openai: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
  'openai-response': ENDPOINT_TYPE.OPENAI_RESPONSES,
  anthropic: ENDPOINT_TYPE.ANTHROPIC_MESSAGES,
  gemini: ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT,
  'image-generation': ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION,
  'image-edit': ENDPOINT_TYPE.OPENAI_IMAGE_EDIT,
  embeddings: ENDPOINT_TYPE.OPENAI_EMBEDDINGS,
  'jina-rerank': ENDPOINT_TYPE.JINA_RERANK,
};
const CANONICAL_ENDPOINTS = new Set<string>(Object.values(ENDPOINT_TYPE));
/** Server provider type → registry preset and default chat endpoint. */
const PROVIDER_TYPES: Readonly<Record<string, readonly [string, EndpointType]>> = {
  openai: ['openai', ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS],
  'openai-response': ['openai', ENDPOINT_TYPE.OPENAI_RESPONSES],
  anthropic: ['anthropic', ENDPOINT_TYPE.ANTHROPIC_MESSAGES],
  gemini: ['gemini', ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT],
  'new-api': ['new-api', ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS],
  cherryin: ['cherryin', ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS],
  gateway: ['gateway', ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS],
  ollama: ['ollama', ENDPOINT_TYPE.OLLAMA_CHAT],
};
const CAPABILITIES: Readonly<Record<string, ModelCapability>> = {
  vision: MODEL_CAPABILITY.IMAGE_RECOGNITION,
  image_recognition: MODEL_CAPABILITY.IMAGE_RECOGNITION,
  reasoning: MODEL_CAPABILITY.REASONING,
  function_calling: MODEL_CAPABILITY.FUNCTION_CALL,
  'function-call': MODEL_CAPABILITY.FUNCTION_CALL,
  embedding: MODEL_CAPABILITY.EMBEDDING,
  rerank: MODEL_CAPABILITY.RERANK,
  image_generation: MODEL_CAPABILITY.IMAGE_GENERATION,
  audio_recognition: MODEL_CAPABILITY.AUDIO_RECOGNITION,
  audio_generation: MODEL_CAPABILITY.AUDIO_GENERATION,
  video_recognition: MODEL_CAPABILITY.VIDEO_RECOGNITION,
  video_generation: MODEL_CAPABILITY.VIDEO_GENERATION,
  structured_output: MODEL_CAPABILITY.STRUCTURED_OUTPUT,
  file_input: MODEL_CAPABILITY.FILE_INPUT,
  code_execution: MODEL_CAPABILITY.CODE_EXECUTION,
  file_search: MODEL_CAPABILITY.FILE_SEARCH,
  computer_use: MODEL_CAPABILITY.COMPUTER_USE,
};

const DEFAULT_SYNC_INTERVAL_MINUTES = 10;

export type ManagedModel = Readonly<{
  id: UniqueModelId;
  /** Gateway model id, `<model>@<provider>`. */
  modelId: string;
  name: string;
  endpointTypes: EndpointType[] | null;
  capabilities: ModelCapability[];
  pricing: {
    input: { perMillionTokens: number; currency: 'USD' | 'CNY' };
    output: { perMillionTokens: number; currency: 'USD' | 'CNY' };
  } | null;
}>;

export type ManagedProvider = Readonly<{
  providerId: string;
  presetProviderId: string;
  name: string;
  defaultChatEndpoint: EndpointType;
  endpointConfigs: Partial<Record<EndpointType, { baseUrl: string }>>;
  models: ManagedModel[];
}>;

export type ManagedMcpServer = Readonly<{
  remoteId: string;
  name: string;
  endpointUrl: string;
  headers: Record<string, string>;
  disabledTools: string[];
  isEnabled: boolean;
}>;

export type ManagedAgent = Readonly<{
  name: string;
  instructions: string;
  avatar: string | null;
  model: UniqueModelId;
  toolApprovalMode: 'default' | 'auto';
}>;

export type EnterpriseConfiguration = Readonly<{
  serverUniqueId: string;
  apiKey: string;
  syncIntervalMinutes: number;
  providerIds: string[];
  modelIds: UniqueModelId[];
  mcpServerRemoteIds: string[];
  providers: ManagedProvider[];
  mcpServers: ManagedMcpServer[];
  agentIds: number[];
  defaults: EnterpriseDefaultModels;
}>;

export type AgentSetup = Readonly<{
  remoteId: string;
  /** Null means unsupported; existing Agent identity and conversations remain untouched. */
  agent: ManagedAgent | null;
  /** Library identities: an unknown item type must not revoke a previously installed Skill. */
  skillRemoteIds: string[];
  mcpServerRemoteIds: string[];
  /** Agent-skill library items with their server revision. */
  skills: { remoteId: string; itemId: number; updatedAt: string }[];
  mcpServers: ManagedMcpServer[];
}>;

/** Collects the reason each skipped item was dropped, for the sync log. */
export type SkipLog = string[];

export function parseConfiguration(input: unknown, skipped: SkipLog): EnterpriseConfiguration {
  const raw = ConfigurationSchema.parse(input);
  const providerIds = raw.providers.map(
    (item) => z.object({ provider_id: z.string().min(1) }).parse(item).provider_id,
  );
  const modelIdsOnServer = raw.models.map((item) => {
    const model = ModelIdentitySchema.parse(item);
    return managedModelId(model.provider, model.id);
  });
  const mcpServersOnServer = raw.mcpServers.map((item) => ({
    key: z.object({ id: z.string().min(1) }).parse(item).id,
    config: item,
  }));
  const providers: ManagedProvider[] = [];
  const models = parseItems(raw.models, ModelSchema, 'model', skipped);
  for (const provider of parseItems(raw.providers, ProviderSchema, 'provider', skipped)) {
    if (providers.some((existing) => existing.providerId === provider.provider_id)) {
      skipped.push(`provider ${provider.provider_id}: duplicate`);
      continue;
    }
    const parsed = parseProvider(
      provider,
      models.filter((model) => model.provider === provider.provider_id),
      skipped,
    );
    if (parsed) providers.push(parsed);
  }
  const modelIds = new Set(
    providers.flatMap((provider) => provider.models.map((model) => model.id)),
  );
  const defaultModel = (value: unknown, key: string): UniqueModelId | null => {
    if (value == null) return null;
    const model = ModelIdentitySchema.parse(value);
    const id = managedModelId(model.provider, model.id);
    if (!modelIds.has(id)) skipped.push(`default ${key}: model ${model.id} is unavailable`);
    return id;
  };
  return {
    serverUniqueId: raw.serverUniqueId,
    apiKey: raw.apiKey?.trim() ?? '',
    syncIntervalMinutes: parseSyncInterval(raw.settings),
    providerIds,
    modelIds: modelIdsOnServer,
    mcpServerRemoteIds: mcpServersOnServer.map((server) => server.key),
    providers,
    mcpServers: parseMcpServers(mcpServersOnServer, skipped),
    agentIds: [...new Set(raw.agents.map((agent) => agent.id))],
    defaults: {
      'agent.default_model_id': defaultModel(raw.defaultAssistantModel, 'assistant'),
      'agent.session_naming.model_id': defaultModel(raw.defaultTopicNamingModel, 'naming'),
      'feature.translate.model_id': defaultModel(raw.defaultTranslationModel, 'translation'),
    },
  };
}

/** Keeps the complete remote inventory even when this Agent has no Mobile-compatible model. */
export function parseAgentSetup(
  input: unknown,
  configuration: EnterpriseConfiguration,
  skipped: SkipLog,
): AgentSetup {
  const { agent, tasks } = SetupSchema.parse(input);
  const modelIds = new Set(
    configuration.providers.flatMap((provider) => provider.models.map((model) => model.id)),
  );
  // Mobile runs one model per Agent; plan/small models and turn limits have no equivalent.
  const model = [...(agent.models ?? []), ...(agent.model ? [agent.model] : [])]
    .map((candidate) => managedModelId(candidate.provider.provider_id, candidate.model_id))
    .find((id) => modelIds.has(id));
  if (!model) skipped.push(`agent ${agent.id}: no usable model`);
  const mcpServers = parseMcpServers(agent.mcpServers, skipped);
  const skills = agent.libraryItems.flatMap((item) => {
    const task = tasks.find((candidate) => candidate.libraryItemId === item.id);
    if (item.type !== 'agent_skill' || item.status !== 'ready' || !task) return [];
    return [{ remoteId: String(item.id), itemId: item.id, updatedAt: task.updatedAt }];
  });
  return {
    remoteId: String(agent.id),
    skillRemoteIds: agent.libraryItems.map((item) => String(item.id)),
    mcpServerRemoteIds: agent.mcpServers.map((server) => server.key),
    agent: model
      ? {
          name: agent.name,
          instructions: agent.instructions ?? '',
          avatar: emojiAvatar(agent.configuration?.avatar),
          model,
          // Anything but explicit bypass keeps Mobile's ask-first default.
          toolApprovalMode:
            agent.configuration?.default_permission_mode === 'bypassPermissions'
              ? 'auto'
              : 'default',
        }
      : null,
    skills,
    mcpServers,
  };
}

function parseProvider(
  provider: z.infer<typeof ProviderSchema>,
  models: z.infer<typeof ModelSchema>[],
  skipped: SkipLog,
): ManagedProvider | null {
  const type = provider.provider_id.startsWith('x-express') ? 'cherryin' : provider.type;
  const definition = Object.hasOwn(PROVIDER_TYPES, type) ? PROVIDER_TYPES[type] : undefined;
  if (!definition) {
    skipped.push(`provider ${provider.provider_id}: unsupported type ${provider.type}`);
    return null;
  }
  const apiHost = httpAddress(provider.apiHost);
  if (!apiHost) {
    skipped.push(`provider ${provider.provider_id}: invalid apiHost`);
    return null;
  }
  const anthropicHost = provider.anthropicApiHost ? httpAddress(provider.anthropicApiHost) : null;
  const [presetProviderId, defaultChatEndpoint] = definition;
  const endpoints = new Set<EndpointType>([defaultChatEndpoint]);
  const projected: ManagedModel[] = [];
  for (const model of models) {
    const id = managedModelId(provider.provider_id, model.id);
    if (projected.some((existing) => existing.id === id)) continue;
    const endpointTypes = [model.endpoint_type, ...(model.supported_endpoint_types ?? [])].flatMap(
      (value) => {
        if (!value) return [];
        const endpoint = CANONICAL_ENDPOINTS.has(value)
          ? (value as EndpointType)
          : SERVER_ENDPOINTS[value];
        if (!endpoint) skipped.push(`model ${model.id}: unsupported endpoint ${value}`);
        return endpoint ? [endpoint] : [];
      },
    );
    for (const endpoint of endpointTypes) endpoints.add(endpoint);
    const capabilities = new Set<ModelCapability>(
      (model.capabilities ?? []).flatMap((value) =>
        Object.hasOwn(CAPABILITIES, value) ? [CAPABILITIES[value]!] : [],
      ),
    );
    for (const endpoint of endpointTypes) {
      const implied = endpointImpliedCapability(endpoint);
      if (implied) capabilities.add(implied);
    }
    const currency = model.currency ?? 'USD';
    projected.push({
      id,
      modelId: gatewayModelId(provider.provider_id, model.id),
      name: model.name,
      endpointTypes: endpointTypes.length ? [...new Set(endpointTypes)] : null,
      capabilities: [...capabilities],
      pricing:
        model.input_price != null && model.output_price != null
          ? {
              input: { perMillionTokens: model.input_price, currency },
              output: { perMillionTokens: model.output_price, currency },
            }
          : null,
    });
  }
  return {
    providerId: provider.provider_id,
    presetProviderId,
    // Unlocalized desktop keys are not display names.
    name: provider.name.startsWith('database.provider.') ? provider.provider_id : provider.name,
    defaultChatEndpoint,
    endpointConfigs: Object.fromEntries(
      [...endpoints].map((endpoint) => [
        endpoint,
        {
          baseUrl:
            endpoint === ENDPOINT_TYPE.ANTHROPIC_MESSAGES && anthropicHost
              ? anthropicHost
              : apiHost,
        },
      ]),
    ),
    models: projected,
  };
}

function parseMcpServers(
  servers: readonly { key: string; config: unknown }[],
  skipped: SkipLog,
): ManagedMcpServer[] {
  const result: ManagedMcpServer[] = [];
  for (const { key, config } of servers) {
    const server = McpServerSchema.safeParse(config);
    if (!key || !server.success) {
      skipped.push(`mcp ${key || '?'}: malformed`);
      continue;
    }
    if (result.some((existing) => existing.remoteId === key)) continue;
    // Mobile connects to Streamable HTTP endpoints only; it cannot launch local processes.
    const endpointUrl = server.data.baseUrl ? httpAddress(server.data.baseUrl, true) : null;
    if (
      !['streamableHttp', 'streamable-http', 'http'].includes(server.data.type ?? '') ||
      !endpointUrl
    ) {
      skipped.push(`mcp ${key}: unsupported transport ${server.data.type ?? 'unknown'}`);
      continue;
    }
    result.push({
      remoteId: key,
      name: server.data.name,
      endpointUrl,
      headers: server.data.headers ?? {},
      disabledTools: server.data.disabledTools ?? [],
      isEnabled: server.data.isActive ?? true,
    });
  }
  return result;
}

function parseItems<T>(
  items: readonly unknown[],
  schema: z.ZodType<T>,
  kind: string,
  skipped: SkipLog,
): T[] {
  return items.flatMap((item) => {
    const parsed = schema.safeParse(item);
    if (!parsed.success) skipped.push(`${kind}: malformed entry`);
    return parsed.success ? [parsed.data] : [];
  });
}

function parseSyncInterval(
  settings: readonly { key: string; value: unknown }[] | null | undefined,
) {
  const value = Number(settings?.find((setting) => setting.key === 'sync_interval')?.value);
  return Number.isInteger(value) && value >= 1 && value <= 1440
    ? value
    : DEFAULT_SYNC_INTERVAL_MINUTES;
}

function httpAddress(value: string, keepQuery = false): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return keepQuery ? url.toString() : normalizeEnterpriseAddress(url.toString());
  } catch {
    return null;
  }
}

/** The enterprise gateway addresses models as `<model>@<provider>`. */
function gatewayModelId(providerId: string, modelId: string): string {
  const suffix = `@${providerId}`;
  return modelId.endsWith(suffix) ? modelId : `${modelId}${suffix}`;
}

export function managedModelId(providerId: string, modelId: string): UniqueModelId {
  return createUniqueModelId(providerId, gatewayModelId(providerId, modelId));
}

/** Mobile avatars are emoji or local files; a remote image reference is not stored. */
function emojiAvatar(value: string | null | undefined): string | null {
  return value && value.length <= 16 && !/[:/.]/.test(value) ? value : null;
}
