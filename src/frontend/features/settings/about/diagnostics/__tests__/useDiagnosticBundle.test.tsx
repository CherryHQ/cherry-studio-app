import { useLayoutEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { rememberFeedback } from '../feedbackHistory';
import { useDiagnosticBundle } from '../useDiagnosticBundle';

const mockUpload = jest.fn();
jest.mock('@/frontend/data', () => ({
  useBackendModule: () => ({ uploadBundle: mockUpload }),
}));
jest.mock('../feedbackHistory', () => ({ rememberFeedback: jest.fn() }));

const uploaded = { status: 'uploaded', reportId: '550e8400-e29b-41d4-a716-446655440000' };
let workflow: ReturnType<typeof useDiagnosticBundle>;
let renderer: ReactTestRenderer;
function Probe({ screenshotId }: { screenshotId?: string }) {
  const value = useDiagnosticBundle(screenshotId);
  useLayoutEffect(() => {
    workflow = value;
  }, [value]);
  return null;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(rememberFeedback).mockReset();
  mockUpload.mockResolvedValue(uploaded);
  act(() => {
    renderer = create(<Probe />);
  });
});
afterEach(() => {
  act(() => renderer.unmount());
});

test('persists only acknowledged uploads and keeps accepted results successful if local history fails', async () => {
  jest.mocked(rememberFeedback).mockImplementationOnce(() => {
    throw new Error('local cache unavailable');
  });
  await act(async () => {
    await workflow.submit('反馈');
  });
  expect(workflow.state).toEqual(uploaded);
  expect(rememberFeedback).toHaveBeenCalledWith(uploaded.reportId, '反馈');
  mockUpload.mockResolvedValueOnce({ status: 'submission_unknown' });
  await act(async () => {
    await workflow.submit('second attempt');
  });
  expect(workflow.state).toEqual({ status: 'submission_unknown' });
  expect(rememberFeedback).toHaveBeenCalledTimes(1);
});

test('an acknowledgement received after unmount still saves its receipt', async () => {
  let resolve: (value: typeof uploaded) => void = () => {};
  mockUpload.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  let submission: Promise<void>;
  act(() => {
    submission = workflow.submit('keep the ID');
  });
  act(() => renderer.unmount());
  await act(async () => {
    resolve(uploaded);
    await submission;
  });
  expect(rememberFeedback).toHaveBeenCalledWith(uploaded.reportId, 'keep the ID');
});

test('a preview is omitted until explicitly selected, and selection survives retry', async () => {
  act(() => renderer.update(<Probe screenshotId="capture-id" />));
  expect(workflow.isScreenshotIncluded).toBe(false);
  mockUpload.mockResolvedValue({ status: 'submission_failed', reason: 'service_unavailable' });
  await act(async () => {
    await workflow.submit('screen problem');
  });
  expect(mockUpload.mock.calls[0][0]).not.toHaveProperty('screenshotId');
  act(() => {
    workflow.edit();
    workflow.setScreenshotIncluded(true);
  });
  await act(async () => {
    await workflow.submit('screen problem');
  });
  expect(mockUpload.mock.calls[1][0].screenshotId).toBe('capture-id');
  act(() => workflow.edit());
  expect(workflow.isScreenshotIncluded).toBe(true);
  await act(async () => {
    await workflow.submit('retry');
  });
  expect(mockUpload.mock.calls[2][0].screenshotId).toBe('capture-id');
});

test('deselection and removal remain effective through retries', async () => {
  act(() => renderer.update(<Probe screenshotId="capture-id" />));
  act(() => workflow.setScreenshotIncluded(true));
  act(() => workflow.setScreenshotIncluded(false));
  mockUpload.mockResolvedValue({ status: 'submission_failed', reason: 'service_unavailable' });
  await act(async () => {
    await workflow.submit('deselected');
  });
  act(() => workflow.edit());
  await act(async () => {
    await workflow.submit('still deselected');
  });
  expect(mockUpload.mock.calls[0][0]).not.toHaveProperty('screenshotId');
  expect(mockUpload.mock.calls[1][0]).not.toHaveProperty('screenshotId');
  act(() => workflow.setScreenshotIncluded(true));
  act(() => renderer.update(<Probe />));
  await act(async () => {
    await workflow.submit('removed');
  });
  expect(mockUpload.mock.calls[2][0]).not.toHaveProperty('screenshotId');
});

test('replacement screenshots and new reports require a new selection', () => {
  act(() => renderer.update(<Probe screenshotId="first" />));
  act(() => workflow.setScreenshotIncluded(true));
  expect(workflow.isScreenshotIncluded).toBe(true);
  act(() => renderer.update(<Probe screenshotId="second" />));
  expect(workflow.isScreenshotIncluded).toBe(false);
  act(() => workflow.setScreenshotIncluded(true));
  act(() => renderer.unmount());
  act(() => {
    renderer = create(<Probe screenshotId="second" />);
  });
  expect(workflow.isScreenshotIncluded).toBe(false);
});
