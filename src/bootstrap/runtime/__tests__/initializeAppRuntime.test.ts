import type { BackendServices } from '@/bootstrap/composition/createBackendServices';

import { initializeAppRuntime } from '../initializeAppRuntime';

const mockSetTheme = jest.fn();
const mockUpdateCSSVariables = jest.fn();
const mockInitI18n = jest.fn(async (..._args: unknown[]) => undefined);
const mockCreateInitialAgent = jest.fn(async (..._args: unknown[]) => undefined);

jest.mock('uniwind', () => ({
  Uniwind: {
    currentTheme: 'light',
    setTheme: (...args: unknown[]) => mockSetTheme(...args),
    updateCSSVariables: (...args: unknown[]) => mockUpdateCSSVariables(...args),
  },
}));
jest.mock('heroui-native/utils', () => ({
  cn: (...values: unknown[]) => values.filter(Boolean).join(' '),
}));

jest.mock('@/frontend/i18n', () => ({
  __esModule: true,
  default: { t: (key: string) => (key === 'agent.default.name' ? 'Cherry Agent' : key) },
  initI18n: (...args: unknown[]) => mockInitI18n(...args),
}));

function createServices(message?: {
  findPendingAssistantMessageIds: jest.Mock;
  settleCrashedMessages: jest.Mock;
}) {
  return {
    agentData: {
      createInitialAgent: mockCreateInitialAgent,
    },
    message,
    preference: {
      getMultipleCached: () => ({
        fontSizeStep: 1,
        language: 'en-US',
        themeMode: 'system',
      }),
    },
  } as unknown as BackendServices;
}

describe('initializeAppRuntime', () => {
  beforeEach(() => {
    mockSetTheme.mockClear();
    mockUpdateCSSVariables.mockClear();
    mockInitI18n.mockClear();
    mockCreateInitialAgent.mockClear();
  });

  test('applies boot preferences and initializes i18n', async () => {
    await initializeAppRuntime(createServices());

    expect(mockSetTheme).toHaveBeenCalledWith('system');
    const variables = expect.objectContaining({ '--ui-text-base': 18 });
    expect(mockUpdateCSSVariables).toHaveBeenNthCalledWith(1, 'dark', variables);
    expect(mockUpdateCSSVariables).toHaveBeenNthCalledWith(2, 'light', variables);
    expect(mockInitI18n).toHaveBeenCalledWith('en-US');
    expect(mockCreateInitialAgent).toHaveBeenCalledWith({ name: 'Cherry Agent' });
    expect(mockInitI18n.mock.invocationCallOrder[0]).toBeLessThan(
      mockCreateInitialAgent.mock.invocationCallOrder[0],
    );
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
