import type {
  AgentTemplateCatalog,
  AgentTemplateLanguage,
} from '@/shared/data/types/agentTemplate';

/** Region-aware catalogs with per-field defaults and recoverable local snapshots. */
export interface AgentTemplatesModule {
  readCached(language: AgentTemplateLanguage): Promise<AgentTemplateCatalog | null>;
  refresh(language: AgentTemplateLanguage, signal?: AbortSignal): Promise<AgentTemplateCatalog>;
}
