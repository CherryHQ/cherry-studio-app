import type { WriteAgentToolBinding } from '@/shared/data/api/schemas/agentToolBindings';
import type { AgentToolBinding } from '@/shared/data/types/agentToolBinding';
import type { McpServer } from '@/shared/data/types/mcpServer';
import { clampMcpToolApproval } from '@/shared/utils/agentToolApproval';

export type McpToolBindingDraft = Extract<WriteAgentToolBinding, { source: 'mcp' }>;

export type AgentMcpServerOptionStatus =
  | 'available'
  | 'binding-disabled'
  | 'deleted'
  | 'enabled'
  | 'server-disabled'
  | 'unsupported';

export type AgentMcpServerOption = {
  binding?: McpToolBindingDraft;
  displayName: string;
  originalBinding?: McpToolBindingDraft;
  server?: McpServer;
  serverId: string;
  status: AgentMcpServerOptionStatus;
};

export type AgentMcpToolBindingStatus =
  | 'available'
  | 'binding-disabled'
  | 'catalog-failed'
  | 'catalog-loading'
  | 'deleted'
  | 'server-disabled'
  | 'tool-disabled'
  | 'tool-unavailable'
  | 'unsupported';

export type McpToolCatalog = {
  names?: ReadonlySet<string>;
  state: 'error' | 'loading' | 'ready';
};

export function createAgentToolBindingDraft(
  bindings: readonly AgentToolBinding[],
): WriteAgentToolBinding[] {
  return bindings.flatMap((binding) =>
    binding.source === 'mcp'
      ? [
          {
            approval: clampMcpToolApproval(binding.approval),
            displayNameSnapshot: binding.displayNameSnapshot,
            enabled: binding.enabled,
            ...(binding.rawToolName ? { rawToolName: binding.rawToolName } : {}),
            serverId: binding.serverId,
            source: 'mcp' as const,
          },
        ]
      : [],
  );
}

export function buildAgentMcpServerOptions(input: {
  bindings: readonly WriteAgentToolBinding[];
  originalBindings: readonly AgentToolBinding[];
  servers: readonly McpServer[];
}): AgentMcpServerOption[] {
  const serversById = new Map(input.servers.map((server) => [server.id, server]));
  const draftBindings = getServerDefaultMcpBindings(input.bindings);
  const originalBindings = getServerDefaultMcpBindings(
    createAgentToolBindingDraft(input.originalBindings),
  );
  const orderedServerIds = unique([
    ...input.servers
      .filter(
        (server) =>
          isStreamableHttpServer(server) ||
          draftBindings.has(server.id) ||
          originalBindings.has(server.id),
      )
      .map((server) => server.id),
    ...originalBindings.keys(),
    ...draftBindings.keys(),
  ]);

  return orderedServerIds.map((serverId) => {
    const binding = draftBindings.get(serverId);
    const originalBinding = originalBindings.get(serverId);
    const server = serversById.get(serverId);

    return {
      binding,
      displayName:
        server?.name ?? binding?.displayNameSnapshot ?? originalBinding?.displayNameSnapshot ?? '',
      originalBinding,
      server,
      serverId,
      status: getAgentMcpServerOptionStatus(binding, server),
    };
  });
}

export function setAgentMcpServerEnabled(
  bindings: readonly WriteAgentToolBinding[],
  option: AgentMcpServerOption,
  enabled: boolean,
): WriteAgentToolBinding[] {
  const identity = mcpBindingIdentity(option.serverId);
  const withoutServerDefault = bindings.filter((binding) => bindingIdentity(binding) !== identity);

  if (!enabled) {
    return withoutServerDefault;
  }

  const restored = option.binding ?? option.originalBinding;
  const nextBinding: McpToolBindingDraft = restored
    ? { ...restored, approval: clampMcpToolApproval(restored.approval), enabled: true }
    : {
        approval: 'ask',
        displayNameSnapshot: option.server?.name ?? option.displayName,
        enabled: true,
        serverId: option.serverId,
        source: 'mcp',
      };

  return [...withoutServerDefault, nextBinding];
}

export function removeAgentToolBinding(
  bindings: readonly WriteAgentToolBinding[],
  target: WriteAgentToolBinding,
): WriteAgentToolBinding[] {
  const identity = bindingIdentity(target);
  return bindings.filter((binding) => bindingIdentity(binding) !== identity);
}

export function getAgentMcpToolBindingStatus(input: {
  binding: McpToolBindingDraft;
  catalog: McpToolCatalog | undefined;
  server: McpServer | undefined;
}): AgentMcpToolBindingStatus {
  const { binding, catalog, server } = input;
  if (!server) {
    return 'deleted';
  }
  if (!isStreamableHttpServer(server)) {
    return 'unsupported';
  }
  if (!server.isEnabled) {
    return 'server-disabled';
  }
  if (!binding.enabled) {
    return 'binding-disabled';
  }
  if (binding.rawToolName && server.disabledTools.includes(binding.rawToolName)) {
    return 'tool-disabled';
  }
  if (!catalog || catalog.state === 'loading') {
    return 'catalog-loading';
  }
  if (catalog.state === 'error') {
    return 'catalog-failed';
  }
  if (binding.rawToolName && !catalog.names?.has(binding.rawToolName)) {
    return 'tool-unavailable';
  }
  return 'available';
}

export function isStreamableHttpServer(server: Pick<McpServer, 'endpointUrl'>): boolean {
  // Mobile's McpServer entity represents Streamable HTTP by contract and has
  // no desktop transport discriminator. The URL scheme is the remaining
  // executable boundary for legacy or otherwise invalid rows.
  return /^https?:\/\//i.test(server.endpointUrl);
}

function getAgentMcpServerOptionStatus(
  binding: McpToolBindingDraft | undefined,
  server: McpServer | undefined,
): AgentMcpServerOptionStatus {
  if (!server) {
    return 'deleted';
  }
  if (!isStreamableHttpServer(server)) {
    return 'unsupported';
  }
  if (!server.isEnabled) {
    return 'server-disabled';
  }
  if (!binding) {
    return 'available';
  }
  return binding.enabled ? 'enabled' : 'binding-disabled';
}

function getServerDefaultMcpBindings(
  bindings: readonly WriteAgentToolBinding[],
): Map<string, McpToolBindingDraft> {
  return new Map(
    bindings.flatMap((binding) =>
      binding.source === 'mcp' && binding.rawToolName === undefined
        ? [[binding.serverId, binding] as const]
        : [],
    ),
  );
}

function bindingIdentity(binding: WriteAgentToolBinding): string {
  return binding.source === 'builtin'
    ? JSON.stringify(['builtin', binding.capabilityId])
    : mcpBindingIdentity(binding.serverId, binding.rawToolName);
}

function mcpBindingIdentity(serverId: string, rawToolName?: string): string {
  return JSON.stringify(['mcp', serverId, rawToolName ?? null]);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
