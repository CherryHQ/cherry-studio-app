import { captureScreen, releaseCapture } from 'react-native-view-shot';

import { captureFeedbackScreenshot, removeFeedbackScreenshot } from '../feedbackScreenshot';

const mockCopy = jest.fn();
const mockDelete = jest.fn();
let mockSize = 512;
jest.mock('react-native-view-shot', () => ({
  captureScreen: jest.fn(),
  releaseCapture: jest.fn(),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'capture-id' }));
jest.mock('expo-file-system', () => {
  class Entry {
    uri: string;
    exists = true;
    constructor(...parts: (string | Entry)[]) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
    }
    get size() {
      return mockSize;
    }
    create() {}
    copy(destination: Entry) {
      return mockCopy(this.uri, destination.uri);
    }
    delete() {
      mockDelete(this.uri);
    }
  }
  return { File: Entry, Directory: Entry, Paths: { cache: 'file:///cache' } };
});

beforeEach(() => {
  jest.clearAllMocks();
  mockCopy.mockReset();
  mockSize = 512;
  jest.mocked(captureScreen).mockResolvedValue('file:///native.png');
});

test('adopts the native screenshot into the private draft directory and releases the original', async () => {
  const image = await captureFeedbackScreenshot();
  expect(image).toEqual({
    id: 'capture-id',
    uri: 'file:///cache/FeedbackScreenshots/capture-id.png',
  });
  expect(mockCopy).toHaveBeenCalledWith('file:///native.png', image.uri);
  expect(releaseCapture).toHaveBeenCalledWith('file:///native.png');
  expect(mockDelete).not.toHaveBeenCalled();
  removeFeedbackScreenshot(image);
  expect(mockDelete).toHaveBeenCalledWith(image.uri);
});

test('keeps the native screenshot until the asynchronous copy finishes', async () => {
  let finishCopy!: () => void;
  mockCopy.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finishCopy = resolve;
    }),
  );
  const capture = captureFeedbackScreenshot();
  await Promise.resolve();
  expect(mockCopy).toHaveBeenCalled();
  expect(releaseCapture).not.toHaveBeenCalled();
  finishCopy();
  await capture;
  expect(releaseCapture).toHaveBeenCalledWith('file:///native.png');
});

test.each([0, 8 * 1024 * 1024 + 1])(
  'rejects invalid capture size %i and releases temporary pixels',
  async (size) => {
    mockSize = size;
    await expect(captureFeedbackScreenshot()).rejects.toThrow();
    expect(mockCopy).not.toHaveBeenCalled();
    expect(releaseCapture).toHaveBeenCalledWith('file:///native.png');
  },
);

test('cleans a partial draft if copying fails', async () => {
  mockCopy.mockRejectedValueOnce(new Error('disk full'));
  await expect(captureFeedbackScreenshot()).rejects.toThrow('disk full');
  expect(mockDelete).toHaveBeenCalledWith('file:///cache/FeedbackScreenshots/capture-id.png');
  expect(releaseCapture).toHaveBeenCalledWith('file:///native.png');
});
