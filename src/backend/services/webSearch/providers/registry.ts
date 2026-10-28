import type { WebSearchProviderModule } from '@cherrystudio/web-search';
import { bocha } from '@cherrystudio/web-search/providers/bocha';
import { crawl4ai } from '@cherrystudio/web-search/providers/crawl4ai';
import { deepseek } from '@cherrystudio/web-search/providers/deepseek';
import { exa } from '@cherrystudio/web-search/providers/exa';
import { exaMcp } from '@cherrystudio/web-search/providers/exa-mcp';
import { firecrawl } from '@cherrystudio/web-search/providers/firecrawl';
import { jina } from '@cherrystudio/web-search/providers/jina';
import { parallel } from '@cherrystudio/web-search/providers/parallel';
import { querit } from '@cherrystudio/web-search/providers/querit';
import { searxng } from '@cherrystudio/web-search/providers/searxng';
import { serply } from '@cherrystudio/web-search/providers/serply';
import { tavily } from '@cherrystudio/web-search/providers/tavily';
import { yuanbao } from '@cherrystudio/web-search/providers/yuanbao';
import { zhipu } from '@cherrystudio/web-search/providers/zhipu';

import type { WebSearchProviderId } from '@/shared/data/types/webSearch';

export const REMOTE_WEB_SEARCH_PROVIDERS = {
  zhipu,
  tavily,
  searxng,
  exa,
  'exa-mcp': exaMcp,
  yuanbao,
  bocha,
  querit,
  deepseek,
  jina,
  firecrawl,
  crawl4ai,
  parallel,
  serply,
} satisfies Record<Exclude<WebSearchProviderId, 'fetch'>, WebSearchProviderModule>;
