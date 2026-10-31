import { fileLibraryService } from '@/backend/data/services/FileLibraryService';
import { fileContent } from '@/backend/services/file/fileContent';
import type { JsSandbox } from '@/backend/services/jsSandbox';
import type { DevicePermissionScope, SystemPermissionState } from '@/shared/contracts';
import type { AgentCapability } from '@/shared/data/types/agentCapability';
import { FileEntrySchema } from '@/shared/data/types/file';
import { createUniqueModelId } from '@/shared/data/types/model';

import type { TurnToolResources } from '../../resources/managedFileResolver';
import { managedFileResolver } from '../../resources/managedFileResolver';
import type { RuntimeModel, RuntimeTool } from '../../runtime';
import type { AskUserQuestion } from '../askUserQuestionTool';
import {
  createSystemCapabilitySource,
  type SystemCapabilityServices,
  type SystemCapabilitySourceDependencies,
} from '../builtInToolSource';
import type { ConfiguredPaintingModel } from '../painting';

// Catalog scenarios supply their own permission reader. Native authorization is
// covered at the DevicePermissions boundary, outside this catalog test.
jest.mock('@/backend/services/permissions', () => ({
  devicePermissions: { getStatuses: jest.fn(), request: jest.fn() },
}));

const MODEL: RuntimeModel = { providerId: 'openai', modelId: 'gpt-test' };
const noAskUser: AskUserQuestion = async () => {
  throw new Error('This scenario asks no questions.');
};
const TURN_RESOURCES: TurnToolResources = {
  availableFiles: new Map(),
  draftFileEntryIds: new Set<string>(),
  fileEntryIds: new Set<string>(),
  grantFile: () => undefined,
};

describe('createSystemCapabilitySource', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test.each(['needs-model', 'unsupported', 'ready'] as const)(
    'offers audio transcription only when ready: %s',
    async (status) => {
      const source = createSystemCapabilitySource(SERVICES, {
        ...dependencies({}),
        platform: 'ios',
        voice: { getTranscriptionStatus: async () => status, transcribeAudio: jest.fn() },
      });
      const tools = await source.getTools({
        acceptsImages: false,
        askUser: noAskUser,
        documentParserMode: 'builtin',
        disabledCapabilities: [],
        model: MODEL,
        resources: TURN_RESOURCES,
      });
      expect(capabilityIds(tools).includes('transcribe_audio')).toBe(status === 'ready');
      if (status === 'ready') expect(approvalOf(tools, 'transcribe_audio')).toBe('auto');
    },
  );

  test('offers the always-available catalog when nothing is granted or configured', async () => {
    const tools = await resolve({ deviceAccess: {}, paintingModel: null });

    // Personal device data requires permission; the public HealthKit type catalog does not.
    expect(capabilityIds(tools)).toEqual([
      'agent_create',
      'agent_get',
      'agent_list',
      'agent_update',
      'ask_user_question',
      'health_list_data_types',
      'edit_file',
      'library_search_files',
      'library_read_file',
      'library_list_folders',
      'library_move_item',
      'library_rename_item',
      'library_trash_item',
      'library_list_trash',
      'library_restore_item',
      'read_file',
      'write_file',
    ]);
  });

  test('applies the shared read/mutation approval to file-library tools, defers management, and honors the group deny-list', async () => {
    const tools = await resolve({});
    const reads = ['library_search_files', 'library_read_file'];
    const management = {
      library_list_folders: 'auto',
      library_move_item: 'ask',
      library_rename_item: 'ask',
      library_trash_item: 'ask',
      library_list_trash: 'auto',
      library_restore_item: 'ask',
    };
    const names = [...reads, ...Object.keys(management)];
    for (const name of reads) {
      const tool = tools.find((item) => item.providerName === name);
      expect(tool).toMatchObject({ approval: 'auto', autoApprovalEligible: true });
      expect(tool?.deferred).toBeUndefined();
    }
    for (const [name, approval] of Object.entries(management)) {
      expect(tools.find((tool) => tool.providerName === name)).toMatchObject({
        approval,
        autoApprovalEligible: true,
        deferred: true,
      });
    }
    const disabled = await resolve({ disabledCapabilities: ['fileLibrary'] });
    for (const name of names) expect(capabilityIds(disabled)).not.toContain(name);
    expect(capabilityIds(disabled)).toContain('read_file');
  });

  test('defers occasional health and Agent management tools while device schedules stay direct', async () => {
    const tools = await resolve({
      deviceAccess: {
        'calendar.read': 'granted',
        'calendar.write': 'granted',
        'health.steps.read': 'granted',
        'health.workouts.read': 'granted',
      },
    });
    const deferred = (name: string) => tools.find((tool) => tool.providerName === name)?.deferred;
    for (const name of [
      'agent_create',
      'agent_get',
      'agent_list',
      'agent_update',
      'health_get_summary',
      'health_list_workouts',
      'health_list_data_types',
    ])
      expect(deferred(name)).toBe(true);
    expect(deferred('calendar_list_events')).toBeUndefined();
    expect(deferred('ask_user_question')).toBeUndefined();
  });

  test('names the linked folder in the workspace tools only for a workspace conversation', async () => {
    const folder = jest.spyOn(fileLibraryService, 'folder').mockResolvedValue({
      id: 'folder-1',
      parentId: null,
      name: '项目资料',
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
    } as never);
    const linked = await resolve({ workspaceFolderId: 'folder-1' });
    expect(folder).toHaveBeenCalledWith('folder-1');
    expect(capabilityIds(linked)).toEqual(
      expect.arrayContaining(['list_workspace', 'find_workspace_files', 'create_workspace_folder']),
    );
    expect(linked.find((tool) => tool.providerName === 'list_workspace')?.description).toContain(
      'file-library folder "项目资料"',
    );

    folder.mockClear();
    const unlinked = await resolve({});
    expect(folder).not.toHaveBeenCalled();
    expect(capabilityIds(unlinked)).not.toContain('list_workspace');
  });

  test('offers run_js without approval only when the client has the interactive bridge', async () => {
    expect(capabilityIds(await resolve({}))).not.toContain('run_js');
    expect(capabilityIds(await resolve({ jsSandbox: { run: jest.fn() } }))).not.toContain('run_js');

    const tools = await resolve({ jsSandbox: { run: jest.fn(), startBridge: jest.fn() } });
    expect(capabilityIds(tools)).toContain('run_js');
    expect(approvalOf(tools, 'run_js')).toBe('auto');
  });

  test('defers Office tools with the compute sandbox even without a Code Mode bridge', async () => {
    const office = [
      'create_document',
      'create_workbook',
      'create_presentation',
      'inspect_office_file',
      'read_office_content',
      'edit_document',
      'edit_workbook',
      'edit_presentation',
      'run_office_script',
    ];
    const absent = capabilityIds(await resolve({}));
    expect(absent.some((id) => office.includes(id))).toBe(false);
    // Clients whose sandbox predates native file access cannot run Office jobs.
    const older = capabilityIds(await resolve({ jsSandbox: { run: jest.fn() } }));
    expect(older.some((id) => office.includes(id))).toBe(false);
    const tools = await resolve({ jsSandbox: { run: jest.fn(), files: true } });
    for (const name of office) {
      expect(tools.find((tool) => tool.providerName === name)).toMatchObject({
        approval: 'auto',
        deferred: true,
      });
    }
    expect(capabilityIds(tools)).toContain('library_move_item');
    expect(capabilityIds(tools)).not.toContain('run_js');
  });

  test('adds a device tool once every scope it needs is grantable', async () => {
    const readOnly = await resolve({ deviceAccess: { 'calendar.read': 'granted' } });
    expect(capabilityIds(readOnly)).toEqual([
      'agent_create',
      'agent_get',
      'agent_list',
      'agent_update',
      'ask_user_question',
      'calendar_list_collections',
      'calendar_list_events',
      'health_list_data_types',
      'edit_file',
      'library_search_files',
      'library_read_file',
      'library_list_folders',
      'library_move_item',
      'library_rename_item',
      'library_trash_item',
      'library_list_trash',
      'library_restore_item',
      'read_file',
      'write_file',
    ]);

    const writable = await resolve({
      deviceAccess: { 'calendar.read': 'granted', 'calendar.write': 'granted' },
    });
    expect(capabilityIds(writable)).toContain('calendar_create_event');
    expect(capabilityIds(writable)).toContain('calendar_delete_event');
  });

  test('offers a never-asked device tool as ask so execution can request access', async () => {
    const tools = await resolve({ deviceAccess: { 'location.read': 'undetermined' } });

    const location = tools.find((tool) => tool.providerName === 'location_get_current');
    expect(location?.approval).toBe('ask');
    // The escalated ask is a consent requirement; the Agent's global auto
    // mode must not silence the in-app card before the one-shot OS prompt.
    expect(location?.autoApprovalEligible).toBe(false);
  });

  test('omits a device tool once any scope it needs is denied', async () => {
    const tools = await resolve({
      deviceAccess: { 'calendar.read': 'granted', 'calendar.write': 'denied' },
    });

    expect(capabilityIds(tools)).toContain('calendar_list_events');
    expect(capabilityIds(tools)).not.toContain('calendar_create_event');
  });

  test('omits a device group the Agent disabled even when access is granted', async () => {
    const tools = await resolve({
      deviceAccess: { 'calendar.read': 'granted', 'calendar.write': 'granted' },
      disabledCapabilities: ['calendar'],
    });

    expect(capabilityIds(tools)).toEqual([
      'agent_create',
      'agent_get',
      'agent_list',
      'agent_update',
      'ask_user_question',
      'health_list_data_types',
      'edit_file',
      'library_search_files',
      'library_read_file',
      'library_list_folders',
      'library_move_item',
      'library_rename_item',
      'library_trash_item',
      'library_list_trash',
      'library_restore_item',
      'read_file',
      'write_file',
    ]);
  });

  test('reads mutations as ask and lookups as auto', async () => {
    const tools = await resolve({
      deviceAccess: { 'calendar.read': 'granted', 'calendar.write': 'granted' },
    });

    expect(approvalOf(tools, 'calendar_list_events')).toBe('auto');
    expect(approvalOf(tools, 'calendar_create_event')).toBe('ask');
  });

  test('offers health summaries with just one granted metric without enabling workouts', async () => {
    const tools = await resolve({
      deviceAccess: { 'health.steps.read': 'granted', 'health.workouts.read': 'denied' },
    });
    expect(capabilityIds(tools)).toContain('health_get_summary');
    expect(capabilityIds(tools)).not.toContain('health_list_workouts');
  });

  test('allows HealthKit read attempts after an inquiry without requiring a fictitious read grant', async () => {
    const tools = await resolve({ deviceAccess: { 'health.steps.read': 'requested' } });
    expect(capabilityIds(tools)).toContain('health_get_summary');
    expect(approvalOf(tools, 'health_get_summary')).toBe('ask');
    expect(
      tools.find((tool) => tool.providerName === 'health_get_summary')?.autoApprovalEligible,
    ).toBe(false);
  });

  test('requires consent to share workouts even after system authorization', async () => {
    const tools = await resolve({ deviceAccess: { 'health.workouts.read': 'requested' } });
    expect(approvalOf(tools, 'health_list_workouts')).toBe('ask');
    expect(
      tools.find((tool) => tool.providerName === 'health_list_workouts')?.autoApprovalEligible,
    ).toBe(false);
  });

  test('keeps extended personal health reads explicit while allowing public catalog lookup', async () => {
    const tools = await resolve({ deviceAccess: { 'health.electrocardiogram.read': 'requested' } });
    for (const id of ['health_query_data', 'health_get_record']) {
      expect(tools.find((tool) => tool.providerName === id)).toMatchObject({
        approval: 'ask',
        autoApprovalEligible: false,
      });
    }
    expect(approvalOf(tools, 'health_list_data_types')).toBe('auto');
    const disabled = await resolve({ disabledCapabilities: ['health'] });
    expect(capabilityIds(disabled)).not.toContain('health_list_data_types');
  });

  test('offers each web tool only when its provider is configured', async () => {
    const unconfigured = await resolve({});
    expect(capabilityIds(unconfigured)).not.toContain('web_search');
    expect(capabilityIds(unconfigured)).not.toContain('web_fetch');

    const searchOnly = await resolve({ webSearchProviders: { searchKeywords: true } });
    expect(capabilityIds(searchOnly)).toContain('web_search');
    expect(capabilityIds(searchOnly)).not.toContain('web_fetch');
    expect(approvalOf(searchOnly, 'web_search')).toBe('auto');
  });

  test('omits web tools when the Agent disables the group', async () => {
    const tools = await resolve({
      disabledCapabilities: ['web'],
      webSearchProviders: { fetchUrls: true, searchKeywords: true },
    });

    expect(capabilityIds(tools)).not.toContain('web_search');
    expect(capabilityIds(tools)).not.toContain('web_fetch');
  });

  test('omits Agent management tools when the Agent disables the group', async () => {
    const tools = await resolve({ disabledCapabilities: ['agents'] });

    expect(capabilityIds(tools)).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/^agent_/)]),
    );
    expect(capabilityIds(tools)).toContain('ask_user_question');
  });

  test('binds the Host response channel into ask_user_question with the calling turn', async () => {
    const answer = {
      answers: [{ questionId: 'pick', selectedOptionIds: ['a'], text: '', skipped: false }],
    };
    const askUser = jest.fn<ReturnType<AskUserQuestion>, Parameters<AskUserQuestion>>(
      async () => answer,
    );
    const tools = await resolve({}, { askUser });
    const question = {
      questions: [
        {
          id: 'pick',
          question: 'Which?',
          selection: 'single',
          options: [
            { id: 'a', label: 'A' },
            { id: 'b', label: 'B' },
          ],
        },
      ],
    };
    const ask = tools.find((tool) => tool.providerName === 'ask_user_question');
    if (!ask) throw new Error('ask_user_question was not available.');

    const result = await ask.execute({
      input: question,
      signal: new AbortController().signal,
      toolCallId: 'question-1',
      turnId: 'turn-7',
    });

    expect(askUser).toHaveBeenCalledWith(
      question,
      expect.objectContaining({ toolCallId: 'question-1', turnId: 'turn-7' }),
    );
    expect(result.value).toMatchObject({
      ...answer,
      selectedOptions: [{ questionId: 'pick', options: [{ id: 'a', label: 'A' }] }],
    });
  });

  test('returns batch answers and selected labels associated by question ID', async () => {
    const answer = {
      answers: [
        { questionId: 'second', selectedOptionIds: ['a'], text: 'Extra', skipped: false },
        { questionId: 'first', selectedOptionIds: [], text: '', skipped: true },
      ],
    };
    const askUser = jest.fn<ReturnType<AskUserQuestion>, Parameters<AskUserQuestion>>(
      async () => answer,
    );
    const tools = await resolve({}, { askUser });
    const ask = tools.find((tool) => tool.providerName === 'ask_user_question')!;
    const result = await ask.execute({
      input: {
        questions: [
          {
            id: 'first',
            question: 'Choose',
            selection: 'single',
            options: [{ id: 'a', label: 'City' }],
          },
          {
            id: 'second',
            question: 'Choose',
            selection: 'multiple',
            options: [{ id: 'a', label: 'Food' }],
          },
        ],
      },
      signal: new AbortController().signal,
      toolCallId: 'batch',
      turnId: 'turn',
    });
    expect(result.value).toEqual({
      ...answer,
      selectedOptions: [
        { questionId: 'second', options: [{ id: 'a', label: 'Food' }] },
        { questionId: 'first', options: [] },
      ],
    });
  });

  test('offers generate_image only with a drawing model and the group enabled', async () => {
    const withoutModel = await resolve({ paintingModel: null });
    expect(capabilityIds(withoutModel)).not.toContain('generate_image');

    const disabled = await resolve({
      disabledCapabilities: ['image'],
      paintingModel: paintingModel(),
    });
    expect(capabilityIds(disabled)).not.toContain('generate_image');

    const enabled = await resolve({ paintingModel: paintingModel() });
    expect(capabilityIds(enabled)).toContain('generate_image');
    expect(approvalOf(enabled, 'generate_image')).toBe('ask');
    // Spending provider quota needs consent even under the global auto mode.
    const tool = enabled.find((candidate) => candidate.providerName === 'generate_image');
    expect(tool?.autoApprovalEligible).toBe(false);
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
      jsSandbox: { run: jest.fn(), startBridge: jest.fn() },
      paintingModel: paintingModel(),
      webSearchProviders: { fetchUrls: true, searchKeywords: true },
    });

    for (const tool of tools) {
      expect(tool.ref.source).toBe('builtin');
      expect(tool.providerName).toBe(
        tool.ref.source === 'builtin' ? tool.ref.capabilityId : undefined,
      );
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.inputSchema).toMatchObject({ type: 'object' });
      expect(tool.inputSchema).not.toHaveProperty('$schema');
      // Strict provider converters reject allOf, such as two regexes on one string.
      expect(JSON.stringify(tool.inputSchema)).not.toContain('"allOf"');
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
    const resources: TurnToolResources = {
      availableFiles: new Map(),
      draftFileEntryIds: new Set(),
      fileEntryIds: new Set(),
      grantFile,
    };
    const source = createSystemCapabilitySource(SERVICES, dependencies({}));
    const tools = await source.getTools({
      acceptsImages: true,
      askUser: noAskUser,
      documentParserMode: 'builtin',
      disabledCapabilities: [],
      model: MODEL,
      resources,
    });
    const writeFile = tools.find((tool) => tool.providerName === 'write_file');
    if (!writeFile) throw new Error('write_file was not available.');

    const result = await writeFile.execute({
      input: { content: 'report', filename: 'report.txt' },
      signal: new AbortController().signal,
      toolCallId: 'call-1',
      turnId: 'turn-1',
    });

    expect(grantFile).toHaveBeenCalledWith(entry.id);
    expect(result.artifacts[0]?.ref).toEqual({
      kind: 'managed-file',
      fileEntryId: entry.id,
    });
  });

  test('grants an edited derivative before returning the built-in tool result', async () => {
    const sourceId = '00000000-0000-7000-8000-000000000001';
    jest
      .spyOn(fileLibraryService, 'fileForEntry')
      .mockResolvedValue({ folderId: null, name: 'notes.txt' } as never);
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
      acceptsImages: true,
      askUser: noAskUser,
      documentParserMode: 'builtin',
      disabledCapabilities: [],
      model: MODEL,
      resources: {
        availableFiles: new Map(),
        draftFileEntryIds: new Set(),
        fileEntryIds: new Set([sourceId]),
        grantFile,
      },
    });
    const editFile = tools.find((tool) => tool.providerName === 'edit_file');
    if (!editFile) throw new Error('edit_file was not available.');

    const result = await editFile.execute({
      input: { file_entry_id: sourceId, old_string: 'old', new_string: 'new' },
      signal: new AbortController().signal,
      toolCallId: 'call-2',
      turnId: 'turn-1',
    });

    expect(grantFile).toHaveBeenCalledWith(entry.id);
    expect(result.artifacts[0]).toMatchObject({
      ref: { kind: 'managed-file', fileEntryId: entry.id },
      kind: 'derived',
    });
  });

  test('publishes and grants Office output in the conversation workspace', async () => {
    const folderId = '00000000-0000-7000-8000-000000000009';
    jest.spyOn(fileLibraryService, 'folder').mockResolvedValue({
      id: folderId,
      name: 'Reports',
      parentId: null,
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
    });
    const entry = FileEntrySchema.parse({
      createdAt: 1,
      updatedAt: 1,
      filename: 'report.docx',
      id: '00000000-0000-7000-8000-000000000001',
      mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      provenance: 'generated',
      size: 4,
    });
    const save = jest.spyOn(fileContent, 'createFileEntry').mockResolvedValueOnce(entry);
    const grantFile = jest.fn();
    const source = createSystemCapabilitySource(
      SERVICES,
      dependencies({
        jsSandbox: {
          files: true,
          run: async ({ onSettled }) => {
            onSettled?.();
            return {
              status: 'ok',
              result: '4',
              logs: '',
              logsTruncated: false,
              durationMs: 1,
            };
          },
        },
      }),
    );
    const tools = await source.getTools({
      acceptsImages: true,
      askUser: noAskUser,
      documentParserMode: 'builtin',
      disabledCapabilities: [],
      model: MODEL,
      resources: { ...TURN_RESOURCES, grantFile },
      workspaceFolderId: folderId,
    });
    const tool = tools.find((tool) => tool.providerName === 'create_document')!;
    const result = await tool.execute({
      input: {
        filename: 'report.docx',
        spec: { version: 1, blocks: [{ type: 'paragraph', text: 'Report' }] },
      },
      signal: new AbortController().signal,
      toolCallId: 'office-call',
      turnId: 'turn',
    });
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ folderId, workspaceFolderId: folderId }),
      expect.any(AbortSignal),
    );
    expect(result.artifacts[0]?.ref.fileEntryId).toBe(entry.id);
    expect(grantFile).toHaveBeenCalledWith(entry.id);
  });

  test('rewrites a draft this turn produced instead of deriving a copy', async () => {
    const draftId = '00000000-0000-7000-8000-000000000001';
    jest
      .spyOn(fileLibraryService, 'fileForEntry')
      .mockResolvedValue({ folderId: null, name: 'notes.txt' } as never);
    const entry = FileEntrySchema.parse({
      createdAt: 2,
      filename: 'notes.txt',
      id: draftId,
      mediaType: 'text/plain',
      provenance: 'generated',
      size: 3,
      updatedAt: 3,
    });
    jest
      .spyOn(managedFileResolver, 'resolveAvailable')
      .mockResolvedValueOnce(
        new Map([
          [draftId, { fileEntryId: draftId, mediaType: 'text/plain', name: 'notes.txt', size: 3 }],
        ]) as Awaited<ReturnType<typeof managedFileResolver.resolveAvailable>>,
      );
    jest
      .spyOn(managedFileResolver, 'readAsBytes')
      .mockResolvedValueOnce(new TextEncoder().encode('old'));
    const createTextEntry = jest.spyOn(fileContent, 'createTextEntry');
    const rewriteTextEntry = jest
      .spyOn(fileContent, 'rewriteTextEntry')
      .mockResolvedValueOnce(entry);
    const grantFile = jest.fn();
    const source = createSystemCapabilitySource(SERVICES, dependencies({}));
    const tools = await source.getTools({
      acceptsImages: true,
      askUser: noAskUser,
      documentParserMode: 'builtin',
      disabledCapabilities: [],
      model: MODEL,
      resources: {
        availableFiles: new Map(),
        draftFileEntryIds: new Set([draftId]),
        fileEntryIds: new Set([draftId]),
        grantFile,
      },
    });
    const editFile = tools.find((tool) => tool.providerName === 'edit_file');
    if (!editFile) throw new Error('edit_file was not available.');

    const result = await editFile.execute({
      input: { file_entry_id: draftId, old_string: 'old', new_string: 'new' },
      signal: new AbortController().signal,
      toolCallId: 'call-3',
      turnId: 'turn-1',
    });

    expect(rewriteTextEntry).toHaveBeenCalledWith(
      { data: 'new', id: draftId, baseUpdatedAt: undefined, workspaceFolderId: null },
      expect.any(AbortSignal),
    );
    expect(createTextEntry).not.toHaveBeenCalled();
    expect(grantFile).not.toHaveBeenCalled();
    expect(result.artifacts).toEqual([]);
    expect(result.value).toMatchObject({ status: 'edited', fileEntryId: draftId });
  });

  test('scopes read_file to the turn ledger', async () => {
    const knownId = '00000000-0000-7000-8000-000000000001';
    const unknownId = '00000000-0000-7000-8000-000000000009';
    jest
      .spyOn(managedFileResolver, 'resolveAvailable')
      .mockResolvedValue(
        new Map([
          [knownId, { fileEntryId: knownId, mediaType: 'text/plain', name: 'notes.txt', size: 3 }],
        ]) as Awaited<ReturnType<typeof managedFileResolver.resolveAvailable>>,
      );
    jest
      .spyOn(managedFileResolver, 'readAsBytes')
      .mockResolvedValue(new TextEncoder().encode('a\nb'));
    const source = createSystemCapabilitySource(SERVICES, dependencies({}));
    const tools = await source.getTools({
      acceptsImages: true,
      askUser: noAskUser,
      documentParserMode: 'builtin',
      disabledCapabilities: [],
      model: MODEL,
      resources: { ...TURN_RESOURCES, fileEntryIds: new Set([knownId]) },
    });
    const readFile = tools.find((tool) => tool.providerName === 'read_file');
    if (!readFile) throw new Error('read_file was not available.');
    const signal = new AbortController().signal;

    const known = await readFile.execute({
      input: { file_entry_id: knownId },
      signal,
      toolCallId: 'c4',
      turnId: 'turn-1',
    });
    const unknown = await readFile.execute({
      input: { file_entry_id: unknownId },
      signal,
      toolCallId: 'c5',
      turnId: 'turn-1',
    });

    expect(known.value).toMatchObject({ status: 'ok', text: 'a\nb', totalLines: 2 });
    expect(unknown.value).toMatchObject({ status: 'error' });
  });
});

type Scenario = {
  deviceAccess?: Partial<Record<DevicePermissionScope, SystemPermissionState>>;
  jsSandbox?: JsSandbox;
  disabledCapabilities?: AgentCapability[];
  paintingModel?: ConfiguredPaintingModel | null;
  supportsToolCalling?: boolean;
  webSearchProviders?: { fetchUrls?: boolean; searchKeywords?: boolean };
  workspaceFolderId?: string;
};

async function resolve(
  scenario: Scenario,
  options: { askUser?: AskUserQuestion; platform?: string } = {},
): Promise<readonly RuntimeTool[]> {
  const source = createSystemCapabilitySource(SERVICES, {
    ...dependencies(scenario),
    platform: options.platform ?? 'ios',
  });
  return source.getTools({
    acceptsImages: true,
    askUser: options.askUser ?? noAskUser,
    documentParserMode: 'builtin',
    disabledCapabilities: scenario.disabledCapabilities ?? [],
    model: MODEL,
    resources: TURN_RESOURCES,
    workspaceFolderId: scenario.workspaceFolderId,
  });
}

// Every test supplies the full painting/webSearch overrides below, so these
// services only satisfy the required parameter; the overrides win.
const SERVICES: SystemCapabilityServices = {
  ai: { generateImage: jest.fn() },
  model: { getById: jest.fn() },
  preference: { get: jest.fn() },
  webSearch: { fetchUrls: jest.fn(), searchKeywords: jest.fn() },
  trash: { entries: { list: jest.fn() }, restore: jest.fn() },
} as unknown as SystemCapabilityServices;

function dependencies(scenario: Scenario): Partial<SystemCapabilitySourceDependencies> {
  return {
    devicePermissions: {
      getStatuses: async (scopes) =>
        Object.fromEntries(
          scopes.map((scope) => {
            const state = scenario.deviceAccess?.[scope] ?? 'denied';
            return [scope, { state, canAskAgain: state === 'undetermined' }];
          }),
        ),
      request: async () => ({}),
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
      models: {
        getById: async () => scenario.paintingModel?.model ?? null,
      },
    } as unknown as SystemCapabilitySourceDependencies['painting'],
    preference: {
      get: jest.fn(async (key: string) => {
        if (key === 'chat.web_search.default_search_keywords_provider') {
          return scenario.webSearchProviders?.searchKeywords ? 'tavily' : null;
        }
        if (key === 'chat.web_search.default_fetch_urls_provider') {
          return scenario.webSearchProviders?.fetchUrls ? 'tavily' : null;
        }
        return null;
      }),
    } as unknown as SystemCapabilitySourceDependencies['preference'],
    jsSandbox: scenario.jsSandbox ?? null,
    supportsToolCalling: async () => scenario.supportsToolCalling ?? true,
    webSearch: { fetchUrls: jest.fn(), searchKeywords: jest.fn() },
  };
}

function paintingModel(): ConfiguredPaintingModel {
  const uniqueModelId = createUniqueModelId('openai', 'gpt-image-1');
  return {
    uniqueModelId,
    model: {
      id: uniqueModelId,
      providerId: 'openai',
      modelId: 'gpt-image-1',
      name: 'Image',
      capabilities: ['image-generation'],
      imageGeneration: { modes: { generate: { supports: {} } } },
      supportsStreaming: false,
      isEnabled: true,
      isHidden: false,
    },
  };
}

function capabilityIds(tools: readonly RuntimeTool[]): string[] {
  return tools.flatMap((tool) => (tool.ref.source === 'builtin' ? [tool.ref.capabilityId] : []));
}

function approvalOf(tools: readonly RuntimeTool[], capabilityId: string) {
  return tools.find((tool) => tool.providerName === capabilityId)?.approval;
}
