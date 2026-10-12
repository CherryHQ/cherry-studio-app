import type { RuntimeTool, RuntimeWebTools } from '../types';

/** The wire protocol of a provider's native web tools: request shape, metadata and replay. */
export type PiWebDialect =
  | 'openai-responses'
  | 'openai-preview'
  | 'xai'
  | 'anthropic'
  | 'google'
  | 'zhipu'
  | 'dashscope'
  | 'openrouter'
  | 'perplexity';

export type PiNativeWebTools = {
  search: boolean;
  fetch: boolean;
  functionToolMixing: boolean;
  /** Absent when the endpoint has no reviewed adapter; the tools are then never offered. */
  dialect?: PiWebDialect;
};

type WebToolRoute = 'client' | 'server' | 'none';
export type PiWebToolRoutes = { search: WebToolRoute; fetch: WebToolRoute };

const WEB_TOOL_NAMES = { search: 'web_search', fetch: 'web_fetch' } as const;
/** The failure group of the external web tools; a failed native lookup stops the same group. */
export const PI_WEB_FAILURE_GROUP = 'web';

function isPiWebTool(tool: RuntimeTool, capability: keyof PiWebToolRoutes): boolean {
  return tool.ref.source === 'builtin' && tool.ref.capabilityId === WEB_TOOL_NAMES[capability];
}

/** Native tools cannot bypass a per-call approval or the Host's capability deny-list. */
export function resolvePiWebToolRoutes(
  policy: RuntimeWebTools | undefined,
  native: PiNativeWebTools | undefined,
  tools: readonly RuntimeTool[],
): PiWebToolRoutes {
  if (!policy) return { search: 'client', fetch: 'client' };
  const external = {
    search: tools.find((tool) => isPiWebTool(tool, 'search')),
    fetch: tools.find((tool) => isPiWebTool(tool, 'fetch')),
  };
  const client = {
    search:
      !!external.search && external.search.approval !== 'deny' && policy.clientSearchAvailable,
    fetch: !!external.fetch && external.fetch.approval !== 'deny' && policy.clientFetchAvailable,
  };
  const otherFunctionTools = tools.some(
    (tool) =>
      (tool.ref.source !== 'mcp' || tool.approval !== 'deny') &&
      !isPiWebTool(tool, 'search') &&
      !isPiWebTool(tool, 'fetch'),
  );
  const server = {
    search: !!native?.search && (!external.search || external.search.approval === 'auto'),
    fetch: !!native?.fetch && (!external.fetch || external.fetch.approval === 'auto'),
  };
  if (!native?.functionToolMixing && otherFunctionTools) {
    server.search = false;
    server.fetch = false;
  }
  const select = (capability: keyof PiWebToolRoutes): WebToolRoute =>
    policy.modelToolsPreferred
      ? server[capability]
        ? 'server'
        : client[capability]
          ? 'client'
          : 'none'
      : client[capability]
        ? 'client'
        : server[capability]
          ? 'server'
          : 'none';
  let search = select('search');
  let fetch = select('fetch');
  if (
    !native?.functionToolMixing &&
    ((search === 'server' && fetch === 'client') || (search === 'client' && fetch === 'server'))
  ) {
    const clientCoverage = Number(client.search) + Number(client.fetch);
    const serverCoverage = Number(server.search) + Number(server.fetch);
    const useServer =
      serverCoverage > clientCoverage ||
      (serverCoverage === clientCoverage && policy.modelToolsPreferred);
    search = useServer ? (server.search ? 'server' : 'none') : client.search ? 'client' : 'none';
    fetch = useServer ? (server.fetch ? 'server' : 'none') : client.fetch ? 'client' : 'none';
  }
  return { search, fetch };
}

export function selectPiClientTools(
  tools: readonly RuntimeTool[],
  routes: PiWebToolRoutes,
): RuntimeTool[] {
  return tools.filter(
    (tool) =>
      (!isPiWebTool(tool, 'search') || routes.search === 'client') &&
      (!isPiWebTool(tool, 'fetch') || routes.fetch === 'client'),
  );
}

/** A cap keeps Anthropic's server loop below its pause limit and bounds per-request search fees. */
const ANTHROPIC_MAX_USES = 5;

/** Native tools are injected only into conversation calls that permit tool use. */
export function applyPiWebTools(
  payload: unknown,
  dialect: PiWebDialect | undefined,
  routes: PiWebToolRoutes,
): unknown {
  const search = routes.search === 'server';
  const fetch = routes.fetch === 'server';
  if (!dialect || (!search && !fetch)) return payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Pi produced an invalid provider request.');
  }
  const body = payload as Record<string, unknown>;
  const withTools = (...tools: Record<string, unknown>[]) => ({
    ...body,
    tools: [...(Array.isArray(body.tools) ? body.tools : []), ...tools],
  });
  switch (dialect) {
    case 'openai-responses':
      return search ? withTools({ type: 'web_search' }) : payload;
    case 'openai-preview':
      return search ? withTools({ type: 'web_search_preview' }) : payload;
    case 'xai':
      return search
        ? withTools(
            { type: 'web_search', enable_image_understanding: true },
            { type: 'x_search', enable_image_understanding: true },
          )
        : payload;
    case 'anthropic':
      return {
        ...withTools(
          ...(search
            ? [{ type: 'web_search_20250305', name: 'web_search', max_uses: ANTHROPIC_MAX_USES }]
            : []),
          ...(fetch
            ? [{ type: 'web_fetch_20250910', name: 'web_fetch', max_uses: ANTHROPIC_MAX_USES }]
            : []),
        ),
        ...(fetch
          ? { betas: [...(Array.isArray(body.betas) ? body.betas : []), 'web-fetch-2025-09-10'] }
          : {}),
      };
    case 'google': {
      const config = (body.config ?? {}) as Record<string, unknown>;
      const tools = Array.isArray(config.tools) ? config.tools : [];
      const toolConfig = (config.toolConfig ?? {}) as Record<string, unknown>;
      // Gemini 3 accepts functions beside native tools only when it also returns its
      // server-side tool parts, which the replay step sends back with their signatures.
      const mixed = tools.some(
        (tool) => (tool as { functionDeclarations?: unknown[] }).functionDeclarations?.length,
      );
      return {
        ...body,
        config: {
          ...config,
          tools: [
            ...tools,
            ...(search ? [{ googleSearch: {} }] : []),
            ...(fetch ? [{ urlContext: {} }] : []),
          ],
          ...(mixed
            ? {
                toolConfig: {
                  functionCallingConfig: { mode: 'VALIDATED' },
                  ...toolConfig,
                  includeServerSideToolInvocations: true,
                },
              }
            : {}),
        },
      };
    }
    case 'zhipu':
      return search
        ? withTools({
            type: 'web_search',
            web_search: { enable: true, search_engine: 'search_pro', search_result: true },
          })
        : payload;
    case 'dashscope':
      return search
        ? {
            ...body,
            enable_search: true,
            search_options: {
              enable_source: true,
              // The newest Max and multimodal SKUs search only under the agent strategy.
              ...(/qwen3-max|omni|qwen3-vl/.test(String(body.model))
                ? { search_strategy: 'agent' }
                : {}),
            },
          }
        : payload;
    case 'openrouter':
      return search ? withTools({ type: 'openrouter:web_search' }) : payload;
    case 'perplexity':
      // Sonar searches on every request; there is nothing to add.
      return payload;
  }
}

/** A started provider search is substantive even before the first answer token. */
export function isPiNativeWebActivity(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  if (typeof event.type === 'string' && /^response\.(?:web|x)_search_call\./.test(event.type))
    return true;
  const item = (event.item ?? event.content_block) as { type?: string } | undefined;
  if (
    item?.type === 'web_search_call' ||
    item?.type === 'x_search_call' ||
    item?.type === 'server_tool_use' ||
    item?.type === 'web_search_tool_result' ||
    item?.type === 'web_fetch_tool_result'
  )
    return true;
  // Chat Completions hosts report a finished search beside the first answer chunks.
  if (
    (Array.isArray(event.web_search) && event.web_search.length) ||
    (Array.isArray(event.citations) && event.citations.length) ||
    (Array.isArray(event.search_results) && event.search_results.length) ||
    (event.search_info as { search_results?: unknown[] } | undefined)?.search_results?.length
  )
    return true;
  const candidate = (
    event.candidates as
      | {
          content?: { parts?: { toolCall?: unknown }[] };
          groundingMetadata?: {
            groundingChunks?: unknown[];
            webSearchQueries?: unknown[];
            searchEntryPoint?: unknown;
          };
          urlContextMetadata?: { urlMetadata?: unknown[] };
        }[]
      | undefined
  )?.[0];
  return !!(
    candidate?.content?.parts?.some((part) => part.toolCall) ||
    candidate?.groundingMetadata?.groundingChunks?.length ||
    candidate?.groundingMetadata?.webSearchQueries?.length ||
    candidate?.groundingMetadata?.searchEntryPoint ||
    candidate?.urlContextMetadata?.urlMetadata?.length
  );
}
