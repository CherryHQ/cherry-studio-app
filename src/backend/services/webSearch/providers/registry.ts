import type { WebSearchProvider } from '@cherrystudio/universal/data/preference';
import type { ApiKeyRotationState } from '../utils/provider';
import { BochaProvider } from './api/BochaProvider';
import { ExaProvider } from './api/ExaProvider';
import { JinaProvider } from './api/JinaProvider';
import { QueritProvider } from './api/QueritProvider';
import { SearxngProvider } from './api/SearxngProvider';
import { TavilyProvider } from './api/TavilyProvider';
import { UnsupportedProvider } from './api/UnsupportedProvider';
import { ZhipuProvider } from './api/ZhipuProvider';
import type { WebSearchProviderDriver } from './factory';

type WebSearchProviderConstructor = new (
  provider: WebSearchProvider,
  apiKeyRotationState: ApiKeyRotationState,
) => WebSearchProviderDriver;

export const WEB_SEARCH_PROVIDER_REGISTRY = {
  zhipu: ZhipuProvider,
  tavily: TavilyProvider,
  searxng: SearxngProvider,
  exa: ExaProvider,
  'exa-mcp': UnsupportedProvider,
  bocha: BochaProvider,
  querit: QueritProvider,
  fetch: UnsupportedProvider,
  jina: JinaProvider,
  firecrawl: UnsupportedProvider,
} as const satisfies Record<WebSearchProvider['id'], WebSearchProviderConstructor>;
