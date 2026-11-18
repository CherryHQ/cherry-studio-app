import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { UniqueModelId } from '@/shared/data/types/model';

import { useChatInputSessionModelSelection } from '../useChatInputSessionModelSelection';

type ModelSnapshot = { model?: UniqueModelId; updatedAt: string };
type Selection = ReturnType<typeof useChatInputSessionModelSelection>;
const original = { model: 'provider::original', updatedAt: '2026-11-18T00:00:00.000Z' } as const;
const saved = { model: 'provider::selected', updatedAt: '2026-11-18T00:00:00.001Z' } as const;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}

describe('session model selection', () => {
  let renderer: ReactTestRenderer;
  let selection: Selection;
  const observe = (value: Selection) => {
    selection = value;
  };
  const onError = jest.fn();

  afterEach(() => {
    act(() => renderer.unmount());
    onError.mockClear();
  });

  test('keeps the visible choice until the saved session is read', async () => {
    const write = deferred<ModelSnapshot>();
    const persist = jest.fn(() => write.promise);
    const render = (session: ModelSnapshot) => (
      <Harness
        observe={observe}
        persist={persist}
        session={session}
        sessionId="a"
        onError={onError}
      />
    );
    await act(async () => {
      renderer = create(render(original));
    });
    await act(async () => selection.selectModel(saved.model));
    expect(persist).toHaveBeenCalledWith('a', saved.model);
    expect(selection.selectedModelId).toBe(saved.model);
    expect(selection.pendingModelId).toBe(saved.model);

    await act(async () => write.resolve(saved));
    expect(selection.selectedModelId).toBe(saved.model);
    await act(async () => renderer.update(render(saved)));
    expect(selection.selectedModelId).toBe(saved.model);
    expect(selection.pendingModelId).toBeUndefined();
  });

  test('does not let the previous selection failure replace a newer selection', async () => {
    const first = deferred<ModelSnapshot>();
    const second = deferred<ModelSnapshot>();
    const persist = jest.fn(() => second.promise).mockReturnValueOnce(first.promise);
    await act(async () => {
      renderer = create(
        <Harness
          observe={observe}
          persist={persist}
          session={original}
          sessionId="a"
          onError={onError}
        />,
      );
    });
    await act(async () => selection.selectModel('provider::other'));
    await act(async () => selection.selectModel(saved.model));
    await act(async () => first.reject(new Error('First write failed')));
    expect(selection.selectedModelId).toBe(saved.model);
    await act(async () => second.reject(new Error('Second write failed')));
    expect(selection.selectedModelId).toBe(original.model);
  });

  test('a pending selection from one conversation never appears in another', async () => {
    const write = deferred<ModelSnapshot>();
    const persist = jest.fn(() => write.promise);
    const render = (sessionId: string) => (
      <Harness
        observe={observe}
        persist={persist}
        session={original}
        sessionId={sessionId}
        onError={onError}
      />
    );
    await act(async () => {
      renderer = create(render('a'));
    });
    await act(async () => selection.selectModel(saved.model));
    await act(async () => renderer.update(render('b')));
    expect(selection.selectedModelId).toBe(original.model);
    await act(async () => write.resolve(saved));
    expect(selection.selectedModelId).toBe(original.model);
  });
});

function Harness({
  observe,
  onError,
  persist,
  session,
  sessionId,
}: {
  observe: (selection: Selection) => void;
  onError: (error: unknown) => void;
  persist: (sessionId: string, model: UniqueModelId) => Promise<ModelSnapshot>;
  session: ModelSnapshot;
  sessionId: string;
}) {
  const selection = useChatInputSessionModelSelection(sessionId, session, persist, onError);
  useEffect(() => observe(selection), [observe, selection]);
  return null;
}
