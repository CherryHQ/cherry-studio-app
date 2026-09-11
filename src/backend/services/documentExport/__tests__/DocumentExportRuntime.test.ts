import { AppState } from 'react-native';

import { createDocumentExportSession } from '../createDocumentExportSession';
import { DocumentExportRuntime } from '../DocumentExportRuntime';

jest.mock('react-native', () => ({
  AppState: { currentState: 'active', addEventListener: jest.fn() },
}));
jest.mock('../createDocumentExportSession', () => ({ createDocumentExportSession: jest.fn() }));

test('backgrounding cancels active work and returning to the foreground permits an explicit retry', async () => {
  let change!: (state: string) => void;
  jest.mocked(AppState.addEventListener).mockImplementation((_event, listener) => {
    change = listener as typeof change;
    return { remove: jest.fn() };
  });
  let assertActive!: () => void;
  const cancel = jest.fn();
  const session = {
    markdown: 'Content',
    cancel,
    dispose: jest.fn(async () => {}),
    render: jest.fn(),
    save: jest.fn(),
  };
  jest.mocked(createDocumentExportSession).mockImplementation((_input, _dependencies, assert) => {
    assertActive = assert;
    return session;
  });
  const runtime = new DocumentExportRuntime();
  runtime.configure({ readManagedImage: jest.fn(), saveFile: jest.fn() });
  await runtime._doInit();
  runtime.createSession({ kind: 'markdown', source: 'Content' });
  change('background');
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(() => assertActive()).toThrow(expect.objectContaining({ code: 'inactive' }));
  expect(() => runtime.createSession({ kind: 'markdown', source: 'Other' })).toThrow(
    expect.objectContaining({ code: 'inactive' }),
  );
  change('active');
  expect(() => assertActive()).not.toThrow();
  await runtime._doStop();
  expect(() => runtime.createSession({ kind: 'markdown', source: 'Other' })).toThrow(
    expect.objectContaining({ code: 'disposed' }),
  );
});

test('shutdown retains a closing session until its cleanup settles', async () => {
  let finish!: () => void;
  const cleaning = new Promise<void>((resolve) => {
    finish = resolve;
  });
  jest
    .mocked(createDocumentExportSession)
    .mockImplementation((_input, _dependencies, _assert, onDisposed) => {
      let promise: Promise<void> | undefined;
      return {
        markdown: 'Content',
        render: jest.fn(),
        save: jest.fn(),
        cancel: jest.fn(),
        dispose: () => (promise ??= cleaning.then(onDisposed)),
      };
    });
  const runtime = new DocumentExportRuntime();
  runtime.configure({ readManagedImage: jest.fn(), saveFile: jest.fn() });
  await runtime._doInit();
  const session = runtime.createSession({ kind: 'markdown', source: 'Content' });
  const closing = session.dispose();
  let stopped = false;
  const stopping = runtime._doStop().then(() => {
    stopped = true;
  });
  await Promise.resolve();
  expect(stopped).toBe(false);
  finish();
  await closing;
  await stopping;
  expect(stopped).toBe(true);
});
