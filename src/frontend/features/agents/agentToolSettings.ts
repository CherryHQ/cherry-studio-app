import type { PermissionStatuses } from '@/shared/contracts';
import type { WriteAgentToolBinding } from '@/shared/data/api/schemas/agentToolBindings';
import type { AgentToolBinding } from '@/shared/data/types/agentToolBinding';
import {
  BUILT_IN_TOOL_DESCRIPTORS,
  type BuiltInToolDescriptor,
} from '@/shared/data/types/builtInTool';
import type { McpServer } from '@/shared/data/types/mcpServer';

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
  return bindings.map((binding) => {
    const base = {
      approval: binding.approval,
      displayNameSnapshot: binding.displayNameSnapshot,
      enabled: binding.enabled,
    };

    if (binding.source === 'builtin') {
      return { ...base, capabilityId: binding.capabilityId, source: 'builtin' };
    }

    return {
      ...base,
      // Runtime already downgrades legacy MCP auto rows to ask. The write API
      // intentionally cannot persist auto for third-party tools.
      approval: binding.approval === 'deny' ? 'deny' : 'ask',
      ...(binding.rawToolName ? { rawToolName: binding.rawToolName } : {}),
      serverId: binding.serverId,
      source: 'mcp',
    };
  });
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
    ? { ...restored, approval: restored.approval === 'deny' ? 'deny' : 'ask', enabled: true }
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

// ── Built-in capabilities ────────────────────────────────────────

export type BuiltInToolDraft = Extract<WriteAgentToolBinding, { source: 'builtin' }>;

export type AgentBuiltInToolStatus =
  | 'available'
  | 'binding-disabled'
  | 'needs-painting-model'
  | 'needs-permission'
  | 'unsupported';

export type AgentBuiltInToolOption = {
  binding?: BuiltInToolDraft;
  descriptor: BuiltInToolDescriptor;
  /** Whether the switch can be turned on at all on this device right now. */
  isSupported: boolean;
  status: AgentBuiltInToolStatus;
};

/**
 * Mirrors the Host's own resolution order so the editor and the turn agree on
 * what an Agent can use: platform, then OS permission, then configuration, then
 * the Agent's own binding.
 */
export function buildAgentBuiltInToolOptions(input: {
  bindings: readonly WriteAgentToolBinding[];
  hasPaintingModel: boolean;
  permissionStatuses: PermissionStatuses;
  platform: string;
}): AgentBuiltInToolOption[] {
  const byCapabilityId = new Map(
    input.bindings.flatMap((binding) =>
      binding.source === 'builtin' ? [[binding.capabilityId, binding] as const] : [],
    ),
  );

  return BUILT_IN_TOOL_DESCRIPTORS.map((descriptor) => {
    const binding = byCapabilityId.get(descriptor.capabilityId);
    const blocker = findBuiltInToolBlocker(descriptor, input);
    const isEnabled = binding ? binding.enabled : !descriptor.isOptIn;

    return {
      ...(binding ? { binding } : {}),
      descriptor,
      isSupported: blocker === null,
      status: blocker ?? (isEnabled ? 'available' : 'binding-disabled'),
    };
  });
}

export function isBuiltInToolEnabled(option: AgentBuiltInToolOption): boolean {
  return option.isSupported && option.status === 'available';
}

/**
 * Enabling writes an explicit binding rather than deleting the row, so a later
 * catalog default change cannot silently flip a choice the user already made.
 */
export function setAgentBuiltInToolEnabled(
  bindings: readonly WriteAgentToolBinding[],
  option: AgentBuiltInToolOption,
  enabled: boolean,
): WriteAgentToolBinding[] {
  const rest = bindings.filter(
    (binding) =>
      binding.source !== 'builtin' || binding.capabilityId !== option.descriptor.capabilityId,
  );
  return [
    ...rest,
    {
      approval: option.binding?.approval ?? option.descriptor.defaultApproval,
      capabilityId: option.descriptor.capabilityId,
      enabled,
      source: 'builtin',
    },
  ];
}

function findBuiltInToolBlocker(
  descriptor: BuiltInToolDescriptor,
  input: { hasPaintingModel: boolean; permissionStatuses: PermissionStatuses; platform: string },
): Exclude<AgentBuiltInToolStatus, 'available' | 'binding-disabled'> | null {
  if (
    descriptor.platforms !== null &&
    !descriptor.platforms.some((platform) => platform === input.platform)
  ) {
    return 'unsupported';
  }
  if (descriptor.permissionScopes.some((scope) => input.permissionStatuses[scope] !== 'granted')) {
    return 'needs-permission';
  }
  if (descriptor.requiresPaintingModel && !input.hasPaintingModel) {
    return 'needs-painting-model';
  }
  return null;
}
