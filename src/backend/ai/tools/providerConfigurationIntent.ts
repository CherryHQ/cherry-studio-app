import {
  CONFIGURE_BUILTIN_PROVIDER_TOOL_NAME,
  CREATE_CUSTOM_PROVIDER_TOOL_NAME,
  type ProviderConfigurationToolName,
} from '@cherrystudio/universal/ai/providerConfigurationTools';
import type { ToolSet } from 'ai';

type ProviderIdentity = { id: string; name: string };

const PROVIDER_OBJECT_PATTERN = /服务商|供应商|\bproviders?\b/i;
const MODEL_OBJECT_PATTERN = /模型|\bmodels?\b/i;
const CREATE_ACTION_PATTERN = /创建|新建|新增|添加|\b(?:create|add|new)\b/i;
const CONFIGURE_ACTION_PATTERN =
  /配置|设置|更新|修改|更换|接入|\b(?:configure|setup|set\s+up|update|edit|change|connect)\b/i;
const MODEL_ACTION_PATTERN =
  /拉取|获取|同步|刷新|更新|添加|新增|管理|导入|\b(?:pull|fetch|sync|refresh|update|add|manage|import)\b/i;
const DOCUMENTATION_PATTERN = /教程|示例|文档|代码|\bsdk\b|\b(?:tutorial|example|docs?|code)\b/i;
const DIRECT_REQUEST_PATTERN = /帮我|请|给我|替我|直接|\b(?:please|can you|could you)\b/i;

export function resolveProviderConfigurationToolName(input: {
  messages?: readonly unknown[];
  providers: readonly ProviderIdentity[];
  tools: ToolSet | undefined;
}): ProviderConfigurationToolName | undefined {
  const text = latestUserText(input.messages);
  if (!text) return undefined;

  if (
    input.tools?.[CREATE_CUSTOM_PROVIDER_TOOL_NAME] &&
    CREATE_ACTION_PATTERN.test(text) &&
    PROVIDER_OBJECT_PATTERN.test(text)
  ) {
    return CREATE_CUSTOM_PROVIDER_TOOL_NAME;
  }

  if (!input.tools?.[CONFIGURE_BUILTIN_PROVIDER_TOOL_NAME]) return undefined;
  if (MODEL_ACTION_PATTERN.test(text) && MODEL_OBJECT_PATTERN.test(text)) {
    return CONFIGURE_BUILTIN_PROVIDER_TOOL_NAME;
  }

  const asksForConfiguration =
    CONFIGURE_ACTION_PATTERN.test(text) &&
    (PROVIDER_OBJECT_PATTERN.test(text) || mentionsProvider(text, input.providers));
  if (!asksForConfiguration) return undefined;
  if (DOCUMENTATION_PATTERN.test(text) && !DIRECT_REQUEST_PATTERN.test(text)) return undefined;
  return CONFIGURE_BUILTIN_PROVIDER_TOOL_NAME;
}

function latestUserText(messages: readonly unknown[] | undefined): string | undefined {
  const latest = messages?.at(-1);
  if (!isRecord(latest) || latest.role !== 'user' || !Array.isArray(latest.parts)) return undefined;
  const text = latest.parts
    .flatMap((part) =>
      isRecord(part) && part.type === 'text' && typeof part.text === 'string' ? [part.text] : [],
    )
    .join('\n')
    .trim();
  return text || undefined;
}

function mentionsProvider(text: string, providers: readonly ProviderIdentity[]): boolean {
  return providers.some((provider) =>
    [provider.id, provider.name].some((alias) => providerAliasPattern(alias).test(text)),
  );
}

function providerAliasPattern(alias: string): RegExp {
  const parts = alias
    .normalize('NFKC')
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map(escapeRegExp);
  const body = parts.join('[\\s._-]*');
  return new RegExp(`(?:^|[^a-z0-9])${body}(?=$|[^a-z0-9])`, 'i');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
