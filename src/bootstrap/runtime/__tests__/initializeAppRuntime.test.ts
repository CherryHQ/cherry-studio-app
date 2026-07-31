import type { BackendServices } from '@/bootstrap/composition/createBackendServices';

import { initializeAppRuntime } from '../initializeAppRuntime';

const mockSetTheme = jest.fn();
const mockInitI18n = jest.fn(async (..._args: unknown[]) => undefined);

jest.mock('uniwind', () => ({
  Uniwind: { setTheme: (...args: unknown[]) => mockSetTheme(...args) },
}));

jest.mock('@/frontend/i18n', () => ({
  initI18n: (...args: unknown[]) => mockInitI18n(...args),
}));

function createServices(message?: {
  findPendingAssistantMessageIds: jest.Mock;
  settleCrashedMessages: jest.Mock;
}) {
  return {
    message,
    preference: {
      getMultipleCached: () => ({ language: 'en-US', themeMode: 'system' }),
    },
  } as unknown as BackendServices;
}

describe('initializeAppRuntime', () => {
  beforeEach(() => {
    mockSetTheme.mockClear();
    mockInitI18n.mockClear();
  });

  test('applies boot preferences and initializes i18n', async () => {
    await initializeAppRuntime(createServices());

    expect(mockSetTheme).toHaveBeenCalledWith('system');
    expect(mockInitI18n).toHaveBeenCalledWith('en-US');
  });

  test('does not run post-ready reconciliation on the startup critical path', async () => {
    const message = {
      findPendingAssistantMessageIds: jest.fn(async () => ['a']),
      settleCrashedMessages: jest.fn(async () => undefined),
    };

    await initializeAppRuntime(createServices(message));

    expect(message.findPendingAssistantMessageIds).not.toHaveBeenCalled();
    expect(message.settleCrashedMessages).not.toHaveBeenCalled();
  });
});
