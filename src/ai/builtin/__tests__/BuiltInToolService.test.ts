import type { Tool, ToolSet } from 'ai';

import type { PermissionMode, PreferenceAppKeyType } from '@/data/preference';

import { BuiltInToolService } from '../BuiltInToolService';

const mockExecute = jest.fn(async () => ({ ok: true }));
const mockCreateCalendarEvent = jest.fn(async () => ({ ok: true }));
const mockUpdateCalendarEvent = jest.fn(async () => ({ ok: true }));
const mockDeleteCalendarEvent = jest.fn(async () => ({ ok: true }));

jest.mock('../locationTools', () => ({
  createLocationTools: () => ({
    builtin_get_current_location: {
      description: 'Get location',
      execute: mockExecute,
    },
  }),
}));
jest.mock('../calendarTools', () => ({
  createCalendarCreateTools: () => ({
    builtin_create_calendar_event: { execute: mockCreateCalendarEvent },
  }),
  createCalendarModifyTools: () => ({
    builtin_delete_calendar_event: { execute: mockDeleteCalendarEvent },
    builtin_update_calendar_event: { execute: mockUpdateCalendarEvent },
  }),
  createCalendarReadTools: () => ({}),
  createReminderReadTools: () => ({}),
  createReminderWriteTools: () => ({}),
}));
jest.mock('../healthTools', () => ({ createHealthTools: () => ({}) }));

const defaultModes: Record<PreferenceAppKeyType, PermissionMode> = {
  'permissions.calendar_read': 'never',
  'permissions.calendar_write': 'never',
  'permissions.health_read': 'never',
  'permissions.location_read': 'never',
  'permissions.reminders_read': 'never',
  'permissions.reminders_write': 'never',
};

describe('BuiltInToolService', () => {
  let modes: Record<PreferenceAppKeyType, PermissionMode>;
  let systemStatus: 'denied' | 'granted';
  let getPreference: jest.Mock;
  let getSystemStatus: jest.Mock;
  let service: BuiltInToolService;

  beforeEach(() => {
    modes = { ...defaultModes };
    systemStatus = 'granted';
    getPreference = jest.fn(async (key: PreferenceAppKeyType) => modes[key]);
    getSystemStatus = jest.fn(async () => systemStatus);
    mockExecute.mockClear();
    mockCreateCalendarEvent.mockClear();
    mockUpdateCalendarEvent.mockClear();
    mockDeleteCalendarEvent.mockClear();
    service = new BuiltInToolService({
      devicePermission: { getStatusForPreference: getSystemStatus },
      preference: { app: { get: getPreference } },
    } as never);
  });

  test('never hides the tool without checking system permission', async () => {
    expect(await service.getToolSet()).toBeUndefined();
    expect(getSystemStatus).not.toHaveBeenCalled();
  });

  test('ask exposes a built-in tool that requests AI SDK approval', async () => {
    modes['permissions.location_read'] = 'ask';

    const tool = getLocationTool(await service.getToolSet());

    expect(await resolveNeedsApproval(tool)).toBe(true);
    expect(tool.metadata).toEqual({
      cherry: { tool: { name: 'builtin_get_current_location', type: 'builtin' } },
    });
  });

  test('always exposes a tool that can execute without approval', async () => {
    modes['permissions.location_read'] = 'always';

    const tool = getLocationTool(await service.getToolSet());

    expect(await resolveNeedsApproval(tool)).toBe(false);
    await executeTool(tool);
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  test('rechecks policy before execution and rejects a mid-session disable', async () => {
    modes['permissions.location_read'] = 'always';
    const tool = getLocationTool(await service.getToolSet());

    modes['permissions.location_read'] = 'never';

    await expect(executeTool(tool)).rejects.toThrow('is disabled');
    expect(mockExecute).not.toHaveBeenCalled();
  });

  test('rechecks native authorization before execution', async () => {
    modes['permissions.location_read'] = 'always';
    const tool = getLocationTool(await service.getToolSet());

    systemStatus = 'denied';

    await expect(executeTool(tool)).rejects.toThrow('requires system permission');
    expect(mockExecute).not.toHaveBeenCalled();
  });

  test('does not expose a configured tool while native access is missing', async () => {
    modes['permissions.location_read'] = 'ask';
    systemStatus = 'denied';

    expect(await service.getToolSet()).toBeUndefined();
  });

  test('requires read and write policies for calendar update and delete', async () => {
    modes['permissions.calendar_write'] = 'always';

    const writeOnlyTools = await service.getToolSet();
    expect(writeOnlyTools).toHaveProperty('builtin_create_calendar_event');
    expect(writeOnlyTools).not.toHaveProperty('builtin_update_calendar_event');
    expect(writeOnlyTools).not.toHaveProperty('builtin_delete_calendar_event');

    modes['permissions.calendar_read'] = 'ask';
    const readWriteTools = await service.getToolSet();
    const updateTool = getTool(readWriteTools, 'builtin_update_calendar_event');
    const deleteTool = getTool(readWriteTools, 'builtin_delete_calendar_event');

    expect(await resolveNeedsApproval(updateTool)).toBe(true);
    expect(await resolveNeedsApproval(deleteTool)).toBe(true);
  });

  test('rechecks both calendar policies before modifying an event', async () => {
    modes['permissions.calendar_read'] = 'always';
    modes['permissions.calendar_write'] = 'always';
    const updateTool = getTool(await service.getToolSet(), 'builtin_update_calendar_event');

    modes['permissions.calendar_read'] = 'never';

    await expect(executeTool(updateTool)).rejects.toThrow('is disabled');
    expect(mockUpdateCalendarEvent).not.toHaveBeenCalled();
  });
});

function getLocationTool(tools: ToolSet | undefined): Tool {
  return getTool(tools, 'builtin_get_current_location');
}

function getTool(tools: ToolSet | undefined, name: string): Tool {
  const tool = tools?.[name];
  if (!tool) {
    throw new Error(`Built-in tool was not exposed: ${name}`);
  }
  return tool;
}

async function resolveNeedsApproval(tool: Tool) {
  return typeof tool.needsApproval === 'function'
    ? tool.needsApproval({}, { messages: [], toolCallId: 'call-1' })
    : tool.needsApproval;
}

function executeTool(tool: Tool) {
  if (!tool.execute) {
    throw new Error('Tool has no execute function');
  }
  return tool.execute({}, { messages: [], toolCallId: 'call-1' });
}
