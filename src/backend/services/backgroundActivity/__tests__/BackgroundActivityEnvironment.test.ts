import { CHERRY_ACTIVITY_LOGO_BASE64 } from '@cherrystudio/ui/background-activity';

import { BackgroundActivityEnvironment } from '../BackgroundActivityEnvironment';

const mockWrite = jest.fn();
let mockWidgetsDirectory: string | null = 'file:///widgets';

jest.mock('expo-file-system', () => ({
  File: class MockFile {
    readonly uri = 'file:///widgets/cherry-studio-logo.png';
    write = mockWrite;
  },
}));

jest.mock('expo-widgets', () => ({
  get widgetsDirectory() {
    return mockWidgetsDirectory;
  },
}));

describe('BackgroundActivityEnvironment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWidgetsDirectory = 'file:///widgets';
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('prepares the shared activity logo and returns its file URI', async () => {
    const environment = new BackgroundActivityEnvironment();

    await expect(environment.prepareLogo()).resolves.toBe('file:///widgets/cherry-studio-logo.png');
    expect(mockWrite).toHaveBeenCalledWith(CHERRY_ACTIVITY_LOGO_BASE64, {
      encoding: 'base64',
    });
  });

  it('degrades to no logo when writing the file fails', async () => {
    mockWrite.mockImplementationOnce(() => {
      throw new Error('disk full');
    });
    const environment = new BackgroundActivityEnvironment();

    await expect(environment.prepareLogo()).resolves.toBeUndefined();
  });

  it('degrades to no logo when the native app-group directory is unavailable', async () => {
    mockWidgetsDirectory = null;
    const environment = new BackgroundActivityEnvironment();

    await expect(environment.prepareLogo()).resolves.toBeUndefined();
    expect(mockWrite).not.toHaveBeenCalled();
  });
});
