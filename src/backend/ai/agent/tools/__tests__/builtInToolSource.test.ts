import { fileContent } from '@/backend/services/file/fileContent';
import type {
  AgentTemporaryCapability,
  DevicePermissionScope,
  SystemPermissionState,
} from '@/shared/contracts';
import { FileEntrySchema } from '@/shared/data/types/file';
import { createUniqueModelId } from '@/shared/data/types/model';

import type { TurnToolResources } from '../../resources/managedFileResolver';
import { managedFileResolver } from '../../resources/managedFileResolver';
import type { RuntimeModel, RuntimeTool } from '../../runtime';
import {
  createSystemCapabilitySource,
  type SystemCapabilityServices,
  type SystemCapabilitySourceDependencies,
} from '../builtInToolSource';
import type { ConfiguredPaintingModel } from '../painting';

const MODEL: RuntimeModel = { providerId: 'openai', modelId: 'gpt-test' };
const TURN_RESOURCES: TurnToolResources = {
  fileEntryIds: new Set<string>(),
  grantFile: () => undefined,
};

describe('createSystemCapabilitySource', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('offers the always-available catalog when nothing is granted or configured', async () => {
    const tools = await resolve({ deviceAccess: {}, paintingModel: null });

    // Every device tool needs a permission and generate_image needs a drawing
    // model, so only the unconditional file tools survive.
    expect(capabilityIds(tools)).toEqual(['edit_file', 'write_file']);
  });

  test('adds a device tool once every scope it needs is granted', async () => {
    const readOnly = await resolve({ deviceAccess: { 'calendar.read': 'granted' } });
    expect(capabilityIds(readOnly)).toEqual([
      'calendar_list_collections',
      'calendar_list_events',
      'edit_file',
      'write_file',
    ]);

    const writable = await resolve({
      deviceAccess: { 'calendar.read': 'granted', 'calendar.write': 'granted' },
    });
    expect(capabilityIds(writable)).toContain('calendar_create_event');
    expect(capabilityIds(writable)).toContain('calendar_delete_event');
  });

  test('omits a device tool whose permission is merely undetermined', async () => {
    const tools = await resolve({ deviceAccess: { 'location.read': 'undetermined' } });

    expect(capabilityIds(tools)).not.toContain('location_get_current');
  });

  test('reads mutations as ask and lookups as auto', async () => {
    const tools = await resolve({
      deviceAccess: { 'calendar.read': 'granted', 'calendar.write': 'granted' },
    });

    expect(approvalOf(tools, 'calendar_list_events')).toBe('auto');
    expect(approvalOf(tools, 'calendar_create_event')).toBe('ask');
  });

  test('offers web tools only when the composer enables them for this turn', async () => {
    const unbound = await resolve({});
    expect(capabilityIds(unbound)).not.toContain('web_search');

    const enabled = await resolve({
      temporaryCapabilities: ['web-search'],
    });
    expect(capabilityIds(enabled)).toEqual(expect.arrayContaining(['web_search', 'web_fetch']));
    expect(approvalOf(enabled, 'web_search')).toBe('auto');
  });

  test('offers generate_image only with temporary activation and a drawing model', async () => {
    const withoutActivation = await resolve({ paintingModel: paintingModel() });
    expect(capabilityIds(withoutActivation)).not.toContain('generate_image');

    const withoutModel = await resolve({
      paintingModel: null,
      temporaryCapabilities: ['image-generation'],
    });
    expect(capabilityIds(withoutModel)).not.toContain('generate_image');

    const withModel = await resolve({
      paintingModel: paintingModel(),
      temporaryCapabilities: ['image-generation'],
    });
    expect(capabilityIds(withModel)).toContain('generate_image');
    expect(approvalOf(withModel, 'generate_image')).toBe('ask');
  });

  test('omits iOS-only capabilities on Android', async () => {
    const tools = await resolve(
      { deviceAccess: { 'reminders.read': 'granted' } },
      { platform: 'android' },
    );

    expect(capabilityIds(tools)).not.toContain('reminder_list_items');
  });

  test('returns nothing for a model that cannot call tools', async () => {
    const tools = await resolve({ supportsToolCalling: false });

    expect(tools).toEqual([]);
  });

  test('describes every tool with a stable built-in ref and JSON Schema input', async () => {
    const tools = await resolve({
      deviceAccess: { 'location.read': 'granted' },
      paintingModel: paintingModel(),
      temporaryCapabilities: ['web-search', 'image-generation'],
    });

    for (const tool of tools) {
      expect(tool.ref.source).toBe('builtin');
      expect(tool.providerName).toBe(
        tool.ref.source === 'builtin' ? tool.ref.capabilityId : undefined,
      );
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.inputSchema).toMatchObject({ type: 'object' });
      expect(tool.inputSchema).not.toHaveProperty('$schema');
    }
  });

  test('grants a created artifact before returning the built-in tool result', async () => {
    const entry = FileEntrySchema.parse({
      createdAt: 1,
      filename: 'report.txt',
      id: '00000000-0000-7000-8000-000000000001',
      mediaType: 'text/plain',
      provenance: 'generated',
      size: 6,
      updatedAt: 1,
    });
    jest.spyOn(fileContent, 'createTextEntry').mockResolvedValueOnce(entry);
    const grantFile = jest.fn();
    const resources: TurnToolResources = { fileEntryIds: new Set(), grantFile };
    const source = createSystemCapabilitySource(SERVICES, dependencies({}));
    const tools = await source.getTools({
      model: MODEL,
      resources,
      temporaryCapabilities: new Set(),
    });
    const writeFile = tools.find((tool) => tool.providerName === 'write_file');
    if (!writeFile) throw new Error('write_file was not available.');

    const result = await writeFile.execute({
      input: { content: 'report', filename: 'report.txt' },
      signal: new AbortController().signal,
      toolCallId: 'call-1',
    });

    expect(grantFile).toHaveBeenCalledWith(entry.id);
    expect(result.artifacts[0]?.ref).toEqual({
      kind: 'managed-file',
      fileEntryId: entry.id,
    });
  });

  test('grants an edited derivative before returning the built-in tool result', async () => {
    const sourceId = '00000000-0000-7000-8000-000000000001';
    const entry = FileEntrySchema.parse({
      createdAt: 2,
      filename: 'notes.txt',
      id: '00000000-0000-7000-8000-000000000002',
      mediaType: 'text/plain',
      provenance: 'generated',
      size: 3,
      updatedAt: 2,
    });
    jest.spyOn(managedFileResolver, 'resolveAvailable').mockResolvedValueOnce(
      new Map([
        [
          sourceId,
          {
            fileEntryId: sourceId,
            mediaType: 'text/plain',
            name: 'notes.txt',
            size: 3,
          },
        ],
      ]) as Awaited<ReturnType<typeof managedFileResolver.resolveAvailable>>,
    );
    jest
      .spyOn(managedFileResolver, 'readAsBytes')
      .mockResolvedValueOnce(new TextEncoder().encode('old'));
    jest.spyOn(fileContent, 'createTextEntry').mockResolvedValueOnce(entry);
    const grantFile = jest.fn();
    const source = createSystemCapabilitySource(SERVICES, dependencies({}));
    const tools = await source.getTools({
      model: MODEL,
      resources: { fileEntryIds: new Set(), grantFile },
      temporaryCapabilities: new Set(),
    });
    const editFile = tools.find((tool) => tool.providerName === 'edit_file');
    if (!editFile) throw new Error('edit_file was not available.');

    const result = await editFile.execute({
      input: { file_entry_id: sourceId, old_string: 'old', new_string: 'new' },
      signal: new AbortController().signal,
      toolCallId: 'call-2',
    });

    expect(grantFile).toHaveBeenCalledWith(entry.id);
    expect(result.artifacts[0]).toMatchObject({
      ref: { kind: 'managed-file', fileEntryId: entry.id },
      kind: 'derived',
    });
  });
});

type Scenario = {
  deviceAccess?: Partial<Record<DevicePermissionScope, SystemPermissionState>>;
  paintingModel?: ConfiguredPaintingModel | null;
  supportsToolCalling?: boolean;
  temporaryCapabilities?: AgentTemporaryCapability[];
};

async function resolve(
  scenario: Scenario,
  options: { platform?: string } = {},
): Promise<readonly RuntimeTool[]> {
  const source = createSystemCapabilitySource(SERVICES, {
    ...dependencies(scenario),
    platform: options.platform ?? 'ios',
  });
  return source.getTools({
    model: MODEL,
    resources: TURN_RESOURCES,
    temporaryCapabilities: new Set(scenario.temporaryCapabilities ?? []),
  });
}

// Every test supplies the full painting/webSearch overrides below, so these
// services only satisfy the required parameter; the overrides win.
const SERVICES: SystemCapabilityServices = {
  ai: { generateImage: jest.fn() },
  preference: { get: jest.fn() },
  webSearch: { fetchUrls: jest.fn(), searchKeywords: jest.fn() },
} as unknown as SystemCapabilityServices;

function dependencies(scenario: Scenario): Partial<SystemCapabilitySourceDependencies> {
  return {
    devicePermissions: {
      getStatusForScope: async (scope) => scenario.deviceAccess?.[scope] ?? 'denied',
    },
    painting: {
      ai: { generateImage: jest.fn() },
      files: {
        createInternalEntry: jest.fn(),
        discard: jest.fn(),
        readDataUrl: jest.fn(),
        resolve: jest.fn(),
      },
      preference: {
        get: jest.fn(async () =>
          scenario.paintingModel ? scenario.paintingModel.uniqueModelId : null,
        ),
      },
      providerRegistry: {
        getImageGenerationSupport: () => scenario.paintingModel?.support ?? null,
      },
    } as unknown as SystemCapabilitySourceDependencies['painting'],
    supportsToolCalling: async () => scenario.supportsToolCalling ?? true,
    webSearch: { fetchUrls: jest.fn(), searchKeywords: jest.fn() },
  };
}

function paintingModel(): ConfiguredPaintingModel {
  return {
    support: { modes: { generate: { supports: {} } } } as ConfiguredPaintingModel['support'],
    uniqueModelId: createUniqueModelId('openai', 'gpt-image-1'),
  };
}

function capabilityIds(tools: readonly RuntimeTool[]): string[] {
  return tools.flatMap((tool) => (tool.ref.source === 'builtin' ? [tool.ref.capabilityId] : []));
}

function approvalOf(tools: readonly RuntimeTool[], capabilityId: string) {
  return tools.find((tool) => tool.providerName === capabilityId)?.approval;
}
