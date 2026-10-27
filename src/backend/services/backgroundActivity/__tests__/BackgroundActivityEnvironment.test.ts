import {
  CHERRY_ACTIVITY_LOGO_DARK_BASE64,
  CHERRY_ACTIVITY_LOGO_LIGHT_BASE64,
} from '@cherrystudio/ui/background-activity';

import type { BackgroundActivityActionResponse } from '@/shared/backgroundActivity/actions';

import { BackgroundActivityEnvironment } from '../BackgroundActivityEnvironment';

const mockWrite = jest.fn();
let mockWidgetsDirectory: string | null = 'file:///widgets';

jest.mock('expo-file-system', () => ({
  File: class MockFile {
    readonly uri: string;
    constructor(directory: string, name: string) {
      this.uri = `${directory}/${name}`;
    }
    writeSync = mockWrite;
  },
}));

jest.mock('expo-widgets', () => ({
  get widgetsDirectory() {
    return mockWidgetsDirectory;
  },
}));

describe('BackgroundActivityEnvironment', () => {
  it('keeps reply completion notifications off until bootstrap configures them', () => {
    const environment = new BackgroundActivityEnvironment();

    expect(environment.isReplyCompletionNotificationEnabled()).toBe(false);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockWidgetsDirectory = 'file:///widgets';
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('stages both downsampled logo variants at distinct widget file URIs', async () => {
    const environment = new BackgroundActivityEnvironment();

    await expect(environment.prepareLogos()).resolves.toEqual({
      dark: 'file:///widgets/cherry-studio-logo-dark.png',
      light: 'file:///widgets/cherry-studio-logo-light.png',
    });
    expect(mockWrite).toHaveBeenNthCalledWith(1, CHERRY_ACTIVITY_LOGO_DARK_BASE64, {
      encoding: 'base64',
    });
    expect(mockWrite).toHaveBeenNthCalledWith(2, CHERRY_ACTIVITY_LOGO_LIGHT_BASE64, {
      encoding: 'base64',
    });
  });

  it('fans a destructively drained native action out to both decision and connection consumers', () => {
    const environment = new BackgroundActivityEnvironment();
    let receive!: (response: BackgroundActivityActionResponse) => void;
    const stop = jest.fn();
    const subscribeActions = jest.fn((listener: typeof receive) => {
      receive = listener;
      return stop;
    });
    environment.configure({
      assistantPresenter: environment.assistantPresenter,
      paintingPresenter: environment.paintingPresenter,
      getColorScheme: () => 'light',
      isReplyCompletionNotificationEnabled: () => false,
      translate: (key) => key,
      subscribeActions,
    });
    const decision = jest.fn();
    const connection = jest.fn();
    const stopDecision = environment.subscribeActions(decision);
    const stopConnection = environment.subscribeActions(connection);
    expect(subscribeActions).toHaveBeenCalledTimes(1);
    const response = { token: 'generation', actionId: 'disconnect' };
    receive(response);
    expect(decision).toHaveBeenCalledWith(response);
    expect(connection).toHaveBeenCalledWith(response);
    stopDecision();
    receive(response);
    expect(decision).toHaveBeenCalledTimes(1);
    expect(connection).toHaveBeenCalledTimes(2);
    expect(stop).not.toHaveBeenCalled();
    stopConnection();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('degrades to no logo when writing the file fails', async () => {
    mockWrite.mockImplementationOnce(() => {
      throw new Error('disk full');
    });
    const environment = new BackgroundActivityEnvironment();

    await expect(environment.prepareLogos()).resolves.toBeUndefined();
  });

  it('degrades to no logo when the native app-group directory is unavailable', async () => {
    mockWidgetsDirectory = null;
    const environment = new BackgroundActivityEnvironment();

    await expect(environment.prepareLogos()).resolves.toBeUndefined();
    expect(mockWrite).not.toHaveBeenCalled();
  });
});
